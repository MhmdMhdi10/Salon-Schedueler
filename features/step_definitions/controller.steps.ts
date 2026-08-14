import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SalonWorld } from '../support/world';

const ROUTE_RE = /router\.(get|post|patch|put|delete)\s*\(\s*['\"]([^'\"]+)['\"]/g;
const FAKE_ID = '00000000-0000-0000-0000-000000000000';

function sourceRoutes(): Set<string> {
  const sourceRoot = join(process.cwd(), 'backend/src');
  const routes = new Set<string>();
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.controller.ts')) {
        const source = readFileSync(fullPath, 'utf8');
        let match: RegExpExecArray | null;
        while ((match = ROUTE_RE.exec(source))) {
          routes.add(`${match[1].toUpperCase()} ${match[2]}`);
        }
        ROUTE_RE.lastIndex = 0;
      }
    }
  };
  visit(sourceRoot);
  return routes;
}

function routeKey(method: string, template: string): string {
  return `${method.toUpperCase()} ${template}`;
}

function isAppointmentMutation(template: string): boolean {
  return (
    template === '/appointments/:id/cancel' ||
    template === '/appointments/:id/reschedule' ||
    template === '/appointments/:id/approve' ||
    template === '/appointments/:id/reject' ||
    template === '/appointments/:id/reschedule-managed'
  );
}

function idForTemplate(world: SalonWorld, template: string): string {
  if (template.includes('/platform-admin/details/')) return world.vars.salonId ?? FAKE_ID;
  if (template.includes('/platform-admin/appointments/')) return world.vars.appointmentId ?? FAKE_ID;
  if (template.includes('/platform-admin/staff/')) return world.vars.stylistId ?? FAKE_ID;
  if (template.includes('/platform-admin/salons/')) return world.vars.salonId ?? FAKE_ID;
  if (template.includes('/appointments/')) {
    return isAppointmentMutation(template) ? FAKE_ID : world.vars.appointmentId ?? FAKE_ID;
  }
  if (template.includes('/customers/:customerId')) return world.vars.customerId ?? FAKE_ID;
  if (template.includes('/services/:serviceId')) return world.vars.serviceId ?? FAKE_ID;
  if (template.includes('/staff/:staffId')) return world.vars.stylistId ?? FAKE_ID;
  if (template.includes('/staff/:id')) return world.vars.stylistId ?? FAKE_ID;
  if (template.includes('/chairs/:chairId')) return FAKE_ID;
  if (template.includes('/holidays/:holidayId')) return world.vars.holidayId ?? FAKE_ID;
  if (template.includes('/availability-blocks/:blockId')) return world.vars.blockId ?? FAKE_ID;
  if (template.includes('/referrals/:id')) return world.vars.referralId ?? FAKE_ID;
  if (template.includes('/waitlist/:id')) return world.vars.waitlistId ?? FAKE_ID;
  if (template.includes('/notifications/:id')) return FAKE_ID;
  if (template.includes('/salons/:id')) return world.vars.salonId ?? FAKE_ID;
  if (template.includes('/:id')) return world.vars.salonId ?? FAKE_ID;
  return FAKE_ID;
}

function concretePath(world: SalonWorld, template: string): string {
  return template.replace(/:([A-Za-z]+)/g, (_match, name: string) => {
    if (name === 'id') return idForTemplate(world, template);
    if (name === 'customerId') return world.vars.customerId ?? FAKE_ID;
    if (name === 'serviceId') return world.vars.serviceId ?? FAKE_ID;
    if (name === 'staffId') return world.vars.stylistId ?? FAKE_ID;
    if (name === 'holidayId') return world.vars.holidayId ?? FAKE_ID;
    if (name === 'blockId') return world.vars.blockId ?? FAKE_ID;
    if (name === 'chairId') return FAKE_ID;
    if (name === 'resource') return 'salons';
    if (name === 'token') return world.vars.referralToken ?? 'not-a-token';
    if (name === 'payload') return 'not-a-valid-payload';
    if (name === 'secret') return 'not-the-secret';
    return FAKE_ID;
  });
}

