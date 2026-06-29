import { Router } from 'express';
import type { Services } from '../app.js';
import type { RequireRole } from './appointment.routes.js';
import { asyncRoute, validateRequired } from './route-helpers.js';

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
  serviceName: a.service?.name ?? null,
  customerName: a.customer?.fullName ?? null,
  staffName: a.staffMember?.fullName ?? null,
});

/**
 * Admin routes behind RBAC (Requirement 2.2, 2.4 / original R15, R16).
 *
 * - GET /salons/:id/calendar?from=&to=&view= -> { appointments }  (view_own_appointments)
 *     Stylist sees only their own appointments (getStaffCalendar, R2.5); Owner/Admin
 *     see the whole salon (getSalonCalendar).
 * - GET /salons/:id/pending                   -> { appointments }  (manage_appointments) — approval queue
 * - GET /salons/:id/analytics?from=&to=      -> { utilization, revenue, busiestWindows } (configure_salon — Owner-only)
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

export function adminRouter(services: Services, requireRole: RequireRole): Router {
  const router = Router();

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
      res.status(200).json({ appointments: appointments.map(toCalendarDto) });
    }),
  );

  router.get(
    '/salons/:id/analytics',
    requireRole('configure_salon'),
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
      const utilization = await services.analyticsService.chairUtilization(salonId, from, to);
      const revenueReport = await services.analyticsService.revenue(salonId, from, to);
      const windowReport = await services.analyticsService.busiestWindows(salonId, from, to);
      res.status(200).json({
        utilization,
        // totalRial is BigInt in the domain; convert for JSON serialization.
        revenue: {
          totalRial: Number(revenueReport.totalRial),
          appointmentCount: revenueReport.appointmentCount,
        },
        busiestWindows: windowReport.busiestWindows,
      });
    }),
  );

  router.get(
    '/salons/:id/staff',
    requireRole('manage_appointments'),
    asyncRoute(async (req, res) => {
      const staff = await services.resourceRegistration.listStaff(req.params.id);
      res.status(200).json({ staff });
    }),
  );

  router.get(
    '/salons/:id/chairs',
    requireRole('manage_appointments'),
    asyncRoute(async (req, res) => {
      const chairs = await services.resourceRegistration.listChairs(req.params.id);
      res.status(200).json({ chairs });
    }),
  );

  // Read the salon's approval policy (salon default + per-stylist overrides) for
  // the owner configuration UI (Owner only).
  router.get(
    '/salons/:id/approval-policy',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const policy = await services.availabilityConfig.getApprovalPolicy(req.params.id);
      res.status(200).json(policy);
    }),
  );

  // Set the salon's default approval policy (Owner only). Body: { autoApprove }.
  router.post(
    '/salons/:id/auto-approve',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const autoApprove = req.body?.autoApprove === true || req.body?.autoApprove === 'true';
      await services.availabilityConfig.setSalonAutoApprove(req.params.id, autoApprove);
      res.status(200).json({ ok: true, autoApprove });
    }),
  );

  // Set/clear a stylist's approval-policy override (Owner only). Body:
  // { autoApprove: true | false | null } — null inherits the salon default.
  router.post(
    '/staff/:id/auto-approve',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const raw = req.body?.autoApprove;
      const autoApprove = raw === null ? null : raw === true || raw === 'true';
      await services.availabilityConfig.setStaffAutoApprove(req.params.id, autoApprove);
      res.status(200).json({ ok: true, autoApprove });
    }),
  );

  // Set/clear the salon's storefront Brand_Accent (Owner only). Body:
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
  // rejected). Owner-only (configure_salon). Read/add/remove.
  router.get(
    '/salons/:id/holidays',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const closures = await services.availabilityConfig.getHolidays(req.params.id);
      res.status(200).json({ holidays: closures.map((h) => toClosureDto(h)) });
    }),
  );

  // Add a closure. Body: { onDate: "YYYY-MM-DD", startTime?: "HH:mm",
  // endTime?: "HH:mm" }. Times are both-or-neither; omit both for a full-day
  // closure. endTime must be strictly after startTime.
  router.post(
    '/salons/:id/holidays',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const onDate = body.onDate;
      if (typeof onDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(onDate)) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'onDate' });
        return;
      }
      const rawStart = body.startTime;
      const rawEnd = body.endTime;
      const hasStart = typeof rawStart === 'string' && rawStart !== '';
      const hasEnd = typeof rawEnd === 'string' && rawEnd !== '';
      // Both-or-neither: a window needs both ends.
      if (hasStart !== hasEnd) {
        res
          .status(400)
          .json({ code: 'VALIDATION_ERROR', field: hasStart ? 'endTime' : 'startTime' });
        return;
      }
      if (hasStart) {
        const start = rawStart as string;
        const end = rawEnd as string;
        if (!HHMM_RE.test(start) || !HHMM_RE.test(end)) {
          res.status(400).json({ code: 'VALIDATION_ERROR', field: 'startTime' });
          return;
        }
        if (start >= end) {
          res.status(400).json({ code: 'VALIDATION_ERROR', field: 'endTime' });
          return;
        }
      }
      const created = await services.availabilityConfig.addHoliday(
        req.params.id,
        onDate,
        hasStart ? (rawStart as string) : null,
        hasEnd ? (rawEnd as string) : null,
      );
      res.status(201).json({ holiday: toClosureDto(created) });
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

  return router;
}
