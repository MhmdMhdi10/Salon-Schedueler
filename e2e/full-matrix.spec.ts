import { expect, test } from '@playwright/test';
import {
  apiCall,
  apiJson,
  isoDateFromToday,
  loginWithApi,
  registerSalonViaApi,
  uniquePhone,
  type RegisteredSalon,
} from './fixtures';

test.describe.configure({ timeout: 120_000 });

const HOURS = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  startTime: '09:00',
  endTime: '20:00',
}));

type Auth = { accessToken: string; refreshToken: string };
type Staff = {
  id: string;
  fullName: string | null;
  role: 'Owner' | 'Admin' | 'Stylist';
  phone: string | null;
  active: boolean;
  autoApprove: boolean | null;
  manageOwnAvailability: boolean;
};
type Appointment = {
  id: string;
  salonId: string;
  staffMemberId: string;
  customerId: string;
  status: string;
  startAt: string;
};

async function staffList(request: Parameters<typeof apiJson>[0], salonId: string, token: string) {
  return apiJson<{ staff: Staff[] }>(request, `/api/salons/${salonId}/staff`, { token });
}

async function addStaff(
  request: Parameters<typeof apiJson>[0],
  salonId: string,
  ownerToken: string,
  role: 'Admin' | 'Stylist',
  label: string,
): Promise<{ staff: Staff; phone: string; auth: Auth }> {
  const phone = uniquePhone(role === 'Admin' ? '4' : '5');
  const created = await apiJson<{ staff: Staff }>(request, `/api/salons/${salonId}/staff`, {
    method: 'POST',
    data: { fullName: `${label} ${role}`, role, phone },
    token: ownerToken,
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
): Promise<{ startAt: string; endAt: string }> {
  const query = staffId ? `&staffId=${encodeURIComponent(staffId)}` : '';
  const result = await apiJson<{ slots: Array<{ startAt: string; endAt: string }> }>(
    request,
    `/api/salons/${salonId}/availability?serviceId=${serviceId}&date=${date}${query}`,
  );
  expect(result.slots.length, `expected an available slot on ${date}`).toBeGreaterThan(0);
  return result.slots[0];
}

async function book(
  request: Parameters<typeof apiJson>[0],
  salonId: string,
  serviceId: string,
  startAt: string,
  customerToken: string,
  preferredStaffId?: string,
) {
  const result = await apiCall<{ status: string; appointment: Appointment }>(
    request,
    '/api/appointments',
    {
      method: 'POST',
      data: { salonId, serviceId, startAt, preferredStaffId },
      token: customerToken,
    },
  );
  expect(result.response.status()).toBe(200);
  expect(result.body.appointment.id).toBeTruthy();
  return result.body;
}

test.describe('public/auth/registration contract journeys', () => {
  test('covers validation, OTP lifecycle, public salon reads, scan attribution, and refresh', async ({
    request,
  }) => {
    expect((await apiCall(request, '/healthz')).response.status()).toBe(200);

    const unauthenticated = await apiCall(request, '/api/me');
    expect(unauthenticated.response.status()).toBe(401);

    const missingOtp = await apiCall(request, '/api/auth/otp/request', {
      method: 'POST',
      data: {},
    });
    expect(missingOtp.response.status()).toBe(400);
    expect(missingOtp.body).toMatchObject({ code: 'VALIDATION_ERROR', field: 'phone' });

    const invalidRegistration = await apiCall(request, '/api/register/salon', {
      method: 'POST',
      data: {},
    });
    expect(invalidRegistration.response.status()).toBe(400);

    const missingPhoneCheck = await apiCall(request, '/api/register/check-phone');
    expect(missingPhoneCheck.response.status()).toBe(400);

    const salon = await registerSalonViaApi(request, 'E2E Public Matrix');
    const owner = await loginWithApi(request, salon.ownerPhone);

    const duplicate = await apiCall(request, '/api/register/salon', {
      method: 'POST',
      data: {
        salonName: 'Duplicate should fail',
        ownerName: 'Duplicate owner',
        phone: salon.ownerPhone,
      },
    });
    expect(duplicate.response.status()).toBe(409);
    expect(duplicate.body).toMatchObject({ code: 'PHONE_TAKEN', field: 'phone' });

    const taken = await apiJson<{ available: boolean }>(
      request,
      `/api/register/check-phone?phone=${salon.ownerPhone}`,
    );
    expect(taken.available).toBe(false);
    const free = await apiJson<{ available: boolean }>(
      request,
      `/api/register/check-phone?phone=${uniquePhone('2')}`,
    );
    expect(free.available).toBe(true);

    const otp = await apiJson<{ devOtp?: string }>(request, '/api/auth/otp/request', {
      method: 'POST',
      data: { phone: salon.ownerPhone },
    });
    expect(otp.devOtp).toMatch(/^\d{6}$/);
    const wrongOtp = await apiCall(request, '/api/auth/otp/verify', {
      method: 'POST',
      data: { phone: salon.ownerPhone, code: '999999' },
    });
    expect(wrongOtp.response.status()).toBe(401);
    expect(wrongOtp.body).toMatchObject({ code: 'OTP_INVALID' });

    const me = await apiJson<{ principal: { role: string; salonId: string } }>(request, '/api/me', {
      token: owner.accessToken,
    });
    expect(me.principal.role).toBe('Owner');
    expect(me.principal.salonId).toBe(salon.salonId);

    const refreshed = await apiCall<{ accessToken: string; refreshToken: string }>(
      request,
      '/api/auth/refresh',
      { method: 'POST', data: { refreshToken: owner.refreshToken } },
    );
    expect(refreshed.response.status()).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    const badRefresh = await apiCall(request, '/api/auth/refresh', {
      method: 'POST',
      data: { refreshToken: 'not-a-refresh-token' },
    });
    expect(badRefresh.response.status()).toBe(401);

    const services = await apiJson<{ services: Array<{ id: string; name: string }> }>(
      request,
      `/api/salons/${salon.salonId}/services`,
    );
    const service = services.services.find((item) => item.name === salon.serviceName);
    expect(service).toBeDefined();

    const brand = await apiJson<{ name: string; brandAccent: string | null }>(
      request,
      `/api/salons/${salon.salonId}/brand`,
    );
    expect(brand.name).toBe(salon.salonName);
    expect(brand.brandAccent).toBeNull();

    const stylists = await apiJson<{ stylists: Array<{ role: string }> }>(
      request,
      `/api/salons/${salon.salonId}/stylists`,
    );
    expect(stylists.stylists.some((stylist) => stylist.role === 'Owner')).toBe(true);

    const policy = await apiJson<{ bookingWindowDays: number }>(
      request,
      `/api/salons/${salon.salonId}/booking-policy`,
    );
    expect(policy.bookingWindowDays).toBeGreaterThanOrEqual(0);

    const bookingDate = isoDateFromToday(1);
    const availability = await apiJson<{ slots: unknown[] }>(
      request,
      `/api/salons/${salon.salonId}/availability?serviceId=${service!.id}&date=${bookingDate}`,
    );
    expect(Array.isArray(availability.slots)).toBe(true);
    const missingAvailability = await apiCall(
      request,
      `/api/salons/${salon.salonId}/availability?date=${bookingDate}`,
    );
    expect(missingAvailability.response.status()).toBe(400);

    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/scan`, {
          method: 'POST',
        })
      ).response.status(),
    ).toBe(204);
    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/scan?utm_source=e2e`, {
          method: 'POST',
        })
      ).response.status(),
    ).toBe(204);
    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/scan`, {
          method: 'POST',
          data: { source: 'e2e-body' },
        })
      ).response.status(),
    ).toBe(204);

    const malformed = await apiCall(request, '/api/salons/by-qr/not-a-valid-payload');
    expect(malformed.response.status()).toBe(400);
    expect(malformed.body).toMatchObject({ code: 'QR_MALFORMED' });
    const unauthenticatedCustomerRead = await apiCall(
      request,
      '/api/customers/me/appointments',
    );
    expect(unauthenticatedCustomerRead.response.status()).toBe(401);
  });
});

test.describe('owner configuration and tenant/RBAC journeys', () => {
  test('creates resources, edits every configuration surface, and enforces role + tenant scope', async ({
    request,
  }) => {
    const salon = await registerSalonViaApi(request, 'E2E Config Matrix');
    const owner = salon.accessToken;
    const admin = await addStaff(request, salon.salonId, owner, 'Admin', 'Config');
    const stylist = await addStaff(request, salon.salonId, owner, 'Stylist', 'Config');

    const staff = await staffList(request, salon.salonId, owner);
    const ownerStaff = staff.staff.find((member) => member.role === 'Owner');
    expect(ownerStaff).toBeDefined();
    expect(staff.staff.map((member) => member.role)).toEqual(
      expect.arrayContaining(['Owner', 'Admin', 'Stylist']),
    );

    const duplicatePhone = await apiCall(request, `/api/salons/${salon.salonId}/staff`, {
      method: 'POST',
      data: { fullName: 'Duplicate phone', role: 'Stylist', phone: stylist.phone },
      token: owner,
    });
    expect(duplicatePhone.response.status()).toBe(409);

    const invalidStaff = await apiCall(request, `/api/salons/${salon.salonId}/staff`, {
      method: 'POST',
      data: { fullName: 'Bad role', role: 'Unknown' },
      token: owner,
    });
    expect(invalidStaff.response.status()).toBe(400);

    const updatedStaff = await apiJson<{ staff: Staff }>(request, `/api/staff/${stylist.staff.id}`, {
      method: 'PATCH',
      data: { fullName: 'Config Stylist Updated' },
      token: owner,
    });
    expect(updatedStaff.staff.fullName).toBe('Config Stylist Updated');
    const deactivated = await apiJson<{ staff: Staff }>(request, `/api/staff/${stylist.staff.id}`, {
      method: 'PATCH',
      data: { active: false },
      token: owner,
    });
    expect(deactivated.staff.active).toBe(false);
    const reactivated = await apiJson<{ staff: Staff }>(request, `/api/staff/${stylist.staff.id}`, {
      method: 'PATCH',
      data: { active: true },
      token: owner,
    });
    expect(reactivated.staff.active).toBe(true);

    const initialChairs = await apiJson<{ chairs: Array<{ id: string; active: boolean }> }>(
      request,
      `/api/salons/${salon.salonId}/chairs`,
      { token: owner },
    );
    expect(initialChairs.chairs.length).toBeGreaterThan(0);
    const createdChair = await apiJson<{ chair: { id: string; active: boolean } }>(
      request,
      `/api/salons/${salon.salonId}/chairs`,
      { method: 'POST', data: { name: 'E2E Chair' }, token: owner },
    );
    const chairId = createdChair.chair.id;
    expect(createdChair.chair.active).toBe(true);
    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/chairs/${chairId}`, {
          method: 'PATCH',
          data: { active: false },
          token: owner,
        })
      ).response.status(),
    ).toBe(200);
    const hiddenChair = await apiJson<{ chairs: Array<{ id: string }> }>(
      request,
      `/api/salons/${salon.salonId}/chairs`,
      { token: owner },
    );
    expect(hiddenChair.chairs.some((chair) => chair.id === chairId)).toBe(false);
    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/chairs/${chairId}`, {
          method: 'PATCH',
          data: { active: true },
          token: owner,
        })
      ).response.status(),
    ).toBe(200);
    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/chairs/${chairId}`, {
          method: 'DELETE',
          token: owner,
        })
      ).response.status(),
    ).toBe(200);

    const createdService = await apiJson<{
      service: {
        id: string;
        name: string;
        durationMinutes: number;
        priceRial: number;
        requiresDeposit: boolean;
        depositRial: number | null;
      };
    }>(request, `/api/salons/${salon.salonId}/services`, {
      method: 'POST',
      data: { name: 'E2E Config Service', durationMinutes: 45, priceRial: 750000 },
      token: owner,
    });
    expect(createdService.service.durationMinutes).toBe(45);
    expect(createdService.service.priceRial).toBe(750000);
    expect(createdService.service.requiresDeposit).toBe(false);
    expect(createdService.service.depositRial).toBeNull();
    expect(
      (
        await apiCall(
          request,
          `/api/salons/${salon.salonId}/services/${createdService.service.id}`,
          { method: 'DELETE', token: owner },
        )
      ).response.status(),
    ).toBe(200);

    const workingHours = await apiJson<{ hours: typeof HOURS }>(
      request,
      `/api/salons/${salon.salonId}/working-hours`,
      { token: owner },
    );
    expect(workingHours.hours.length).toBeGreaterThan(0);
    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/working-hours`, {
          method: 'PUT',
          data: { hours: HOURS },
          token: owner,
        })
      ).response.status(),
    ).toBe(200);
    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/working-hours`, {
          method: 'PUT',
          data: { hours: [{ weekday: 1, startTime: '20:00', endTime: '09:00' }] },
          token: owner,
        })
      ).response.status(),
    ).toBe(400);
    const staffHours = await apiJson<{ hours: unknown[] }>(
      request,
      `/api/salons/${salon.salonId}/staff/${stylist.staff.id}/working-hours`,
      { token: owner },
    );
    expect(Array.isArray(staffHours.hours)).toBe(true);

    const originalWindow = await apiJson<{ bookingWindowDays: number }>(
      request,
      `/api/salons/${salon.salonId}/booking-policy`,
      { token: owner },
    );
    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/booking-policy`, {
          method: 'PUT',
          data: { bookingWindowDays: 2 },
          token: owner,
        })
      ).response.status(),
    ).toBe(200);
    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/booking-policy`, {
          method: 'PUT',
          data: { bookingWindowDays: 999 },
          token: owner,
        })
      ).response.status(),
    ).toBe(400);
    await apiJson(request, `/api/salons/${salon.salonId}/booking-policy`, {
      method: 'PUT',
      data: { bookingWindowDays: originalWindow.bookingWindowDays },
      token: owner,
    });

    const approval = await apiJson<{ autoApprove: boolean }>(
      request,
      `/api/salons/${salon.salonId}/approval-policy`,
      { token: owner },
    );
    expect(typeof approval.autoApprove).toBe('boolean');
    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/auto-approve`, {
          method: 'POST',
          data: { autoApprove: true },
          token: owner,
        })
      ).response.status(),
    ).toBe(200);
    expect(
      (
        await apiCall(request, `/api/staff/${stylist.staff.id}/auto-approve`, {
          method: 'POST',
          data: { autoApprove: false },
          token: owner,
        })
      ).response.status(),
    ).toBe(200);
    const inherited = await apiJson<{ autoApprove: null }>(
      request,
      `/api/staff/${stylist.staff.id}/auto-approve`,
      { method: 'POST', data: { autoApprove: null }, token: owner },
    );
    expect(inherited.autoApprove).toBeNull();
    await apiJson(request, `/api/salons/${salon.salonId}/auto-approve`, {
      method: 'POST',
      data: { autoApprove: false },
      token: owner,
    });

    const accent = await apiJson<{ brandAccent: string | null }>(
      request,
      `/api/salons/${salon.salonId}/brand-accent`,
      { method: 'POST', data: { brandAccent: 'rose' }, token: owner },
    );
    expect(accent.brandAccent).toBe('rose');
    const publicAccent = await apiJson<{ brandAccent: string | null }>(
      request,
      `/api/salons/${salon.salonId}/brand`,
    );
    expect(publicAccent.brandAccent).toBe('rose');
    await apiJson(request, `/api/salons/${salon.salonId}/brand-accent`, {
      method: 'POST',
      data: { brandAccent: null },
      token: owner,
    });

    const holidayRange = await apiJson<{ holidays: Array<{ id: string }> }>(
      request,
      `/api/salons/${salon.salonId}/holidays`,
      {
        method: 'POST',
        data: { onDate: isoDateFromToday(5), toDate: isoDateFromToday(7) },
        token: owner,
      },
    );
    expect(holidayRange.holidays).toHaveLength(3);
    for (const holiday of holidayRange.holidays) {
      expect(
        (
          await apiCall(request, `/api/salons/${salon.salonId}/holidays/${holiday.id}`, {
            method: 'DELETE',
            token: owner,
          })
        ).response.status(),
      ).toBe(200);
    }
    const partialHoliday = await apiJson<{ holiday: { id: string; startTime: string } }>(
      request,
      `/api/salons/${salon.salonId}/holidays`,
      {
        method: 'POST',
        data: { onDate: isoDateFromToday(8), startTime: '12:00', endTime: '14:00' },
        token: owner,
      },
    );
    expect(partialHoliday.holiday.startTime).toBe('12:00');
    await apiCall(request, `/api/salons/${salon.salonId}/holidays/${partialHoliday.holiday.id}`, {
      method: 'DELETE',
      token: owner,
    });
    const badHoliday = await apiCall(request, `/api/salons/${salon.salonId}/holidays`, {
      method: 'POST',
      data: { onDate: 'bad-date' },
      token: owner,
    });
    expect(badHoliday.response.status()).toBe(400);
    const emergency = await apiJson<{ cancelledCount: number; failedCount: number }>(
      request,
      `/api/salons/${salon.salonId}/emergency-close`,
      {
        method: 'POST',
        data: { onDate: isoDateFromToday(9), cancelAppointments: false },
        token: owner,
      },
    );
    expect(emergency).toMatchObject({ cancelledCount: 0, failedCount: 0 });
    const closures = await apiJson<{ holidays: Array<{ id: string; onDate: string }> }>(
      request,
      `/api/salons/${salon.salonId}/holidays`,
      { token: owner },
    );
    for (const closure of closures.holidays.filter((row) => row.onDate === isoDateFromToday(9))) {
      await apiCall(request, `/api/salons/${salon.salonId}/holidays/${closure.id}`, {
        method: 'DELETE',
        token: owner,
      });
    }

    const blocks = await apiJson<{ blocks: Array<{ id: string }> }>(
      request,
      `/api/staff/${stylist.staff.id}/availability-blocks`,
      { token: owner },
    );
    expect(Array.isArray(blocks.blocks)).toBe(true);
    const blockRange = await apiJson<{ blocks: Array<{ id: string }> }>(
      request,
      `/api/staff/${stylist.staff.id}/availability-blocks`,
      {
        method: 'POST',
        data: { onDate: isoDateFromToday(10), toDate: isoDateFromToday(11), startTime: '13:00', endTime: '15:00' },
        token: owner,
      },
    );
    expect(blockRange.blocks).toHaveLength(2);
    for (const block of blockRange.blocks) {
      expect(
        (
          await apiCall(
            request,
            `/api/staff/${stylist.staff.id}/availability-blocks/${block.id}`,
            { method: 'DELETE', token: owner },
          )
        ).response.status(),
      ).toBe(200);
    }

    const stylistBeforeGrant = await apiCall(
      request,
      `/api/staff/${stylist.staff.id}/availability-blocks`,
      { token: stylist.auth.accessToken },
    );
    expect(stylistBeforeGrant.response.status()).toBe(403);
    await apiJson(request, `/api/staff/${stylist.staff.id}/manage-availability`, {
      method: 'POST',
      data: { allowed: true },
      token: owner,
    });
    const stylistBlock = await apiJson<{ block: { id: string } }>(
      request,
      `/api/staff/${stylist.staff.id}/availability-blocks`,
      {
        method: 'POST',
        data: { onDate: isoDateFromToday(12) },
        token: stylist.auth.accessToken,
      },
    );
    expect(stylistBlock.block.id).toBeTruthy();
    const wrongTarget = await apiCall(
      request,
      `/api/staff/${ownerStaff!.id}/availability-blocks`,
      { token: stylist.auth.accessToken },
    );
    expect(wrongTarget.response.status()).toBe(403);
    await apiJson(
      request,
      `/api/staff/${stylist.staff.id}/availability-blocks/${stylistBlock.block.id}`,
      { method: 'DELETE', token: stylist.auth.accessToken },
    );
    await apiJson(request, `/api/staff/${stylist.staff.id}/manage-availability`, {
      method: 'POST',
      data: { allowed: false },
      token: owner,
    });

    const customer = await loginWithApi(request, uniquePhone('7'));
    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/staff`, {
          token: customer.accessToken,
        })
      ).response.status(),
    ).toBe(403);
    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/staff`, {
          token: admin.auth.accessToken,
        })
      ).response.status(),
    ).toBe(200);
    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/services`, {
          method: 'POST',
          data: { name: 'Admin must not write' },
          token: admin.auth.accessToken,
        })
      ).response.status(),
    ).toBe(403);
    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/analytics?from=2026-01-01&to=2026-01-31`, {
          token: stylist.auth.accessToken,
        })
      ).response.status(),
    ).toBe(403);

    const otherSalon = await registerSalonViaApi(request, 'E2E Other Tenant');
    const otherStaff = (await staffList(request, otherSalon.salonId, otherSalon.accessToken)).staff.find(
      (member) => member.role === 'Owner',
    );
    expect(otherStaff).toBeDefined();
    const crossTenant = await apiCall(request, `/api/salons/${otherSalon.salonId}/staff`, {
      token: owner,
    });
    expect(crossTenant.response.status()).toBe(403);
    const crossWrite = await apiCall(request, `/api/salons/${otherSalon.salonId}/staff`, {
      method: 'POST',
      data: { fullName: 'Cross tenant', role: 'Stylist' },
      token: owner,
    });
    expect(crossWrite.response.status()).toBe(403);
    const crossDirectPatch = await apiCall(request, `/api/staff/${otherStaff!.id}`, {
      method: 'PATCH',
      data: { fullName: 'Should stay isolated' },
      token: owner,
    });
    expect(crossDirectPatch.response.status()).toBe(403);
    const crossDirectPolicy = await apiCall(request, `/api/staff/${otherStaff!.id}/auto-approve`, {
      method: 'POST',
      data: { autoApprove: true },
      token: owner,
    });
    expect(crossDirectPolicy.response.status()).toBe(403);
    const crossDirectBlocks = await apiCall(
      request,
      `/api/staff/${otherStaff!.id}/availability-blocks`,
      { token: owner },
    );
    expect(crossDirectBlocks.response.status()).toBe(403);

    const otherService = await apiJson<{ service: { id: string } }>(
      request,
      `/api/salons/${otherSalon.salonId}/services`,
      {
        method: 'POST',
        data: { name: 'Other tenant service' },
        token: otherSalon.accessToken,
      },
    );
    const crossServiceDelete = await apiCall(
      request,
      `/api/salons/${salon.salonId}/services/${otherService.service.id}`,
      { method: 'DELETE', token: owner },
    );
    expect(crossServiceDelete.response.status()).toBe(404);
    const otherServices = await apiJson<{ services: Array<{ id: string }> }>(
      request,
      `/api/salons/${otherSalon.salonId}/services`,
    );
    expect(otherServices.services.some((service) => service.id === otherService.service.id)).toBe(true);
  });
});

test.describe('booking state machine journeys', () => {
  test('covers pending/approve/reject/cancel/no-show/auto-approve, ownership and calendar views', async ({
    request,
  }) => {
    const salon = await registerSalonViaApi(request, 'E2E Booking Matrix');
    const owner = salon.accessToken;
    const stylist = await addStaff(request, salon.salonId, owner, 'Stylist', 'Booking');
    const admin = await addStaff(request, salon.salonId, owner, 'Admin', 'Booking');
    const service = await apiJson<{ service: { id: string } }>(
      request,
      `/api/salons/${salon.salonId}/services`,
      {
        method: 'POST',
        data: { name: 'Booking Matrix Service', durationMinutes: 30, priceRial: 300000 },
        token: owner,
      },
    );
    const staff = await staffList(request, salon.salonId, owner);
    const ownerStaff = staff.staff.find((member) => member.role === 'Owner')!;
    const date = isoDateFromToday(2);
    const customer = await loginWithApi(request, uniquePhone('1'));
    const otherCustomer = await loginWithApi(request, uniquePhone('2'));

    const firstSlot = await nextSlot(request, salon.salonId, service.service.id, date, stylist.staff.id);
    const first = await book(
      request,
      salon.salonId,
      service.service.id,
      firstSlot.startAt,
      customer.accessToken,
      stylist.staff.id,
    );
    expect(first.status).toBe('pending');
    expect(first.appointment.staffMemberId).toBe(stylist.staff.id);

    const pending = await apiJson<{ appointments: Appointment[] }>(
      request,
      `/api/salons/${salon.salonId}/pending`,
      { token: owner },
    );
    expect(pending.appointments.some((item) => item.id === first.appointment.id)).toBe(true);

    const wrongCancel = await apiCall(request, `/api/appointments/${first.appointment.id}/cancel`, {
      method: 'POST',
      token: otherCustomer.accessToken,
    });
    expect(wrongCancel.response.status()).toBe(403);
    const customerHistory = await apiJson<{ appointments: Appointment[] }>(
      request,
      '/api/customers/me/appointments',
      { token: customer.accessToken },
    );
    expect(customerHistory.appointments.some((item) => item.id === first.appointment.id)).toBe(true);

    const stylistCalendar = await apiCall(
      request,
      `/api/salons/${salon.salonId}/calendar?from=${date}&to=${isoDateFromToday(3)}&view=week`,
      { token: stylist.auth.accessToken },
    );
    expect(stylistCalendar.response.status()).toBe(200);
    expect(stylistCalendar.body).toHaveProperty('appointments');

    const approvedByOwner = await apiJson<{ status: string }>(
      request,
      `/api/appointments/${first.appointment.id}/approve`,
      { method: 'POST', token: owner },
    );
    expect(approvedByOwner.status).toBe('confirmed');

    const secondSlot = await nextSlot(request, salon.salonId, service.service.id, date, stylist.staff.id);
    const second = await book(
      request,
      salon.salonId,
      service.service.id,
      secondSlot.startAt,
      customer.accessToken,
      stylist.staff.id,
    );
    const approvedByStylist = await apiJson<{ status: string }>(
      request,
      `/api/appointments/${second.appointment.id}/approve`,
      { method: 'POST', token: stylist.auth.accessToken },
    );
    expect(approvedByStylist.status).toBe('confirmed');

    const invalidDepositService = await apiCall(request, `/api/salons/${salon.salonId}/services`, {
      method: 'POST',
      data: { name: 'Invalid deposit service', requiresDeposit: true },
      token: owner,
    });
    expect(invalidDepositService.response.status()).toBe(400);
    expect(invalidDepositService.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      field: 'depositRial',
    });
    const depositService = await apiJson<{
      service: { id: string; requiresDeposit: boolean; depositRial: number | null };
    }>(request, `/api/salons/${salon.salonId}/services`, {
      method: 'POST',
      data: {
        name: 'Booking Matrix Deposit Service',
        durationMinutes: 30,
        priceRial: 400000,
        requiresDeposit: true,
        depositRial: 100000,
      },
      token: owner,
    });
    expect(depositService.service.requiresDeposit).toBe(true);
    expect(depositService.service.depositRial).toBe(100000);
    const heldSlot = await nextSlot(
      request,
      salon.salonId,
      depositService.service.id,
      isoDateFromToday(5),
    );
    const held = await apiCall<{ status: string; appointment: Appointment; paymentRedirectUrl: string }>(
      request,
      '/api/appointments',
      {
        method: 'POST',
        data: {
          salonId: salon.salonId,
          serviceId: depositService.service.id,
          startAt: heldSlot.startAt,
        },
        token: otherCustomer.accessToken,
      },
    );
    expect(held.response.status()).toBe(200);
    expect(held.body.status).toBe('held');
    expect(held.body.paymentRedirectUrl).toContain('/api/payments/callback');
    const wrongDepositOwner = await apiCall(request, '/api/payments/initiate', {
      method: 'POST',
      data: { appointmentId: held.body.appointment.id },
      token: customer.accessToken,
    });
    expect(wrongDepositOwner.response.status()).toBe(403);

    // The customer already has an appointment at the first two slots. Use a
    // separate day for the owner-staff authorization path; duplicate same-time
    // intents are intentionally rejected by the booking abuse guard.
    const thirdDate = isoDateFromToday(3);
    const thirdSlot = await nextSlot(
      request,
      salon.salonId,
      service.service.id,
      thirdDate,
      ownerStaff.id,
    );
    const third = await book(
      request,
      salon.salonId,
      service.service.id,
      thirdSlot.startAt,
      customer.accessToken,
      ownerStaff.id,
    );
    const stylistCannotManageOther = await apiCall(
      request,
      `/api/appointments/${third.appointment.id}/approve`,
      { method: 'POST', token: stylist.auth.accessToken },
    );
    expect(stylistCannotManageOther.response.status()).toBe(403);
    const rejected = await apiJson<{ status: string }>(
      request,
      `/api/appointments/${third.appointment.id}/reject`,
      { method: 'POST', token: admin.auth.accessToken },
    );
    expect(rejected.status).toBe('cancelled');

    const fourthDate = isoDateFromToday(4);
    const fourthSlot = await nextSlot(
      request,
      salon.salonId,
      service.service.id,
      fourthDate,
    );
    const fourth = await book(
      request,
      salon.salonId,
      service.service.id,
      fourthSlot.startAt,
      customer.accessToken,
    );
    const selfCancelled = await apiJson<{ status: string }>(
      request,
      `/api/appointments/${fourth.appointment.id}/cancel`,
      { method: 'POST', token: customer.accessToken },
    );
    expect(selfCancelled.status).toBe('cancelled');

    const fifthDate = isoDateFromToday(6);
    const fifthSlot = await nextSlot(request, salon.salonId, service.service.id, fifthDate);
    const fifth = await book(
      request,
      salon.salonId,
      service.service.id,
      fifthSlot.startAt,
      customer.accessToken,
    );
    const customerNoShow = await apiCall(
      request,
      `/api/appointments/${fifth.appointment.id}/no-show`,
      { method: 'POST', token: customer.accessToken },
    );
    expect(customerNoShow.response.status()).toBe(403);
    await apiJson(request, `/api/appointments/${fifth.appointment.id}/approve`, {
      method: 'POST',
      token: owner,
    });
    const noShow = await apiJson<{ status: string }>(
      request,
      `/api/appointments/${fifth.appointment.id}/no-show`,
      { method: 'POST', token: owner },
    );
    expect(noShow.status).toBe('no_show');

    await apiJson(request, `/api/salons/${salon.salonId}/auto-approve`, {
      method: 'POST',
      data: { autoApprove: true },
      token: owner,
    });
    const sixthDate = isoDateFromToday(7);
    const sixthSlot = await nextSlot(request, salon.salonId, service.service.id, sixthDate);
    const autoApproved = await book(
      request,
      salon.salonId,
      service.service.id,
      sixthSlot.startAt,
      customer.accessToken,
      stylist.staff.id,
    );
    expect(autoApproved.status).toBe('confirmed');
    await apiJson(request, `/api/salons/${salon.salonId}/auto-approve`, {
      method: 'POST',
      data: { autoApprove: false },
      token: owner,
    });

    const calendar = await apiJson<{ appointments: Appointment[] }>(
      request,
      `/api/salons/${salon.salonId}/calendar?from=${date}&to=${isoDateFromToday(3)}&view=month`,
      { token: owner },
    );
    expect(calendar.appointments.length).toBeGreaterThan(0);
    const analytics = await apiJson<{ revenue: unknown; utilization: unknown }>(
      request,
      `/api/salons/${salon.salonId}/analytics?from=${date}&to=${isoDateFromToday(3)}`,
      { token: admin.auth.accessToken },
    );
    expect(analytics).toHaveProperty('revenue');
    const stylistAnalytics = await apiCall(
      request,
      `/api/salons/${salon.salonId}/analytics?from=${date}&to=${isoDateFromToday(3)}`,
      { token: stylist.auth.accessToken },
    );
    expect(stylistAnalytics.response.status()).toBe(403);
  });
});

test.describe('subscription, QR, card order, and transaction journeys', () => {
  test('covers trial access, purchase callback/idempotency, QR resolution, and role gates', async ({
    request,
  }) => {
    const salon = await registerSalonViaApi(request, 'E2E Premium Matrix');
    const owner = salon.accessToken;
    const admin = await addStaff(request, salon.salonId, owner, 'Admin', 'Premium');
    const stylist = await addStaff(request, salon.salonId, owner, 'Stylist', 'Premium');
    const customer = await loginWithApi(request, uniquePhone('3'));

    const plans = await apiJson<{ plans: Array<{ kind: string; priceRial: string }> }>(
      request,
      '/api/subscription/plans',
      { token: owner },
    );
    expect(plans.plans.map((plan) => plan.kind)).toEqual(
      expect.arrayContaining(['trial', 'monthly', 'quarterly', 'annual']),
    );
    const trial = await apiJson<{ status: string; planKind: string }>(
      request,
      `/api/salons/${salon.salonId}/subscription`,
      { token: owner },
    );
    expect(trial.status).toBe('trial');
    expect(trial.planKind).toBe('trial');

    const trialQr = await apiCall(request, `/api/salons/${salon.salonId}/qr`, { token: owner });
    expect(trialQr.response.status()).toBe(200);
    expect(trialQr.body).toMatchObject({ payload: expect.any(String) });
    const trialStaffQr = await apiCall(
      request,
      `/api/salons/${salon.salonId}/staff/${stylist.staff.id}/qr`,
      { token: owner },
    );
    expect(trialStaffQr.response.status()).toBe(200);
    expect(trialStaffQr.body).toMatchObject({ payload: expect.any(String) });

    const invalidPlan = await apiCall(request, '/api/subscription/purchase', {
      method: 'POST',
      data: { salonId: salon.salonId, plan: 'trial' },
      token: owner,
    });
    expect(invalidPlan.response.status()).toBe(400);
    const purchase = await apiJson<{ redirectUrl: string }>(request, '/api/subscription/purchase', {
      method: 'POST',
      data: { salonId: salon.salonId, plan: 'monthly' },
      token: owner,
    });
    expect(purchase.redirectUrl).toContain('/api/subscriptions/callback');
    const callbackUrl = new URL(`http://e2e.local${purchase.redirectUrl}`);
    const authority = callbackUrl.searchParams.get('Authority');
    expect(authority).toBeTruthy();
    const callback = await apiCall(request, `/api/subscriptions/callback?Authority=${authority}&Status=OK`, {
      maxRedirects: 0,
    });
    expect(callback.response.status()).toBe(302);
    expect(callback.response.headers().location).toContain('payment=success');
    const active = await apiJson<{ status: string; planKind: string }>(
      request,
      `/api/salons/${salon.salonId}/subscription`,
      { token: owner },
    );
    expect(active.status).toBe('active');
    expect(active.planKind).toBe('monthly');
    const replay = await apiCall(request, `/api/subscriptions/callback?Authority=${authority}&Status=OK`, {
      maxRedirects: 0,
    });
    expect(replay.response.status()).toBe(302);
    expect(replay.response.headers().location).toContain('payment=success');

    const qr = await apiJson<{ payload: string; url: string; salonName: string }>(
      request,
      `/api/salons/${salon.salonId}/qr`,
      { token: owner },
    );
    const qrAgain = await apiJson<{ payload: string; url: string }>(
      request,
      `/api/salons/${salon.salonId}/qr`,
      { token: owner },
    );
    expect(qrAgain.payload).toBe(qr.payload);
    expect(qr.url).toContain('utm_source=qr');
    const resolved = await apiJson<{ salon: { id: string }; staff?: unknown }>(
      request,
      `/api/salons/by-qr/${encodeURIComponent(qr.payload)}`,
    );
    expect(resolved.salon.id).toBe(salon.salonId);
    const staffQr = await apiJson<{ payload: string; staffName: string }>(
      request,
      `/api/salons/${salon.salonId}/staff/${stylist.staff.id}/qr`,
      { token: admin.auth.accessToken },
    );
    expect(staffQr.staffName).toContain('Premium');
    const resolvedStaff = await apiJson<{ salon: { id: string }; staff?: { id: string } }>(
      request,
      `/api/salons/by-qr/${encodeURIComponent(staffQr.payload)}`,
    );
    expect(resolvedStaff.salon.id).toBe(salon.salonId);
    expect(resolvedStaff.staff?.id).toBe(stylist.staff.id);
    expect(
      (
        await apiCall(request, `/api/salons/${salon.salonId}/scan?utm_source=qr`, {
          method: 'POST',
        })
      ).response.status(),
    ).toBe(204);

    const orderPayload = {
      template: 'card',
      accent: 'rose',
      quantity: 10,
      contactName: 'Premium Owner',
      phone: salon.ownerPhone,
      address: 'تهران، خیابان تست',
    };
    const order = await apiJson<{ orderId: string; status: string }>(
      request,
      `/api/salons/${salon.salonId}/card-orders`,
      { method: 'POST', data: orderPayload, token: owner },
    );
    expect(order).toMatchObject({ status: 'received' });
    const adminOrder = await apiCall(request, `/api/salons/${salon.salonId}/card-orders`, {
      method: 'POST',
      data: { ...orderPayload, template: 'banner' },
      token: admin.auth.accessToken,
    });
    expect(adminOrder.response.status()).toBe(201);
    const stylistOrder = await apiCall(request, `/api/salons/${salon.salonId}/card-orders`, {
      method: 'POST',
      data: orderPayload,
      token: stylist.auth.accessToken,
    });
    expect(stylistOrder.response.status()).toBe(403);
    const customerOrder = await apiCall(request, `/api/salons/${salon.salonId}/card-orders`, {
      method: 'POST',
      data: orderPayload,
      token: customer.accessToken,
    });
    expect(customerOrder.response.status()).toBe(403);

    const transactions = await apiJson<{ transactions: Array<{ kind: string }> }>(
      request,
      `/api/salons/${salon.salonId}/transactions`,
      { token: owner },
    );
    expect(transactions.transactions.some((item) => item.kind === 'subscription')).toBe(true);
    const stylistTransactions = await apiCall(
      request,
      `/api/salons/${salon.salonId}/transactions`,
      { token: stylist.auth.accessToken },
    );
    expect(stylistTransactions.response.status()).toBe(403);

    const errorCallback = await apiCall(request, '/api/subscriptions/callback?Authority=x&Status=NOK', {
      maxRedirects: 0,
    });
    expect(errorCallback.response.status()).toBe(302);
    expect(errorCallback.response.headers().location).toContain('payment=error');
  });
});

