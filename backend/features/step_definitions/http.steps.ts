import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BackendWorld } from '../bootstrap/custom.world';

const ROUTE_RE = /router\.(get|post|patch|put|delete)\s*\(\s*['"]([^'"]+)['"]/g;
const FAKE_ID = '00000000-0000-0000-0000-000000000000';

function sourceRoutes(): Set<string> {
  const routes = new Set<string>();
  const sourceRoot = join(process.cwd(), 'src');
  const controllerFiles: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.controller.ts')) controllerFiles.push(fullPath);
    }
  };
  visit(sourceRoot);
  for (const file of controllerFiles) {
    const source = readFileSync(file, 'utf8');
    let match: RegExpExecArray | null;
    while ((match = ROUTE_RE.exec(source))) {
      routes.add(`${match[1].toUpperCase()} ${match[2]}`);
    }
  }
  return routes;
}

function isAppointmentMutation(template: string): boolean {
  return [
    '/appointments/:id/cancel',
    '/appointments/:id/reschedule',
    '/appointments/:id/approve',
    '/appointments/:id/reject',
    '/appointments/:id/reschedule-managed',
  ].includes(template);
}

function idForTemplate(world: BackendWorld, template: string): string {
  if (template.startsWith('/platform-admin/details/')) return world.vars.salonId ?? FAKE_ID;
  if (template.startsWith('/platform-admin/appointments/'))
    return world.vars.appointmentId ?? FAKE_ID;
  if (template.startsWith('/platform-admin/staff/')) return world.vars.stylistId ?? FAKE_ID;
  if (template.startsWith('/platform-admin/salons/')) return world.vars.salonId ?? FAKE_ID;
  if (template.startsWith('/appointments/')) {
    return isAppointmentMutation(template) ? FAKE_ID : (world.vars.appointmentId ?? FAKE_ID);
  }
  if (template.startsWith('/staff/')) return world.vars.stylistId ?? FAKE_ID;
  if (template.startsWith('/salons/')) return world.vars.salonId ?? FAKE_ID;
  if (template.includes('/:id')) return world.vars.salonId ?? FAKE_ID;
  return FAKE_ID;
}

function concretePath(world: BackendWorld, template: string): string {
  return template.replace(/:([A-Za-z]+)/g, (_match, name: string) => {
    if (name === 'id') return idForTemplate(world, template);
    if (name === 'customerId') return world.vars.customerId ?? FAKE_ID;
    if (name === 'serviceId') return world.vars.serviceId ?? FAKE_ID;
    if (name === 'staffId') return world.vars.stylistId ?? FAKE_ID;
    if (name === 'holidayId') return world.vars.holidayId ?? FAKE_ID;
    if (name === 'blockId') return world.vars.blockId ?? FAKE_ID;
    if (name === 'chairId') return world.vars.chairId ?? FAKE_ID;
    if (name === 'resource') return 'salons';
    if (name === 'token') return world.vars.referralToken ?? 'not-a-token';
    if (name === 'payload') return 'not-a-valid-payload';
    if (name === 'secret') return 'controller-secret';
    return FAKE_ID;
  });
}

function appendQuery(world: BackendWorld, template: string, path: string): string {
  const params = new URLSearchParams();
  if (template === '/register/check-phone')
    params.set('phone', world.vars.ownerPhone ?? '09120000000');
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
  )
    return undefined;
  if (template.startsWith('/platform-admin/')) return 'platform';
  if (
    template.startsWith('/customers/me/') ||
    template === '/waitlist/:id' ||
    template === '/devices/token'
  ) {
    return 'customer';
  }
  if (template === '/referrals' || template === '/customers/me/referrals') return 'customer';
  if (template === '/appointments' || template === '/payments/initiate') return 'customer';
  return 'owner';
}

