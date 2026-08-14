/**
 * Feature: salon-booking-system, Property 3: Availability soundness
 *
 * For any availability query, every returned Time_Slot has at least one qualified
 * Staff_Member and at least one compatible Chair both free for the full
 * duration-plus-buffer interval, within working hours, not on day off/holiday/unavailability;
 * when no free pair exists, result is empty.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 4.4, 4.5
 */

import * as fc from 'fast-check';
import { SchedulingEngine } from './scheduling-engine';
import type { AvailabilityQuery } from './scheduling-engine';
import { intervalsOverlap } from '@salon/shared';

// --- Helpers ---

/** Create a time-only Date (as Prisma stores @db.Time at epoch) */
function timeDate(hours: number, minutes: number): Date {
  const d = new Date('1970-01-01T00:00:00.000Z');
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

/** Convert a time-only Date to absolute timestamp on a given date */
function timeToAbsolute(time: Date, date: string): Date {
  const hours = time.getUTCHours();
  const minutes = time.getUTCMinutes();
  return new Date(
    `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000Z`,
  );
}

// --- Scenario type ---

interface StaffScenario {
  id: string;
  workingHoursStart: number; // hour 0-23
  workingHoursEnd: number; // hour 0-23
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

interface SalonScenario {
  salonId: string;
  serviceId: string;
  durationMin: number;
  bufferMin: number;
  staff: StaffScenario[];
  chairs: ChairScenario[];
  appointments: AppointmentScenario[];
  isHoliday: boolean;
  date: string;
  weekday: number;
  requiredEquipmentIds: string[];
  chairEquipment: Map<string, string[]>;
}

// --- Generators ---

const SALON_ID = 'salon-prop';
const SERVICE_ID = 'service-prop';
const DATE = '2024-06-03'; // Monday = weekday 1
const WEEKDAY = 1;

/** Generate a working-hours window (start < end within 0-24h) */
const workingWindowArb = fc
  .record({
    start: fc.integer({ min: 0, max: 20 }),
    duration: fc.integer({ min: 2, max: 8 }),
  })
  .map(({ start, duration }) => ({
    start,
    end: Math.min(start + duration, 23),
  }))
  .filter(({ start, end }) => end > start);

/** Generate staff scenario */
const staffArb = (index: number) =>
  fc
    .record({
      hasWorkingHours: fc.boolean(),
      isDayOff: fc.boolean(),
      window: workingWindowArb,
    })
    .map(({ hasWorkingHours, isDayOff, window }) => ({
      id: `staff-${index}`,
      workingHoursStart: window.start,
      workingHoursEnd: window.end,
      hasWorkingHours,
      isDayOff,
    }));

/** Generate unavailability period for a chair */
const unavailPeriodArb = fc
  .record({
    start: fc.integer({ min: 0, max: 20 }),
    duration: fc.integer({ min: 1, max: 4 }),
  })
  .map(({ start, duration }) => ({
    startHour: start,
    endHour: Math.min(start + duration, 23),
  }))
  .filter(({ startHour, endHour }) => endHour > startHour);

/** Generate chair scenario */
const chairArb = (index: number) =>
  fc
    .record({
      hasWorkingHours: fc.boolean(),
      window: workingWindowArb,
      unavailablePeriods: fc.array(unavailPeriodArb, { minLength: 0, maxLength: 2 }),
    })
    .map(({ hasWorkingHours, window, unavailablePeriods }) => ({
      id: `chair-${index}`,
      workingHoursStart: window.start,
      workingHoursEnd: window.end,
      hasWorkingHours,
      unavailablePeriods,
    }));

/** Generate appointment that fits within 0-24h */
const appointmentArb = (staffIds: string[], chairIds: string[]) =>
  fc
    .record({
      staffIdx: fc.integer({ min: 0, max: Math.max(0, staffIds.length - 1) }),
      chairIdx: fc.integer({ min: 0, max: Math.max(0, chairIds.length - 1) }),
      startHour: fc.integer({ min: 0, max: 22 }),
      startMin: fc.constantFrom(0, 15, 30, 45),
      durationMin: fc.integer({ min: 15, max: 120 }),
    })
    .map(({ staffIdx, chairIdx, startHour, startMin, durationMin }) => {
      const endMinTotal = startHour * 60 + startMin + durationMin;
      const endHour = Math.min(Math.floor(endMinTotal / 60), 23);
      const endMin = endMinTotal >= 23 * 60 ? 59 : endMinTotal % 60;
      return {
        staffId: staffIds[staffIdx] || staffIds[0],
        chairId: chairIds[chairIdx] || chairIds[0],
        startHour,
        startMin,
        endHour,
        endMin,
      };
    })
    .filter(
      (a) =>
        a.startHour * 60 + a.startMin < a.endHour * 60 + a.endMin,
    );

/** Generate full salon scenario */
const scenarioArb = fc
  .record({
    staffCount: fc.integer({ min: 1, max: 3 }),
    chairCount: fc.integer({ min: 1, max: 3 }),
    durationMin: fc.integer({ min: 15, max: 90 }),
    bufferMin: fc.integer({ min: 0, max: 30 }),
    isHoliday: fc.boolean(),
    appointmentCount: fc.integer({ min: 0, max: 4 }),
    useEquipment: fc.boolean(),
  })
  .chain(({ staffCount, chairCount, durationMin, bufferMin, isHoliday, appointmentCount, useEquipment }) => {
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
      .map(({ staff, chairs, appointments }) => {
        const requiredEquipmentIds = useEquipment ? ['eq-1'] : [];
        const chairEquipment = new Map<string, string[]>();
        // If equipment is required, give it to all chairs (to focus on time-based availability)
        if (useEquipment) {
          for (const chair of chairs) {
            chairEquipment.set(chair.id, ['eq-1']);
          }
        }

        return {
          salonId: SALON_ID,
          serviceId: SERVICE_ID,
          durationMin,
          bufferMin,
          staff: staff as StaffScenario[],
          chairs: chairs as ChairScenario[],
          appointments,
          isHoliday,
          date: DATE,
          weekday: WEEKDAY,
          requiredEquipmentIds,
          chairEquipment,
        } as SalonScenario;
      });
  });

// --- Mock Prisma Builder ---

function buildMockPrisma(scenario: SalonScenario) {
  const {
    salonId,
    serviceId,
    durationMin,
    bufferMin,
    staff,
    chairs,
    appointments,
    isHoliday,
    date,
    weekday,
    requiredEquipmentIds,
    chairEquipment,
  } = scenario;

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
    serviceStaff: staff.map((s) => ({ serviceId, staffMemberId: s.id })),
    serviceEquipment: requiredEquipmentIds.map((eqId) => ({ serviceId, equipmentId: eqId })),
  };

  // Staff members (all active)
  const staffMembers = staff.map((s) => ({
    id: s.id,
    salonId,
    fullName: `Staff ${s.id}`,
    role: 'Stylist',
    active: true,
  }));

  // Working hours for staff (on target weekday)
  const staffWorkingHours = staff
    .filter((s) => s.hasWorkingHours)
    .map((s) => ({
      id: `wh-${s.id}`,
      ownerKind: 'staff',
      ownerId: s.id,
      weekday,
      startTime: timeDate(s.workingHoursStart, 0),
      endTime: timeDate(s.workingHoursEnd, 0),
    }));

  // Days off
  const daysOff = staff
    .filter((s) => s.isDayOff)
    .map((s) => ({
      id: `do-${s.id}`,
      staffMemberId: s.id,
      onDate: new Date(`${date}T00:00:00Z`),
    }));

  // Chairs (all active)
  const chairModels = chairs.map((c) => ({
    id: c.id,
    salonId,
    name: `Chair ${c.id}`,
    active: true,
    chairEquipment: (chairEquipment.get(c.id) ?? []).map((eqId) => ({
      chairId: c.id,
      equipmentId: eqId,
    })),
  }));

  // Working hours for chairs (on target weekday)
  const chairWorkingHoursData = chairs
    .filter((c) => c.hasWorkingHours)
    .map((c) => ({
      id: `wh-${c.id}`,
      ownerKind: 'chair',
      ownerId: c.id,
      weekday,
      startTime: timeDate(c.workingHoursStart, 0),
      endTime: timeDate(c.workingHoursEnd, 0),
    }));

  // Chair unavailability
  const chairUnavailableData = chairs.flatMap((c) =>
    c.unavailablePeriods.map((p, idx) => ({
      id: `cu-${c.id}-${idx}`,
      chairId: c.id,
      periodStart: new Date(`${date}T${String(p.startHour).padStart(2, '0')}:00:00.000Z`),
      periodEnd: new Date(`${date}T${String(p.endHour).padStart(2, '0')}:00:00.000Z`),
    })),
  );

  // Existing appointments
  const appointmentModels = appointments.map((a, idx) => ({
    id: `appt-${idx}`,
    salonId,
    staffMemberId: a.staffId,
    chairId: a.chairId,
    startAt: new Date(
      `${date}T${String(a.startHour).padStart(2, '0')}:${String(a.startMin).padStart(2, '0')}:00.000Z`,
    ),
    endAt: new Date(
      `${date}T${String(a.endHour).padStart(2, '0')}:${String(a.endMin).padStart(2, '0')}:00.000Z`,
    ),
    status: 'confirmed',
  }));

  // Build mock with tracked calls to working hours (first call = staff, second = chairs)
  let workingHoursCallCount = 0;

  const prisma = {
    service: {
      findUnique: jest.fn().mockResolvedValue(service),
    },
    holiday: {
      findFirst: jest.fn().mockResolvedValue(
        isHoliday ? { id: 'h-1', salonId, onDate: new Date(`${date}T00:00:00Z`) } : null,
      ),
      findMany: jest.fn().mockResolvedValue(
        isHoliday ? [{ id: 'h-1', salonId, onDate: new Date(`${date}T00:00:00Z`) }] : [],
      ),
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
      findMany: jest.fn().mockResolvedValue(appointmentModels),
    },
  } as any;

  return prisma;
}

// --- Verification helpers ---

/**
 * Given a scenario and a returned slot, verify that at least one qualified staff member
 * has working hours covering the slot AND has no overlapping appointment.
 */
function hasQualifiedFreeStaff(scenario: SalonScenario, slotStart: Date, slotEnd: Date): boolean {
  const slotInterval = { start: slotStart, end: slotEnd };

  for (const s of scenario.staff) {
    // Must have working hours
    if (!s.hasWorkingHours) continue;
    // Must not be on day off
    if (s.isDayOff) continue;

    // Working hours must contain the slot
    const whStart = timeToAbsolute(timeDate(s.workingHoursStart, 0), scenario.date);
    const whEnd = timeToAbsolute(timeDate(s.workingHoursEnd, 0), scenario.date);
    if (slotStart < whStart || slotEnd > whEnd) continue;

    // Must not have overlapping appointments
    const staffAppts = scenario.appointments.filter((a) => a.staffId === s.id);
    const hasOverlap = staffAppts.some((a) => {
      const apptStart = new Date(
        `${scenario.date}T${String(a.startHour).padStart(2, '0')}:${String(a.startMin).padStart(2, '0')}:00.000Z`,
      );
      const apptEnd = new Date(
        `${scenario.date}T${String(a.endHour).padStart(2, '0')}:${String(a.endMin).padStart(2, '0')}:00.000Z`,
      );
      return intervalsOverlap(slotInterval, { start: apptStart, end: apptEnd });
    });

    if (!hasOverlap) return true;
  }
  return false;
}

/**
 * Given a scenario and a returned slot, verify that at least one compatible chair
 * has working hours covering the slot AND has no overlapping appointment or unavailability.
 */
function hasCompatibleFreeChair(scenario: SalonScenario, slotStart: Date, slotEnd: Date): boolean {
  const slotInterval = { start: slotStart, end: slotEnd };

  for (const c of scenario.chairs) {
    // Must have working hours
    if (!c.hasWorkingHours) continue;

    // If equipment is required, the chair must have it
    if (scenario.requiredEquipmentIds.length > 0) {
      const chairEq = scenario.chairEquipment.get(c.id) ?? [];
      const hasAll = scenario.requiredEquipmentIds.every((eqId) => chairEq.includes(eqId));
      if (!hasAll) continue;
    }

    // Working hours must contain the slot
    const whStart = timeToAbsolute(timeDate(c.workingHoursStart, 0), scenario.date);
    const whEnd = timeToAbsolute(timeDate(c.workingHoursEnd, 0), scenario.date);
    if (slotStart < whStart || slotEnd > whEnd) continue;

    // Must not be in an unavailability period
    const isUnavailable = c.unavailablePeriods.some((p) => {
      const pStart = new Date(
        `${scenario.date}T${String(p.startHour).padStart(2, '0')}:00:00.000Z`,
      );
      const pEnd = new Date(
        `${scenario.date}T${String(p.endHour).padStart(2, '0')}:00:00.000Z`,
      );
      return intervalsOverlap(slotInterval, { start: pStart, end: pEnd });
    });
    if (isUnavailable) continue;

    // Must not have overlapping appointments
    const chairAppts = scenario.appointments.filter((a) => a.chairId === c.id);
    const hasOverlap = chairAppts.some((a) => {
      const apptStart = new Date(
        `${scenario.date}T${String(a.startHour).padStart(2, '0')}:${String(a.startMin).padStart(2, '0')}:00.000Z`,
      );
      const apptEnd = new Date(
        `${scenario.date}T${String(a.endHour).padStart(2, '0')}:${String(a.endMin).padStart(2, '0')}:00.000Z`,
      );
      return intervalsOverlap(slotInterval, { start: apptStart, end: apptEnd });
    });

    if (!hasOverlap) return true;
  }
  return false;
}

/**
 * Check if any (staff, chair) pair could possibly be free on this date.
 * If no pair can be free, the result should be empty.
 */
function hasAnyPossibleFreeSlot(scenario: SalonScenario): boolean {
  if (scenario.isHoliday) return false;

  // Check if any staff has working hours and is not on day off
  const availableStaff = scenario.staff.filter((s) => s.hasWorkingHours && !s.isDayOff);
  if (availableStaff.length === 0) return false;

  // Check if any chair has working hours
  const availableChairs = scenario.chairs.filter((c) => {
    if (!c.hasWorkingHours) return false;
    if (scenario.requiredEquipmentIds.length > 0) {
      const chairEq = scenario.chairEquipment.get(c.id) ?? [];
      return scenario.requiredEquipmentIds.every((eqId) => chairEq.includes(eqId));
    }
    return true;
  });
  if (availableChairs.length === 0) return false;

  return true;
}

// --- Property Tests ---

describe('Property 3: Availability soundness', () => {
  it('every returned slot has at least one qualified free staff member within working hours (R8.1, R8.2, R4.4)', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const prisma = buildMockPrisma(scenario);
        const engine = new SchedulingEngine(prisma);

        const query: AvailabilityQuery = {
          salonId: scenario.salonId,
          serviceId: scenario.serviceId,
          date: scenario.date,
          granularityMinutes: 15,
        };

        const slots = await engine.getAvailability(query);

        for (const slot of slots) {
          const slotStart = new Date(slot.startAt);
          const slotEnd = new Date(slot.endAt);
          const hasFreeStaff = hasQualifiedFreeStaff(scenario, slotStart, slotEnd);
          if (!hasFreeStaff) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('every returned slot has at least one compatible free chair within working hours (R8.1, R8.3)', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const prisma = buildMockPrisma(scenario);
        const engine = new SchedulingEngine(prisma);

        const query: AvailabilityQuery = {
          salonId: scenario.salonId,
          serviceId: scenario.serviceId,
          date: scenario.date,
          granularityMinutes: 15,
        };

        const slots = await engine.getAvailability(query);

        for (const slot of slots) {
          const slotStart = new Date(slot.startAt);
          const slotEnd = new Date(slot.endAt);
          const hasFreeChair = hasCompatibleFreeChair(scenario, slotStart, slotEnd);
          if (!hasFreeChair) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('when all staff are on day off or the date is a holiday, result is empty (R8.4, R4.4, R4.5)', async () => {
    // Generate scenarios where all staff are on day off or it is a holiday
    const emptyScenarioArb = scenarioArb.map((scenario) => {
      // Either make it a holiday, or put all staff on day off
      const coin = scenario.isHoliday;
      if (coin) {
        return { ...scenario, isHoliday: true };
      }
      return {
        ...scenario,
        isHoliday: false,
        staff: scenario.staff.map((s) => ({ ...s, isDayOff: true })),
      };
    });

    await fc.assert(
      fc.asyncProperty(emptyScenarioArb, async (scenario) => {
        const prisma = buildMockPrisma(scenario);
        const engine = new SchedulingEngine(prisma);

        const query: AvailabilityQuery = {
          salonId: scenario.salonId,
          serviceId: scenario.serviceId,
          date: scenario.date,
          granularityMinutes: 15,
        };

        const slots = await engine.getAvailability(query);
        return slots.length === 0;
      }),
      { numRuns: 100 },
    );
  });

  it('every returned slot has duration equal to service duration + buffer (R5.2)', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const prisma = buildMockPrisma(scenario);
        const engine = new SchedulingEngine(prisma);

        const query: AvailabilityQuery = {
          salonId: scenario.salonId,
          serviceId: scenario.serviceId,
          date: scenario.date,
          granularityMinutes: 15,
        };

        const slots = await engine.getAvailability(query);
        const expectedDurationMs = (scenario.durationMin + scenario.bufferMin) * 60 * 1000;

        for (const slot of slots) {
          const start = new Date(slot.startAt);
          const end = new Date(slot.endAt);
          const durationMs = end.getTime() - start.getTime();
          if (durationMs !== expectedDurationMs) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('when no possible free pair exists (no available staff or chairs), result is empty (R8.4)', async () => {
    // Generate scenarios with no working hours for any staff
    const noStaffHoursArb = scenarioArb.map((scenario) => ({
      ...scenario,
      isHoliday: false,
      staff: scenario.staff.map((s) => ({ ...s, hasWorkingHours: false, isDayOff: false })),
    }));

    await fc.assert(
      fc.asyncProperty(noStaffHoursArb, async (scenario) => {
        const prisma = buildMockPrisma(scenario);
        const engine = new SchedulingEngine(prisma);

        const query: AvailabilityQuery = {
          salonId: scenario.salonId,
          serviceId: scenario.serviceId,
          date: scenario.date,
          granularityMinutes: 15,
        };

        const slots = await engine.getAvailability(query);
        return slots.length === 0;
      }),
      { numRuns: 100 },
    );
  });
});
