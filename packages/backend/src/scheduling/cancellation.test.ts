import { CancellationService } from './cancellation';

/**
 * Unit tests for CancellationService
 *
 * Tests cover:
 * - cancel() — status change to 'cancelled', resource release (R11.1)
 * - cancel() — deposit refund before window (R11.2)
 * - cancel() — deposit retain within window (R11.3)
 * - markNoShow() — status change to 'no_show', no-show count increment (R11.4)
 * - Error cases: not found, invalid status
 */

function createMockPrisma(overrides: Partial<Record<string, any>> = {}) {
  return {
    appointment: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation((args: any) =>
        Promise.resolve({ id: args.where.id, ...args.data }),
      ),
    },
    customer: {
      update: jest.fn().mockResolvedValue({}),
    },
    payment: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    ...overrides,
  } as any;
}

function createMockPaymentService() {
  return {
    refundDeposit: jest.fn().mockResolvedValue(undefined),
    retainDeposit: jest.fn().mockResolvedValue(undefined),
  } as any;
}

const APPOINTMENT_ID = 'appt-1';
const CUSTOMER_ID = 'customer-1';
const STAFF_ID = 'staff-1';
const CHAIR_ID = 'chair-1';
const SALON_ID = 'salon-1';
const SERVICE_ID = 'service-1';

function confirmedAppointment(startAt: Date = new Date('2024-03-15T14:00:00.000Z')) {
  return {
    id: APPOINTMENT_ID,
    salonId: SALON_ID,
    customerId: CUSTOMER_ID,
    staffMemberId: STAFF_ID,
    chairId: CHAIR_ID,
    serviceId: SERVICE_ID,
    startAt,
    endAt: new Date(startAt.getTime() + 45 * 60 * 1000), // 30 + 15 buffer
    status: 'confirmed',
    source: 'web',
    holdExpiresAt: null,
    createdAt: new Date('2024-03-15T08:00:00.000Z'),
  };
}

