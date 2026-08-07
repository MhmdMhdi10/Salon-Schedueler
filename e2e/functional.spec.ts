import { expect, test } from '@playwright/test';
import {
  apiCall,
  apiJson,
  clearBrowserSession,
  isoDateFromToday,
  loginWithApi,
  loginViaUi,
  registerSalonViaApi,
  registerSalonViaUi,
  restoreSession,
  uniquePhone,
} from './fixtures';

const dateRange = () => ({ from: isoDateFromToday(-1), to: isoDateFromToday(30) });

test.describe('authentication and customer journeys', () => {
  test('invalid phone is explained, customer login works, and landing stays locked', async ({
    page,
  }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: 'دریافت کد', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('شماره موبایل معتبر نیست');

    const customerPhone = uniquePhone('7');
    await loginViaUi(page, customerPhone, /\/account(?:\?|$)/);
    await expect(page.locator('h1').first()).toBeVisible();

    await page.goto('/');
    await expect(page).toHaveURL(/\/account(?:\?|$)/);
    await page.goto('/business');
    await expect(page).toHaveURL(/\/account(?:\?|$)/);
    await page.goto('/auth');
    await expect(page).toHaveURL(/\/account(?:\?|$)/);
    await page.goto('/owner/calendar');
    await expect(page).toHaveURL(/\/account(?:\?|$)/);
  });
});

test.describe('owner onboarding and configuration journey', () => {
  test('creates salon through UI, provisions catalog, adds stylist, and grants scoped availability', async ({
    page,
    request,
  }) => {
    const salon = await registerSalonViaUi(page);
    const owner = await loginWithApi(request, salon.ownerPhone);

    const initialStaff = await apiJson<{ staff: Array<{ role: string; fullName: string | null }> }>(
      request,
      `/api/salons/${salon.salonId}/staff`,
      { token: owner.accessToken },
    );
    const services = await apiJson<{ services: Array<{ name: string }> }>(
      request,
      `/api/salons/${salon.salonId}/services`,
    );
    const chairs = await apiJson<{ chairs: Array<{ active: boolean }> }>(
      request,
      `/api/salons/${salon.salonId}/chairs`,
      { token: owner.accessToken },
    );
    expect(initialStaff.staff.some((member) => member.role === 'Owner')).toBe(true);
    expect(services.services.some((service) => service.name === salon.serviceName)).toBe(true);
    expect(chairs.chairs.length).toBeGreaterThanOrEqual(1);

    await page.goto('/owner/config');
    await expect(page.getByTestId('owner-config-page')).toBeVisible();
    const stylistName = `E2E آرایشگر ${Date.now()}`;
    const stylistPhone = uniquePhone('6');
    await page.getByLabel('نام کارمند').fill(stylistName);
    await page.getByLabel('شماره ورود (اختیاری)').fill(stylistPhone);
    await page.getByRole('button', { name: 'افزودن کارمند', exact: true }).click();
    await expect(page.getByText(stylistName, { exact: true })).toBeVisible();

    const staffAfterCreate = await apiJson<{
      staff: Array<{
        id: string;
        fullName: string | null;
        phone: string | null;
        role: string;
        manageOwnAvailability: boolean;
      }>;
    }>(request, `/api/salons/${salon.salonId}/staff`, { token: owner.accessToken });
    const stylist = staffAfterCreate.staff.find((member) => member.phone === stylistPhone);
    expect(stylist).toBeDefined();
    expect(stylist?.role).toBe('Stylist');

    const stylistTokens = await loginWithApi(request, stylistPhone);
    const beforeGrant = await apiCall(
      request,
      `/api/staff/${stylist!.id}/availability-blocks`,
      { token: stylistTokens.accessToken },
    );
    expect(beforeGrant.response.status()).toBe(403);

    await page.getByRole('button', { name: `ویرایش ${stylistName}`, exact: true }).click();
    const availabilitySwitch = page.getByRole('switch', { name: 'اجازه‌ی بستن وقت شخصی' });
    await expect(availabilitySwitch).toBeVisible();
    await availabilitySwitch.click();

    await expect
      .poll(async () => {
        const current = await apiJson<{
          staff: Array<{ id: string; manageOwnAvailability: boolean }>;
        }>(request, `/api/salons/${salon.salonId}/staff`, { token: owner.accessToken });
        return current.staff.find((member) => member.id === stylist!.id)?.manageOwnAvailability;
      })
      .toBe(true);

    const range = dateRange();
    const stylistCalendar = await apiCall(
      request,
      `/api/salons/${salon.salonId}/calendar?from=${range.from}&to=${range.to}&view=week`,
      { token: stylistTokens.accessToken },
    );
    const stylistAnalytics = await apiCall(
      request,
      `/api/salons/${salon.salonId}/analytics?from=${range.from}&to=${range.to}`,
      { token: stylistTokens.accessToken },
    );
    expect(stylistCalendar.response.status()).toBe(200);
    expect(stylistAnalytics.response.status()).toBe(403);

    const block = await apiCall<{ block: { id: string } }>(
      request,
      `/api/staff/${stylist!.id}/availability-blocks`,
      { method: 'POST', data: { onDate: isoDateFromToday(3) }, token: stylistTokens.accessToken },
    );
    expect(block.response.status()).toBe(201);
    expect(block.body.block.id).toBeTruthy();
    const removed = await apiCall(
      request,
      `/api/staff/${stylist!.id}/availability-blocks/${block.body.block.id}`,
      { method: 'DELETE', token: stylistTokens.accessToken },
    );
    expect(removed.response.status()).toBe(200);

    await page.reload();
    await expect(page).toHaveURL(/\/owner\/config(?:\?|$)/);
  });
});

