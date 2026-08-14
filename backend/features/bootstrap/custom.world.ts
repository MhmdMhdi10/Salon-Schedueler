import { setDefaultTimeout, setWorldConstructor, type IWorldOptions } from '@cucumber/cucumber';
import request, { type Response } from 'supertest';
import { createApp, type CreatedApp } from '../../src/composition-root';

export type LastResponse = {
  status: number;
  body: any;
  headers: Record<string, string | string[] | undefined>;
};

export type Actor = {
  phone: string;
  role: 'Owner' | 'Admin' | 'Stylist' | 'Customer' | 'PlatformAdmin';
  staffId?: string;
  accessToken: string;
  refreshToken: string;
};

let phoneSequence = 0;

function uniquePhone(prefix: string): string {
  const suffix = String((Date.now() + phoneSequence++) % 100_000_000).padStart(8, '0');
  return `09${prefix}${suffix}`;
}

function isoDateFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export class BackendWorld {
  readonly attach: IWorldOptions['attach'];
  readonly log: IWorldOptions['log'];
  readonly link: IWorldOptions['link'];
  readonly parameters: IWorldOptions['parameters'];

  created: CreatedApp | null = null;
  response: Response | null = null;
  responseTime: number | null = null;
  lastResponse: LastResponse | null = null;
  lastError: unknown = null;
  vars: Record<string, string> = {};
  actors = new Map<string, Actor>();
  activeActor = '';
  requestHeaders: Record<string, string> = {};
  controllerCovered = new Set<string>();

  constructor(options: IWorldOptions) {
    this.attach = options.attach;
    this.log = options.log;
    this.link = options.link;
    this.parameters = options.parameters;
  }

  async ensureApp(): Promise<CreatedApp> {
    if (!this.created) {
      this.created = createApp({
        devOtpAutoFill: true,
        jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
        botWebhookSecret: 'controller-secret',
      });
    }
    return this.created;
  }

  resolve(value: string): string {
    return value.replace(/\{\{([\w-]+)\}\}/g, (_match, key: string) => {
      const resolved = this.vars[key];
      if (resolved === undefined) throw new Error(`Cucumber variable '${key}' is not defined`);
      return resolved;
    });
  }

  tokenFor(actorName?: string): string | undefined {
    const actor = this.actors.get(actorName ?? this.activeActor);
    return actor?.accessToken;
  }

  async rawRequest(
    method: string,
    path: string,
    data?: unknown,
    actorName?: string,
  ): Promise<LastResponse> {
    const app = await this.ensureApp();
    const resolvedPath = this.resolve(path);
    const verb = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    const req = request(app.app)[verb](resolvedPath);

    for (const [key, value] of Object.entries(this.requestHeaders)) req.set(key, value);
    if (resolvedPath.endsWith('/auth/otp/verify') || resolvedPath.endsWith('/auth/refresh')) {
      req.set('X-Auth-Client', 'mobile');
    }
    const token = this.tokenFor(actorName);
    if (token) req.set('Authorization', `Bearer ${token}`);
    if (data !== undefined && data !== null) req.send(data);

    const start = Date.now();
    const response = await req;
    this.responseTime = Date.now() - start;
    this.response = response;
    this.lastResponse = {
      status: response.status,
      body: response.body,
      headers: response.headers,
    };
    this.lastError = null;
    return this.lastResponse;
  }

  async authenticate(phone: string): Promise<Actor> {
    const otp = await this.rawRequest('POST', '/api/auth/otp/request', { phone });
    const code = String(otp.body?.devOtp ?? '');
    if (otp.status !== 200 || !/^\d{6}$/.test(code)) {
      throw new Error(`OTP request failed for ${phone}: ${JSON.stringify(otp.body)}`);
    }

    const verified = await this.rawRequest('POST', '/api/auth/otp/verify', {
      phone,
      code,
    });
    if (verified.status !== 200) {
      throw new Error(`OTP verification failed for ${phone}: ${JSON.stringify(verified.body)}`);
    }

    return {
      phone,
      role: 'Customer',
      accessToken: String(verified.body.accessToken),
      refreshToken: String(verified.body.refreshToken),
    };
  }

  async registerSalon(workMode: string, label: string): Promise<void> {
    const ownerPhone = uniquePhone('8');
    const created = await this.rawRequest('POST', '/api/register/salon', {
      salonName: `${label} ${Date.now()}`,
      ownerName: `${label} مالک`,
      phone: ownerPhone,
      businessType: 'hair',
      workMode,
      chairCount: workMode === 'mobile' ? 0 : 1,
      services: [{ name: `${label} خدمت`, durationMinutes: 30, priceRial: 500000 }],
    });
    if (created.status !== 201) {
      throw new Error(`Salon registration failed: ${JSON.stringify(created.body)}`);
    }

    const owner = await this.authenticate(ownerPhone);
    owner.role = 'Owner';
    this.actors.set('owner', owner);
    this.activeActor = 'owner';
    this.vars = {
      ...this.vars,
      salonId: String(created.body.salonId),
      salonName: String(created.body.salonName),
      ownerPhone,
      serviceName: `${label} خدمت`,
      date: isoDateFromToday(2),
      futureDate: isoDateFromToday(5),
      laterDate: isoDateFromToday(8),
    };
  }

  async createCustomer(name: string): Promise<void> {
    const actor = await this.authenticate(uniquePhone('1'));
    this.actors.set(name, actor);
    this.activeActor = name;
  }

  async createPlatformAdmin(name: string): Promise<void> {
    const actor = await this.authenticate('09120000999');
    actor.role = 'PlatformAdmin';
    this.actors.set(name, actor);
    this.activeActor = name;
  }

  async createStaff(name: string, role: 'Admin' | 'Stylist'): Promise<void> {
    const phone = uniquePhone(role === 'Admin' ? '4' : '5');
    const created = await this.rawRequest(
      'POST',
      '/api/salons/{{salonId}}/staff',
      { fullName: name, role, phone },
      'owner',
    );
    if (created.status !== 201) {
      throw new Error(`Staff creation failed: ${JSON.stringify(created.body)}`);
    }
    const actor = await this.authenticate(phone);
    actor.role = role;
    actor.staffId = String(created.body.staff.id);
    this.actors.set(name, actor);
    this.vars[`${name}Id`] = actor.staffId;
  }

  async bookAvailable(locationType: 'salon' | 'customer', customerName: string): Promise<void> {
    const service = await this.rawRequest('GET', '/api/salons/{{salonId}}/services');
    const serviceRow = service.body?.services?.find(
      (item: any) => item.name === this.vars.serviceName,
    );
    if (!serviceRow) throw new Error(`Service '${this.vars.serviceName}' was not found`);
    this.vars.serviceId = String(serviceRow.id);

    const query = new URLSearchParams({
      serviceId: this.vars.serviceId,
      date: this.vars.date,
      locationType,
    });
    const availability = await this.rawRequest(
      'GET',
      `/api/salons/{{salonId}}/availability?${query.toString()}`,
    );
    const slot = availability.body?.slots?.[0];
    if (!slot)
      throw new Error(`No ${locationType} slot available: ${JSON.stringify(availability.body)}`);

    const booked = await this.rawRequest(
      'POST',
      '/api/appointments',
      {
        salonId: this.vars.salonId,
        serviceId: this.vars.serviceId,
        startAt: slot.startAt,
        locationType,
        ...(locationType === 'customer'
          ? { locationAddress: 'تهران، خیابان تست، کوچه یک، پلاک ۱' }
          : {}),
      },
      customerName,
    );
    if (![200, 201].includes(booked.status)) {
      throw new Error(`Booking failed: ${JSON.stringify(booked.body)}`);
    }
    this.vars.appointmentId = String(booked.body.appointment.id);
  }

  async close(): Promise<void> {
    if (this.created) {
      await this.created.prisma.$disconnect();
      this.created = null;
    }
  }
}

setDefaultTimeout(120000);
setWorldConstructor(BackendWorld);
