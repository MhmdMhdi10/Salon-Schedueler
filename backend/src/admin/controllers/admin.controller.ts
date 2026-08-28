import { Router, type RequestHandler } from 'express';
import type { Services } from '../../http/app.js';
import type { RequireRole } from '../../common/http/require-role.js';
import { asyncRoute, validateRequired } from '../../common/http/route-helpers.js';
import type { ServiceCatalog } from '../../catalog/service-catalog.js';
import { normalizeDigits, type StaffRole } from '@salon/shared';

/**
 * Parse an ISO date string from a query param; respond 400 VALIDATION_ERROR and
 * return null when it is absent or unparseable.
 */
function parseDateParam(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Flatten an enriched calendar appointment row (with included service/customer/
 * staff relations) into the DTO the calendar clients consume. The `*Name` fields
 * are pulled off the included relations (null when the relation is absent). Date
 * fields are left as-is; Express serializes them to ISO strings on the wire (the
 * web layer parses them back). Applies to both the Stylist (getStaffCalendar) and
 * Owner/Admin (getSalonCalendar) branches.
 */
const toCalendarDto = (a: any) => ({
  id: a.id,
  startAt: a.startAt,
  endAt: a.endAt,
  status: a.status,
  staffMemberId: a.staffMemberId,
  serviceId: a.serviceId,
  customerId: a.customer?.id ?? a.customerId ?? null,
  customerPhone: a.customer?.phone ?? null,
  serviceName: a.service?.name ?? null,
  customerName: a.customer?.fullName ?? null,
  staffName: a.staffMember?.fullName ?? null,
  locationType: a.locationType ?? 'salon',
  locationAddress: a.locationAddress ?? null,
  depositReceiptStatus: a.depositReceipt?.status ?? null,
  depositPaymentStatus: a.payments?.[0]?.status ?? null,
});

const toDepositPayload = (payment: {
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

/**
 * Admin routes behind RBAC (Requirement 2.2, 2.4 / original R15, R16).
 *
 * - GET /salons/:id/calendar?from=&to=&view= -> { appointments }  (view_own_appointments)
 *     Stylist sees only their own appointments (getStaffCalendar, R2.5); Owner/Admin
 *     see the whole salon (getSalonCalendar).
 * - GET /salons/:id/pending                   -> { appointments }  (manage_appointments) — approval queue
 * - GET /salons/:id/analytics?from=&to=      -> complete salon report (manage_appointments)
 * - GET /salons/:id/staff                     -> { staff }   (manage_appointments)
 * - GET /salons/:id/chairs                    -> { chairs }  (manage_appointments)
 *
 * Mounted behind `requireAuth`; each route adds its own role guard. Denials return
 * 403 FORBIDDEN with no state change.
 */
/** Format a Prisma `@db.Time` value (epoch-based, UTC h/m) to "HH:mm", or null. */
const formatClosureTime = (t: unknown): string | null => {
  if (t == null) return null;
  const d = new Date(t as string | number | Date);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

/**
 * Flatten a `holiday` (closure) row to the DTO the config UI consumes: the ISO
 * date plus an optional [startTime,endTime) HH:mm window. `startTime`/`endTime`
 * are null for a full-day closure and set for a partial-day (hour-range) one.
 */
const toClosureDto = (h: {
  id: string;
  onDate: Date | string;
  startTime?: unknown;
  endTime?: unknown;
}) => ({
  id: h.id,
  onDate:
    typeof h.onDate === 'string'
      ? h.onDate.slice(0, 10)
      : new Date(h.onDate).toISOString().slice(0, 10),
  startTime: formatClosureTime(h.startTime),
  endTime: formatClosureTime(h.endTime),
});

/** "HH:mm" 24-hour validator for closure window times. */
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const IRAN_DEFAULT_WORKING_HOURS = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  startTime: '09:00',
  endTime: '20:00',
}));

const toWorkingHourDto = (row: {
  weekday: number;
  startTime: Date | string;
  endTime: Date | string;
}): { weekday: number; startTime: string; endTime: string } => {
  const startTime = formatClosureTime(row.startTime);
  const endTime = formatClosureTime(row.endTime);
  if (!startTime || !endTime) throw new Error('Invalid persisted working-hours time');
  return { weekday: row.weekday, startTime, endTime };
};

function parseWorkingHours(body: unknown) {
  const hours = (body as { hours?: unknown })?.hours;
  if (!Array.isArray(hours) || hours.length > 21) return null;
  const parsed: Array<{ weekday: number; startTime: string; endTime: string }> = [];
  for (const value of hours) {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (
      !Number.isInteger(row.weekday) ||
      Number(row.weekday) < 0 ||
      Number(row.weekday) > 6 ||
      typeof row.startTime !== 'string' ||
      typeof row.endTime !== 'string' ||
      !HHMM_RE.test(row.startTime) ||
      !HHMM_RE.test(row.endTime) ||
      row.startTime >= row.endTime
    ) {
      return null;
    }
    parsed.push({
      weekday: Number(row.weekday),
      startTime: row.startTime,
      endTime: row.endTime,
    });
  }
  parsed.sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
  for (let index = 1; index < parsed.length; index += 1) {
    const previous = parsed[index - 1];
    const current = parsed[index];
    if (previous.weekday === current.weekday && previous.endTime > current.startTime) return null;
  }
  return parsed;
}

/**
 * Validate a closure/availability-block body: an ISO `onDate` (YYYY-MM-DD), an
 * OPTIONAL `toDate` (YYYY-MM-DD, ≥ onDate) for a multi-day range, plus an
 * optional both-or-neither [startTime,endTime) "HH:mm" window (omit both for a
 * full day; endTime must be strictly after startTime). When a range is given the
 * same window applies to every day in it. Shared by the salon closure and the
 * per-stylist availability-block routes.
 */
function parseDateWindow(body: Record<string, unknown>):
  | {
      ok: true;
      onDate: string;
      toDate: string | null;
      startTime: string | null;
      endTime: string | null;
    }
  | { ok: false; field: string } {
  const onDate = body.onDate;
  if (typeof onDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(onDate)) {
    return { ok: false, field: 'onDate' };
  }
  // Optional end of a multi-day range. Empty/absent => a single day.
  let toDate: string | null = null;
  const rawTo = body.toDate;
  if (rawTo !== undefined && rawTo !== null && rawTo !== '') {
    if (typeof rawTo !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rawTo)) {
      return { ok: false, field: 'toDate' };
    }
    if (rawTo < onDate) {
      return { ok: false, field: 'toDate' };
    }
    toDate = rawTo;
  }
  const rawStart = body.startTime;
  const rawEnd = body.endTime;
  const hasStart = typeof rawStart === 'string' && rawStart !== '';
  const hasEnd = typeof rawEnd === 'string' && rawEnd !== '';
  if (hasStart !== hasEnd) {
    return { ok: false, field: hasStart ? 'endTime' : 'startTime' };
  }
  if (hasStart) {
    const start = rawStart as string;
    const end = rawEnd as string;
    if (!HHMM_RE.test(start) || !HHMM_RE.test(end)) {
      return { ok: false, field: 'startTime' };
    }
    if (start >= end) {
      return { ok: false, field: 'endTime' };
    }
    return { ok: true, onDate, toDate, startTime: start, endTime: end };
  }
  return { ok: true, onDate, toDate, startTime: null, endTime: null };
}

