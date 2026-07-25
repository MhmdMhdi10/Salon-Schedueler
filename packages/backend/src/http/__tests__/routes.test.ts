import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { buildApp, type Services } from '../app.js';
import { Authorizer } from '../../auth/index.js';
import { AuthError } from '../../auth/index.js';
import { RegistrationError } from '../../registration/index.js';

/**
 * Route-level tests driven with supertest against the app built by `buildApp`,
 * using faked service + flow collaborators so NO database is required
 * (Requirements 2.3, 2.4, 2.5, 2.6, 2.7, 4.1, 4.2).
 *
 * The real `Authorizer` is used so RBAC behavior is exercised faithfully.
 */

const TEST_ACCESS_SECRET = 'test-access-secret';

/** Build a fake Services container of jest mocks. The reference is shared, so
 *  tests can both drive the app and assert on the mocks. */
function makeServices() {
  return {
    authService: {
      requestOtp: jest.fn().mockResolvedValue(undefined),
      verifyOtp: jest.fn(),
      refresh: jest.fn(),
    },
    salonRegistration: {
      resolveQr: jest.fn(),
      getSalonBrandAccent: jest.fn().mockResolvedValue(null),
    },
    serviceCatalog: {
      listServices: jest.fn().mockResolvedValue([]),
    },
    schedulingEngine: {
      getAvailability: jest.fn().mockResolvedValue([]),
    },
    bookingFlow: {
      book: jest.fn(),
    },
    cancellationFlow: {
      cancel: jest.fn(),
    },
    cancellationService: {
      markNoShow: jest.fn(),
    },
    paymentService: {
      initiateDeposit: jest.fn(),
      handleCallback: jest.fn(),
    },
    notificationService: {
      sendConfirmation: jest.fn().mockResolvedValue(undefined),
    },
    calendarService: {
      getSalonCalendar: jest.fn().mockResolvedValue([]),
      getStaffCalendar: jest.fn().mockResolvedValue([]),
      getAppointmentById: jest.fn(),
    },
    analyticsService: {
      chairUtilization: jest
        .fn()
        .mockResolvedValue({ utilization: 0.5, bookedMinutes: 30, availableMinutes: 60 }),
      revenue: jest.fn().mockResolvedValue({ totalRial: BigInt(1000), appointmentCount: 2 }),
      busiestWindows: jest.fn().mockResolvedValue({ busiestWindows: [] }),
    },
    resourceRegistration: {
      listStaff: jest.fn().mockResolvedValue([]),
      listChairs: jest.fn().mockResolvedValue([]),
      listBookableStaff: jest.fn().mockResolvedValue([]),
    },
    availabilityConfig: {
      setSalonBrandAccent: jest.fn().mockResolvedValue(undefined),
      getDaysOff: jest.fn().mockResolvedValue([]),
      addDayOff: jest
        .fn()
        .mockResolvedValue({ id: 'block-1', onDate: '2026-07-15', startTime: null, endTime: null }),
      removeDayOffForStaff: jest.fn().mockResolvedValue(true),
      getStaffAvailabilityContext: jest
        .fn()
        .mockResolvedValue({ salonId: 'salon-1', manageOwnAvailability: false }),
      setStaffManageOwnAvailability: jest.fn().mockResolvedValue(undefined),
    },
    qrService: {
      buildSalonQrResponse: jest
        .fn()
        .mockResolvedValue({ payload: 'p', url: 'u', salonName: 's' }),
      buildStaffQrResponse: jest
        .fn()
        .mockResolvedValue({ payload: 'p', staffName: 'زهرا', salonName: 's' }),
    },
    authorizer: new Authorizer(),
  };
}

type FakeServices = ReturnType<typeof makeServices>;

function buildTestApp(fake: FakeServices) {
  return buildApp({
    services: fake as unknown as Services,
    jwtAccessSecret: TEST_ACCESS_SECRET,
  });
}

function customerToken(id = 'cust-1'): string {
  return jwt.sign({ sub: id, type: 'access' }, TEST_ACCESS_SECRET, { expiresIn: 60 });
}

