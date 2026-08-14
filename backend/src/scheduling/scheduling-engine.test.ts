import { SchedulingEngine } from './scheduling-engine';
import type { AvailabilityQuery } from './scheduling-engine';

/**
 * Unit tests for SchedulingEngine.getAvailability
 *
 * Uses a mocked PrismaClient to test the availability algorithm in isolation.
 * Requirements: R4.4, R4.5, R6.2, R6.3, R8.1, R8.2, R8.3, R8.4
 */

// Helper to create a time-only Date (as Prisma stores @db.Time at epoch)
function timeDate(hours: number, minutes: number): Date {
  const d = new Date('1970-01-01T00:00:00.000Z');
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

// Helper to create a mock PrismaClient
function createMockPrisma(overrides: Record<string, any> = {}) {
  return {
    service: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    holiday: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffMember: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    workingHours: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    dayOff: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    chair: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    chairUnavailable: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    appointment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as any;
}

// Standard test data
const SALON_ID = 'salon-1';
const SERVICE_ID = 'service-1';
const STAFF_ID = 'staff-1';
const CHAIR_ID = 'chair-1';
const DATE = '2024-03-15'; // Friday (day 5)

function standardService() {
  return {
    id: SERVICE_ID,
    salonId: SALON_ID,
    name: 'Haircut',
    durationMin: 30,
    bufferMin: 15,
    priceRial: BigInt(500000),
    requiresDeposit: false,
    depositRial: null,
    serviceStaff: [{ serviceId: SERVICE_ID, staffMemberId: STAFF_ID }],
    serviceEquipment: [],
  };
}

function standardStaff() {
  return [{ id: STAFF_ID, salonId: SALON_ID, fullName: 'Ali', role: 'Stylist', active: true }];
}

function standardChair() {
  return [{ id: CHAIR_ID, salonId: SALON_ID, name: 'Chair A', active: true, chairEquipment: [] }];
}

// Friday = weekday 5
function staffWorkingHoursForDay() {
  return [
    {
      id: 'wh-1',
      ownerKind: 'staff',
      ownerId: STAFF_ID,
      weekday: 5, // Friday
      startTime: timeDate(9, 0),
      endTime: timeDate(17, 0),
    },
  ];
}

function chairWorkingHoursForDay() {
  return [
    {
      id: 'wh-2',
      ownerKind: 'chair',
      ownerId: CHAIR_ID,
      weekday: 5, // Friday
      startTime: timeDate(9, 0),
      endTime: timeDate(17, 0),
    },
  ];
}

describe('SchedulingEngine.getAvailability', () => {
  it('returns no slots beyond a today-only booking horizon', async () => {
    const prisma = createMockPrisma({
      salon: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ timezone: 'Asia/Tehran', bookingWindowDays: 0 }),
      },
    });
    const engine = new SchedulingEngine(prisma);
    const slots = await engine.getAvailability({
      salonId: SALON_ID,
      serviceId: SERVICE_ID,
      date: '2099-01-01',
    });
    expect(slots).toEqual([]);
    expect(prisma.service.findUnique).not.toHaveBeenCalled();
  });

  describe('basic slot generation (R8.1)', () => {
    it('returns slots when staff and chair are both free', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(standardService());
      prisma.staffMember.findMany.mockResolvedValue(standardStaff());
      prisma.chair.findMany.mockResolvedValue(standardChair());

      // Working hours calls: first for staff, second for chairs
      prisma.workingHours.findMany
        .mockResolvedValueOnce(staffWorkingHoursForDay())
        .mockResolvedValueOnce(chairWorkingHoursForDay());

      const engine = new SchedulingEngine(prisma);
      const query: AvailabilityQuery = {
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
        granularityMinutes: 15,
      };

      const slots = await engine.getAvailability(query);

      // With 9:00-17:00 window, 30min+15min=45min occupancy, 15min granularity
      // Last valid start: 16:15 (16:15 + 45min = 17:00)
      // From 9:00 to 16:15 at 15min steps: (16:15 - 9:00) / 15min + 1 = 29 + 1 = 30 candidates
      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0].startAt).toBe('2024-03-15T09:00:00.000Z');

      // Each slot should have correct duration
      for (const slot of slots) {
        const start = new Date(slot.startAt);
        const end = new Date(slot.endAt);
        const durationMs = end.getTime() - start.getTime();
        expect(durationMs).toBe(45 * 60 * 1000); // 30 + 15 = 45 minutes
      }
    });

    it('carves out a stylist partial-day block (hour-range) from availability', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(standardService());
      prisma.staffMember.findMany.mockResolvedValue(standardStaff());
      prisma.chair.findMany.mockResolvedValue(standardChair());
      prisma.workingHours.findMany
        .mockResolvedValueOnce(staffWorkingHoursForDay())
        .mockResolvedValueOnce(chairWorkingHoursForDay());
      // The stylist blocked 12:00–13:00 for themselves (partial day-off).
      prisma.dayOff.findMany.mockResolvedValue([
        { staffMemberId: STAFF_ID, startTime: timeDate(12, 0), endTime: timeDate(13, 0) },
      ]);

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
        granularityMinutes: 15,
      });

      const blockStart = new Date('2024-03-15T12:00:00.000Z').getTime();
      const blockEnd = new Date('2024-03-15T13:00:00.000Z').getTime();
      // No emitted slot may overlap the blocked window.
      for (const slot of slots) {
        const s = new Date(slot.startAt).getTime();
        const e = new Date(slot.endAt).getTime();
        expect(s < blockEnd && e > blockStart).toBe(false);
      }
      // Sanity: availability still exists outside the block (the 9:00 opener).
      expect(slots.some((sl) => sl.startAt === '2024-03-15T09:00:00.000Z')).toBe(true);
    });

    it('removes a stylist entirely on a full-day block (no time window)', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(standardService());
      prisma.staffMember.findMany.mockResolvedValue(standardStaff());
      prisma.chair.findMany.mockResolvedValue(standardChair());
      prisma.workingHours.findMany
        .mockResolvedValueOnce(staffWorkingHoursForDay())
        .mockResolvedValueOnce(chairWorkingHoursForDay());
      prisma.dayOff.findMany.mockResolvedValue([
        { staffMemberId: STAFF_ID, startTime: null, endTime: null },
      ]);

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
        granularityMinutes: 15,
      });
      // The only qualified stylist is fully off → no availability.
      expect(slots).toEqual([]);
    });

    it('returns slots at correct granularity (30 min)', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(standardService());
      prisma.staffMember.findMany.mockResolvedValue(standardStaff());
      prisma.chair.findMany.mockResolvedValue(standardChair());
      prisma.workingHours.findMany
        .mockResolvedValueOnce(staffWorkingHoursForDay())
        .mockResolvedValueOnce(chairWorkingHoursForDay());

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
        granularityMinutes: 30,
      });

      // Verify 30-min spacing between consecutive slots
      for (let i = 1; i < slots.length; i++) {
        const prev = new Date(slots[i - 1].startAt);
        const curr = new Date(slots[i].startAt);
        expect(curr.getTime() - prev.getTime()).toBe(30 * 60 * 1000);
      }
    });

    it('uses the assigned mobile lane for customer-location availability', async () => {
      const target = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      target.setUTCHours(0, 0, 0, 0);
      const date = target.toISOString().slice(0, 10);
      const weekday = target.getUTCDay();
      const prisma = createMockPrisma({
        salon: {
          findUnique: jest.fn().mockResolvedValue({
            timezone: 'UTC',
            bookingWindowDays: 30,
            active: true,
            workMode: 'mobile',
          }),
        },
      });
      prisma.service.findUnique.mockResolvedValue(standardService());
      prisma.staffMember.findMany.mockResolvedValue(standardStaff());
      prisma.chair.findMany.mockResolvedValue([
        {
          id: CHAIR_ID,
          salonId: SALON_ID,
          name: 'Mobile lane',
          active: true,
          kind: 'mobile',
          assignedStaff: null,
          mobileStaff: { id: STAFF_ID },
          chairEquipment: [],
        },
      ]);
      prisma.workingHours.findMany
        .mockResolvedValueOnce([
          {
            ownerKind: 'staff',
            ownerId: STAFF_ID,
            weekday,
            startTime: timeDate(9, 0),
            endTime: timeDate(17, 0),
          },
        ])
        .mockResolvedValueOnce([
          {
            ownerKind: 'chair',
            ownerId: CHAIR_ID,
            weekday,
            startTime: timeDate(9, 0),
            endTime: timeDate(17, 0),
          },
        ]);

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date,
        locationType: 'customer',
      });

      expect(slots.length).toBeGreaterThan(0);
    });
  });

  describe('empty results (R8.4)', () => {
    it('returns empty when service not found', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(null);

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: 'nonexistent',
        date: DATE,
      });

      expect(slots).toEqual([]);
    });

    it('returns empty when service belongs to different salon', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue({
        ...standardService(),
        salonId: 'other-salon',
      });

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
      });

      expect(slots).toEqual([]);
    });

    it('returns empty when no staff can perform service', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue({
        ...standardService(),
        serviceStaff: [],
      });

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
      });

      expect(slots).toEqual([]);
    });

    it('returns empty when no active staff found', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(standardService());
      prisma.staffMember.findMany.mockResolvedValue([]); // No active staff

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
      });

      expect(slots).toEqual([]);
    });
  });

  describe('holiday exclusion (R4.5)', () => {
    it('returns empty on a salon holiday', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(standardService());
      prisma.holiday.findFirst.mockResolvedValue({
        id: 'h-1',
        salonId: SALON_ID,
        onDate: new Date('2024-03-15'),
      });

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
      });

      expect(slots).toEqual([]);
    });
  });

  describe('staff working hours exclusion (R4.4)', () => {
    it('returns empty when no staff has working hours on target day', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(standardService());
      prisma.staffMember.findMany.mockResolvedValue(standardStaff());
      prisma.workingHours.findMany.mockResolvedValue([]); // No hours for the day

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
      });

      expect(slots).toEqual([]);
    });
  });

  describe('day off exclusion (R4.4)', () => {
    it('returns empty when all qualified staff are on day off', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(standardService());
      prisma.staffMember.findMany.mockResolvedValue(standardStaff());
      prisma.workingHours.findMany.mockResolvedValueOnce(staffWorkingHoursForDay());
      prisma.dayOff.findMany.mockResolvedValue([
        { id: 'do-1', staffMemberId: STAFF_ID, onDate: new Date('2024-03-15') },
      ]);

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
      });

      expect(slots).toEqual([]);
    });
  });

  describe('chair working hours exclusion', () => {
    it('returns empty when no chair has working hours on target day', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(standardService());
      prisma.staffMember.findMany.mockResolvedValue(standardStaff());
      prisma.chair.findMany.mockResolvedValue(standardChair());
      prisma.workingHours.findMany
        .mockResolvedValueOnce(staffWorkingHoursForDay())
        .mockResolvedValueOnce([]); // No chair hours

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
      });

      expect(slots).toEqual([]);
    });
  });

  describe('equipment filtering (R6.3)', () => {
    it('returns empty when no chair has required equipment', async () => {
      const serviceWithEquipment = {
        ...standardService(),
        serviceEquipment: [{ serviceId: SERVICE_ID, equipmentId: 'eq-1' }],
      };

      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(serviceWithEquipment);
      prisma.staffMember.findMany.mockResolvedValue(standardStaff());
      prisma.workingHours.findMany.mockResolvedValueOnce(staffWorkingHoursForDay());

      // Chairs without the required equipment
      prisma.chair.findMany.mockResolvedValue([
        { id: CHAIR_ID, salonId: SALON_ID, name: 'Chair A', active: true, chairEquipment: [] },
      ]);

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
      });

      expect(slots).toEqual([]);
    });

    it('returns slots when chair has all required equipment', async () => {
      const serviceWithEquipment = {
        ...standardService(),
        serviceEquipment: [{ serviceId: SERVICE_ID, equipmentId: 'eq-1' }],
      };

      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(serviceWithEquipment);
      prisma.staffMember.findMany.mockResolvedValue(standardStaff());

      // Chair with the required equipment
      prisma.chair.findMany.mockResolvedValue([
        {
          id: CHAIR_ID,
          salonId: SALON_ID,
          name: 'Chair A',
          active: true,
          chairEquipment: [{ chairId: CHAIR_ID, equipmentId: 'eq-1' }],
        },
      ]);

      prisma.workingHours.findMany
        .mockResolvedValueOnce(staffWorkingHoursForDay())
        .mockResolvedValueOnce(chairWorkingHoursForDay());

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
      });

      expect(slots.length).toBeGreaterThan(0);
    });
  });

  describe('existing appointments - staff busy (R8.2)', () => {
    it('excludes slots where all qualified staff are busy', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(standardService());
      prisma.staffMember.findMany.mockResolvedValue(standardStaff());
      prisma.chair.findMany.mockResolvedValue(standardChair());
      prisma.workingHours.findMany
        .mockResolvedValueOnce(staffWorkingHoursForDay())
        .mockResolvedValueOnce(chairWorkingHoursForDay());

      // Staff has an appointment from 10:00 to 11:00
      prisma.appointment.findMany.mockResolvedValue([
        {
          id: 'appt-1',
          salonId: SALON_ID,
          staffMemberId: STAFF_ID,
          chairId: 'other-chair',
          startAt: new Date('2024-03-15T10:00:00Z'),
          endAt: new Date('2024-03-15T11:00:00Z'),
          status: 'confirmed',
        },
      ]);

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
        granularityMinutes: 15,
      });

      // No slot should overlap with 10:00-11:00 for this single-staff scenario
      for (const slot of slots) {
        const slotStart = new Date(slot.startAt);
        const slotEnd = new Date(slot.endAt);

        // The slot [slotStart, slotEnd) should NOT overlap [10:00, 11:00)
        const apptStart = new Date('2024-03-15T10:00:00Z');
        const apptEnd = new Date('2024-03-15T11:00:00Z');
        const overlaps = slotStart < apptEnd && apptStart < slotEnd;
        expect(overlaps).toBe(false);
      }
    });
  });

  describe('existing appointments - chair busy (R8.3)', () => {
    it('excludes slots where all compatible chairs are busy', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(standardService());
      prisma.staffMember.findMany.mockResolvedValue(standardStaff());
      prisma.chair.findMany.mockResolvedValue(standardChair());
      prisma.workingHours.findMany
        .mockResolvedValueOnce(staffWorkingHoursForDay())
        .mockResolvedValueOnce(chairWorkingHoursForDay());

      // Chair has an appointment from 14:00 to 15:00
      prisma.appointment.findMany.mockResolvedValue([
        {
          id: 'appt-2',
          salonId: SALON_ID,
          staffMemberId: 'other-staff',
          chairId: CHAIR_ID,
          startAt: new Date('2024-03-15T14:00:00Z'),
          endAt: new Date('2024-03-15T15:00:00Z'),
          status: 'held',
        },
      ]);

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
        granularityMinutes: 15,
      });

      // No slot should overlap with 14:00-15:00 for this single-chair scenario
      for (const slot of slots) {
        const slotStart = new Date(slot.startAt);
        const slotEnd = new Date(slot.endAt);

        const apptStart = new Date('2024-03-15T14:00:00Z');
        const apptEnd = new Date('2024-03-15T15:00:00Z');
        const overlaps = slotStart < apptEnd && apptStart < slotEnd;
        expect(overlaps).toBe(false);
      }
    });
  });

  describe('chair unavailability filtering', () => {
    it('excludes slots during chair unavailability period', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(standardService());
      prisma.staffMember.findMany.mockResolvedValue(standardStaff());
      prisma.chair.findMany.mockResolvedValue(standardChair());
      prisma.workingHours.findMany
        .mockResolvedValueOnce(staffWorkingHoursForDay())
        .mockResolvedValueOnce(chairWorkingHoursForDay());

      // Chair unavailable from 11:00 to 12:00
      prisma.chairUnavailable.findMany.mockResolvedValue([
        {
          id: 'cu-1',
          chairId: CHAIR_ID,
          periodStart: new Date('2024-03-15T11:00:00Z'),
          periodEnd: new Date('2024-03-15T12:00:00Z'),
        },
      ]);

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
        granularityMinutes: 15,
      });

      // No slot should overlap with 11:00-12:00 for this single-chair scenario
      for (const slot of slots) {
        const slotStart = new Date(slot.startAt);
        const slotEnd = new Date(slot.endAt);

        const unavailStart = new Date('2024-03-15T11:00:00Z');
        const unavailEnd = new Date('2024-03-15T12:00:00Z');
        const overlaps = slotStart < unavailEnd && unavailStart < slotEnd;
        expect(overlaps).toBe(false);
      }
    });
  });

  describe('multiple staff and chairs', () => {
    it('returns slots when one of multiple staff is busy but another is free', async () => {
      const staff2Id = 'staff-2';
      const service = {
        ...standardService(),
        serviceStaff: [
          { serviceId: SERVICE_ID, staffMemberId: STAFF_ID },
          { serviceId: SERVICE_ID, staffMemberId: staff2Id },
        ],
      };

      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(service);
      prisma.staffMember.findMany.mockResolvedValue([
        ...standardStaff(),
        { id: staff2Id, salonId: SALON_ID, fullName: 'Sara', role: 'Stylist', active: true },
      ]);
      prisma.chair.findMany.mockResolvedValue(standardChair());

      prisma.workingHours.findMany
        .mockResolvedValueOnce([
          ...staffWorkingHoursForDay(),
          {
            id: 'wh-3',
            ownerKind: 'staff',
            ownerId: staff2Id,
            weekday: 5,
            startTime: timeDate(9, 0),
            endTime: timeDate(17, 0),
          },
        ])
        .mockResolvedValueOnce(chairWorkingHoursForDay());

      // Staff-1 has an appointment from 10:00 to 11:00, but Staff-2 is free
      prisma.appointment.findMany.mockResolvedValue([
        {
          id: 'appt-1',
          salonId: SALON_ID,
          staffMemberId: STAFF_ID,
          chairId: 'other-chair',
          startAt: new Date('2024-03-15T10:00:00Z'),
          endAt: new Date('2024-03-15T11:00:00Z'),
          status: 'confirmed',
        },
      ]);

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
        granularityMinutes: 15,
      });

      // Should still have slots during 10:00-11:00 because staff-2 is free
      const slotAt10 = slots.find((s) => s.startAt === '2024-03-15T10:00:00.000Z');
      expect(slotAt10).toBeDefined();
    });
  });

  describe('default granularity', () => {
    it('defaults to 15-minute granularity when not specified', async () => {
      const prisma = createMockPrisma();
      prisma.service.findUnique.mockResolvedValue(standardService());
      prisma.staffMember.findMany.mockResolvedValue(standardStaff());
      prisma.chair.findMany.mockResolvedValue(standardChair());
      prisma.workingHours.findMany
        .mockResolvedValueOnce(staffWorkingHoursForDay())
        .mockResolvedValueOnce(chairWorkingHoursForDay());

      const engine = new SchedulingEngine(prisma);
      const slots = await engine.getAvailability({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        date: DATE,
        // no granularityMinutes specified
      });

      // Verify 15-min spacing between consecutive slots
      expect(slots.length).toBeGreaterThan(1);
      const first = new Date(slots[0].startAt);
      const second = new Date(slots[1].startAt);
      expect(second.getTime() - first.getTime()).toBe(15 * 60 * 1000);
    });
  });
});

