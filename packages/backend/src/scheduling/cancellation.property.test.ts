import fc from 'fast-check';
import { CancellationService } from './cancellation';

/**
 * Property Tests — Feature: salon-booking-system
 *
 * Property 8: Cancellation and no-show free resources
 * **Validates: Requirements 11.1, 11.4**
 *
 * For any confirmed Appointment, cancelling it or marking it as a No_Show removes its
 * occupancy so that its Staff_Member and Chair become available again for that time window,
 * and a no-show additionally increments the customer's recorded no-show count.
 *
 * Property 9: Deposit refund policy
 * **Validates: Requirements 11.2, 11.3**
 *
 * For any Appointment with a paid deposit, cancelling strictly before the Cancellation_Window
 * refunds the deposit, and cancelling within the Cancellation_Window retains the deposit.
 */

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const appointmentDataArb = fc.record({
  appointmentId: fc.uuid(),
  salonId: fc.uuid(),
  customerId: fc.uuid(),
  staffMemberId: fc.uuid(),
  chairId: fc.uuid(),
  serviceId: fc.uuid(),
  /** Duration in minutes (5 to 180) */
  durationMin: fc.integer({ min: 5, max: 180 }),
  /** Buffer in minutes (0 to 30) */
  bufferMin: fc.integer({ min: 0, max: 30 }),
  /** Start hour (8 to 18) */
  startHour: fc.integer({ min: 8, max: 18 }),
  /** Start minute (0 to 59) */
  startMinute: fc.integer({ min: 0, max: 59 }),
  /** Initial no-show count (0 to 10) */
  initialNoShowCount: fc.integer({ min: 0, max: 10 }),
});

const depositPolicyArb = fc.record({
  appointmentId: fc.uuid(),
  salonId: fc.uuid(),
  customerId: fc.uuid(),
  staffMemberId: fc.uuid(),
  chairId: fc.uuid(),
  serviceId: fc.uuid(),
  /** Duration in minutes (15 to 120) */
  durationMin: fc.integer({ min: 15, max: 120 }),
  /** Buffer in minutes (0 to 15) */
  bufferMin: fc.integer({ min: 0, max: 15 }),
  /** Cancellation window in minutes (15 to 180) */
  cancellationWindowMinutes: fc.integer({ min: 15, max: 180 }),
  /** Deposit amount in Rial (10000 to 5000000) */
  depositRial: fc.integer({ min: 10000, max: 5000000 }),
  /** Minutes before appointment start at which cancellation occurs (1 to 360) */
  minutesBeforeStart: fc.integer({ min: 1, max: 360 }),
});

// ─── Property 8: Cancellation and no-show free resources ─────────────────────