function staffToken(role: string, id = `${role}-1`): string {
  return jwt.sign(
    { sub: id, type: 'access', role, staffMemberId: `staff-${id}` },
    TEST_ACCESS_SECRET,
    { expiresIn: 60 },
  );
}

describe('HTTP routes', () => {
  let fake: FakeServices;
  let app: ReturnType<typeof buildTestApp>;

  beforeEach(() => {
    fake = makeServices();
    app = buildTestApp(fake);
  });

  // ── Auth (public) ──────────────────────────────────────────────────────────
  describe('POST /api/auth/otp/verify', () => {
    it('returns 200 with tokens on success', async () => {
      fake.authService.verifyOtp.mockResolvedValue({
        accessToken: 'access-xyz',
        refreshToken: 'refresh-xyz',
      });
      const res = await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: '+989120000000', code: '123456' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ accessToken: 'access-xyz', refreshToken: 'refresh-xyz' });
      expect(fake.authService.verifyOtp).toHaveBeenCalledWith('+989120000000', '123456');
    });

    it('maps OTP_EXPIRED to 401 OTP_EXPIRED', async () => {
      fake.authService.verifyOtp.mockRejectedValue(
        new AuthError('OTP_EXPIRED', 'expired'),
      );
      const res = await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: '+989120000000', code: '000000' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'OTP_EXPIRED' });
    });

    it('maps OTP_MISMATCH to 401 OTP_INVALID', async () => {
      fake.authService.verifyOtp.mockRejectedValue(
        new AuthError('OTP_MISMATCH', 'wrong'),
      );
      const res = await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: '+989120000000', code: '000000' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'OTP_INVALID' });
    });

    it('maps NO_OTP to 401 OTP_INVALID', async () => {
      fake.authService.verifyOtp.mockRejectedValue(new AuthError('NO_OTP', 'none'));
      const res = await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: '+989120000000', code: '000000' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'OTP_INVALID' });
    });

    it('returns 400 VALIDATION_ERROR when a field is missing', async () => {
      const res = await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: '+989120000000' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(fake.authService.verifyOtp).not.toHaveBeenCalled();
    });
  });

  // ── Salon QR resolve (public) ────────────────────────────────────────────────
  describe('GET /api/salons/by-qr/:payload', () => {
    it('returns 200 { salon: { id, name, brandAccent } } on success', async () => {
      fake.salonRegistration.resolveQr.mockResolvedValue({
        salon: {
          id: 'salon-1',
          name: 'Test Salon',
          qrToken: 'tok',
          timezone: 'Asia/Tehran',
          brandAccent: 'rose',
          createdAt: new Date(),
        },
      });
      const res = await request(app).get('/api/salons/by-qr/some-payload');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        salon: { id: 'salon-1', name: 'Test Salon', brandAccent: 'rose' },
      });
    });

    it('includes the staff member for a stylist QR payload', async () => {
      fake.salonRegistration.resolveQr.mockResolvedValue({
        salon: {
          id: 'salon-1',
          name: 'Test Salon',
          qrToken: 'tok',
          timezone: 'Asia/Tehran',
          createdAt: new Date(),
        },
        staff: { id: 'staff-9', fullName: 'زهرا' },
      });
      const res = await request(app).get('/api/salons/by-qr/stylist-payload');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        salon: { id: 'salon-1', name: 'Test Salon', brandAccent: null },
        staff: { id: 'staff-9', fullName: 'زهرا' },
      });
    });

    it('maps QR_MALFORMED to 400', async () => {
      fake.salonRegistration.resolveQr.mockRejectedValue(
        new RegistrationError('QR_MALFORMED'),
      );
      const res = await request(app).get('/api/salons/by-qr/bad');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: 'QR_MALFORMED' });
    });

    it('maps QR_UNREGISTERED to 404 (distinct from malformed)', async () => {
      fake.salonRegistration.resolveQr.mockRejectedValue(
        new RegistrationError('QR_UNREGISTERED'),
      );
      const res = await request(app).get('/api/salons/by-qr/unknown');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 'QR_UNREGISTERED' });
    });
  });

  // ── Availability (public) ────────────────────────────────────────────────────
  describe('GET /api/salons/:id/availability', () => {
    it('returns 200 { slots } from the scheduling engine', async () => {
      const slots = [{ startAt: '2024-03-15T10:00:00.000Z', endAt: '2024-03-15T11:00:00.000Z' }];
      fake.schedulingEngine.getAvailability.mockResolvedValue(slots);
      const res = await request(app)
        .get('/api/salons/salon-1/availability')
        .query({ serviceId: 'svc-1', date: '2024-03-15' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ slots });
      expect(fake.schedulingEngine.getAvailability).toHaveBeenCalledWith({
        salonId: 'salon-1',
        serviceId: 'svc-1',
        date: '2024-03-15',
      });
    });

    it('returns 400 VALIDATION_ERROR when serviceId/date are missing', async () => {
      const res = await request(app).get('/api/salons/salon-1/availability');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  // ── Salon Brand_Accent read (public) ─────────────────────────────────────────
  describe('GET /api/salons/:id/brand', () => {
    it('returns 200 { brandAccent } from the salon registration read', async () => {
      fake.salonRegistration.getSalonBrandAccent.mockResolvedValue('rose');
      const res = await request(app).get('/api/salons/salon-1/brand');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ brandAccent: 'rose' });
      expect(fake.salonRegistration.getSalonBrandAccent).toHaveBeenCalledWith('salon-1');
    });

    it('returns 200 { brandAccent: null } when the salon has no configured accent', async () => {
      fake.salonRegistration.getSalonBrandAccent.mockResolvedValue(null);
      const res = await request(app).get('/api/salons/salon-2/brand');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ brandAccent: null });
    });
  });

  // ── Brand_Accent write (protected, RBAC configure_salon — Owner only) ─────────
  // signature-ui-system R4.1: configure_salon succeeds; other roles 403 with no
  // state change; null clears the accent to the signature default.
  describe('POST /api/salons/:id/brand-accent', () => {
    it('allows an Owner (configure_salon) and persists the accent', async () => {
      const res = await request(app)
        .post('/api/salons/salon-1/brand-accent')
        .set('Authorization', `Bearer ${staffToken('Owner')}`)
        .send({ brandAccent: 'rose' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, brandAccent: 'rose' });
      expect(fake.availabilityConfig.setSalonBrandAccent).toHaveBeenCalledWith(
        'salon-1',
        'rose',
      );
    });

    it('returns 403 FORBIDDEN for an Admin with no state change', async () => {
      const res = await request(app)
        .post('/api/salons/salon-1/brand-accent')
        .set('Authorization', `Bearer ${staffToken('Admin')}`)
        .send({ brandAccent: 'rose' });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN' });
      expect(fake.availabilityConfig.setSalonBrandAccent).not.toHaveBeenCalled();
    });

    it('returns 403 FORBIDDEN for a Stylist with no state change', async () => {
      const res = await request(app)
        .post('/api/salons/salon-1/brand-accent')
        .set('Authorization', `Bearer ${staffToken('Stylist')}`)
        .send({ brandAccent: 'rose' });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN' });
      expect(fake.availabilityConfig.setSalonBrandAccent).not.toHaveBeenCalled();
    });

    it('returns 403 FORBIDDEN for a customer (no staff role) with no state change', async () => {
      const res = await request(app)
        .post('/api/salons/salon-1/brand-accent')
        .set('Authorization', `Bearer ${customerToken()}`)
        .send({ brandAccent: 'rose' });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN' });
      expect(fake.availabilityConfig.setSalonBrandAccent).not.toHaveBeenCalled();
    });

    it('clears the accent to the signature default when brandAccent is null', async () => {
      const res = await request(app)
        .post('/api/salons/salon-1/brand-accent')
        .set('Authorization', `Bearer ${staffToken('Owner')}`)
        .send({ brandAccent: null });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, brandAccent: null });
      expect(fake.availabilityConfig.setSalonBrandAccent).toHaveBeenCalledWith(
        'salon-1',
        null,
      );
    });
  });

  // ── Booking (protected) ──────────────────────────────────────────────────────
  describe('POST /api/appointments', () => {
    const body = {
      salonId: 'salon-1',
      serviceId: 'svc-1',
      startAt: '2024-03-15T10:00:00.000Z',
    };

    it('requires authentication (401 without token)', async () => {
      const res = await request(app).post('/api/appointments').send(body);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHORIZED' });
      expect(fake.bookingFlow.book).not.toHaveBeenCalled();
    });

    it('returns 200 pending and calls bookingFlow.book with principal + source', async () => {
      fake.bookingFlow.book.mockResolvedValue({
        status: 'pending',
        appointment: { id: 'appt-1' },
      });
      const res = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${customerToken('cust-9')}`)
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'pending', appointment: { id: 'appt-1' } });
      expect(fake.bookingFlow.book).toHaveBeenCalledWith({
        salonId: 'salon-1',
        serviceId: 'svc-1',
        startAt: '2024-03-15T10:00:00.000Z',
        preferredStaffId: undefined,
        customerId: 'cust-9',
        source: 'web',
      });
    });

    it('returns held with paymentRedirectUrl', async () => {
      fake.bookingFlow.book.mockResolvedValue({
        status: 'held',
        appointment: { id: 'appt-held' },
        payment: { paymentId: 'pay-1', redirectUrl: '/pay/redirect' },
      });
      const res = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${customerToken()}`)
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'held',
        appointment: { id: 'appt-held' },
        paymentRedirectUrl: '/pay/redirect',
      });
    });

    it('maps rejected no_availability to 409 BOOKING_NO_AVAILABILITY', async () => {
      fake.bookingFlow.book.mockResolvedValue({
        status: 'rejected',
        reason: 'no_availability',
      });
      const res = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${customerToken()}`)
        .send(body);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ code: 'BOOKING_NO_AVAILABILITY' });
    });

    it('maps rejected slot_unavailable to 409 BOOKING_SLOT_UNAVAILABLE', async () => {
      fake.bookingFlow.book.mockResolvedValue({
        status: 'rejected',
        reason: 'slot_unavailable',
      });
      const res = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${customerToken()}`)
        .send(body);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ code: 'BOOKING_SLOT_UNAVAILABLE' });
    });
  });

  // ── Cancel (protected: owning customer OR managing staff) ────────────────────
  describe('POST /api/appointments/:id/cancel', () => {
    const cancelled = {
      id: 'appt-1',
      salonId: 'salon-1',
      startAt: new Date('2024-03-15T10:00:00.000Z'),
      endAt: new Date('2024-03-15T11:00:00.000Z'),
      status: 'cancelled',
    };

    it('lets the owning customer cancel their booking and returns 200', async () => {
      fake.calendarService.getAppointmentById.mockResolvedValue({
        id: 'appt-1',
        salonId: 'salon-1',
        customerId: 'cust-1',
        staffMemberId: 'staff-1',
      });
      fake.cancellationFlow.cancel.mockResolvedValue(cancelled);
      const res = await request(app)
        .post('/api/appointments/appt-1/cancel')
        .set('Authorization', `Bearer ${customerToken('cust-1')}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
      expect(fake.cancellationFlow.cancel).toHaveBeenCalledWith('appt-1');
    });

    it('forbids a different customer from cancelling another customer booking (403)', async () => {
      fake.calendarService.getAppointmentById.mockResolvedValue({
        id: 'appt-1',
        salonId: 'salon-1',
        customerId: 'cust-1',
        staffMemberId: 'staff-1',
      });
      const res = await request(app)
        .post('/api/appointments/appt-1/cancel')
        .set('Authorization', `Bearer ${customerToken('cust-2')}`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN' });
      expect(fake.cancellationFlow.cancel).not.toHaveBeenCalled();
    });

    it('lets managing staff (Owner) cancel any salon booking and returns 200', async () => {
      fake.calendarService.getAppointmentById.mockResolvedValue({
        id: 'appt-1',
        salonId: 'salon-1',
        customerId: 'cust-9',
        staffMemberId: 'staff-1',
      });
      fake.cancellationFlow.cancel.mockResolvedValue(cancelled);
      const res = await request(app)
        .post('/api/appointments/appt-1/cancel')
        .set('Authorization', `Bearer ${staffToken('Owner')}`);
      expect(res.status).toBe(200);
      expect(fake.cancellationFlow.cancel).toHaveBeenCalledWith('appt-1');
    });

    it('returns 404 when the appointment does not exist', async () => {
      fake.calendarService.getAppointmentById.mockResolvedValue(null);
      const res = await request(app)
        .post('/api/appointments/missing/cancel')
        .set('Authorization', `Bearer ${customerToken('cust-1')}`);
      expect(res.status).toBe(404);
      expect(fake.cancellationFlow.cancel).not.toHaveBeenCalled();
    });
  });

  // ── Staff availability blocks (stylist self-service, salon-granted) ──────────
  describe('POST /api/staff/:staffId/availability-blocks', () => {
    it('lets an Owner add a block for any stylist (201)', async () => {
      const res = await request(app)
        .post('/api/staff/staff-x/availability-blocks')
        .set('Authorization', `Bearer ${staffToken('Owner')}`)
        .send({ onDate: '2026-07-15' });
      expect(res.status).toBe(201);
      expect(fake.availabilityConfig.addDayOff).toHaveBeenCalled();
    });

    it('lets a granted Stylist block their OWN time (201)', async () => {
      fake.availabilityConfig.getStaffAvailabilityContext.mockResolvedValue({
        salonId: 'salon-1',
        manageOwnAvailability: true,
      });
      const res = await request(app)
        .post('/api/staff/staff-Stylist-1/availability-blocks')
        .set('Authorization', `Bearer ${staffToken('Stylist')}`)
        .send({ onDate: '2026-07-15', startTime: '12:00', endTime: '13:00' });
      expect(res.status).toBe(201);
      expect(fake.availabilityConfig.addDayOff).toHaveBeenCalledWith(
        'staff-Stylist-1',
        '2026-07-15',
        '12:00',
        '13:00',
      );
    });

    it('forbids a Stylist who was NOT granted the permission (403)', async () => {
      fake.availabilityConfig.getStaffAvailabilityContext.mockResolvedValue({
        salonId: 'salon-1',
        manageOwnAvailability: false,
      });
      const res = await request(app)
        .post('/api/staff/staff-Stylist-1/availability-blocks')
        .set('Authorization', `Bearer ${staffToken('Stylist')}`)
        .send({ onDate: '2026-07-15' });
      expect(res.status).toBe(403);
      expect(fake.availabilityConfig.addDayOff).not.toHaveBeenCalled();
    });

    it('forbids a Stylist managing another stylist (403)', async () => {
      const res = await request(app)
        .post('/api/staff/staff-OTHER/availability-blocks')
        .set('Authorization', `Bearer ${staffToken('Stylist')}`)
        .send({ onDate: '2026-07-15' });
      expect(res.status).toBe(403);
      expect(fake.availabilityConfig.addDayOff).not.toHaveBeenCalled();
    });

    it('forbids a customer (403)', async () => {
      const res = await request(app)
        .post('/api/staff/staff-Stylist-1/availability-blocks')
        .set('Authorization', `Bearer ${customerToken()}`)
        .send({ onDate: '2026-07-15' });
      expect(res.status).toBe(403);
    });

    it('validates the date (400)', async () => {
      const res = await request(app)
        .post('/api/staff/staff-x/availability-blocks')
        .set('Authorization', `Bearer ${staffToken('Owner')}`)
        .send({ onDate: 'not-a-date' });
      expect(res.status).toBe(400);
    });
  });

  // ── Owner grant of a stylist's self-availability permission ──────────────────
  describe('POST /api/staff/:id/manage-availability', () => {
    it('allows an Owner to grant the permission (200)', async () => {
      const res = await request(app)
        .post('/api/staff/staff-x/manage-availability')
        .set('Authorization', `Bearer ${staffToken('Owner')}`)
        .send({ allowed: true });
      expect(res.status).toBe(200);
      expect(fake.availabilityConfig.setStaffManageOwnAvailability).toHaveBeenCalledWith(
        'staff-x',
        true,
      );
    });

    it('forbids an Admin (configure_salon is Owner-only) (403)', async () => {
      const res = await request(app)
        .post('/api/staff/staff-x/manage-availability')
        .set('Authorization', `Bearer ${staffToken('Admin')}`)
        .send({ allowed: true });
      expect(res.status).toBe(403);
      expect(fake.availabilityConfig.setStaffManageOwnAvailability).not.toHaveBeenCalled();
    });
  });

  // ── No-show (protected, RBAC manage_appointments) ────────────────────────────
  describe('POST /api/appointments/:id/no-show', () => {
    it('returns 403 FORBIDDEN for a customer (no staff role)', async () => {
      const res = await request(app)
        .post('/api/appointments/appt-1/no-show')
        .set('Authorization', `Bearer ${customerToken()}`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN' });
      expect(fake.cancellationService.markNoShow).not.toHaveBeenCalled();
    });

    it('allows an Owner and returns 200', async () => {
      fake.cancellationService.markNoShow.mockResolvedValue({
        id: 'appt-1',
        status: 'no_show',
      });
      const res = await request(app)
        .post('/api/appointments/appt-1/no-show')
        .set('Authorization', `Bearer ${staffToken('Owner')}`);
      expect(res.status).toBe(200);
      expect(fake.cancellationService.markNoShow).toHaveBeenCalledWith('appt-1');
    });
  });

  // ── Calendar (protected, RBAC view_own_appointments) ─────────────────────────
  // R2.5: Owner/Admin/Stylist may all view the calendar; a Stylist sees ONLY their
  // own appointments (getStaffCalendar) while Owner/Admin see the whole salon
  // (getSalonCalendar). A customer (no staff role) is denied with no state change.
  describe('GET /api/salons/:id/calendar', () => {
    const query = { from: '2024-03-01T00:00:00.000Z', to: '2024-03-31T00:00:00.000Z' };

    it('returns 200 with only the Stylist own appointments (getStaffCalendar)', async () => {
      const res = await request(app)
        .get('/api/salons/salon-1/calendar')
        .query(query)
        .set('Authorization', `Bearer ${staffToken('Stylist')}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ appointments: [] });
      expect(fake.calendarService.getStaffCalendar).toHaveBeenCalledWith(
        'staff-Stylist-1',
        expect.any(Date),
        expect.any(Date),
      );
      expect(fake.calendarService.getSalonCalendar).not.toHaveBeenCalled();
    });

    it('returns 200 with the whole salon for an Owner (getSalonCalendar)', async () => {
      const res = await request(app)
        .get('/api/salons/salon-1/calendar')
        .query(query)
        .set('Authorization', `Bearer ${staffToken('Owner')}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ appointments: [] });
      expect(fake.calendarService.getSalonCalendar).toHaveBeenCalledWith(
        'salon-1',
        expect.any(Date),
        expect.any(Date),
      );
      expect(fake.calendarService.getStaffCalendar).not.toHaveBeenCalled();
    });

    it('returns 200 with the whole salon for an Admin (getSalonCalendar)', async () => {
      const res = await request(app)
        .get('/api/salons/salon-1/calendar')
        .query(query)
        .set('Authorization', `Bearer ${staffToken('Admin')}`);
      expect(res.status).toBe(200);
      expect(fake.calendarService.getSalonCalendar).toHaveBeenCalledWith(
        'salon-1',
        expect.any(Date),
        expect.any(Date),
      );
    });

    it('maps enriched rows to a flat DTO with service/customer/staff names', async () => {
      fake.calendarService.getSalonCalendar.mockResolvedValue([
        {
          id: 'a1',
          startAt: new Date('2024-03-15T09:00:00.000Z'),
          endAt: new Date('2024-03-15T09:30:00.000Z'),
          status: 'pending',
          staffMemberId: 'st1',
          service: { name: 'کوتاهی مو' },
          customer: { fullName: 'سارا' },
          staffMember: { fullName: 'زهرا' },
        },
      ]);
      const res = await request(app)
        .get('/api/salons/salon-1/calendar')
        .query(query)
        .set('Authorization', `Bearer ${staffToken('Owner')}`);
      expect(res.status).toBe(200);
      expect(res.body.appointments[0]).toMatchObject({
        id: 'a1',
        serviceName: 'کوتاهی مو',
        customerName: 'سارا',
        staffName: 'زهرا',
      });
    });

    it('returns 403 FORBIDDEN for a customer (no staff role) with no state change', async () => {
      const res = await request(app)
        .get('/api/salons/salon-1/calendar')
        .query(query)
        .set('Authorization', `Bearer ${customerToken()}`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN' });
      expect(fake.calendarService.getStaffCalendar).not.toHaveBeenCalled();
      expect(fake.calendarService.getSalonCalendar).not.toHaveBeenCalled();
    });

    it('returns 400 VALIDATION_ERROR when from/to are missing', async () => {
      const res = await request(app)
        .get('/api/salons/salon-1/calendar')
        .set('Authorization', `Bearer ${staffToken('Owner')}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  // ── Per-stylist QR (protected, RBAC view_own_appointments) ───────────────────
  // Owner/Admin may fetch ANY stylist's QR; a Stylist may fetch ONLY their own
  // (staffId === their own staffMemberId). staffToken(role) signs
  // staffMemberId = 'staff-' + (role + '-1'), e.g. Stylist -> 'staff-Stylist-1'.
  describe('GET /api/salons/:id/staff/:staffId/qr', () => {
    it('allows a Stylist to fetch their OWN QR (200 with payload)', async () => {
      const res = await request(app)
        .get('/api/salons/salon-1/staff/staff-Stylist-1/qr')
        .set('Authorization', `Bearer ${staffToken('Stylist')}`);
      expect(res.status).toBe(200);
      expect(res.body.payload).toBe('p');
      expect(fake.qrService.buildStaffQrResponse).toHaveBeenCalledWith(
        'salon-1',
        'staff-Stylist-1',
      );
    });

    it('returns 403 FORBIDDEN when a Stylist requests a different stylist QR', async () => {
      const res = await request(app)
        .get('/api/salons/salon-1/staff/other-staff/qr')
        .set('Authorization', `Bearer ${staffToken('Stylist')}`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN' });
      expect(fake.qrService.buildStaffQrResponse).not.toHaveBeenCalled();
    });

    it('allows an Owner to fetch ANY stylist QR (200)', async () => {
      const res = await request(app)
        .get('/api/salons/salon-1/staff/whoever/qr')
        .set('Authorization', `Bearer ${staffToken('Owner')}`);
      expect(res.status).toBe(200);
      expect(fake.qrService.buildStaffQrResponse).toHaveBeenCalledWith(
        'salon-1',
        'whoever',
      );
    });
  });

  // ── Analytics (protected, RBAC manage_appointments — Owner/Admin) ─────────────
  describe('GET /api/salons/:id/analytics', () => {
    const query = { from: '2024-03-01T00:00:00.000Z', to: '2024-03-31T00:00:00.000Z' };

    it('returns 200 for an Admin', async () => {
      const res = await request(app)
        .get('/api/salons/salon-1/analytics')
        .query(query)
        .set('Authorization', `Bearer ${staffToken('Admin')}`);
      expect(res.status).toBe(200);
      expect(res.body.revenue).toEqual({ totalRial: 1000, appointmentCount: 2 });
    });

    it('returns 403 FORBIDDEN for a Stylist', async () => {
      const res = await request(app)
        .get('/api/salons/salon-1/analytics')
        .query(query)
        .set('Authorization', `Bearer ${staffToken('Stylist')}`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN' });
    });

    it('returns 200 with utilization/revenue/busiestWindows for an Owner', async () => {
      const res = await request(app)
        .get('/api/salons/salon-1/analytics')
        .query(query)
        .set('Authorization', `Bearer ${staffToken('Owner')}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        utilization: { utilization: 0.5, bookedMinutes: 30, availableMinutes: 60 },
        revenue: { totalRial: 1000, appointmentCount: 2 },
        busiestWindows: [],
      });
    });
  });
});
