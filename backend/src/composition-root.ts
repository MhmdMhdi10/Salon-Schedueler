import { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import { loadConfig, type AppConfig } from './config.js';
import { buildApp, type Services } from './http/app.js';
import { isE2EQuietLogs } from './common/logging.js';

// Domain services (constructed only here — Requirement 3.1, 3.4).
import { SchedulingEngine } from './scheduling/scheduling-engine.js';
import { CancellationService } from './scheduling/cancellation.js';
import { AuthService, Authorizer } from './auth/index.js';
import {
  PaymentService,
  ZarinpalAdapter,
  IdPayAdapter,
  ZibalAdapter,
  MockGateway,
  type PaymentGateway,
} from './payment/services/index.js';
import { NotificationService } from './notifications/index.js';
import { NotificationSettingsService } from './notifications/notification-settings.service.js';
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
import { WaitlistService } from './waitlist/services/index.js';
import { CustomerService } from './customer/services/index.js';
import { AnalyticsService, CalendarService } from './analytics/index.js';
import { ServiceCatalog } from './catalog/index.js';
import { SalonRegistration, ResourceRegistration } from './registration/services/index.js';
import { AvailabilityConfig } from './availability-config/index.js';
import { QrService } from './qr/services/index.js';
import { SubscriptionService, DEFAULT_SUBSCRIPTION_PRICES } from './subscription/services/index.js';
import { SalonInboxService, WsInboxHub } from './inbox/services/index.js';

// Application-layer flows (cross-service wiring — Requirement 4.5).
import { BookingFlow } from './app/booking-flow.js';
import { CancellationFlow } from './app/cancellation-flow.js';
import { AppointmentManagementService } from './app/appointment-management.js';
import { BookingAbuseGuard } from './security/booking-abuse-guard.js';
import { PlatformAdminService } from './platform-admin/services/index.js';
import { SalonClientService } from './customer/services/index.js';
import { ReferralService } from './referral/services/index.js';

// Provider ports + adapters.
import type { SmsProvider } from './auth/sms-provider.interface.js';
import type { PushProvider } from './notifications/push-provider.interface.js';
import { DevLogSmsProvider, DevLogPushProvider } from './http/dev-providers.js';
import { RabbitMqSmsPublisher } from './messaging/sms-queue.js';
import { QueueingSmsProvider } from './messaging/queueing-sms-provider.js';
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
 * Select the payment gateway adapter from configuration.
 *
 * In development (no credential for the selected gateway), uses a MockGateway
 * that always succeeds and redirects to the payment callback immediately. In
 * production, missing credentials fail closed so fake payments cannot be used.
 */
function selectGateway(config: AppConfig): PaymentGateway {
  const hasSelectedGatewayCredential =
    config.paymentGateway === 'zibal'
      ? Boolean(config.zibalMerchant)
      : config.paymentGateway === 'idpay'
        ? Boolean(config.idpayApiKey)
        : Boolean(config.zarinpalMerchantId);

  if (!hasSelectedGatewayCredential) {
    if (config.nodeEnv === 'production') {
      throw new Error(`Missing credential for selected payment gateway: ${config.paymentGateway}`);
    }
    if (!isE2EQuietLogs()) {
      console.log('[payment] No gateway credentials configured — using MockGateway (dev mode)');
    }
    return new MockGateway({ callbackBaseUrl: config.paymentCallbackBaseUrl });
  }

  if (config.paymentGateway === 'idpay') {
    return new IdPayAdapter({ apiKey: config.idpayApiKey });
  }
  if (config.paymentGateway === 'zibal') {
    return new ZibalAdapter({ merchant: config.zibalMerchant });
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
 * The SMS provider used by the API process. When a REAL SMS provider is
 * configured (Kavenegar/SMS.ir) and `RABBITMQ_URL` is set, outbound SMS is
 * published to a durable queue ({@link QueueingSmsProvider}); a separate worker
 * performs the actual delivery with retry + dead-lettering. The real provider
 * ({@link selectSmsProvider}) is passed as a fallback so an SMS is still
 * delivered directly if the broker is momentarily unreachable.
 *
 * When RabbitMQ is configured, all outbound SMS (including OTP, confirmations,
 * reminders and waitlist notices) goes through the durable queue. The direct
 * provider remains a safe fallback while the broker reconnects. When the broker
 * is absent, the dev/log or real provider is used synchronously.
 *
 * Exported so the SMS worker can build the same real provider for delivery.
 */
export function selectApiSmsProvider(config: AppConfig): SmsProvider {
  const direct = selectSmsProvider(config);
  if (!config.rabbitmqUrl) return direct;
  const publisher = new RabbitMqSmsPublisher(config.rabbitmqUrl, {
    maxAttempts: config.smsQueueMaxAttempts,
    retryDelayMs: config.smsQueueRetryDelayMs,
  });
  return new QueueingSmsProvider(publisher, direct);
}

/** Build the real/dev SMS provider used by the worker to actually deliver. */
export function selectDeliverySmsProvider(config: AppConfig): SmsProvider {
  return selectSmsProvider(config);
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
  const smsProvider = selectApiSmsProvider(config);
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
    devOtpAutoFill: config.devOtpAutoFill,
  });

  // Port-based services with Prisma-backed adapters.
  const notificationService = new NotificationService(
    smsProvider,
    pushProvider,
    new PrismaNotificationRepository(prisma),
    { defaultReminderLeadTimeMinutes: config.reminderLeadTimeMinutes },
  );
  const notificationSettings = new NotificationSettingsService(prisma);
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
  const clientService = new SalonClientService(prisma);

  // Analytics, catalog, registration, availability config.
  const analyticsService = new AnalyticsService(prisma);
  const calendarService = new CalendarService(prisma);
  const serviceCatalog = new ServiceCatalog(prisma);
  const salonRegistration = new SalonRegistration(prisma, {
    publicBaseUrl: config.publicBaseUrl,
  });
  const resourceRegistration = new ResourceRegistration(prisma);
  const availabilityConfig = new AvailabilityConfig(prisma);

  // QR_Service: stable per-salon QR generation + campaign-arrival scan counting
  // (Requirements 4.1, 4.4, 4.5). Inject Prisma; pass the configured public base
  // URL when present, else the service falls back to its documented default.
  const qrService = new QrService(prisma, { publicBaseUrl: config.publicBaseUrl });

  // Subscription_Service: subscription lifecycle + configurable IRR plan prices
  // (Requirements 3.1–3.12). Prices come from config (env), falling back to the
  // documented defaults; it reuses the shared PaymentService for purchase/renew.
  const subscriptionService = new SubscriptionService(prisma, paymentService, {
    trialDays: config.subTrialDays,
    prices: {
      monthlyRial: config.subMonthlyRial
        ? BigInt(config.subMonthlyRial)
        : DEFAULT_SUBSCRIPTION_PRICES.monthlyRial,
      quarterlyRial: config.subQuarterlyRial
        ? BigInt(config.subQuarterlyRial)
        : DEFAULT_SUBSCRIPTION_PRICES.quarterlyRial,
      annualRial: config.subAnnualRial
        ? BigInt(config.subAnnualRial)
        : DEFAULT_SUBSCRIPTION_PRICES.annualRial,
    },
  });

  // Salon Inbox_Notification_Service: durable row store + realtime WS fan-out.
  // `WsInboxHub` is the in-process realization of the hub; the same interface
  // can be backed by Redis pub/sub for a real farm.
  const wsInboxHub = new WsInboxHub();
  const salonInboxService = new SalonInboxService(prisma, wsInboxHub);

  const authorizer = new Authorizer();

  // Application-layer flows wire the framework-agnostic domain services together:
  // booking → confirmation, and cancellation/expiry → waitlist notification.
  const bookingFlow = new BookingFlow({
    schedulingEngine,
    notificationService,
    inboxService: salonInboxService,
  });
  const cancellationFlow = new CancellationFlow({
    cancellationService,
    schedulingEngine,
    waitlistService,
    notificationService,
  });

  const appointmentManagementService = new AppointmentManagementService(
    prisma,
    bookingFlow,
    cancellationService,
  );
  const bookingAbuseGuard = new BookingAbuseGuard(prisma);
  const platformAdminService = new PlatformAdminService(prisma);
  const referralService = new ReferralService(prisma, { publicBaseUrl: config.publicBaseUrl });

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
    notificationSettings,
    botChannel,
    botService,
    waitlistService,
    customerService,
    clientService,
    analyticsService,
    calendarService,
    serviceCatalog,
    salonRegistration,
    resourceRegistration,
    availabilityConfig,
    qrService,
    subscriptionService,
    authorizer,
    bookingFlow,
    cancellationFlow,
    salonInboxService,
    wsInboxHub,
    appointmentManagementService,
    bookingAbuseGuard,
    platformAdminService,
    referralService,
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
    trustProxy: container.config.trustProxy,
  });
  return { ...container, app };
}
