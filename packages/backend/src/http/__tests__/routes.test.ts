import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { buildApp, type Services } from '../app.js';
import { Authorizer } from '../../auth/index.js';
import { AuthError } from '../../auth/index.js';
import { RegistrationError } from '../../registration/index.js';
import { RescheduleError } from '../../scheduling/scheduling-engine.js';

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
      getSalonPublicBrand: jest.fn().mockResolvedValue({ name: null, brandAccent: null }),
    },
    serviceCatalog: {
      listServices: jest.fn().mockResolvedValue([]),
    },
    schedulingEngine: {
      getAvailability: jest.fn().mockResolvedValue([]),
      reschedule: jest.fn(),
    },
    bookingFlow: {
      book: jest.fn(),
      reject: jest.fn(),
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
      getCustomerProfile: jest.fn(),
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
      getStaffMember: jest.fn().mockImplementation(async (id: string) => ({
        id,
        salonId: 'salon-1',
      })),
    },
    availabilityConfig: {
      getWorkingHours: jest.fn().mockResolvedValue([]),
      setWorkingHours: jest.fn().mockResolvedValue([]),
      getBookingWindowDays: jest.fn().mockResolvedValue(14),
      setBookingWindowDays: jest.fn().mockResolvedValue(undefined),
      getHolidays: jest.fn().mockResolvedValue([]),
      addHoliday: jest.fn().mockResolvedValue({ id: 'holiday-1', onDate: new Date('2026-07-15') }),
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
      buildSalonQrResponse: jest.fn().mockResolvedValue({ payload: 'p', url: 'u', salonName: 's' }),
      buildStaffQrResponse: jest
        .fn()
        .mockResolvedValue({ payload: 'p', staffName: 'زهرا', salonName: 's' }),
    },
    subscriptionService: {
      getStatus: jest.fn().mockResolvedValue('active'),
    },
    customerService: {
      getProfile: jest.fn().mockResolvedValue({
        id: 'cust-1',
        phone: '09120000000',
        fullName: null,
      }),
      updateProfile: jest.fn().mockImplementation((id: string, fullName: string) =>
        Promise.resolve({ id, phone: '09120000000', fullName }),
      ),
      getHistory: jest.fn().mockResolvedValue([]),
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
      fake.authService.verifyOtp.mockRejectedValue(new AuthError('OTP_EXPIRED', 'expired'));
      const res = await request(app)
        .post('/api/auth/otp/verify')
        .send({ phone: '+989120000000', code: '000000' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'OTP_EXPIRED' });
    });

    it('maps OTP_MISMATCH to 401 OTP_INVALID', async () => {
      fake.authService.verifyOtp.mockRejectedValue(new AuthError('OTP_MISMATCH', 'wrong'));
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
      const res = await request(app).post('/api/auth/otp/verify').send({ phone: '+989120000000' });
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
      fake.salonRegistration.resolveQr.mockRejectedValue(new RegistrationError('QR_MALFORMED'));
      const res = await request(app).get('/api/salons/by-qr/bad');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: 'QR_MALFORMED' });
    });

    it('maps QR_UNREGISTERED to 404 (distinct from malformed)', async () => {
      fake.salonRegistration.resolveQr.mockRejectedValue(new RegistrationError('QR_UNREGISTERED'));
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
      fake.salonRegistration.getSalonPublicBrand.mockResolvedValue({
        name: 'Test Salon',
        brandAccent: 'rose',
      });
      const res = await request(app).get('/api/salons/salon-1/brand');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ brandAccent: 'rose', name: 'Test Salon' });
      expect(fake.salonRegistration.getSalonPublicBrand).toHaveBeenCalledWith('salon-1');
    });

    it('returns 200 { brandAccent: null } when the salon has no configured accent', async () => {
      fake.salonRegistration.getSalonPublicBrand.mockResolvedValue({ name: null, brandAccent: null });
      const res = await request(app).get('/api/salons/salon-2/brand');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ brandAccent: null, name: null });
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
      expect(fake.availabilityConfig.setSalonBrandAccent).toHaveBeenCalledWith('salon-1', 'rose');
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
      expect(fake.availabilityConfig.setSalonBrandAccent).toHaveBeenCalledWith('salon-1', null);
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
      fake.paymentService.initiateDeposit.mockResolvedValue({
        paymentId: 'pay-1',
        redirectUrl: '/gateway/redirect',
      });
      fake.bookingFlow.book.mockResolvedValue({
        status: 'held',
        appointment: { id: 'appt-held' },
        payment: { paymentId: 'placeholder', redirectUrl: '/pay/placeholder' },
      });
      const res = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${customerToken()}`)
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'held',
        appointment: { id: 'appt-held' },
        paymentRedirectUrl: '/gateway/redirect',
      });
      expect(fake.paymentService.initiateDeposit).toHaveBeenCalledWith('appt-held');
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

  // ── Deposit payment ownership (protected) ───────────────────────────────────
  describe('POST /api/payments/initiate', () => {
    const appointment = {
      id: 'appt-held',
      salonId: 'salon-1',
      customerId: 'cust-1',
      staffMemberId: 'staff-1',
    };

    it('lets the booking owner create a payment session', async () => {
      fake.calendarService.getAppointmentById.mockResolvedValue(appointment);
      fake.paymentService.initiateDeposit.mockResolvedValue({
        paymentId: 'pay-1',
        redirectUrl: '/gateway/pay-1',
      });

      const res = await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${customerToken('cust-1')}`)
        .send({ appointmentId: appointment.id });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ redirectUrl: '/gateway/pay-1' });
      expect(fake.paymentService.initiateDeposit).toHaveBeenCalledWith(appointment.id);
    });

    it('forbids another customer and never calls the payment service', async () => {
      fake.calendarService.getAppointmentById.mockResolvedValue(appointment);

      const res = await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${customerToken('cust-2')}`)
        .send({ appointmentId: appointment.id });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN' });
      expect(fake.paymentService.initiateDeposit).not.toHaveBeenCalled();
    });

    it('forbids staff tokens from creating customer payment sessions', async () => {
      fake.calendarService.getAppointmentById.mockResolvedValue(appointment);

      const res = await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${staffToken('Owner')}`)
        .send({ appointmentId: appointment.id });

      expect(res.status).toBe(403);
      expect(fake.paymentService.initiateDeposit).not.toHaveBeenCalled();
    });

    it('returns 404 without touching payment state when appointment is missing', async () => {
      fake.calendarService.getAppointmentById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${customerToken('cust-1')}`)
        .send({ appointmentId: 'missing' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 'NOT_FOUND' });
      expect(fake.paymentService.initiateDeposit).not.toHaveBeenCalled();
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
  describe('weekly working hours', () => {
    it('lets an Owner apply salon hours to active staff and chairs', async () => {
      fake.resourceRegistration.listStaff.mockResolvedValue([
        { id: 'staff-1', active: true, role: 'Stylist' },
        { id: 'staff-off', active: false, role: 'Stylist' },
      ]);
      fake.resourceRegistration.listChairs.mockResolvedValue([{ id: 'chair-1' }]);
      const hours = [{ weekday: 6, startTime: '09:00', endTime: '20:00' }];
      const res = await request(app)
        .put('/api/salons/salon-1/working-hours')
        .set('Authorization', `Bearer ${staffToken('Owner')}`)
        .send({ hours });
      expect(res.status).toBe(200);
      expect(fake.availabilityConfig.setWorkingHours).toHaveBeenCalledWith(
        'staff',
        'staff-1',
        hours,
      );
      expect(fake.availabilityConfig.setWorkingHours).toHaveBeenCalledWith(
        'chair',
        'chair-1',
        hours,
      );
      expect(fake.availabilityConfig.setWorkingHours).not.toHaveBeenCalledWith(
        'staff',
        'staff-off',
        hours,
      );
    });

    it('rejects an invalid time range', async () => {
      const res = await request(app)
        .put('/api/salons/salon-1/working-hours')
        .set('Authorization', `Bearer ${staffToken('Owner')}`)
        .send({ hours: [{ weekday: 6, startTime: '20:00', endTime: '09:00' }] });
      expect(res.status).toBe(400);
    });

    it('accepts two non-overlapping windows for a recurring break', async () => {
      fake.resourceRegistration.listStaff.mockResolvedValue([
        { id: 'staff-1', active: true, role: 'Stylist' },
      ]);
      const hours = [
        { weekday: 6, startTime: '09:00', endTime: '13:00' },
        { weekday: 6, startTime: '14:00', endTime: '20:00' },
      ];
      const res = await request(app)
        .put('/api/salons/salon-1/working-hours')
        .set('Authorization', `Bearer ${staffToken('Owner')}`)
        .send({ hours });
      expect(res.status).toBe(200);
      expect(fake.availabilityConfig.setWorkingHours).toHaveBeenCalledWith(
        'staff',
        'staff-1',
        hours,
      );
    });

    it('stores a today-only booking policy', async () => {
      const res = await request(app)
        .put('/api/salons/salon-1/booking-policy')
        .set('Authorization', `Bearer ${staffToken('Owner')}`)
        .send({ bookingWindowDays: 0 });
      expect(res.status).toBe(200);
      expect(fake.availabilityConfig.setBookingWindowDays).toHaveBeenCalledWith('salon-1', 0);
    });

    it('closes an interrupted day and cancels its active appointments', async () => {
      fake.calendarService.getSalonCalendar.mockResolvedValue([
        { id: 'pending-1', status: 'pending' },
        { id: 'confirmed-1', status: 'confirmed' },
      ]);
      fake.bookingFlow.reject.mockResolvedValue({ id: 'pending-1' });
      fake.cancellationFlow.cancel.mockResolvedValue({ id: 'confirmed-1' });
      const res = await request(app)
        .post('/api/salons/salon-1/emergency-close')
        .set('Authorization', `Bearer ${staffToken('Owner')}`)
        .send({ onDate: '2026-07-15', cancelAppointments: true });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ cancelledCount: 2, failedCount: 0 });
      expect(fake.availabilityConfig.addHoliday).toHaveBeenCalledWith('salon-1', '2026-07-15');
    });

    it('forbids an Admin from changing recurring hours', async () => {
      const res = await request(app)
        .put('/api/salons/salon-1/working-hours')
        .set('Authorization', `Bearer ${staffToken('Admin')}`)
        .send({ hours: [] });
      expect(res.status).toBe(403);
    });
  });

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

  describe('GET /api/salons/:id/customers/:customerId', () => {
    it('returns customer context for an Owner without exposing other salons', async () => {
      fake.calendarService.getCustomerProfile.mockResolvedValue({
        customer: {
          id: 'cust-1',
          phone: '+989120000000',
          fullName: 'سارا',
          noShowCount: 1,
          preferredStaff: null,
        },
        appointments: [
          {
            id: 'appt-1',
            startAt: new Date('2024-03-15T09:00:00.000Z'),
            endAt: new Date('2024-03-15T09:30:00.000Z'),
            status: 'confirmed',
            service: { name: 'کوتاهی مو' },
            staffMember: { fullName: 'زهرا' },
          },
        ],
      });

      const res = await request(app)
        .get('/api/salons/salon-1/customers/cust-1')
        .set('Authorization', `Bearer ${staffToken('Owner')}`);

      expect(res.status).toBe(200);
      expect(res.body.customer).toMatchObject({ id: 'cust-1', phone: '+989120000000' });
      expect(res.body.appointments[0]).toMatchObject({ id: 'appt-1', status: 'confirmed' });
      expect(fake.calendarService.getCustomerProfile).toHaveBeenCalledWith(
        'salon-1',
        'cust-1',
        undefined,
      );
    });

    it('scopes a Stylist profile request to their own appointment history', async () => {
      fake.calendarService.getCustomerProfile.mockResolvedValue({
        customer: {
          id: 'cust-1',
          phone: '+989120000000',
          fullName: 'سارا',
          noShowCount: 0,
          preferredStaff: null,
        },
        appointments: [],
      });

      const res = await request(app)
        .get('/api/salons/salon-1/customers/cust-1')
        .set('Authorization', `Bearer ${staffToken('Stylist')}`);

      expect(res.status).toBe(200);
      expect(fake.calendarService.getCustomerProfile).toHaveBeenCalledWith(
        'salon-1',
        'cust-1',
        'staff-Stylist-1',
      );
    });
  });

  describe('PATCH /api/appointments/:id/reschedule', () => {
    const currentAppointment = {
      id: 'appt-1',
      salonId: 'salon-1',
      staffMemberId: 'staff-Owner-1',
      status: 'confirmed',
    };

    it('moves an appointment in place for an Owner', async () => {
      fake.calendarService.getAppointmentById.mockResolvedValue(currentAppointment);
      fake.schedulingEngine.reschedule.mockResolvedValue({
        ...currentAppointment,
        startAt: new Date('2026-07-15T11:00:00.000Z'),
        endAt: new Date('2026-07-15T11:45:00.000Z'),
      });

      const res = await request(app)
        .patch('/api/appointments/appt-1/reschedule')
        .send({ startAt: '2026-07-15T11:00:00.000Z' })
        .set('Authorization', `Bearer ${staffToken('Owner')}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('confirmed');
      expect(fake.schedulingEngine.reschedule).toHaveBeenCalledWith({
        appointmentId: 'appt-1',
        startAt: '2026-07-15T11:00:00.000Z',
      });
    });

    it('returns a stable conflict code when the target slot is taken', async () => {
      fake.calendarService.getAppointmentById.mockResolvedValue(currentAppointment);
      fake.schedulingEngine.reschedule.mockRejectedValue(
        new RescheduleError('RESCHEDULE_CONFLICT'),
      );

      const res = await request(app)
        .patch('/api/appointments/appt-1/reschedule')
        .send({ startAt: '2026-07-15T11:00:00.000Z' })
        .set('Authorization', `Bearer ${staffToken('Owner')}`);

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ code: 'RESCHEDULE_CONFLICT' });
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
      expect(fake.qrService.buildStaffQrResponse).toHaveBeenCalledWith('salon-1', 'whoever');
    });
  });

  // ── Customer profile (protected, customer-owned) ───────────────────────────
  describe('GET/PATCH /api/customers/me/profile', () => {
    it('returns the authenticated customer profile', async () => {
      const res = await request(app)
        .get('/api/customers/me/profile')
        .set('Authorization', `Bearer ${customerToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.customer).toEqual({
        id: 'cust-1',
        phone: '09120000000',
        fullName: null,
      });
    });

    it('validates and persists the customer name', async () => {
      const invalid = await request(app)
        .patch('/api/customers/me/profile')
        .set('Authorization', `Bearer ${customerToken()}`)
        .send({ fullName: ' ' });
      expect(invalid.status).toBe(400);
      expect(invalid.body).toEqual({ code: 'VALIDATION_ERROR', field: 'fullName' });

      const valid = await request(app)
        .patch('/api/customers/me/profile')
        .set('Authorization', `Bearer ${customerToken()}`)
        .send({ fullName: '  سارا محمدی  ' });
      expect(valid.status).toBe(200);
      expect(fake.customerService.updateProfile).toHaveBeenCalledWith('cust-1', 'سارا محمدی');
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