describe('SchedulingEngine.reschedule', () => {
  const appointment = {
    id: 'appt-1',
    salonId: SALON_ID,
    customerId: 'customer-1',
    staffMemberId: STAFF_ID,
    chairId: CHAIR_ID,
    serviceId: SERVICE_ID,
    startAt: new Date('2024-03-15T10:00:00.000Z'),
    endAt: new Date('2024-03-15T10:45:00.000Z'),
    status: 'confirmed',
  };

  function reschedulePrisma() {
    const prisma = createMockPrisma({
      salon: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Tehran' }) },
    });
    prisma.appointment.findUnique = jest.fn().mockResolvedValue(appointment);
    prisma.appointment.update = jest.fn().mockResolvedValue({
      ...appointment,
      startAt: new Date('2024-03-15T11:00:00.000Z'),
      endAt: new Date('2024-03-15T11:45:00.000Z'),
    });
    prisma.service.findUnique.mockResolvedValue(standardService());
    prisma.staffMember.findUnique = jest.fn().mockResolvedValue(standardStaff()[0]);
    prisma.chair.findUnique = jest
      .fn()
      .mockResolvedValue({ ...standardChair()[0], chairEquipment: [] });
    prisma.workingHours.findMany.mockResolvedValue(staffWorkingHoursForDay());
    prisma.appointment.findMany.mockResolvedValue([]);
    return prisma;
  }

  it('updates the existing row after validating the current resource pair', async () => {
    const prisma = reschedulePrisma();
    const engine = new SchedulingEngine(prisma);

    const result = await engine.reschedule({
      appointmentId: 'appt-1',
      startAt: '2024-03-15T11:00:00.000Z',
    });

    expect(result.startAt).toEqual(new Date('2024-03-15T11:00:00.000Z'));
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appt-1' },
      data: {
        startAt: new Date('2024-03-15T11:00:00.000Z'),
        endAt: new Date('2024-03-15T11:45:00.000Z'),
        staffMemberId: STAFF_ID,
        chairId: CHAIR_ID,
      },
    });
  });

  it('rejects a move that collides with another active appointment', async () => {
    const prisma = reschedulePrisma();
    prisma.appointment.findMany.mockResolvedValue([{ id: 'appt-2' }]);
    const engine = new SchedulingEngine(prisma);

    await expect(
      engine.reschedule({ appointmentId: 'appt-1', startAt: '2024-03-15T11:00:00.000Z' }),
    ).rejects.toMatchObject({ code: 'RESCHEDULE_CONFLICT' });
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('rejects a move into a full-day closure', async () => {
    const prisma = reschedulePrisma();
    prisma.holiday.findMany.mockResolvedValue([{ startTime: null, endTime: null }]);
    const engine = new SchedulingEngine(prisma);

    await expect(
      engine.reschedule({ appointmentId: 'appt-1', startAt: '2024-03-15T11:00:00.000Z' }),
    ).rejects.toMatchObject({ code: 'RESCHEDULE_CLOSED' });
  });
});


