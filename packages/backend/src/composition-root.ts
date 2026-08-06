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
  MockGateway,
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
import { SubscriptionService, DEFAULT_SUBSCRIPTION_PRICES } from './subscription/index.js';
import { SalonInboxService } from './inbox/index.js';
import { WsInboxHub } from './inbox/ws-inbox-hub.js';

// Application-layer flows (cross-service wiring — Requirement 4.5).
import { BookingFlow } from './app/booking-flow.js';
import { CancellationFlow } from './app/cancellation-flow.js';

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
 * In development (no real credentials set), uses a MockGateway that always
 * succeeds and redirects to the payment callback immediately. This allows the
 * full booking + subscription flow to work without Zarinpal/IDPay connectivity.
 */
function selectGateway(config: AppConfig): PaymentGateway {
  // Use mock when no real credentials are configured (dev mode)
  if (!config.zarinpalMerchantId && !config.idpayApiKey) {
    console.log('[payment] No gateway credentials configured — using MockGateway (dev mode)');
    return new MockGateway({ callbackBaseUrl: config.paymentCallbackBaseUrl });
  }

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
 * The SMS provider used by the API process. When a REAL SMS provider is
 * configured (Kavenegar/SMS.ir) and `RABBITMQ_URL` is set, outbound SMS is
 * published to a durable queue ({@link QueueingSmsProvider}); a separate worker
 * performs the actual delivery with retry + dead-lettering. The real provider
 * ({@link selectSmsProvider}) is passed as a fallback so an SMS is still
 * delivered directly if the broker is momentarily unreachable.
 *
 * In dev/log mode (no SMS credentials), there is no real provider to deliver to,
 * so the broker hop adds nothing but indirection — and it means the code (e.g. a
 * login OTP) is only ever logged by the separate sms-worker process, not the API
 * the developer is watching. So we send DIRECTLY via the dev/log provider, which
 * prints `[dev-sms] -> <phone>: <message>` in THIS process's logs. The queue is
 * also skipped entirely when `RABBITMQ_URL` is unset (the prior behavior).
 *
 * Exported so the SMS worker can build the same real provider for delivery.
 */
export function selectApiSmsProvider(config: AppConfig): SmsProvider {
  const direct = selectSmsProvider(config);
  // Only route through the durable queue when there is a real provider to
  // deliver to. In dev/log mode, send directly so the OTP is visible in the API
  // logs (and the broker/worker indirection — plus its dev restart noise — is
  // bypassed). Configure KAVENEGAR_API_KEY or SMSIR_API_KEY to exercise the queue.
  const hasRealSmsProvider = Boolean(config.kavenegarApiKey || config.smsirApiKey);
  if (!config.rabbitmqUrl || !hasRealSmsProvider) return direct;
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
    subscriptionService,
    authorizer,
    bookingFlow,
    cancellationFlow,
    salonInboxService,
    wsInboxHub,
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