test.describe('RBAC and protected resource matrix', () => {
  test('Owner/Admin/Stylist permissions match UI guards and API authorization', async ({
    page,
    request,
  }) => {
    const salon = await registerSalonViaApi(request, 'E2E RBAC');
    const ownerToken = salon.accessToken;
    const stylistPhone = uniquePhone('5');
    const adminPhone = uniquePhone('4');
    const stylistCreated = await apiJson<{
      staff: { id: string; phone: string | null; role: string };
    }>(request, `/api/salons/${salon.salonId}/staff`, {
      method: 'POST',
      data: { fullName: 'RBAC آرایشگر', role: 'Stylist', phone: stylistPhone },
      token: ownerToken,
    });
    const adminCreated = await apiJson<{ staff: { id: string; role: string } }>(
      request,
      `/api/salons/${salon.salonId}/staff`,
      {
        method: 'POST',
        data: { fullName: 'RBAC ادمین', role: 'Admin', phone: adminPhone },
        token: ownerToken,
      },
    );
    expect(stylistCreated.staff.role).toBe('Stylist');
    expect(adminCreated.staff.role).toBe('Admin');

    const range = dateRange();
    const ownerCalendar = await apiCall(
      request,
      `/api/salons/${salon.salonId}/calendar?from=${range.from}&to=${range.to}&view=month`,
      { token: ownerToken },
    );
    const ownerAnalytics = await apiCall(
      request,
      `/api/salons/${salon.salonId}/analytics?from=${range.from}&to=${range.to}`,
      { token: ownerToken },
    );
    const ownerStaff = await apiCall(
      request,
      `/api/salons/${salon.salonId}/staff`,
      { token: ownerToken },
    );
    expect(ownerCalendar.response.status()).toBe(200);
    expect(ownerAnalytics.response.status()).toBe(200);
    expect(ownerStaff.response.status()).toBe(200);

    const stylistTokens = await loginWithApi(request, stylistPhone);
    const adminTokens = await loginWithApi(request, adminPhone);
    const stylistAnalytics = await apiCall(
      request,
      `/api/salons/${salon.salonId}/analytics?from=${range.from}&to=${range.to}`,
      { token: stylistTokens.accessToken },
    );
    const stylistStaffWrite = await apiCall(
      request,
      `/api/salons/${salon.salonId}/staff`,
      {
        method: 'POST',
        data: { fullName: 'نباید ساخته شود', role: 'Stylist', phone: uniquePhone('3') },
        token: stylistTokens.accessToken,
      },
    );
    const adminAnalytics = await apiCall(
      request,
      `/api/salons/${salon.salonId}/analytics?from=${range.from}&to=${range.to}`,
      { token: adminTokens.accessToken },
    );
    const adminConfigWrite = await apiCall(
      request,
      `/api/salons/${salon.salonId}/staff`,
      {
        method: 'POST',
        data: { fullName: 'نباید ساخته شود', role: 'Stylist', phone: uniquePhone('2') },
        token: adminTokens.accessToken,
      },
    );
    expect(stylistAnalytics.response.status()).toBe(403);
    expect(stylistStaffWrite.response.status()).toBe(403);
    expect(adminAnalytics.response.status()).toBe(200);
    expect(adminConfigWrite.response.status()).toBe(403);

    await restoreSession(page, stylistTokens.refreshToken, /\/owner/);
    await page.goto('/owner/analytics');
    await expect(page).toHaveURL(/\/owner\/calendar(?:\?|$)/);
    await page.goto('/owner/config');
    await expect(page).toHaveURL(/\/owner\/calendar(?:\?|$)/);
    await expect(page.getByTestId('owner-calendar-page')).toBeVisible();

    await restoreSession(page, adminTokens.refreshToken, /\/owner/);
    await page.goto('/owner/analytics');
    await expect(page).toHaveURL(/\/owner\/analytics(?:\?|$)/);
    await page.goto('/owner/config');
    await expect(page).toHaveURL(/\/owner\/calendar(?:\?|$)/);
  });
});

