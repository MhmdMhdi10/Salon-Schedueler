import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  apiCall,
  apiJson,
  isoDateFromToday,
  loginViaUi,
  loginWithApi,
  registerSalonViaApi,
  uniquePhone,
} from './fixtures';

test.describe.configure({ timeout: 180_000 });

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type WorkMode = 'fixed_salon' | 'rented_chair' | 'home' | 'mobile' | 'hybrid' | 'not_decided';

type Slot = { startAt: string; endAt: string };

type Appointment = {
  id: string;
  salonId: string;
  customerId: string;
  staffMemberId: string;
  status: string;
  startAt: string;
  [key: string]: unknown;
};

type ScenarioSalon = {
  salonId: string;
  ownerPhone: string;
  ownerToken: string;
  serviceId: string;
  serviceName: string;
};

async function registerScenarioSalon(
  request: APIRequestContext,
  label: string,
  workMode: WorkMode,
  teamMembers: string[] = [],
): Promise<ScenarioSalon> {
  const ownerPhone = uniquePhone('8');
  const serviceName = `${label} خدمت ${Date.now()}`;
  const created = await apiCall<{ salonId: string; salonName: string }>(
    request,
    '/api/register/salon',
    {
      method: 'POST',
      data: {
        salonName: `${label} سالن ${Date.now()}`,
        ownerName: `${label} صاحب سالن`,
        phone: ownerPhone,
        workMode,
        services: [{ name: serviceName, durationMinutes: 30, priceRial: 500000 }],
        teamMembers: teamMembers.map((fullName) => ({ fullName })),
        chairCount: Math.max(1, teamMembers.length + 1),
      },
    },
  );
  expect(created.response.status()).toBe(201);

  const owner = await loginWithApi(request, ownerPhone);
  const catalog = await apiJson<{ services: Array<{ id: string; name: string }> }>(
    request,
    `/api/salons/${created.body.salonId}/services`,
  );
  const service = catalog.services.find((item) => item.name === serviceName);
  expect(service).toBeDefined();

  await apiJson(request, `/api/salons/${created.body.salonId}/booking-policy`, {
    method: 'PUT',
    data: { bookingWindowDays: 12, bookingStartOffsetDays: 0 },
    token: owner.accessToken,
  });

  return {
    salonId: created.body.salonId,
    ownerPhone,
    ownerToken: owner.accessToken,
    serviceId: service!.id,
    serviceName,
  };
}

async function availability(
  request: APIRequestContext,
  salonId: string,
  serviceId: string,
  date: string,
  options: { locationType?: 'salon' | 'customer'; staffId?: string; durationMinutes?: number } = {},
): Promise<Slot[]> {
  const params = new URLSearchParams({ serviceId, date });
  if (options.locationType) params.set('locationType', options.locationType);
  if (options.staffId) params.set('staffId', options.staffId);
  if (options.durationMinutes) params.set('durationMinutes', String(options.durationMinutes));
  const result = await apiJson<{ slots: Slot[] }>(
    request,
    `/api/salons/${salonId}/availability?${params.toString()}`,
  );
  return result.slots;
}

async function nextSlot(
  request: APIRequestContext,
  salonId: string,
  serviceId: string,
  date: string,
  options: { locationType?: 'salon' | 'customer'; staffId?: string; durationMinutes?: number } = {},
): Promise<Slot> {
  const slots = await availability(request, salonId, serviceId, date, options);
  expect(slots.length, `expected a slot on ${date}`).toBeGreaterThan(0);
  return slots[0];
}

async function book(
  request: APIRequestContext,
  salon: ScenarioSalon,
  customerToken: string,
  slot: Slot,
  options: {
    locationType?: 'salon' | 'customer';
    locationAddress?: string;
    customerNote?: string;
    durationMinutes?: number;
    preferredStaffId?: string;
  } = {},
): Promise<{
  status: string;
  appointment: Appointment;
  paymentRedirectUrl?: string;
  deposit?: Record<string, unknown>;
}> {
  const result = await apiCall<{
    status: string;
    appointment: Appointment;
    paymentRedirectUrl?: string;
    deposit?: Record<string, unknown>;
  }>(request, '/api/appointments', {
    method: 'POST',
    token: customerToken,
    data: {
      salonId: salon.salonId,
      serviceId: salon.serviceId,
      startAt: slot.startAt,
      ...(options.locationType ? { locationType: options.locationType } : {}),
      ...(options.locationAddress ? { locationAddress: options.locationAddress } : {}),
      ...(options.customerNote ? { customerNote: options.customerNote } : {}),
      ...(options.durationMinutes !== undefined
        ? { durationMinutes: options.durationMinutes }
        : {}),
      ...(options.preferredStaffId ? { preferredStaffId: options.preferredStaffId } : {}),
    },
  });
  expect(result.response.status()).toBe(200);
  expect(result.body.appointment.id).toBeTruthy();
  return result.body;
}

async function expectStatus(
  request: APIRequestContext,
  path: string,
  expectedStatus: number,
  options: Parameters<typeof apiCall>[2] = {},
): Promise<Record<string, unknown>> {
  const result = await apiCall<Record<string, unknown>>(request, path, options);
  expect(result.response.status(), `${options.method ?? 'GET'} ${path}`).toBe(expectedStatus);
  return result.body;
}

