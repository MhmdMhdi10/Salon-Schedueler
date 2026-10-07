import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  apiJson,
  isoDateFromToday,
  loginViaUi,
  loginWithApi,
  registerSalonViaApi,
  uniquePhone,
} from './fixtures';

const SMS_INBOX_URL = process.env.E2E_SMS_INBOX_URL ?? 'http://127.0.0.1:8025';

type DevSms = { id: string; phone: string; message: string; sentAt: string };
type Slot = { startAt: string };
type SalonNotification = {
  type: string;
  payload: { appointmentId?: string } | null;
};
type CustomerNotification = { type: string; appointmentId: string | null; title: string };

async function smsFor(request: APIRequestContext, phone: string): Promise<DevSms[]> {
  const response = await request.get(`${SMS_INBOX_URL}/api/messages`);
  expect(response.ok(), 'development SMS inbox should be reachable').toBe(true);
  const messages = (await response.json()) as DevSms[];
  return messages.filter((message) => message.phone === phone);
}

async function expectNewSms(
  request: APIRequestContext,
  phone: string,
  previousIds: Set<string>,
  text: string,
): Promise<DevSms> {
  await expect
    .poll(
      async () =>
        (await smsFor(request, phone)).some(
          (message) => !previousIds.has(message.id) && message.message.includes(text),
        ),
      { timeout: 15_000, message: `expected a new SMS to ${phone} containing «${text}»` },
    )
    .toBe(true);
  const message = (await smsFor(request, phone)).find(
    (item) => !previousIds.has(item.id) && item.message.includes(text),
  );
  expect(message).toBeDefined();
  return message!;
}

async function smsIds(request: APIRequestContext, phone: string): Promise<Set<string>> {
  return new Set((await smsFor(request, phone)).map((message) => message.id));
}

async function bookNextAvailable(
  request: APIRequestContext,
  salonId: string,
  serviceId: string,
  customerToken: string,
  date: string,
): Promise<{ id: string; status: string }> {
  const availability = await apiJson<{ slots: Slot[] }>(
    request,
    `/api/salons/${salonId}/availability?serviceId=${serviceId}&date=${date}`,
  );
  expect(availability.slots.length, `expected an available slot on ${date}`).toBeGreaterThan(0);
  const booking = await apiJson<{ appointment: { id: string }; status: string }>(
    request,
    '/api/appointments',
    {
      method: 'POST',
      token: customerToken,
      data: { salonId, serviceId, startAt: availability.slots[0].startAt },
    },
  );
  return { id: booking.appointment.id, status: booking.status };
}

async function expectSalonEvent(
  request: APIRequestContext,
  salonId: string,
  ownerToken: string,
  appointmentId: string,
  type: string,
): Promise<void> {
  const inbox = await apiJson<{ notifications: SalonNotification[] }>(
    request,
    `/api/salons/${salonId}/notifications?limit=200`,
    { token: ownerToken },
  );
  expect(
    inbox.notifications.some(
      (item) => item.type === type && item.payload?.appointmentId === appointmentId,
    ),
    `expected persisted salon event ${type} for ${appointmentId}`,
  ).toBe(true);
}

async function expectCustomerEvent(
  request: APIRequestContext,
  customerToken: string,
  appointmentId: string,
  type: string,
): Promise<void> {
  const inbox = await apiJson<{ notifications: CustomerNotification[] }>(
    request,
    '/api/customers/me/notifications',
    { token: customerToken },
  );
  expect(
    inbox.notifications.some((item) => item.type === type && item.appointmentId === appointmentId),
    `expected persisted customer event ${type} for ${appointmentId}`,
  ).toBe(true);
}

async function expectOwnerLiveAlert(page: Page, title: string): Promise<void> {
  await expect(page.getByTestId('owner-live-alert')).toContainText(title, { timeout: 15_000 });
}

async function expectCustomerLiveNotification(page: Page, title: string): Promise<void> {
  await expect(
    page.getByTestId('customer-notifications-popover').getByRole('button', { name: title }),
  ).toBeVisible({ timeout: 15_000 });
}

