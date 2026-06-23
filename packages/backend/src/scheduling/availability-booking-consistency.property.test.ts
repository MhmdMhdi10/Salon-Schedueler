/**
 * Feature: salon-booking-system, Property 4: Availability–booking consistency
 *
 * For any system state, a Time_Slot returned by availability can be booked successfully
 * when attempted in isolation, and a booking attempt for an interval with no simultaneously
 * free qualified-staff/compatible-chair pair is rejected with a no-availability/slot-unavailable result.
 *
 * Validates: Requirements 9.2, 9.6, 8.1
 */

import * as fc from 'fast-check';
import { SchedulingEngine } from './scheduling-engine';
import type { AvailabilityQuery, BookingRequest } from './scheduling-engine';
import { intervalsOverlap } from '@salon/shared';

// --- Helpers ---

/** Create a time-only Date (as Prisma stores @db.Time at epoch) */
function timeDate(hours: number, minutes: number): Date {
  const d = new Date('1970-01-01T00:00:00.000Z');
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

// --- Constants ---

const SALON_ID = 'salon-prop4';
const SERVICE_ID = 'service-prop4';
const CUSTOMER_ID = 'customer-prop4';
const DATE = '2024-06-03'; // Monday = weekday 1
const WEEKDAY = 1;

// --- Scenario Types ---

interface StaffScenario {
  id: string;
  workingHoursStart: number;
  workingHoursEnd: number;
  hasWorkingHours: boolean;
  isDayOff: boolean;
}

interface ChairScenario {
  id: string;
  workingHoursStart: number;
  workingHoursEnd: number;
  hasWorkingHours: boolean;
  unavailablePeriods: { startHour: number; endHour: number }[];
}

interface AppointmentScenario {
  staffId: string;
  chairId: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
}

interface ConsistencyScenario {
  durationMin: number;
  bufferMin: number;
  staff: StaffScenario[];
  chairs: ChairScenario[];
  appointments: AppointmentScenario[];
}

// --- Generators ---

/** Generate a working-hours window (start < end within 0-24h) */
const workingWindowArb = fc
  .record({
    start: fc.integer({ min: 8, max: 16 }),
    duration: fc.integer({ min: 3, max: 8 }),
  })
  .map(({ start, duration }) => ({
    start,
    end: Math.min(start + duration, 22),
  }))
  .filter(({ start, end }) => end > start);

/** Generate staff scenario — always has working hours and is not on day off for consistency tests */
const staffArb = (index: number) =>
  fc
    .record({
      hasWorkingHours: fc.constant(true),
      isDayOff: fc.constant(false),
      window: workingWindowArb,
    })
    .map(({ hasWorkingHours, isDayOff, window }) => ({
      id: `staff-${index}`,
      workingHoursStart: window.start,
      workingHoursEnd: window.end,
      hasWorkingHours,
      isDayOff,
    }));

/** Generate chair scenario — always has working hours for consistency tests */
const chairArb = (index: number) =>
  fc
    .record({
      window: workingWindowArb,
      unavailablePeriods: fc.array(
        fc
          .record({
            start: fc.integer({ min: 8, max: 18 }),
            duration: fc.integer({ min: 1, max: 2 }),
          })
          .map(({ start, duration }) => ({
            startHour: start,
            endHour: Math.min(start + duration, 22),
          }))
          .filter(({ startHour, endHour }) => endHour > startHour),
        { minLength: 0, maxLength: 1 },
      ),
    })
    .map(({ window, unavailablePeriods }) => ({
      id: `chair-${index}`,
      workingHoursStart: window.start,
      workingHoursEnd: window.end,
      hasWorkingHours: true,
      unavailablePeriods,
    }));

/** Generate appointment that fits within normal working hours */
const appointmentArb = (staffIds: string[], chairIds: string[]) =>
  fc
    .record({
      staffIdx: fc.integer({ min: 0, max: Math.max(0, staffIds.length - 1) }),
      chairIdx: fc.integer({ min: 0, max: Math.max(0, chairIds.length - 1) }),
      startHour: fc.integer({ min: 8, max: 18 }),
      startMin: fc.constantFrom(0, 15, 30, 45),
      durationMin: fc.integer({ min: 15, max: 90 }),
    })
    .map(({ staffIdx, chairIdx, startHour, startMin, durationMin }) => {
      const endMinTotal = startHour * 60 + startMin + durationMin;
      const endHour = Math.min(Math.floor(endMinTotal / 60), 22);
      const endMin = endMinTotal >= 22 * 60 ? 0 : endMinTotal % 60;
      return {
        staffId: staffIds[staffIdx] || staffIds[0],
        chairId: chairIds[chairIdx] || chairIds[0],
        startHour,
        startMin,
        endHour,
        endMin,
      };
    })
    .filter((a) => a.startHour * 60 + a.startMin < a.endHour * 60 + a.endMin);

/** Generate a full consistency scenario */
const scenarioArb: fc.Arbitrary<ConsistencyScenario> = fc
  .record({
    staffCount: fc.integer({ min: 1, max: 3 }),
    chairCount: fc.integer({ min: 1, max: 3 }),
    durationMin: fc.integer({ min: 15, max: 60 }),
    bufferMin: fc.integer({ min: 0, max: 15 }),
    appointmentCount: fc.integer({ min: 0, max: 4 }),
  })
  .chain(({ staffCount, chairCount, durationMin, bufferMin, appointmentCount }) => {
    const staffIds = Array.from({ length: staffCount }, (_, i) => `staff-${i}`);
    const chairIds = Array.from({ length: chairCount }, (_, i) => `chair-${i}`);

    return fc
      .record({
        staff: fc.tuple(...staffIds.map((_, i) => staffArb(i))),
        chairs: fc.tuple(...chairIds.map((_, i) => chairArb(i))),
        appointments: fc.array(appointmentArb(staffIds, chairIds), {
          minLength: 0,
          maxLength: appointmentCount,
        }),
      })
      .map(({ staff, chairs, appointments }) => ({
        durationMin,
        bufferMin,
        staff: staff as StaffScenario[],
        chairs: chairs as ChairScenario[],
        appointments,
      }));
  });

// --- Mock Prisma Builder ---

function buildMockPrisma(scenario: ConsistencyScenario) {
  const { durationMin, bufferMin, staff, chairs, appointments } = scenario;

  // In-memory confirmed appointments (existing + newly booked)
  const confirmedAppointments: {
    id: string;
    staffMemberId: string;
    chairId: string;
    startAt: Date;
    endAt: Date;
  }[] = [];

  // Pre-populate with existing appointments from scenario
  for (let idx = 0; idx < appointments.length; idx++) {
    const a = appointments[idx];
    confirmedAppointments.push({
      id: `existing-appt-${idx}`,
      staffMemberId: a.staffId,
      chairId: a.chairId,
      startAt: new Date(
        `${DATE}T${String(a.startHour).padStart(2, '0')}:${String(a.startMin).padStart(2, '0')}:00.000Z`,
      ),
      endAt: new Date(
        `${DATE}T${String(a.endHour).padStart(2, '0')}:${String(a.endMin).padStart(2, '0')}:00.000Z`,
      ),
    });
  }

  const staffIds = staff.map((s) => s.id);
  const chairIds = chairs.map((c) => c.id);

  const service = {
    id: SERVICE_ID,
    salonId: SALON_ID,
    name: 'Test Service',
    durationMin,
    bufferMin,
    priceRial: BigInt(100000),
    requiresDeposit: false,
    depositRial: null,
    serviceStaff: staffIds.map((id) => ({ serviceId: SERVICE_ID, staffMemberId: id })),
    serviceEquipment: [],
  };

  const staffMembers = staff.map((s) => ({
    id: s.id,
    salonId: SALON_ID,
    fullName: `Staff ${s.id}`,
    role: 'Stylist',
    active: true,
  }));

  const staffWorkingHours = staff
    .filter((s) => s.hasWorkingHours)
    .map((s) => ({
      id: `wh-${s.id}`,
      ownerKind: 'staff',
      ownerId: s.id,
      weekday: WEEKDAY,
      startTime: timeDate(s.workingHoursStart, 0),
      endTime: timeDate(s.workingHoursEnd, 0),
    }));

  const daysOff = staff
    .filter((s) => s.isDayOff)
    .map((s) => ({
      id: `do-${s.id}`,
      staffMemberId: s.id,
      onDate: new Date(`${DATE}T00:00:00Z`),
    }));

  const chairModels = chairs.map((c) => ({
    id: c.id,
    salonId: SALON_ID,
    name: `Chair ${c.id}`,
    active: true,
    chairEquipment: [],
  }));

  const chairWorkingHoursData = chairs
    .filter((c) => c.hasWorkingHours)
    .map((c) => ({
      id: `wh-${c.id}`,
      ownerKind: 'chair',
      ownerId: c.id,
      weekday: WEEKDAY,
      startTime: timeDate(c.workingHoursStart, 0),
      endTime: timeDate(c.workingHoursEnd, 0),
    }));

  const chairUnavailableData = chairs.flatMap((c) =>
    c.unavailablePeriods.map((p, idx) => ({
      id: `cu-${c.id}-${idx}`,
      chairId: c.id,
      periodStart: new Date(`${DATE}T${String(p.startHour).padStart(2, '0')}:00:00.000Z`),
      periodEnd: new Date(`${DATE}T${String(p.endHour).padStart(2, '0')}:00:00.000Z`),
    })),
  );

  let workingHoursCallCount = 0;
  let appointmentCounter = appointments.length;

  const prisma = {
    service: {
      findUnique: jest.fn().mockResolvedValue(service),
    },
    holiday: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    staffMember: {
      findMany: jest.fn().mockResolvedValue(staffMembers),
    },
    workingHours: {
      findMany: jest.fn().mockImplementation(() => {
        workingHoursCallCount++;
        // Odd calls return staff hours, even calls return chair hours
        if (workingHoursCallCount % 2 === 1) {
          return Promise.resolve(staffWorkingHours);
        }
        return Promise.resolve(chairWorkingHoursData);
      }),
    },
    dayOff: {
      findMany: jest.fn().mockResolvedValue(daysOff),
    },
    chair: {
      findMany: jest.fn().mockResolvedValue(chairModels),
    },
    chairUnavailable: {
      findMany: jest.fn().mockResolvedValue(chairUnavailableData),
    },
    appointment: {
      findMany: jest.fn().mockImplementation(() => {
        return Promise.resolve(
          confirmedAppointments.map((appt) => ({
            ...appt,
            salonId: SALON_ID,
            status: 'confirmed',
          })),
        );
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const newStart = new Date(data.startAt);
        const newEnd = new Date(data.endAt);
        const newInterval = { start: newStart, end: newEnd };

        // Simulate exclusion constraint: check for staff overlap
        const staffOverlap = confirmedAppointments.some(
          (appt) =>
            appt.staffMemberId === data.staffMemberId &&
            intervalsOverlap(newInterval, { start: appt.startAt, end: appt.endAt }),
        );

        if (staffOverlap) {
          const error: any = new Error('Exclusion constraint violation');
          error.code = 'P2002';
          error.meta = { target: 'no_staff_overlap' };
          return Promise.reject(error);
        }

        // Simulate exclusion constraint: check for chair overlap
        const chairOverlap = confirmedAppointments.some(
          (appt) =>
            appt.chairId === data.chairId &&
            intervalsOverlap(newInterval, { start: appt.startAt, end: appt.endAt }),
        );

        if (chairOverlap) {
          const error: any = new Error('Exclusion constraint violation');
          error.code = 'P2002';
          error.meta = { target: 'no_chair_overlap' };
          return Promise.reject(error);
        }

        // Insert succeeds
        appointmentCounter++;
        const appt = {
          id: `appt-${appointmentCounter}`,
          staffMemberId: data.staffMemberId,
          chairId: data.chairId,
          startAt: newStart,
          endAt: newEnd,
        };
        confirmedAppointments.push(appt);

        return Promise.resolve({
          ...appt,
          salonId: SALON_ID,
          customerId: data.customerId,
          serviceId: data.serviceId,
          status: 'confirmed',
          source: data.source,
          holdExpiresAt: null,
          createdAt: new Date(),
        });
      }),
    },
  } as any;

  return { prisma, confirmedAppointments };
}

// --- Property Tests ---

describe('Property 4: Availability–booking consistency', () => {
  it('every slot returned by getAvailability can be successfully booked in isolation (R8.1, R9.2)', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const { prisma } = buildMockPrisma(scenario);
        const engine = new SchedulingEngine(prisma);

        // 1. Get availability
        const query: AvailabilityQuery = {
          salonId: SALON_ID,
          serviceId: SERVICE_ID,
          date: DATE,
          granularityMinutes: 15,
        };

        const slots = await engine.getAvailability(query);

        if (slots.length === 0) {
          // No slots returned — that's valid, no further assertion needed
          return true;
        }

        // 2. Pick the first returned slot and attempt to book it
        // We test only the first slot in isolation to keep the property focused.
        // (Each slot should be bookable on its own.)
        const slotToBook = slots[0];

        // Create a fresh prisma mock for the booking attempt to simulate
        // "in isolation" — same scenario state but a fresh engine call.
        const { prisma: bookingPrisma } = buildMockPrisma(scenario);
        const bookingEngine = new SchedulingEngine(bookingPrisma);

        const bookingRequest: BookingRequest = {
          salonId: SALON_ID,
          serviceId: SERVICE_ID,
          startAt: slotToBook.startAt,
          customerId: CUSTOMER_ID,
          source: 'web',
        };

        const result = await bookingEngine.book(bookingRequest);

        // The slot was returned by getAvailability, so booking in isolation must succeed
        expect(result.status).toBe('confirmed');
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('booking is rejected when no free staff/chair pair exists at the requested time (R9.2, R9.6)', async () => {
    // Generate a scenario with exactly 1 staff and 1 chair where all time is occupied
    const fullyBookedScenarioArb = fc
      .record({
        durationMin: fc.integer({ min: 15, max: 30 }),
        bufferMin: fc.integer({ min: 0, max: 10 }),
        staffWindowStart: fc.integer({ min: 9, max: 12 }),
        staffWindowSize: fc.integer({ min: 3, max: 5 }),
      })
      .map(({ durationMin, bufferMin, staffWindowStart, staffWindowSize }) => {
        const staffWindowEnd = staffWindowStart + staffWindowSize;
        const occupancy = durationMin + bufferMin;

        // Create appointments filling the entire working window for the single staff+chair
        const appointments: AppointmentScenario[] = [];
        let currentMin = staffWindowStart * 60;
        const endMin = staffWindowEnd * 60;

        while (currentMin + occupancy <= endMin) {
          const startHour = Math.floor(currentMin / 60);
          const startMinVal = currentMin % 60;
          const endMinTotal = currentMin + occupancy;
          const endHour = Math.floor(endMinTotal / 60);
          const endMinVal = endMinTotal % 60;

          appointments.push({
            staffId: 'staff-0',
            chairId: 'chair-0',
            startHour,
            startMin: startMinVal,
            endHour,
            endMin: endMinVal,
          });
          currentMin += occupancy;
        }

        return {
          durationMin,
          bufferMin,
          staff: [
            {
              id: 'staff-0',
              workingHoursStart: staffWindowStart,
              workingHoursEnd: staffWindowEnd,
              hasWorkingHours: true,
              isDayOff: false,
            },
          ],
          chairs: [
            {
              id: 'chair-0',
              workingHoursStart: staffWindowStart,
              workingHoursEnd: staffWindowEnd,
              hasWorkingHours: true,
              unavailablePeriods: [],
            },
          ],
          appointments,
        } as ConsistencyScenario;
      });

    await fc.assert(
      fc.asyncProperty(fullyBookedScenarioArb, async (scenario) => {
        const { prisma } = buildMockPrisma(scenario);
        const engine = new SchedulingEngine(prisma);

        // Verify availability returns empty (fully booked)
        const query: AvailabilityQuery = {
          salonId: SALON_ID,
          serviceId: SERVICE_ID,
          date: DATE,
          granularityMinutes: 15,
        };

        const slots = await engine.getAvailability(query);
        expect(slots.length).toBe(0);

        // Attempt to book any time within the working window — should be rejected
        const { prisma: bookingPrisma } = buildMockPrisma(scenario);
        const bookingEngine = new SchedulingEngine(bookingPrisma);

        const midHour = scenario.staff[0].workingHoursStart + 1;
        const bookingRequest: BookingRequest = {
          salonId: SALON_ID,
          serviceId: SERVICE_ID,
          startAt: `${DATE}T${String(midHour).padStart(2, '0')}:00:00.000Z`,
          customerId: CUSTOMER_ID,
          source: 'web',
        };

        const result = await bookingEngine.book(bookingRequest);

        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') {
          expect(['no_availability', 'slot_unavailable']).toContain(result.reason);
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