test.describe('remaining authentication and tenant variants', () => {
  test('invalidates old OTP, prevents replay, lists contexts, switches salon, and logs out', async ({
    request,
  }) => {
    const first = await registerSalonViaApi(request, 'E2E Context First');
    const secondRegistration = await apiCall<{ salonId: string }>(request, '/api/register/salon', {
      method: 'POST',
      data: {
        salonName: `E2E Context Second ${Date.now()}`,
        ownerName: 'صاحب چند سالن',
        phone: first.ownerPhone,
        workMode: 'fixed_salon',
      },
    });
    expect(secondRegistration.response.status()).toBe(201);

    const withoutToken = await apiCall(request, '/api/auth/contexts');
    expect(withoutToken.response.status()).toBe(401);

    const firstOtp = await apiJson<{ devOtp?: string }>(request, '/api/auth/otp/request', {
      method: 'POST',
      data: { phone: first.ownerPhone },
    });
    const secondOtp = await apiJson<{ devOtp?: string }>(request, '/api/auth/otp/request', {
      method: 'POST',
      data: { phone: first.ownerPhone },
    });
    expect(firstOtp.devOtp).toMatch(/^\d{6}$/);
    expect(secondOtp.devOtp).toMatch(/^\d{6}$/);

    const superseded = await apiCall(request, '/api/auth/otp/verify', {
      method: 'POST',
      data: { phone: first.ownerPhone, code: firstOtp.devOtp },
      headers: { 'X-Auth-Client': 'mobile' },
    });
    expect(superseded.response.status()).toBe(401);
    expect(superseded.body).toMatchObject({ code: 'OTP_INVALID' });

    const current = await apiJson<{ accessToken: string; refreshToken: string }>(
      request,
      '/api/auth/otp/verify',
      {
        method: 'POST',
        data: { phone: first.ownerPhone, code: secondOtp.devOtp },
        headers: { 'X-Auth-Client': 'mobile' },
      },
    );
    const replay = await apiCall(request, '/api/auth/otp/verify', {
      method: 'POST',
      data: { phone: first.ownerPhone, code: secondOtp.devOtp },
      headers: { 'X-Auth-Client': 'mobile' },
    });
    expect(replay.response.status()).toBe(401);
    expect(replay.body).toMatchObject({ code: 'OTP_INVALID' });

    const contexts = await apiJson<{
      staffContexts: Array<{ staffMemberId: string; salonId: string; role: string }>;
    }>(request, '/api/auth/contexts', { token: current.accessToken });
    const target = contexts.staffContexts.find(
      (context) => context.salonId === secondRegistration.body.salonId,
    );
    expect(target).toBeDefined();
    expect(contexts.staffContexts.length).toBeGreaterThanOrEqual(2);

    const switched = await apiJson<{ accessToken: string; refreshToken: string }>(
      request,
      '/api/auth/context',
      {
        method: 'POST',
        data: { staffMemberId: target!.staffMemberId },
        token: current.accessToken,
        headers: { 'X-Auth-Client': 'mobile' },
      },
    );
    const me = await apiJson<{ principal: { role: string; salonId: string } }>(request, '/api/me', {
      token: switched.accessToken,
    });
    expect(me.principal).toMatchObject({ role: 'Owner', salonId: secondRegistration.body.salonId });

    const logout = await apiCall(request, '/api/auth/logout', {
      method: 'POST',
      token: switched.accessToken,
    });
    expect(logout.response.status()).toBe(204);
  });

  test('resolves every registered work mode to the correct public location matrix', async ({
    request,
  }) => {
    const cases: Array<{ mode: WorkMode; locations: Array<'salon' | 'customer'> }> = [
      { mode: 'fixed_salon', locations: ['salon'] },
      { mode: 'rented_chair', locations: ['salon'] },
      { mode: 'home', locations: ['salon'] },
      { mode: 'mobile', locations: ['customer'] },
      { mode: 'hybrid', locations: ['salon', 'customer'] },
      { mode: 'not_decided', locations: ['salon'] },
    ];

    for (const item of cases) {
      const salon = await registerScenarioSalon(request, `E2E ${item.mode}`, item.mode);
      const policy = await apiJson<{
        workMode: WorkMode;
        locationTypes: Array<'salon' | 'customer'>;
      }>(request, `/api/salons/${salon.salonId}/booking-policy`);
      expect(policy).toMatchObject({ workMode: item.mode, locationTypes: item.locations });

      const date = isoDateFromToday(2);
      const salonSlots = await availability(request, salon.salonId, salon.serviceId, date, {
        locationType: 'salon',
      });
      const customerSlots = await availability(request, salon.salonId, salon.serviceId, date, {
        locationType: 'customer',
      });
      // Mobile mode canonicalizes any crafted `locationType=salon` request to
      // the customer lane. The public policy still exposes only the supported
      // customer choice; this verifies both policy and server-side behavior.
      const salonRequestHasSlots = item.mode === 'mobile' || item.locations.includes('salon');
      expect(salonSlots.length > 0).toBe(salonRequestHasSlots);
      expect(customerSlots.length > 0).toBe(item.locations.includes('customer'));
    }
  });
});

