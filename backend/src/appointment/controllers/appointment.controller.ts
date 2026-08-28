import { Router, type Request, type RequestHandler } from 'express';
import type { Services } from '../../http/app.js';
import type { RequireRole } from '../../common/http/require-role.js';
import type { StaffRole } from '@salon/shared';
import { asyncRoute, validateRequired } from '../../common/http/route-helpers.js';
import { safelyNotify } from '../../app/safely-notify.js';
import { createRateLimit, principalOrIpRateLimitKey } from '../../http/middleware/rate-limit.js';

/**
 * Factory type for the RBAC guard, supplied by `buildApp` (bound to the
 * Authorizer). Kept as a parameter so the router stays construction-agnostic.
 */
export type { RequireRole } from '../../common/http/require-role.js';

/**
 * Protected appointment routes (Requirement 2.2, 2.5 / original R9, R11). Mounted
 * behind `requireAuth`, so `req.principal` is always present here.
 *
 * - POST /appointments                 -> booking result via BookingFlow.book (status 'pending')
 * - POST /appointments/:id/cancel       -> cancellation via CancellationFlow.cancel
 * - POST /appointments/:id/no-show      -> markNoShow (RBAC: manage_appointments)
 * - POST /appointments/:id/approve      -> approve pending booking -> 'confirmed' + notify (owner/admin or permitted stylist)
 * - POST /appointments/:id/reject       -> reject pending booking -> 'cancelled' + notify (owner/admin or permitted stylist)
 * - PATCH /appointments/:id/reschedule  -> move an existing booking in place (RBAC: manage_own_appointments)
 *
 * Booking customerId is taken from the authenticated principal; source defaults to
 * 'web'. A new booking is 'pending' (awaiting admin approval) — the customer is NOT
 * notified until an admin approves. Rejected bookings (no slot) map to 409
 * BOOKING_NO_AVAILABILITY / BOOKING_SLOT_UNAVAILABLE.
 */