describe('CancellationService', () => {
  describe('cancel', () => {
    it('changes appointment status to cancelled (R11.1)', async () => {
      const appt = confirmedAppointment();
      const mockPrisma = createMockPrisma({
        appointment: {
          findUnique: jest.fn().mockResolvedValue(appt),
          update: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({ ...appt, ...args.data }),
          ),
        },
        payment: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      const mockPayment = createMockPaymentService();
      const service = new CancellationService(mockPrisma, mockPayment);

      const result = await service.cancel(APPOINTMENT_ID);

      expect(result.status).toBe('cancelled');
      expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
        where: { id: APPOINTMENT_ID },
        data: { status: 'cancelled' },
      });
    });

    it('throws if appointment not found', async () => {
      const mockPrisma = createMockPrisma();
      const mockPayment = createMockPaymentService();
      const service = new CancellationService(mockPrisma, mockPayment);

      await expect(service.cancel('nonexistent')).rejects.toThrow(
        'Appointment nonexistent not found',
      );
    });

    it('throws if appointment is not in cancellable status', async () => {
      const appt = { ...confirmedAppointment(), status: 'completed' };
      const mockPrisma = createMockPrisma({
        appointment: {
          findUnique: jest.fn().mockResolvedValue(appt),
          update: jest.fn(),
        },
      });
      const mockPayment = createMockPaymentService();
      const service = new CancellationService(mockPrisma, mockPayment);

      await expect(service.cancel(APPOINTMENT_ID)).rejects.toThrow(
        "cannot be cancelled: current status is 'completed'",
      );
    });

    it('allows cancellation of held appointments', async () => {
      const appt = { ...confirmedAppointment(), status: 'held' };
      const mockPrisma = createMockPrisma({
        appointment: {
          findUnique: jest.fn().mockResolvedValue(appt),
          update: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({ ...appt, ...args.data }),
          ),
        },
        payment: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      const mockPayment = createMockPaymentService();
      const service = new CancellationService(mockPrisma, mockPayment);

      const result = await service.cancel(APPOINTMENT_ID);
      expect(result.status).toBe('cancelled');
    });

    it('refunds deposit when cancelling before the cancellation window (R11.2)', async () => {
      // Appointment at 14:00, cancellation window = 60 min
      // now = 12:00 → windowBoundary = 13:00 < 14:00 → before window → refund
      const appt = confirmedAppointment(new Date('2024-03-15T14:00:00.000Z'));
      const now = new Date('2024-03-15T12:00:00.000Z');

      const mockPrisma = createMockPrisma({
        appointment: {
          findUnique: jest.fn().mockResolvedValue(appt),
          update: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({ ...appt, ...args.data }),
          ),
        },
        payment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pay-1',
            appointmentId: APPOINTMENT_ID,
            amountRial: BigInt(100000),
            status: 'paid',
            refId: 'ref-123',
          }),
        },
      });
      const mockPayment = createMockPaymentService();
      const service = new CancellationService(mockPrisma, mockPayment);

      await service.cancel(APPOINTMENT_ID, 60, now);

      expect(mockPayment.refundDeposit).toHaveBeenCalledWith(APPOINTMENT_ID);
      expect(mockPayment.retainDeposit).not.toHaveBeenCalled();
    });

    it('retains deposit when cancelling within the cancellation window (R11.3)', async () => {
      // Appointment at 14:00, cancellation window = 60 min
      // now = 13:30 → windowBoundary = 14:30 >= 14:00 → within window → retain
      const appt = confirmedAppointment(new Date('2024-03-15T14:00:00.000Z'));
      const now = new Date('2024-03-15T13:30:00.000Z');

      const mockPrisma = createMockPrisma({
        appointment: {
          findUnique: jest.fn().mockResolvedValue(appt),
          update: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({ ...appt, ...args.data }),
          ),
        },
        payment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pay-1',
            appointmentId: APPOINTMENT_ID,
            amountRial: BigInt(100000),
            status: 'paid',
            refId: 'ref-123',
          }),
        },
      });
      const mockPayment = createMockPaymentService();
      const service = new CancellationService(mockPrisma, mockPayment);

      await service.cancel(APPOINTMENT_ID, 60, now);

      expect(mockPayment.retainDeposit).toHaveBeenCalledWith(APPOINTMENT_ID);
      expect(mockPayment.refundDeposit).not.toHaveBeenCalled();
    });

    it('does nothing about deposit if no paid payment exists', async () => {
      const appt = confirmedAppointment();
      const mockPrisma = createMockPrisma({
        appointment: {
          findUnique: jest.fn().mockResolvedValue(appt),
          update: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({ ...appt, ...args.data }),
          ),
        },
        payment: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      const mockPayment = createMockPaymentService();
      const service = new CancellationService(mockPrisma, mockPayment);

      await service.cancel(APPOINTMENT_ID);

      expect(mockPayment.refundDeposit).not.toHaveBeenCalled();
      expect(mockPayment.retainDeposit).not.toHaveBeenCalled();
    });

    it('uses custom cancellation window when provided', async () => {
      // Appointment at 14:00, custom window = 120 min
      // now = 12:30 → windowBoundary = 14:30 >= 14:00 → within window → retain
      const appt = confirmedAppointment(new Date('2024-03-15T14:00:00.000Z'));
      const now = new Date('2024-03-15T12:30:00.000Z');

      const mockPrisma = createMockPrisma({
        appointment: {
          findUnique: jest.fn().mockResolvedValue(appt),
          update: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({ ...appt, ...args.data }),
          ),
        },
        payment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pay-1',
            appointmentId: APPOINTMENT_ID,
            amountRial: BigInt(100000),
            status: 'paid',
            refId: 'ref-123',
          }),
        },
      });
      const mockPayment = createMockPaymentService();
      const service = new CancellationService(mockPrisma, mockPayment);

      await service.cancel(APPOINTMENT_ID, 120, now);

      expect(mockPayment.retainDeposit).toHaveBeenCalledWith(APPOINTMENT_ID);
    });
  });

  describe('markNoShow', () => {
    it('changes appointment status to no_show and increments customer no-show count (R11.4)', async () => {
      const appt = confirmedAppointment();
      const mockPrisma = createMockPrisma({
        appointment: {
          findUnique: jest.fn().mockResolvedValue(appt),
          update: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({ ...appt, ...args.data }),
          ),
        },
        customer: {
          update: jest.fn().mockResolvedValue({ noShowCount: 1 }),
        },
      });
      const mockPayment = createMockPaymentService();
      const service = new CancellationService(mockPrisma, mockPayment);

      const result = await service.markNoShow(APPOINTMENT_ID);

      expect(result.status).toBe('no_show');
      expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
        where: { id: APPOINTMENT_ID },
        data: { status: 'no_show' },
      });
      expect(mockPrisma.customer.update).toHaveBeenCalledWith({
        where: { id: CUSTOMER_ID },
        data: { noShowCount: { increment: 1 } },
      });
    });

    it('throws if appointment not found', async () => {
      const mockPrisma = createMockPrisma();
      const mockPayment = createMockPaymentService();
      const service = new CancellationService(mockPrisma, mockPayment);

      await expect(service.markNoShow('nonexistent')).rejects.toThrow(
        'Appointment nonexistent not found',
      );
    });

    it('throws if appointment is not confirmed', async () => {
      const appt = { ...confirmedAppointment(), status: 'held' };
      const mockPrisma = createMockPrisma({
        appointment: {
          findUnique: jest.fn().mockResolvedValue(appt),
          update: jest.fn(),
        },
      });
      const mockPayment = createMockPaymentService();
      const service = new CancellationService(mockPrisma, mockPayment);

      await expect(service.markNoShow(APPOINTMENT_ID)).rejects.toThrow(
        "cannot be marked as no-show: current status is 'held'",
      );
    });

    it('throws if appointment is already cancelled', async () => {
      const appt = { ...confirmedAppointment(), status: 'cancelled' };
      const mockPrisma = createMockPrisma({
        appointment: {
          findUnique: jest.fn().mockResolvedValue(appt),
          update: jest.fn(),
        },
      });
      const mockPayment = createMockPaymentService();
      const service = new CancellationService(mockPrisma, mockPayment);

      await expect(service.markNoShow(APPOINTMENT_ID)).rejects.toThrow(
        "cannot be marked as no-show: current status is 'cancelled'",
      );
    });
  });
});