test.describe('inbox, device, webhook, and protected failure journeys', () => {
  test('scopes notifications, registers devices, and keeps public webhook/payment errors explicit', async ({
    request,
  }) => {
    const salon = await registerSalonViaApi(request, 'E2E Misc Matrix');
    const owner = salon.accessToken;
    const stylist = await addStaff(request, salon.salonId, owner, 'Stylist', 'Misc');
    const customer = await loginWithApi(request, uniquePhone('6'));
    const service = await apiJson<{ services: Array<{ id: string }> }>(
      request,
      `/api/salons/${salon.salonId}/services`,
    );
    const date = isoDateFromToday(1);
    const slot = await nextSlot(request, salon.salonId, service.services[0].id, date);
    const booking = await book(
      request,
      salon.salonId,
      service.services[0].id,
      slot.startAt,
      customer.accessToken,
    );

    const notifications = await apiJson<{
      notifications: Array<{ id: string; audience: string; readAt: string | null }>;
    }>(request, `/api/salons/${salon.salonId}/notifications?limit=200`, { token: owner });
    expect(notifications.notifications.length).toBeGreaterThan(0);
    const notification = notifications.notifications.find(
      (item) => item.audience === 'all-staff',
    ) ?? notifications.notifications[0];
    const unread = await apiJson<{ count: number }>(
      request,
      `/api/salons/${salon.salonId}/notifications/unread-count`,
      { token: owner },
    );
    expect(unread.count).toBeGreaterThanOrEqual(0);
    const marked = await apiCall(request, `/api/notifications/${notification.id}/read`, {
      method: 'PATCH',
      token: owner,
    });
    expect(marked.response.status()).toBe(200);
    const allRead = await apiJson<{ ok: boolean; count: number }>(
      request,
      `/api/salons/${salon.salonId}/notifications/read-all`,
      { method: 'POST', token: owner },
    );
    expect(allRead.ok).toBe(true);

    const stylistNotifications = await apiCall(
      request,
      `/api/salons/${salon.salonId}/notifications`,
      { token: stylist.auth.accessToken },
    );
    expect(stylistNotifications.response.status()).toBe(200);
    const customerNotifications = await apiCall(
      request,
      `/api/salons/${salon.salonId}/notifications`,
      { token: customer.accessToken },
    );
    expect(customerNotifications.response.status()).toBe(403);
    const customerMark = await apiCall(request, `/api/notifications/${notification.id}/read`, {
      method: 'PATCH',
      token: customer.accessToken,
    });
    expect(customerMark.response.status()).toBe(404);

    const otherSalon = await registerSalonViaApi(request, 'E2E Notification Other');
    const otherOwnerMark = await apiCall(
      request,
      `/api/notifications/${notification.id}/read`,
      { method: 'PATCH', token: otherSalon.accessToken },
    );
    expect(otherOwnerMark.response.status()).toBe(404);

    const device = await apiJson<{ ok: boolean }>(request, '/api/devices/token', {
      method: 'POST',
      data: { token: `e2e-device-${Date.now()}`, platform: 'web' },
      token: owner,
    });
    expect(device.ok).toBe(true);
    const customerDevice = await apiJson<{ ok: boolean }>(request, '/api/devices/token', {
      method: 'POST',
      data: { token: `e2e-customer-device-${Date.now()}`, platform: 'web' },
      token: customer.accessToken,
    });
    expect(customerDevice.ok).toBe(true);
    const missingDevice = await apiCall(request, '/api/devices/token', {
      method: 'POST',
      data: { token: 'missing-platform' },
      token: owner,
    });
    expect(missingDevice.response.status()).toBe(400);

    const missingPaymentCallback = await apiCall(request, '/api/payments/callback', {
      method: 'POST',
      data: { status: 'OK' },
    });
    expect(missingPaymentCallback.response.status()).toBe(400);
    const unauthenticatedPayment = await apiCall(request, '/api/payments/initiate', {
      method: 'POST',
      data: { appointmentId: booking.appointment.id },
    });
    expect(unauthenticatedPayment.response.status()).toBe(401);

    const badBot = await apiCall(request, '/api/bots/telegram/not-the-secret', {
      method: 'POST',
      data: { update_id: Date.now() },
    });
    expect(badBot.response.status()).toBe(403);
  });
});