test.describe('booking, profile, waitlist, support, and referral variants', () => {
  test('covers booking validation, customer address, duplicate intent, walk-in, profile, waitlist, and support attachment', async ({
    request,
  }) => {
    const salon = await registerScenarioSalon(request, 'E2E Input Matrix', 'hybrid', [
      'آرایشگر اول',
      'آرایشگر دوم',
    ]);
    const staff = await apiJson<{
      staff: Array<{ role: string; fullName: string | null; id: string }>;
    }>(request, `/api/salons/${salon.salonId}/staff`, { token: salon.ownerToken });
    expect(staff.staff.filter((member) => member.role === 'Stylist')).toHaveLength(2);

    const customer = await loginWithApi(request, uniquePhone('7'));
    const slot = await nextSlot(request, salon.salonId, salon.serviceId, isoDateFromToday(2), {
      locationType: 'customer',
    });

    await expectStatus(request, '/api/appointments', 400, {
      method: 'POST',
      token: customer.accessToken,
      data: { salonId: salon.salonId, startAt: slot.startAt },
    });
    await expectStatus(request, '/api/appointments', 400, {
      method: 'POST',
      token: customer.accessToken,
      data: {
        salonId: salon.salonId,
        serviceId: salon.serviceId,
        startAt: slot.startAt,
        locationType: 'street',
      },
    });
    await expectStatus(request, '/api/appointments', 400, {
      method: 'POST',
      token: customer.accessToken,
      data: {
        salonId: salon.salonId,
        serviceId: salon.serviceId,
        startAt: slot.startAt,
        locationType: 'customer',
      },
    });
    await expectStatus(request, '/api/appointments', 400, {
      method: 'POST',
      token: customer.accessToken,
      data: {
        salonId: salon.salonId,
        serviceId: salon.serviceId,
        startAt: slot.startAt,
        locationType: 'customer',
        locationAddress: 'آدرس تستی مشتری',
        durationMinutes: 4,
      },
    });
    await expectStatus(request, '/api/appointments', 403, {
      method: 'POST',
      token: customer.accessToken,
      data: {
        salonId: salon.salonId,
        serviceId: salon.serviceId,
        startAt: slot.startAt,
        locationType: 'customer',
        locationAddress: 'آدرس تستی مشتری',
        website: 'filled-by-bot',
      },
    });

    const booking = await book(request, salon, customer.accessToken, slot, {
      locationType: 'customer',
      locationAddress: 'تهران، خیابان تست، پلاک ۱',
      customerNote: 'لطفاً قبل از حرکت تماس بگیرید',
      durationMinutes: 30,
    });
    expect(booking.status).toBe('pending');
    expect(booking.appointment).toMatchObject({
      locationType: 'customer',
      locationAddress: 'تهران، خیابان تست، پلاک ۱',
      customerNote: 'لطفاً قبل از حرکت تماس بگیرید',
    });

    const duplicate = await apiCall(request, '/api/appointments', {
      method: 'POST',
      token: customer.accessToken,
      data: {
        salonId: salon.salonId,
        serviceId: salon.serviceId,
        startAt: slot.startAt,
        locationType: 'customer',
        locationAddress: 'تهران، خیابان تست، پلاک ۱',
      },
    });
    expect(duplicate.response.status()).toBe(409);
    expect(duplicate.body).toMatchObject({ code: 'DUPLICATE_BOOKING' });

    const walkInPhone = uniquePhone('6');
    const walkInSlot = await nextSlot(
      request,
      salon.salonId,
      salon.serviceId,
      isoDateFromToday(3),
      {
        locationType: 'salon',
      },
    );
    const walkIn = await apiJson<{ status: string; appointment: Appointment }>(
      request,
      `/api/salons/${salon.salonId}/appointments/manual`,
      {
        method: 'POST',
        token: salon.ownerToken,
        data: {
          serviceId: salon.serviceId,
          startAt: walkInSlot.startAt,
          phone: walkInPhone,
          fullName: 'مشتری حضوری',
          locationType: 'salon',
          customerNote: 'ثبت از پذیرش',
        },
      },
    );
    expect(walkIn.status).toBe('confirmed');
    expect(walkIn.appointment).toMatchObject({ status: 'confirmed', source: 'walkin' });

    const walkInCustomer = await loginWithApi(request, walkInPhone);
    const invalidProfile = await apiCall(request, '/api/customers/me/profile', {
      method: 'PATCH',
      token: walkInCustomer.accessToken,
      data: { fullName: 'x' },
    });
    expect(invalidProfile.response.status()).toBe(400);
    const profile = await apiJson<{ customer: { fullName: string } }>(
      request,
      '/api/customers/me/profile',
      {
        method: 'PATCH',
        token: walkInCustomer.accessToken,
        data: { fullName: 'مشتری حضوری ویرایش‌شده' },
      },
    );
    expect(profile.customer.fullName).toBe('مشتری حضوری ویرایش‌شده');
    const history = await apiJson<{ appointments: Appointment[] }>(
      request,
      '/api/customers/me/appointments',
      {
        token: walkInCustomer.accessToken,
      },
    );
    expect(
      history.appointments.some((appointment) => appointment.id === walkIn.appointment.id),
    ).toBe(true);

    const waitlistDate = isoDateFromToday(4);
    const waitlistStart = new Date(`${waitlistDate}T09:00:00+03:30`);
    const waitlistEnd = new Date(`${waitlistDate}T18:00:00+03:30`);
    const waitlist = await apiJson<{ waitlist: { id: string; status: string } }>(
      request,
      `/api/salons/${salon.salonId}/waitlist`,
      {
        method: 'POST',
        token: customer.accessToken,
        data: {
          serviceId: salon.serviceId,
          windowStart: waitlistStart.toISOString(),
          windowEnd: waitlistEnd.toISOString(),
        },
      },
    );
    expect(waitlist.waitlist.status).toBe('waiting');
    const customerWaitlist = await apiJson<{ waitlist: Array<{ id: string }> }>(
      request,
      '/api/customers/me/waitlist',
      { token: customer.accessToken },
    );
    expect(customerWaitlist.waitlist.some((entry) => entry.id === waitlist.waitlist.id)).toBe(true);
    const ownerWaitlist = await apiJson<{ waitlist: Array<{ id: string }> }>(
      request,
      `/api/salons/${salon.salonId}/waitlist`,
      { token: salon.ownerToken },
    );
    expect(ownerWaitlist.waitlist.some((entry) => entry.id === waitlist.waitlist.id)).toBe(true);
    const otherCustomer = await loginWithApi(request, uniquePhone('5'));
    const wrongCancel = await apiCall(request, `/api/waitlist/${waitlist.waitlist.id}`, {
      method: 'DELETE',
      token: otherCustomer.accessToken,
    });
    expect(wrongCancel.response.status()).toBe(403);
    const invalidWindow = await apiCall(request, `/api/salons/${salon.salonId}/waitlist`, {
      method: 'POST',
      token: customer.accessToken,
      data: {
        serviceId: salon.serviceId,
        windowStart: waitlistEnd.toISOString(),
        windowEnd: waitlistStart.toISOString(),
      },
    });
    expect(invalidWindow.response.status()).toBe(400);
    const cancelledWaitlist = await apiJson<{ waitlist: { status: string } }>(
      request,
      `/api/waitlist/${waitlist.waitlist.id}`,
      { method: 'DELETE', token: customer.accessToken },
    );
    expect(cancelledWaitlist.waitlist.status).toBe('cancelled');

    const support = await apiJson<{ ticket: { id: string; message: string } }>(
      request,
      '/api/support/tickets',
      {
        method: 'POST',
        token: customer.accessToken,
        headers: { 'X-Request-Id': 'e2e-support-request' },
        data: {
          message: 'در صفحه رزرو پیام راهنما نمایش داده نمی‌شود',
          page: `/salon/${salon.salonId}/book`,
          action: 'open-booking-confirm',
          browser: 'Playwright Chromium',
          device: 'desktop',
          screenshot: { name: 'booking.png', mime: 'image/png', dataBase64: PNG_BASE64 },
        },
      },
    );
    expect(support.ticket.id).toBeTruthy();
    const mine = await apiJson<{ tickets: Array<{ id: string }> }>(
      request,
      '/api/support/tickets/mine',
      {
        token: customer.accessToken,
      },
    );
    expect(mine.tickets.some((ticket) => ticket.id === support.ticket.id)).toBe(true);
    await expectStatus(request, '/api/support/tickets', 400, {
      method: 'POST',
      token: customer.accessToken,
      data: { message: 'بد' },
    });
  });

  test('creates, claims, scopes, and rejects premature referral redemption', async ({
    request,
  }) => {
    const referrer = await loginWithApi(request, uniquePhone('3'));
    const salonPhone = uniquePhone('4');
    const created = await apiCall<{ referral: { id: string; claimToken: string; status: string } }>(
      request,
      '/api/referrals',
      {
        method: 'POST',
        token: referrer.accessToken,
        data: { salonName: 'سالن معرفی‌شده', city: 'تهران', salonPhone },
      },
    );
    expect(created.response.status()).toBe(201);
    expect(created.body.referral.status).toBe('submitted');

    const preview = await apiJson<{ referral: { salonName: string; status: string } }>(
      request,
      `/api/referrals/claim/${created.body.referral.claimToken}`,
    );
    expect(preview.referral).toMatchObject({ salonName: 'سالن معرفی‌شده', status: 'submitted' });

    const duplicate = await apiCall(request, '/api/referrals', {
      method: 'POST',
      token: referrer.accessToken,
      data: { salonName: 'سالن معرفی‌شده دوباره', city: 'تهران', salonPhone },
    });
    expect(duplicate.response.status()).toBe(409);
    expect(duplicate.body).toMatchObject({ code: 'REFERRAL_EXISTS' });

    const ownerPhone = uniquePhone('2');
    const linked = await apiCall<{ salonId: string }>(request, '/api/register/salon', {
      method: 'POST',
      data: {
        salonName: 'سالن معرفی‌شده',
        ownerName: 'صاحب سالن معرفی‌شده',
        phone: ownerPhone,
        referralToken: created.body.referral.claimToken,
        workMode: 'fixed_salon',
        services: [{ name: 'خدمت معرفی‌شده', durationMinutes: 30, priceRial: 300000 }],
        chairCount: 1,
      },
    });
    expect(linked.response.status()).toBe(201);
    const linkedOwner = await loginWithApi(request, ownerPhone);
    const claimedPreview = await apiJson<{ referral: { status: string } }>(
      request,
      `/api/referrals/claim/${created.body.referral.claimToken}`,
    );
    expect(claimedPreview.referral.status).toBe('claimed');

    const customerList = await apiJson<{
      referrals: Array<{ id: string; salonId: string | null }>;
    }>(request, '/api/customers/me/referrals', { token: referrer.accessToken });
    expect(customerList.referrals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.referral.id, salonId: linked.body.salonId }),
      ]),
    );
    const salonList = await apiJson<{ referrals: Array<{ id: string; salonId: string | null }> }>(
      request,
      `/api/salons/${linked.body.salonId}/referrals`,
      { token: linkedOwner.accessToken },
    );
    expect(salonList.referrals).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.body.referral.id })]),
    );
    const otherSalon = await registerSalonViaApi(request, 'E2E Wrong Referral Salon');
    const wrongSalonRedeem = await apiCall(
      request,
      `/api/referrals/${created.body.referral.id}/redeem`,
      { method: 'POST', token: otherSalon.accessToken },
    );
    expect(wrongSalonRedeem.response.status()).toBe(403);
    const prematureRedeem = await apiCall(
      request,
      `/api/referrals/${created.body.referral.id}/redeem`,
      { method: 'POST', token: linkedOwner.accessToken },
    );
    expect(prematureRedeem.response.status()).toBe(409);
    expect(prematureRedeem.body).toMatchObject({ code: 'NOT_REWARDABLE' });
  });
});

