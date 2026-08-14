import fc from 'fast-check';
import { SchedulingEngine } from './scheduling-engine';

/**
 * Property Test — Feature: salon-booking-system, Property 6: Atomic hold and release
 *
 * **Validates: Requirements 10.4, 10.1**
 *
 * Property 6: For any held Appointment whose Hold_Period has elapsed without a confirmed
 * deposit, releasing it frees the Staff_Member and the Chair together: after release neither
 * resource is occupied by that appointment and both are bookable for the interval, and there
 * is no observable state in which one resource is freed while the other remains held.
 *
 * Test approach:
 * - Generate random held appointments with expired holdExpiresAt
 * - Call `releaseExpiredHolds()`
 * - Verify: the appointment status becomes 'expired', both staff and chair are free for that
 *   interval (new overlapping booking succeeds)
 * - Atomicity: since releaseExpiredHolds uses a single `updateMany`, the staff and chair are
 *   freed together (structural atomicity — cannot observe one freed without the other)
 */

// Helper to create a time-only Date (as Prisma stores @db.Time at epoch)
function timeDate(hours: number, minutes: number): Date {
  const d = new Date('1970-01-01T00:00:00.000Z');
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

// Arbitrary for generating held appointment data
const heldAppointmentArb = fc.record({
  staffId: fc.uuid(),
  chairId: fc.uuid(),
  customerId: fc.uuid(),
  salonId: fc.uuid(),
  serviceId: fc.uuid(),
  /** Duration in minutes (5 to 180) */
  durationMin: fc.integer({ min: 5, max: 180 }),
  /** Buffer in minutes (0 to 30) */
  bufferMin: fc.integer({ min: 0, max: 30 }),
  /** Hold expiry offset in minutes before "now" (1 to 60 min expired) */
  expiredMinutesAgo: fc.integer({ min: 1, max: 60 }),
  /** Appointment start hour (9 to 16) */
  startHour: fc.integer({ min: 9, max: 16 }),
  /** Appointment start minute */
  startMinute: fc.integer({ min: 0, max: 59 }),
});

// Arbitrary for generating multiple held appointments (1 to 5)
const multipleHeldAppointmentsArb = fc.array(heldAppointmentArb, { minLength: 1, maxLength: 5 });

describe('Feature: salon-booking-system, Property 6: Atomic hold and release', () => {
  it('releaseExpiredHolds transitions all expired held appointments to expired status atomically', async () => {
    await fc.assert(
      fc.asyncProperty(multipleHeldAppointmentsArb, async (appointments) => {
        const now = new Date('2024-03-15T12:00:00.000Z');

        // Build the held appointment rows
        const heldRows = appointments.map((appt, idx) => {
          const holdExpiresAt = new Date(now.getTime() - appt.expiredMinutesAgo * 60 * 1000);
          const startAt = new Date(`2024-03-15T${String(appt.startHour).padStart(2, '0')}:${String(appt.startMinute).padStart(2, '0')}:00.000Z`);
          const endAt = new Date(startAt.getTime() + (appt.durationMin + appt.bufferMin) * 60 * 1000);

          return {
            id: `appt-${idx}`,
            salonId: appt.salonId,
            customerId: appt.customerId,
            staffMemberId: appt.staffId,
            chairId: appt.chairId,
            serviceId: appt.serviceId,
            startAt,
            endAt,
            status: 'held' as const,
            source: 'web' as const,
            holdExpiresAt,
            createdAt: new Date('2024-03-15T08:00:00.000Z'),
          };
        });

        // Track state mutations
        let updateManyCallCount = 0;
        let updateManyArgs: any = null;

        const mockPrisma = {
          appointment: {
            updateMany: jest.fn().mockImplementation((args: any) => {
              updateManyCallCount++;
              updateManyArgs = args;

              // Simulate updating all matching rows
              const matchingCount = heldRows.filter(
                (row) => row.status === 'held' && row.holdExpiresAt && row.holdExpiresAt <= now,
              ).length;

              // After update, mark them as expired
              for (const row of heldRows) {
                if (row.status === 'held' && row.holdExpiresAt && row.holdExpiresAt <= now) {
                  (row as any).status = 'expired';
                }
              }

              return Promise.resolve({ count: matchingCount });
            }),
            findMany: jest.fn().mockImplementation(() => {
              // Return only held/confirmed appointments (those not released)
              return Promise.resolve(
                heldRows.filter((r) => r.status === 'held' || r.status === 'confirmed'),
              );
            }),
            create: jest.fn().mockImplementation((args: any) => {
              return Promise.resolve({
                id: 'new-appt',
                ...args.data,
                createdAt: new Date(),
              });
            }),
          },
          service: {
            findUnique: jest.fn(),
          },
          holiday: {
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
          },
          staffMember: {
            findMany: jest.fn(),
          },
          workingHours: {
            findMany: jest.fn(),
          },
          dayOff: {
            findMany: jest.fn(),
          },
          chair: {
            findMany: jest.fn(),
          },
          chairUnavailable: {
            findMany: jest.fn().mockResolvedValue([]),
          },
        } as any;

        const engine = new SchedulingEngine(mockPrisma);

        // Act: release expired holds
        const releasedCount = await engine.releaseExpiredHolds(now);

        // Property assertions:

        // 1. All expired-held appointments should be released
        expect(releasedCount).toBe(appointments.length);

        // 2. updateMany was called exactly ONCE (structural atomicity: single DB operation
        //    frees both staff and chair together — no intermediate state)
        expect(updateManyCallCount).toBe(1);

        // 3. The updateMany call targets the correct filter (status='held' AND holdExpiresAt <= now)
        expect(updateManyArgs.where.status).toBe('held');
        expect(updateManyArgs.where.holdExpiresAt).toEqual({ lte: now });

        // 4. The update sets status to 'expired'
        expect(updateManyArgs.data.status).toBe('expired');

        // 5. After release, ALL appointments are expired (neither staff nor chair is held)
        for (const row of heldRows) {
          expect(row.status).toBe('expired');
        }

        // 6. Verify atomicity: since both staffMemberId and chairId are on the SAME row
        //    and the update is a single updateMany, there is NO observable intermediate state
        //    where one resource is freed and the other remains held.
        //    (Structural guarantee: one row stores both resources, one updateMany transitions all)
        //
        //    After release, check that overlapping bookings for both staff and chair
        //    would succeed (resources are free) by verifying no held/confirmed appointments
        //    remain for those resources.
        const remainingHeldOrConfirmed = heldRows.filter(
          (r) => r.status === 'held' || r.status === 'confirmed',
        );
        expect(remainingHeldOrConfirmed).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it('releaseExpiredHolds does not affect non-expired or confirmed appointments', async () => {
    await fc.assert(
      fc.asyncProperty(heldAppointmentArb, async (appt) => {
        const now = new Date('2024-03-15T12:00:00.000Z');

        // Create a mix: one expired held, one NOT expired held, one confirmed
        const holdExpiresAt = new Date(now.getTime() - appt.expiredMinutesAgo * 60 * 1000);
        const futureHoldExpiry = new Date(now.getTime() + 10 * 60 * 1000); // 10 min in future

        const rows = [
          {
            id: 'appt-expired',
            status: 'held' as string,
            holdExpiresAt,
            staffMemberId: appt.staffId,
            chairId: appt.chairId,
          },
          {
            id: 'appt-still-valid',
            status: 'held' as string,
            holdExpiresAt: futureHoldExpiry,
            staffMemberId: 'other-staff',
            chairId: 'other-chair',
          },
          {
            id: 'appt-confirmed',
            status: 'confirmed' as string,
            holdExpiresAt: null,
            staffMemberId: 'confirmed-staff',
            chairId: 'confirmed-chair',
          },
        ];

        const mockPrisma = {
          appointment: {
            updateMany: jest.fn().mockImplementation((args: any) => {
              // Only update rows matching the filter
              let count = 0;
              for (const row of rows) {
                if (
                  row.status === 'held' &&
                  row.holdExpiresAt &&
                  row.holdExpiresAt <= now
                ) {
                  row.status = 'expired';
                  count++;
                }
              }
              return Promise.resolve({ count });
            }),
          },
        } as any;

        const engine = new SchedulingEngine(mockPrisma);
        const released = await engine.releaseExpiredHolds(now);

        // Only the expired held appointment should be released
        expect(released).toBe(1);

        // Verify state: only the expired one changed
        expect(rows[0].status).toBe('expired');
        expect(rows[1].status).toBe('held'); // still valid, not released
        expect(rows[2].status).toBe('confirmed'); // confirmed, untouched
      }),
      { numRuns: 100 },
    );
  });

  it('after release, the freed interval is bookable (staff and chair both available)', async () => {
    await fc.assert(
      fc.asyncProperty(heldAppointmentArb, async (appt) => {
        const now = new Date('2024-03-15T12:00:00.000Z');
        const holdExpiresAt = new Date(now.getTime() - appt.expiredMinutesAgo * 60 * 1000);
        const startHour = Math.min(appt.startHour, 15); // ensure within working hours
        const startAt = new Date(`2024-03-15T${String(startHour).padStart(2, '0')}:00:00.000Z`);
        const endAt = new Date(startAt.getTime() + (appt.durationMin + appt.bufferMin) * 60 * 1000);

        // Start with one held-expired appointment
        const appointmentRows: any[] = [
          {
            id: 'appt-held',
            salonId: appt.salonId,
            customerId: appt.customerId,
            staffMemberId: appt.staffId,
            chairId: appt.chairId,
            serviceId: appt.serviceId,
            startAt,
            endAt,
            status: 'held',
            source: 'web',
            holdExpiresAt,
            createdAt: new Date('2024-03-15T08:00:00.000Z'),
          },
        ];

        const mockPrisma = {
          appointment: {
            updateMany: jest.fn().mockImplementation(() => {
              let count = 0;
              for (const row of appointmentRows) {
                if (row.status === 'held' && row.holdExpiresAt && row.holdExpiresAt <= now) {
                  row.status = 'expired';
                  count++;
                }
              }
              return Promise.resolve({ count });
            }),
            findMany: jest.fn().mockImplementation(() => {
              // After release, only return held/confirmed (the released one won't match)
              return Promise.resolve(
                appointmentRows.filter((r) => r.status === 'held' || r.status === 'confirmed'),
              );
            }),
            create: jest.fn().mockImplementation((args: any) => {
              return Promise.resolve({ id: 'new-appt', ...args.data, createdAt: new Date() });
            }),
          },
          service: {
            findUnique: jest.fn().mockResolvedValue({
              id: appt.serviceId,
              salonId: appt.salonId,
              name: 'Test Service',
              durationMin: appt.durationMin,
              bufferMin: appt.bufferMin,
              priceRial: BigInt(100000),
              requiresDeposit: false,
              depositRial: null,
              serviceStaff: [{ serviceId: appt.serviceId, staffMemberId: appt.staffId }],
              serviceEquipment: [],
            }),
          },
          holiday: {
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
          },
          staffMember: {
            findMany: jest.fn().mockResolvedValue([
              { id: appt.staffId, salonId: appt.salonId, fullName: 'Staff', role: 'Stylist', active: true },
            ]),
          },
          workingHours: {
            findMany: jest.fn()
              .mockResolvedValueOnce([
                { id: 'wh-s', ownerKind: 'staff', ownerId: appt.staffId, weekday: 5, startTime: timeDate(8, 0), endTime: timeDate(22, 0) },
              ])
              .mockResolvedValueOnce([
                { id: 'wh-c', ownerKind: 'chair', ownerId: appt.chairId, weekday: 5, startTime: timeDate(8, 0), endTime: timeDate(22, 0) },
              ]),
          },
          dayOff: {
            findMany: jest.fn().mockResolvedValue([]),
          },
          chair: {
            findMany: jest.fn().mockResolvedValue([
              { id: appt.chairId, salonId: appt.salonId, name: 'Chair', active: true, chairEquipment: [] },
            ]),
          },
          chairUnavailable: {
            findMany: jest.fn().mockResolvedValue([]),
          },
        } as any;

        const engine = new SchedulingEngine(mockPrisma);

        // Release expired holds
        await engine.releaseExpiredHolds(now);

        // After release, the interval should be bookable
        // (no held/confirmed appointments remain for staff or chair)
        const result = await engine.book({
          salonId: appt.salonId,
          serviceId: appt.serviceId,
          startAt: startAt.toISOString(),
          customerId: 'new-customer',
          source: 'web',
        });

        // The booking should succeed (created as pending) since resources are freed
        expect(result.status).toBe('pending');
      }),
      { numRuns: 100 },
    );
  });
});
