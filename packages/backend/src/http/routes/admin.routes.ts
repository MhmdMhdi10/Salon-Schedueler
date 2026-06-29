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

  // Approval queue: bookings awaiting admin approval (status 'pending'), oldest
  // first. An admin approves/rejects each via POST /appointments/:id/approve|reject.
  router.get(
    '/salons/:id/pending',
    requireRole('manage_appointments'),
    asyncRoute(async (req, res) => {
      const appointments = await services.calendarService.getPendingAppointments(
        req.params.id,
      );
      res.status(200).json({ appointments });
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

  return router;
}
