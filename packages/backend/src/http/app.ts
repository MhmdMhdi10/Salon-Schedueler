import express, { type Express, Router } from 'express';
import type { SchedulingEngine } from '../scheduling/scheduling-engine.js';
import type { CancellationService } from '../scheduling/cancellation.js';
import type { AuthService, Authorizer } from '../auth/index.js';
import type { PaymentService } from '../payment/payment.service.js';
import type { NotificationService } from '../notifications/notification.service.js';
import type { WaitlistService } from '../waitlist/waitlist.service.js';
import type { CustomerService } from '../customer/customer.service.js';
import type { AnalyticsService, CalendarService } from '../analytics/index.js';
import type { ServiceCatalog } from '../catalog/service-catalog.js';
import type {
  SalonRegistration,
  ResourceRegistration,
} from '../registration/index.js';
import type { AvailabilityConfig } from '../availability-config/index.js';
import type { BookingFlow } from '../app/booking-flow.js';
import type { CancellationFlow } from '../app/cancellation-flow.js';
import { makeAuth } from './middleware/auth.js';
import { makeRbac } from './middleware/rbac.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { salonRouter } from './routes/salon.routes.js';
import { appointmentRouter } from './routes/appointment.routes.js';
import { paymentInitiateRouter, paymentCallbackRouter } from './routes/payment.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { errorHandler } from './middleware/error-handler.js';

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
  waitlistService: WaitlistService;
  customerService: CustomerService;
  analyticsService: AnalyticsService;
  calendarService: CalendarService;
  serviceCatalog: ServiceCatalog;
  salonRegistration: SalonRegistration;
  resourceRegistration: ResourceRegistration;
  availabilityConfig: AvailabilityConfig;
  authorizer: Authorizer;
  /** Application-layer flow: booking + confirmation notification (Requirement 4.1). */
  bookingFlow: BookingFlow;
  /** Application-layer flow: cancellation/expiry + waitlist notification (Requirement 4.2, 4.3). */
  cancellationFlow: CancellationFlow;
}

/** Options for building the Express app. */
export interface BuildAppOptions {
  services: Services;
  jwtAccessSecret: string;
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
  const { services, jwtAccessSecret } = opts;
  const app = express();

  app.use(express.json());

  const { requireAuth, optionalAuth } = makeAuth(jwtAccessSecret);
  const { requireRole } = makeRbac(services.authorizer);

  // ── Public routes (no authentication) ──────────────────────────────────────
  // Liveness, auth (OTP/refresh), QR resolve, service list, availability, and the
  // payment gateway callback are all publicly reachable (Requirement 2.6, 2.7).
  // They are mounted under /api (the client base path) except /healthz.
  app.use(healthRouter());
  app.use('/api', authRouter(services));
  app.use('/api', salonRouter(services, optionalAuth));
  app.use('/api', paymentCallbackRouter(services));

  // ── Protected routes (requireAuth applied by default for the whole router) ──
  // Auth is applied before any protected sub-router is mounted, so no protected
  // route is silently left unauthenticated (Requirement 2.8). Individual routes
  // add RBAC guards where the authorization matrix requires them (Requirement 2.4).
  const protectedRouter = Router();
  protectedRouter.use(requireAuth);
  protectedRouter.get('/me', (req, res) => {
    res.status(200).json({ principal: req.principal });
  });
  // RBAC-guarded stub: only principals permitted to configure the salon pass.
  protectedRouter.get('/admin/ping', requireRole('configure_salon'), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  protectedRouter.use(appointmentRouter(services, requireRole));
  protectedRouter.use(paymentInitiateRouter(services));
  protectedRouter.use(adminRouter(services, requireRole));
  app.use('/api', protectedRouter);

  app.use(errorHandler);

  return app;
}
