import { Router, type Response } from 'express';
import type { Services } from '../../http/app.js';
import { safelyNotify } from '../../app/safely-notify.js';
import { asyncRoute, validateRequired } from '../../common/http/route-helpers.js';
import { createRateLimit } from '../../http/middleware/rate-limit.js';

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
      const appointment = await services.calendarService.getAppointmentById(req.body.appointmentId);
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
      const { redirectUrl } = await services.paymentService.initiateDeposit(req.body.appointmentId);
      res.status(200).json({ redirectUrl });
    }),
  );

  return router;
}

/**
 * Public payment-callback route (Requirement 2.2 / original R10.3, R12.1). The
 * gateway calls this, so it is unauthenticated.
 *
 * - GET /payments/callback (Zibal: trackId + success via query) -> browser redirect
 * - POST /payments/callback (authority + status via body/query) -> browser redirect
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

  const redirectToPaymentResult = (res: Response, result: 'success' | 'failed') => {
    res.redirect(`/booking/success?payment=${result}`);
  };

  const handleGatewayCallback = asyncRoute(async (req, res) => {
    const params = { ...(req.query as Record<string, unknown>), ...(req.body ?? {}) };
    const firstParam = (...names: string[]): string | undefined => {
      for (const name of names) {
        const value = params[name];
        if (typeof value === 'string' && value !== '') return value;
        if (typeof value === 'number') return String(value);
      }
      return undefined;
    };

    const authority = firstParam('authority', 'Authority', 'trackId', 'TrackId');
    const success = firstParam('success', 'Success');
    const status = firstParam('status', 'Status');
    const isSuccessful =
      success !== undefined
        ? success === '1' || success.toLowerCase() === 'true'
        : ['OK', '100', '101', '201'].includes((status ?? '').toUpperCase());

    if (authority === undefined) {
      redirectToPaymentResult(res, 'failed');
      return;
    }

    try {
      const result = await services.paymentService.handleCallback({
        authority,
        status: isSuccessful ? '100' : '0',
      });

      if (result.confirmed) {
        const appointmentId = firstParam('appointmentId', 'appointmentID', 'orderId', 'OrderId');
        if (appointmentId) {
          await safelyNotify(() => services.notificationService.sendConfirmation(appointmentId));
          await safelyNotify(() =>
            services.notificationService.sendSalonBookingNotice(appointmentId, 'confirmed'),
          );
        }
      }

      redirectToPaymentResult(res, result.confirmed ? 'success' : 'failed');
    } catch {
      // Never expose gateway/database errors in the browser callback response.
      redirectToPaymentResult(res, 'failed');
    }
  });

  router.get('/payments/callback', callbackLimit, handleGatewayCallback);
  router.post('/payments/callback', callbackLimit, handleGatewayCallback);

  return router;
}

export class PaymentController {
  public constructor(private readonly services: Services) {}

  public initiateRouter(): Router {
    return paymentInitiateRouter(this.services);
  }

  public callbackRouter(): Router {
    return paymentCallbackRouter(this.services);
  }
}
