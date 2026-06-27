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
      resolveSalonByQr: jest.fn(),
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
    it('returns 200 { salon: { id, name } } on success', async () => {
      fake.salonRegistration.resolveSalonByQr.mockResolvedValue({
        id: 'salon-1',
        name: 'Test Salon',
        qrToken: 'tok',
        timezone: 'Asia/Tehran',
        createdAt: new Date(),
      });
      const res = await request(app).get('/api/salons/by-qr/some-payload');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ salon: { id: 'salon-1', name: 'Test Salon' } });
    });

    it('maps QR_MALFORMED to 400', async () => {
      fake.salonRegistration.resolveSalonByQr.mockRejectedValue(
        new RegistrationError('QR_MALFORMED'),
      );
      const res = await request(app).get('/api/salons/by-qr/bad');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: 'QR_MALFORMED' });
    });

    it('maps QR_UNREGISTERED to 404 (distinct from malformed)', async () => {
      fake.salonRegistration.resolveSalonByQr.mockRejectedValue(
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

  // ── Cancel (protected) ───────────────────────────────────────────────────────
  describe('POST /api/appointments/:id/cancel', () => {
    it('calls cancellationFlow.cancel and returns 200', async () => {
      fake.cancellationFlow.cancel.mockResolvedValue({
        id: 'appt-1',
        salonId: 'salon-1',
        startAt: new Date('2024-03-15T10:00:00.000Z'),
        endAt: new Date('2024-03-15T11:00:00.000Z'),
        status: 'cancelled',
      });
      const res = await request(app)
        .post('/api/appointments/appt-1/cancel')
        .set('Authorization', `Bearer ${customerToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
      expect(fake.cancellationFlow.cancel).toHaveBeenCalledWith('appt-1');
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

  // ── Analytics (protected, RBAC configure_salon — Owner only) ──────────────────
  describe('GET /api/salons/:id/analytics', () => {
    const query = { from: '2024-03-01T00:00:00.000Z', to: '2024-03-31T00:00:00.000Z' };

    it('returns 403 FORBIDDEN for a non-Owner (Admin)', async () => {
      const res = await request(app)
        .get('/api/salons/salon-1/analytics')
        .query(query)
        .set('Authorization', `Bearer ${staffToken('Admin')}`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN' });
      expect(fake.analyticsService.revenue).not.toHaveBeenCalled();
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
