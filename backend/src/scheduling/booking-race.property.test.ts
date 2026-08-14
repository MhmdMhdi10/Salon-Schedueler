/**
 * Feature: salon-booking-system, Property 5: Booking race safety (concurrency)
 *
 * For any two or more booking requests submitted concurrently for the last remaining
 * free (Staff_Member, Chair) pair over overlapping intervals, exactly one request is
 * confirmed and all others are rejected.
 *
 * Validates: Requirements 9.5
 *
 * NOTE: This test validates application-level handling of concurrent booking attempts.
 * The mock Prisma enforces the same exclusion constraint behavior as PostgreSQL's
 * EXCLUDE constraints. Full concurrency validation under real parallelism requires
 * a live PostgreSQL instance with the btree_gist exclusion constraints configured.
 * This test exercises the engine's retry + rejection logic when constraints are violated.
 */

import * as fc from 'fast-check';
import { SchedulingEngine } from './scheduling-engine';
import type { BookingRequest, BookingResult } from './scheduling-engine';
import { intervalsOverlap } from '@salon/shared';

// --- Helpers ---

/** Create a time-only Date (as Prisma stores @db.Time at epoch) */
function timeDate(hours: number, minutes: number): Date {
  const d = new Date('1970-01-01T00:00:00.000Z');
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

// --- Constants ---

const SALON_ID = 'salon-prop5';
const SERVICE_ID = 'service-prop5';
const DATE = '2024-06-03'; // Monday = weekday 1
const WEEKDAY = 1;
const STAFF_ID = 'staff-0'; // Exactly 1 staff (the "last pair")
const CHAIR_ID = 'chair-0'; // Exactly 1 chair (the "last pair")

// --- Scenario Types ---

interface RaceScenario {
  durationMin: number;
  bufferMin: number;
  bookingStartHour: number;
  bookingStartMin: number;
  numConcurrentRequests: number; // 2-5 concurrent requests
  staffWindowStart: number;
  staffWindowEnd: number;
}

// --- Generators ---

/** Generate a race scenario with 1 staff, 1 chair, and N concurrent requests */
const raceScenarioArb: fc.Arbitrary<RaceScenario> = fc.record({
  durationMin: fc.integer({ min: 15, max: 60 }),
  bufferMin: fc.integer({ min: 0, max: 15 }),
  bookingStartHour: fc.integer({ min: 9, max: 15 }),
  bookingStartMin: fc.constantFrom(0, 15, 30, 45),
  numConcurrentRequests: fc.integer({ min: 2, max: 5 }),
  staffWindowStart: fc.integer({ min: 8, max: 9 }),
  staffWindowEnd: fc.integer({ min: 18, max: 20 }),
});

// --- Mock Prisma Builder ---

/**
 * Build a mock Prisma that simulates exclusion constraints with a single staff and chair.
 * Only the first successful insert is allowed; subsequent overlapping inserts are rejected
 * with an exclusion constraint violation, mimicking PostgreSQL behavior.
 *
 * This mock is safe for concurrent use (via Promise.allSettled) because it uses
 * query arguments to determine response content rather than a shared counter.
 */
function buildRaceMockPrisma(scenario: RaceScenario) {
  const { durationMin, bufferMin, staffWindowStart, staffWindowEnd } = scenario;

  // The "database" state: tracks whether the single pair has been booked
  let bookedInterval: { start: Date; end: Date } | null = null;

  const service = {
    id: SERVICE_ID,
    salonId: SALON_ID,
    name: 'Test Service',
    durationMin,
    bufferMin,
    priceRial: BigInt(100000),
    requiresDeposit: false,
    depositRial: null,
    serviceStaff: [{ serviceId: SERVICE_ID, staffMemberId: STAFF_ID }],
    serviceEquipment: [],
  };

  const staffMembers = [
    {
      id: STAFF_ID,
      salonId: SALON_ID,
      fullName: 'Solo Staff',
      role: 'Stylist',
      active: true,
    },
  ];

  const staffWorkingHours = [
    {
      id: 'wh-staff-0',
      ownerKind: 'staff',
      ownerId: STAFF_ID,
      weekday: WEEKDAY,
      startTime: timeDate(staffWindowStart, 0),
      endTime: timeDate(staffWindowEnd, 0),
    },
  ];

  const chairModels = [
    {
      id: CHAIR_ID,
      salonId: SALON_ID,
      name: 'Solo Chair',
      active: true,
      chairEquipment: [],
    },
  ];

  const chairWorkingHours = [
    {
      id: 'wh-chair-0',
      ownerKind: 'chair',
      ownerId: CHAIR_ID,
      weekday: WEEKDAY,
      startTime: timeDate(staffWindowStart, 0),
      endTime: timeDate(staffWindowEnd, 0),
    },
  ];

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
      findMany: jest.fn().mockImplementation((args: any) => {
        // Use query arguments to determine response (safe for concurrent access)
        if (args?.where?.ownerKind === 'staff') {
          return Promise.resolve(staffWorkingHours);
        }
        if (args?.where?.ownerKind === 'chair') {
          return Promise.resolve(chairWorkingHours);
        }
        // Fallback: return both (shouldn't happen with current engine code)
        return Promise.resolve([...staffWorkingHours, ...chairWorkingHours]);
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
        // Return the booked appointment if one exists
        // This simulates reading from DB which may see committed writes
        if (bookedInterval) {
          return Promise.resolve([
            {
              id: 'appt-race-winner',
              salonId: SALON_ID,
              staffMemberId: STAFF_ID,
              chairId: CHAIR_ID,
              startAt: bookedInterval.start,
              endAt: bookedInterval.end,
              status: 'confirmed',
            },
          ]);
        }
        return Promise.resolve([]);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const newStart = new Date(data.startAt);
        const newEnd = new Date(data.endAt);
        const newInterval = { start: newStart, end: newEnd };

        // Simulate exclusion constraint: only one booking per staff/chair overlapping
        if (bookedInterval) {
          const overlaps = intervalsOverlap(newInterval, bookedInterval);
          if (overlaps) {
            // Reject with exclusion constraint violation
            const error: any = new Error('Exclusion constraint violation');
            error.code = 'P2002';
            error.meta = { target: 'no_staff_overlap' };
            return Promise.reject(error);
          }
        }

        // First successful insert wins
        bookedInterval = newInterval;

        return Promise.resolve({
          id: 'appt-race-winner',
          salonId: SALON_ID,
          customerId: data.customerId,
          staffMemberId: data.staffMemberId,
          chairId: data.chairId,
          serviceId: data.serviceId,
          startAt: newStart,
          endAt: newEnd,
          status: 'pending',
          source: data.source,
          holdExpiresAt: null,
          createdAt: new Date(),
        });
      }),
    },
  } as any;

  return { prisma };
}

