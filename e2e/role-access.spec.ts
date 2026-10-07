import { expect, test, type Browser } from '@playwright/test';
import {
  apiCall,
  apiJson,
  isoDateFromToday,
  loginViaUi,
  loginWithApi,
  registerSalonViaApi,
  uniquePhone,
  type RegisteredSalon,
} from './fixtures';

type Role = 'Admin' | 'Stylist';
type Auth = { accessToken: string; refreshToken: string };
type Staff = { id: string; role: 'Owner' | Role; phone: string | null; active: boolean };
type Appointment = {
  id: string;
  status: string;
  staffMemberId: string;
  customerId: string;
  source?: string;
};

async function addStaff(
  request: Parameters<typeof apiJson>[0],
  salonId: string,
  token: string,
  role: Role,
  label: string,
): Promise<{ staff: Staff; phone: string; auth: Auth }> {
  const phone = uniquePhone(role === 'Admin' ? '4' : '5');
  const created = await apiJson<{ staff: Staff }>(request, `/api/salons/${salonId}/staff`, {
    method: 'POST',
    token,
    data: { fullName: `${label} ${role}`, role, phone },
  });
  const auth = await loginWithApi(request, phone);
  return { staff: created.staff, phone, auth };
}

async function nextSlot(
  request: Parameters<typeof apiJson>[0],
  salonId: string,
  serviceId: string,
  date: string,
  staffId?: string,
): Promise<string> {
  const staff = staffId ? `&staffId=${encodeURIComponent(staffId)}` : '';
  const availability = await apiJson<{ slots: Array<{ startAt: string }> }>(
    request,
    `/api/salons/${salonId}/availability?serviceId=${serviceId}&date=${date}${staff}`,
  );
  expect(availability.slots.length, `expected a free slot on ${date}`).toBeGreaterThan(0);
  return availability.slots[0].startAt;
}

async function bookFor(
  request: Parameters<typeof apiJson>[0],
  salonId: string,
  serviceId: string,
  date: string,
  customerToken: string,
  staffId: string,
): Promise<Appointment> {
  const appointment = await apiJson<{ status: string; appointment: Appointment }>(
    request,
    '/api/appointments',
    {
      method: 'POST',
      token: customerToken,
      data: {
        salonId,
        serviceId,
        startAt: await nextSlot(request, salonId, serviceId, date, staffId),
        preferredStaffId: staffId,
      },
    },
  );
  expect(appointment.status).toBe('pending');
  expect(appointment.appointment.staffMemberId).toBe(staffId);
  return appointment.appointment;
}

async function roleContext(
  browser: Browser,
  phone: string,
  expectedRole: 'Owner' | 'Admin' | 'Stylist',
): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await loginViaUi(page, phone, /\/owner(?:\/calendar)?(?:\?|$)/);
    await page.goto('/owner/calendar');
    await expect(page.getByTestId('owner-calendar-page')).toBeVisible();
    const teamLink = page.locator('a[href="/owner/team"]');
    const analyticsLink = page.locator('a[href="/owner/analytics"]');

    if (expectedRole === 'Stylist') {
      await expect(teamLink).toHaveCount(0);
      await expect(analyticsLink).toHaveCount(0);
      await page.goto('/owner/team');
      await expect(page).toHaveURL(/\/owner\/calendar(?:\?|$)/);
      await expect(page.getByTestId('owner-team-page')).toHaveCount(0);
      await page.goto('/owner/analytics');
      await expect(page).toHaveURL(/\/owner\/calendar(?:\?|$)/);
      await expect(page.getByTestId('owner-analytics-page')).toHaveCount(0);
      await page.goto('/owner/clients');
      await expect(page.getByTestId('owner-clients-page')).toBeVisible();
      return;
    }

    await expect(teamLink).toHaveCount(1);
    await expect(analyticsLink).toHaveCount(1);
    await page.goto('/owner/team');
    await expect(page.getByTestId('owner-team-page')).toBeVisible();
    await page.goto('/owner/analytics');
    await expect(page.getByTestId('owner-analytics-page')).toBeVisible();
  } finally {
    await context.close();
  }
}

test.describe.configure({ timeout: 180_000 });

