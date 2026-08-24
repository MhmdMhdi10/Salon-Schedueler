import { PaymentService } from './payment.service';
import type { PaymentGateway } from './payment-gateway.interface';
import type { PaymentCallbackPayload } from './payment.service';

/**
 * Unit tests for PaymentService.
 *
 * Tests the initiateDeposit, handleCallback, refundDeposit, and retainDeposit flows.
 * Uses mocked PrismaClient and PaymentGateway.
 *
 * Requirements: R10.2, R10.3, R10.5, R11.2, R11.3
 */

function createMockGateway(overrides: Partial<PaymentGateway> = {}): PaymentGateway {
  return {
    request: jest.fn().mockResolvedValue({
      authority: 'auth-123',
      redirectUrl: 'https://sandbox.zarinpal.com/pg/StartPay/auth-123',
    }),
    verify: jest.fn().mockResolvedValue({ ok: true, refId: 'ref-456' }),
    refund: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

function createMockPrisma(overrides: Record<string, any> = {}) {
  return {
    appointment: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ where, data }) => {
        return Promise.resolve({ id: where.id, ...data });
      }),
    },
    payment: {
      create: jest.fn().mockResolvedValue({
        id: 'pay-1',
        appointmentId: 'appt-1',
        amountRial: BigInt(500000),
        status: 'pending',
        gateway: 'zarinpal',
        authority: null,
        refId: null,
        createdAt: new Date(),
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ where, data }) => {
        return Promise.resolve({ id: where.id, ...data });
      }),
    },
    ...overrides,
  } as any;
}

function createMockSchedulingEngine() {
  return {
    confirmHeld: jest.fn().mockResolvedValue({
      id: 'appt-1',
      status: 'confirmed',
    }),
  } as any;
}

const CALLBACK_BASE_URL = 'https://api.salon.app';