function bodyForRoute(world: BackendWorld, method: string, template: string): unknown {
  if (method === 'GET' || method === 'DELETE') return undefined;
  if (template === '/auth/otp/request') return { phone: world.vars.ownerPhone };
  if (template === '/auth/otp/verify') return {};
  if (template === '/auth/refresh') return {};
  if (template === '/salons/:id/scan') return { source: 'backend-controller-suite' };
  if (template === '/appointments') return {};
  if (template === '/salons/:id/appointments/manual') return {};
  if (
    template === '/appointments/:id/reschedule' ||
    template === '/appointments/:id/reschedule-managed'
  )
    return { startAt: `${world.vars.date ?? '2030-01-01'}T11:00:00.000Z` };
  if (template === '/appointments/:id/customer-notes' || template === '/appointments/:id/message')
    return template.endsWith('customer-notes')
      ? { body: 'Controller customer note' }
      : { message: 'Controller customer message' };
  if (template === '/appointments/:id/approve' || template === '/appointments/:id/reject')
    return {};
  if (template === '/appointments/:id/no-show' || template === '/appointments/:id/cancel')
    return {};
  if (template === '/salons/:id/clients')
    return method === 'POST'
      ? { fullName: 'Controller client', phone: '09121112233' }
      : {};
  if (template === '/salons/:id/sms-settings')
    return method === 'PATCH' ? { ownerBooking: true } : {};
  if (template === '/salons/:id/staff')
    return method === 'POST'
      ? { fullName: 'Controller new stylist', role: 'Stylist', phone: '09123334455' }
      : {};
  if (template === '/staff/:id') return { fullName: 'Controller updated stylist' };
  if (
    template === '/salons/:id/working-hours' ||
    template === '/salons/:id/staff/:staffId/working-hours'
  ) {
    return method === 'PUT'
      ? { hours: [{ weekday: 1, startTime: '09:00', endTime: '20:00' }] }
      : {};
  }
  if (template === '/salons/:id/booking-policy') return { bookingWindowDays: 14 };
  if (template === '/salons/:id/chairs') return { name: 'Controller chair' };
  if (template.includes('/chairs/:chairId')) return { active: true };
  if (template === '/salons/:id/services')
    return { name: 'Controller service', durationMinutes: 30, priceRial: 100000 };
  if (template === '/salons/:id/services/:serviceId') return { name: 'Controller service updated' };
  if (template === '/salons/:id/services/:serviceId/staff')
    return { staffIds: [world.vars.stylistId] };
  if (template === '/salons/:id/auto-approve') return { autoApprove: false };
  if (template === '/staff/:id/auto-approve') return { autoApprove: null };
  if (template === '/staff/:id/approve-own') return { allowed: true };
  if (template === '/salons/:id/brand-accent') return { brandAccent: 'teal' };
  if (template === '/salons/:id/holidays')
    return { onDate: world.vars.date, toDate: world.vars.laterDate };
  if (template === '/salons/:id/emergency-close') return { onDate: world.vars.laterDate };
  if (template === '/staff/:staffId/availability-blocks')
    return { onDate: world.vars.date, toDate: world.vars.laterDate };
  if (template === '/staff/:id/manage-availability') return { allowed: true };
  if (template === '/referrals')
    return {
      salonName: `Controller referral ${Date.now()}`,
      city: 'Tehran',
      salonPhone: world.vars.ownerPhone,
    };
  if (template === '/referrals/:id/redeem') return {};
  if (template === '/salons/:id/waitlist') {
    const start = `${world.vars.date ?? '2030-01-01'}T09:00:00.000Z`;
    const end = `${world.vars.date ?? '2030-01-01'}T10:00:00.000Z`;
    return { serviceId: world.vars.serviceId, windowStart: start, windowEnd: end };
  }
  if (template === '/devices/token')
    return { token: `controller-device-${Date.now()}`, platform: 'web' };
  if (template === '/customers/me/profile') return { fullName: 'Controller customer' };
  if (template === '/card-orders' || template.endsWith('/card-orders')) {
    return {
      template: 'salon-qr-card',
      quantity: 10,
      contactName: 'Controller Owner',
      phone: world.vars.ownerPhone,
      address: 'Tehran, Controller Street 1',
    };
  }
  if (template === '/payments/initiate')
    return { appointmentId: world.vars.appointmentId };
  if (template === '/payments/callback')
    return {
      authority: world.vars.paymentAuthority,
      status: 'OK',
      appointmentId: world.vars.appointmentId,
    };
  if (template === '/subscription/purchase')
    return { salonId: world.vars.salonId, plan: 'monthly' };
  if (
    template === '/platform-admin/salons/:id/status' ||
    template === '/platform-admin/staff/:id/status'
  )
    return { active: true };
  if (template === '/platform-admin/appointments/:id/action') return { action: 'approve' };
  if (template.startsWith('/bots/') || template === '/register/salon') return {};
  return {};
}

