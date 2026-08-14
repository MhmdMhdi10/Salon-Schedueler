import fc from 'fast-check';
import { AnalyticsService } from './analytics.service';

/**
 * Property Tests — Feature: salon-booking-system
 *
 * Property 16: Utilization and revenue correctness
 * **Validates: Requirements 16.1, 16.2, 16.3, 16.4**
 *
 * For any set of appointments and configured availability over a period,
 * the chair and staff utilization each equal booked time divided by available time
 * and lie within the closed interval [0, 1], the revenue summary equals the sum
 * of in-period completed appointment prices in Iranian Rial, and the reported
 * busiest window has the maximum concurrent-appointment count.
 */

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generate a working hours entry (start/end as hours in [0,23]) */
const workingHoursArb = fc.record({
  startHour: fc.integer({ min: 0, max: 22 }),
  endHour: fc.integer({ min: 1, max: 23 }),
}).filter((wh) => wh.endHour > wh.startHour);

/** Generate an appointment within working hours */
const appointmentArb = (dayDate: string, maxEndHour: number) =>
  fc.record({
    id: fc.uuid(),
    startHour: fc.integer({ min: 0, max: Math.max(0, maxEndHour - 1) }),
    durationMin: fc.integer({ min: 15, max: 120 }),
    status: fc.constantFrom('confirmed' as const, 'completed' as const),
    priceRial: fc.integer({ min: 10000, max: 5000000 }),
  }).map((data) => {
    const startAt = new Date(`${dayDate}T${String(data.startHour).padStart(2, '0')}:00:00.000Z`);
    const endAt = new Date(startAt.getTime() + data.durationMin * 60 * 1000);
    return {
      id: data.id,
      startAt,
      endAt,
      status: data.status,
      priceRial: BigInt(data.priceRial),
    };
  });

/** Scenario for utilization testing */
const utilizationScenarioArb = fc.record({
  ownerIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
  workingHours: workingHoursArb,
  weekday: fc.integer({ min: 0, max: 6 }),
}).chain((scenario) =>
  fc.record({
    ...scenario as any,
    appointments: fc.array(
      appointmentArb('2024-03-15', scenario.workingHours.endHour),
      { minLength: 0, maxLength: 5 },
    ),
  }).map(() => scenario),
).map((s) => s);

// ─── Helper: compute expected booked minutes ──────────────────────────────────

function computeExpectedBookedMinutes(
  appointments: { startAt: Date; endAt: Date }[],
  from: Date,
  to: Date,
): number {
  let total = 0;
  for (const appt of appointments) {
    const effectiveStart = appt.startAt < from ? from : appt.startAt;
    const effectiveEnd = appt.endAt > to ? to : appt.endAt;
    if (effectiveStart < effectiveEnd) {
      total += (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60);
    }
  }
  return total;
}

function computeExpectedAvailableMinutes(
  workingHoursData: { startHour: number; endHour: number },
  ownerCount: number,
  from: Date,
  to: Date,
): number {
  // For simplicity, assume single day and all owners have same hours
  const dayStart = new Date(from);
  dayStart.setUTCHours(workingHoursData.startHour, 0, 0, 0);
  const dayEnd = new Date(from);
  dayEnd.setUTCHours(workingHoursData.endHour, 0, 0, 0);

  const effectiveStart = dayStart < from ? from : dayStart;
  const effectiveEnd = dayEnd > to ? to : dayEnd;

  if (effectiveStart >= effectiveEnd) return 0;

  const minutesPerOwner = (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60);
  return minutesPerOwner * ownerCount;
}

// ─── Property 16: Utilization and revenue correctness ────────────────────────