test.describe('appointment lifecycle and payment variants', () => {
  test('covers direct reschedule, staff proposal accept/reject, cancellation proof, and report', async ({
    request,
  }) => {
    const salon = await registerScenarioSalon(request, 'E2E Lifecycle', 'hybrid');
    const owner = salon.ownerToken;
    const customer = await loginWithApi(request, uniquePhone('1'));

    const directStart = await nextSlot(
      request,
      salon.salonId,
      salon.serviceId,
      isoDateFromToday(2),
      {
        locationType: 'salon',
      },
    );
    const direct = await book(request, salon, customer.accessToken, directStart, {
      locationType: 'salon',
    });
    const directTarget = await nextSlot(
      request,
      salon.salonId,
      salon.serviceId,
      isoDateFromToday(3),
      {
        locationType: 'salon',
      },
    );
    const moved = await apiJson<{
      status: string;
      appointment: Appointment;
      previousAppointmentId: string;
    }>(request, `/api/appointments/${direct.appointment.id}/reschedule`, {
      method: 'POST',
      token: customer.accessToken,
      data: { startAt: directTarget.startAt },
    });
    expect(moved).toMatchObject({
      status: 'pending',
      previousAppointmentId: direct.appointment.id,
    });
    expect(moved.appointment.startAt).toBe(directTarget.startAt);

    const acceptedStart = await nextSlot(
      request,
      salon.salonId,
      salon.serviceId,
      isoDateFromToday(4),
      {
        locationType: 'salon',
      },
    );
    const accepted = await book(request, salon, customer.accessToken, acceptedStart, {
      locationType: 'salon',
    });
    await apiJson(request, `/api/appointments/${accepted.appointment.id}/approve`, {
      method: 'POST',
      token: owner,
    });
    const acceptedTarget = await nextSlot(
      request,
      salon.salonId,
      salon.serviceId,
      isoDateFromToday(5),
      {
        locationType: 'salon',
      },
    );
    const proposal = await apiJson<{
      status: string;
      appointment: Appointment;
      pendingReschedule: { startAt: string };
    }>(request, `/api/appointments/${accepted.appointment.id}/reschedule`, {
      method: 'PATCH',
      token: owner,
      data: { startAt: acceptedTarget.startAt },
    });
    expect(proposal).toMatchObject({
      status: 'confirmed',
      appointment: { id: accepted.appointment.id },
    });
    expect(proposal.pendingReschedule.startAt).toBe(acceptedTarget.startAt);
    const acceptedDecision = await apiJson<{ decision: string; appointment: Appointment }>(
      request,
      `/api/appointments/${accepted.appointment.id}/reschedule/accept`,
      { method: 'POST', token: customer.accessToken },
    );
    expect(acceptedDecision).toMatchObject({
      decision: 'accepted',
      appointment: { status: 'confirmed' },
    });
    expect(acceptedDecision.appointment.startAt).toBe(acceptedTarget.startAt);

    const rejectedStart = await nextSlot(
      request,
      salon.salonId,
      salon.serviceId,
      isoDateFromToday(6),
      {
        locationType: 'salon',
      },
    );
    const rejected = await book(request, salon, customer.accessToken, rejectedStart, {
      locationType: 'salon',
    });
    await apiJson(request, `/api/appointments/${rejected.appointment.id}/approve`, {
      method: 'POST',
      token: owner,
    });
    const rejectedTarget = await nextSlot(
      request,
      salon.salonId,
      salon.serviceId,
      isoDateFromToday(7),
      {
        locationType: 'salon',
      },
    );
    await apiJson(request, `/api/appointments/${rejected.appointment.id}/reschedule`, {
      method: 'PATCH',
      token: owner,
      data: { startAt: rejectedTarget.startAt },
    });
    const rejectedDecision = await apiJson<{ decision: string; appointment: Appointment }>(
      request,
      `/api/appointments/${rejected.appointment.id}/reschedule/reject`,
      { method: 'POST', token: customer.accessToken },
    );
    expect(rejectedDecision).toMatchObject({
      decision: 'rejected',
      appointment: { status: 'confirmed' },
    });
    expect(rejectedDecision.appointment.startAt).toBe(rejectedStart.startAt);

    const cancelledStart = await nextSlot(
      request,
      salon.salonId,
      salon.serviceId,
      isoDateFromToday(8),
      {
        locationType: 'salon',
      },
    );
    const cancelled = await book(request, salon, customer.accessToken, cancelledStart, {
      locationType: 'salon',
    });
    await apiJson(request, `/api/appointments/${cancelled.appointment.id}/approve`, {
      method: 'POST',
      token: owner,
    });
    const cancellation = await apiJson<{ status: string; appointment: Appointment }>(
      request,
      `/api/appointments/${cancelled.appointment.id}/cancel`,
      {
        method: 'POST',
        token: owner,
        data: {
          kind: 'emergency',
          reason: 'مشتری درخواست بازگشت وجه دارد',
          refundProof: { fileName: 'refund.png', mimeType: 'image/png', dataBase64: PNG_BASE64 },
        },
      },
    );
    expect(cancellation.status).toBe('cancelled');
    const cancellationRecord = await apiJson<{
      cancellation: { kind: string; cancelledBy: string; reason: string };
    }>(request, `/api/appointments/${cancelled.appointment.id}/cancellation`, { token: owner });
    expect(cancellationRecord.cancellation).toMatchObject({
      kind: 'emergency',
      cancelledBy: 'staff',
      reason: 'مشتری درخواست بازگشت وجه دارد',
    });
    const refundProof = await apiJson<{
      proof: { fileName: string; mimeType: string; dataBase64: string };
    }>(request, `/api/appointments/${cancelled.appointment.id}/cancellation/refund-proof`, {
      token: owner,
    });
    expect(refundProof.proof).toMatchObject({
      fileName: 'refund.png',
      mimeType: 'image/png',
      dataBase64: PNG_BASE64,
    });

    const reportStart = await nextSlot(
      request,
      salon.salonId,
      salon.serviceId,
      isoDateFromToday(9),
      {
        locationType: 'salon',
      },
    );
    const reported = await book(request, salon, customer.accessToken, reportStart, {
      locationType: 'salon',
    });
    const invalidEmergency = await apiCall(
      request,
      `/api/appointments/${reported.appointment.id}/cancel`,
      {
        method: 'POST',
        token: owner,
        data: { kind: 'emergency', reason: 'نه' },
      },
    );
    expect(invalidEmergency.response.status()).toBe(400);
    const invalidReport = await apiCall(
      request,
      `/api/appointments/${reported.appointment.id}/report-customer`,
      { method: 'POST', token: owner, data: { reason: 'نه' } },
    );
    expect(invalidReport.response.status()).toBe(400);
    const report = await apiJson<{ ok: boolean }>(
      request,
      `/api/appointments/${reported.appointment.id}/report-customer`,
      {
        method: 'POST',
        token: owner,
        data: { reason: 'مشتری در زمان حضور رفتار نامناسب داشت', block: false },
      },
    );
    expect(report.ok).toBe(true);
  });

  test('covers card-transfer receipt reject/approve, cash, gateway callback, and deposit read model', async ({
    request,
  }) => {
    const salon = await registerScenarioSalon(request, 'E2E Deposit', 'fixed_salon');
    const owner = salon.ownerToken;
    const customer = await loginWithApi(request, uniquePhone('9'));
    const depositService = await apiJson<{
      service: { id: string; requiresDeposit: boolean; depositRial: number };
    }>(request, `/api/salons/${salon.salonId}/services`, {
      method: 'POST',
      token: owner,
      data: {
        name: `پیش‌پرداخت ${Date.now()}`,
        durationMinutes: 30,
        priceRial: 500000,
        requiresDeposit: true,
        depositRial: 100000,
      },
    });
    const depositSalon = { ...salon, serviceId: depositService.service.id };
    await apiJson(request, `/api/salons/${salon.salonId}/deposit-settings`, {
      method: 'PATCH',
      token: owner,
      data: {
        depositMethod: 'card_transfer',
        depositCardNumber: '6037991234567890',
        depositCardHolder: 'صاحب تست',
        depositBankName: 'بانک تست',
      },
    });

    const rejectedSlot = await nextSlot(
      request,
      salon.salonId,
      depositService.service.id,
      isoDateFromToday(2),
    );
    const rejected = await book(request, depositSalon, customer.accessToken, rejectedSlot);
    expect(rejected.status).toBe('held');
    const initialDeposit = await apiJson<{ deposit: Record<string, unknown> }>(
      request,
      `/api/appointments/${rejected.appointment.id}/deposit`,
      { token: customer.accessToken },
    );
    expect(initialDeposit.deposit).toMatchObject({
      required: true,
      method: 'card_transfer',
      amountRial: 100000,
      receiptStatus: null,
    });
    await expectStatus(
      request,
      `/api/appointments/${rejected.appointment.id}/deposit-receipt`,
      400,
      {
        method: 'POST',
        token: customer.accessToken,
        data: { fileName: 'bad.txt', mimeType: 'text/plain', dataBase64: 'bad' },
      },
    );
    const rejectedReceipt = await apiJson<{ receipt: { receiptId: string; status: string } }>(
      request,
      `/api/appointments/${rejected.appointment.id}/deposit-receipt`,
      {
        method: 'POST',
        token: customer.accessToken,
        data: {
          fileName: 'card-transfer-rejected.png',
          mimeType: 'image/png',
          dataBase64: PNG_BASE64,
        },
      },
    );
    expect(rejectedReceipt.receipt.status).toBe('pending');
    const receiptFile = await apiJson<{ receipt: { dataBase64: string; status: string } }>(
      request,
      `/api/appointments/${rejected.appointment.id}/deposit-receipt`,
      { token: customer.accessToken },
    );
    expect(receiptFile.receipt).toMatchObject({ dataBase64: PNG_BASE64, status: 'pending' });
    const pendingBeforeReject = await apiJson<{ receipts: Array<{ appointmentId: string }> }>(
      request,
      `/api/salons/${salon.salonId}/deposit-receipts/pending`,
      { token: owner },
    );
    expect(
      pendingBeforeReject.receipts.some(
        (receipt) => receipt.appointmentId === rejected.appointment.id,
      ),
    ).toBe(true);
    const rejectedReview = await apiJson<{ receiptStatus: string; appointmentStatus: string }>(
      request,
      `/api/appointments/${rejected.appointment.id}/deposit-receipt/review`,
      { method: 'POST', token: owner, data: { decision: 'rejected', note: 'رسید خوانا نیست' } },
    );
    expect(rejectedReview).toEqual({ receiptStatus: 'rejected', appointmentStatus: 'held' });
    const rejectedOverview = await apiJson<{ deposit: Record<string, unknown> }>(
      request,
      `/api/appointments/${rejected.appointment.id}/deposit`,
      { token: customer.accessToken },
    );
    expect(rejectedOverview.deposit).toMatchObject({
      appointmentStatus: 'held',
      paymentStatus: 'failed',
      receiptStatus: 'rejected',
    });

    const approvedSlot = await nextSlot(
      request,
      salon.salonId,
      depositService.service.id,
      isoDateFromToday(3),
    );
    const approved = await book(request, depositSalon, customer.accessToken, approvedSlot);
    await apiJson(request, `/api/appointments/${approved.appointment.id}/deposit-receipt`, {
      method: 'POST',
      token: customer.accessToken,
      data: {
        fileName: 'card-transfer-approved.png',
        mimeType: 'image/png',
        dataBase64: PNG_BASE64,
      },
    });
    const approvedReview = await apiJson<{ receiptStatus: string; appointmentStatus: string }>(
      request,
      `/api/appointments/${approved.appointment.id}/deposit-receipt/review`,
      { method: 'POST', token: owner, data: { decision: 'approved', note: 'تأیید شد' } },
    );
    expect(approvedReview).toEqual({ receiptStatus: 'approved', appointmentStatus: 'confirmed' });
    const approvedOverview = await apiJson<{ deposit: Record<string, unknown> }>(
      request,
      `/api/appointments/${approved.appointment.id}/deposit`,
      { token: customer.accessToken },
    );
    expect(approvedOverview.deposit).toMatchObject({
      appointmentStatus: 'confirmed',
      paymentStatus: 'paid',
      receiptStatus: 'approved',
    });

    await apiJson(request, `/api/salons/${salon.salonId}/deposit-settings`, {
      method: 'PATCH',
      token: owner,
      data: { depositMethod: 'cash' },
    });
    const cashSlot = await nextSlot(
      request,
      salon.salonId,
      depositService.service.id,
      isoDateFromToday(4),
    );
    const cash = await book(request, depositSalon, customer.accessToken, cashSlot);
    // Cash is collected at the salon, so it remains a normal pending booking
    // until staff approval; no online payment hold is created.
    expect(cash.status).toBe('pending');
    const cashOverview = await apiJson<{ deposit: Record<string, unknown> }>(
      request,
      `/api/appointments/${cash.appointment.id}/deposit`,
      { token: customer.accessToken },
    );
    expect(cashOverview.deposit).toMatchObject({
      required: true,
      method: 'cash',
      appointmentStatus: 'pending',
    });
    await apiJson(request, `/api/appointments/${cash.appointment.id}/approve`, {
      method: 'POST',
      token: owner,
    });

    await apiJson(request, `/api/salons/${salon.salonId}/deposit-settings`, {
      method: 'PATCH',
      token: owner,
      data: { depositMethod: 'gateway' },
    });
    const gatewaySlot = await nextSlot(
      request,
      salon.salonId,
      depositService.service.id,
      isoDateFromToday(5),
    );
    const gateway = await book(request, depositSalon, customer.accessToken, gatewaySlot);
    expect(gateway.status).toBe('held');
    expect(gateway.paymentRedirectUrl).toContain('/api/payments/callback');
    const callback = new URL(gateway.paymentRedirectUrl!, 'http://127.0.0.1:3110');
    callback.searchParams.set('appointmentId', gateway.appointment.id);
    const callbackResult = await apiCall(request, `${callback.pathname}${callback.search}`, {
      maxRedirects: 0,
    });
    expect(callbackResult.response.status()).toBe(302);
    expect(callbackResult.response.headers().location).toContain(
      '/booking/success?payment=success',
    );
    const gatewayOverview = await apiJson<{ deposit: Record<string, unknown> }>(
      request,
      `/api/appointments/${gateway.appointment.id}/deposit`,
      { token: customer.accessToken },
    );
    expect(gatewayOverview.deposit).toMatchObject({
      appointmentStatus: 'confirmed',
      paymentStatus: 'paid',
    });
  });

  test('covers booking-window offset, horizon, full-day closure, variable duration, and multi-service booking', async ({
    request,
  }) => {
    const salon = await registerScenarioSalon(request, 'E2E Scheduling Boundaries', 'hybrid');
    const variableService = await apiJson<{
      service: {
        id: string;
        durationMode: string;
        minDurationMinutes: number;
        maxDurationMinutes: number;
      };
    }>(request, `/api/salons/${salon.salonId}/services`, {
      method: 'POST',
      token: salon.ownerToken,
      data: {
        name: `خدمت متغیر ${Date.now()}`,
        durationMinutes: 45,
        durationMode: 'variable',
        minDurationMinutes: 30,
        maxDurationMinutes: 60,
        priceRial: 650000,
      },
    });
    expect(variableService.service).toMatchObject({
      durationMode: 'variable',
      minDurationMinutes: 30,
      maxDurationMinutes: 60,
    });

    await apiJson(request, `/api/salons/${salon.salonId}/booking-policy`, {
      method: 'PUT',
      token: salon.ownerToken,
      data: { bookingWindowDays: 2, bookingStartOffsetDays: 1 },
    });
    expect(
      await availability(request, salon.salonId, salon.serviceId, isoDateFromToday(0), {
        locationType: 'salon',
      }),
    ).toHaveLength(0);
    expect(
      (
        await availability(request, salon.salonId, salon.serviceId, isoDateFromToday(1), {
          locationType: 'salon',
        })
      ).length,
    ).toBeGreaterThan(0);
    expect(
      await availability(request, salon.salonId, salon.serviceId, isoDateFromToday(3), {
        locationType: 'salon',
      }),
    ).toHaveLength(0);

    await apiJson(request, `/api/salons/${salon.salonId}/booking-policy`, {
      method: 'PUT',
      token: salon.ownerToken,
      data: { bookingWindowDays: 12, bookingStartOffsetDays: 0 },
    });
    const closedDate = isoDateFromToday(4);
    const closure = await apiJson<{ holidays: Array<{ id: string }> }>(
      request,
      `/api/salons/${salon.salonId}/holidays`,
      { method: 'POST', token: salon.ownerToken, data: { onDate: closedDate } },
    );
    expect(closure.holidays).toHaveLength(1);
    expect(
      await availability(request, salon.salonId, salon.serviceId, closedDate, {
        locationType: 'salon',
      }),
    ).toHaveLength(0);
    await apiJson(request, `/api/salons/${salon.salonId}/holidays/${closure.holidays[0].id}`, {
      method: 'DELETE',
      token: salon.ownerToken,
    });
    expect(
      (
        await availability(request, salon.salonId, salon.serviceId, closedDate, {
          locationType: 'salon',
        })
      ).length,
    ).toBeGreaterThan(0);

    expect(
      await availability(request, salon.salonId, variableService.service.id, isoDateFromToday(5), {
        locationType: 'salon',
        durationMinutes: 20,
      }),
    ).toHaveLength(0);
    const variableSlots = await availability(
      request,
      salon.salonId,
      variableService.service.id,
      isoDateFromToday(5),
      { locationType: 'salon', durationMinutes: 60 },
    );
    expect(variableSlots.length).toBeGreaterThan(0);

    const multiDate = isoDateFromToday(6);
    const multiParams = new URLSearchParams({
      serviceId: salon.serviceId,
      serviceIds: `${salon.serviceId},${variableService.service.id}`,
      date: multiDate,
      locationType: 'salon',
    });
    const multiAvailability = await apiJson<{ slots: Slot[] }>(
      request,
      `/api/salons/${salon.salonId}/availability?${multiParams.toString()}`,
    );
    expect(multiAvailability.slots.length).toBeGreaterThan(0);
    const customer = await loginWithApi(request, uniquePhone('0'));
    const multiBooking = await apiCall<{ status: string; appointment: Appointment }>(
      request,
      '/api/appointments',
      {
        method: 'POST',
        token: customer.accessToken,
        data: {
          salonId: salon.salonId,
          serviceId: salon.serviceId,
          serviceIds: [salon.serviceId, variableService.service.id],
          startAt: multiAvailability.slots[0].startAt,
          locationType: 'salon',
        },
      },
    );
    expect(multiBooking.response.status()).toBe(200);
    expect(multiBooking.body).toMatchObject({
      status: 'pending',
      appointment: { id: expect.any(String) },
    });
  });
});