async function createControllerFixture(
  world: BackendWorld,
  withAppointment: boolean,
  withHeldAppointment = false,
): Promise<void> {
  await world.registerSalon('fixed_salon', 'Controller');
  await world.createCustomer('customer');
  await world.createStaff('stylist', 'Stylist');

  const service = await world.rawRequest('GET', '/api/salons/{{salonId}}/services');
  const serviceId = service.body?.services?.[0]?.id;
  if (!serviceId)
    throw new Error(`Controller fixture service was not created: ${JSON.stringify(service.body)}`);
  world.vars.serviceId = String(serviceId);
  if (withHeldAppointment) {
    const app = await world.ensureApp();
    await app.prisma.service.update({
      where: { id: world.vars.serviceId },
      data: { requiresDeposit: true, depositRial: 100000 },
    });
    // The development deposit flow uses card transfer by default. Configure
    // the fixture's destination card so creating the held appointment and
    // exercising /payments/initiate represent a valid payable booking.
    await app.prisma.salon.update({
      where: { id: world.vars.salonId },
      data: {
        depositMethod: 'card_transfer',
        depositCardNumber: '6037991234567890',
        depositCardHolder: 'کنترل تست',
        depositBankName: 'بانک تست',
      },
    });
  }

  const me = await world.rawRequest('GET', '/api/me', undefined, 'customer');
  if (!me.body?.principal?.id)
    throw new Error(`Controller fixture customer was not created: ${JSON.stringify(me.body)}`);
  world.vars.customerId = String(me.body.principal.id);
  if (withAppointment || withHeldAppointment) await world.bookAvailable('salon', 'customer');
  await world.createPlatformAdmin('platform');
  world.activeActor = 'owner';
}