test('booking, rejection, reschedule, cancellation, walk-in SMS and realtime notifications', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180_000);
  const salon = await registerSalonViaApi(request, 'QA Notification Delivery');
  await apiJson(request, `/api/salons/${salon.salonId}/booking-policy`, {
    method: 'PUT',
    token: salon.accessToken,
    data: { bookingWindowDays: 12, bookingStartOffsetDays: 0 },
  });
  await apiJson(request, `/api/salons/${salon.salonId}/sms-settings`, {
    method: 'PATCH',
    token: salon.accessToken,
    data: { ownerBooking: true, ownerCancellation: true },
  });
  const catalog = await apiJson<{ services: Array<{ id: string; name: string }> }>(
    request,
    `/api/salons/${salon.salonId}/services`,
  );
  const service =
    catalog.services.find((item) => item.name === salon.serviceName) ?? catalog.services[0];
  expect(service).toBeDefined();

  await loginViaUi(page, salon.ownerPhone, /\/owner(?:\/calendar)?(?:\?|$)/);
  await page.goto('/owner/calendar');
  await expect(page.getByRole('banner').getByRole('button', { name: 'اعلان‌ها' })).toBeVisible();
  let ownerNavigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) ownerNavigations += 1;
  });

  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  const secondCustomerContext = await browser.newContext();
  const secondCustomerPage = await secondCustomerContext.newPage();
  try {
    const firstPhone = uniquePhone('3');
    const firstCustomer = await loginWithApi(request, firstPhone);
    await loginViaUi(customerPage, firstPhone, /\/account(?:\?|$)/);
    await customerPage.getByTestId('customer-notifications-bell').click();
    const firstCustomerPopover = customerPage.getByTestId('customer-notifications-popover');
    await expect(firstCustomerPopover).toBeVisible();

    const date = isoDateFromToday(1);
    const ownerBookingBaseline = await smsIds(request, salon.ownerPhone);
    const first = await bookNextAvailable(
      request,
      salon.salonId,
      service!.id,
      firstCustomer.accessToken,
      date,
    );
    expect(first.status).toBe('pending');
    await expectNewSms(request, salon.ownerPhone, ownerBookingBaseline, 'رزرو جدید');
    await expectOwnerLiveAlert(page, 'نوبت در انتظار تأیید');
    await expectSalonEvent(request, salon.salonId, salon.accessToken, first.id, 'booking.pending');

    const firstCustomerSmsBaseline = await smsIds(request, firstPhone);
    await apiJson(request, `/api/appointments/${first.id}/approve`, {
      method: 'POST',
      token: salon.accessToken,
    });
    await expectNewSms(request, firstPhone, firstCustomerSmsBaseline, 'تأیید شد');
    await expectOwnerLiveAlert(page, 'نوبت تأیید شد');
    await expectCustomerLiveNotification(customerPage, 'تأیید نوبت');
    await expectSalonEvent(request, salon.salonId, salon.accessToken, first.id, 'booking.approved');
    await expectCustomerEvent(request, firstCustomer.accessToken, first.id, 'booking.confirmed');

    const nextAvailability = await apiJson<{ slots: Slot[] }>(
      request,
      `/api/salons/${salon.salonId}/availability?serviceId=${service!.id}&date=${date}`,
    );
    const proposalSlot = nextAvailability.slots.find(
      (slot) => slot.startAt !== nextAvailability.slots[0]?.startAt,
    );
    expect(proposalSlot, 'reschedule proposal needs a different free time').toBeDefined();
    const proposalSmsBaseline = await smsIds(request, firstPhone);
    await apiJson(request, `/api/appointments/${first.id}/reschedule`, {
      method: 'PATCH',
      token: salon.accessToken,
      data: { startAt: proposalSlot!.startAt },
    });
    await expectNewSms(request, firstPhone, proposalSmsBaseline, 'پیشنهاد داده زمان نوبت');
    await expectOwnerLiveAlert(page, 'تغییر زمان نوبت');
    await expectCustomerLiveNotification(customerPage, 'پیشنهاد تغییر زمان نوبت');
    await expectSalonEvent(
      request,
      salon.salonId,
      salon.accessToken,
      first.id,
      'appointment.reschedule.requested',
    );
    await expectCustomerEvent(
      request,
      firstCustomer.accessToken,
      first.id,
      'booking.reschedule.proposed',
    );

    await apiJson(request, `/api/appointments/${first.id}/reschedule/accept`, {
      method: 'POST',
      token: firstCustomer.accessToken,
    });
    await expectOwnerLiveAlert(page, 'تغییر زمان تأیید شد');
    await expectSalonEvent(
      request,
      salon.salonId,
      salon.accessToken,
      first.id,
      'appointment.reschedule.accepted',
    );

    const customerCancelSmsBaseline = await smsIds(request, firstPhone);
    const ownerCancelSmsBaseline = await smsIds(request, salon.ownerPhone);
    const customerCancel = await apiJson<{ status: string }>(
      request,
      `/api/appointments/${first.id}/cancel`,
      { method: 'POST', token: firstCustomer.accessToken },
    );
    expect(customerCancel.status).toBe('cancelled');
    await expectNewSms(request, firstPhone, customerCancelSmsBaseline, 'لغو شد');
    await expectNewSms(request, salon.ownerPhone, ownerCancelSmsBaseline, 'لغو نوبت');
    await expectOwnerLiveAlert(page, 'نوبت لغو شد');
    await expectCustomerLiveNotification(customerPage, 'نوبت لغو شد');
    await expectSalonEvent(
      request,
      salon.salonId,
      salon.accessToken,
      first.id,
      'appointment.cancelled',
    );
    await expectCustomerEvent(request, firstCustomer.accessToken, first.id, 'booking.cancelled');

    const secondPhone = uniquePhone('4');
    const secondCustomer = await loginWithApi(request, secondPhone);
    await loginViaUi(secondCustomerPage, secondPhone, /\/account(?:\?|$)/);
    await secondCustomerPage.getByTestId('customer-notifications-bell').click();
    const secondPopover = secondCustomerPage.getByTestId('customer-notifications-popover');
    await expect(secondPopover).toBeVisible();
    const second = await bookNextAvailable(
      request,
      salon.salonId,
      service!.id,
      secondCustomer.accessToken,
      date,
    );
    expect(second.status).toBe('pending');
    await apiJson(request, `/api/appointments/${second.id}/approve`, {
      method: 'POST',
      token: salon.accessToken,
    });
    await expectCustomerLiveNotification(secondCustomerPage, 'تأیید نوبت');
    const salonCancelCustomerSmsBaseline = await smsIds(request, secondPhone);
    const salonCancelStaffSmsBaseline = await smsIds(request, salon.ownerPhone);
    await apiJson(request, `/api/appointments/${second.id}/cancel`, {
      method: 'POST',
      token: salon.accessToken,
      data: { reason: 'برنامه سالن تغییر کرد' },
    });
    await expectNewSms(
      request,
      secondPhone,
      salonCancelCustomerSmsBaseline,
      'برنامه سالن تغییر کرد',
    );
    await expectNewSms(request, salon.ownerPhone, salonCancelStaffSmsBaseline, 'لغو نوبت');
    await expectOwnerLiveAlert(page, 'نوبت لغو شد');
    await expectCustomerLiveNotification(secondCustomerPage, 'نوبت لغو شد');
    await expectSalonEvent(
      request,
      salon.salonId,
      salon.accessToken,
      second.id,
      'appointment.cancelled',
    );
    await expectCustomerEvent(request, secondCustomer.accessToken, second.id, 'booking.cancelled');

    const rejectedPhone = uniquePhone('5');
    const rejectedCustomer = await loginWithApi(request, rejectedPhone);
    const rejected = await bookNextAvailable(
      request,
      salon.salonId,
      service!.id,
      rejectedCustomer.accessToken,
      date,
    );
    const rejectionSmsBaseline = await smsIds(request, rejectedPhone);
    const staffRejectionSmsBaseline = await smsIds(request, salon.ownerPhone);
    await apiJson(request, `/api/appointments/${rejected.id}/reject`, {
      method: 'POST',
      token: salon.accessToken,
      data: { reason: 'ظرفیت این زمان تکمیل شد' },
    });
    await expectNewSms(request, rejectedPhone, rejectionSmsBaseline, 'تأیید نشد');
    await expectNewSms(request, salon.ownerPhone, staffRejectionSmsBaseline, 'لغو نوبت');
    await expectOwnerLiveAlert(page, 'نوبت رد شد');
    await expectSalonEvent(
      request,
      salon.salonId,
      salon.accessToken,
      rejected.id,
      'booking.rejected',
    );
    await expectCustomerEvent(
      request,
      rejectedCustomer.accessToken,
      rejected.id,
      'booking.rejected',
    );
    const rejectionInbox = await apiJson<{ notifications: CustomerNotification[] }>(
      request,
      '/api/customers/me/notifications',
      { token: rejectedCustomer.accessToken },
    );
    expect(
      rejectionInbox.notifications.find((item) => item.appointmentId === rejected.id)?.title,
    ).toBe('نوبت رد شد');

    const walkInPhone = uniquePhone('6');
    const ownerSmsBeforeWalkIn = await smsIds(request, salon.ownerPhone);
    const walkInAvailability = await apiJson<{ slots: Slot[] }>(
      request,
      `/api/salons/${salon.salonId}/availability?serviceId=${service!.id}&date=${date}`,
    );
    expect(walkInAvailability.slots.length).toBeGreaterThan(0);
    const walkIn = await apiJson<{
      status: string;
      appointment: { id: string; status: string; source: string };
    }>(request, `/api/salons/${salon.salonId}/appointments/manual`, {
      method: 'POST',
      token: salon.accessToken,
      data: {
        serviceId: service!.id,
        startAt: walkInAvailability.slots[0].startAt,
        phone: walkInPhone,
        fullName: 'مشتری حضوری QA',
        locationType: 'salon',
      },
    });
    expect(walkIn).toMatchObject({
      status: 'confirmed',
      appointment: { status: 'confirmed', source: 'walkin' },
    });
    await expectNewSms(request, walkInPhone, new Set(), 'تأیید شد');
    await expectOwnerLiveAlert(page, 'نوبت حضوری ثبت شد');
    await expectSalonEvent(
      request,
      salon.salonId,
      salon.accessToken,
      walkIn.appointment.id,
      'walkin.created',
    );
    await expect
      .poll(async () => (await smsIds(request, salon.ownerPhone)).size)
      .toBe(ownerSmsBeforeWalkIn.size);

    expect(ownerNavigations, 'staff notification events must arrive without page refresh').toBe(0);
    expect(
      await customerPage.evaluate(() => window.location.pathname),
      'customer page must remain open while realtime notifications arrive',
    ).toBe('/account');
    expect(
      await secondCustomerPage.evaluate(() => window.location.pathname),
      'customer page must remain open while salon cancellation notification arrives',
    ).toBe('/account');
  } finally {
    await customerContext.close();
    await secondCustomerContext.close();
  }
});
