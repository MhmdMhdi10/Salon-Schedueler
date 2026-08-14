/**
 * Feature: salon-booking-system, Property 2: Booking validity / double-resource reservation
 *
 * For any held or confirmed Appointment, it reserves exactly one Staff_Member who is
 * mapped to the service and exactly one Chair that provides every equipment item the
 * service requires, and its reserved interval length equals the service duration plus
 * the service Buffer_Time.
 *
 * Validates: Requirements 9.1, 5.2, 6.2, 6.3
 */

import * as fc from 'fast-check';
import { SchedulingEngine } from './scheduling-engine';
import type { BookingRequest } from './scheduling-engine';

// --- Helpers ---

/** Create a time-only Date (as Prisma stores @db.Time at epoch) */
function timeDate(hours: number, minutes: number): Date {
  const d = new Date('1970-01-01T00:00:00.000Z');
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

// --- Scenario types ---

interface StaffDef {
  id: string;
  qualifiedForService: boolean;
}

interface ChairDef {
  id: string;
  equipmentIds: string[];
}

interface BookingScenario {
  salonId: string;
  serviceId: string;
  durationMin: number;
  bufferMin: number;
  requiredEquipmentIds: string[];
  staff: StaffDef[];
  chairs: ChairDef[];
  bookingStartHour: number;
  bookingStartMin: number;
  customerId: string;
  source: 'web' | 'mobile' | 'walkin';
}

// --- Generators ---

const SALON_ID = 'salon-prop2';
const SERVICE_ID = 'service-prop2';
const CUSTOMER_ID = 'customer-prop2';
const DATE = '2024-06-03'; // Monday = weekday 1
const WEEKDAY = 1;

/** Generate equipment IDs for a scenario (0-3 items) */
const equipmentIdsArb = fc
  .integer({ min: 0, max: 3 })
  .chain((count) =>
    fc.tuple(...Array.from({ length: count }, (_, i) => fc.constant(`eq-${i}`))),
  )
  .map((ids) => ids as string[]);

/** Generate staff definitions: 1-4 staff, at least one qualified */
const staffDefsArb = fc
  .integer({ min: 1, max: 4 })
  .chain((count) => {
    // Generate qualifications, ensuring at least one is qualified
    const quals = fc
      .array(fc.boolean(), { minLength: count, maxLength: count })
      .filter((arr) => arr.some((q) => q));
    return quals.map((qualArr) =>
      qualArr.map((qualified, idx) => ({
        id: `staff-${idx}`,
        qualifiedForService: qualified,
      })),
    );
  });

/** Generate chair definitions: 1-4 chairs */
const chairDefsArb = (requiredEquipmentIds: string[]) =>
  fc
    .integer({ min: 1, max: 4 })
    .chain((count) => {
      // For each chair, decide which equipment it has
      // Ensure at least one chair has ALL required equipment
      return fc
        .array(
          fc.subarray(
            requiredEquipmentIds.length > 0
              ? requiredEquipmentIds
              : ['eq-placeholder'],
            { minLength: 0 },
          ),
          { minLength: count, maxLength: count },
        )
        .map((equipments) => {
          const chairs = equipments.map((eqIds, idx) => ({
            id: `chair-${idx}`,
            equipmentIds: requiredEquipmentIds.length > 0 ? eqIds : [],
          }));
          // Ensure at least one chair is compatible (has all required equipment)
          if (
            requiredEquipmentIds.length > 0 &&
            !chairs.some((c) =>
              requiredEquipmentIds.every((eqId) => c.equipmentIds.includes(eqId)),
            )
          ) {
            // Force the first chair to have all required equipment
            chairs[0].equipmentIds = [...requiredEquipmentIds];
          }
          return chairs;
        });
    });

/** Generate a full booking scenario that should succeed (free staff + chair exist) */
const bookingScenarioArb: fc.Arbitrary<BookingScenario> = fc
  .record({
    durationMin: fc.integer({ min: 15, max: 90 }),
    bufferMin: fc.integer({ min: 0, max: 30 }),
    bookingStartHour: fc.integer({ min: 9, max: 15 }),
    bookingStartMin: fc.constantFrom(0, 15, 30, 45),
    source: fc.constantFrom('web' as const, 'mobile' as const, 'walkin' as const),
    useEquipment: fc.boolean(),
  })
  .chain(({ durationMin, bufferMin, bookingStartHour, bookingStartMin, source, useEquipment }) => {
    const requiredEquipmentIds = useEquipment
      ? Array.from({ length: fc.sample(fc.integer({ min: 1, max: 3 }), 1)[0] }, (_, i) => `eq-${i}`)
      : [];

    return fc
      .record({
        staff: staffDefsArb,
        chairs: chairDefsArb(requiredEquipmentIds),
      })
      .map(({ staff, chairs }) => ({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        durationMin,
        bufferMin,
        requiredEquipmentIds,
        staff,
        chairs,
        bookingStartHour,
        bookingStartMin,
        customerId: CUSTOMER_ID,
        source,
      }));
  });

// --- Mock Prisma Builder ---

function buildMockPrisma(scenario: BookingScenario) {
  const {
    salonId,
    serviceId,
    durationMin,
    bufferMin,
    requiredEquipmentIds,
    staff,
    chairs,
    bookingStartHour,
    bookingStartMin,
  } = scenario;

  // Qualified staff = those mapped to the service
  const qualifiedStaff = staff.filter((s) => s.qualifiedForService);

  // Service
  const service = {
    id: serviceId,
    salonId,
    name: 'Test Service',
    durationMin,
    bufferMin,
    priceRial: BigInt(100000),
    requiresDeposit: false,
    depositRial: null,
    serviceStaff: qualifiedStaff.map((s) => ({
      serviceId,
      staffMemberId: s.id,
    })),
    serviceEquipment: requiredEquipmentIds.map((eqId) => ({
      serviceId,
      equipmentId: eqId,
    })),
  };

  // Staff members (all active)
  const staffMembers = staff.map((s) => ({
    id: s.id,
    salonId,
    fullName: `Staff ${s.id}`,
    role: 'Stylist',
    active: true,
  }));

  // Working hours for ALL qualified staff (full day 8:00-20:00 on target weekday)
  const staffWorkingHours = qualifiedStaff.map((s) => ({
    id: `wh-${s.id}`,
    ownerKind: 'staff',
    ownerId: s.id,
    weekday: WEEKDAY,
    startTime: timeDate(8, 0),
    endTime: timeDate(20, 0),
  }));

  // Chair models
  const chairModels = chairs.map((c) => ({
    id: c.id,
    salonId,
    name: `Chair ${c.id}`,
    active: true,
    chairEquipment: c.equipmentIds.map((eqId) => ({
      chairId: c.id,
      equipmentId: eqId,
    })),
  }));

  // Working hours for ALL chairs (full day 8:00-20:00 on target weekday)
  const chairWorkingHours = chairs.map((c) => ({
    id: `wh-${c.id}`,
    ownerKind: 'chair',
    ownerId: c.id,
    weekday: WEEKDAY,
    startTime: timeDate(8, 0),
    endTime: timeDate(20, 0),
  }));

  // Track which staff/chair is selected from the create call
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
        if (workingHoursCallCount === 1) {
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
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => {
        // Simulate successful creation and return the appointment
        return Promise.resolve({
          id: 'appt-prop2',
          ...data,
          holdExpiresAt: null,
          createdAt: new Date(),
        });
      }),
    },
  } as any;

  return prisma;
}

