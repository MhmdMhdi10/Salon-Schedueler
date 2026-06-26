import { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import { loadConfig, type AppConfig } from './config.js';
import { buildApp, type Services } from './http/app.js';

// Domain services (constructed only here — Requirement 3.1, 3.4).
import { SchedulingEngine } from './scheduling/scheduling-engine.js';
import { CancellationService } from './scheduling/cancellation.js';
import { AuthService, Authorizer } from './auth/index.js';
import {
  PaymentService,
  ZarinpalAdapter,
  IdPayAdapter,
  type PaymentGateway,
} from './payment/index.js';
import { NotificationService } from './notifications/index.js';
import {
  KavenegarSmsAdapter,
  SmsIrAdapter,
  PusheAdapter,
  NajvaAdapter,
  BotChannel,
} from './notifications/index.js';
import {
  TelegramAdapter,
  BaleAdapter,
  BotService,
  BotBookingStateMachine,
  DefaultBookingOutcomePresenter,
} from './bots/index.js';
import type { BotAdapter } from './bots/index.js';
import { WaitlistService } from './waitlist/waitlist.service.js';
import { CustomerService } from './customer/index.js';
import { AnalyticsService, CalendarService } from './analytics/index.js';
import { ServiceCatalog } from './catalog/index.js';
import { SalonRegistration, ResourceRegistration } from './registration/index.js';
import { AvailabilityConfig } from './availability-config/index.js';
import { QrService } from './qr/index.js';

// Application-layer flows (cross-service wiring — Requirement 4.5).
import { BookingFlow } from './app/booking-flow.js';
import { CancellationFlow } from './app/cancellation-flow.js';

// Provider ports + adapters.
import type { SmsProvider } from './auth/sms-provider.interface.js';
import type { PushProvider } from './notifications/push-provider.interface.js';
import { DevLogSmsProvider, DevLogPushProvider } from './http/dev-providers.js';
import {
  PrismaNotificationRepository,
  PrismaWaitlistRepository,
  PrismaWaitlistNotifier,
  PrismaCustomerRepository,
  PrismaBotChannelRepository,
} from './http/prisma-adapters.js';

/**
 * The constructed dependency container: the Prisma client, every domain service,
 * and the resolved configuration. This is the single place that does `new` on
 * services and adapters (Requirement 3.1, 3.2).
 */
export interface Container {
  prisma: PrismaClient;
  services: Services;
  config: AppConfig;
}

/** The fully-assembled application returned to `main.ts` and to tests. */
export interface CreatedApp extends Container {
  app: Express;
}

/**
 * Select the payment gateway adapter from configuration (default: Zarinpal).
 */
function selectGateway(config: AppConfig): PaymentGateway {
  if (config.paymentGateway === 'idpay') {
    return new IdPayAdapter({ apiKey: config.idpayApiKey });
  }
  return new ZarinpalAdapter({ merchantId: config.zarinpalMerchantId });
}

/**
 * Select the SMS provider from configuration. When Kavenegar credentials are
 * present the real Kavenegar adapter is used (preferred); otherwise SMS.ir when
 * its key is present. When no credentials are configured the dev/log provider
 * is selected so the system still runs locally without provider accounts
 * (Requirement 5.5).
 */
function selectSmsProvider(config: AppConfig): SmsProvider {
  if (config.kavenegarApiKey) {
    return new KavenegarSmsAdapter({
      apiKey: config.kavenegarApiKey,
      baseUrl: config.kavenegarBaseUrl,
      sender: config.kavenegarSender,
    });
  }
  if (config.smsirApiKey) {
    return new SmsIrAdapter({
      apiKey: config.smsirApiKey,
      baseUrl: config.smsirBaseUrl,
      lineNumber: config.smsirLineNumber,
    });
  }
  return new DevLogSmsProvider();
}

/**
 * Select the push provider from configuration. When Pushe credentials are
 * present the real Pushe adapter is used (preferred); otherwise Najva when its
 * key is present. When no credentials are configured the dev/log provider is
 * selected so the system still runs locally (Requirement 5.5).
 */
function selectPushProvider(config: AppConfig): PushProvider {
  if (config.pusheApiKey) {
    return new PusheAdapter({
      apiKey: config.pusheApiKey,
      baseUrl: config.pusheBaseUrl,
      appId: config.pusheAppId,
    });
  }
  if (config.najvaApiKey) {
    return new NajvaAdapter({
      apiKey: config.najvaApiKey,
      baseUrl: config.najvaBaseUrl,
    });
  }
  return new DevLogPushProvider();
}

/**
 * Construct the messaging-bot adapters from configuration, mirroring
 * `selectSmsProvider`: when a platform's bot token is present the real adapter
 * is constructed (and reports `enabled = true`); when the token is absent the
 * adapter is still constructed but disabled (no-op) so the bot channel keeps
 * working and falls back to SMS without any error (Requirements 1.8, 8.1).
 *
 * Tokens are read only from configuration (environment) and never hard-coded
 * (Requirement 8.1).
 */
function selectBotAdapters(config: AppConfig): BotAdapter[] {
  return [
    new TelegramAdapter({ token: config.telegramBotToken }),
    new BaleAdapter({ token: config.baleBotToken }),
  ];
}

/**
 * Construct the Prisma client and every domain service with their dependencies.
 *
 * The Prisma datasource URL is supplied programmatically so the client can be
 * constructed without a `DATABASE_URL` environment variable present (it connects
 * lazily on first query, so this never requires a reachable database at startup
 * or in tests that don't hit the DB).
 */
export function buildContainer(overrides: Partial<AppConfig> = {}): Container {
  const config: AppConfig = { ...loadConfig(), ...overrides };

  const prisma = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
  });

  // External providers / gateways.
  const smsProvider = selectSmsProvider(config);
  const pushProvider = selectPushProvider(config);
  const botAdapters = selectBotAdapters(config);
  const gateway = selectGateway(config);

  // Scheduling + payment + cancellation (ordered by dependency).
  const schedulingEngine = new SchedulingEngine(prisma);
  const paymentService = new PaymentService(prisma, gateway, schedulingEngine, {
    callbackBaseUrl: config.paymentCallbackBaseUrl,
  });
  const cancellationService = new CancellationService(prisma, paymentService);

  // Auth.
  const authService = new AuthService(prisma, smsProvider, {
    jwtAccessSecret: config.jwtAccessSecret,
    jwtRefreshSecret: config.jwtRefreshSecret,
    otpWindowSeconds: config.otpWindowSeconds,
  });

  // Port-based services with Prisma-backed adapters.
  const notificationService = new NotificationService(
    smsProvider,
    pushProvider,
    new PrismaNotificationRepository(prisma),
  );
  // Bot-based notification channel: routes OTP/reminders/owner notices through a
  // messaging bot when a `BotChat` exists, falling back to SMS otherwise
  // (Requirements 1.8, 8.1). Disabled adapters (no token) are treated as absent.
  const botChannel = new BotChannel(
    botAdapters,
    smsProvider,
    new PrismaBotChannelRepository(prisma),
  );
  // Bot_Service: inbound webhook dispatch entry point. Task 7.1 wires routing +
  // dispatch; the conversational booking state machine (task 7.2) plugs in as
  // the update handler behind this same seam (Requirements 1.1, 1.6). The
  // handler is constructed below once `bookingFlow` exists, then injected.
  const waitlistService = new WaitlistService(
    new PrismaWaitlistRepository(prisma),
    new PrismaWaitlistNotifier(smsProvider),
  );
  const customerService = new CustomerService(new PrismaCustomerRepository(prisma));

  // Analytics, catalog, registration, availability config.
  const analyticsService = new AnalyticsService(prisma);
  const calendarService = new CalendarService(prisma);
  const serviceCatalog = new ServiceCatalog(prisma);
  const salonRegistration = new SalonRegistration(prisma);
  const resourceRegistration = new ResourceRegistration(prisma);
  const availabilityConfig = new AvailabilityConfig(prisma);

  // QR_Service: stable per-salon QR generation + campaign-arrival scan counting
  // (Requirements 4.1, 4.4, 4.5). Inject Prisma; pass the configured public base
  // URL when present, else the service falls back to its documented default.
  const qrService = new QrService(prisma, { publicBaseUrl: config.publicBaseUrl });

  const authorizer = new Authorizer();

  // Application-layer flows wire the framework-agnostic domain services together:
  // booking → confirmation, and cancellation/expiry → waitlist notification.
  const bookingFlow = new BookingFlow({ schedulingEngine, notificationService });
  const cancellationFlow = new CancellationFlow({
    cancellationService,
    schedulingEngine,
    waitlistService,
  });

  // Conversational in-chat booking (task 7.2): a BotSession-backed state machine
  // (service → date → slot → confirm, with an in-chat OTP sub-flow when the chat
  // is not yet linked to a customer). It REUSES the scheduling engine for
  // availability and BookingFlow for the actual booking with `source: 'bot'`,
  // so the bot never re-implements scheduling rules (Requirements 1.6, 6.6).
  const botBookingHandler = new BotBookingStateMachine({
    adapters: botAdapters,
    scheduling: schedulingEngine,
    booking: bookingFlow,
    auth: authService,
    prisma,
    // Task 7.3: present the booking result back in chat — held → gateway link,
    // confirmed → details, rejected → failure. Never fabricates success.
    outcome: new DefaultBookingOutcomePresenter(),
  });
  const botService = new BotService(botAdapters, botBookingHandler);

  const services: Services = {
    schedulingEngine,
    cancellationService,
    authService,
    paymentService,
    notificationService,
    botChannel,
    botService,
    waitlistService,
    customerService,
    analyticsService,
    calendarService,
    serviceCatalog,
    salonRegistration,
    resourceRegistration,
    availabilityConfig,
    qrService,
    authorizer,
    bookingFlow,
    cancellationFlow,
  };

  return { prisma, services, config };
}

/**
 * Build the runnable application: the container plus the Express app with all
 * middleware and routers mounted. `main.ts` calls this and listens; tests call it
 * and drive the returned `app` with supertest (no network or database required
 * for routes that don't touch the DB).
 *
 * Requirements: 3.1, 3.2, 3.3, 3.5
 */
export function createApp(overrides: Partial<AppConfig> = {}): CreatedApp {
  const container = buildContainer(overrides);
  const app = buildApp({
    services: container.services,
    jwtAccessSecret: container.config.jwtAccessSecret,
    botWebhookSecret: container.config.botWebhookSecret,
  });
  return { ...container, app };
}