function appendQuery(world: SalonWorld, template: string, path: string): string {
  const params = new URLSearchParams();
  if (template === '/register/check-phone') params.set('phone', world.vars.ownerPhone ?? '09120000000');
  if (template === '/salons/:id/availability') {
    params.set('serviceId', world.vars.serviceId ?? FAKE_ID);
    params.set('date', world.vars.date ?? '2030-01-01');
  }
  if (template.endsWith('/calendar') || template.endsWith('/analytics')) {
    params.set('from', world.vars.date ?? '2030-01-01');
    params.set('to', world.vars.futureDate ?? '2030-01-05');
  }
  if (template.startsWith('/platform-admin/') && !template.includes('/:id/action')) {
    params.set('page', '1');
    params.set('limit', '5');
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function actorForRoute(template: string): string | undefined {
  if (
    template === '/healthz' ||
    template.startsWith('/auth/') ||
    template.startsWith('/register/') ||
    template.startsWith('/salons/by-qr') ||
    template === '/salons/:id/brand' ||
    template === '/salons/:id/stylists' ||
    template === '/salons/:id/booking-policy' ||
    template === '/salons/:id/services' ||
    template === '/salons/:id/availability' ||
    template === '/salons/:id/scan' ||
    template.startsWith('/referrals/claim') ||
    template === '/payments/callback' ||
    template === '/subscriptions/callback' ||
    template.startsWith('/bots/')
  ) {
    return undefined;
  }
  if (template.startsWith('/platform-admin/')) return 'platform';
  if (template.startsWith('/customers/me/') || template === '/waitlist/:id' || template === '/devices/token') {
    return 'customer';
  }
  if (template === '/referrals' || template === '/customers/me/referrals') return 'customer';
  if (template === '/appointments') return 'customer';
  if (template === '/payments/initiate') return 'customer';
  return 'owner';
}

function bodyForRoute(world: SalonWorld, method: string, template: string): unknown {
  if (method === 'GET' || method === 'DELETE') return undefined;
  if (template === '/auth/otp/request') return { phone: world.vars.ownerPhone };
  if (template === '/auth/otp/verify') {
    return world.vars.controllerOtp
      ? { phone: world.vars.ownerPhone, code: world.vars.controllerOtp }
      : {};
  }
  if (template === '/auth/refresh') {
    return world.vars.controllerRefreshToken ? { refreshToken: world.vars.controllerRefreshToken } : {};
  }
  if (template === '/salons/:id/scan') return { source: 'controller-suite' };
  if (template === '/appointments') return {};
  if (template === '/salons/:id/appointments/manual') return {};
  if (template === '/appointments/:id/reschedule') return {};
  if (template === '/appointments/:id/reschedule-managed') return {};
  if (template === '/appointments/:id/customer-notes') return {};
  if (template === '/appointments/:id/message') return {};
  if (template === '/appointments/:id/approve' || template === '/appointments/:id/reject') return {};
  if (template === '/appointments/:id/no-show' || template === '/appointments/:id/cancel') return {};
  if (template === '/salons/:id/clients') return {};
  if (template === '/salons/:id/sms-settings') {
    return method === 'PATCH' ? { ownerBooking: true } : {};
  }
  if (template === '/salons/:id/staff') return {};
  if (template === '/staff/:id') return { fullName: 'Controller updated stylist' };
  if (template === '/salons/:id/working-hours' || template === '/salons/:id/staff/:staffId/working-hours') {
    return method === 'PUT'
      ? { hours: [{ weekday: 1, startTime: '09:00', endTime: '20:00' }] }
      : {};
  }
  if (template === '/salons/:id/booking-policy') return { bookingWindowDays: 14 };
  if (template === '/salons/:id/chairs') return { name: 'Controller chair' };
  if (template.includes('/chairs/:chairId')) return { active: true };
  if (template === '/salons/:id/services') {
    return { name: 'Controller service', durationMinutes: 30, priceRial: 100000 };
  }
  if (template === '/salons/:id/services/:serviceId') return { name: 'Controller service updated' };
  if (template === '/salons/:id/services/:serviceId/staff') {
    return { staffIds: [world.vars.stylistId] };
  }
  if (template === '/salons/:id/auto-approve') return { autoApprove: false };
  if (template === '/staff/:id/auto-approve') return { autoApprove: null };
  if (template === '/staff/:id/approve-own') return { allowed: true };
  if (template === '/salons/:id/brand-accent') return { brandAccent: 'teal' };
  if (template === '/salons/:id/holidays') return { onDate: world.vars.laterDate };
  if (template === '/salons/:id/emergency-close') return { onDate: world.vars.laterDate };
  if (template === '/staff/:staffId/availability-blocks') return { onDate: world.vars.laterDate };
  if (template === '/staff/:id/manage-availability') return { allowed: true };
  if (template === '/referrals') {
    return { salonName: `Controller referral ${Date.now()}`, city: 'Tehran', salonPhone: world.vars.ownerPhone };
  }
  if (template === '/referrals/:id/redeem') return {};
  if (template === '/salons/:id/waitlist') return {};
  if (template === '/devices/token') return {};
  if (template === '/customers/me/profile') return { fullName: 'Controller customer' };
  if (template === '/card-orders' || template.endsWith('/card-orders')) return {};
  if (template === '/payments/initiate') return {};
  if (template === '/payments/callback') return {};
  if (template === '/subscription/purchase') return {};
  if (template === '/notifications/:id/read') return {};
  if (template === '/platform-admin/salons/:id/status' || template === '/platform-admin/staff/:id/status') {
    return { active: true };
  }
  if (template === '/platform-admin/appointments/:id/action') return { action: 'approve' };
  if (template.startsWith('/bots/')) return {};
  if (template === '/register/salon') return {};
  return {};
}

async function exercise(world: SalonWorld, method: string, template: string): Promise<void> {
  if (template === '/appointments/:id/no-show') {
    // Marking a booking as no-show is a valid state transition, not a lookup
    // smoke test. Approve the fixture appointment first, then send it through
    // the real cancellation service.
    const approved = await world.rawRequest(
      'POST',
      '/api/appointments/{{appointmentId}}/approve',
      undefined,
      'owner',
    );
    if (![200, 409].includes(approved.status)) {
      throw new Error(`Controller fixture approval failed: ${approved.status} ${JSON.stringify(approved.body)}`);
    }
  }
  const path = appendQuery(world, template, concretePath(world, template));
  const actor = actorForRoute(template);
  const response = await world.rawRequest(
    method,
    template === '/healthz' ? path : `/api${path}`,
    bodyForRoute(world, method, template),
    actor,
  );

  if (template === '/auth/otp/request' && typeof response.body?.devOtp === 'string') {
    world.vars.controllerOtp = response.body.devOtp;
  }
  if (template === '/auth/otp/verify' && response.body?.refreshToken) {
    world.vars.controllerRefreshToken = String(response.body.refreshToken);
  }
  if (template === '/salons/:id/holidays' && response.body?.holiday?.id) {
    world.vars.holidayId = String(response.body.holiday.id);
  }
  if (template === '/staff/:staffId/availability-blocks' && response.body?.block?.id) {
    world.vars.blockId = String(response.body.block.id);
  }
  if (template === '/salons/:id/waitlist' && response.body?.waitlist?.id) {
    world.vars.waitlistId = String(response.body.waitlist.id);
  }
  if (template === '/referrals' && response.body?.referral?.id) {
    world.vars.referralId = String(response.body.referral.id);
    if (response.body.referral.claimToken) world.vars.referralToken = String(response.body.referral.claimToken);
  }

  if (response.status >= 500) {
    throw new Error(
      `${routeKey(method, template)} returned ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
}

async function createControllerFixture(world: SalonWorld, withAppointment: boolean): Promise<void> {
  await world.registerSalon('fixed_salon', 'Controller');
  await world.createCustomer('customer');
  await world.createStaff('stylist', 'Stylist');
  const service = await world.rawRequest('GET', '/api/salons/{{salonId}}/services');
  const serviceId = service.body?.services?.[0]?.id;
  if (!serviceId) throw new Error(`Controller fixture service was not created: ${JSON.stringify(service.body)}`);
  world.vars.serviceId = String(serviceId);
  const me = await world.rawRequest('GET', '/api/me', undefined, 'customer');
  if (!me.body?.principal?.id) throw new Error(`Controller fixture customer was not created: ${JSON.stringify(me.body)}`);
  world.vars.customerId = String(me.body.principal.id);
  if (withAppointment) await world.bookAvailable('salon', 'customer');
  await world.createPlatformAdmin('platform');
  world.activeActor = 'owner';
}

Given('I have a controller fixture', async function (this: SalonWorld) {
  await createControllerFixture(this, false);
});

Given('I have a controller fixture with an appointment', async function (this: SalonWorld) {
  await createControllerFixture(this, true);
});

When('I exercise controller endpoint {string}', async function (this: SalonWorld, endpoint: string) {
  const match = endpoint.match(/^(GET|POST|PATCH|PUT|DELETE)\s+(.+)$/i);
  if (!match) throw new Error(`Invalid controller endpoint '${endpoint}'`);
  const method = match[1].toUpperCase();
  const template = match[2];
  const available = sourceRoutes();
  const key = routeKey(method, template);
  if (!available.has(key)) throw new Error(`Controller endpoint is not present in backend: ${key}`);
  await exercise(this, method, template);
  (this as SalonWorld & { controllerCovered?: Set<string> }).controllerCovered ??= new Set<string>();
  (this as SalonWorld & { controllerCovered: Set<string> }).controllerCovered.add(key);
});

Then('this controller feature should have completed', function (this: SalonWorld) {
  const covered = (this as SalonWorld & { controllerCovered?: Set<string> }).controllerCovered ?? new Set<string>();
  expect(covered.size, 'Controller scenario did not send any endpoint request').toBeGreaterThan(0);
});
