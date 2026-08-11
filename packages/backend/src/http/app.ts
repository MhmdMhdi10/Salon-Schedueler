import express, { type Express, Router } from 'express';
import type { SchedulingEngine } from '../scheduling/scheduling-engine.js';
import type { CancellationService } from '../scheduling/cancellation.js';
import type { AuthService, Authorizer } from '../auth/index.js';
import type { PaymentService } from '../payment/payment.service.js';
import type { NotificationService } from '../notifications/notification.service.js';
import type { NotificationSettingsService } from '../notifications/notification-settings.service.js';
import type { BotChannel } from '../notifications/bot-channel.js';
import type { BotService } from '../bots/index.js';
import type { WaitlistService } from '../waitlist/waitlist.service.js';
import type { CustomerService } from '../customer/customer.service.js';
import type { SalonClientService } from '../customer/salon-client.service.js';
import type { AnalyticsService, CalendarService } from '../analytics/index.js';
import type { ServiceCatalog } from '../catalog/service-catalog.js';
import type {
  SalonRegistration,
  ResourceRegistration,
} from '../registration/index.js';
import type { AvailabilityConfig } from '../availability-config/index.js';
import type { QrService } from '../qr/index.js';
import type { SubscriptionService } from '../subscription/index.js';
import type { BookingFlow } from '../app/booking-flow.js';
import type { CancellationFlow } from '../app/cancellation-flow.js';
import type { SalonInboxService } from '../inbox/index.js';
import type { WsInboxHub } from '../inbox/ws-inbox-hub.js';
import type { AppointmentManagementService } from '../app/appointment-management.js';
import type { BookingAbuseGuard } from '../security/booking-abuse-guard.js';
import type { PlatformAdminService } from '../platform-admin/platform-admin.service.js';
import { createRateLimit, principalOrIpRateLimitKey } from './middleware/rate-limit.js';
import { makeAuth } from './middleware/auth.js';
import { makeRbac } from './middleware/rbac.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { salonRouter } from './routes/salon.routes.js';
import { registrationRouter } from './routes/registration.routes.js';
import { appointmentRouter } from './routes/appointment.routes.js';
import { customerRouter } from './routes/customer.routes.js';
import { waitlistRouter } from './routes/waitlist.routes.js';
import { cardOrderRouter } from './routes/card-order.routes.js';
import { transactionRouter } from './routes/transaction.routes.js';
import { paymentInitiateRouter, paymentCallbackRouter } from './routes/payment.routes.js';
import { botRouter } from './routes/bot.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { subscriptionRouter, subscriptionCallbackRouter } from './routes/subscription.routes.js';
import { qrRouter } from './routes/qr.routes.js';
import { deviceRouter } from './routes/device.routes.js';
import { inboxRouter } from './routes/inbox.routes.js';
import { platformAdminRouter } from './routes/platform-admin.routes.js';
import { errorHandler } from './middleware/error-handler.js';
import { referralPublicRouter, referralRouter } from './routes/referral.routes.js';
import type { ReferralService } from '../referral/referral.service.js';

/**
 * All domain services and the authorizer, constructed by the Composition_Root and
 * injected into the HTTP layer. Route handlers consume these instances; they never
 * construct services ad hoc (Requirement 3.2).
 */
export interface Services {
  schedulingEngine: SchedulingEngine;
  cancellationService: CancellationService;
  authService: AuthService;
  paymentService: PaymentService;
  notificationService: NotificationService;
  /** Role-aware SMS audience preferences. Optional for legacy route fakes. */
  notificationSettings?: NotificationSettingsService;
  /** Bot-based notification channel sitting behind notifications (Requirement 1.8). */
  botChannel: BotChannel;
  /** Inbound bot webhook dispatch / conversational entry point (Requirements 1.1, 1.6). */
  botService: BotService;
  waitlistService: WaitlistService;
  customerService: CustomerService;
  /** Salon-scoped client book used by the owner panel. */
  clientService?: SalonClientService;
  analyticsService: AnalyticsService;
  calendarService: CalendarService;
  serviceCatalog: ServiceCatalog;
  salonRegistration: SalonRegistration;
  resourceRegistration: ResourceRegistration;
  availabilityConfig: AvailabilityConfig;
  /** Stable per-salon QR generation + scan counting (Requirement 4.1, 4.4, 4.5). */
  qrService: QrService;
  /** Subscription lifecycle: status, configurable plans, purchase hand-off (R3.x). */
  subscriptionService: SubscriptionService;
  authorizer: Authorizer;
  /** Application-layer flow: booking + confirmation notification (Requirement 4.1). */
  bookingFlow: BookingFlow;
  /** Application-layer flow: cancellation/expiry + waitlist notification (Requirement 4.2, 4.3). */
  cancellationFlow: CancellationFlow;
  /** Salon inbox notification service: persists durable rows + WS fan-out. */
  salonInboxService: SalonInboxService;
  /** In-process WS hub; the WS route subscribes new sockets here for live delivery. */
  wsInboxHub: WsInboxHub;
  /** Optional because route-level test fakes predate the MVP abuse layer. */
  appointmentManagementService?: AppointmentManagementService;
  /** Optional abuse checks; production composition always supplies it. */
  bookingAbuseGuard?: BookingAbuseGuard;
  /** Global operations center; optional for legacy route-test service fakes. */
  platformAdminService?: PlatformAdminService;
  referralService?: ReferralService;
}

