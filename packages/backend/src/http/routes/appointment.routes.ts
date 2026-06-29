import { Router, type Request, type RequestHandler } from 'express';
import type { Services } from '../app.js';
import type { Action, ResourceRef } from '../../auth/authorizer.js';
import { asyncRoute, validateRequired } from './route-helpers.js';

/**
 * Factory type for the RBAC guard, supplied by `buildApp` (bound to the
 * Authorizer). Kept as a parameter so the router stays construction-agnostic.
 */
export type RequireRole = (
  action: Action,
  resolveResource?: (req: Request) => ResourceRef,
) => RequestHandler;

/**
 * Protected appointment routes (Requirement 2.2, 2.5 / original R9, R11). Mounted
 * behind `requireAuth`, so `req.principal` is always present here.
 *
 * - POST /appointments                 -> booking result via BookingFlow.book (status 'pending')
 * - POST /appointments/:id/cancel       -> cancellation via CancellationFlow.cancel
 * - POST /appointments/:id/no-show      -> markNoShow (RBAC: manage_appointments)
 * - POST /appointments/:id/approve      -> approve pending booking -> 'confirmed' + notify (RBAC: manage_appointments)
 * - POST /appointments/:id/reject       -> reject pending booking -> 'cancelled' + notify (RBAC: manage_appointments)
 *
 * Booking customerId is taken from the authenticated principal; source defaults to
 * 'web'. A new booking is 'pending' (awaiting admin approval) — the customer is NOT
 * notified until an admin approves. Rejected bookings (no slot) map to 409
 * BOOKING_NO_AVAILABILITY / BOOKING_SLOT_UNAVAILABLE.
 */
export function appointmentRouter(services: Services, requireRole: RequireRole): Router {
  const router = Router();

  router.post(
    '/appointments',
    asyncRoute(async (req, res) => {
      if (!validateRequired(res, req.body, ['salonId', 'serviceId', 'startAt'])) {
        return;
      }
      const principal = req.principal!;
      const result = await services.bookingFlow.book({
        salonId: req.body.salonId,
        serviceId: req.body.serviceId,
        startAt: req.body.startAt,
        preferredStaffId: req.body.preferredStaffId,
        customerId: principal.id,
        source: 'web',
      });

      if (result.status === 'rejected') {
        const code =
          result.reason === 'no_availability'
            ? 'BOOKING_NO_AVAILABILITY'
            : 'BOOKING_SLOT_UNAVAILABLE';
        res.status(409).json({ code });
        return;
      }

      if (result.status === 'held') {
        res.status(200).json({
          status: 'held',
          appointment: result.appointment,
          paymentRedirectUrl: result.payment.redirectUrl,
        });
        return;
      }

      // A deposit-free booking is 'pending' (awaiting admin approval) unless the
      // salon/stylist approval policy auto-approves it, in which case it is
      // already 'confirmed' here and the customer has been notified.
      res.status(200).json({ status: result.status, appointment: result.appointment });
    }),
  );

  router.post(
    '/appointments/:id/cancel',
    asyncRoute(async (req, res) => {
      const appointment = await services.cancellationFlow.cancel(req.params.id);
      res.status(200).json({ status: 'cancelled', appointment });
    }),
  );

  router.post(
    '/appointments/:id/no-show',
    requireRole('manage_appointments'),
    asyncRoute(async (req, res) => {
      const appointment = await services.cancellationService.markNoShow(req.params.id);
      res.status(200).json({ status: 'no_show', appointment });
    }),
  );

  // Salon admin approves a pending booking -> 'confirmed' + customer confirmation
  // notification (sent by BookingFlow.approve). RBAC: manage_appointments.
  router.post(
    '/appointments/:id/approve',
    requireRole('manage_appointments'),
    asyncRoute(async (req, res) => {
      const appointment = await services.bookingFlow.approve(req.params.id);
      res.status(200).json({ status: 'confirmed', appointment });
    }),
  );

  // Salon admin rejects a pending booking -> 'cancelled' + customer rejection
  // notice (sent by BookingFlow.reject). RBAC: manage_appointments.
  router.post(
    '/appointments/:id/reject',
    requireRole('manage_appointments'),
    asyncRoute(async (req, res) => {
      const appointment = await services.bookingFlow.reject(req.params.id);
      res.status(200).json({ status: 'cancelled', appointment });
    }),
  );

  return router;
}