// --- Property Tests ---

describe('Property 5: Booking race safety (concurrency)', () => {
  it('exactly one concurrent request is confirmed and all others are rejected for the last free pair (R9.5)', async () => {
    await fc.assert(
      fc.asyncProperty(raceScenarioArb, async (scenario) => {
        const { prisma } = buildRaceMockPrisma(scenario);

        // Submit N concurrent booking requests using Promise.allSettled
        const requests: BookingRequest[] = [];
        for (let i = 0; i < scenario.numConcurrentRequests; i++) {
          requests.push({
            salonId: SALON_ID,
            serviceId: SERVICE_ID,
            startAt: `${DATE}T${String(scenario.bookingStartHour).padStart(2, '0')}:${String(scenario.bookingStartMin).padStart(2, '0')}:00.000Z`,
            customerId: `customer-${i}`,
            source: 'web',
          });
        }

        // Simulate concurrency with Promise.allSettled
        // Each request gets its own SchedulingEngine instance sharing the same prisma (DB state)
        const results = await Promise.allSettled(
          requests.map((req) => {
            const engine = new SchedulingEngine(prisma);
            return engine.book(req);
          }),
        );

        // Collect outcomes
        const outcomes: BookingResult[] = results.map((r) => {
          if (r.status === 'fulfilled') return r.value;
          // Unexpected error — should not happen for well-formed requests
          throw new Error(`Unexpected rejection: ${r.reason}`);
        });

        // Count accepted (pending, awaiting approval) and rejected
        const pending = outcomes.filter((o) => o.status === 'pending');
        const rejected = outcomes.filter((o) => o.status === 'rejected');

        // Exactly one must be accepted (created as pending)
        expect(pending.length).toBe(1);

        // All others must be rejected
        expect(rejected.length).toBe(scenario.numConcurrentRequests - 1);

        // Rejected bookings must have the correct reason
        for (const r of rejected) {
          if (r.status === 'rejected') {
            expect(['no_availability', 'slot_unavailable']).toContain(r.reason);
          }
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('the confirmed booking reserves the correct staff and chair from the last pair (R9.5)', async () => {
    await fc.assert(
      fc.asyncProperty(raceScenarioArb, async (scenario) => {
        const { prisma } = buildRaceMockPrisma(scenario);

        const requests: BookingRequest[] = [];
        for (let i = 0; i < scenario.numConcurrentRequests; i++) {
          requests.push({
            salonId: SALON_ID,
            serviceId: SERVICE_ID,
            startAt: `${DATE}T${String(scenario.bookingStartHour).padStart(2, '0')}:${String(scenario.bookingStartMin).padStart(2, '0')}:00.000Z`,
            customerId: `customer-${i}`,
            source: 'web',
          });
        }

        const results = await Promise.allSettled(
          requests.map((req) => {
            const engine = new SchedulingEngine(prisma);
            return engine.book(req);
          }),
        );

        const outcomes: BookingResult[] = results.map((r) => {
          if (r.status === 'fulfilled') return r.value;
          throw new Error(`Unexpected rejection: ${r.reason}`);
        });

        const pending = outcomes.filter((o) => o.status === 'pending');
        expect(pending.length).toBe(1);

        // The accepted booking must use the only available staff and chair
        if (pending[0].status === 'pending') {
          expect(pending[0].appointment.staffMemberId).toBe(STAFF_ID);
          expect(pending[0].appointment.chairId).toBe(CHAIR_ID);
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });
});
