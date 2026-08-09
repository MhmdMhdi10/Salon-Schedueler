import { Router } from 'express';
import type { Services } from '../app.js';
import { safelyNotify } from '../../app/safely-notify.js';
import { asyncRoute, validateRequired } from './route-helpers.js';
import { createRateLimit } from '../middleware/rate-limit.js';

/**
 * Protected payment-initiation route (Requirement 2.2 / original R10.2). Mounted
 * behind `requireAuth`.
 *
 * - POST /payments/initiate { appointmentId } -> 200 { redirectUrl }
 */
export function paymentInitiateRouter(services: Services): Router {
  const router = Router();

  router.post(
    '/payments/initiate',
    asyncRoute(async (req, res) => {
      if (!validateRequired(res, req.body, ['appointmentId'])) {
        return;
      }
      const principal = req.principal;
      const appointment = await services.calendarService.getAppointmentById(
        req.body.appointmentId,
      );
      if (!appointment) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      // A payment session is customer-owned. Do not let a logged-in staff
      // member, or another customer with a guessed appointment id, create a
      // gateway session for somebody else's booking.
      if (principal?.role || appointment.customerId !== principal?.id) {
        res.status(403).json({ code: 'FORBIDDEN' });
        return;
      }
      const { redirectUrl } = await services.paymentService.initiateDeposit(
        req.body.appointmentId,
      );
      res.status(200).json({ redirectUrl });
    }),
  );

  return router;
}

/**
 * Public payment-callback route (Requirement 2.2 / original R10.3, R12.1). The
 * gateway calls this, so it is unauthenticated.
 *
 * - POST /payments/callback (authority + status via body/query) -> 200 { confirmed }
 *
 * `handleCallback` confirms the held appointment internally via
 * `SchedulingEngine.confirmHeld`. To also dispatch the confirmation notification
 * the original spec promised (R12.1) without double-confirming, we send it here
 * after a successful confirm — best-effort, so a notification failure never
 * affects the confirmed booking (Requirement 4.4). The appointmentId is taken from
 * the callback parameters when the gateway/redirect supplies it; it is never
 * fabricated.
 */
export function paymentCallbackRouter(services: Services): Router {
  const router = Router();
  const callbackLimit = createRateLimit({
    name: 'payment-callback-ip',
    max: 30,
    windowMs: 60_000,
  });

  router.post(
    '/payments/callback',
    callbackLimit,
    asyncRoute(async (req, res) => {
      const params = { ...(req.query as Record<string, unknown>), ...(req.body ?? {}) };
      const authority = (params.authority ?? params.Authority) as string | undefined;
      const status = (params.status ?? params.Status) as string | undefined;

      if (authority === undefined || authority === '') {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'authority' });
        return;
      }

      const result = await services.paymentService.handleCallback({
        authority,
        status: status ?? '',
      });

      if (result.confirmed) {
        const appointmentId = (params.appointmentId ?? params.appointmentID) as
          | string
          | undefined;
        if (appointmentId) {
          await safelyNotify(() =>
            services.notificationService.sendConfirmation(appointmentId),
          );
          await safelyNotify(() =>
            services.notificationService.sendSalonBookingNotice(appointmentId, 'confirmed'),
          );
        }
      }

      res.status(200).json({ confirmed: result.confirmed });
    }),
  );

  return router;
}