/** Cap on a single multi-day closure/block range (defensive, ~1 year). */
const MAX_RANGE_DAYS = 366;

/** Inclusive list of `YYYY-MM-DD` dates from `from` to `to` (capped). */
function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(`${to}T00:00:00Z`).getTime();
  let cursor = new Date(`${from}T00:00:00Z`).getTime();
  while (cursor <= end && out.length < MAX_RANGE_DAYS) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
  return out;
}

/** Valid staff roles (mirrors the @salon/shared StaffRole / prisma enum). */
const STAFF_ROLES = ['Owner', 'Admin', 'Stylist'] as const;
const SALON_WORK_MODES = [
  'fixed_salon',
  'rented_chair',
  'home',
  'mobile',
  'hybrid',
  'not_decided',
] as const;
/** Iranian mobile pattern for an optional staff login phone. */
const PHONE_RE = /^09\d{9}$/;

type ServiceCatalogWithAppend = Pick<ServiceCatalog, 'listServices'> & {
  addServiceStaff?: (serviceId: string, staffIds: string[]) => Promise<void>;
};

/** Flatten a staff row to the owner-UI DTO (identity + role + login + flags). */
const toStaffDto = (s: {
  id: string;
  fullName: string | null;
  role: string;
  phone?: string | null;
  active: boolean;
  autoApprove?: boolean | null;
  manageOwnAvailability?: boolean;
  canApproveOwnAppointments?: boolean;
  assignedChairId?: string | null;
}) => ({
  id: s.id,
  fullName: s.fullName,
  role: s.role,
  phone: s.phone ?? null,
  active: s.active,
  autoApprove: s.autoApprove ?? null,
  manageOwnAvailability: s.manageOwnAvailability === true,
  canApproveOwnAppointments: s.canApproveOwnAppointments === true,
  assignedChairId: s.assignedChairId ?? null,
});

/** True for a Prisma unique-constraint violation (e.g. a duplicate phone). */
const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

const uniqueViolationTargets = (err: { meta?: { target?: unknown } }): string[] => {
  const target = err.meta?.target;
  return Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];
};