test.describe('platform administrator API and UI matrix', () => {
  test('protects platform routes, reads every resource, opens details, and renders every admin page', async ({
    page,
    request,
  }) => {
    const owner = await registerSalonViaApi(request, 'E2E Platform Guard');
    const platform = await loginWithApi(request, '09120000999');
    const platformMe = await apiJson<{ principal: { role: string } }>(request, '/api/me', {
      token: platform.accessToken,
    });
    expect(platformMe.principal.role).toBe('PlatformAdmin');

    const noToken = await apiCall(request, '/api/platform-admin/dashboard');
    expect(noToken.response.status()).toBe(401);
    const ownerDenied = await apiCall(request, '/api/platform-admin/dashboard', {
      token: owner.accessToken,
    });
    expect(ownerDenied.response.status()).toBe(403);

    const listRoutes = [
      'salons',
      'customers',
      'staff',
      'platform-admins',
      'services',
      'chairs',
      'equipment',
      'appointments',
      'subscriptions',
      'payments',
      'waitlist',
      'qr-scans',
      'audit-logs',
      'card-orders',
    ];
    for (const resource of listRoutes) {
      const result = await apiCall(request, `/api/platform-admin/${resource}`, {
        token: platform.accessToken,
      });
      expect(result.response.status(), `platform list ${resource}`).toBe(200);
    }
    const supportList = await apiCall(request, '/api/platform-admin/support/tickets', {
      token: platform.accessToken,
    });
    expect(supportList.response.status()).toBe(200);
    const detail = await apiCall(request, `/api/platform-admin/details/salons/${owner.salonId}`, {
      token: platform.accessToken,
    });
    expect(detail.response.status()).toBe(200);
    expect(detail.body).toMatchObject({ resource: 'salons', record: { id: owner.salonId } });
    const invalidDetail = await apiCall(
      request,
      '/api/platform-admin/details/no-such-resource/no-such-id',
      {
        token: platform.accessToken,
      },
    );
    expect([400, 404]).toContain(invalidDetail.response.status());

    await loginViaUi(page, '09120000999', /\/platform-admin(?:\?|$)/);
    const routes = [
      '/platform-admin',
      '/platform-admin/details',
      `/platform-admin/details?resource=salons&id=${encodeURIComponent(owner.salonId)}`,
      '/platform-admin/salons',
      '/platform-admin/customers',
      '/platform-admin/staff',
      '/platform-admin/platform-admins',
      '/platform-admin/services',
      '/platform-admin/chairs',
      '/platform-admin/equipment',
      '/platform-admin/appointments',
      '/platform-admin/subscriptions',
      '/platform-admin/payments',
      '/platform-admin/waitlist',
      '/platform-admin/qr-scans',
      '/platform-admin/audit-logs',
      '/platform-admin/card-orders',
      '/platform-admin/support',
    ];
    for (const route of routes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1 }).first(), route).toBeVisible({
        timeout: 15_000,
      });
    }
    await page.goto('/platform-admin', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: 'artifacts/qa-screenshots/platform-admin-final.png',
      fullPage: true,
    });
  });
});
