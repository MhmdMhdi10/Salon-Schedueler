import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  apiJson,
  clearBrowserSession,
  isoDateFromToday,
  loginViaUi,
  loginWithApi,
  registerSalonViaApi,
  uniquePhone,
} from './fixtures';

const SCREENSHOT_DIR = resolve(process.cwd(), 'artifacts/qa-screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

type RequestContext = Parameters<typeof apiJson>[0];

async function capture(page: Parameters<typeof loginViaUi>[0], name: string) {
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

async function createApprovedBooking(request: RequestContext, label: string) {
  const salon = await registerSalonViaApi(request, label);
  const services = await apiJson<{ services: Array<{ id: string; name: string }> }>(
    request,
    `/api/salons/${salon.salonId}/services`,
  );
  const service =
    services.services.find((item) => item.name === salon.serviceName) ?? services.services[0];
  expect(service).toBeDefined();

  const customerPhone = uniquePhone('7');
  const customer = await loginWithApi(request, customerPhone);
  const date = isoDateFromToday(1);
  const availability = await apiJson<{ slots: Array<{ startAt: string }> }>(
    request,
    `/api/salons/${salon.salonId}/availability?serviceId=${service!.id}&date=${date}`,
  );
  expect(availability.slots.length).toBeGreaterThan(0);

  const booking = await apiJson<{ appointment: { id: string }; status: string }>(
    request,
    '/api/appointments',
    {
      method: 'POST',
      data: {
        salonId: salon.salonId,
        serviceId: service!.id,
        startAt: availability.slots[0].startAt,
      },
      token: customer.accessToken,
    },
  );
  expect(booking.status).toBe('pending');

  const approved = await apiJson<{ status: string }>(
    request,
    `/api/appointments/${booking.appointment.id}/approve`,
    { method: 'POST', token: salon.accessToken },
  );
  expect(approved.status).toBe('confirmed');

  return { salon, customer, customerPhone, service: service!, date };
}

test.describe.configure({ timeout: 120_000 });

test('desktop sidebar persistence, salon inbox, and live notification flow', async ({
  page,
  request,
}) => {
  const { salon, customer, service, date } = await createApprovedBooking(request, 'QA Desktop');
  const ownerUnread = await apiJson<{ count: number }>(
    request,
    `/api/salons/${salon.salonId}/notifications/unread-count`,
    { token: salon.accessToken },
  );
  expect(ownerUnread.count).toBeGreaterThan(0);

  await loginViaUi(page, salon.ownerPhone, /\/owner(?:\/calendar)?(?:\?|$)/);
  await page.goto('/owner/calendar');
  const sidebar = page.getByLabel('ناوبری پنل مدیریت');
  await expect(sidebar).toBeVisible();
  await page.getByRole('button', { name: 'گسترش ناوبری' }).click();
  await expect(page.getByRole('button', { name: 'جمع‌کردن ناوبری' })).toBeVisible();
  await capture(page, 'owner-sidebar-expanded');

  await page
    .getByRole('navigation', { name: 'ناوبری داشبورد' })
    .getByRole('link', { name: 'آمار' })
    .click();
  await expect(page).toHaveURL(/\/owner\/analytics(?:\?|$)/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'جمع‌کردن ناوبری' })).toBeVisible();

  const bell = page.getByRole('banner').getByRole('button', { name: 'اعلان‌ها' });
  await expect(bell).toBeVisible();
  const markAllResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/salons/${salon.salonId}/notifications/read-all`) &&
      response.request().method() === 'POST',
  );
  await bell.click();
  const popover = page.getByRole('dialog', { name: 'اعلان‌ها' });
  await expect(popover).toBeVisible();
  await markAllResponse;
  await capture(page, 'owner-inbox-open');
  await page.mouse.click(500, 500);
  await expect(popover).toHaveCount(0);

  const newCustomer = await loginWithApi(request, uniquePhone('6'));
  const laterAvailability = await apiJson<{ slots: Array<{ startAt: string }> }>(
    request,
    `/api/salons/${salon.salonId}/availability?serviceId=${service.id}&date=${date}`,
  );
  const liveSlot = laterAvailability.slots.find((slot) => slot.startAt !== undefined);
  expect(liveSlot).toBeDefined();
  await apiJson(request, '/api/appointments', {
    method: 'POST',
    data: { salonId: salon.salonId, serviceId: service.id, startAt: liveSlot!.startAt },
    token: newCustomer.accessToken,
  });
  await expect(page.getByTestId('owner-live-alert')).toBeVisible({ timeout: 15_000 });
  await capture(page, 'owner-live-alert');

  const customerNotifications = await apiJson<{
    notifications: Array<{ readAt: string | null }>;
  }>(request, '/api/customers/me/notifications', { token: customer.accessToken });
  expect(customerNotifications.notifications.some((item) => item.readAt === null)).toBe(true);
});

test.describe('mobile owner/customer inbox surfaces', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('customer inbox marks notifications read and owner bottom tabs navigate', async ({
    page,
    request,
  }) => {
    const { salon, customer, customerPhone } = await createApprovedBooking(request, 'QA Mobile');
    const before = await apiJson<{
      notifications: Array<{ id: string; readAt: string | null }>;
    }>(request, '/api/customers/me/notifications', { token: customer.accessToken });
    expect(before.notifications.some((item) => item.readAt === null)).toBe(true);

    await loginViaUi(page, customerPhone, /\/account(?:\?|$)/);
    const customerBell = page.getByTestId('customer-notifications-bell');
    await expect(customerBell).toBeVisible();
    const customerMarkAll = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/customers/me/notifications/read-all') &&
        response.request().method() === 'POST',
    );
    await customerBell.click();
    const customerPopover = page.getByTestId('customer-notifications-popover');
    await expect(customerPopover).toBeVisible();
    await customerMarkAll;
    await capture(page, 'customer-inbox-open');
    await expect
      .poll(async () => {
        const current = await apiJson<{
          notifications: Array<{ readAt: string | null }>;
        }>(request, '/api/customers/me/notifications', { token: customer.accessToken });
        return current.notifications.filter((item) => item.readAt === null).length;
      })
      .toBe(0);

    await customerPopover.getByRole('button', { name: 'نمایش همه پیام‌ها' }).click();
    await expect(page).toHaveURL(/\/account#customer-notifications$/);
    await expect(page.getByTestId('customer-notifications')).toBeVisible();

    await clearBrowserSession(page);
    await loginViaUi(page, salon.ownerPhone, /\/owner(?:\/calendar)?(?:\?|$)/);
    await page.goto('/owner/calendar');
    await expect(page.getByTestId('owner-bottom-tabs')).toBeVisible();
    await page.getByRole('link', { name: 'مشتری‌ها' }).click();
    await expect(page).toHaveURL(/\/owner\/clients(?:\?|$)/);
    await page.getByRole('link', { name: 'پروفایل' }).click();
    await expect(page).toHaveURL(/\/owner\/profile(?:\?|$)/);
    await expect(page.getByTestId('owner-profile-page')).toBeVisible();
    await page.waitForTimeout(500);
    await capture(page, 'owner-mobile-bottom-tabs');
  });
});

test('SMS settings persist and OTP is visible/searchable in local SMS inbox', async ({
  page,
  request,
}) => {
  const salon = await registerSalonViaApi(request, 'QA SMS');
  await loginViaUi(page, salon.ownerPhone, /\/owner(?:\/calendar)?(?:\?|$)/);
  await page.goto('/owner/config');
  await expect(page.getByTestId('admin-configuration')).toBeVisible();

  const smsSection = page.locator('#sms-settings');
  await expect(smsSection).toBeVisible();
  const bookingCard = smsSection.locator('.grid > div').filter({ hasText: 'رزرو جدید' });
  const ownerBooking = bookingCard.getByRole('switch', { name: 'برای صاحب سالن' });
  await expect(ownerBooking).toHaveAttribute('data-state', 'unchecked');
  await ownerBooking.click();
  await expect(ownerBooking).toHaveAttribute('data-state', 'checked');
  await expect
    .poll(async () => {
      const current = await apiJson<{ ownerBooking: boolean }>(
        request,
        `/api/salons/${salon.salonId}/sms-settings`,
        { token: salon.accessToken },
      );
      return current.ownerBooking;
    })
    .toBe(true);
  await page.reload();
  await expect(
    page.locator('#sms-settings').getByRole('switch', { name: 'برای صاحب سالن' }).first(),
  ).toHaveAttribute('data-state', 'checked');
  await expect(page.locator('#app-boot-loader')).toHaveCount(0);
  await expect(page.getByTestId('route-loader')).toHaveCount(0);
  await page.waitForTimeout(500);
  await capture(page, 'sms-settings');

  const smsPhone = uniquePhone('3');
  await loginWithApi(request, smsPhone);
  const smsPage = await page.context().newPage();
  try {
    await expect
      .poll(
        async () => {
          const response = await request.get('http://127.0.0.1:8025/api/messages');
          const messages = (await response.json()) as Array<{ phone: string }>;
          return messages.filter((message) => message.phone === smsPhone).length;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    await smsPage.goto('http://127.0.0.1:8025/');
    await expect(smsPage).toHaveTitle('صندوق پیامک توسعه');
    const search = smsPage.getByPlaceholder('جست‌وجوی شماره یا متن پیامک…');
    await search.fill(smsPhone);
    await expect(smsPage.locator('#count')).toContainText('۱ پیامک');
    await expect(smsPage.locator('.card')).toHaveCount(1);
    await capture(smsPage, 'sms-inbox-filtered');
  } finally {
    await smsPage.close();
  }
});
