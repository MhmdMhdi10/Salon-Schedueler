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
 * - PATCH /appointments/:id/reschedule  -> move an existing booking in place (RBAC: manage_own_appointments)
 *
 * Booking customerId is taken from the authenticated principal; source defaults to
 * 'web'. A new booking is 'pending' (awaiting admin approval) — the customer is NOT
 * notified until an admin approves. Rejected bookings (no slot) map to 409
 * BOOKING_NO_AVAILABILITY / BOOKING_SLOT_UNAVAILABLE.
 */
export function appointmentRouter(services: Services, requireRole: RequireRole): Router {
  const router = Router();

  // Authorize approve/reject by the appointment's OWNER: Owner/Admin may act on
  // any booking in the salon; a Stylist may act only on a booking assigned to
  // them. The appointment's staffMemberId is not in the request, so this guard
  // reads the appointment first — hence an async guard rather than the
  // synchronous `requireRole`. A denial never reaches the handler (Requirement 2.4).
  const requireCanManageAppointment: RequestHandler = (req, res, next) => {
    const principal = req.principal;
    if (!principal) {
      res.status(401).json({ code: 'UNAUTHORIZED' });
      return;
    }
    if (!principal.role) {
      // A customer (no staff role) cannot approve/reject.
      res.status(403).json({ code: 'FORBIDDEN' });
      return;
    }
    services.calendarService
      .getAppointmentById(req.params.id)
      .then((appt) => {
        if (!appt) {
          res.status(404).json({ code: 'NOT_FOUND' });
          return;
        }
        const allowed = services.authorizer.can(
          {
            id: principal.id,
            role: principal.role!,
            staffMemberId: principal.staffMemberId,
          },
          'manage_own_appointments',
          { salonId: appt.salonId, staffMemberId: appt.staffMemberId },
        );
        if (!allowed) {
          res.status(403).json({ code: 'FORBIDDEN' });
          return;
        }
        next();
      })
      .catch(next);
  };

  // Authorize cancellation. Unlike approve/reject (staff-only), a booking can be
  // cancelled by EITHER the owning customer (self-service cancel from the
  // booking app) OR managing staff (Owner/Admin any salon booking; a Stylist
  // only their own). This reads the appointment first so the open-by-id route
  // can't be used to cancel someone else's booking (the route previously had no
  // guard at all). A denial never reaches the handler.
  const requireCanCancelAppointment: RequestHandler = (req, res, next) => {
    const principal = req.principal;
    if (!principal) {
      res.status(401).json({ code: 'UNAUTHORIZED' });
      return;
    }
    services.calendarService
      .getAppointmentById(req.params.id)
      .then((appt) => {
        if (!appt) {
          res.status(404).json({ code: 'NOT_FOUND' });
          return;
        }
        // The booking's own customer may always cancel it.
        if (appt.customerId === principal.id) {
          next();
          return;
        }
        // Otherwise the caller must be staff who can manage this appointment.
        if (!principal.role) {
          res.status(403).json({ code: 'FORBIDDEN' });
          return;
        }
        const allowed = services.authorizer.can(
          {
            id: principal.id,
            role: principal.role,
            staffMemberId: principal.staffMemberId,
          },
          'manage_own_appointments',
          { salonId: appt.salonId, staffMemberId: appt.staffMemberId },
        );
        if (!allowed) {
          res.status(403).json({ code: 'FORBIDDEN' });
          return;
        }
        next();
      })
      .catch(next);
  };

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
    requireCanCancelAppointment,
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

  // Approve a pending booking -> 'confirmed' + customer confirmation notification
  // (sent by BookingFlow.approve). Owner/Admin may approve any salon booking; a
  // Stylist may approve a booking assigned to them (ownership enforced by
  // requireCanManageAppointment).
  router.post(
    '/appointments/:id/approve',
    requireCanManageAppointment,
    asyncRoute(async (req, res) => {
      const appointment = await services.bookingFlow.approve(req.params.id);
      res.status(200).json({ status: 'confirmed', appointment });
    }),
  );

  // Reject a pending booking -> 'cancelled' + customer rejection notice (sent by
  // BookingFlow.reject). Same ownership rule as approve.
  router.post(
    '/appointments/:id/reject',
    requireCanManageAppointment,
    asyncRoute(async (req, res) => {
      const appointment = await services.bookingFlow.reject(req.params.id);
      res.status(200).json({ status: 'cancelled', appointment });
    }),
  );

  // Move an existing booking without changing its id, customer, payment, or
  // approval status. The scheduling engine performs the resource/availability
  // checks and the database exclusion constraint closes the final race.
  router.patch(
    '/appointments/:id/reschedule',
    requireCanManageAppointment,
    asyncRoute(async (req, res) => {
      if (!validateRequired(res, req.body, ['startAt'])) {
        return;
      }
      if (typeof req.body.startAt !== 'string' || Number.isNaN(new Date(req.body.startAt).getTime())) {
        res.status(400).json({ code: 'RESCHEDULE_INVALID_START', field: 'startAt' });
        return;
      }

      const appointment = await services.schedulingEngine.reschedule({
        appointmentId: req.params.id,
        startAt: req.body.startAt,
      });
      res.status(200).json({ status: appointment.status, appointment });
    }),
  );

  return router;
}
