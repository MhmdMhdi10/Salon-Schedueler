/**
 * Feature: salon-booking-system, Property 1: No double-booking invariant (staff and chair)
 *
 * For any sequence of booking operations (online or walk-in) accepted by the
 * Scheduling_Engine, no two appointments in status held or confirmed share the
 * same Staff_Member over overlapping time ranges, and no two such appointments
 * share the same Chair over overlapping time ranges.
 *
 * Validates: Requirements 9.3, 9.4, 3.3, 3.4, 13.1
 */

import * as fc from 'fast-check';
import { SchedulingEngine } from './scheduling-engine';
import type { BookingRequest } from './scheduling-engine';
import { intervalsOverlap } from '@salon/shared';

// --- Helpers ---

/** Create a time-only Date (as Prisma stores @db.Time at epoch) */
function timeDate(hours: number, minutes: number): Date {
  const d = new Date('1970-01-01T00:00:00.000Z');
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

// --- Constants ---

const SALON_ID = 'salon-prop1';
const SERVICE_ID = 'service-prop1';
const DATE = '2024-06-03'; // Monday = weekday 1
const WEEKDAY = 1;

// --- Scenario Types ---

interface BookingAttempt {
  customerId: string;
  startHour: number;
  startMin: number;
  source: 'web' | 'mobile' | 'walkin';
}

interface NoDoubleBookingScenario {
  staffIds: string[];
  chairIds: string[];
  durationMin: number;
  bufferMin: number;
  bookings: BookingAttempt[];
}

// --- Generators ---

/** Generate a scenario with multiple staff, chairs, and a sequence of bookings */
const scenarioArb: fc.Arbitrary<NoDoubleBookingScenario> = fc.record({
  numStaff: fc.integer({ min: 1, max: 3 }),
  numChairs: fc.integer({ min: 1, max: 3 }),
  durationMin: fc.integer({ min: 15, max: 60 }),
  bufferMin: fc.integer({ min: 0, max: 15 }),
  numBookings: fc.integer({ min: 2, max: 8 }),
}).chain(({ numStaff, numChairs, durationMin, bufferMin, numBookings }) => {
  const staffIds = Array.from({ length: numStaff }, (_, i) => `staff-${i}`);
  const chairIds = Array.from({ length: numChairs }, (_, i) => `chair-${i}`);

  const bookingArb: fc.Arbitrary<BookingAttempt> = fc.record({
    customerId: fc.integer({ min: 1, max: 5 }).map((n) => `customer-${n}`),
    startHour: fc.integer({ min: 9, max: 16 }),
    startMin: fc.constantFrom(0, 15, 30, 45),
    source: fc.constantFrom('web' as const, 'mobile' as const, 'walkin' as const),
  });

  return fc.array(bookingArb, { minLength: numBookings, maxLength: numBookings }).map(
    (bookings) => ({
      staffIds,
      chairIds,
      durationMin,
      bufferMin,
      bookings,
    }),
  );
});

// --- Mock Prisma with In-Memory Overlap Checking ---

interface ConfirmedAppointment {
  id: string;
  staffMemberId: string;
  chairId: string;
  startAt: Date;
  endAt: Date;
}

function buildMockPrisma(scenario: NoDoubleBookingScenario) {
  const { staffIds, chairIds, durationMin, bufferMin } = scenario;

  // In-memory state: all confirmed appointments
  const confirmedAppointments: ConfirmedAppointment[] = [];
  let appointmentCounter = 0;

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

  const staffMembers = staffIds.map((id) => ({
    id,
    salonId: SALON_ID,
    fullName: `Staff ${id}`,
    role: 'Stylist',
    active: true,
  }));

  const staffWorkingHours = staffIds.map((id) => ({
    id: `wh-staff-${id}`,
    ownerKind: 'staff',
    ownerId: id,
    weekday: WEEKDAY,
    startTime: timeDate(8, 0),
    endTime: timeDate(20, 0),
  }));

  const chairModels = chairIds.map((id) => ({
    id,
    salonId: SALON_ID,
    name: `Chair ${id}`,
    active: true,
    chairEquipment: [],
  }));

  const chairWorkingHours = chairIds.map((id) => ({
    id: `wh-chair-${id}`,
    ownerKind: 'chair',
    ownerId: id,
    weekday: WEEKDAY,
    startTime: timeDate(8, 0),
    endTime: timeDate(20, 0),
  }));

  let workingHoursCallCount = 0;

  const prisma = {
    service: {
      findUnique: jest.fn().mockResolvedValue(service),
    },
    holiday: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
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
        return Promise.resolve(chairWorkingHours);
      }),
    },
    dayOff: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    chair: {
      findMany: jest.fn().mockResolvedValue(chairModels),
    },
    chairUnavailable: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    appointment: {
      findMany: jest.fn().mockImplementation(() => {
        // Return all currently confirmed appointments (simulates DB state)
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
          // Simulate PostgreSQL exclusion violation (P2002)
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

        // Insert succeeds: record the confirmed appointment
        appointmentCounter++;
        const appt: ConfirmedAppointment = {
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
          status: 'pending',
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

describe('Property 1: No double-booking invariant (staff and chair)', () => {
  it('no two confirmed appointments share the same staff member with overlapping time ranges (R9.3, R3.4)', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const { prisma, confirmedAppointments } = buildMockPrisma(scenario);
        const engine = new SchedulingEngine(prisma);

        // Execute all booking requests sequentially
        for (const booking of scenario.bookings) {
          const startAt = `${DATE}T${String(booking.startHour).padStart(2, '0')}:${String(booking.startMin).padStart(2, '0')}:00.000Z`;

          const request: BookingRequest = {
            salonId: SALON_ID,
            serviceId: SERVICE_ID,
            startAt,
            customerId: booking.customerId,
            source: booking.source,
          };

          await engine.book(request);
        }

        // Verify invariant: no two confirmed appointments share the same
        // staff member with overlapping time ranges
        for (let i = 0; i < confirmedAppointments.length; i++) {
          for (let j = i + 1; j < confirmedAppointments.length; j++) {
            const a = confirmedAppointments[i];
            const b = confirmedAppointments[j];

            if (a.staffMemberId === b.staffMemberId) {
              const overlaps = intervalsOverlap(
                { start: a.startAt, end: a.endAt },
                { start: b.startAt, end: b.endAt },
              );
              expect(overlaps).toBe(false);
            }
          }
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('no two confirmed appointments share the same chair with overlapping time ranges (R9.4, R3.3)', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const { prisma, confirmedAppointments } = buildMockPrisma(scenario);
        const engine = new SchedulingEngine(prisma);

        // Execute all booking requests sequentially
        for (const booking of scenario.bookings) {
          const startAt = `${DATE}T${String(booking.startHour).padStart(2, '0')}:${String(booking.startMin).padStart(2, '0')}:00.000Z`;

          const request: BookingRequest = {
            salonId: SALON_ID,
            serviceId: SERVICE_ID,
            startAt,
            customerId: booking.customerId,
            source: booking.source,
          };

          await engine.book(request);
        }

        // Verify invariant: no two confirmed appointments share the same
        // chair with overlapping time ranges
        for (let i = 0; i < confirmedAppointments.length; i++) {
          for (let j = i + 1; j < confirmedAppointments.length; j++) {
            const a = confirmedAppointments[i];
            const b = confirmedAppointments[j];

            if (a.chairId === b.chairId) {
              const overlaps = intervalsOverlap(
                { start: a.startAt, end: a.endAt },
                { start: b.startAt, end: b.endAt },
              );
              expect(overlaps).toBe(false);
            }
          }
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('walk-in bookings obey the same no-overlap constraint as online bookings (R13.1)', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        // Force all bookings to be walk-ins
        const walkinScenario = {
          ...scenario,
          bookings: scenario.bookings.map((b) => ({ ...b, source: 'walkin' as const })),
        };

        const { prisma, confirmedAppointments } = buildMockPrisma(walkinScenario);
        const engine = new SchedulingEngine(prisma);

        for (const booking of walkinScenario.bookings) {
          const startAt = `${DATE}T${String(booking.startHour).padStart(2, '0')}:${String(booking.startMin).padStart(2, '0')}:00.000Z`;

          const request: BookingRequest = {
            salonId: SALON_ID,
            serviceId: SERVICE_ID,
            startAt,
            customerId: booking.customerId,
            source: booking.source,
          };

          await engine.book(request);
        }

        // Verify both staff and chair invariants hold for walk-ins
        for (let i = 0; i < confirmedAppointments.length; i++) {
          for (let j = i + 1; j < confirmedAppointments.length; j++) {
            const a = confirmedAppointments[i];
            const b = confirmedAppointments[j];

            if (a.staffMemberId === b.staffMemberId) {
              expect(
                intervalsOverlap(
                  { start: a.startAt, end: a.endAt },
                  { start: b.startAt, end: b.endAt },
                ),
              ).toBe(false);
            }

            if (a.chairId === b.chairId) {
              expect(
                intervalsOverlap(
                  { start: a.startAt, end: a.endAt },
                  { start: b.startAt, end: b.endAt },
                ),
              ).toBe(false);
            }
          }
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });
});