test('owner, admin and stylist permissions across assigned appointments and changed access states', async ({
  request,
}) => {
  const salon = await registerSalonViaApi(request, 'QA Role Access');
  const owner = salon.accessToken;
  const admin = await addStaff(request, salon.salonId, owner, 'Admin', 'Role Matrix');
  const stylistA = await addStaff(request, salon.salonId, owner, 'Stylist', 'Role Matrix A');
  const stylistB = await addStaff(request, salon.salonId, owner, 'Stylist', 'Role Matrix B');
  const services = await apiJson<{ services: Array<{ id: string; name: string }> }>(
    request,
    `/api/salons/${salon.salonId}/services`,
  );
  const service =
    services.services.find((item) => item.name === salon.serviceName) ?? services.services[0];
  expect(service).toBeDefined();
  await apiJson(request, `/api/salons/${salon.salonId}/booking-policy`, {
    method: 'PUT',
    token: owner,
    data: { bookingWindowDays: 12 },
  });

  const ownerHours = await apiJson<{
    hours: Array<{ weekday: number; startTime: string; endTime: string }>;
  }>(request, `/api/salons/${salon.salonId}/working-hours`, { token: owner });
  const adminHours = await apiJson<{ hours: typeof ownerHours.hours }>(
    request,
    `/api/salons/${salon.salonId}/working-hours`,
    { token: admin.auth.accessToken },
  );
  expect(adminHours.hours).toEqual(ownerHours.hours);
  expect(
    (
      await apiCall(request, `/api/salons/${salon.salonId}/working-hours`, {
        token: stylistA.auth.accessToken,
      })
    ).response.status(),
  ).toBe(403);
  expect(
    (
      await apiCall(request, `/api/salons/${salon.salonId}/working-hours`, {
        method: 'PUT',
        token: stylistA.auth.accessToken,
        data: { hours: [] },
      })
    ).response.status(),
  ).toBe(403);
  const adminScheduleUpdate = await apiJson<{ ok: boolean; hours: typeof ownerHours.hours }>(
    request,
    `/api/salons/${salon.salonId}/working-hours`,
    { method: 'PUT', token: admin.auth.accessToken, data: { hours: ownerHours.hours } },
  );
  expect(adminScheduleUpdate.ok).toBe(true);

  expect(
    (
      await apiCall(request, `/api/salons/${salon.salonId}/sms-settings`, {
        token: stylistA.auth.accessToken,
      })
    ).response.status(),
  ).toBe(403);

  // Owner and Admin manage salon settings and staff; Stylist cannot.
  expect(
    (
      await apiCall(request, `/api/salons/${salon.salonId}/staff`, { token: owner })
    ).response.status(),
  ).toBe(200);
  expect(
    (
      await apiCall(request, `/api/salons/${salon.salonId}/staff`, {
        token: admin.auth.accessToken,
      })
    ).response.status(),
  ).toBe(200);
  expect(
    (
      await apiCall(request, `/api/salons/${salon.salonId}/staff`, {
        token: stylistA.auth.accessToken,
      })
    ).response.status(),
  ).toBe(403);
  const adminCreatedStaff = await apiJson<{ staff: Staff }>(
    request,
    `/api/salons/${salon.salonId}/staff`,
    {
      method: 'POST',
      token: admin.auth.accessToken,
      data: { fullName: 'عضو اضافه‌شده توسط ادمین', role: 'Stylist' },
    },
  );
  expect(adminCreatedStaff.staff.role).toBe('Stylist');
  expect(
    (
      await apiCall(request, `/api/salons/${salon.salonId}/staff`, {
        method: 'POST',
        token: stylistA.auth.accessToken,
        data: { fullName: 'عضو غیرمجاز', role: 'Stylist' },
      })
    ).response.status(),
  ).toBe(403);
  expect(
    (
      await apiCall(request, `/api/salons/${salon.salonId}/services`, {
        method: 'POST',
        token: stylistA.auth.accessToken,
        data: { name: 'خدمت غیرمجاز' },
      })
    ).response.status(),
  ).toBe(403);

  const date = isoDateFromToday(3);
  const customerA = await loginWithApi(request, uniquePhone('1'));
  const customerB = await loginWithApi(request, uniquePhone('2'));
  const assignedA = await bookFor(
    request,
    salon.salonId,
    service!.id,
    date,
    customerA.accessToken,
    stylistA.staff.id,
  );
  const assignedB = await bookFor(
    request,
    salon.salonId,
    service!.id,
    date,
    customerB.accessToken,
    stylistB.staff.id,
  );

  const from = date;
  const to = isoDateFromToday(4);
  const calendarUrl = `/api/salons/${salon.salonId}/calendar?from=${from}&to=${to}&view=day`;
  const ownerCalendar = await apiJson<{ appointments: Appointment[] }>(request, calendarUrl, {
    token: owner,
  });
  const adminCalendar = await apiJson<{ appointments: Appointment[] }>(request, calendarUrl, {
    token: admin.auth.accessToken,
  });
  const stylistACalendar = await apiJson<{ appointments: Appointment[] }>(request, calendarUrl, {
    token: stylistA.auth.accessToken,
  });
  const stylistBCalendar = await apiJson<{ appointments: Appointment[] }>(request, calendarUrl, {
    token: stylistB.auth.accessToken,
  });
  for (const calendar of [ownerCalendar, adminCalendar]) {
    expect(calendar.appointments.some((item) => item.id === assignedA.id)).toBe(true);
    expect(calendar.appointments.some((item) => item.id === assignedB.id)).toBe(true);
  }
  expect(stylistACalendar.appointments.map((item) => item.id)).toContain(assignedA.id);
  expect(stylistACalendar.appointments.map((item) => item.id)).not.toContain(assignedB.id);
  expect(stylistBCalendar.appointments.map((item) => item.id)).toContain(assignedB.id);
  expect(stylistBCalendar.appointments.map((item) => item.id)).not.toContain(assignedA.id);

  const frontDeskClient = await apiJson<{ client: { id: string } }>(
    request,
    `/api/salons/${salon.salonId}/clients`,
    {
      method: 'POST',
      token: admin.auth.accessToken,
      data: { fullName: 'مشتری دفتر سالن', phone: uniquePhone('8') },
    },
  );
  const stylistClients = await apiJson<{ clients: Array<{ id: string }> }>(
    request,
    `/api/salons/${salon.salonId}/clients`,
    { token: stylistA.auth.accessToken },
  );
  expect(stylistClients.clients.map((item) => item.id)).toContain(frontDeskClient.client.id);
  expect(
    (
      await apiCall(request, `/api/salons/${salon.salonId}/clients`, {
        method: 'POST',
        token: stylistA.auth.accessToken,
        data: { fullName: 'مشتری غیرمجاز', phone: uniquePhone('8') },
      })
    ).response.status(),
  ).toBe(403);

  const manualSlot = await nextSlot(request, salon.salonId, service!.id, date, stylistB.staff.id);
  const manualPayload = {
    serviceId: service!.id,
    startAt: manualSlot,
    preferredStaffId: stylistB.staff.id,
    phone: uniquePhone('9'),
    fullName: 'نوبت حضوری ادمین',
    locationType: 'salon',
  };
  expect(
    (
      await apiCall(request, `/api/salons/${salon.salonId}/appointments/manual`, {
        method: 'POST',
        token: stylistA.auth.accessToken,
        data: manualPayload,
      })
    ).response.status(),
  ).toBe(403);
  const adminWalkIn = await apiJson<{ status: string; appointment: Appointment }>(
    request,
    `/api/salons/${salon.salonId}/appointments/manual`,
    { method: 'POST', token: admin.auth.accessToken, data: manualPayload },
  );
  expect(adminWalkIn).toMatchObject({
    status: 'confirmed',
    appointment: { status: 'confirmed', source: 'walkin', staffMemberId: stylistB.staff.id },
  });

  const salonCustomerUrl = `/api/salons/${salon.salonId}/customers/${assignedA.customerId}`;
  const ownerCustomerHistory = await apiJson<{ appointments: Appointment[] }>(
    request,
    salonCustomerUrl,
    { token: owner },
  );
  const stylistCustomerHistory = await apiJson<{ appointments: Appointment[] }>(
    request,
    salonCustomerUrl,
    { token: stylistA.auth.accessToken },
  );
  expect(ownerCustomerHistory.appointments.map((item) => item.id)).toContain(assignedA.id);
  expect(stylistCustomerHistory.appointments.map((item) => item.id)).toContain(assignedA.id);
  expect(
    (
      await apiCall(request, salonCustomerUrl, { token: stylistB.auth.accessToken })
    ).response.status(),
  ).toBe(404);

  expect(
    (
      await apiCall(request, `/api/appointments/${assignedA.id}/customer`, {
        token: stylistB.auth.accessToken,
      })
    ).response.status(),
  ).toBe(403);
  expect(
    (
      await apiCall(request, `/api/appointments/${assignedA.id}/customer-notes`, {
        method: 'POST',
        token: stylistB.auth.accessToken,
        data: { body: 'یادداشت غیرمجاز' },
      })
    ).response.status(),
  ).toBe(403);
  const ownCustomerDetails = await apiCall(request, `/api/appointments/${assignedA.id}/customer`, {
    token: stylistA.auth.accessToken,
  });
  expect(ownCustomerDetails.response.status()).toBe(200);
  const ownCustomerNote = await apiCall(
    request,
    `/api/appointments/${assignedA.id}/customer-notes`,
    { method: 'POST', token: stylistA.auth.accessToken, data: { body: 'یادداشت آرایشگر' } },
  );
  expect(ownCustomerNote.response.status()).toBe(201);

  const stylistPending = await apiJson<{
    appointments: Appointment[];
    canApproveOwnAppointments: boolean;
  }>(request, `/api/salons/${salon.salonId}/pending`, { token: stylistA.auth.accessToken });
  expect(stylistPending.canApproveOwnAppointments).toBe(false);
  expect(stylistPending.appointments.map((item) => item.id)).toContain(assignedA.id);
  expect(stylistPending.appointments.map((item) => item.id)).not.toContain(assignedB.id);

  expect(
    (
      await apiCall(request, `/api/appointments/${assignedA.id}/approve`, {
        method: 'POST',
        token: stylistA.auth.accessToken,
      })
    ).response.status(),
  ).toBe(403);
  expect(
    (
      await apiCall(request, `/api/appointments/${assignedB.id}/approve`, {
        method: 'POST',
        token: stylistA.auth.accessToken,
      })
    ).response.status(),
  ).toBe(403);
  await apiJson(request, `/api/staff/${stylistB.staff.id}/approve-own`, {
    method: 'POST',
    token: admin.auth.accessToken,
    data: { allowed: true },
  });
  const stylistBPending = await apiJson<{
    appointments: Appointment[];
    canApproveOwnAppointments: boolean;
  }>(request, `/api/salons/${salon.salonId}/pending`, { token: stylistB.auth.accessToken });
  expect(stylistBPending.canApproveOwnAppointments).toBe(true);
  expect(stylistBPending.appointments.map((item) => item.id)).toContain(assignedB.id);
  expect(stylistBPending.appointments.map((item) => item.id)).not.toContain(assignedA.id);
  const stylistBApproved = await apiJson<{ status: string }>(
    request,
    `/api/appointments/${assignedB.id}/approve`,
    { method: 'POST', token: stylistB.auth.accessToken },
  );
  expect(stylistBApproved.status).toBe('confirmed');
  await apiJson(request, `/api/staff/${stylistB.staff.id}/approve-own`, {
    method: 'POST',
    token: admin.auth.accessToken,
    data: { allowed: false },
  });
  await apiJson(request, `/api/appointments/${assignedA.id}/approve`, {
    method: 'POST',
    token: owner,
  });

  await apiJson(request, `/api/staff/${stylistA.staff.id}/approve-own`, {
    method: 'POST',
    token: owner,
    data: { allowed: true },
  });
  const thirdCustomer = await loginWithApi(request, uniquePhone('3'));
  const assignedAAfterGrant = await bookFor(
    request,
    salon.salonId,
    service!.id,
    date,
    thirdCustomer.accessToken,
    stylistA.staff.id,
  );
  const grantedPending = await apiJson<{ canApproveOwnAppointments: boolean }>(
    request,
    `/api/salons/${salon.salonId}/pending`,
    { token: stylistA.auth.accessToken },
  );
  expect(grantedPending.canApproveOwnAppointments).toBe(true);
  const stylistApproved = await apiJson<{ status: string }>(
    request,
    `/api/appointments/${assignedAAfterGrant.id}/approve`,
    { method: 'POST', token: stylistA.auth.accessToken },
  );
  expect(stylistApproved.status).toBe('confirmed');

  const stylistRejectCustomer = await loginWithApi(request, uniquePhone('0'));
  const stylistRejectOwn = await bookFor(
    request,
    salon.salonId,
    service!.id,
    date,
    stylistRejectCustomer.accessToken,
    stylistA.staff.id,
  );
  const stylistRejectedOwn = await apiJson<{ status: string }>(
    request,
    `/api/appointments/${stylistRejectOwn.id}/reject`,
    {
      method: 'POST',
      token: stylistA.auth.accessToken,
      data: { reason: 'عدم امکان حضور' },
    },
  );
  expect(stylistRejectedOwn.status).toBe('cancelled');

  const fourthCustomer = await loginWithApi(request, uniquePhone('6'));
  const assignedBAfterGrant = await bookFor(
    request,
    salon.salonId,
    service!.id,
    date,
    fourthCustomer.accessToken,
    stylistB.staff.id,
  );
  expect(
    (
      await apiCall(request, `/api/appointments/${assignedBAfterGrant.id}/approve`, {
        method: 'POST',
        token: stylistB.auth.accessToken,
      })
    ).response.status(),
  ).toBe(403);
  expect(
    (
      await apiCall(request, `/api/appointments/${assignedBAfterGrant.id}/approve`, {
        method: 'POST',
        token: stylistA.auth.accessToken,
      })
    ).response.status(),
  ).toBe(403);
  await apiJson(request, `/api/appointments/${assignedBAfterGrant.id}/reject`, {
    method: 'POST',
    token: admin.auth.accessToken,
    data: { reason: 'تست دسترسی ادمین' },
  });

  await apiJson(request, `/api/staff/${stylistA.staff.id}/approve-own`, {
    method: 'POST',
    token: owner,
    data: { allowed: false },
  });
  const fifthCustomer = await loginWithApi(request, uniquePhone('7'));
  const assignedAAfterRevoke = await bookFor(
    request,
    salon.salonId,
    service!.id,
    date,
    fifthCustomer.accessToken,
    stylistA.staff.id,
  );
  expect(
    (
      await apiCall(request, `/api/appointments/${assignedAAfterRevoke.id}/approve`, {
        method: 'POST',
        token: stylistA.auth.accessToken,
      })
    ).response.status(),
  ).toBe(403);
  const ownerOverride = await apiJson<{ status: string }>(
    request,
    `/api/appointments/${assignedAAfterRevoke.id}/approve`,
    { method: 'POST', token: owner },
  );
  expect(ownerOverride.status).toBe('confirmed');

  // Staff activation is re-evaluated on token refresh, both when removing and restoring access.
  await apiJson(request, `/api/staff/${stylistB.staff.id}`, {
    method: 'PATCH',
    token: owner,
    data: { active: false },
  });
  const inactiveRefresh = await apiJson<Auth>(request, '/api/auth/refresh', {
    method: 'POST',
    headers: { 'X-Auth-Client': 'mobile' },
    data: { refreshToken: stylistB.auth.refreshToken },
  });
  const inactiveMe = await apiJson<{ principal: { role?: string } }>(request, '/api/me', {
    token: inactiveRefresh.accessToken,
  });
  expect(inactiveMe.principal.role).toBeUndefined();
  expect(
    (
      await apiCall(request, `/api/salons/${salon.salonId}/staff`, {
        token: inactiveRefresh.accessToken,
      })
    ).response.status(),
  ).toBe(403);

  await apiJson(request, `/api/staff/${stylistB.staff.id}`, {
    method: 'PATCH',
    token: owner,
    data: { active: true },
  });
  const reactivatedRefresh = await apiJson<Auth>(request, '/api/auth/refresh', {
    method: 'POST',
    headers: { 'X-Auth-Client': 'mobile' },
    data: { refreshToken: inactiveRefresh.refreshToken },
  });
  const reactivatedMe = await apiJson<{ principal: { role?: string; salonId?: string } }>(
    request,
    '/api/me',
    { token: reactivatedRefresh.accessToken },
  );
  expect(reactivatedMe.principal).toMatchObject({ role: 'Stylist', salonId: salon.salonId });

  await apiJson(request, `/api/staff/${stylistB.staff.id}`, {
    method: 'PATCH',
    token: owner,
    data: { role: 'Admin' },
  });
  const promotedRefresh = await apiJson<Auth>(request, '/api/auth/refresh', {
    method: 'POST',
    headers: { 'X-Auth-Client': 'mobile' },
    data: { refreshToken: reactivatedRefresh.refreshToken },
  });
  const promotedMe = await apiJson<{ principal: { role?: string } }>(request, '/api/me', {
    token: promotedRefresh.accessToken,
  });
  expect(promotedMe.principal.role).toBe('Admin');
  expect(
    (
      await apiCall(request, `/api/salons/${salon.salonId}/staff`, {
        token: promotedRefresh.accessToken,
      })
    ).response.status(),
  ).toBe(200);

  await apiJson(request, `/api/staff/${stylistB.staff.id}`, {
    method: 'PATCH',
    token: owner,
    data: { role: 'Stylist' },
  });
  const demotedRefresh = await apiJson<Auth>(request, '/api/auth/refresh', {
    method: 'POST',
    headers: { 'X-Auth-Client': 'mobile' },
    data: { refreshToken: promotedRefresh.refreshToken },
  });
  const demotedMe = await apiJson<{ principal: { role?: string } }>(request, '/api/me', {
    token: demotedRefresh.accessToken,
  });
  expect(demotedMe.principal.role).toBe('Stylist');
  expect(
    (
      await apiCall(request, `/api/salons/${salon.salonId}/staff`, {
        token: demotedRefresh.accessToken,
      })
    ).response.status(),
  ).toBe(403);

  const otherSalon = await registerSalonViaApi(request, 'QA Other Role Tenant');
  await apiJson(request, `/api/salons/${otherSalon.salonId}/booking-policy`, {
    method: 'PUT',
    token: otherSalon.accessToken,
    data: { bookingWindowDays: 12 },
  });
  const otherServices = await apiJson<{ services: Array<{ id: string }> }>(
    request,
    `/api/salons/${otherSalon.salonId}/services`,
  );
  const otherSalonStaff = await apiJson<{ staff: Staff[] }>(
    request,
    `/api/salons/${otherSalon.salonId}/staff`,
    { token: otherSalon.accessToken },
  );
  const otherSalonOwner = otherSalonStaff.staff.find((item) => item.role === 'Owner');
  expect(otherSalonOwner).toBeDefined();
  const sameCustomerOtherSalonBooking = await bookFor(
    request,
    otherSalon.salonId,
    otherServices.services[0]!.id,
    date,
    customerA.accessToken,
    otherSalonOwner!.id,
  );
  const salonAHistoryAfterOtherSalonBooking = await apiJson<{ appointments: Appointment[] }>(
    request,
    salonCustomerUrl,
    { token: admin.auth.accessToken },
  );
  expect(salonAHistoryAfterOtherSalonBooking.appointments.map((item) => item.id)).toContain(
    assignedA.id,
  );
  expect(salonAHistoryAfterOtherSalonBooking.appointments.map((item) => item.id)).not.toContain(
    sameCustomerOtherSalonBooking.id,
  );
  const otherSalonHistory = await apiJson<{ appointments: Appointment[] }>(
    request,
    `/api/salons/${otherSalon.salonId}/customers/${assignedA.customerId}`,
    { token: otherSalon.accessToken },
  );
  expect(otherSalonHistory.appointments.map((item) => item.id)).toContain(
    sameCustomerOtherSalonBooking.id,
  );
  expect(otherSalonHistory.appointments.map((item) => item.id)).not.toContain(assignedA.id);

  for (const token of [admin.auth.accessToken, stylistA.auth.accessToken]) {
    expect(
      (
        await apiCall(request, `/api/salons/${otherSalon.salonId}/staff`, { token })
      ).response.status(),
    ).toBe(403);
  }
});

test('owner and admin get management panel; stylist gets only permitted panel sections', async ({
  browser,
  request,
}) => {
  const salon: RegisteredSalon & Auth = await registerSalonViaApi(request, 'QA Role Panel');
  const admin = await addStaff(request, salon.salonId, salon.accessToken, 'Admin', 'Panel Matrix');
  const stylist = await addStaff(
    request,
    salon.salonId,
    salon.accessToken,
    'Stylist',
    'Panel Matrix',
  );

  await roleContext(browser, salon.ownerPhone, 'Owner');
  await roleContext(browser, admin.phone, 'Admin');
  await roleContext(browser, stylist.phone, 'Stylist');
});