describe('SchedulingEngine.book', () => {
  // Helper to create a mock PrismaClient with booking defaults
  function createBookingMockPrisma(overrides: Record<string, any> = {}) {
    return {
      service: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      holiday: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      staffMember: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      workingHours: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      dayOff: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      chair: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      chairUnavailable: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(null),
      },
      ...overrides,
    } as any;
  }

  const SALON_ID = 'salon-1';
  const SERVICE_ID = 'service-1';
  const STAFF_ID = 'staff-1';
  const CHAIR_ID = 'chair-1';
  const CUSTOMER_ID = 'customer-1';
  const START_AT = '2024-03-15T10:00:00.000Z'; // Friday

  function setupFullBookingMock(prisma: any) {
    prisma.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      salonId: SALON_ID,
      name: 'Haircut',
      durationMin: 30,
      bufferMin: 15,
      priceRial: BigInt(500000),
      requiresDeposit: false,
      depositRial: null,
      serviceStaff: [{ serviceId: SERVICE_ID, staffMemberId: STAFF_ID }],
      serviceEquipment: [],
    });

    prisma.staffMember.findMany.mockResolvedValue([
      { id: STAFF_ID, salonId: SALON_ID, fullName: 'Ali', role: 'Stylist', active: true },
    ]);

    prisma.chair.findMany.mockResolvedValue([
      { id: CHAIR_ID, salonId: SALON_ID, name: 'Chair A', active: true, chairEquipment: [] },
    ]);

    prisma.workingHours.findMany
      .mockResolvedValueOnce([
        {
          id: 'wh-1',
          ownerKind: 'staff',
          ownerId: STAFF_ID,
          weekday: 5, // Friday
          startTime: timeDate(9, 0),
          endTime: timeDate(17, 0),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'wh-2',
          ownerKind: 'chair',
          ownerId: CHAIR_ID,
          weekday: 5, // Friday
          startTime: timeDate(9, 0),
          endTime: timeDate(17, 0),
        },
      ]);

    const createdAppointment = {
      id: 'appt-new-1',
      salonId: SALON_ID,
      customerId: CUSTOMER_ID,
      staffMemberId: STAFF_ID,
      chairId: CHAIR_ID,
      serviceId: SERVICE_ID,
      startAt: new Date(START_AT),
      endAt: new Date('2024-03-15T10:45:00.000Z'),
      status: 'pending',
      source: 'web',
      holdExpiresAt: null,
      createdAt: new Date(),
    };
    prisma.appointment.create.mockResolvedValue(createdAppointment);

    return createdAppointment;
  }

  describe('successful booking (R9.1, R9.7)', () => {
    it('confirms a booking when staff and chair are available', async () => {
      const prisma = createBookingMockPrisma();
      const expectedAppt = setupFullBookingMock(prisma);

      const engine = new SchedulingEngine(prisma);
      const result = await engine.book({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        startAt: START_AT,
        customerId: CUSTOMER_ID,
        source: 'web',
      });

      expect(result.status).toBe('pending');
      if (result.status === 'pending') {
        expect(result.appointment).toEqual(expectedAppt);
      }

      // Verify appointment was created with correct data
      expect(prisma.appointment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          salonId: SALON_ID,
          customerId: CUSTOMER_ID,
          staffMemberId: STAFF_ID,
          chairId: CHAIR_ID,
          serviceId: SERVICE_ID,
          status: 'pending',
          source: 'web',
        }),
      });
    });

    it('includes correct start and end times (duration + buffer)', async () => {
      const prisma = createBookingMockPrisma();
      setupFullBookingMock(prisma);

      const engine = new SchedulingEngine(prisma);
      await engine.book({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        startAt: START_AT,
        customerId: CUSTOMER_ID,
        source: 'web',
      });

      const createCall = prisma.appointment.create.mock.calls[0][0];
      const startAt = createCall.data.startAt as Date;
      const endAt = createCall.data.endAt as Date;

      expect(startAt.toISOString()).toBe('2024-03-15T10:00:00.000Z');
      // 30min duration + 15min buffer = 45min
      expect(endAt.toISOString()).toBe('2024-03-15T10:45:00.000Z');
    });
  });

  describe('walk-in bookings (R13.1)', () => {
    it('creates walk-in appointment with source=walkin', async () => {
      const prisma = createBookingMockPrisma();
      setupFullBookingMock(prisma);

      const engine = new SchedulingEngine(prisma);
      await engine.book({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        startAt: START_AT,
        customerId: CUSTOMER_ID,
        source: 'walkin',
      });

      expect(prisma.appointment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: 'walkin',
          status: 'pending',
        }),
      });
    });
  });

  describe('rejection - no availability (R9.2)', () => {
    it('rejects when service not found', async () => {
      const prisma = createBookingMockPrisma();
      prisma.service.findUnique.mockResolvedValue(null);

      const engine = new SchedulingEngine(prisma);
      const result = await engine.book({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        startAt: START_AT,
        customerId: CUSTOMER_ID,
        source: 'web',
      });

      expect(result).toEqual({ status: 'rejected', reason: 'no_availability' });
    });

    it('rejects when date is a salon holiday', async () => {
      const prisma = createBookingMockPrisma();
      prisma.service.findUnique.mockResolvedValue({
        id: SERVICE_ID,
        salonId: SALON_ID,
        name: 'Haircut',
        durationMin: 30,
        bufferMin: 15,
        priceRial: BigInt(500000),
        requiresDeposit: false,
        depositRial: null,
        serviceStaff: [{ serviceId: SERVICE_ID, staffMemberId: STAFF_ID }],
        serviceEquipment: [],
      });
      prisma.holiday.findFirst.mockResolvedValue({
        id: 'h-1',
        salonId: SALON_ID,
        onDate: new Date('2024-03-15'),
      });

      const engine = new SchedulingEngine(prisma);
      const result = await engine.book({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        startAt: START_AT,
        customerId: CUSTOMER_ID,
        source: 'web',
      });

      expect(result).toEqual({ status: 'rejected', reason: 'no_availability' });
    });

    it('rejects when no qualified staff are available', async () => {
      const prisma = createBookingMockPrisma();
      prisma.service.findUnique.mockResolvedValue({
        id: SERVICE_ID,
        salonId: SALON_ID,
        name: 'Haircut',
        durationMin: 30,
        bufferMin: 15,
        priceRial: BigInt(500000),
        requiresDeposit: false,
        depositRial: null,
        serviceStaff: [{ serviceId: SERVICE_ID, staffMemberId: STAFF_ID }],
        serviceEquipment: [],
      });
      prisma.staffMember.findMany.mockResolvedValue([
        { id: STAFF_ID, salonId: SALON_ID, fullName: 'Ali', role: 'Stylist', active: true },
      ]);
      // No working hours for the target day
      prisma.workingHours.findMany.mockResolvedValue([]);

      const engine = new SchedulingEngine(prisma);
      const result = await engine.book({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        startAt: START_AT,
        customerId: CUSTOMER_ID,
        source: 'web',
      });

      expect(result).toEqual({ status: 'rejected', reason: 'no_availability' });
    });

    it('rejects when all staff are busy at that time', async () => {
      const prisma = createBookingMockPrisma();
      prisma.service.findUnique.mockResolvedValue({
        id: SERVICE_ID,
        salonId: SALON_ID,
        name: 'Haircut',
        durationMin: 30,
        bufferMin: 15,
        priceRial: BigInt(500000),
        requiresDeposit: false,
        depositRial: null,
        serviceStaff: [{ serviceId: SERVICE_ID, staffMemberId: STAFF_ID }],
        serviceEquipment: [],
      });
      prisma.staffMember.findMany.mockResolvedValue([
        { id: STAFF_ID, salonId: SALON_ID, fullName: 'Ali', role: 'Stylist', active: true },
      ]);
      prisma.chair.findMany.mockResolvedValue([
        { id: CHAIR_ID, salonId: SALON_ID, name: 'Chair A', active: true, chairEquipment: [] },
      ]);
      prisma.workingHours.findMany
        .mockResolvedValueOnce([
          {
            id: 'wh-1', ownerKind: 'staff', ownerId: STAFF_ID, weekday: 5,
            startTime: timeDate(9, 0), endTime: timeDate(17, 0),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'wh-2', ownerKind: 'chair', ownerId: CHAIR_ID, weekday: 5,
            startTime: timeDate(9, 0), endTime: timeDate(17, 0),
          },
        ]);

      // Staff is busy during the requested slot
      prisma.appointment.findMany.mockResolvedValue([
        {
          id: 'appt-existing',
          salonId: SALON_ID,
          staffMemberId: STAFF_ID,
          chairId: 'other-chair',
          startAt: new Date('2024-03-15T09:30:00Z'),
          endAt: new Date('2024-03-15T10:30:00Z'),
          status: 'confirmed',
        },
      ]);

      const engine = new SchedulingEngine(prisma);
      const result = await engine.book({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        startAt: START_AT,
        customerId: CUSTOMER_ID,
        source: 'web',
      });

      expect(result).toEqual({ status: 'rejected', reason: 'no_availability' });
    });
  });

  describe('exclusion constraint retry (R9.5, R9.6)', () => {
    it('retries with next pair on exclusion violation and succeeds', async () => {
      const STAFF_2 = 'staff-2';
      const prisma = createBookingMockPrisma();

      prisma.service.findUnique.mockResolvedValue({
        id: SERVICE_ID,
        salonId: SALON_ID,
        name: 'Haircut',
        durationMin: 30,
        bufferMin: 15,
        priceRial: BigInt(500000),
        requiresDeposit: false,
        depositRial: null,
        serviceStaff: [
          { serviceId: SERVICE_ID, staffMemberId: STAFF_ID },
          { serviceId: SERVICE_ID, staffMemberId: STAFF_2 },
        ],
        serviceEquipment: [],
      });
      prisma.staffMember.findMany.mockResolvedValue([
        { id: STAFF_ID, salonId: SALON_ID, fullName: 'Ali', role: 'Stylist', active: true },
        { id: STAFF_2, salonId: SALON_ID, fullName: 'Sara', role: 'Stylist', active: true },
      ]);
      prisma.chair.findMany.mockResolvedValue([
        { id: CHAIR_ID, salonId: SALON_ID, name: 'Chair A', active: true, chairEquipment: [] },
      ]);
      prisma.workingHours.findMany
        .mockResolvedValueOnce([
          { id: 'wh-1', ownerKind: 'staff', ownerId: STAFF_ID, weekday: 5, startTime: timeDate(9, 0), endTime: timeDate(17, 0) },
          { id: 'wh-3', ownerKind: 'staff', ownerId: STAFF_2, weekday: 5, startTime: timeDate(9, 0), endTime: timeDate(17, 0) },
        ])
        .mockResolvedValueOnce([
          { id: 'wh-2', ownerKind: 'chair', ownerId: CHAIR_ID, weekday: 5, startTime: timeDate(9, 0), endTime: timeDate(17, 0) },
        ]);

      // First insert attempt fails (exclusion violation), second succeeds
      const exclusionError = { code: 'P2002', meta: { target: ['no_staff_overlap'] } };
      const successfulAppt = {
        id: 'appt-new',
        salonId: SALON_ID,
        customerId: CUSTOMER_ID,
        staffMemberId: STAFF_2,
        chairId: CHAIR_ID,
        serviceId: SERVICE_ID,
        startAt: new Date(START_AT),
        endAt: new Date('2024-03-15T10:45:00.000Z'),
        status: 'pending',
        source: 'web',
        holdExpiresAt: null,
        createdAt: new Date(),
      };
      prisma.appointment.create
        .mockRejectedValueOnce(exclusionError)
        .mockResolvedValueOnce(successfulAppt);

      const engine = new SchedulingEngine(prisma);
      const result = await engine.book({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        startAt: START_AT,
        customerId: CUSTOMER_ID,
        source: 'web',
      });

      expect(result.status).toBe('pending');
      expect(prisma.appointment.create).toHaveBeenCalledTimes(2);
    });

    it('returns slot_unavailable when all retries exhausted', async () => {
      const prisma = createBookingMockPrisma();
      prisma.service.findUnique.mockResolvedValue({
        id: SERVICE_ID,
        salonId: SALON_ID,
        name: 'Haircut',
        durationMin: 30,
        bufferMin: 15,
        priceRial: BigInt(500000),
        requiresDeposit: false,
        depositRial: null,
        serviceStaff: [
          { serviceId: SERVICE_ID, staffMemberId: STAFF_ID },
          { serviceId: SERVICE_ID, staffMemberId: 'staff-2' },
          { serviceId: SERVICE_ID, staffMemberId: 'staff-3' },
        ],
        serviceEquipment: [],
      });
      prisma.staffMember.findMany.mockResolvedValue([
        { id: STAFF_ID, salonId: SALON_ID, fullName: 'Ali', role: 'Stylist', active: true },
        { id: 'staff-2', salonId: SALON_ID, fullName: 'Sara', role: 'Stylist', active: true },
        { id: 'staff-3', salonId: SALON_ID, fullName: 'Reza', role: 'Stylist', active: true },
      ]);
      prisma.chair.findMany.mockResolvedValue([
        { id: CHAIR_ID, salonId: SALON_ID, name: 'Chair A', active: true, chairEquipment: [] },
      ]);
      prisma.workingHours.findMany
        .mockResolvedValueOnce([
          { id: 'wh-1', ownerKind: 'staff', ownerId: STAFF_ID, weekday: 5, startTime: timeDate(9, 0), endTime: timeDate(17, 0) },
          { id: 'wh-3', ownerKind: 'staff', ownerId: 'staff-2', weekday: 5, startTime: timeDate(9, 0), endTime: timeDate(17, 0) },
          { id: 'wh-4', ownerKind: 'staff', ownerId: 'staff-3', weekday: 5, startTime: timeDate(9, 0), endTime: timeDate(17, 0) },
        ])
        .mockResolvedValueOnce([
          { id: 'wh-2', ownerKind: 'chair', ownerId: CHAIR_ID, weekday: 5, startTime: timeDate(9, 0), endTime: timeDate(17, 0) },
        ]);

      // All attempts fail with exclusion violation
      const exclusionError = { code: 'P2002', meta: { target: ['no_staff_overlap'] } };
      prisma.appointment.create
        .mockRejectedValueOnce(exclusionError)
        .mockRejectedValueOnce(exclusionError)
        .mockRejectedValueOnce(exclusionError);

      const engine = new SchedulingEngine(prisma);
      const result = await engine.book({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        startAt: START_AT,
        customerId: CUSTOMER_ID,
        source: 'web',
      });

      expect(result).toEqual({ status: 'rejected', reason: 'slot_unavailable' });
      expect(prisma.appointment.create).toHaveBeenCalledTimes(3);
    });

    it('rethrows non-exclusion errors', async () => {
      const prisma = createBookingMockPrisma();
      setupFullBookingMock(prisma);

      // Override create to throw a non-exclusion error
      const unexpectedError = new Error('Database connection lost');
      prisma.appointment.create.mockRejectedValue(unexpectedError);

      const engine = new SchedulingEngine(prisma);
      await expect(
        engine.book({
          salonId: SALON_ID,
          serviceId: SERVICE_ID,
          startAt: START_AT,
          customerId: CUSTOMER_ID,
          source: 'web',
        }),
      ).rejects.toThrow('Database connection lost');
    });
  });

  describe('preferred staff (R14.3)', () => {
    it('prioritizes preferred staff when they are qualified and free', async () => {
      const STAFF_2 = 'staff-2';
      const prisma = createBookingMockPrisma();

      prisma.service.findUnique.mockResolvedValue({
        id: SERVICE_ID,
        salonId: SALON_ID,
        name: 'Haircut',
        durationMin: 30,
        bufferMin: 15,
        priceRial: BigInt(500000),
        requiresDeposit: false,
        depositRial: null,
        serviceStaff: [
          { serviceId: SERVICE_ID, staffMemberId: STAFF_ID },
          { serviceId: SERVICE_ID, staffMemberId: STAFF_2 },
        ],
        serviceEquipment: [],
      });
      prisma.staffMember.findMany.mockResolvedValue([
        { id: STAFF_ID, salonId: SALON_ID, fullName: 'Ali', role: 'Stylist', active: true },
        { id: STAFF_2, salonId: SALON_ID, fullName: 'Sara', role: 'Stylist', active: true },
      ]);
      prisma.chair.findMany.mockResolvedValue([
        { id: CHAIR_ID, salonId: SALON_ID, name: 'Chair A', active: true, chairEquipment: [] },
      ]);
      prisma.workingHours.findMany
        .mockResolvedValueOnce([
          { id: 'wh-1', ownerKind: 'staff', ownerId: STAFF_ID, weekday: 5, startTime: timeDate(9, 0), endTime: timeDate(17, 0) },
          { id: 'wh-3', ownerKind: 'staff', ownerId: STAFF_2, weekday: 5, startTime: timeDate(9, 0), endTime: timeDate(17, 0) },
        ])
        .mockResolvedValueOnce([
          { id: 'wh-2', ownerKind: 'chair', ownerId: CHAIR_ID, weekday: 5, startTime: timeDate(9, 0), endTime: timeDate(17, 0) },
        ]);

      const successfulAppt = {
        id: 'appt-new',
        salonId: SALON_ID,
        customerId: CUSTOMER_ID,
        staffMemberId: STAFF_2,
        chairId: CHAIR_ID,
        serviceId: SERVICE_ID,
        startAt: new Date(START_AT),
        endAt: new Date('2024-03-15T10:45:00.000Z'),
        status: 'confirmed',
        source: 'web',
        holdExpiresAt: null,
        createdAt: new Date(),
      };
      prisma.appointment.create.mockResolvedValue(successfulAppt);

      const engine = new SchedulingEngine(prisma);
      await engine.book({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        startAt: START_AT,
        customerId: CUSTOMER_ID,
        preferredStaffId: STAFF_2,
        source: 'web',
      });

      // First call should have staff-2 (the preferred staff)
      const firstCreateCall = prisma.appointment.create.mock.calls[0][0];
      expect(firstCreateCall.data.staffMemberId).toBe(STAFF_2);
    });
  });

  describe('mobile and walkin sources', () => {
    it('confirms mobile bookings', async () => {
      const prisma = createBookingMockPrisma();
      setupFullBookingMock(prisma);

      const engine = new SchedulingEngine(prisma);
      const result = await engine.book({
        salonId: SALON_ID,
        serviceId: SERVICE_ID,
        startAt: START_AT,
        customerId: CUSTOMER_ID,
        source: 'mobile',
      });

      expect(result.status).toBe('pending');
      expect(prisma.appointment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ source: 'mobile' }),
      });
    });
  });
});


