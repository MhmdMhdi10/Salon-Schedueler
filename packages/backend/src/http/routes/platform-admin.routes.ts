import { Router, type Request } from 'express';
import type { Services } from '../app.js';
import { asyncRoute } from './route-helpers.js';
import { createRateLimit, principalOrIpRateLimitKey } from '../middleware/rate-limit.js';
import type { PlatformListQuery, PlatformAdminService } from '../../platform-admin/platform-admin.service.js';
import { makePlatformAdminGuard } from '../middleware/platform-admin.js';

// Prisma stores UUID-shaped ids; development fixtures intentionally use
// deterministic UUIDs whose version/variant nibbles are not RFC-conformant.
// Validate shape without rejecting those legitimate local records.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function queryOf(req: Request): PlatformListQuery {
  const value = (key: string): string | undefined => {
    const raw = req.query[key];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  };
  const numberOf = (key: string): number | undefined => {
    const raw = Number(value(key));
    return Number.isFinite(raw) ? raw : undefined;
  };
  const dateOf = (key: string): Date | undefined => {
    const raw = value(key);
    if (!raw) return undefined;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };
  return {
    page: numberOf('page'),
    limit: numberOf('limit'),
    search: value('search'),
    status: value('status'),
    salonId: value('salonId'),
    source: value('source'),
    from: dateOf('from'),
    to: dateOf('to'),
  };
}

function validId(id: string): boolean {
  return UUID.test(id);
}

const DETAIL_RESOURCES = new Set([
  'salons',
  'customers',
  'staff',
  'appointments',
  'subscriptions',
  'payments',
  'waitlist',
  'qr-scans',
  'audit-logs',
]);

/** Global, tenant-independent operations center for آرا. */
export function platformAdminRouter(
  services: Services,
  platformAdminService: PlatformAdminService,
): Router {
  const router = Router();
  const readLimit = createRateLimit({
    name: 'platform-admin-read',
    max: 240,
    windowMs: 60_000,
    keyGenerator: principalOrIpRateLimitKey,
  });
  const mutationLimit = createRateLimit({
    name: 'platform-admin-mutation',
    max: 60,
    windowMs: 60_000,
    keyGenerator: principalOrIpRateLimitKey,
  });

  router.use(makePlatformAdminGuard(platformAdminService));

  router.get('/platform-admin/dashboard', readLimit, asyncRoute(async (_req, res) => {
    res.status(200).json(await platformAdminService.dashboard());
  }));

  router.get('/platform-admin/salons', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listSalons(queryOf(req)));
  }));

  router.get('/platform-admin/salons/:id', readLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    res.status(200).json({ salon: await platformAdminService.getSalon(req.params.id) });
  }));

  router.get('/platform-admin/details/:resource/:id', readLimit, asyncRoute(async (req, res) => {
    if (!DETAIL_RESOURCES.has(req.params.resource) || !validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'resource' });
      return;
    }
    res.status(200).json(await platformAdminService.getDetail(req.params.resource, req.params.id));
  }));

  router.patch('/platform-admin/salons/:id/status', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id) || typeof req.body?.active !== 'boolean') {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'active' });
      return;
    }
    const result = await platformAdminService.setSalonActive(
      req.params.id,
      req.body.active,
      req.principal!.platformAdminId!,
    );
    res.status(200).json({ salon: result });
  }));

  router.get('/platform-admin/customers', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listCustomers(queryOf(req)));
  }));

  router.get('/platform-admin/staff', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listStaff(queryOf(req)));
  }));

  router.patch('/platform-admin/staff/:id/status', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id) || typeof req.body?.active !== 'boolean') {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'active' });
      return;
    }
    const result = await platformAdminService.setStaffActive(
      req.params.id,
      req.body.active,
      req.principal!.platformAdminId!,
    );
    res.status(200).json({ staff: result });
  }));

  router.get('/platform-admin/appointments', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listAppointments(queryOf(req)));
  }));

  router.post('/platform-admin/appointments/:id/action', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id) || typeof req.body?.action !== 'string') {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'action' });
      return;
    }
    const action = req.body.action as string;
    let appointment;
    switch (action) {
      case 'approve':
        appointment = await services.bookingFlow.approve(req.params.id);
        break;
      case 'reject':
        appointment = await services.bookingFlow.reject(req.params.id);
        break;
      case 'cancel':
        appointment = await services.cancellationFlow.cancel(req.params.id);
        break;
      case 'no_show':
        appointment = await services.cancellationService.markNoShow(req.params.id);
        break;
      case 'complete':
        appointment = await platformAdminService.completeAppointment(
          req.params.id,
          req.principal!.platformAdminId!,
        );
        break;
      default:
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'action' });
        return;
    }
    if (action !== 'complete') {
      await platformAdminService.recordAudit(
        req.principal!.platformAdminId!,
        `appointment.${action}`,
        'appointment',
        req.params.id,
      );
    }
    res.status(200).json({ appointment });
  }));

  router.get('/platform-admin/subscriptions', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listSubscriptions(queryOf(req)));
  }));

  router.get('/platform-admin/payments', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listPayments(queryOf(req)));
  }));

  router.get('/platform-admin/waitlist', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listWaitlist(queryOf(req)));
  }));

  router.get('/platform-admin/qr-scans', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listQrScans(queryOf(req)));
  }));

  router.get('/platform-admin/audit-logs', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listAuditLogs(queryOf(req)));
  }));

  return router;
}