async function exercise(world: BackendWorld, method: string, template: string): Promise<void> {
  if (template === '/appointments/:id/no-show') {
    const approved = await world.rawRequest(
      'POST',
      '/api/appointments/{{appointmentId}}/approve',
      undefined,
      'owner',
    );
    if (![200, 409].includes(approved.status)) {
      throw new Error(
        `Controller fixture approval failed: ${approved.status} ${JSON.stringify(approved.body)}`,
      );
    }
  }

  let concrete = concretePath(world, template);
  if (
    template === '/appointments/:id/reschedule-managed' ||
    template === '/appointments/:id/customer' ||
    template === '/appointments/:id/customer-notes' ||
    template === '/appointments/:id/message' ||
    (method === 'PATCH' && template === '/appointments/:id/reschedule')
  ) {
    concrete = template.replace(':id', world.vars.appointmentId ?? FAKE_ID);
  }
  const path = appendQuery(world, template, concrete);
  const actor = actorForRoute(template);
  let body = bodyForRoute(world, method, template);

  // The generic endpoint matrix intentionally sends one request per route. Add
  // the authenticated success paths for auth contracts so c8 also observes
  // token issuance and refresh, not only their validation guards.
  if (template === '/auth/otp/verify') {
    const otp = await world.rawRequest(
      'POST',
      '/api/auth/otp/request',
      { phone: world.vars.ownerPhone },
    );
    body = { phone: world.vars.ownerPhone, code: otp.body?.devOtp };
  } else if (template === '/auth/refresh') {
    body = { refreshToken: world.actors.get('owner')?.refreshToken };
  }

  // DELETE /waitlist/:id needs a real customer-owned entry to reach its success
  // branch; the shared fixture otherwise has only the 404 path.
  if (template === '/waitlist/:id' && !world.vars.waitlistId) {
    const start = `${world.vars.date ?? '2030-01-01'}T09:00:00.000Z`;
    const end = `${world.vars.date ?? '2030-01-01'}T10:00:00.000Z`;
    const joined = await world.rawRequest(
      'POST',
      '/api/salons/{{salonId}}/waitlist',
      { serviceId: world.vars.serviceId, windowStart: start, windowEnd: end },
      'customer',
    );
    if (joined.body?.waitlist?.id) world.vars.waitlistId = String(joined.body.waitlist.id);
  }
  const response = await world.rawRequest(
    method,
    template === '/healthz' ? path : `/api${path}`,
    body,
    actor,
  );

  if (template === '/salons/:id/holidays' && response.body?.holiday?.id)
    world.vars.holidayId = String(response.body.holiday.id);
  if (template === '/salons/:id/services' && response.body?.service?.id)
    world.vars.serviceId = String(response.body.service.id);
  if (template === '/salons/:id/chairs') {
    const chair = response.body?.chair ?? response.body?.chairs?.[0];
    if (chair?.id) world.vars.chairId = String(chair.id);
  }
  if (template === '/staff/:staffId/availability-blocks' && response.body?.block?.id)
    world.vars.blockId = String(response.body.block.id);
  if (template === '/salons/:id/waitlist' && response.body?.waitlist?.id)
    world.vars.waitlistId = String(response.body.waitlist.id);
  if (template === '/payments/initiate') {
    const redirectUrl = response.body?.redirectUrl;
    if (typeof redirectUrl === 'string') {
      const query = redirectUrl.split('?')[1] ?? '';
      const authority = new URLSearchParams(query).get('Authority');
      if (authority) world.vars.paymentAuthority = authority;
    }
  }
  if (template === '/referrals' && response.body?.referral?.id) {
    world.vars.referralId = String(response.body.referral.id);
    if (response.body.referral.claimToken)
      world.vars.referralToken = String(response.body.referral.claimToken);
  }

  if (response.status >= 500) {
    throw new Error(
      `${method} ${template} returned ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }

  // Exercise the opposite webhook-secret branch after the valid request.
  if (template.startsWith('/bots/')) {
    const platform = template.includes('/bale/') ? 'bale' : 'telegram';
    await world.rawRequest('POST', `/api/bots/${platform}/wrong-secret`, {}, undefined);
  }

  // Exercise invalid payload branches for the small transport-only contracts.
  if (template === '/salons/:id/card-orders') {
    await world.rawRequest('POST', `/api${path}`, {}, actor);
  }
  if (template === '/customers/me/profile' && method === 'PATCH') {
    await world.rawRequest('PATCH', `/api${path}`, { fullName: '' }, actor);
  }

  // Duplicate owner phone exercises the route's Prisma P2002 mapping.
  if (template === '/salons/:id/staff' && method === 'POST') {
    await world.rawRequest(
      'POST',
      `/api${path}`,
      { fullName: 'Duplicate phone branch', role: 'Stylist', phone: world.vars.ownerPhone },
      actor,
    );
  }

  // Duplicate registration phone exercises the public registration P2002
  // mapping after the fixture has already created the owner staff row.
  if (template === '/register/salon' && method === 'POST') {
    await world.rawRequest('POST', '/api/register/salon', {
      salonName: 'Duplicate controller registration',
      ownerName: 'Duplicate owner',
      phone: world.vars.ownerPhone,
      businessType: 'hair',
      workMode: 'fixed_salon',
      chairCount: 1,
      services: [{ name: 'Duplicate service', durationMinutes: 30, priceRial: 100000 }],
    });
  }
}

Given('I have a running application', async function (this: BackendWorld) {
  await this.ensureApp();
});

Given('I have a controller fixture', async function (this: BackendWorld) {
  await createControllerFixture(this, false);
});

Given('I have a controller fixture with an appointment', async function (this: BackendWorld) {
  await createControllerFixture(this, true);
});

Given('I have a controller fixture with a held appointment', async function (this: BackendWorld) {
  await createControllerFixture(this, false, true);
});

When(
  'I exercise controller endpoint {string}',
  async function (this: BackendWorld, endpoint: string) {
    const match = endpoint.match(/^(GET|POST|PATCH|PUT|DELETE)\s+(.+)$/i);
    if (!match) throw new Error(`Invalid controller endpoint '${endpoint}'`);
    const method = match[1].toUpperCase();
    const template = match[2];
    const key = `${method} ${template}`;
    if (!sourceRoutes().has(key))
      throw new Error(`Controller endpoint is not present in backend: ${key}`);
    await exercise(this, method, template);
    this.controllerCovered.add(key);
  },
);

When(
  'I make a {string} request to {string}',
  async function (this: BackendWorld, method: string, path: string) {
    await this.rawRequest(method, path);
  },
);

When(
  'I set the request header {string} to {string}',
  function (this: BackendWorld, header: string, value: string) {
    this.requestHeaders[header] = value;
  },
);

Then('the response status should be {int}', function (this: BackendWorld, status: number) {
  assert.equal(this.lastResponse?.status, status);
});

Then(
  'the response should contain the field {string}',
  function (this: BackendWorld, field: string) {
    assert.ok(this.lastResponse, 'No response received');
    const value = field
      .split('.')
      .reduce<any>((current, part) => current?.[part], this.lastResponse.body);
    assert.notEqual(value, undefined, `Field '${field}' not found`);
  },
);

Then('this controller feature should have completed', function (this: BackendWorld) {
  assert.ok(
    this.controllerCovered.size > 0,
    'Controller scenario did not send any endpoint request',
  );
});
