import { Router, type Request } from 'express';
import type { Services } from '../../http/app.js';
import { asyncRoute } from '../../common/http/route-helpers.js';
import { createRateLimit, principalOrIpRateLimitKey } from '../../http/middleware/rate-limit.js';
import type { PlatformListQuery, PlatformAdminService } from '../../platform-admin/services/index.js';
import { makePlatformAdminGuard } from '../../http/middleware/platform-admin.js';

// Prisma stores UUID-shaped ids; development fixtures intentionally use
// deterministic UUIDs whose version/variant nibbles are not RFC-conformant.
// Validate shape without rejecting those legitimate local records.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

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
  'services',
  'chairs',
  'equipment',
  'platform-admins',
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

  router.post('/platform-admin/salons', mutationLimit, asyncRoute(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const salonName = typeof body.salonName === 'string' ? body.salonName.trim() : '';
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!salonName || !ownerName || !phone) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: !salonName ? 'salonName' : !ownerName ? 'ownerName' : 'phone' });
      return;
    }
    try {
      const { salon } = await services.salonRegistration.registerSalon({
        salonName,
        ownerName,
        phone,
        timezone: typeof body.timezone === 'string' ? body.timezone.trim() || undefined : undefined,
        businessType: typeof body.businessType === 'string' ? body.businessType.trim() || undefined : undefined,
        workMode: typeof body.workMode === 'string' ? body.workMode as any : undefined,
      });
      await services.subscriptionService.startTrial(salon.id);
      await platformAdminService.recordAudit(req.principal!.platformAdminId!, 'salon.create', 'salon', salon.id, { ownerName, phone });
      res.status(201).json({ salon: { id: salon.id, name: salon.name, active: salon.active } });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ code: 'PHONE_TAKEN', field: 'phone' });
        return;
      }
      throw err;
    }
  }));

  router.get('/platform-admin/salons/:id', readLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    res.status(200).json({ salon: await platformAdminService.getSalon(req.params.id) });
  }));

  router.patch('/platform-admin/salons/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch = {
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.timezone === 'string' ? { timezone: body.timezone } : {}),
      ...(body.businessType === null || typeof body.businessType === 'string' ? { businessType: body.businessType as string | null } : {}),
      ...(body.brandAccent === null || typeof body.brandAccent === 'string' ? { brandAccent: body.brandAccent as string | null } : {}),
      ...(typeof body.workMode === 'string' ? { workMode: body.workMode } : {}),
      ...(typeof body.autoApprove === 'boolean' ? { autoApprove: body.autoApprove } : {}),
      ...(typeof body.bookingWindowDays === 'number' ? { bookingWindowDays: body.bookingWindowDays } : {}),
      ...(typeof body.bookingStartOffsetDays === 'number' ? { bookingStartOffsetDays: body.bookingStartOffsetDays } : {}),
      ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
    };
    if (!Object.keys(patch).length) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    res.status(200).json({ salon: await platformAdminService.updateSalon(req.params.id, patch, req.principal!.platformAdminId!) });
  }));

  router.delete('/platform-admin/salons/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    res.status(200).json({ salon: await platformAdminService.archiveSalon(req.params.id, req.principal!.platformAdminId!) });
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

  router.post('/platform-admin/customers', mutationLimit, asyncRoute(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.phone !== 'string' || !body.phone.trim()) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'phone' });
      return;
    }
    try {
      const customer = await platformAdminService.createCustomer({
        phone: body.phone,
        fullName: body.fullName === null || typeof body.fullName === 'string' ? body.fullName : undefined,
      }, req.principal!.platformAdminId!);
      res.status(201).json({ customer });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ code: 'PHONE_TAKEN', field: 'phone' });
        return;
      }
      throw err;
    }
  }));

  router.patch('/platform-admin/customers/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch = {
      ...(typeof body.phone === 'string' ? { phone: body.phone } : {}),
      ...(body.fullName === null || typeof body.fullName === 'string' ? { fullName: body.fullName as string | null } : {}),
    };
    if (!Object.keys(patch).length) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    try {
      res.status(200).json({ customer: await platformAdminService.updateCustomer(req.params.id, patch, req.principal!.platformAdminId!) });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ code: 'PHONE_TAKEN', field: 'phone' });
        return;
      }
      throw err;
    }
  }));

  router.patch('/platform-admin/customers/:id/status', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id) || typeof req.body?.active !== 'boolean') {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'active' });
      return;
    }
    res.status(200).json({ customer: await platformAdminService.setCustomerActive(req.params.id, req.body.active, req.principal!.platformAdminId!) });
  }));

  router.delete('/platform-admin/customers/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    res.status(200).json({ customer: await platformAdminService.deleteCustomer(req.params.id, req.principal!.platformAdminId!) });
  }));

  router.get('/platform-admin/staff', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listStaff(queryOf(req)));
  }));

  router.post('/platform-admin/staff', mutationLimit, asyncRoute(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.salonId !== 'string' || typeof body.fullName !== 'string' || typeof body.role !== 'string') {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    try {
      const staff = await platformAdminService.createStaff({
        salonId: body.salonId,
        fullName: body.fullName,
        role: body.role,
        phone: body.phone === null || typeof body.phone === 'string' ? body.phone : undefined,
      }, req.principal!.platformAdminId!);
      res.status(201).json({ staff });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ code: 'PHONE_TAKEN', field: 'phone' });
        return;
      }
      throw err;
    }
  }));

  router.patch('/platform-admin/staff/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch = {
      ...(typeof body.fullName === 'string' ? { fullName: body.fullName } : {}),
      ...(typeof body.role === 'string' ? { role: body.role } : {}),
      ...(body.phone === null || typeof body.phone === 'string' ? { phone: body.phone as string | null } : {}),
      ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
    };
    if (!Object.keys(patch).length) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    try {
      res.status(200).json({ staff: await platformAdminService.updateStaff(req.params.id, patch, req.principal!.platformAdminId!) });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ code: 'PHONE_TAKEN', field: 'phone' });
        return;
      }
      throw err;
    }
  }));

  router.delete('/platform-admin/staff/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    res.status(200).json({ staff: await platformAdminService.deleteStaff(req.params.id, req.principal!.platformAdminId!) });
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

  router.get('/platform-admin/platform-admins', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listPlatformAdmins(queryOf(req)));
  }));

  router.post('/platform-admin/platform-admins', mutationLimit, asyncRoute(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.phone !== 'string' || typeof body.fullName !== 'string') {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    try {
      const admin = await platformAdminService.createPlatformAdmin({
        phone: body.phone,
        fullName: body.fullName,
        role: typeof body.role === 'string' ? body.role : undefined,
        active: typeof body.active === 'boolean' ? body.active : undefined,
      }, req.principal!.platformAdminId!);
      res.status(201).json({ admin });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ code: 'PHONE_TAKEN', field: 'phone' });
        return;
      }
      throw err;
    }
  }));

  router.patch('/platform-admin/platform-admins/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch = {
      ...(typeof body.phone === 'string' ? { phone: body.phone } : {}),
      ...(typeof body.fullName === 'string' ? { fullName: body.fullName } : {}),
      ...(typeof body.role === 'string' ? { role: body.role } : {}),
      ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
    };
    if (!Object.keys(patch).length) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    try {
      res.status(200).json({ admin: await platformAdminService.updatePlatformAdmin(req.params.id, patch, req.principal!.platformAdminId!) });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ code: 'PHONE_TAKEN', field: 'phone' });
        return;
      }
      throw err;
    }
  }));

  router.delete('/platform-admin/platform-admins/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    res.status(200).json({ admin: await platformAdminService.deletePlatformAdmin(req.params.id, req.principal!.platformAdminId!) });
  }));

  router.get('/platform-admin/services', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listServices(queryOf(req)));
  }));

  router.post('/platform-admin/services', mutationLimit, asyncRoute(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.salonId !== 'string' || typeof body.name !== 'string' || typeof body.durationMinutes !== 'number') {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    res.status(201).json({ service: await platformAdminService.createService({
      salonId: body.salonId,
      name: body.name,
      durationMinutes: body.durationMinutes,
      durationMode: typeof body.durationMode === 'string' ? body.durationMode : undefined,
      minDurationMinutes: typeof body.minDurationMinutes === 'number' || body.minDurationMinutes === null ? body.minDurationMinutes : undefined,
      maxDurationMinutes: typeof body.maxDurationMinutes === 'number' || body.maxDurationMinutes === null ? body.maxDurationMinutes : undefined,
      bufferMinutes: typeof body.bufferMinutes === 'number' ? body.bufferMinutes : undefined,
      priceRial: typeof body.priceRial === 'number' ? body.priceRial : undefined,
      requiresDeposit: typeof body.requiresDeposit === 'boolean' ? body.requiresDeposit : undefined,
      depositRial: typeof body.depositRial === 'number' || body.depositRial === null ? body.depositRial : undefined,
      depositType: typeof body.depositType === 'string' ? body.depositType : undefined,
      depositPercent: typeof body.depositPercent === 'number' || body.depositPercent === null ? body.depositPercent : undefined,
    }, req.principal!.platformAdminId!) });
  }));

  router.patch('/platform-admin/services/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch = {
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.durationMinutes === 'number' ? { durationMinutes: body.durationMinutes } : {}),
      ...(typeof body.durationMode === 'string' ? { durationMode: body.durationMode } : {}),
      ...(typeof body.minDurationMinutes === 'number' || body.minDurationMinutes === null ? { minDurationMinutes: body.minDurationMinutes } : {}),
      ...(typeof body.maxDurationMinutes === 'number' || body.maxDurationMinutes === null ? { maxDurationMinutes: body.maxDurationMinutes } : {}),
      ...(typeof body.bufferMinutes === 'number' ? { bufferMinutes: body.bufferMinutes } : {}),
      ...(typeof body.priceRial === 'number' ? { priceRial: body.priceRial } : {}),
      ...(typeof body.requiresDeposit === 'boolean' ? { requiresDeposit: body.requiresDeposit } : {}),
      ...(typeof body.depositRial === 'number' || body.depositRial === null ? { depositRial: body.depositRial } : {}),
      ...(typeof body.depositType === 'string' ? { depositType: body.depositType } : {}),
      ...(typeof body.depositPercent === 'number' || body.depositPercent === null ? { depositPercent: body.depositPercent } : {}),
      ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
    };
    if (!Object.keys(patch).length) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    res.status(200).json({ service: await platformAdminService.updateService(req.params.id, patch, req.principal!.platformAdminId!) });
  }));

  router.delete('/platform-admin/services/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    res.status(200).json({ service: await platformAdminService.deleteService(req.params.id, req.principal!.platformAdminId!) });
  }));

  router.get('/platform-admin/chairs', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listChairs(queryOf(req)));
  }));

  router.post('/platform-admin/chairs', mutationLimit, asyncRoute(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.salonId !== 'string' || typeof body.name !== 'string') {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    res.status(201).json({ chair: await platformAdminService.createChair({ salonId: body.salonId, name: body.name, kind: typeof body.kind === 'string' ? body.kind : undefined }, req.principal!.platformAdminId!) });
  }));

  router.patch('/platform-admin/chairs/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch = {
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
    };
    if (!Object.keys(patch).length) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    res.status(200).json({ chair: await platformAdminService.updateChair(req.params.id, patch, req.principal!.platformAdminId!) });
  }));

  router.delete('/platform-admin/chairs/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    res.status(200).json({ chair: await platformAdminService.deleteChair(req.params.id, req.principal!.platformAdminId!) });
  }));

  router.get('/platform-admin/equipment', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listEquipment(queryOf(req)));
  }));

  router.post('/platform-admin/equipment', mutationLimit, asyncRoute(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.salonId !== 'string' || typeof body.name !== 'string') {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    res.status(201).json({ equipment: await platformAdminService.createEquipment({ salonId: body.salonId, name: body.name }, req.principal!.platformAdminId!) });
  }));

  router.patch('/platform-admin/equipment/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch = {
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
    };
    if (!Object.keys(patch).length) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    res.status(200).json({ equipment: await platformAdminService.updateEquipment(req.params.id, patch, req.principal!.platformAdminId!) });
  }));

  router.delete('/platform-admin/equipment/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    res.status(200).json({ equipment: await platformAdminService.deleteEquipment(req.params.id, req.principal!.platformAdminId!) });
  }));

  router.get('/platform-admin/appointments', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listAppointments(queryOf(req)));
  }));

  router.post('/platform-admin/appointments', mutationLimit, asyncRoute(async (req, res) => {
    if (!services.appointmentManagementService) {
      res.status(503).json({ code: 'INTERNAL' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.salonId !== 'string' || typeof body.serviceId !== 'string' || typeof body.startAt !== 'string' || typeof body.phone !== 'string') {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    const result = await services.appointmentManagementService.createWalkIn({
      salonId: body.salonId,
      serviceId: body.serviceId,
      startAt: body.startAt,
      customerPhone: body.phone,
      customerName: typeof body.fullName === 'string' ? body.fullName : undefined,
      preferredStaffId: typeof body.preferredStaffId === 'string' ? body.preferredStaffId : undefined,
      locationType: body.locationType === 'customer' ? 'customer' : 'salon',
      locationAddress: typeof body.locationAddress === 'string' ? body.locationAddress : undefined,
      customerNote: typeof body.customerNote === 'string' ? body.customerNote : undefined,
      durationMinutes: typeof body.durationMinutes === 'number' ? body.durationMinutes : undefined,
    });
    if (result.status === 'rejected') {
      res.status(409).json({ code: result.reason === 'slot_unavailable' ? 'BOOKING_SLOT_UNAVAILABLE' : 'BOOKING_NO_AVAILABILITY' });
      return;
    }
    await platformAdminService.recordAudit(req.principal!.platformAdminId!, 'appointment.create', 'appointment', result.appointment.id, { salonId: body.salonId, source: 'walkin' });
    res.status(201).json({ status: result.status, appointment: result.appointment });
  }));

  router.patch('/platform-admin/appointments/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch = {
      ...(body.customerNote === null || typeof body.customerNote === 'string' ? { customerNote: body.customerNote as string | null } : {}),
      ...(typeof body.locationType === 'string' ? { locationType: body.locationType } : {}),
      ...(body.locationAddress === null || typeof body.locationAddress === 'string' ? { locationAddress: body.locationAddress as string | null } : {}),
    };
    if (!Object.keys(patch).length) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    res.status(200).json({ appointment: await platformAdminService.updateAppointment(req.params.id, patch, req.principal!.platformAdminId!) });
  }));

  router.delete('/platform-admin/appointments/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    const appointment = await services.cancellationFlow.cancel(req.params.id);
    await platformAdminService.recordAudit(req.principal!.platformAdminId!, 'appointment.delete', 'appointment', req.params.id, { softDelete: true });
    res.status(200).json({ appointment });
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

  router.patch('/platform-admin/subscriptions/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const parseDate = (field: string): Date | null | undefined => {
      if (body[field] === undefined) return undefined;
      if (body[field] === null && field === 'graceUntil') return null;
      if (typeof body[field] !== 'string') return null;
      const value = new Date(body[field] as string);
      return Number.isNaN(value.getTime()) ? null : value;
    };
    const expiresAt = parseDate('expiresAt');
    const graceUntil = parseDate('graceUntil');
    if (body.expiresAt !== undefined && !(expiresAt instanceof Date)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'expiresAt' });
      return;
    }
    if (body.graceUntil !== undefined && body.graceUntil !== null && !(graceUntil instanceof Date)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'graceUntil' });
      return;
    }
    const patch = {
      ...(typeof body.status === 'string' ? { status: body.status } : {}),
      ...(typeof body.planKind === 'string' ? { planKind: body.planKind } : {}),
      ...(expiresAt instanceof Date ? { expiresAt } : {}),
      ...(body.graceUntil !== undefined ? { graceUntil: graceUntil as Date | null } : {}),
    };
    if (!Object.keys(patch).length) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    res.status(200).json({ subscription: await platformAdminService.updateSubscription(req.params.id, patch, req.principal!.platformAdminId!) });
  }));

  router.delete('/platform-admin/subscriptions/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    res.status(200).json({ subscription: await platformAdminService.deleteSubscription(req.params.id, req.principal!.platformAdminId!) });
  }));

  router.get('/platform-admin/payments', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listPayments(queryOf(req)));
  }));

  router.patch('/platform-admin/payments/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id) || !['appointment', 'subscription'].includes(req.body?.kind) || typeof req.body?.status !== 'string') {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'kind' });
      return;
    }
    res.status(200).json({ payment: await platformAdminService.updatePayment(req.params.id, req.body.kind, req.body.status, req.principal!.platformAdminId!) });
  }));

  router.get('/platform-admin/waitlist', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listWaitlist(queryOf(req)));
  }));

  router.patch('/platform-admin/waitlist/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const parseDate = (value: unknown): Date | undefined => {
      if (typeof value !== 'string') return undefined;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? undefined : date;
    };
    const windowStart = body.windowStart === undefined ? undefined : parseDate(body.windowStart);
    const windowEnd = body.windowEnd === undefined ? undefined : parseDate(body.windowEnd);
    if ((body.windowStart !== undefined && !windowStart) || (body.windowEnd !== undefined && !windowEnd)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'windowStart' });
      return;
    }
    const patch = {
      ...(typeof body.status === 'string' ? { status: body.status } : {}),
      ...(windowStart ? { windowStart } : {}),
      ...(windowEnd ? { windowEnd } : {}),
    };
    if (!Object.keys(patch).length) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'body' });
      return;
    }
    res.status(200).json({ waitlist: await platformAdminService.updateWaitlist(req.params.id, patch, req.principal!.platformAdminId!) });
  }));

  router.delete('/platform-admin/waitlist/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    res.status(200).json({ waitlist: await platformAdminService.deleteWaitlist(req.params.id, req.principal!.platformAdminId!) });
  }));

  router.get('/platform-admin/qr-scans', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listQrScans(queryOf(req)));
  }));

  router.get('/platform-admin/audit-logs', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await platformAdminService.listAuditLogs(queryOf(req)));
  }));

  router.get('/platform-admin/card-orders', readLimit, asyncRoute(async (req, res) => {
    res.status(200).json(await services.cardOrderService.list({
      status: queryOf(req).status,
      page: queryOf(req).page,
      limit: queryOf(req).limit,
    }));
  }));

  router.patch('/platform-admin/card-orders/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id) || typeof req.body?.status !== 'string') {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'status' });
      return;
    }
    const allowed = new Set(['received', 'contacted', 'in_print', 'shipped', 'completed', 'cancelled']);
    if (!allowed.has(req.body.status)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'status' });
      return;
    }
    const order = await services.cardOrderService.updateStatus(
      req.params.id,
      req.body.status,
      req.principal!.platformAdminId!,
      typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 1000) : undefined,
    );
    await platformAdminService.recordAudit(
      req.principal!.platformAdminId!,
      'card-order.status',
      'card_order',
      req.params.id,
      { status: req.body.status },
    );
    res.status(200).json({ order });
  }));

  router.get('/platform-admin/support/tickets', readLimit, asyncRoute(async (req, res) => {
    const query = queryOf(req);
    res.status(200).json(await services.supportTicketService.listAll({
      status: query.status,
      page: query.page,
      limit: query.limit,
    }));
  }));

  router.get('/platform-admin/support/tickets/:id', readLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    const ticket = await services.supportTicketService.get(req.params.id, true);
    if (!ticket) {
      res.status(404).json({ code: 'NOT_FOUND' });
      return;
    }
    res.status(200).json({ ticket });
  }));

  router.patch('/platform-admin/support/tickets/:id', mutationLimit, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'id' });
      return;
    }
    const status = req.body?.status;
    const priority = req.body?.priority;
    if (status !== undefined && !['open', 'triaged', 'in_progress', 'resolved', 'closed'].includes(status)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'status' });
      return;
    }
    if (priority !== undefined && !['low', 'normal', 'high', 'urgent'].includes(priority)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'priority' });
      return;
    }
    const assignedAdminId = req.body?.assignedAdminId;
    if (assignedAdminId !== undefined && assignedAdminId !== null && (typeof assignedAdminId !== 'string' || !validId(assignedAdminId))) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'assignedAdminId' });
      return;
    }
    const ticket = await services.supportTicketService.update(req.params.id, {
      status,
      priority,
      resolution: typeof req.body?.resolution === 'string' ? req.body.resolution.trim().slice(0, 2000) : undefined,
      assignedAdminId: assignedAdminId === null || typeof assignedAdminId === 'string' ? assignedAdminId : undefined,
    });
    await platformAdminService.recordAudit(
      req.principal!.platformAdminId!,
      'support-ticket.update',
      'support_ticket',
      req.params.id,
      { status, priority },
    );
    res.status(200).json({ ticket });
  }));

  return router;
}

export class PlatformAdminController {
  public constructor(
    private readonly services: Services,
    private readonly platformAdminService: PlatformAdminService,
  ) {}

  public router(): Router {
    return platformAdminRouter(this.services, this.platformAdminService);
  }
}