// --- Property Tests ---

describe('Property 2: Booking validity / double-resource reservation', () => {
  it('appointed staff member is in the service qualified staff set (R9.1, R6.2)', async () => {
    await fc.assert(
      fc.asyncProperty(bookingScenarioArb, async (scenario) => {
        const prisma = buildMockPrisma(scenario);
        const engine = new SchedulingEngine(prisma);

        const startAt = `${DATE}T${String(scenario.bookingStartHour).padStart(2, '0')}:${String(scenario.bookingStartMin).padStart(2, '0')}:00.000Z`;

        const request: BookingRequest = {
          salonId: scenario.salonId,
          serviceId: scenario.serviceId,
          startAt,
          customerId: scenario.customerId,
          source: scenario.source,
        };

        const result = await engine.book(request);

        if (result.status === 'pending') {
          // The appointed staff must be in the qualified staff set (service_staff mapping)
          const qualifiedStaffIds = scenario.staff
            .filter((s) => s.qualifiedForService)
            .map((s) => s.id);

          const appointedStaffId = result.appointment.staffMemberId;
          expect(qualifiedStaffIds).toContain(appointedStaffId);
        }

        // If rejected, that's acceptable - property only applies to confirmed bookings
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('appointed chair has all required equipment for the service (R9.1, R6.3)', async () => {
    await fc.assert(
      fc.asyncProperty(bookingScenarioArb, async (scenario) => {
        const prisma = buildMockPrisma(scenario);
        const engine = new SchedulingEngine(prisma);

        const startAt = `${DATE}T${String(scenario.bookingStartHour).padStart(2, '0')}:${String(scenario.bookingStartMin).padStart(2, '0')}:00.000Z`;

        const request: BookingRequest = {
          salonId: scenario.salonId,
          serviceId: scenario.serviceId,
          startAt,
          customerId: scenario.customerId,
          source: scenario.source,
        };

        const result = await engine.book(request);

        if (result.status === 'pending') {
          const appointedChairId = result.appointment.chairId;

          // Find the chair definition
          const appointedChair = scenario.chairs.find((c) => c.id === appointedChairId);
          expect(appointedChair).toBeDefined();

          // The appointed chair must have ALL required equipment
          for (const reqEqId of scenario.requiredEquipmentIds) {
            expect(appointedChair!.equipmentIds).toContain(reqEqId);
          }
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('appointment interval (endAt - startAt) equals durationMin + bufferMin in milliseconds (R5.2)', async () => {
    await fc.assert(
      fc.asyncProperty(bookingScenarioArb, async (scenario) => {
        const prisma = buildMockPrisma(scenario);
        const engine = new SchedulingEngine(prisma);

        const startAt = `${DATE}T${String(scenario.bookingStartHour).padStart(2, '0')}:${String(scenario.bookingStartMin).padStart(2, '0')}:00.000Z`;

        const request: BookingRequest = {
          salonId: scenario.salonId,
          serviceId: scenario.serviceId,
          startAt,
          customerId: scenario.customerId,
          source: scenario.source,
        };

        const result = await engine.book(request);

        if (result.status === 'pending') {
          const apptStartAt = new Date(result.appointment.startAt).getTime();
          const apptEndAt = new Date(result.appointment.endAt).getTime();
          const intervalMs = apptEndAt - apptStartAt;

          const expectedMs = (scenario.durationMin + scenario.bufferMin) * 60 * 1000;
          expect(intervalMs).toBe(expectedMs);
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });
});