describe('PaymentService', () => {
  describe('initiateDeposit (R10.2, R10.5)', () => {
    it('creates a pending card-transfer payment with salon instructions', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        status: 'held',
        serviceId: 'svc-1',
        service: {
          id: 'svc-1',
          depositRial: BigInt(200000),
        },
        salon: {
          depositMethod: 'card_transfer',
          depositCardNumber: '6037991234567890',
          depositCardHolder: 'صاحب سالن',
          depositBankName: 'بانک تست',
        },
      });

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      const result = await service.initiateDeposit('appt-1');

      expect(result.paymentId).toBe('pay-1');
      expect(result.method).toBe('card_transfer');
      expect(result.cardNumber).toBe('6037991234567890');
      expect(result.cardHolder).toBe('صاحب سالن');
      expect(result.bankName).toBe('بانک تست');
      expect(result.redirectUrl).toBeUndefined();

      // Payment record created with correct amount in Rial (R10.5)
      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          appointmentId: 'appt-1',
          amountRial: BigInt(200000),
          status: 'pending',
        }),
      });

      expect(gateway.request).not.toHaveBeenCalled();
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('throws if appointment not found', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      prisma.appointment.findUnique.mockResolvedValue(null);

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      await expect(service.initiateDeposit('nonexistent')).rejects.toThrow(
        'Appointment nonexistent not found',
      );
    });

    it('throws if appointment is not in held status', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        status: 'confirmed',
        serviceId: 'svc-1',
        service: { id: 'svc-1', depositRial: BigInt(200000) },
      });

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      await expect(service.initiateDeposit('appt-1')).rejects.toThrow(
        "not in 'held' status",
      );
    });

    it('throws if service has no deposit configured', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        status: 'held',
        serviceId: 'svc-1',
        service: { id: 'svc-1', depositRial: null },
      });

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      await expect(service.initiateDeposit('appt-1')).rejects.toThrow(
        'does not have a deposit configured',
      );
    });
  });

  describe('handleCallback (R10.3)', () => {
    it('verifies payment and confirms the held appointment', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        appointmentId: 'appt-1',
        amountRial: BigInt(200000),
        status: 'pending',
        gateway: 'zarinpal',
        authority: 'auth-123',
        refId: null,
        appointment: { id: 'appt-1', status: 'held' },
      });

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      const payload: PaymentCallbackPayload = { authority: 'auth-123', status: 'OK' };
      const result = await service.handleCallback(payload);

      expect(result.confirmed).toBe(true);

      // Gateway verify called
      expect(gateway.verify).toHaveBeenCalledWith('auth-123', 200000);

      // Payment updated to paid with refId
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: 'paid', refId: 'ref-456' },
      });

      // Appointment confirmed
      expect(schedulingEngine.confirmHeld).toHaveBeenCalledWith('appt-1');
    });

    it('marks payment as failed when gateway status is not OK', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        appointmentId: 'appt-1',
        amountRial: BigInt(200000),
        status: 'pending',
        gateway: 'zarinpal',
        authority: 'auth-123',
        refId: null,
        appointment: { id: 'appt-1', status: 'held' },
      });

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      const payload: PaymentCallbackPayload = { authority: 'auth-123', status: 'NOK' };
      const result = await service.handleCallback(payload);

      expect(result.confirmed).toBe(false);
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: 'failed' },
      });
      expect(schedulingEngine.confirmHeld).not.toHaveBeenCalled();
    });

    it('marks payment as failed when gateway verify returns ok=false', async () => {
      const gateway = createMockGateway({
        verify: jest.fn().mockResolvedValue({ ok: false }),
      });
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        appointmentId: 'appt-1',
        amountRial: BigInt(200000),
        status: 'pending',
        gateway: 'zarinpal',
        authority: 'auth-123',
        refId: null,
        appointment: { id: 'appt-1', status: 'held' },
      });

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      const payload: PaymentCallbackPayload = { authority: 'auth-123', status: 'OK' };
      const result = await service.handleCallback(payload);

      expect(result.confirmed).toBe(false);
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: 'failed' },
      });
    });

    it('throws if payment with authority not found', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      prisma.payment.findFirst.mockResolvedValue(null);

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      await expect(
        service.handleCallback({ authority: 'unknown', status: 'OK' }),
      ).rejects.toThrow('Payment with authority unknown not found');
    });

    it('returns early for already-processed payments', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        appointmentId: 'appt-1',
        amountRial: BigInt(200000),
        status: 'paid',
        gateway: 'zarinpal',
        authority: 'auth-123',
        refId: 'ref-456',
        appointment: { id: 'appt-1', status: 'confirmed' },
      });

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      const result = await service.handleCallback({ authority: 'auth-123', status: 'OK' });

      expect(result.confirmed).toBe(true);
      expect(gateway.verify).not.toHaveBeenCalled();
    });

    it('late deposit: confirms appointment when resources are still free (R10.6)', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      const startAt = new Date('2024-03-15T10:00:00.000Z');
      const endAt = new Date('2024-03-15T11:00:00.000Z');

      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        appointmentId: 'appt-1',
        amountRial: BigInt(200000),
        status: 'pending',
        gateway: 'zarinpal',
        authority: 'auth-123',
        refId: null,
        appointment: { id: 'appt-1', status: 'expired' },
      });

      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        salonId: 'salon-1',
        customerId: 'cust-1',
        staffMemberId: 'staff-1',
        chairId: 'chair-1',
        serviceId: 'svc-1',
        startAt,
        endAt,
        status: 'expired',
        source: 'web',
        holdExpiresAt: new Date('2024-03-15T09:45:00.000Z'),
      });

      // No overlapping appointments — resources are free
      prisma.appointment.findMany = jest.fn().mockResolvedValue([]);

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      const result = await service.handleCallback({ authority: 'auth-123', status: 'OK' });

      // Payment verified and marked as paid
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: 'paid', refId: 'ref-456' },
      });

      // Appointment re-confirmed
      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
        data: { status: 'confirmed', holdExpiresAt: null },
      });

      expect(result.confirmed).toBe(true);
      // confirmHeld should NOT be called (we go through late deposit path directly)
      expect(schedulingEngine.confirmHeld).not.toHaveBeenCalled();
    });

    it('late deposit: refunds payment when resources are taken (R10.6)', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      const startAt = new Date('2024-03-15T10:00:00.000Z');
      const endAt = new Date('2024-03-15T11:00:00.000Z');

      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        appointmentId: 'appt-1',
        amountRial: BigInt(200000),
        status: 'pending',
        gateway: 'zarinpal',
        authority: 'auth-123',
        refId: null,
        appointment: { id: 'appt-1', status: 'expired' },
      });

      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        salonId: 'salon-1',
        customerId: 'cust-1',
        staffMemberId: 'staff-1',
        chairId: 'chair-1',
        serviceId: 'svc-1',
        startAt,
        endAt,
        status: 'expired',
        source: 'web',
        holdExpiresAt: new Date('2024-03-15T09:45:00.000Z'),
      });

      // Another appointment now occupies the same staff
      prisma.appointment.findMany = jest.fn().mockResolvedValue([
        {
          id: 'appt-2',
          staffMemberId: 'staff-1',
          chairId: 'chair-2',
          startAt: new Date('2024-03-15T10:15:00.000Z'),
          endAt: new Date('2024-03-15T11:15:00.000Z'),
          status: 'confirmed',
        },
      ]);

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      const result = await service.handleCallback({ authority: 'auth-123', status: 'OK' });

      // Payment was verified and marked as paid
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: 'paid', refId: 'ref-456' },
      });

      // But resources are taken, so refund was initiated
      expect(gateway.refund).toHaveBeenCalledWith('ref-456', 200000);

      // Payment updated to refunded
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: 'refunded' },
      });

      // Appointment stays expired
      expect(result.confirmed).toBe(false);
    });

    it('late deposit via confirmHeld failure: re-verifies and confirms if free (R10.6)', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      const startAt = new Date('2024-03-15T10:00:00.000Z');
      const endAt = new Date('2024-03-15T11:00:00.000Z');

      // confirmHeld fails because appointment has already expired
      schedulingEngine.confirmHeld.mockRejectedValue(
        new Error("Appointment cannot be confirmed: current status is 'expired'"),
      );

      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        appointmentId: 'appt-1',
        amountRial: BigInt(200000),
        status: 'pending',
        gateway: 'zarinpal',
        authority: 'auth-123',
        refId: null,
        appointment: { id: 'appt-1', status: 'held' }, // status was 'held' at time of findFirst
      });

      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        salonId: 'salon-1',
        customerId: 'cust-1',
        staffMemberId: 'staff-1',
        chairId: 'chair-1',
        serviceId: 'svc-1',
        startAt,
        endAt,
        status: 'expired',
        source: 'web',
        holdExpiresAt: null,
      });

      // No overlapping appointments — resources free
      prisma.appointment.findMany = jest.fn().mockResolvedValue([]);

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      const result = await service.handleCallback({ authority: 'auth-123', status: 'OK' });

      // Payment is paid
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: 'paid', refId: 'ref-456' },
      });

      // Appointment re-confirmed via handleLateDeposit
      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
        data: { status: 'confirmed', holdExpiresAt: null },
      });

      expect(result.confirmed).toBe(true);
    });
  });

  describe('refundDeposit (R11.2)', () => {
    it('calls gateway refund and updates payment status', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        appointmentId: 'appt-1',
        amountRial: BigInt(200000),
        status: 'paid',
        gateway: 'zarinpal',
        authority: 'auth-123',
        refId: 'ref-456',
      });

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      await service.refundDeposit('appt-1');

      expect(gateway.refund).toHaveBeenCalledWith('ref-456', 200000);
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: 'refunded' },
      });
    });

    it('throws if no paid payment found', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      prisma.payment.findFirst.mockResolvedValue(null);

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      await expect(service.refundDeposit('appt-1')).rejects.toThrow(
        'No paid payment found for appointment appt-1',
      );
    });

    it('throws if payment has no refId', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        appointmentId: 'appt-1',
        amountRial: BigInt(200000),
        status: 'paid',
        gateway: 'zarinpal',
        authority: 'auth-123',
        refId: null,
      });

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      await expect(service.refundDeposit('appt-1')).rejects.toThrow(
        'has no refId for refund',
      );
    });

    it('throws if gateway refund fails', async () => {
      const gateway = createMockGateway({
        refund: jest.fn().mockResolvedValue({ ok: false }),
      });
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        appointmentId: 'appt-1',
        amountRial: BigInt(200000),
        status: 'paid',
        gateway: 'zarinpal',
        authority: 'auth-123',
        refId: 'ref-456',
      });

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      await expect(service.refundDeposit('appt-1')).rejects.toThrow(
        'Refund failed for payment pay-1',
      );
    });
  });

  describe('retainDeposit (R11.3)', () => {
    it('marks payment status as retained', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        appointmentId: 'appt-1',
        amountRial: BigInt(200000),
        status: 'paid',
        gateway: 'zarinpal',
        authority: 'auth-123',
        refId: 'ref-456',
      });

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      await service.retainDeposit('appt-1');

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: 'retained' },
      });
      // Refund should NOT be called
      expect(gateway.refund).not.toHaveBeenCalled();
    });

    it('throws if no paid payment found', async () => {
      const gateway = createMockGateway();
      const prisma = createMockPrisma();
      const schedulingEngine = createMockSchedulingEngine();

      prisma.payment.findFirst.mockResolvedValue(null);

      const service = new PaymentService(prisma, gateway, schedulingEngine, {
        callbackBaseUrl: CALLBACK_BASE_URL,
      });

      await expect(service.retainDeposit('appt-1')).rejects.toThrow(
        'No paid payment found for appointment appt-1',
      );
    });
  });
});
