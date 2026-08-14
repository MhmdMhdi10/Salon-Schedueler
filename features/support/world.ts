import {
  After,
  Before,
  setDefaultTimeout,
  setWorldConstructor,
  type IWorldOptions,
} from '@cucumber/cucumber';
import {
  chromium,
  request as playwrightRequest,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { isoDateFromToday, uniquePhone } from '../../e2e/fixtures';

export type Actor = {
  phone: string;
  role: 'Owner' | 'Admin' | 'Stylist' | 'Customer' | 'PlatformAdmin';
  staffId?: string;
  accessToken: string;
  refreshToken: string;
};

export type LastResponse = {
  status: number;
  body: any;
  headers: Record<string, string>;
};

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3110';
export const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL ?? 'http://127.0.0.1:5273';

export class SalonWorld {
  readonly attach: IWorldOptions['attach'];
  readonly log: IWorldOptions['log'];
  readonly link: IWorldOptions['link'];
  readonly parameters: IWorldOptions['parameters'];
  api!: APIRequestContext;
  browser?: Browser;
  browserContext?: BrowserContext;
  page?: Page;
  pageErrors: string[] = [];
  lastResponse?: LastResponse;
  vars: Record<string, string> = {};
  actors = new Map<string, Actor>();
  activeActor = '';
  requestHeaders: Record<string, string> = {};

  constructor(options: IWorldOptions) {
    this.attach = options.attach;
    this.log = options.log;
    this.link = options.link;
    this.parameters = options.parameters;
  }

  resolve(value: string): string {
    return value.replace(/\{\{([\w-]+)\}\}/g, (_match, key: string) => {
      const resolved = this.vars[key];
      if (resolved === undefined) throw new Error(`Cucumber variable '${key}' is not defined`);
      return resolved;
    });
  }

  tokenFor(actorName?: string): string | undefined {
    const name = actorName ?? this.activeActor;
    return name ? this.actors.get(name)?.accessToken : undefined;
  }

  async rawRequest(
    method: string,
    path: string,
    data?: unknown,
    actorName?: string,
  ): Promise<LastResponse> {
    const resolvedPath = this.resolve(path);
    const response = await this.api.fetch(`${API_BASE_URL}${resolvedPath}`, {
      method,
      data,
      headers: {
        ...this.requestHeaders,
        ...(this.tokenFor(actorName)
          ? { Authorization: `Bearer ${this.tokenFor(actorName)}` }
          : {}),
      },
    });
    const text = await response.text();
    let body: any = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = text;
    }
    this.lastResponse = { status: response.status(), body, headers: response.headers() };
    return this.lastResponse;
  }

  async authenticate(phone: string): Promise<Actor> {
    const otp = await this.rawRequest('POST', '/api/auth/otp/request', { phone });
    if (otp.status !== 200 || !/^\d{6}$/.test(String(otp.body.devOtp ?? ''))) {
      throw new Error(`OTP request failed for ${phone}: ${JSON.stringify(otp.body)}`);
    }
    const verified = await this.rawRequest('POST', '/api/auth/otp/verify', {
      phone,
      code: otp.body.devOtp,
    });
    if (verified.status !== 200) {
      throw new Error(`OTP verification failed for ${phone}: ${JSON.stringify(verified.body)}`);
    }
    return {
      phone,
      role: 'Customer',
      accessToken: verified.body.accessToken,
      refreshToken: verified.body.refreshToken,
    };
  }

  async registerSalon(workMode: string, label: string): Promise<void> {
    const ownerPhone = uniquePhone('8');
    const salonName = `${label} ${Date.now()}`;
    const serviceName = `${label} خدمت`;
    const created = await this.rawRequest('POST', '/api/register/salon', {
      salonName,
      ownerName: `${label} مالک`,
      phone: ownerPhone,
      businessType: 'hair',
      workMode,
      chairCount: workMode === 'mobile' ? 0 : 1,
      services: [{ name: serviceName, durationMinutes: 30, priceRial: 500000 }],
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
      serviceName,
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
    const ownerToken = this.tokenFor('owner');
    if (!ownerToken) throw new Error('Owner actor is not available');
    const phone = uniquePhone(role === 'Admin' ? '4' : '5');
    const created = await this.rawRequest(
      'POST',
      '/api/salons/{{salonId}}/staff',
      { fullName: name, role, phone },
      'owner',
    );
    if (created.status !== 201) throw new Error(`Staff creation failed: ${JSON.stringify(created.body)}`);
    const actor = await this.authenticate(phone);
    actor.role = role;
    actor.staffId = String(created.body.staff.id);
    this.actors.set(name, actor);
    this.vars[`${name}Id`] = actor.staffId;
  }

  async bookAvailable(
    locationType: 'salon' | 'customer',
    customerName: string,
    preferredStaffName?: string,
  ): Promise<void> {
    const service = await this.rawRequest(
      'GET',
      '/api/salons/{{salonId}}/services',
    );
    const serviceRow = service.body.services?.find((item: any) => item.name === this.vars.serviceName);
    if (!serviceRow) throw new Error(`Service '${this.vars.serviceName}' was not found`);
    this.vars.serviceId = String(serviceRow.id);
    const query = new URLSearchParams({
      serviceId: this.vars.serviceId,
      date: this.vars.date,
      locationType,
    });
    const preferredStaffId = preferredStaffName
      ? this.actors.get(preferredStaffName)?.staffId
      : undefined;
    if (preferredStaffName && !preferredStaffId) {
      throw new Error(`Actor '${preferredStaffName}' has no staff id for preferred booking`);
    }
    if (preferredStaffId) query.set('staffId', preferredStaffId);
    const availability = await this.rawRequest(
      'GET',
      `/api/salons/{{salonId}}/availability?${query.toString()}`,
    );
    const slot = availability.body.slots?.[0];
    if (!slot) throw new Error(`No ${locationType} slot available: ${JSON.stringify(availability.body)}`);
    const body = {
      salonId: this.vars.salonId,
      serviceId: this.vars.serviceId,
      startAt: slot.startAt,
      locationType,
      ...(preferredStaffId ? { preferredStaffId } : {}),
      ...(locationType === 'customer'
        ? { locationAddress: 'تهران، خیابان تست، کوچه یک، پلاک ۱' }
        : {}),
    };
    const booked = await this.rawRequest('POST', '/api/appointments', body, customerName);
    if (![200, 201].includes(booked.status)) {
      throw new Error(`Booking failed: ${JSON.stringify(booked.body)}`);
    }
    this.vars.appointmentId = String(booked.body.appointment.id);
    this.vars.locationType = locationType;
  }

  async openBrowser(path: string): Promise<void> {
    if (!this.browser) this.browser = await chromium.launch({ headless: true });
    if (!this.browserContext) {
      this.browserContext = await this.browser.newContext({
        baseURL: WEB_BASE_URL,
        locale: 'fa-IR',
        timezoneId: 'Asia/Tehran',
        colorScheme: 'dark',
        viewport: { width: 1280, height: 800 },
      });
    }
    this.page = await this.browserContext.newPage();
    this.page.on('pageerror', (error) => this.pageErrors.push(error.message));
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
  }

  async close(): Promise<void> {
    await this.page?.close();
    await this.browserContext?.close();
    await this.browser?.close();
    await this.api?.dispose();
  }
}

setWorldConstructor(SalonWorld);
setDefaultTimeout(120_000);

Before(async function (this: SalonWorld) {
  this.api = await playwrightRequest.newContext({
    extraHTTPHeaders: { Accept: 'application/json' },
  });
});

After(async function (this: SalonWorld) {
  await this.close();
});
