import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomInt } from 'node:crypto';

export const SEED_SALON_ID = '11111111-1111-1111-1111-111111111111';
export const SEED_SALON_SLUG = 'salon-rose';
const API_BASE_URL = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3110';

let sequence = 0;

/** Generate a valid, locally unique Iranian mobile for an isolated E2E actor. */
export function uniquePhone(prefix = '9'): string {
  sequence += 1;
  // The timestamp tail used during initial probing collided with phones from
  // earlier local runs. Randomize the eight remaining digits; the tiny
  // sequence perturbation keeps repeated calls in one process distinct too.
  const tail = (randomInt(0, 100_000_000) + sequence).toString().slice(-8).padStart(8, '0');
  return `09${prefix}${tail}`;
}

export function isoDateFromToday(days = 0): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export interface ApiCallOptions {
  method?: string;
  data?: unknown;
  token?: string;
  maxRedirects?: number;
}

/** Call the Vite-proxied API and include a useful body in failures. */
export async function apiCall<T>(
  request: APIRequestContext,
  path: string,
  { method = 'GET', data, token, maxRedirects }: ApiCallOptions = {},
): Promise<{ response: Awaited<ReturnType<APIRequestContext['fetch']>>; body: T }> {
  const response = await request.fetch(`${API_BASE_URL}${path}`, {
    method,
    data,
    maxRedirects,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const body = (await response.json().catch(() => ({}))) as T;
  return { response, body };
}

export async function apiJson<T>(
  request: APIRequestContext,
  path: string,
  options: ApiCallOptions = {},
): Promise<T> {
  const { response, body } = await apiCall<T>(request, path, options);
  if (!response.ok()) {
    throw new Error(`${options.method ?? 'GET'} ${path} → ${response.status()}: ${JSON.stringify(body)}`);
  }
  return body;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export async function loginWithApi(
  request: APIRequestContext,
  phone: string,
): Promise<AuthTokens> {
  const otp = await apiJson<{ ok: boolean; devOtp?: string }>(request, '/api/auth/otp/request', {
    method: 'POST',
    data: { phone },
  });
  expect(otp.devOtp, 'DEV_OTP_AUTO_FILL must expose OTP to E2E').toMatch(/^\d{6}$/);
  return apiJson<AuthTokens>(request, '/api/auth/otp/verify', {
    method: 'POST',
    data: { phone, code: otp.devOtp },
  });
}

export interface RegisteredSalon {
  salonId: string;
  salonName: string;
  ownerPhone: string;
  ownerName: string;
  serviceName: string;
}

export async function registerSalonViaApi(
  request: APIRequestContext,
  label = 'E2E',
): Promise<RegisteredSalon & AuthTokens> {
  const ownerPhone = uniquePhone();
  const ownerName = `${label} مدیر`;
  const salonName = `${label} سالن ${Date.now()}`;
  const serviceName = `${label} سرویس`;
  const response = await apiCall<{ salonId: string; salonName: string }>(
    request,
    '/api/register/salon',
    {
      method: 'POST',
      data: {
        salonName,
        ownerName,
        phone: ownerPhone,
        services: [{ name: serviceName, durationMinutes: 30, priceRial: 500000 }],
        chairCount: 1,
      },
    },
  );
  expect(response.response.status(), 'salon registration should create a salon').toBe(201);
  const tokens = await loginWithApi(request, ownerPhone);
  return {
    salonId: response.body.salonId,
    salonName: response.body.salonName,
    ownerPhone,
    ownerName,
    serviceName,
    ...tokens,
  };
}

/** Login through the same OTP surface a phone user sees in production. */
export async function loginViaUi(
  page: Page,
  phone: string,
  expectedUrl: RegExp = /\/(account|owner)(?:\/|$)/,
): Promise<void> {
  await page.goto('/auth');
  await page.getByLabel('شماره موبایل').fill(phone);
  await page.getByRole('button', { name: 'دریافت کد', exact: true }).click();
  await expect(page.locator('input[aria-label*="کد تایید"]').first()).toBeVisible();
  await page.getByRole('button', { name: /تایید و ورود/ }).click();
  await expect(page).toHaveURL(expectedUrl);
}

/** Restore a refresh token, then let AuthProvider bootstrap the browser session. */
export async function restoreSession(page: Page, refreshToken: string, expectedUrl?: RegExp): Promise<void> {
  await page.goto('/');
  await page.evaluate((token) => localStorage.setItem('refreshToken', token), refreshToken);
  await page.reload();
  if (expectedUrl) await expect(page).toHaveURL(expectedUrl);
}

export async function clearBrowserSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
}

/** Exercise the owner onboarding wizard, including its OTP completion step. */
export async function registerSalonViaUi(page: Page, label = 'E2E UI'): Promise<RegisteredSalon> {
  const ownerPhone = uniquePhone('8');
  const ownerName = `${label} مدیر`;
  const salonName = `${label} سالن ${Date.now()}`;
  const serviceName = `${label} سرویس`;

  await page.goto('/business/register');
  await page.getByRole('button', { name: 'سالن مو و زیبایی', exact: true }).click();
  await page.getByRole('button', { name: 'ادامه', exact: true }).click();

  await page.locator('#salonName').fill(salonName);
  await page.locator('#ownerName').fill(ownerName);
  await page.locator('#phone').fill(ownerPhone);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'ادامه', exact: true }).click();

  await page.locator('#svcName').fill(serviceName);
  await page.locator('#svcDuration').fill('30');
  await page.locator('#svcPrice').fill('500000');
  await page.getByRole('button', { name: 'افزودن خدمت', exact: true }).click();
  await expect(page.getByText(serviceName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ادامه', exact: true }).click();

  await page.locator('#chairCount').fill('1');
  const registrationResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/register/salon') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'ثبت سالن و دریافت کد', exact: true }).click();
  const response = await registrationResponse;
  expect(response.status()).toBe(201);
  const { salonId, salonName: createdSalonName } = (await response.json()) as {
    salonId: string;
    salonName: string;
  };

  await expect(page.getByRole('heading', { level: 1, name: 'تایید شماره و ورود' })).toBeVisible();
  await page.getByRole('button', { name: 'تایید و ورود به پنل', exact: true }).click();
  await expect(page).toHaveURL(/\/owner(?:\/calendar)?(?:\?|$)/);

  return {
    salonId,
    salonName: createdSalonName,
    ownerPhone,
    ownerName,
    serviceName,
  };
}
