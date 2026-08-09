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
  customerId: a.customerId,
  serviceName: a.service?.name ?? null,
  customerName: a.customer?.fullName ?? null,
  customerPhone: a.customer?.phone ?? null,
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

  // Customer context opened from an appointment. The calendar already proves
  // the salon/staff relationship; this endpoint adds phone, no-show count and
  // recent history without exposing another salon's appointments.
  router.get(
    '/salons/:id/customers/:customerId',
    requireRole('view_own_appointments', (req) => ({
      salonId: req.params.id,
      staffMemberId: req.principal?.staffMemberId,
    })),
    asyncRoute(async (req, res) => {
      const principal = req.principal!;
      const profile = await services.calendarService.getCustomerProfile(
        req.params.id,
        req.params.customerId,
        principal.role === 'Stylist' ? principal.staffMemberId : undefined,
      );
      if (!profile) {
        res.status(404).json({ code: 'CUSTOMER_NOT_FOUND' });
        return;
      }
      res.status(200).json({
        customer: profile.customer,
        appointments: profile.appointments.map((appointment) => ({
          id: appointment.id,
          startAt: appointment.startAt,
          endAt: appointment.endAt,
          status: appointment.status,
          service: appointment.service,
          staffMember: appointment.staffMember,
        })),
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
          const chair = await services.resourceRegistration.registerChair(
            req.params.id,
            `صندلی ${created.fullName || 'جدید'}`,
          );
          await services.availabilityConfig.setWorkingHours(
            'chair',
            chair.id,
            inherited.length > 0 ? inherited : IRAN_DEFAULT_WORKING_HOURS,
          );
        }
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
    '/salons/:id/booking-policy',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const bookingWindowDays = await services.availabilityConfig.getBookingWindowDays(
        req.params.id,
      );
      res.status(200).json({ bookingWindowDays });
    }),
  );

  router.put(
    '/salons/:id/booking-policy',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      const value = req.body?.bookingWindowDays;
      if (!Number.isInteger(value) || value < 0 || value > 365) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'bookingWindowDays' });
        return;
      }
      await services.availabilityConfig.setBookingWindowDays(req.params.id, value);
      res.status(200).json({ ok: true, bookingWindowDays: value });
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
      res.status(200).json({ ok: true, hours });
    }),
  );

  // Add a chair to the salon (Owner only). Body: { name }.
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

  // Add a service to the salon (Owner only). Body: { name, durationMinutes,
  // priceRial }. Duration/price are optional (default 30 min / 0 Rial). The new
  // service is auto-linked to the salon's Owner so it is immediately bookable.
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
      const priceRial =
        typeof req.body?.priceRial === 'number' && req.body.priceRial >= 0 ? req.body.priceRial : 0;
      const service = await services.serviceCatalog.createService({
        salonId: req.params.id,
        name,
        durationMinutes,
        bufferMinutes: 0,
        priceRial,
        requiresDeposit: false,
        requiredEquipmentIds: [],
      });
      // Auto-link the service to all active staff so it is immediately bookable
      // (mirrors registerSalon's auto-seed).
      const staff = await services.resourceRegistration.listStaff(req.params.id);
      await services.serviceCatalog.setServiceStaff(
        service.id,
        staff.filter((s) => s.active).map((s) => s.id),
      );
      res.status(201).json({
        service: {
          id: service.id,
          name: service.name,
          durationMinutes: service.durationMin,
          priceRial: Number(service.priceRial),
        },
      });
    }),
  );

  // Delete a service (Owner only).
  router.delete(
    '/salons/:id/services/:serviceId',
    requireRole('configure_salon'),
    asyncRoute(async (req, res) => {
      await services.serviceCatalog.deleteService(req.params.serviceId);
      res.status(200).json({ ok: true });
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

      const from = new Date(`${onDate}T00:00:00.000Z`);
      const to = new Date(from);
      to.setUTCDate(to.getUTCDate() + 1);
      const appointments = await services.calendarService.getSalonCalendar(req.params.id, from, to);
      const cancellable = appointments.filter((item) =>
        ['pending', 'held', 'confirmed'].includes(item.status),
      );
      const results = await Promise.allSettled(
        cancellable.map((item) =>
          item.status === 'pending'
            ? services.bookingFlow.reject(item.id)
            : services.cancellationFlow.cancel(item.id),
        ),
      );
      const cancelledCount = results.filter((item) => item.status === 'fulfilled').length;
      res.status(200).json({
        ok: true,
        cancelledCount,
        failedCount: results.length - cancelledCount,
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