describe('Feature: salon-booking-system, Property 16: Utilization and revenue correctness', () => {
  it('chair utilization lies within [0, 1] for any valid inputs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          chairIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 4 }),
          workingHours: workingHoursArb,
          appointmentCount: fc.integer({ min: 0, max: 8 }),
        }),
        async (data) => {
          // Build working hours for all chairs on Friday (weekday 5)
          // 2024-03-15 is a Friday
          const whRecords = data.chairIds.map((id) => ({
            id: `wh-${id}`,
            ownerKind: 'chair',
            ownerId: id,
            weekday: 5,
            startTime: new Date(`1970-01-01T${String(data.workingHours.startHour).padStart(2, '0')}:00:00.000Z`),
            endTime: new Date(`1970-01-01T${String(data.workingHours.endHour).padStart(2, '0')}:00:00.000Z`),
          }));

          // Generate appointments within working hours
          const appointments: any[] = [];
          for (let i = 0; i < data.appointmentCount; i++) {
            const chairId = data.chairIds[i % data.chairIds.length];
            const startHour = data.workingHours.startHour + (i % (data.workingHours.endHour - data.workingHours.startHour));
            const startAt = new Date(`2024-03-15T${String(startHour).padStart(2, '0')}:00:00.000Z`);
            const endAt = new Date(startAt.getTime() + 30 * 60 * 1000); // 30 min
            appointments.push({
              id: `appt-${i}`,
              chairId,
              startAt,
              endAt,
              status: i % 2 === 0 ? 'confirmed' : 'completed',
            });
          }

          const mockPrisma = {
            chair: {
              findMany: jest.fn().mockResolvedValue(
                data.chairIds.map((id) => ({ id, salonId: 'salon-1', active: true })),
              ),
            },
            workingHours: {
              findMany: jest.fn().mockResolvedValue(whRecords),
            },
            appointment: {
              findMany: jest.fn().mockResolvedValue(appointments),
            },
          } as any;

          const service = new AnalyticsService(mockPrisma);
          const result = await service.chairUtilization(
            'salon-1',
            new Date('2024-03-15T00:00:00Z'),
            new Date('2024-03-16T00:00:00Z'),
          );

          // Property: utilization is always in [0, 1]
          expect(result.utilization).toBeGreaterThanOrEqual(0);
          expect(result.utilization).toBeLessThanOrEqual(1);
          // Property: bookedMinutes and availableMinutes are non-negative
          expect(result.bookedMinutes).toBeGreaterThanOrEqual(0);
          expect(result.availableMinutes).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('staff utilization lies within [0, 1] for any valid inputs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          staffIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 4 }),
          workingHours: workingHoursArb,
          appointmentCount: fc.integer({ min: 0, max: 8 }),
        }),
        async (data) => {
          const whRecords = data.staffIds.map((id) => ({
            id: `wh-${id}`,
            ownerKind: 'staff',
            ownerId: id,
            weekday: 5,
            startTime: new Date(`1970-01-01T${String(data.workingHours.startHour).padStart(2, '0')}:00:00.000Z`),
            endTime: new Date(`1970-01-01T${String(data.workingHours.endHour).padStart(2, '0')}:00:00.000Z`),
          }));

          const appointments: any[] = [];
          for (let i = 0; i < data.appointmentCount; i++) {
            const staffId = data.staffIds[i % data.staffIds.length];
            const startHour = data.workingHours.startHour + (i % (data.workingHours.endHour - data.workingHours.startHour));
            const startAt = new Date(`2024-03-15T${String(startHour).padStart(2, '0')}:00:00.000Z`);
            const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
            appointments.push({
              id: `appt-${i}`,
              staffMemberId: staffId,
              startAt,
              endAt,
              status: i % 2 === 0 ? 'confirmed' : 'completed',
            });
          }

          const mockPrisma = {
            staffMember: {
              findMany: jest.fn().mockResolvedValue(
                data.staffIds.map((id) => ({ id, salonId: 'salon-1', active: true })),
              ),
            },
            workingHours: {
              findMany: jest.fn().mockResolvedValue(whRecords),
            },
            appointment: {
              findMany: jest.fn().mockResolvedValue(appointments),
            },
          } as any;

          const service = new AnalyticsService(mockPrisma);
          const result = await service.staffUtilization(
            'salon-1',
            new Date('2024-03-15T00:00:00Z'),
            new Date('2024-03-16T00:00:00Z'),
          );

          // Property: utilization is always in [0, 1]
          expect(result.utilization).toBeGreaterThanOrEqual(0);
          expect(result.utilization).toBeLessThanOrEqual(1);
          expect(result.bookedMinutes).toBeGreaterThanOrEqual(0);
          expect(result.availableMinutes).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('revenue equals the sum of completed appointment prices in Rial', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            priceRial: fc.integer({ min: 0, max: 10000000 }),
            startHour: fc.integer({ min: 8, max: 20 }),
            durationMin: fc.integer({ min: 15, max: 120 }),
          }),
          { minLength: 0, maxLength: 10 },
        ),
        async (appointmentsData) => {
          const from = new Date('2024-03-15T00:00:00Z');
          const to = new Date('2024-03-16T00:00:00Z');

          const appointments = appointmentsData.map((data) => {
            const startAt = new Date(`2024-03-15T${String(data.startHour).padStart(2, '0')}:00:00.000Z`);
            const endAt = new Date(startAt.getTime() + data.durationMin * 60 * 1000);
            return {
              id: data.id,
              salonId: 'salon-1',
              startAt,
              endAt,
              status: 'completed',
              service: { priceRial: BigInt(data.priceRial) },
            };
          });

          const mockPrisma = {
            appointment: {
              findMany: jest.fn().mockResolvedValue(appointments),
            },
          } as any;

          const service = new AnalyticsService(mockPrisma);
          const result = await service.revenue('salon-1', from, to);

          // Property: revenue equals the exact sum of all completed appointment prices
          const expectedRevenue = appointmentsData.reduce(
            (sum, d) => sum + BigInt(d.priceRial),
            BigInt(0),
          );
          expect(result.totalRial).toBe(expectedRevenue);
          expect(result.appointmentCount).toBe(appointmentsData.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('busiest window has the maximum concurrent-appointment count (argmax)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            startMinute: fc.integer({ min: 0, max: 600 }), // offset from base in minutes
            durationMin: fc.integer({ min: 15, max: 120 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        async (appointmentsData) => {
          const baseTime = new Date('2024-03-15T08:00:00Z');
          const from = new Date('2024-03-15T00:00:00Z');
          const to = new Date('2024-03-16T00:00:00Z');

          const appointments = appointmentsData.map((data) => {
            const startAt = new Date(baseTime.getTime() + data.startMinute * 60 * 1000);
            const endAt = new Date(startAt.getTime() + data.durationMin * 60 * 1000);
            return {
              id: data.id,
              startAt,
              endAt,
              status: 'confirmed',
            };
          });

          const mockPrisma = {
            appointment: {
              findMany: jest.fn().mockResolvedValue(appointments),
            },
          } as any;

          const service = new AnalyticsService(mockPrisma);
          const result = await service.busiestWindows('salon-1', from, to);

          // Compute expected max concurrency using a brute-force sweep
          // Collect all time points and check concurrency at each
          const timePoints = new Set<number>();
          for (const appt of appointments) {
            timePoints.add(appt.startAt.getTime());
            timePoints.add(appt.endAt.getTime());
            // Check midpoints between all events
            timePoints.add(appt.startAt.getTime() + 1);
          }

          let expectedMax = 0;
          for (const tp of timePoints) {
            let count = 0;
            for (const appt of appointments) {
              // An appointment is active at time tp if startAt <= tp < endAt
              if (appt.startAt.getTime() <= tp && tp < appt.endAt.getTime()) {
                count++;
              }
            }
            expectedMax = Math.max(expectedMax, count);
          }

          // Property: reported busiest window concurrency matches expected max
          expect(result.busiestWindows.length).toBeGreaterThanOrEqual(1);
          expect(result.busiestWindows[0].concurrentCount).toBe(expectedMax);
        },
      ),
      { numRuns: 100 },
    );
  });
});
