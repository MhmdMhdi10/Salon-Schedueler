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
} from './notifications/index.js';
import { WaitlistService } from './waitlist/waitlist.service.js';
import { CustomerService } from './customer/index.js';
import { AnalyticsService, CalendarService } from './analytics/index.js';
import { ServiceCatalog } from './catalog/index.js';
import { SalonRegistration, ResourceRegistration } from './registration/index.js';
import { AvailabilityConfig } from './availability-config/index.js';

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
  });

  // Port-based services with Prisma-backed adapters.
  const notificationService = new NotificationService(
    smsProvider,
    pushProvider,
    new PrismaNotificationRepository(prisma),
  );
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

  const authorizer = new Authorizer();

  // Application-layer flows wire the framework-agnostic domain services together:
  // booking → confirmation, and cancellation/expiry → waitlist notification.
  const bookingFlow = new BookingFlow({ schedulingEngine, notificationService });
  const cancellationFlow = new CancellationFlow({
    cancellationService,
    schedulingEngine,
    waitlistService,
  });

  const services: Services = {
    schedulingEngine,
    cancellationService,
    authService,
    paymentService,
    notificationService,
    waitlistService,
    customerService,
    analyticsService,
    calendarService,
    serviceCatalog,
    salonRegistration,
    resourceRegistration,
    availabilityConfig,
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
  });
  return { ...container, app };
}
