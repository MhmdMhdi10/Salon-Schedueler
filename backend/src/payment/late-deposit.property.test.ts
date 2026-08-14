import fc from 'fast-check';
import { PaymentService } from './payment.service';
import type { PaymentGateway } from './payment-gateway.interface';

/**
 * Property Test — Feature: salon-booking-system, Property 7: Late-deposit re-verification
 *
 * **Validates: Requirements 10.6**
 *
 * Property 7: For any deposit confirmed after the Hold_Period has elapsed, the Appointment
 * becomes confirmed only if a qualified Staff_Member and a compatible Chair are free at
 * confirmation time; otherwise the appointment remains released and the payment is refunded.
 *
 * Test approach:
 * - Generate scenarios where a held appointment has expired
 * - Simulate late payment arriving
 * - Case 1: Resources still free → appointment confirmed, no refund
 * - Case 2: Resources taken by another booking → appointment stays expired, payment refunded
 * - Use fast-check with min 100 iterations
 */

// Arbitrary for generating a late-deposit scenario
const lateDepositScenarioArb = fc.record({
  appointmentId: fc.uuid(),
  paymentId: fc.uuid(),
  staffMemberId: fc.uuid(),
  chairId: fc.uuid(),
  salonId: fc.uuid(),
  serviceId: fc.uuid(),
  customerId: fc.uuid(),
  /** Deposit amount in Rial (10000 to 5000000) */
  amountRial: fc.integer({ min: 10000, max: 5000000 }),
  /** Minutes the appointment has been expired (1 to 120) */
  expiredMinutesAgo: fc.integer({ min: 1, max: 120 }),
  /** Appointment start hour (9 to 17) */
  startHour: fc.integer({ min: 9, max: 17 }),
  /** Service duration in minutes (15 to 120) */
  durationMin: fc.integer({ min: 15, max: 120 }),
  /** Buffer in minutes (0 to 30) */
  bufferMin: fc.integer({ min: 0, max: 30 }),
  /** Whether another appointment now occupies the resources */
  resourcesTaken: fc.boolean(),
  /** Authority token from gateway */
  authority: fc.string({ minLength: 8, maxLength: 32 }),
  /** Ref ID returned by gateway verify */
  refId: fc.string({ minLength: 5, maxLength: 20 }),
});

function createMockGateway(refId: string): PaymentGateway {
  return {
    request: jest.fn().mockResolvedValue({
      authority: 'auth-test',
      redirectUrl: 'https://gateway.test/pay',
    }),
    verify: jest.fn().mockResolvedValue({ ok: true, refId }),
    refund: jest.fn().mockResolvedValue({ ok: true }),
  };
}

function createMockSchedulingEngine() {
  return {
    confirmHeld: jest.fn().mockRejectedValue(
      new Error("Appointment cannot be confirmed: current status is 'expired'"),
    ),
  } as any;
}