/** Options for building the Express app. */
export interface BuildAppOptions {
  services: Services;
  jwtAccessSecret: string;
  /** Shared secret guarding the public bot webhook routes (Requirement 8.1). */
  botWebhookSecret?: string;
  /** Trust exactly one reverse-proxy hop when explicitly enabled. */
  trustProxy?: boolean;
}

/**
 * Build the Express application: middleware, public/protected routers, and the
 * error handler. The app is framework glue only — domain logic lives in services.
 *
 * Auth is applied by default on the protected router so no protected route is
 * silently left unauthenticated (Requirement 2.8). Public routes (healthz, and
 * later availability/QR/auth/payment-callback) are mounted explicitly without it.
 */
export function buildApp(opts: BuildAppOptions): Express {
  const { services, jwtAccessSecret, botWebhookSecret } = opts;
  const app = express();

  if (opts.trustProxy) app.set('trust proxy', 1);

  // ── CORS (dev / explicit origins only) ──────────────────────────────────────
  // The browser-based clients (the Vite web app via its dev proxy, and the
  // Expo "react-native-web" dev server on a different port) make cross-origin
  // XHR/fetch calls to this API. Without CORS headers the browser blocks the
  // response ("Failed to fetch"). Native apps and same-origin requests are
  // unaffected. This is enabled only outside production, or when CORS_ALLOW_ORIGIN
  // is explicitly set, so production stays locked down by default.
  //   CORS_ALLOW_ORIGIN unset + dev  -> reflect the request Origin (allow all)
  //   CORS_ALLOW_ORIGIN="a,b"        -> allow only those origins
  const corsConfigured = typeof process.env.CORS_ALLOW_ORIGIN === 'string';
  const corsEnabled = corsConfigured || process.env.NODE_ENV !== 'production';
  if (corsEnabled) {
    const allowList = corsConfigured
      ? process.env
          .CORS_ALLOW_ORIGIN!.split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : null; // null => reflect any origin (dev convenience)
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && (allowList === null || allowList.includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        );
        res.setHeader(
          'Access-Control-Allow-Headers',
          req.headers['access-control-request-headers'] ??
            'Content-Type,Authorization',
        );
        res.setHeader('Access-Control-Max-Age', '600');
      }
      // Short-circuit CORS preflight so it never falls through to a 404.
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
    });
  }

  // Booking and onboarding payloads are small. A hard body limit prevents a
  // public endpoint from becoming an accidental memory-amplification target.
  app.use(express.json({ limit: '64kb' }));

  const { requireAuth, optionalAuth } = makeAuth(jwtAccessSecret);
  const { requireRole } = makeRbac(services.authorizer);

  // ── Public routes (no authentication) ──────────────────────────────────────
  // Liveness, auth (OTP/refresh), QR resolve, service list, availability, and the
  // payment gateway callback are all publicly reachable (Requirement 2.6, 2.7).
  // They are mounted under /api (the client base path) except /healthz.
  app.use(healthRouter());
  app.use('/api', authRouter(services));
  // Public salon self-registration (creates salon + Owner + trial). Mounted
  // before the protected router so an owner can sign their salon up without an
  // account; they then sign in via OTP with the phone they registered.
  app.use('/api', registrationRouter(services));
  app.use('/api', salonRouter(services, optionalAuth));
  app.use('/api', referralPublicRouter(services));
  app.use('/api', paymentCallbackRouter(services));
  app.use('/api', subscriptionCallbackRouter(services));
  // Bot webhooks: public (no requireAuth), guarded by a webhook-secret path
  // segment; always answer 200 on a valid secret to avoid retry storms
  // (Requirements 1.1, 1.6, 8.1).
  app.use('/api', botRouter(services, botWebhookSecret));

  // ── Protected routes (requireAuth applied by default for the whole router) ──
  // Auth is applied before any protected sub-router is mounted, so no protected
  // route is silently left unauthenticated (Requirement 2.8). Individual routes
  // add RBAC guards where the authorization matrix requires them (Requirement 2.4).
  const protectedRouter = Router();
  protectedRouter.use(requireAuth);
  protectedRouter.use(
    createRateLimit({
      name: 'authenticated-api',
      max: 180,
      windowMs: 60_000,
      keyGenerator: principalOrIpRateLimitKey,
    }),
  );
  protectedRouter.get('/me', (req, res) => {
    res.status(200).json({ principal: req.principal });
  });
  // RBAC-guarded stub: only principals permitted to configure the salon pass.
  protectedRouter.get('/admin/ping', requireRole('configure_salon'), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  protectedRouter.use(customerRouter(services));
  if (services.referralService) {
    protectedRouter.use(referralRouter(services, requireRole));
  }
  protectedRouter.use(waitlistRouter(services));
  protectedRouter.use(appointmentRouter(services, requireRole));
  protectedRouter.use(cardOrderRouter(requireRole));
  protectedRouter.use(transactionRouter(services, requireRole));
  protectedRouter.use(paymentInitiateRouter(services));
  protectedRouter.use(adminRouter(services, requireRole));
  protectedRouter.use(subscriptionRouter(services, requireRole));
  protectedRouter.use(qrRouter(services, requireRole));
  protectedRouter.use(deviceRouter(services));
  protectedRouter.use(inboxRouter(services, requireRole));
  if (services.platformAdminService) {
    protectedRouter.use(platformAdminRouter(services, services.platformAdminService));
  }
  app.use('/api', protectedRouter);

  app.use(errorHandler);

  return app;
}
