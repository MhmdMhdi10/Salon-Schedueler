import { Router, type RequestHandler } from 'express';
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

/**
 * Validate a closure/availability-block body: an ISO `onDate` (YYYY-MM-DD), an
 * OPTIONAL `toDate` (YYYY-MM-DD, ≥ onDate) for a multi-day range, plus an
 * optional both-or-neither [startTime,endTime) "HH:mm" window (omit both for a
 * full day; endTime must be strictly after startTime). When a range is given the
 * same window applies to every day in it. Shared by the salon closure and the
 * per-stylist availability-block routes.
 */
function parseDateWindow(
  body: Record<string, unknown>,
):
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
/** Iranian mobile pattern for an optional staff login phone. */
const PHONE_RE = /^09\d{9}$/;

/** Flatten a staff row to the owner-UI DTO (identity + role + login + flags). */
const toStaffDto = (s: {
  id: string;
  fullName: string | null;
  role: string;
  phone?: string | null;
  active: boolean;
  autoApprove?: boolean | null;
  manageOwnAvailability?: boolean;
}) => ({
  id: s.id,
  fullName: s.fullName,
  role: s.role,
  phone: s.phone ?? null,
  active: s.active,
  autoApprove: s.autoApprove ?? null,
  manageOwnAvailability: s.manageOwnAvailability === true,
});

/** True for a Prisma unique-constraint violation (e.g. a duplicate phone). */
const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

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
      res.status(200).json({ staff: staff.map((s) => toStaffDto(s)) });
    }),
  );

  // Add a staff member to the salon (Owner only). Body: { fullName, role,
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
        res.status(201).json({ staff: toStaffDto(created) });
      } catch (err) {
        if (isUniqueViolation(err)) {
          res.status(409).json({ code: 'PHONE_TAKEN', field: 'phone' });
          return;
        }
        throw err;
      }
    }),
  );

  // Update a staff member's identity / role / login / active flag (Owner only).
  // Body: any subset of { fullName, role, phone, active }. `phone: ""`/null
  // clears the login; a non-empty value (must be unique) sets it.
  router.patch(
    '/staff/:id',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: {
        fullName?: string;
        role?: (typeof STAFF_ROLES)[number];
        phone?: string | null;
        active?: boolean;
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

      try {
        const updated = await services.resourceRegistration.updateStaffMember(req.params.id, patch);
        res.status(200).json({ staff: toStaffDto(updated) });
      } catch (err) {
        if (isUniqueViolation(err)) {
          res.status(409).json({ code: 'PHONE_TAKEN', field: 'phone' });
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
      for (const d of dates) {
        created.push(
          await services.availabilityConfig.addHoliday(
            req.params.id,
            d,
            parsed.startTime,
            parsed.endTime,
          ),
        );
      }
      const holidays = created.map((h) => toClosureDto(h));
      // Singular `holiday` (first row) kept for backward compatibility; `holidays`
      // carries every row created for a multi-day range.
      res.status(201).json({ holiday: holidays[0], holidays });
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
    // Owner/Admin may manage any stylist's availability (manage_appointments).
    if (
      services.authorizer.can(
        { id: principal.id, role: principal.role, staffMemberId: principal.staffMemberId },
        'manage_appointments',
      )
    ) {
      next();
      return;
    }
    // Otherwise the caller must be the stylist themselves AND the salon must have
    // granted them the self-availability permission.
    if (!principal.staffMemberId || principal.staffMemberId !== req.params.staffId) {
      res.status(403).json({ code: 'FORBIDDEN' });
      return;
    }
    services.availabilityConfig
      .getStaffAvailabilityContext(req.params.staffId)
      .then((ctx) => {
        if (!ctx) {
          res.status(404).json({ code: 'NOT_FOUND' });
          return;
        }
        if (!ctx.manageOwnAvailability) {
          res.status(403).json({ code: 'FORBIDDEN' });
          return;
        }
        next();
      })
      .catch(next);
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
  // (Owner only). Body: { allowed: boolean }.
  router.post(
    '/staff/:id/manage-availability',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const allowed = req.body?.allowed === true || req.body?.allowed === 'true';
      await services.availabilityConfig.setStaffManageOwnAvailability(req.params.id, allowed);
      res.status(200).json({ ok: true, allowed });
    }),
  );

  return router;
}