test.describe('booking, QR, and failure-state journeys', () => {
  test('anonymous customer selects a service/time, signs in, and receives real receipt', async ({
    page,
    request,
  }) => {
    const salon = await registerSalonViaApi(request, 'E2E Booking');
    const services = await apiJson<{ services: Array<{ id: string; name: string }> }>(
      request,
      `/api/salons/${salon.salonId}/services`,
    );
    const service = services.services.find((item) => item.name === salon.serviceName);
    expect(service).toBeDefined();
    const bookingDate = isoDateFromToday(1);
    const availability = await apiJson<{ slots: Array<{ startAt: string }> }>(
      request,
      `/api/salons/${salon.salonId}/availability?serviceId=${service!.id}&date=${bookingDate}`,
    );
    expect(availability.slots.length, 'registered salon should expose future slots').toBeGreaterThan(0);

    await clearBrowserSession(page);
    await page.goto(`/salon/${salon.salonId}/book`);
    await expect(page.getByRole('heading', { name: 'رزرو نوبت' })).toBeVisible();
    await page.getByRole('radio', { name: salon.serviceName, exact: true }).click();
    const dateSection = page.locator('section[aria-labelledby="date-section-title"]');
    await dateSection.getByRole('radio').nth(1).click();
    await expect(page.getByRole('grid', { name: 'زمان‌های موجود' })).toBeVisible();
    await page.locator('button[role="gridcell"]:not([disabled])').first().click();
    await expect(page).toHaveURL(new RegExp(`/salon/${salon.salonId}/book/confirm`));
    await expect(page.getByTestId('booking-confirm')).toBeVisible();
    await page.getByRole('button', { name: 'تایید رزرو', exact: true }).click();
    await expect(page).toHaveURL(/\/auth(?:\?|$)/);

    const customerPhone = uniquePhone('1');
    await page.getByLabel('شماره موبایل').fill(customerPhone);
    await page.getByRole('button', { name: 'دریافت کد', exact: true }).click();
    await page.getByRole('button', { name: /تایید و ورود/ }).click();
    await expect(page).toHaveURL(/\/booking\/success(?:\?|$)/);
    await expect(page.locator('h1').first()).toBeVisible();

    const customer = await loginWithApi(request, customerPhone);
    const appointments = await apiJson<{ appointments: unknown[] }>(
      request,
      '/api/customers/me/appointments',
      { token: customer.accessToken },
    );
    expect(appointments.appointments.length).toBeGreaterThanOrEqual(1);
  });

  test('owner QR resolves to salon and malformed/error states remain explicit', async ({
    page,
    request,
  }) => {
    const trialSalon = await registerSalonViaApi(request, 'E2E QR Trial');
    const trialQr = await apiCall(
      request,
      `/api/salons/${trialSalon.salonId}/qr`,
      { token: trialSalon.accessToken },
    );
    expect(trialQr.response.status()).toBe(200);

    // QR stays available during trial: it is the acquisition entry point for
    // the MVP. Use the seeded active salon for the positive scan path below.
    const salonId = '11111111-1111-1111-1111-111111111111';
    const seedTokens = await loginWithApi(request, '09120000001');
    const qr = await apiJson<{ payload: string; url: string; salonName: string }>(
      request,
      `/api/salons/${salonId}/qr`,
      { token: seedTokens.accessToken },
    );
    expect(qr.payload).toBeTruthy();
    expect(qr.url).toContain('utm_source=qr');

    const resolved = await apiJson<{ salon: { id: string; name: string } }>(
      request,
      `/api/salons/by-qr/${encodeURIComponent(qr.payload)}`,
    );
    expect(resolved.salon.id).toBe(salonId);

    const malformed = await apiCall(request, '/api/salons/by-qr/not-a-valid-qr');
    expect([400, 404]).toContain(malformed.response.status());
    const scan = await apiCall(request, `/api/salons/${salonId}/scan?utm_source=qr`, {
      method: 'POST',
    });
    expect([200, 204]).toContain(scan.response.status());

    await restoreSession(page, seedTokens.refreshToken, /\/owner/);
    await page.goto('/owner/qr');
    await expect(page.getByTestId('owner-qr-page')).toBeVisible();
    await page.goto('/qr/not-a-valid-qr');
    await expect(page.locator('main')).toHaveCount(1);
    // This deliberately invalid string is structurally malformed, so the UI
    // should offer the re-scan guidance rather than the unregistered-salon copy.
    await expect(page.getByTestId('qr-error-malformed')).toBeVisible();
    await expect(page.getByRole('heading').first()).toBeVisible();
  });
});