describe('Feature: salon-booking-system, Property 8: Cancellation and no-show free resources', () => {
  it('cancelling a confirmed appointment releases staff and chair (status changes to cancelled)', async () => {
    await fc.assert(
      fc.asyncProperty(appointmentDataArb, async (data) => {
        const startAt = new Date(
          `2024-03-15T${String(data.startHour).padStart(2, '0')}:${String(data.startMinute).padStart(2, '0')}:00.000Z`,
        );
        const endAt = new Date(
          startAt.getTime() + (data.durationMin + data.bufferMin) * 60 * 1000,
        );

        const appointment = {
          id: data.appointmentId,
          salonId: data.salonId,
          customerId: data.customerId,
          staffMemberId: data.staffMemberId,
          chairId: data.chairId,
          serviceId: data.serviceId,
          startAt,
          endAt,
          status: 'confirmed' as string,
          source: 'web',
          holdExpiresAt: null,
          createdAt: new Date('2024-03-15T08:00:00.000Z'),
        };

        // Track the status transitions
        let finalStatus: string | null = null;

        const mockPrisma = {
          appointment: {
            findUnique: jest.fn().mockResolvedValue(appointment),
            update: jest.fn().mockImplementation((args: any) => {
              finalStatus = args.data.status;
              return Promise.resolve({ ...appointment, ...args.data });
            }),
            // After cancellation, no held/confirmed appointments should remain for this resource
            findMany: jest.fn().mockResolvedValue([]),
          },
          payment: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        } as any;

        const mockPayment = {
          refundDeposit: jest.fn().mockResolvedValue(undefined),
          retainDeposit: jest.fn().mockResolvedValue(undefined),
        } as any;

        const service = new CancellationService(mockPrisma, mockPayment);

        const result = await service.cancel(data.appointmentId);

        // Property: after cancellation, status is 'cancelled'
        expect(finalStatus).toBe('cancelled');
        expect(result.status).toBe('cancelled');

        // Property: the appointment update targeted the correct appointment
        expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
          where: { id: data.appointmentId },
          data: { status: 'cancelled' },
        });

        // Property: since status is now 'cancelled', the exclusion constraints no longer
        // apply (they only cover 'held' and 'confirmed'), meaning the staff member and
        // chair are now free for the original time window.
      }),
      { numRuns: 100 },
    );
  });

  it('marking a confirmed appointment as no-show releases resources and increments customer no-show count', async () => {
    await fc.assert(
      fc.asyncProperty(appointmentDataArb, async (data) => {
        const startAt = new Date(
          `2024-03-15T${String(data.startHour).padStart(2, '0')}:${String(data.startMinute).padStart(2, '0')}:00.000Z`,
        );
        const endAt = new Date(
          startAt.getTime() + (data.durationMin + data.bufferMin) * 60 * 1000,
        );

        const appointment = {
          id: data.appointmentId,
          salonId: data.salonId,
          customerId: data.customerId,
          staffMemberId: data.staffMemberId,
          chairId: data.chairId,
          serviceId: data.serviceId,
          startAt,
          endAt,
          status: 'confirmed' as string,
          source: 'web',
          holdExpiresAt: null,
          createdAt: new Date('2024-03-15T08:00:00.000Z'),
        };

        let appointmentStatus: string | null = null;
        let customerUpdateArgs: any = null;

        const mockPrisma = {
          appointment: {
            findUnique: jest.fn().mockResolvedValue(appointment),
            update: jest.fn().mockImplementation((args: any) => {
              appointmentStatus = args.data.status;
              return Promise.resolve({ ...appointment, ...args.data });
            }),
          },
          customer: {
            update: jest.fn().mockImplementation((args: any) => {
              customerUpdateArgs = args;
              return Promise.resolve({
                id: data.customerId,
                noShowCount: data.initialNoShowCount + 1,
              });
            }),
          },
        } as any;

        const mockPayment = {
          refundDeposit: jest.fn().mockResolvedValue(undefined),
          retainDeposit: jest.fn().mockResolvedValue(undefined),
        } as any;

        const service = new CancellationService(mockPrisma, mockPayment);

        const result = await service.markNoShow(data.appointmentId);

        // Property: after marking as no-show, status is 'no_show' (resources freed)
        expect(appointmentStatus).toBe('no_show');
        expect(result.status).toBe('no_show');

        // Property: customer's no-show count was incremented
        expect(customerUpdateArgs).not.toBeNull();
        expect(customerUpdateArgs.where.id).toBe(data.customerId);
        expect(customerUpdateArgs.data.noShowCount).toEqual({ increment: 1 });
      }),
      { numRuns: 100 },
    );
  });

  it('both cancel and no-show free both staff and chair together (no partial release)', async () => {
    await fc.assert(
      fc.asyncProperty(
        appointmentDataArb,
        fc.boolean(), // true = cancel, false = no-show
        async (data, isCancellation) => {
          const startAt = new Date(
            `2024-03-15T${String(data.startHour).padStart(2, '0')}:${String(data.startMinute).padStart(2, '0')}:00.000Z`,
          );
          const endAt = new Date(
            startAt.getTime() + (data.durationMin + data.bufferMin) * 60 * 1000,
          );

          const appointment = {
            id: data.appointmentId,
            salonId: data.salonId,
            customerId: data.customerId,
            staffMemberId: data.staffMemberId,
            chairId: data.chairId,
            serviceId: data.serviceId,
            startAt,
            endAt,
            status: 'confirmed' as string,
            source: 'web',
            holdExpiresAt: null,
            createdAt: new Date('2024-03-15T08:00:00.000Z'),
          };

          // Count the number of appointment.update calls — should be exactly 1
          // (single status change frees both resources atomically)
          let updateCount = 0;

          const mockPrisma = {
            appointment: {
              findUnique: jest.fn().mockResolvedValue(appointment),
              update: jest.fn().mockImplementation((args: any) => {
                updateCount++;
                return Promise.resolve({ ...appointment, ...args.data });
              }),
            },
            customer: {
              update: jest.fn().mockResolvedValue({ noShowCount: data.initialNoShowCount + 1 }),
            },
            payment: {
              findFirst: jest.fn().mockResolvedValue(null),
            },
          } as any;

          const mockPayment = {
            refundDeposit: jest.fn().mockResolvedValue(undefined),
            retainDeposit: jest.fn().mockResolvedValue(undefined),
          } as any;

          const service = new CancellationService(mockPrisma, mockPayment);

          if (isCancellation) {
            await service.cancel(data.appointmentId);
          } else {
            await service.markNoShow(data.appointmentId);
          }

          // Property: exactly one status update to the appointment row releases both
          // staff and chair simultaneously (structural atomicity — one row holds both)
          expect(updateCount).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 9: Deposit refund policy ───────────────────────────────────────

describe('Feature: salon-booking-system, Property 9: Deposit refund policy', () => {
  it('cancelling strictly before the Cancellation_Window refunds the deposit', async () => {
    await fc.assert(
      fc.asyncProperty(
        depositPolicyArb.filter(
          // Ensure cancellation is BEFORE the window:
          // minutesBeforeStart > cancellationWindowMinutes
          (d) => d.minutesBeforeStart > d.cancellationWindowMinutes,
        ),
        async (data) => {
          // Appointment start: some fixed future time
          const appointmentStart = new Date('2024-03-15T14:00:00.000Z');
          // Calculate `now` based on minutesBeforeStart
          const now = new Date(
            appointmentStart.getTime() - data.minutesBeforeStart * 60 * 1000,
          );
          const endAt = new Date(
            appointmentStart.getTime() + (data.durationMin + data.bufferMin) * 60 * 1000,
          );

          const appointment = {
            id: data.appointmentId,
            salonId: data.salonId,
            customerId: data.customerId,
            staffMemberId: data.staffMemberId,
            chairId: data.chairId,
            serviceId: data.serviceId,
            startAt: appointmentStart,
            endAt,
            status: 'confirmed' as string,
            source: 'web',
            holdExpiresAt: null,
            createdAt: new Date('2024-03-15T08:00:00.000Z'),
          };

          const mockPrisma = {
            appointment: {
              findUnique: jest.fn().mockResolvedValue(appointment),
              update: jest.fn().mockImplementation((args: any) =>
                Promise.resolve({ ...appointment, ...args.data }),
              ),
            },
            payment: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'pay-1',
                appointmentId: data.appointmentId,
                amountRial: BigInt(data.depositRial),
                status: 'paid',
                refId: 'ref-abc',
              }),
            },
          } as any;

          const mockPayment = {
            refundDeposit: jest.fn().mockResolvedValue(undefined),
            retainDeposit: jest.fn().mockResolvedValue(undefined),
          } as any;

          const service = new CancellationService(mockPrisma, mockPayment);

          await service.cancel(
            data.appointmentId,
            data.cancellationWindowMinutes,
            now,
          );

          // Property: when cancelling before the window, deposit is REFUNDED
          expect(mockPayment.refundDeposit).toHaveBeenCalledWith(data.appointmentId);
          expect(mockPayment.retainDeposit).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('cancelling within the Cancellation_Window retains the deposit', async () => {
    await fc.assert(
      fc.asyncProperty(
        depositPolicyArb.filter(
          // Ensure cancellation is WITHIN the window:
          // minutesBeforeStart <= cancellationWindowMinutes
          (d) => d.minutesBeforeStart <= d.cancellationWindowMinutes,
        ),
        async (data) => {
          // Appointment start: some fixed future time
          const appointmentStart = new Date('2024-03-15T14:00:00.000Z');
          // Calculate `now` based on minutesBeforeStart
          const now = new Date(
            appointmentStart.getTime() - data.minutesBeforeStart * 60 * 1000,
          );
          const endAt = new Date(
            appointmentStart.getTime() + (data.durationMin + data.bufferMin) * 60 * 1000,
          );

          const appointment = {
            id: data.appointmentId,
            salonId: data.salonId,
            customerId: data.customerId,
            staffMemberId: data.staffMemberId,
            chairId: data.chairId,
            serviceId: data.serviceId,
            startAt: appointmentStart,
            endAt,
            status: 'confirmed' as string,
            source: 'web',
            holdExpiresAt: null,
            createdAt: new Date('2024-03-15T08:00:00.000Z'),
          };

          const mockPrisma = {
            appointment: {
              findUnique: jest.fn().mockResolvedValue(appointment),
              update: jest.fn().mockImplementation((args: any) =>
                Promise.resolve({ ...appointment, ...args.data }),
              ),
            },
            payment: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'pay-1',
                appointmentId: data.appointmentId,
                amountRial: BigInt(data.depositRial),
                status: 'paid',
                refId: 'ref-abc',
              }),
            },
          } as any;

          const mockPayment = {
            refundDeposit: jest.fn().mockResolvedValue(undefined),
            retainDeposit: jest.fn().mockResolvedValue(undefined),
          } as any;

          const service = new CancellationService(mockPrisma, mockPayment);

          await service.cancel(
            data.appointmentId,
            data.cancellationWindowMinutes,
            now,
          );

          // Property: when cancelling within the window, deposit is RETAINED
          expect(mockPayment.retainDeposit).toHaveBeenCalledWith(data.appointmentId);
          expect(mockPayment.refundDeposit).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('the boundary between refund and retain is exactly at now + windowMinutes == startAt', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          appointmentId: fc.uuid(),
          salonId: fc.uuid(),
          customerId: fc.uuid(),
          staffMemberId: fc.uuid(),
          chairId: fc.uuid(),
          serviceId: fc.uuid(),
          cancellationWindowMinutes: fc.integer({ min: 15, max: 180 }),
          depositRial: fc.integer({ min: 10000, max: 5000000 }),
        }),
        async (data) => {
          // Place cancellation EXACTLY at the boundary:
          // now + windowMinutes == appointment.startAt
          // → windowBoundary >= startAt → within window → retain
          const appointmentStart = new Date('2024-03-15T14:00:00.000Z');
          const now = new Date(
            appointmentStart.getTime() - data.cancellationWindowMinutes * 60 * 1000,
          );

          const appointment = {
            id: data.appointmentId,
            salonId: data.salonId,
            customerId: data.customerId,
            staffMemberId: data.staffMemberId,
            chairId: data.chairId,
            serviceId: data.serviceId,
            startAt: appointmentStart,
            endAt: new Date(appointmentStart.getTime() + 60 * 60 * 1000),
            status: 'confirmed' as string,
            source: 'web',
            holdExpiresAt: null,
            createdAt: new Date('2024-03-15T08:00:00.000Z'),
          };

          const mockPrisma = {
            appointment: {
              findUnique: jest.fn().mockResolvedValue(appointment),
              update: jest.fn().mockImplementation((args: any) =>
                Promise.resolve({ ...appointment, ...args.data }),
              ),
            },
            payment: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'pay-1',
                appointmentId: data.appointmentId,
                amountRial: BigInt(data.depositRial),
                status: 'paid',
                refId: 'ref-abc',
              }),
            },
          } as any;

          const mockPayment = {
            refundDeposit: jest.fn().mockResolvedValue(undefined),
            retainDeposit: jest.fn().mockResolvedValue(undefined),
          } as any;

          const service = new CancellationService(mockPrisma, mockPayment);

          await service.cancel(
            data.appointmentId,
            data.cancellationWindowMinutes,
            now,
          );

          // Property: at the exact boundary (now + window == startAt),
          // windowBoundary >= startAt → within window → retain
          expect(mockPayment.retainDeposit).toHaveBeenCalledWith(data.appointmentId);
          expect(mockPayment.refundDeposit).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when no deposit was paid, neither refund nor retain is called regardless of timing', async () => {
    await fc.assert(
      fc.asyncProperty(depositPolicyArb, async (data) => {
        const appointmentStart = new Date('2024-03-15T14:00:00.000Z');
        const now = new Date(
          appointmentStart.getTime() - data.minutesBeforeStart * 60 * 1000,
        );

        const appointment = {
          id: data.appointmentId,
          salonId: data.salonId,
          customerId: data.customerId,
          staffMemberId: data.staffMemberId,
          chairId: data.chairId,
          serviceId: data.serviceId,
          startAt: appointmentStart,
          endAt: new Date(
            appointmentStart.getTime() + (data.durationMin + data.bufferMin) * 60 * 1000,
          ),
          status: 'confirmed' as string,
          source: 'web',
          holdExpiresAt: null,
          createdAt: new Date('2024-03-15T08:00:00.000Z'),
        };

        const mockPrisma = {
          appointment: {
            findUnique: jest.fn().mockResolvedValue(appointment),
            update: jest.fn().mockImplementation((args: any) =>
              Promise.resolve({ ...appointment, ...args.data }),
            ),
          },
          payment: {
            // No paid deposit exists
            findFirst: jest.fn().mockResolvedValue(null),
          },
        } as any;

        const mockPayment = {
          refundDeposit: jest.fn().mockResolvedValue(undefined),
          retainDeposit: jest.fn().mockResolvedValue(undefined),
        } as any;

        const service = new CancellationService(mockPrisma, mockPayment);

        await service.cancel(
          data.appointmentId,
          data.cancellationWindowMinutes,
          now,
        );

        // Property: no deposit actions taken when no paid deposit exists
        expect(mockPayment.refundDeposit).not.toHaveBeenCalled();
        expect(mockPayment.retainDeposit).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});