describe('SchedulingEngine.book - held booking path (R10.1)', () => {
  function createBookingMockPrisma(overrides: Record<string, any> = {}) {
    return {
      service: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      holiday: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      staffMember: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      workingHours: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      dayOff: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      chair: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      chairUnavailable: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(null),
      },
      ...overrides,
    } as any;
  }

  const SALON_ID = 'salon-1';
  const SERVICE_ID = 'service-1';
  const STAFF_ID = 'staff-1';
  const CHAIR_ID = 'chair-1';
  const CUSTOMER_ID = 'customer-1';
  const START_AT = '2024-03-15T10:00:00.000Z'; // Friday

  function setupDepositBookingMock(prisma: any) {
    prisma.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      salonId: SALON_ID,
      name: 'Premium Color',
      durationMin: 60,
      bufferMin: 15,
      priceRial: BigInt(2000000),
      requiresDeposit: true,
      depositRial: BigInt(500000),
      serviceStaff: [{ serviceId: SERVICE_ID, staffMemberId: STAFF_ID }],
      serviceEquipment: [],
    });

    prisma.staffMember.findMany.mockResolvedValue([
      { id: STAFF_ID, salonId: SALON_ID, fullName: 'Ali', role: 'Stylist', active: true },
    ]);

    prisma.chair.findMany.mockResolvedValue([
      { id: CHAIR_ID, salonId: SALON_ID, name: 'Chair A', active: true, chairEquipment: [] },
    ]);

    prisma.workingHours.findMany
      .mockResolvedValueOnce([
        {
          id: 'wh-1', ownerKind: 'staff', ownerId: STAFF_ID, weekday: 5,
          startTime: timeDate(9, 0), endTime: timeDate(17, 0),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'wh-2', ownerKind: 'chair', ownerId: CHAIR_ID, weekday: 5,
          startTime: timeDate(9, 0), endTime: timeDate(17, 0),
        },
      ]);

    const holdExpiresAt = new Date(Date.now() + 900 * 1000);
    const createdAppointment = {
      id: 'appt-held-1',
      salonId: SALON_ID,
      customerId: CUSTOMER_ID,
      staffMemberId: STAFF_ID,
      chairId: CHAIR_ID,
      serviceId: SERVICE_ID,
      startAt: new Date(START_AT),
      endAt: new Date('2024-03-15T11:15:00.000Z'),
      status: 'held',
      source: 'web',
      holdExpiresAt,
      createdAt: new Date(),
    };
    prisma.appointment.create.mockResolvedValue(createdAppointment);

    return createdAppointment;
  }

  it('creates a held appointment when service requires deposit', async () => {
    const prisma = createBookingMockPrisma();
    setupDepositBookingMock(prisma);

    const engine = new SchedulingEngine(prisma);
    const result = await engine.book({
      salonId: SALON_ID,
      serviceId: SERVICE_ID,
      startAt: START_AT,
      customerId: CUSTOMER_ID,
      source: 'web',
    });

    expect(result.status).toBe('held');
    if (result.status === 'held') {
      expect(result.appointment.status).toBe('held');
      expect(result.payment).toBeDefined();
      expect(result.payment.paymentId).toContain('pay_');
      expect(result.payment.redirectUrl).toContain('/payments/deposit/');
    }
  });

  it('passes status=held and holdExpiresAt to the create call', async () => {
    const prisma = createBookingMockPrisma();
    setupDepositBookingMock(prisma);

    const engine = new SchedulingEngine(prisma);
    await engine.book({
      salonId: SALON_ID,
      serviceId: SERVICE_ID,
      startAt: START_AT,
      customerId: CUSTOMER_ID,
      source: 'web',
    });

    const createCall = prisma.appointment.create.mock.calls[0][0];
    expect(createCall.data.status).toBe('held');
    expect(createCall.data.holdExpiresAt).toBeInstanceOf(Date);
    // holdExpiresAt should be approximately now + 900 seconds
    const holdExpiry = createCall.data.holdExpiresAt as Date;
    const expectedExpiry = Date.now() + 900 * 1000;
    expect(Math.abs(holdExpiry.getTime() - expectedExpiry)).toBeLessThan(5000); // within 5s tolerance
  });

  it('uses configurable hold period', async () => {
    const prisma = createBookingMockPrisma();
    setupDepositBookingMock(prisma);

    const customHoldSeconds = 300; // 5 minutes
    const engine = new SchedulingEngine(prisma, { holdPeriodSeconds: customHoldSeconds });
    await engine.book({
      salonId: SALON_ID,
      serviceId: SERVICE_ID,
      startAt: START_AT,
      customerId: CUSTOMER_ID,
      source: 'web',
    });

    const createCall = prisma.appointment.create.mock.calls[0][0];
    const holdExpiry = createCall.data.holdExpiresAt as Date;
    const expectedExpiry = Date.now() + customHoldSeconds * 1000;
    expect(Math.abs(holdExpiry.getTime() - expectedExpiry)).toBeLessThan(5000);
  });

  it('still confirms non-deposit services', async () => {
    const prisma = createBookingMockPrisma();

    prisma.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      salonId: SALON_ID,
      name: 'Haircut',
      durationMin: 30,
      bufferMin: 15,
      priceRial: BigInt(500000),
      requiresDeposit: false,
      depositRial: null,
      serviceStaff: [{ serviceId: SERVICE_ID, staffMemberId: STAFF_ID }],
      serviceEquipment: [],
    });

    prisma.staffMember.findMany.mockResolvedValue([
      { id: STAFF_ID, salonId: SALON_ID, fullName: 'Ali', role: 'Stylist', active: true },
    ]);
    prisma.chair.findMany.mockResolvedValue([
      { id: CHAIR_ID, salonId: SALON_ID, name: 'Chair A', active: true, chairEquipment: [] },
    ]);
    prisma.workingHours.findMany
      .mockResolvedValueOnce([
        { id: 'wh-1', ownerKind: 'staff', ownerId: STAFF_ID, weekday: 5, startTime: timeDate(9, 0), endTime: timeDate(17, 0) },
      ])
      .mockResolvedValueOnce([
        { id: 'wh-2', ownerKind: 'chair', ownerId: CHAIR_ID, weekday: 5, startTime: timeDate(9, 0), endTime: timeDate(17, 0) },
      ]);

    const confirmedAppt = {
      id: 'appt-confirmed',
      salonId: SALON_ID,
      customerId: CUSTOMER_ID,
      staffMemberId: STAFF_ID,
      chairId: CHAIR_ID,
      serviceId: SERVICE_ID,
      startAt: new Date(START_AT),
      endAt: new Date('2024-03-15T10:45:00.000Z'),
      status: 'pending',
      source: 'web',
      holdExpiresAt: null,
      createdAt: new Date(),
    };
    prisma.appointment.create.mockResolvedValue(confirmedAppt);

    const engine = new SchedulingEngine(prisma);
    const result = await engine.book({
      salonId: SALON_ID,
      serviceId: SERVICE_ID,
      startAt: START_AT,
      customerId: CUSTOMER_ID,
      source: 'web',
    });

    expect(result.status).toBe('pending');
    const createCall = prisma.appointment.create.mock.calls[0][0];
    expect(createCall.data.status).toBe('pending');
    expect(createCall.data.holdExpiresAt).toBeNull();
  });
});


