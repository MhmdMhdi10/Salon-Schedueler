import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { loginViaUi } from '../../e2e/fixtures';
import { SalonWorld, type Actor } from '../support/world';

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce((current: any, part) => current?.[part], value);
}

function literal(value: string): unknown {
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function actor(world: SalonWorld, name: string): Actor {
  const found = world.actors.get(name);
  if (!found) throw new Error(`Actor '${name}' is not defined`);
  return found;
}

async function send(
  world: SalonWorld,
  method: string,
  endpoint: string,
  body?: unknown,
  actorName?: string,
): Promise<void> {
  await world.rawRequest(method, endpoint, body, actorName);
}

Given('the dev API is healthy', async function (this: SalonWorld) {
  const response = await this.rawRequest('GET', '/healthz');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
});

Given(
  'I have an isolated {string} salon named {string}',
  async function (this: SalonWorld, workMode: string, label: string) {
    await this.registerSalon(workMode, label);
  },
);

Given('I create a customer actor named {string}', async function (this: SalonWorld, name: string) {
  await this.createCustomer(name);
});

Given('I create a platform actor named {string}', async function (this: SalonWorld, name: string) {
  await this.createPlatformAdmin(name);
});

Given(
  'I create a {string} actor named {string}',
  async function (this: SalonWorld, role: string, name: string) {
    if (role !== 'Admin' && role !== 'Stylist') {
      throw new Error(`Only Admin or Stylist staff actors can be created; received '${role}'`);
    }
    await this.createStaff(name, role);
  },
);

Given(
  'I create an {string} actor named {string}',
  async function (this: SalonWorld, role: string, name: string) {
    if (role !== 'Admin' && role !== 'Stylist') {
      throw new Error(`Only Admin or Stylist staff actors can be created; received '${role}'`);
    }
    await this.createStaff(name, role);
  },
);

When('I use actor {string}', function (this: SalonWorld, name: string) {
  actor(this, name);
  this.activeActor = name;
});

When('I set request header {string} to {string}', function (this: SalonWorld, name: string, value: string) {
  this.requestHeaders[name] = this.resolve(value);
});

When('I clear request headers', function (this: SalonWorld) {
  this.requestHeaders = {};
});

When(
  'I make a {string} request to {string}',
  async function (this: SalonWorld, method: string, endpoint: string) {
    await send(this, method, endpoint);
  },
);

When(
  'I make a {string} request to {string} as actor {string}',
  async function (this: SalonWorld, method: string, endpoint: string, actorName: string) {
    actor(this, actorName);
    await send(this, method, endpoint, undefined, actorName);
  },
);

When(
  'I make a {string} request to {string} with body:',
  async function (this: SalonWorld, method: string, endpoint: string, body: string) {
    const resolved = JSON.parse(this.resolve(body));
    await send(this, method, endpoint, resolved);
  },
);

When(
  'I make a {string} request to {string} as actor {string} with body:',
  async function (
    this: SalonWorld,
    method: string,
    endpoint: string,
    actorName: string,
    body: string,
  ) {
    actor(this, actorName);
    const resolved = JSON.parse(this.resolve(body));
    await send(this, method, endpoint, resolved, actorName);
  },
);

When(
  'I book an available {string} appointment as actor {string}',
  async function (this: SalonWorld, location: 'salon' | 'customer', actorName: string) {
    actor(this, actorName);
    await this.bookAvailable(location, actorName);
  },
);

When(
  'I book an available {string} appointment for actor {string} as actor {string}',
  async function (
    this: SalonWorld,
    location: 'salon' | 'customer',
    preferredStaffName: string,
    customerName: string,
  ) {
    actor(this, customerName);
    actor(this, preferredStaffName);
    await this.bookAvailable(location, customerName, preferredStaffName);
  },
);

When(
  'I grant actor {string} permission to approve own appointments',
  async function (this: SalonWorld, actorName: string) {
    const target = actor(this, actorName);
    if (!target.staffId) throw new Error(`Actor '${actorName}' is not a staff member`);
    await send(
      this,
      'POST',
      `/api/staff/${target.staffId}/approve-own`,
      { allowed: true },
      'owner',
    );
  },
);

When(
  'I revoke actor {string} permission to approve own appointments',
  async function (this: SalonWorld, actorName: string) {
    const target = actor(this, actorName);
    if (!target.staffId) throw new Error(`Actor '${actorName}' is not a staff member`);
    await send(
      this,
      'POST',
      `/api/staff/${target.staffId}/approve-own`,
      { allowed: false },
      'owner',
    );
  },
);

When(
  'I set the salon work mode to {string} as actor {string}',
  async function (this: SalonWorld, workMode: string, actorName: string) {
    actor(this, actorName);
    await send(
      this,
      'PUT',
      '/api/salons/{{salonId}}/booking-policy',
      { bookingWindowDays: 14, workMode },
      actorName,
    );
  },
);

When(
  'I approve the current appointment as actor {string}',
  async function (this: SalonWorld, actorName: string) {
    actor(this, actorName);
    await send(this, 'POST', '/api/appointments/{{appointmentId}}/approve', undefined, actorName);
  },
);

When(
  'I reject the current appointment as actor {string}',
  async function (this: SalonWorld, actorName: string) {
    actor(this, actorName);
    await send(this, 'POST', '/api/appointments/{{appointmentId}}/reject', undefined, actorName);
  },
);

When('I open {string} in the browser', async function (this: SalonWorld, path: string) {
  await this.openBrowser(this.resolve(path));
});

When('I log in actor {string} through the browser', async function (this: SalonWorld, actorName: string) {
  const target = actor(this, actorName);
  if (!this.page) await this.openBrowser('/auth');
  await loginViaUi(this.page!, target.phone, actorName === 'customer' ? /\/account/ : /\/owner/);
});

When('I browse to {string}', async function (this: SalonWorld, path: string) {
  if (!this.page) await this.openBrowser(path);
  else await this.page.goto(this.resolve(path), { waitUntil: 'domcontentloaded' });
});

Then('the response status should be {int}', function (this: SalonWorld, status: number) {
  expect(this.lastResponse?.status).toBe(status);
});

Then('the response field {string} should equal {string}', function (this: SalonWorld, path: string, value: string) {
  expect(readPath(this.lastResponse?.body, path)).toEqual(literal(this.resolve(value)));
});

Then('the response field {string} should exist', function (this: SalonWorld, path: string) {
  expect(readPath(this.lastResponse?.body, path)).not.toBeUndefined();
});

Then('the response body should be an object', function (this: SalonWorld) {
  expect(this.lastResponse?.body).toEqual(expect.any(Object));
});

Then('the response status should be one of {string}', function (this: SalonWorld, statuses: string) {
  const allowed = statuses.split(',').map((status) => Number(status.trim()));
  expect(allowed).toContain(this.lastResponse?.status);
});

Then('the response field {string} should contain {string}', function (this: SalonWorld, path: string, value: string) {
  expect(String(readPath(this.lastResponse?.body, path))).toContain(value);
});

Then(
  'the response array {string} should contain at least {int} item',
  function (this: SalonWorld, path: string, count: number) {
    const value = readPath(this.lastResponse?.body, path);
    expect(Array.isArray(value)).toBe(true);
    expect((value as unknown[]).length).toBeGreaterThanOrEqual(count);
  },
);

Then('the response should include a chair with kind {string}', function (this: SalonWorld, kind: string) {
  const chairs = this.lastResponse?.body?.chairs;
  expect(chairs).toEqual(expect.arrayContaining([expect.objectContaining({ kind })]));
});

Then('the response location types should include {string}', function (this: SalonWorld, location: string) {
  expect(this.lastResponse?.body?.locationTypes).toContain(location);
});

Then('the browser heading should contain {string}', async function (this: SalonWorld, text: string) {
  await expect(this.page!.locator('h1').first()).toContainText(text);
});

Then('the browser URL should contain {string}', async function (this: SalonWorld, text: string) {
  await expect(this.page!).toHaveURL(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

Then('the browser should have no horizontal overflow', async function (this: SalonWorld) {
  const metrics = await this.page!.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.clientWidth + 1);
});

Then('the browser should have no runtime errors', function (this: SalonWorld) {
  expect(this.pageErrors).toEqual([]);
});

Then('I store response field {string} as variable {string}', function (this: SalonWorld, path: string, name: string) {
  const value = readPath(this.lastResponse?.body, path);
  if (value === undefined || value === null) throw new Error(`Response field '${path}' is empty`);
  this.vars[name] = String(value);
});