describe('Feature: salon-booking-system, Property 7: Late-deposit re-verification', () => {
  it('confirms appointment only when both staff and chair are free at re-verification time', async () => {
    await fc.assert(
      fc.asyncProperty(lateDepositScenarioArb, async (scenario) => {
        const {
          appointmentId,
          paymentId,
          staffMemberId,
          chairId,
          salonId,
          serviceId,
          customerId,
          amountRial,
          expiredMinutesAgo,
          startHour,
          durationMin,
          bufferMin,
          resourcesTaken,
          authority,
          refId,
        } = scenario;

        const now = new Date('2024-03-15T12:00:00.000Z');
        const holdExpiresAt = new Date(now.getTime() - expiredMinutesAgo * 60 * 1000);
        const startAt = new Date(
          `2024-03-15T${String(startHour).padStart(2, '0')}:00:00.000Z`,
        );
        const endAt = new Date(
          startAt.getTime() + (durationMin + bufferMin) * 60 * 1000,
        );

        // Build the expired appointment
        const expiredAppointment = {
          id: appointmentId,
          salonId,
          customerId,
          staffMemberId,
          chairId,
          serviceId,
          startAt,
          endAt,
          status: 'expired',
          source: 'web',
          holdExpiresAt,
        };

        // Build conflicting appointments if resourcesTaken
        const overlappingAppointments = resourcesTaken
          ? [
              {
                id: 'conflicting-appt',
                staffMemberId,
                chairId: 'other-chair',
                startAt: new Date(startAt.getTime() + 5 * 60 * 1000), // 5 min after
                endAt: new Date(endAt.getTime() + 5 * 60 * 1000),
                status: 'confirmed',
              },
            ]
          : [];

        // Track mutations
        let appointmentConfirmed = false;
        let paymentRefunded = false;

        const mockPrisma = {
          appointment: {
            findUnique: jest.fn().mockResolvedValue(expiredAppointment),
            findMany: jest.fn().mockResolvedValue(overlappingAppointments),
            update: jest.fn().mockImplementation(({ data }) => {
              if (data.status === 'confirmed') {
                appointmentConfirmed = true;
              }
              return Promise.resolve({ id: appointmentId, ...data });
            }),
          },
          payment: {
            findFirst: jest.fn().mockResolvedValue({
              id: paymentId,
              appointmentId,
              amountRial: BigInt(amountRial),
              status: 'pending',
              gateway: 'zarinpal',
              authority,
              refId: null,
              appointment: { id: appointmentId, status: 'expired' },
            }),
            update: jest.fn().mockImplementation(({ data }) => {
              if (data.status === 'refunded') {
                paymentRefunded = true;
              }
              return Promise.resolve({ id: paymentId, ...data });
            }),
          },
        } as any;

        const gateway = createMockGateway(refId);
        const schedulingEngine = createMockSchedulingEngine();

        const service = new PaymentService(mockPrisma, gateway, schedulingEngine, {
          callbackBaseUrl: 'https://api.test',
        });

        const result = await service.handleCallback({ authority, status: 'OK' });

        // Property assertions:
        if (resourcesTaken) {
          // Case 2: Resources are NOT free → appointment stays expired, payment refunded
          expect(result.confirmed).toBe(false);
          expect(appointmentConfirmed).toBe(false);
          expect(paymentRefunded).toBe(true);
          expect(gateway.refund).toHaveBeenCalledWith(refId, amountRial);
        } else {
          // Case 1: Resources ARE free → appointment confirmed, no refund
          expect(result.confirmed).toBe(true);
          expect(appointmentConfirmed).toBe(true);
          expect(paymentRefunded).toBe(false);
          expect(gateway.refund).not.toHaveBeenCalled();
        }

        // In both cases, payment was verified with gateway
        expect(gateway.verify).toHaveBeenCalledWith(authority, amountRial);
      }),
      { numRuns: 100 },
    );
  });

  it('re-verification checks overlapping appointments for both staff and chair', async () => {
    // This property specifically tests that re-verification checks BOTH staff AND chair
    // overlap, not just one resource.
    const conflictTypeArb = fc.constantFrom('staff', 'chair', 'both') as fc.Arbitrary<'staff' | 'chair' | 'both'>;

    await fc.assert(
      fc.asyncProperty(
        lateDepositScenarioArb,
        conflictTypeArb,
        async (scenario, conflictType) => {
          const {
            appointmentId,
            paymentId,
            staffMemberId,
            chairId,
            salonId,
            serviceId,
            customerId,
            amountRial,
            startHour,
            durationMin,
            bufferMin,
            authority,
            refId,
          } = scenario;

          const startAt = new Date(
            `2024-03-15T${String(startHour).padStart(2, '0')}:00:00.000Z`,
          );
          const endAt = new Date(
            startAt.getTime() + (durationMin + bufferMin) * 60 * 1000,
          );

          const expiredAppointment = {
            id: appointmentId,
            salonId,
            customerId,
            staffMemberId,
            chairId,
            serviceId,
            startAt,
            endAt,
            status: 'expired',
            source: 'web',
            holdExpiresAt: new Date('2024-03-15T11:00:00.000Z'),
          };

          // Generate a conflicting appointment based on conflict type
          const conflictingAppt = {
            id: 'conflict-appt',
            staffMemberId: conflictType === 'staff' || conflictType === 'both'
              ? staffMemberId
              : 'other-staff',
            chairId: conflictType === 'chair' || conflictType === 'both'
              ? chairId
              : 'other-chair',
            startAt: new Date(startAt.getTime() + 5 * 60 * 1000),
            endAt: new Date(endAt.getTime()),
            status: 'confirmed',
          };

          let paymentRefunded = false;

          const mockPrisma = {
            appointment: {
              findUnique: jest.fn().mockResolvedValue(expiredAppointment),
              findMany: jest.fn().mockResolvedValue([conflictingAppt]),
              update: jest.fn().mockImplementation(({ data }) => {
                return Promise.resolve({ id: appointmentId, ...data });
              }),
            },
            payment: {
              findFirst: jest.fn().mockResolvedValue({
                id: paymentId,
                appointmentId,
                amountRial: BigInt(amountRial),
                status: 'pending',
                gateway: 'zarinpal',
                authority,
                refId: null,
                appointment: { id: appointmentId, status: 'expired' },
              }),
              update: jest.fn().mockImplementation(({ data }) => {
                if (data.status === 'refunded') {
                  paymentRefunded = true;
                }
                return Promise.resolve({ id: paymentId, ...data });
              }),
            },
          } as any;

          const gateway = createMockGateway(refId);
          const schedulingEngine = createMockSchedulingEngine();

          const service = new PaymentService(mockPrisma, gateway, schedulingEngine, {
            callbackBaseUrl: 'https://api.test',
          });

          const result = await service.handleCallback({ authority, status: 'OK' });

          // Regardless of conflict type (staff, chair, or both), if there's an
          // overlapping appointment, the late deposit should fail and refund
          expect(result.confirmed).toBe(false);
          expect(paymentRefunded).toBe(true);
          expect(gateway.refund).toHaveBeenCalledWith(refId, amountRial);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('payment is always verified with gateway before any re-verification logic runs', async () => {
    await fc.assert(
      fc.asyncProperty(lateDepositScenarioArb, async (scenario) => {
        const {
          appointmentId,
          paymentId,
          staffMemberId,
          chairId,
          salonId,
          amountRial,
          startHour,
          durationMin,
          bufferMin,
          authority,
          refId,
        } = scenario;

        const startAt = new Date(
          `2024-03-15T${String(startHour).padStart(2, '0')}:00:00.000Z`,
        );
        const endAt = new Date(
          startAt.getTime() + (durationMin + bufferMin) * 60 * 1000,
        );

        const mockPrisma = {
          appointment: {
            findUnique: jest.fn().mockResolvedValue({
              id: appointmentId,
              salonId,
              staffMemberId,
              chairId,
              startAt,
              endAt,
              status: 'expired',
              holdExpiresAt: new Date('2024-03-15T11:00:00.000Z'),
            }),
            findMany: jest.fn().mockResolvedValue([]),
            update: jest.fn().mockResolvedValue({ id: appointmentId }),
          },
          payment: {
            findFirst: jest.fn().mockResolvedValue({
              id: paymentId,
              appointmentId,
              amountRial: BigInt(amountRial),
              status: 'pending',
              gateway: 'zarinpal',
              authority,
              refId: null,
              appointment: { id: appointmentId, status: 'expired' },
            }),
            update: jest.fn().mockResolvedValue({ id: paymentId }),
          },
        } as any;

        const gateway = createMockGateway(refId);
        const schedulingEngine = createMockSchedulingEngine();

        const service = new PaymentService(mockPrisma, gateway, schedulingEngine, {
          callbackBaseUrl: 'https://api.test',
        });

        await service.handleCallback({ authority, status: 'OK' });

        // Gateway.verify is ALWAYS called before any appointment/refund logic
        expect(gateway.verify).toHaveBeenCalledWith(authority, amountRial);

        // Payment marked as paid before re-verification
        expect(mockPrisma.payment.update).toHaveBeenCalledWith({
          where: { id: paymentId },
          data: { status: 'paid', refId },
        });
      }),
      { numRuns: 100 },
    );
  });
});