describe('SchedulingEngine.releaseExpiredHolds (R10.4)', () => {
  it('updates all expired holds to expired status', async () => {
    const prisma = {
      appointment: {
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    } as any;

    const engine = new SchedulingEngine(prisma);
    const now = new Date('2024-03-15T12:00:00Z');
    const count = await engine.releaseExpiredHolds(now);

    expect(count).toBe(3);
    expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'held',
        holdExpiresAt: { lte: now },
      },
      data: {
        status: 'expired',
      },
    });
  });

  it('returns 0 when no expired holds exist', async () => {
    const prisma = {
      appointment: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as any;

    const engine = new SchedulingEngine(prisma);
    const count = await engine.releaseExpiredHolds(new Date());

    expect(count).toBe(0);
  });

  it('uses current time by default when no argument provided', async () => {
    const prisma = {
      appointment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;

    const engine = new SchedulingEngine(prisma);
    const before = new Date();
    await engine.releaseExpiredHolds();
    const after = new Date();

    const callArg = prisma.appointment.updateMany.mock.calls[0][0];
    const usedTime = callArg.where.holdExpiresAt.lte as Date;
    expect(usedTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(usedTime.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('performs a single atomic updateMany (no per-row updates)', async () => {
    const prisma = {
      appointment: {
        updateMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
    } as any;

    const engine = new SchedulingEngine(prisma);
    await engine.releaseExpiredHolds(new Date());

    // Only one call to updateMany — not multiple individual updates
    expect(prisma.appointment.updateMany).toHaveBeenCalledTimes(1);
  });
});


describe('SchedulingEngine.confirmHeld (R10.3)', () => {
  it('transitions a held appointment to confirmed', async () => {
    const heldAppt = {
      id: 'appt-1',
      salonId: 'salon-1',
      customerId: 'customer-1',
      staffMemberId: 'staff-1',
      chairId: 'chair-1',
      serviceId: 'service-1',
      startAt: new Date('2024-03-15T10:00:00Z'),
      endAt: new Date('2024-03-15T11:15:00Z'),
      status: 'held',
      source: 'web',
      holdExpiresAt: new Date('2024-03-15T10:15:00Z'),
      createdAt: new Date(),
    };

    const confirmedAppt = { ...heldAppt, status: 'confirmed', holdExpiresAt: null };

    const prisma = {
      appointment: {
        findUnique: jest.fn().mockResolvedValue(heldAppt),
        update: jest.fn().mockResolvedValue(confirmedAppt),
      },
    } as any;

    const engine = new SchedulingEngine(prisma);
    const result = await engine.confirmHeld('appt-1');

    expect(result.status).toBe('confirmed');
    expect(result.holdExpiresAt).toBeNull();
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appt-1' },
      data: { status: 'confirmed', holdExpiresAt: null },
    });
  });

  it('throws error when appointment not found', async () => {
    const prisma = {
      appointment: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as any;

    const engine = new SchedulingEngine(prisma);
    await expect(engine.confirmHeld('nonexistent')).rejects.toThrow(
      'Appointment nonexistent not found',
    );
  });

  it('throws error when appointment is not in held status', async () => {
    const confirmedAppt = {
      id: 'appt-1',
      status: 'confirmed',
    };

    const prisma = {
      appointment: {
        findUnique: jest.fn().mockResolvedValue(confirmedAppt),
      },
    } as any;

    const engine = new SchedulingEngine(prisma);
    await expect(engine.confirmHeld('appt-1')).rejects.toThrow(
      "cannot be confirmed: current status is 'confirmed', expected 'held'",
    );
  });

  it('throws error when appointment is expired', async () => {
    const expiredAppt = {
      id: 'appt-1',
      status: 'expired',
    };

    const prisma = {
      appointment: {
        findUnique: jest.fn().mockResolvedValue(expiredAppt),
      },
    } as any;

    const engine = new SchedulingEngine(prisma);
    await expect(engine.confirmHeld('appt-1')).rejects.toThrow(
      "cannot be confirmed: current status is 'expired', expected 'held'",
    );
  });
});