export function adminRouter(services: Services, requireRole: RequireRole): Router {
  const router = Router();

  /** Cancel active future bookings covered by a full-day salon closure. */
  const cancelAppointmentsForFullDayClosure = async (salonId: string, onDate: string) => {
    const from = new Date(`${onDate}T00:00:00.000Z`);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);
    const now = Date.now();
    const appointments = await services.calendarService.getSalonCalendar(salonId, from, to);
    const cancellable = appointments.filter((item) => {
      if (!['pending', 'held', 'confirmed'].includes(String(item.status))) return false;
      // Legacy test doubles omit startAt; production rows always have it.
      return !item.startAt || new Date(item.startAt).getTime() >= now;
    });
    const results = await Promise.allSettled(
      cancellable.map((item) =>
        String(item.status) === 'pending'
          ? services.bookingFlow.reject(item.id)
          : services.cancellationFlow.cancel(item.id),
      ),
    );
    const cancelledCount = results.filter((item) => item.status === 'fulfilled').length;
    return { cancelledCount, failedCount: results.length - cancelledCount };
  };

  /**
   * Direct `/staff/:id` routes do not carry a salon id in their URL. Resolve
   * the target first so a scoped staff token cannot mutate another salon's
   * staff record by guessing its UUID.
   */
  const requireStaffTenantScope: RequestHandler = (req, res, next) => {
    const principal = req.principal;
    if (!principal) {
      res.status(401).json({ code: 'UNAUTHORIZED' });
      return;
    }
    const staffId = req.params.id;
    services.resourceRegistration
      .getStaffMember(staffId)
      .then((staff) => {
        if (!staff) {
          res.status(404).json({ code: 'NOT_FOUND' });
          return;
        }
        if (
          principal.role !== 'PlatformAdmin' &&
          principal.salonId &&
          principal.salonId !== staff.salonId
        ) {
          res.status(403).json({ code: 'FORBIDDEN' });
          return;
        }
        next();
      })
      .catch(next);
  };

  /**
   * Resolve the appointment before staff mutations so Owner/Admin and a
   * Stylist can only act inside their authorized salon/staff scope. The
   * owner-controlled approval permission is checked only by the approve/reject
   * routes in appointment.routes.ts; it must not block notes or rescheduling.
   */
  const requireCanManageAppointment: RequestHandler = (req, res, next) => {
    const principal = req.principal;
    if (!principal) {
      res.status(401).json({ code: 'UNAUTHORIZED' });
      return;
    }
    if (!principal.role) {
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
        const allowed = services.authorizer.can(
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

  router.get(
    '/salons/:id/calendar',
    // A Stylist may view the calendar but only their own appointments (R2.5), so the
    // ownership check needs a resource: scope it to the caller's own staffMemberId.
    // Owner/Admin bypass the ownership check in the Authorizer, so the value is moot
    // for them. Without this resolver the empty resource made every Stylist 403.
    requireRole('view_own_appointments', (req) => ({
      salonId: req.params.id,
      staffMemberId: req.principal?.staffMemberId,
    })),
    asyncRoute(async (req, res) => {
      if (!validateRequired(res, req.query as Record<string, unknown>, ['from', 'to'])) {
        return;
      }
      const from = parseDateParam(req.query.from);
      const to = parseDateParam(req.query.to);
      if (!from || !to) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: from ? 'to' : 'from' });
        return;
      }
      // R2.5: a Stylist sees only their own appointments; Owner/Admin see the salon.
      const principal = req.principal!;
      const appointments =
        principal.role === 'Stylist' && principal.staffMemberId
          ? await services.calendarService.getStaffCalendar(principal.staffMemberId, from, to)
          : await services.calendarService.getSalonCalendar(req.params.id, from, to);
      // Flatten the enriched rows (service/customer/staff relations) to the DTO the
      // calendar clients read, for both the Stylist and Owner/Admin branches.
      res.status(200).json({ appointments: appointments.map(toCalendarDto) });
    }),
  );

  /**
   * Active waitlist for the owner calendar. The domain already keeps the queue
   * in FIFO order; this route only enriches it with the small amount of data
   * needed for a front-desk action (customer contact + service label).
   */
  router.get(
    '/salons/:id/waitlist',
    requireRole('manage_appointments', (req) => ({ salonId: req.params.id })),
    asyncRoute(async (req, res) => {
      const rawFrom = req.query.from;
      const rawTo = req.query.to;
      const from = rawFrom === undefined ? new Date() : parseDateParam(rawFrom);
      const to =
        rawTo === undefined
          ? new Date(Date.now() + 31 * 24 * 60 * 60 * 1000)
          : parseDateParam(rawTo);
      if (!from || !to || to <= from || to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: !from ? 'from' : 'to' });
        return;
      }

      const [entries, catalog] = await Promise.all([
        services.waitlistService.getWaitlist(req.params.id, from, to),
        services.serviceCatalog.listServices(req.params.id),
      ]);
      const serviceNames = new Map(catalog.map((service) => [service.id, service.name]));
      const waitlist = await Promise.all(
        entries.map(async (entry) => {
          const customer = await services.customerService.getProfile(entry.customerId);
          return {
            ...entry,
            customerName: customer?.fullName ?? null,
            customerPhone: customer?.phone ?? null,
            serviceName: serviceNames.get(entry.serviceId) ?? null,
          };
        }),
      );
      res.status(200).json({ waitlist });
    }),
  );

  // Card-transfer receipts are actionable regardless of the selected calendar
  // date, so expose a salon-scoped queue for the owner/admin panel.
  router.get(
    '/salons/:id/deposit-receipts/pending',
    requireRole('manage_appointments', (req) => ({ salonId: req.params.id })),
    asyncRoute(async (req, res) => {
      const receipts = await services.paymentService.listPendingManualReceipts(req.params.id);
      res.status(200).json({ receipts });
    }),
  );

  /**
   * Return recent customer history visible from this salon's front desk.
   * CalendarService enforces the salon and optional stylist history scope;
   * the route only supplies the authenticated role's staff scope.
   */
  router.get(
    '/salons/:id/customers/:customerId',
    requireRole('view_customer_notes', (req) => ({ salonId: req.params.id })),
    asyncRoute(async (req, res) => {
      const principal = req.principal!;
      const profile = await services.calendarService.getCustomerProfile(
        req.params.id,
        req.params.customerId,
        principal.role === 'Stylist' ? principal.staffMemberId : undefined,
      );
      if (!profile) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      res.status(200).json(profile);
    }),
  );

  router.post(
    '/appointments/:id/reschedule-managed',
    requireCanManageAppointment,
    asyncRoute(async (req, res) => {
      if (!services.appointmentManagementService) {
        res.status(503).json({ code: 'FEATURE_UNAVAILABLE' });
        return;
      }
      if (!validateRequired(res, req.body, ['startAt'])) return;
      const result = await services.appointmentManagementService.rescheduleForStaff({
        appointmentId: req.params.id,
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
          ...toDepositPayload(payment),
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

  router.get(
    '/appointments/:id/customer',
    requireCanManageAppointment,
    asyncRoute(async (req, res) => {
      const appointment = await services.calendarService.getAppointmentById(req.params.id);
      if (!appointment) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      const [customer, appointments, notes, preferredStaff] = await Promise.all([
        services.customerService.getProfile(appointment.customerId),
        services.customerService.getHistory(appointment.customerId),
        services.customerService.getNotes(appointment.customerId),
        services.customerService.getPreferredStaff(appointment.customerId),
      ]);
      if (!customer) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      const response: Record<string, unknown> = { customer, appointments, notes, preferredStaff };
      if (typeof services.paymentService.getDepositOverview === 'function') {
        response.deposit = await services.paymentService.getDepositOverview(req.params.id);
      }
      res.status(200).json(response);
    }),
  );

  router.post(
    '/appointments/:id/customer-notes',
    requireCanManageAppointment,
    asyncRoute(async (req, res) => {
      const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
      if (!body || body.length > 1000) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
        return;
      }
      const appointment = await services.calendarService.getAppointmentById(req.params.id);
      if (!appointment) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      const note = await services.customerService.addNote(
        appointment.customerId,
        // Customer-facing JWT subject is a customer id; CustomerNote.authorId
        // references StaffMember, so prefer the scoped staff claim.
        req.principal?.staffMemberId ?? null,
        body,
      );
      res.status(201).json({ note });
    }),
  );

  router.post(
    '/appointments/:id/message',
    requireCanManageAppointment,
    asyncRoute(async (req, res) => {
      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
      if (!message || message.length > 500) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'message' });
        return;
      }
      const sender = (services.notificationService as any).sendCustomerMessage;
      if (typeof sender !== 'function') {
        res.status(503).json({ code: 'FEATURE_UNAVAILABLE' });
        return;
      }
      const result = await sender.call(services.notificationService, req.params.id, message);
      if (!result) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      if (!result.ok) {
        res.status(502).json({ code: 'SMS_FAILED' });
        return;
      }
      res.status(200).json({ status: 'sent' });
    }),
  );

  // Approval queue: bookings awaiting approval (status 'pending'), oldest first.
  // A Stylist sees only their own pending requests (R2.5); Owner/Admin see the
  // whole salon. Each is approved/rejected via POST /appointments/:id/approve|reject.
  router.get(
    '/salons/:id/pending',
    requireRole('view_own_appointments', (req) => ({
      salonId: req.params.id,
      staffMemberId: req.principal?.staffMemberId,
    })),
    asyncRoute(async (req, res) => {
      const principal = req.principal!;
      // Scope to the stylist's own requests; Owner/Admin pass no scope (all).
      const staffScope = principal.role === 'Stylist' ? principal.staffMemberId : undefined;
      const appointments = await services.calendarService.getPendingAppointments(
        req.params.id,
        staffScope,
      );
      const canApproveOwnAppointments =
        principal.role !== 'Stylist'
          ? true
          : Boolean(
              principal.staffMemberId &&
              (await services.resourceRegistration.getStaffMember(principal.staffMemberId))
                ?.canApproveOwnAppointments === true,
            );
      res.status(200).json({
        appointments: appointments.map(toCalendarDto),
        canApproveOwnAppointments,
      });
    }),
  );

  router.get(
    '/salons/:id/analytics',
    requireRole('manage_appointments'),
    asyncRoute(async (req, res) => {
      if (!validateRequired(res, req.query as Record<string, unknown>, ['from', 'to'])) {
        return;
      }
      const from = parseDateParam(req.query.from);
      const to = parseDateParam(req.query.to);
      if (!from || !to) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: from ? 'to' : 'from' });
        return;
      }
      const salonId = req.params.id;
      // Keep the legacy service seam usable for lightweight route tests and
      // older composition roots. Production AnalyticsService exposes the
      // additive dashboard() report below.
      if (typeof (services.analyticsService as any).dashboard !== 'function') {
        const utilization = await services.analyticsService.chairUtilization(salonId, from, to);
        const revenueReport = await services.analyticsService.revenue(salonId, from, to);
        const windowReport = await services.analyticsService.busiestWindows(salonId, from, to);
        res.status(200).json({
          utilization,
          revenue: {
            totalRial: Number(revenueReport.totalRial),
            appointmentCount: revenueReport.appointmentCount,
          },
          busiestWindows: windowReport.busiestWindows,
        });
        return;
      }
      const report = await services.analyticsService.dashboard(salonId, from, to);
      res.status(200).json({
        ...report,
        // totalRial is BigInt in the domain; convert for JSON serialization.
        revenue: {
          totalRial: Number(report.revenue.totalRial),
          appointmentCount: report.revenue.appointmentCount,
        },
      });
    }),
  );

  router.get(
    '/salons/:id/staff',
    requireRole('manage_appointments'),
    asyncRoute(async (req, res) => {
      const staff = await services.resourceRegistration.listStaff(req.params.id);
      res.status(200).json({ staff: staff.map((s) => toStaffDto(s)) });
    }),
  );

  // Client book: owners/admins can add a client, while stylists may read the
  // same salon-scoped list so a client note is available at the appointment.
  router.get(
    '/salons/:id/clients',
    requireRole('view_customer_notes', (req) => ({ salonId: req.params.id })),
    asyncRoute(async (req, res) => {
      if (!services.clientService) {
        res.status(503).json({ code: 'CLIENT_BOOK_UNAVAILABLE' });
        return;
      }
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
      if (search && search.length > 80) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'search' });
        return;
      }
      const clients = await services.clientService.list(req.params.id, search);
      res.status(200).json({ clients });
    }),
  );

  router.post(
    '/salons/:id/clients',
    requireRole('manage_appointments', (req) => ({ salonId: req.params.id })),
    asyncRoute(async (req, res) => {
      if (!services.clientService) {
        res.status(503).json({ code: 'CLIENT_BOOK_UNAVAILABLE' });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
      const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
      if (fullName.length < 2 || fullName.length > 120) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'fullName' });
        return;
      }
      if (!PHONE_RE.test(phone)) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'phone' });
        return;
      }
      const client = await services.clientService.add(req.params.id, { fullName, phone });
      res.status(201).json({ client });
    }),
  );

  // Role-based SMS audience preferences. The default is applied lazily when
  // the salon has never opened this page: stylist notices on, owner notices off.
  router.get(
    '/salons/:id/sms-settings',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      if (!services.notificationSettings) {
        res.status(503).json({ code: 'NOTIFICATION_SETTINGS_UNAVAILABLE' });
        return;
      }
      res.status(200).json(await services.notificationSettings.getSmsSettings(req.params.id));
    }),
  );

  router.patch(
    '/salons/:id/sms-settings',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      if (!services.notificationSettings) {
        res.status(503).json({ code: 'NOTIFICATION_SETTINGS_UNAVAILABLE' });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const fields = [
        'ownerBooking',
        'stylistBooking',
        'ownerReminder',
        'stylistReminder',
        'ownerCancellation',
        'stylistCancellation',
      ] as const;
      const patch: Partial<Record<(typeof fields)[number], boolean>> = {};
      for (const field of fields) {
        if (body[field] === undefined) continue;
        if (typeof body[field] !== 'boolean') {
          res.status(400).json({ code: 'VALIDATION_ERROR', field });
          return;
        }
        patch[field] = body[field];
      }
      res
        .status(200)
        .json(await services.notificationSettings.updateSmsSettings(req.params.id, patch));
    }),
  );

  // Add a staff member to the salon (Owner/Admin). Body: { fullName, role,
  // phone? }. `role` sets their RBAC access (Owner/Admin/Stylist); an optional
  // unique `phone` is their OTP login (matched in auth.service → staff JWT).
  router.post(
    '/salons/:id/staff',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
      if (!fullName) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'fullName' });
        return;
      }
      const role = body.role;
      if (typeof role !== 'string' || !STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number])) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'role' });
        return;
      }
      const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
      if (rawPhone && !PHONE_RE.test(rawPhone)) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'phone' });
        return;
      }
      try {
        const created = await services.resourceRegistration.registerStaffMember(
          req.params.id,
          fullName,
          role as (typeof STAFF_ROLES)[number],
          rawPhone || null,
        );
        // A new service-performing staff member inherits the salon's current
        // recurring schedule instead of starting with zero bookable hours.
        if (created.role !== 'Admin') {
          const salonStaff = await services.resourceRegistration.listStaff(req.params.id);
          const source = salonStaff.find(
            (item) => item.id !== created.id && item.active && item.role !== 'Admin',
          );
          const inherited = source
            ? (await services.availabilityConfig.getWorkingHours('staff', source.id)).map(
                toWorkingHourDto,
              )
            : IRAN_DEFAULT_WORKING_HOURS;
          await services.availabilityConfig.setWorkingHours('staff', created.id, inherited);

          // Most salons have one physical station per service-performing
          // stylist. Provision that capacity by default; owners can deactivate
          // any extra chair later without touching the stylist or history.
          const workMode =
            typeof services.availabilityConfig.getSalonWorkMode === 'function'
              ? await services.availabilityConfig.getSalonWorkMode(req.params.id)
              : 'not_decided';
          const mobileCapacity = workMode === 'mobile' || workMode === 'hybrid';
          const capacityKind = mobileCapacity ? 'mobile' : 'physical';
          const chair = await services.resourceRegistration.registerChair(
            req.params.id,
            mobileCapacity
              ? `مسیر سیار ${created.fullName || 'جدید'}`
              : `صندلی ${created.fullName || 'جدید'}`,
            {
              kind: capacityKind,
              ...(mobileCapacity
                ? { mobileStaffId: created.id }
                : workMode === 'rented_chair'
                  ? { assignedStaffId: created.id }
                  : {}),
            },
          );
          await services.availabilityConfig.setWorkingHours(
            'chair',
            chair.id,
            inherited.length > 0 ? inherited : IRAN_DEFAULT_WORKING_HOURS,
          );

          // Existing services must become bookable by a newly added stylist.
          // Without this mapping the scheduler sees no qualified staff and
          // returns an empty calendar until an owner edits every service.
          const catalog = services.serviceCatalog as ServiceCatalogWithAppend;
          if (typeof catalog.addServiceStaff === 'function') {
            const servicesForSalon = await catalog.listServices(req.params.id);
            await Promise.all(
              servicesForSalon.map((service) => catalog.addServiceStaff!(service.id, [created.id])),
            );
          }
        }
        const current = await services.resourceRegistration.getStaffMember(created.id);
        res.status(201).json({ staff: toStaffDto(current ?? created) });
      } catch (err) {
        if (isUniqueViolation(err)) {
          res.status(409).json({ code: 'PHONE_TAKEN', field: 'phone' });
          return;
        }
        throw err;
      }
    }),
  );

  // Update a staff member's identity / role / login / active flag (Owner/Admin).
  // Body: any subset of { fullName, role, phone, active }. `phone: ""`/null
  // clears the login; a non-empty value (must be unique) sets it.
  router.patch(
    '/staff/:id',
    requireRole('configure_salon'),
    requireStaffTenantScope,
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: {
        fullName?: string;
        role?: (typeof STAFF_ROLES)[number];
        phone?: string | null;
        active?: boolean;
        assignedChairId?: string | null;
      } = {};

      if (body.fullName !== undefined) {
        const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
        if (!fullName) {
          res.status(400).json({ code: 'VALIDATION_ERROR', field: 'fullName' });
          return;
        }
        patch.fullName = fullName;
      }
      if (body.role !== undefined) {
        if (
          typeof body.role !== 'string' ||
          !STAFF_ROLES.includes(body.role as (typeof STAFF_ROLES)[number])
        ) {
          res.status(400).json({ code: 'VALIDATION_ERROR', field: 'role' });
          return;
        }
        patch.role = body.role as (typeof STAFF_ROLES)[number];
      }
      if (body.phone !== undefined) {
        const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
        if (phone && !PHONE_RE.test(phone)) {
          res.status(400).json({ code: 'VALIDATION_ERROR', field: 'phone' });
          return;
        }
        patch.phone = phone || null;
      }
      if (body.active !== undefined) {
        patch.active = body.active === true || body.active === 'true';
      }
      if (body.assignedChairId !== undefined) {
        const assignedChairId =
          typeof body.assignedChairId === 'string' ? body.assignedChairId.trim() : '';
        if (assignedChairId) {
          const staff = await services.resourceRegistration.getStaffMember(req.params.id);
          const chairs = await services.resourceRegistration.listChairs(staff?.salonId ?? '');
          const chair = chairs.find((item) => item.id === assignedChairId);
          if (!chair || (chair as { kind?: string }).kind !== 'physical') {
            res.status(400).json({ code: 'VALIDATION_ERROR', field: 'assignedChairId' });
            return;
          }
          patch.assignedChairId = assignedChairId;
        } else {
          patch.assignedChairId = null;
        }
      }

      try {
        const updated = await services.resourceRegistration.updateStaffMember(req.params.id, patch);
        res.status(200).json({ staff: toStaffDto(updated) });
      } catch (err) {
        if (isUniqueViolation(err)) {
          const targets = uniqueViolationTargets(err as { meta?: { target?: unknown } });
          const assignmentTaken = targets.some((target) => target.includes('assigned_chair'));
          res
            .status(409)
            .json(
              assignmentTaken
                ? { code: 'ASSIGNED_CHAIR_TAKEN', field: 'assignedChairId' }
                : { code: 'PHONE_TAKEN', field: 'phone' },
            );
          return;
        }
        throw err;
      }
    }),
  );

  router.get(
    '/salons/:id/chairs',
    requireRole('manage_appointments'),
    asyncRoute(async (req, res) => {
      const chairs = await services.resourceRegistration.listChairs(req.params.id);
      res.status(200).json({ chairs: chairs.filter((item) => item.active) });
    }),
  );

  // Recurring weekly schedule. Salon-level writes apply to every active staff
  // member and chair so the scheduling engine sees one consistent opening
  // window. A per-staff route allows a stylist-specific recurring timetable.
  router.get(
    '/salons/:id/working-hours',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const staff = await services.resourceRegistration.listStaff(req.params.id);
      const chairs = await services.resourceRegistration.listChairs(req.params.id);
      const bookableStaff = staff.find((item) => item.active && item.role !== 'Admin');
      const source = bookableStaff
        ? { kind: 'staff' as const, id: bookableStaff.id }
        : chairs[0]
          ? { kind: 'chair' as const, id: chairs[0].id }
          : null;
      const hours = source
        ? await services.availabilityConfig.getWorkingHours(source.kind, source.id)
        : [];
      res.status(200).json({ hours: hours.map(toWorkingHourDto) });
    }),
  );

  router.put(
    '/salons/:id/working-hours',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const hours = parseWorkingHours(req.body);
      if (!hours) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'hours' });
        return;
      }
      const staff = await services.resourceRegistration.listStaff(req.params.id);
      const chairs = await services.resourceRegistration.listChairs(req.params.id);
      await Promise.all([
        ...staff
          .filter((item) => item.active && item.role !== 'Admin')
          .map((item) => services.availabilityConfig.setWorkingHours('staff', item.id, hours)),
        ...chairs.map((item) =>
          services.availabilityConfig.setWorkingHours('chair', item.id, hours),
        ),
      ]);
      res.status(200).json({ ok: true, hours });
    }),
  );

  router.get(
    '/salons/:id/deposit-settings',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const settings = await services.availabilityConfig.getSalonDepositSettings(req.params.id);
      res.status(200).json(settings);
    }),
  );

  router.patch(
    '/salons/:id/deposit-settings',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const rawMethod = req.body?.depositMethod;
      if (rawMethod !== 'card_transfer') {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'depositMethod' });
        return;
      }
      const cardNumber = normalizeDigits(String(req.body?.depositCardNumber ?? '')).replace(
        /[\s-]/g,
        '',
      );
      const cardHolder =
        typeof req.body?.depositCardHolder === 'string' ? req.body.depositCardHolder.trim() : '';
      const bankName =
        typeof req.body?.depositBankName === 'string' ? req.body.depositBankName.trim() : '';
      if (rawMethod === 'card_transfer' && !/^\d{16}$/.test(cardNumber)) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'depositCardNumber' });
        return;
      }
      if (rawMethod === 'card_transfer' && (cardHolder.length < 2 || cardHolder.length > 120)) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'depositCardHolder' });
        return;
      }
      if (bankName.length > 80) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'depositBankName' });
        return;
      }
      const settings = await services.availabilityConfig.setSalonDepositSettings(req.params.id, {
        depositMethod: rawMethod,
        depositCardNumber: rawMethod === 'card_transfer' ? cardNumber : null,
        depositCardHolder: rawMethod === 'card_transfer' ? cardHolder : null,
        depositBankName: rawMethod === 'card_transfer' ? bankName || null : null,
      });
      res.status(200).json(settings);
    }),
  );

  router.get(
    '/salons/:id/booking-policy',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const bookingWindowDays = await services.availabilityConfig.getBookingWindowDays(
        req.params.id,
      );
      const workMode =
        typeof services.availabilityConfig.getSalonWorkMode === 'function'
          ? await services.availabilityConfig.getSalonWorkMode(req.params.id)
          : undefined;
      res.status(200).json({ bookingWindowDays, ...(workMode ? { workMode } : {}) });
    }),
  );

  router.put(
    '/salons/:id/booking-policy',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const value = req.body?.bookingWindowDays;
      const rawWorkMode = req.body?.workMode;
      const hasWorkMode = rawWorkMode !== undefined;
      if (
        hasWorkMode &&
        (typeof rawWorkMode !== 'string' ||
          !SALON_WORK_MODES.includes(rawWorkMode as (typeof SALON_WORK_MODES)[number]))
      ) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'workMode' });
        return;
      }
      if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 365)) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'bookingWindowDays' });
        return;
      }
      const bookingWindowDays =
        value === undefined
          ? await services.availabilityConfig.getBookingWindowDays(req.params.id)
          : value;
      if (value !== undefined) {
        await services.availabilityConfig.setBookingWindowDays(req.params.id, value);
      }
      if (hasWorkMode) {
        const workMode = rawWorkMode as string;
        await services.availabilityConfig.setSalonWorkMode(req.params.id, workMode);
        if (typeof services.resourceRegistration.ensureWorkModeCapacity === 'function') {
          await services.resourceRegistration.ensureWorkModeCapacity(req.params.id, workMode);
        }
      }
      res.status(200).json({
        ok: true,
        bookingWindowDays,
        ...(hasWorkMode ? { workMode: rawWorkMode } : {}),
      });
    }),
  );

  router.get(
    '/salons/:id/staff/:staffId/working-hours',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const staff = await services.resourceRegistration.listStaff(req.params.id);
      if (!staff.some((item) => item.id === req.params.staffId)) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      const hours = await services.availabilityConfig.getWorkingHours('staff', req.params.staffId);
      res.status(200).json({ hours: hours.map(toWorkingHourDto) });
    }),
  );

  router.put(
    '/salons/:id/staff/:staffId/working-hours',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const hours = parseWorkingHours(req.body);
      if (!hours) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'hours' });
        return;
      }
      const staff = await services.resourceRegistration.listStaff(req.params.id);
      if (!staff.some((item) => item.id === req.params.staffId)) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      await services.availabilityConfig.setWorkingHours('staff', req.params.staffId, hours);
      const member = staff.find((item) => item.id === req.params.staffId) as
        | { mobileChairId?: string | null }
        | undefined;
      if (member?.mobileChairId) {
        await services.availabilityConfig.setWorkingHours('chair', member.mobileChairId, hours);
      }
      res.status(200).json({ ok: true, hours });
    }),
  );

  // Add a chair to the salon (Owner/Admin). Body: { name }.
  router.post(
    '/salons/:id/chairs',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      if (!name) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'name' });
        return;
      }
      const chair = await services.resourceRegistration.registerChair(req.params.id, name);
      // Give the new chair default working hours (09:00–20:00 all 7 days) so it
      // is immediately bookable — mirrors registerSalon's auto-seed.
      await services.availabilityConfig.setWorkingHours('chair', chair.id, [
        { weekday: 0, startTime: '09:00', endTime: '20:00' },
        { weekday: 1, startTime: '09:00', endTime: '20:00' },
        { weekday: 2, startTime: '09:00', endTime: '20:00' },
        { weekday: 3, startTime: '09:00', endTime: '20:00' },
        { weekday: 4, startTime: '09:00', endTime: '20:00' },
        { weekday: 5, startTime: '09:00', endTime: '20:00' },
        { weekday: 6, startTime: '09:00', endTime: '20:00' },
      ]);
      res.status(201).json({ chair });
    }),
  );

  // Activate/deactivate a chair. Deactivation keeps historical appointments
  // intact while immediately removing the chair from future availability.
  router.patch(
    '/salons/:id/chairs/:chairId',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      if (typeof req.body?.active !== 'boolean') {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'active' });
        return;
      }
      const chairs = await services.resourceRegistration.listChairs(req.params.id);
      if (!chairs.some((item) => item.id === req.params.chairId)) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      const chair = await services.resourceRegistration.setChairActive(
        req.params.chairId,
        req.body.active,
      );
      res.status(200).json({ chair });
    }),
  );

  router.delete(
    '/salons/:id/chairs/:chairId',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const chairs = await services.resourceRegistration.listChairs(req.params.id);
      if (!chairs.some((item) => item.id === req.params.chairId)) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      await services.resourceRegistration.setChairActive(req.params.chairId, false);
      res.status(200).json({ ok: true });
    }),
  );

  // Add a service to the salon (Owner/Admin). Body: { name, durationMinutes,
  // priceRial, requiresDeposit?, depositRial? }. Duration/price are optional
  // (default 30 min / 0 Rial). Deposit amount is required when deposits are
  // enabled so a held booking can always create a real payment session.
  router.post(
    '/salons/:id/services',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      if (!name) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'name' });
        return;
      }
      const durationMinutes =
        typeof req.body?.durationMinutes === 'number' && req.body.durationMinutes > 0
          ? req.body.durationMinutes
          : 30;
      const bufferMinutes =
        typeof req.body?.bufferMinutes === 'number' &&
        Number.isInteger(req.body.bufferMinutes) &&
        req.body.bufferMinutes >= 0 &&
        req.body.bufferMinutes <= 120
          ? req.body.bufferMinutes
          : 0;
      const priceRial =
        typeof req.body?.priceRial === 'number' && req.body.priceRial >= 0 ? req.body.priceRial : 0;
      const requiresDeposit =
        req.body?.requiresDeposit === true || req.body?.requiresDeposit === 'true';
      const rawDepositRial = req.body?.depositRial;
      if (
        requiresDeposit &&
        (typeof rawDepositRial !== 'number' ||
          !Number.isInteger(rawDepositRial) ||
          rawDepositRial <= 0)
      ) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'depositRial' });
        return;
      }
      const service = await services.serviceCatalog.createService({
        salonId: req.params.id,
        name,
        durationMinutes,
        bufferMinutes,
        priceRial,
        requiresDeposit,
        ...(requiresDeposit ? { depositRial: rawDepositRial as number } : {}),
        requiredEquipmentIds: [],
      });
      // Auto-link the service to all active staff so it is immediately bookable
      // (mirrors registerSalon's auto-seed).
      const staff = await services.resourceRegistration.listStaff(req.params.id);
      await services.serviceCatalog.setServiceStaff(
        service.id,
        staff.filter((s) => s.active && s.role !== 'Admin').map((s) => s.id),
      );
      res.status(201).json({
        service: {
          id: service.id,
          name: service.name,
          durationMinutes: service.durationMin,
          bufferMinutes: service.bufferMin,
          priceRial: Number(service.priceRial),
          requiresDeposit: service.requiresDeposit,
          depositRial: service.depositRial == null ? null : Number(service.depositRial),
          staffIds:
            (await services.serviceCatalog.listServices(req.params.id))
              .find((item) => item.id === service.id)
              ?.serviceStaff.map((mapping) => mapping.staffMemberId) ?? [],
        },
      });
    }),
  );

  // Edit service rules without deleting existing appointment history.
  router.patch(
    '/salons/:id/services/:serviceId',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const servicesForSalon = await services.serviceCatalog.listServices(req.params.id);
      if (!servicesForSalon.some((service) => service.id === req.params.serviceId)) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: {
        name?: string;
        durationMinutes?: number;
        bufferMinutes?: number;
        priceRial?: number;
        requiresDeposit?: boolean;
        depositRial?: number | null;
      } = {};
      if (body.name !== undefined) {
        if (typeof body.name !== 'string' || !body.name.trim()) {
          res.status(400).json({ code: 'VALIDATION_ERROR', field: 'name' });
          return;
        }
        patch.name = body.name.trim();
      }
      for (const [field, min, max] of [
        ['durationMinutes', 5, 480],
        ['bufferMinutes', 0, 120],
        ['priceRial', 0, Number.MAX_SAFE_INTEGER],
      ] as const) {
        if (body[field] === undefined) continue;
        if (
          typeof body[field] !== 'number' ||
          !Number.isInteger(body[field]) ||
          body[field] < min ||
          body[field] > max
        ) {
          res.status(400).json({ code: 'VALIDATION_ERROR', field });
          return;
        }
        patch[field] = body[field];
      }
      if (body.requiresDeposit !== undefined) {
        patch.requiresDeposit = body.requiresDeposit === true || body.requiresDeposit === 'true';
      }
      if (body.depositRial !== undefined) {
        if (
          body.depositRial !== null &&
          (typeof body.depositRial !== 'number' ||
            !Number.isInteger(body.depositRial) ||
            body.depositRial <= 0)
        ) {
          res.status(400).json({ code: 'VALIDATION_ERROR', field: 'depositRial' });
          return;
        }
        patch.depositRial = body.depositRial as number | null;
      }
      const updated = await services.serviceCatalog.updateService(req.params.serviceId, patch);
      res.status(200).json({
        service: {
          id: updated.id,
          name: updated.name,
          durationMinutes: updated.durationMin,
          bufferMinutes: updated.bufferMin,
          priceRial: Number(updated.priceRial),
          requiresDeposit: updated.requiresDeposit,
          depositRial: updated.depositRial == null ? null : Number(updated.depositRial),
          staffIds: updated.serviceStaff.map((mapping) => mapping.staffMemberId),
        },
      });
    }),
  );

  // Replace the staff qualified to perform one service. A service may be
  // assigned to one or many Owner/Stylist members; Admins are never bookable.
  router.put(
    '/salons/:id/services/:serviceId/staff',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (!Array.isArray(body.staffIds) || body.staffIds.some((id) => typeof id !== 'string')) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'staffIds' });
        return;
      }
      const staffIds = [...new Set(body.staffIds as string[])];
      const salonServices = await services.serviceCatalog.listServices(req.params.id);
      if (!salonServices.some((service) => service.id === req.params.serviceId)) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      const staff = await services.resourceRegistration.listStaff(req.params.id);
      const allowed = new Set(
        staff
          .filter((member) => member.active && member.role !== 'Admin')
          .map((member) => member.id),
      );
      if (staffIds.some((id) => !allowed.has(id))) {
        res.status(400).json({ code: 'INVALID_STAFF_ASSIGNMENT', field: 'staffIds' });
        return;
      }
      await services.serviceCatalog.setServiceStaff(req.params.serviceId, staffIds);
      res.status(200).json({ staffIds });
    }),
  );

  // Delete a service (Owner/Admin).
  router.delete(
    '/salons/:id/services/:serviceId',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const salonServices = await services.serviceCatalog.listServices(req.params.id);
      if (!salonServices.some((service) => service.id === req.params.serviceId)) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      await services.serviceCatalog.deleteService(req.params.serviceId);
      res.status(200).json({ ok: true });
    }),
  );

  // Read the salon's approval policy (salon default + per-stylist overrides) for
  // the owner configuration UI (Owner/Admin).
  router.get(
    '/salons/:id/approval-policy',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const policy = await services.availabilityConfig.getApprovalPolicy(req.params.id);
      res.status(200).json(policy);
    }),
  );

  // Set the salon's default approval policy (Owner/Admin). Body: { autoApprove }.
  router.post(
    '/salons/:id/auto-approve',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const autoApprove = req.body?.autoApprove === true || req.body?.autoApprove === 'true';
      await services.availabilityConfig.setSalonAutoApprove(req.params.id, autoApprove);
      res.status(200).json({ ok: true, autoApprove });
    }),
  );

  // Set/clear a stylist's approval-policy override (Owner/Admin). Body:
  // { autoApprove: true | false | null } — null inherits the salon default.
  router.post(
    '/staff/:id/auto-approve',
    requireRole('configure_salon'),
    requireStaffTenantScope,
    asyncRoute(async (req, res) => {
      const raw = req.body?.autoApprove;
      const autoApprove = raw === null ? null : raw === true || raw === 'true';
      await services.availabilityConfig.setStaffAutoApprove(req.params.id, autoApprove);
      res.status(200).json({ ok: true, autoApprove });
    }),
  );

  // Set a stylist's own-appointment approval permission (Owner/Admin).
  // Body: { allowed: boolean }. Owner/Admin retain global override regardless
  // of this flag; the flag only affects Stylist tokens and own appointments.
  router.post(
    '/staff/:id/approve-own',
    requireRole('configure_salon'),
    requireStaffTenantScope,
    asyncRoute(async (req, res) => {
      if (typeof req.body?.allowed !== 'boolean') {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'allowed' });
        return;
      }
      const staff = await services.resourceRegistration.getStaffMember(req.params.id);
      if (!staff) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      if (staff.role !== 'Stylist') {
        res.status(400).json({ code: 'INVALID_STAFF_ROLE', field: 'id' });
        return;
      }
      await services.availabilityConfig.setStaffCanApproveOwnAppointments(
        req.params.id,
        req.body.allowed,
      );
      res.status(200).json({ ok: true, allowed: req.body.allowed });
    }),
  );

  // Set/clear the salon's storefront Brand_Accent (Owner/Admin). Body:
  // { brandAccent: string | null } — null (or empty/missing) clears the accent so
  // the storefront falls back to the signature default palette. A non-null value
  // is stored as an opaque accent key (resolved client-side). Mirrors the
  // /salons/:id/auto-approve handler (signature-ui-system R4.1).
  router.post(
    '/salons/:id/brand-accent',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const raw = req.body?.brandAccent;
      const brandAccent = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
      await services.availabilityConfig.setSalonBrandAccent(req.params.id, brandAccent);
      res.status(200).json({ ok: true, brandAccent });
    }),
  );

  // ── Salon closures (block a full day, or an hour-range) ─────────────────────
  // The salon's "closed" calendar: a closure with no time window blocks the
  // whole day; one with a [startTime,endTime) window blocks only that part of
  // the day. The scheduling engine enforces both (no availability + booking
  // rejected). Owner/Admin (configure_salon). Read/add/remove.
  router.get(
    '/salons/:id/holidays',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const closures = await services.availabilityConfig.getHolidays(req.params.id);
      res.status(200).json({ holidays: closures.map((h) => toClosureDto(h)) });
    }),
  );

  // Add a closure. Body: { onDate: "YYYY-MM-DD", toDate?: "YYYY-MM-DD",
  // startTime?: "HH:mm", endTime?: "HH:mm" }. Times are both-or-neither; omit
  // both for a full-day closure. `toDate` (≥ onDate) closes every day in the
  // range with the same window (a vacation, or a daily window across days).
  router.post(
    '/salons/:id/holidays',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const parsed = parseDateWindow((req.body ?? {}) as Record<string, unknown>);
      if (!parsed.ok) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: parsed.field });
        return;
      }
      const dates = parsed.toDate ? datesInRange(parsed.onDate, parsed.toDate) : [parsed.onDate];
      const created = [];
      let cancelledCount = 0;
      let failedCount = 0;
      for (const d of dates) {
        created.push(
          await services.availabilityConfig.addHoliday(
            req.params.id,
            d,
            parsed.startTime,
            parsed.endTime,
          ),
        );
        if (!parsed.startTime) {
          const result = await cancelAppointmentsForFullDayClosure(req.params.id, d);
          cancelledCount += result.cancelledCount;
          failedCount += result.failedCount;
        }
      }
      const holidays = created.map((h) => toClosureDto(h));
      // Singular `holiday` (first row) kept for backward compatibility; `holidays`
      // carries every row created for a multi-day range.
      res.status(201).json({ holiday: holidays[0], holidays, cancelledCount, failedCount });
    }),
  );

  // Remove a closure by id (scoped under the salon for a RESTful path).
  router.delete(
    '/salons/:id/holidays/:holidayId',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      await services.availabilityConfig.removeHoliday(req.params.holidayId);
      res.status(200).json({ ok: true });
    }),
  );

  // Fast incident action: close one date immediately and optionally cancel all
  // remaining appointments. Each cancellation uses the normal flow, preserving
  // customer notification, refund rules, and waitlist handling.
  router.post(
    '/salons/:id/emergency-close',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const onDate = req.body?.onDate;
      if (typeof onDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(onDate)) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'onDate' });
        return;
      }
      const existing = await services.availabilityConfig.getHolidays(req.params.id);
      const alreadyClosed = existing.some(
        (item) =>
          toClosureDto(item).onDate === onDate &&
          formatClosureTime((item as any).startTime) === null,
      );
      if (!alreadyClosed) {
        await services.availabilityConfig.addHoliday(req.params.id, onDate);
      }

      if (req.body?.cancelAppointments !== true) {
        res.status(200).json({ ok: true, cancelledCount: 0, failedCount: 0 });
        return;
      }

      const { cancelledCount, failedCount } = await cancelAppointmentsForFullDayClosure(
        req.params.id,
        onDate,
      );
      res.status(200).json({
        ok: true,
        cancelledCount,
        failedCount,
      });
    }),
  );

  // ── Per-stylist availability blocks (a stylist's own day / hour-range off) ──
  // Distinct from a salon closure: these affect ONLY the one stylist's calendar.
  // Owner/Admin may manage any stylist's blocks; a Stylist may manage their OWN
  // blocks only when the salon has granted them the self-availability permission
  // (`StaffMember.manageOwnAvailability`). The scheduling engine drops the
  // stylist (full-day) or carves out their window (partial) from availability.
  const requireCanManageStaffAvailability: RequestHandler = (req, res, next) => {
    const principal = req.principal;
    if (!principal) {
      res.status(401).json({ code: 'UNAUTHORIZED' });
      return;
    }
    if (!principal.role) {
      res.status(403).json({ code: 'FORBIDDEN' });
      return;
    }
    const staffId = req.params.staffId;
    services.availabilityConfig
      .getStaffAvailabilityContext(staffId)
      .then((scope) => {
        if (!scope) {
          res.status(404).json({ code: 'NOT_FOUND' });
          return;
        }
        if (
          principal.role !== 'PlatformAdmin' &&
          principal.salonId &&
          principal.salonId !== scope.salonId
        ) {
          res.status(403).json({ code: 'FORBIDDEN' });
          return;
        }

        // Owner/Admin may manage any stylist's availability (manage_appointments).
        if (
          services.authorizer.can(
            {
              id: principal.id,
              role: principal.role as StaffRole,
              staffMemberId: principal.staffMemberId,
              salonId: principal.salonId,
            },
            'manage_appointments',
            { salonId: scope.salonId, staffMemberId: staffId },
          )
        ) {
          next();
          return;
        }

        // Otherwise the caller must be the stylist themselves AND the salon has
        // granted them self-availability permission.
        if (!principal.staffMemberId || principal.staffMemberId !== staffId) {
          res.status(403).json({ code: 'FORBIDDEN' });
          return;
        }
        if (!scope.manageOwnAvailability) {
          res.status(403).json({ code: 'FORBIDDEN' });
          return;
        }
        next();
      })
      .catch(next);
    return;
  };

  router.get(
    '/staff/:staffId/availability-blocks',
    requireCanManageStaffAvailability,
    asyncRoute(async (req, res) => {
      const blocks = await services.availabilityConfig.getDaysOff(req.params.staffId);
      res.status(200).json({ blocks: blocks.map((b) => toClosureDto(b)) });
    }),
  );

  // Add a block. Body: { onDate: "YYYY-MM-DD", toDate?: "YYYY-MM-DD",
  // startTime?: "HH:mm", endTime?: "HH:mm" } — omit both times for a full-day
  // block; `toDate` blocks every day in the range with the same window.
  router.post(
    '/staff/:staffId/availability-blocks',
    requireCanManageStaffAvailability,
    asyncRoute(async (req, res) => {
      const parsed = parseDateWindow((req.body ?? {}) as Record<string, unknown>);
      if (!parsed.ok) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: parsed.field });
        return;
      }
      const dates = parsed.toDate ? datesInRange(parsed.onDate, parsed.toDate) : [parsed.onDate];
      const created = [];
      for (const d of dates) {
        created.push(
          await services.availabilityConfig.addDayOff(
            req.params.staffId,
            d,
            parsed.startTime,
            parsed.endTime,
          ),
        );
      }
      const blocks = created.map((b) => toClosureDto(b));
      res.status(201).json({ block: blocks[0], blocks });
    }),
  );

  // Remove a block by id (scoped to the staff member so a stylist can never
  // delete another's block via a guessed id).
  router.delete(
    '/staff/:staffId/availability-blocks/:blockId',
    requireCanManageStaffAvailability,
    asyncRoute(async (req, res) => {
      const removed = await services.availabilityConfig.removeDayOffForStaff(
        req.params.blockId,
        req.params.staffId,
      );
      if (!removed) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      res.status(200).json({ ok: true });
    }),
  );

  // Grant or revoke a stylist's permission to manage their OWN availability
  // (Owner/Admin). Body: { allowed: boolean }.
  router.post(
    '/staff/:id/manage-availability',
    requireRole('configure_salon'),
    requireStaffTenantScope,
    asyncRoute(async (req, res) => {
      const allowed = req.body?.allowed === true || req.body?.allowed === 'true';
      await services.availabilityConfig.setStaffManageOwnAvailability(req.params.id, allowed);
      res.status(200).json({ ok: true, allowed });
    }),
  );

  return router;
}

/** V-House-style controller class; legacy factory remains a compatibility adapter. */
export class AdminController {
  public constructor(
    private readonly services: Services,
    private readonly requireRole: RequireRole,
  ) {}

  public router(): Router {
    return adminRouter(this.services, this.requireRole);
  }
}