export function appointmentRouter(services: Services, requireRole: RequireRole): Router {
  const router = Router();

  const devLimit = (name: string, fallback: number): number => {
    const configured = Number(process.env[name]);
    return process.env.NODE_ENV === 'development' && Number.isInteger(configured) && configured > 0
      ? configured
      : fallback;
  };

  const bookingIpLimit = createRateLimit({
    name: 'booking-ip',
    max: devLimit('E2E_BOOKING_IP_LIMIT', 30),
    windowMs: 10 * 60_000,
  });
  const bookingCustomerLimit = createRateLimit({
    name: 'booking-customer',
    max: devLimit('E2E_BOOKING_CUSTOMER_LIMIT', 12),
    windowMs: 10 * 60_000,
    keyGenerator: principalOrIpRateLimitKey,
  });
  const appointmentMutationLimit = createRateLimit({
    name: 'appointment-mutation',
    max: devLimit('E2E_APPOINTMENT_MUTATION_LIMIT', 60),
    windowMs: 60_000,
    keyGenerator: principalOrIpRateLimitKey,
  });
  const depositReceiptLimit = createRateLimit({
    name: 'deposit-receipt-upload',
    max: 6,
    windowMs: 15 * 60_000,
    keyGenerator: principalOrIpRateLimitKey,
  });

  // Authorize appointment mutations by the appointment's OWNER: Owner/Admin may
  // act on any booking in the salon; a Stylist may act only on a booking assigned
  // to them. The appointment's staffMemberId is not in the request, so this guard
  // reads the appointment first — hence an async guard rather than the synchronous
  // `requireRole`. A denial never reaches the handler (Requirement 2.4).
  const authorizeAppointment = async (
    req: Parameters<RequestHandler>[0],
    res: Parameters<RequestHandler>[1],
    next: Parameters<RequestHandler>[2],
    requireApprovalPermission: boolean,
  ) => {
    const principal = req.principal;
    if (!principal) {
      res.status(401).json({ code: 'UNAUTHORIZED' });
      return;
    }
    if (!principal.role) {
      // Customers cannot approve/reject in a tenant panel.
      res.status(403).json({ code: 'FORBIDDEN' });
      return;
    }
    services.calendarService
      .getAppointmentById(req.params.id)
      .then(async (appt) => {
        if (!appt) {
          res.status(404).json({ code: 'NOT_FOUND' });
          return;
        }
        const approvalPermission =
          !requireApprovalPermission ||
          principal.role !== 'Stylist' ||
          Boolean(
            principal.staffMemberId &&
            (await services.resourceRegistration.getStaffMember(principal.staffMemberId))
              ?.canApproveOwnAppointments === true,
          );
        const allowed =
          approvalPermission &&
          services.authorizer.can(
            {
              id: principal.id,
              role: principal.role as StaffRole,
              staffMemberId: principal.staffMemberId,
              salonId: principal.salonId,
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

  const requireCanManageAppointment: RequestHandler = (req, res, next) => {
    void authorizeAppointment(req, res, next, false);
  };

  // Separate owner-controlled approval permission from other own-appointment
  // actions such as rescheduling or customer notes.
  const requireCanApproveOwnAppointment: RequestHandler = (req, res, next) => {
    void authorizeAppointment(req, res, next, true);
  };

  const requireCustomerAppointment: RequestHandler = (req, res, next) => {
    const principal = req.principal;
    if (!principal || (principal.role && principal.role !== 'PlatformAdmin')) {
      res.status(principal ? 403 : 401).json({ code: principal ? 'FORBIDDEN' : 'UNAUTHORIZED' });
      return;
    }
    services.calendarService
      .getAppointmentById(req.params.id)
      .then((appointment) => {
        if (!appointment) {
          res.status(404).json({ code: 'NOT_FOUND' });
          return;
        }
        if (appointment.customerId !== principal.id) {
          res.status(403).json({ code: 'FORBIDDEN' });
          return;
        }
        next();
      })
      .catch(next);
  };

  const requireReceiptViewer: RequestHandler = (req, res, next) => {
    const principal = req.principal;
    if (!principal) {
      res.status(401).json({ code: 'UNAUTHORIZED' });
      return;
    }
    services.calendarService
      .getAppointmentById(req.params.id)
      .then((appointment) => {
        if (!appointment) {
          res.status(404).json({ code: 'NOT_FOUND' });
          return;
        }
        if (!principal.role && appointment.customerId === principal.id) {
          next();
          return;
        }
        const allowed = principal.role
          ? services.authorizer.can(
              {
                id: principal.id,
                role: principal.role as StaffRole,
                staffMemberId: principal.staffMemberId,
                salonId: principal.salonId,
              },
              'manage_own_appointments',
              { salonId: appointment.salonId, staffMemberId: appointment.staffMemberId },
            )
          : false;
        if (allowed) {
          next();
          return;
        }
        res.status(403).json({ code: 'FORBIDDEN' });
      })
      .catch(next);
  };

  const depositPayload = (payment: {
    method?: string;
    redirectUrl?: string;
    amountRial?: number;
    cardNumber?: string;
    cardHolder?: string;
    bankName?: string;
  }) => ({
    ...(payment.redirectUrl ? { paymentRedirectUrl: payment.redirectUrl } : {}),
    ...(payment.method === 'card_transfer'
      ? {
          deposit: {
            method: 'card_transfer',
            amountRial: payment.amountRial,
            cardNumber: payment.cardNumber,
            cardHolder: payment.cardHolder,
            bankName: payment.bankName ?? null,
          },
        }
      : {}),
  });

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
            salonId: principal.salonId,
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
    bookingIpLimit,
    bookingCustomerLimit,
    asyncRoute(async (req, res) => {
      if (!validateRequired(res, req.body, ['salonId', 'serviceId', 'startAt'])) {
        return;
      }
      const rawLocationType = req.body.locationType;
      if (
        rawLocationType !== undefined &&
        rawLocationType !== 'salon' &&
        rawLocationType !== 'customer'
      ) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'locationType' });
        return;
      }
      const locationAddress =
        typeof req.body.locationAddress === 'string' ? req.body.locationAddress.trim() : '';
      if (rawLocationType === 'customer' && (!locationAddress || locationAddress.length > 300)) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'locationAddress' });
        return;
      }
      const principal = req.principal!;
      const idempotencyKey = req.get('Idempotency-Key')?.trim();
      if (services.bookingAbuseGuard) {
        await services.bookingAbuseGuard.check({
          customerId: principal.id,
          salonId: String(req.body.salonId),
          serviceId: String(req.body.serviceId),
          startAt: String(req.body.startAt),
          ip: req.ip ?? 'unknown',
          idempotencyKey: idempotencyKey || undefined,
          honeypot: req.body.website,
        });
      }
      const bookingRequest = {
        salonId: req.body.salonId,
        serviceId: req.body.serviceId,
        startAt: req.body.startAt,
        preferredStaffId: req.body.preferredStaffId,
        customerId: principal.id,
        source: 'web' as const,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(rawLocationType === 'customer'
          ? { locationType: 'customer' as const, locationAddress }
          : rawLocationType === 'salon'
            ? { locationType: 'salon' as const }
            : {}),
      };
      const result = await services.bookingFlow.book(bookingRequest);

      if (result.status === 'rejected') {
        const code =
          result.reason === 'no_availability'
            ? 'BOOKING_NO_AVAILABILITY'
            : 'BOOKING_SLOT_UNAVAILABLE';
        res.status(409).json({ code });
        return;
      }

      if (result.status === 'held') {
        // A held appointment must immediately create its deposit payment. The
        // scheduling engine only reserves the slot; its placeholder URL is not
        // a gateway session and would leave the customer on a dead route.
        const payment = await services.paymentService.initiateDeposit(result.appointment.id);
        res.status(200).json({
          status: 'held',
          appointment: result.appointment,
          ...depositPayload(payment),
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
    appointmentMutationLimit,
    asyncRoute(async (req, res) => {
      const appointment = await services.cancellationFlow.cancel(req.params.id);
      res.status(200).json({ status: 'cancelled', appointment });
    }),
  );

  // Staff-entered walk-in. It uses the same scheduler and resource constraints
  // as online booking; only the approval is automatic because a staff member is
  // recording it at the salon counter.
  router.post(
    '/salons/:id/appointments/manual',
    requireRole('manage_appointments', (req) => ({ salonId: req.params.id })),
    appointmentMutationLimit,
    asyncRoute(async (req, res) => {
      if (!services.appointmentManagementService) {
        res.status(503).json({ code: 'FEATURE_UNAVAILABLE' });
        return;
      }
      if (!validateRequired(res, req.body, ['serviceId', 'startAt', 'phone'])) return;
      const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
      if (!/^09\d{9}$/.test(phone)) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'phone' });
        return;
      }
      const rawLocationType = req.body.locationType;
      if (
        rawLocationType !== undefined &&
        rawLocationType !== 'salon' &&
        rawLocationType !== 'customer'
      ) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'locationType' });
        return;
      }
      const locationAddress =
        typeof req.body.locationAddress === 'string' ? req.body.locationAddress.trim() : '';
      if (rawLocationType === 'customer' && (!locationAddress || locationAddress.length > 300)) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'locationAddress' });
        return;
      }
      const result = await services.appointmentManagementService.createWalkIn({
        salonId: req.params.id,
        serviceId: String(req.body.serviceId),
        startAt: String(req.body.startAt),
        customerPhone: phone,
        customerName: typeof req.body.fullName === 'string' ? req.body.fullName.trim() : undefined,
        preferredStaffId:
          typeof req.body.preferredStaffId === 'string' ? req.body.preferredStaffId : undefined,
        ...(rawLocationType ? { locationType: rawLocationType as 'salon' | 'customer' } : {}),
        ...(rawLocationType === 'customer' ? { locationAddress } : {}),
      });
      if (result.status === 'rejected') {
        res.status(409).json({
          code:
            result.reason === 'no_availability'
              ? 'BOOKING_NO_AVAILABILITY'
              : 'BOOKING_SLOT_UNAVAILABLE',
        });
        return;
      }
      if (result.status === 'held') {
        const payment = await services.paymentService.initiateDeposit(result.appointment.id);
        res.status(200).json({
          status: result.status,
          appointment: result.appointment,
          ...depositPayload(payment),
        });
        return;
      }
      res.status(200).json({ status: result.status, appointment: result.appointment });
    }),
  );

  router.post(
    '/appointments/:id/reschedule',
    requireCanCancelAppointment,
    appointmentMutationLimit,
    asyncRoute(async (req, res) => {
      if (!services.appointmentManagementService) {
        res.status(503).json({ code: 'FEATURE_UNAVAILABLE' });
        return;
      }
      if (!validateRequired(res, req.body, ['startAt'])) return;
      const result = await services.appointmentManagementService.reschedule({
        appointmentId: req.params.id,
        customerId: req.principal!.id,
        startAt: String(req.body.startAt),
        preferredStaffId:
          typeof req.body.preferredStaffId === 'string' ? req.body.preferredStaffId : undefined,
      });
      if (result.booking.status === 'held') {
        const payment = await services.paymentService.initiateDeposit(
          result.booking.appointment.id,
        );
        res.status(200).json({
          status: result.booking.status,
          appointment: result.booking.appointment,
          previousAppointmentId: result.previousAppointment.id,
          ...depositPayload(payment),
        });
        return;
      }
      if (result.booking.status === 'rejected') {
        res.status(409).json({ code: 'BOOKING_SLOT_UNAVAILABLE' });
        return;
      }
      res.status(200).json({
        status: result.booking.status,
        appointment: result.booking.appointment,
        previousAppointmentId: result.previousAppointment.id,
      });
    }),
  );

  router.post(
    '/appointments/:id/no-show',
    requireRole('manage_appointments'),
    appointmentMutationLimit,
    asyncRoute(async (req, res) => {
      const appointment = await services.cancellationService.markNoShow(req.params.id);
      res.status(200).json({ status: 'no_show', appointment });
    }),
  );

  router.get(
    '/appointments/:id/deposit',
    requireCustomerAppointment,
    asyncRoute(async (req, res) => {
      const deposit = await services.paymentService.getDepositOverview(req.params.id);
      res.status(200).json({ deposit });
    }),
  );

  router.post(
    '/appointments/:id/deposit-receipt',
    requireCustomerAppointment,
    depositReceiptLimit,
    asyncRoute(async (req, res) => {
      const body = req.body as Record<string, unknown>;
      if (
        typeof body.fileName !== 'string' ||
        typeof body.mimeType !== 'string' ||
        typeof body.dataBase64 !== 'string'
      ) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'receipt' });
        return;
      }
      const result = await services.paymentService.uploadManualReceipt(req.params.id, {
        fileName: body.fileName,
        mimeType: body.mimeType,
        dataBase64: body.dataBase64,
      });
      res.status(201).json({ receipt: result });
    }),
  );

  router.get(
    '/appointments/:id/deposit-receipt',
    requireReceiptViewer,
    asyncRoute(async (req, res) => {
      const receipt = await services.paymentService.getManualReceiptFile(req.params.id);
      if (!receipt) {
        res.status(404).json({ code: 'DEPOSIT_RECEIPT_NOT_FOUND' });
        return;
      }
      res.status(200).json({
        receipt: {
          id: receipt.id,
          fileName: receipt.fileName,
          mimeType: receipt.mimeType,
          sizeBytes: receipt.sizeBytes,
          uploadedAt: receipt.uploadedAt,
          status: receipt.status,
          dataBase64: receipt.data.toString('base64'),
        },
      });
    }),
  );

  router.post(
    '/appointments/:id/deposit-receipt/review',
    requireCanApproveOwnAppointment,
    asyncRoute(async (req, res) => {
      const decision = req.body?.decision;
      if (decision !== 'approved' && decision !== 'rejected') {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'decision' });
        return;
      }
      const result = await services.paymentService.reviewManualReceipt(
        req.params.id,
        decision,
        req.principal!.staffMemberId ?? req.principal!.id,
        typeof req.body?.note === 'string' ? req.body.note : undefined,
      );
      if (result.status === 'approved') {
        await safelyNotify(() => services.notificationService.sendConfirmation(req.params.id));
        await safelyNotify(() =>
          services.notificationService.sendSalonBookingNotice(req.params.id, 'confirmed'),
        );
      }
      res
        .status(200)
        .json({ receiptStatus: result.status, appointmentStatus: result.appointmentStatus });
    }),
  );

  // Approve a pending booking -> 'confirmed' + customer confirmation notification
  // (sent by BookingFlow.approve). Owner/Admin may approve any salon booking; a
  // Stylist may approve a booking assigned to them when the owner grants the
  // explicit approval permission (ownership enforced by the approval guard).
  router.post(
    '/appointments/:id/approve',
    requireCanApproveOwnAppointment,
    asyncRoute(async (req, res) => {
      const appointment = await services.bookingFlow.approve(req.params.id);
      res.status(200).json({ status: 'confirmed', appointment });
    }),
  );

  // Reject a pending booking -> 'cancelled' + customer rejection notice (sent by
  // BookingFlow.reject). Same ownership rule as approve.
  router.post(
    '/appointments/:id/reject',
    requireCanApproveOwnAppointment,
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
      if (
        typeof req.body.startAt !== 'string' ||
        Number.isNaN(new Date(req.body.startAt).getTime())
      ) {
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

export class AppointmentController {
  public constructor(
    private readonly services: Services,
    private readonly requireRole: RequireRole,
  ) {}

  public router(): Router {
    return appointmentRouter(this.services, this.requireRole);
  }
}
