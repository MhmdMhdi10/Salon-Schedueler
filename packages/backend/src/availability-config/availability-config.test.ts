import { AvailabilityConfig } from './availability-config';

/**
 * Unit tests for AvailabilityConfig
 *
 * Tests validate:
 * - Working hours: set (replace), get for staff and chair (R4.1, R4.2)
 * - Days off: add, remove, get for staff members (R4.1)
 * - Chair unavailable: add, remove, get (R4.2)
 * - Holidays: add, remove, get for a salon (R4.3)
 * - Replace semantics: setWorkingHours deletes then creates in a transaction
 */

function createMockPrisma() {
  const workingHoursRecords: any[] = [];

  const workingHours = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue(workingHoursRecords),
  };

  const dayOff = {
    create: jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: '00000000-0000-0000-0000-000000000100',
        staffMemberId: data.staffMemberId,
        onDate: data.onDate,
      }),
    ),
    delete: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  };

  const chairUnavailable = {
    create: jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: '00000000-0000-0000-0000-000000000200',
        chairId: data.chairId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
      }),
    ),
    delete: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  };

  const holiday = {
    create: jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: '00000000-0000-0000-0000-000000000300',
        salonId: data.salonId,
        onDate: data.onDate,
      }),
    ),
    delete: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  };

  const prisma = {
    workingHours,
    dayOff,
    chairUnavailable,
    holiday,
    salon: {
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      return fn(prisma);
    }),
  } as any;

  return prisma;
}

describe('AvailabilityConfig', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let config: AvailabilityConfig;

  beforeEach(() => {
    prisma = createMockPrisma();
    config = new AvailabilityConfig(prisma);
  });

  describe('setWorkingHours (R4.1, R4.2)', () => {
    it('should delete existing hours and create new ones for staff', async () => {
      const ownerId = '00000000-0000-0000-0000-000000000010';
      const hours = [
        { weekday: 0, startTime: '09:00', endTime: '12:00' },
        { weekday: 0, startTime: '13:00', endTime: '17:00' },
      ];

      prisma.workingHours.findMany.mockResolvedValue(
        hours.map((h, i) => ({
          id: `id-${i}`,
          ownerKind: 'staff',
          ownerId,
          weekday: h.weekday,
          startTime: new Date(`1970-01-01T${h.startTime}:00.000Z`),
          endTime: new Date(`1970-01-01T${h.endTime}:00.000Z`),
        })),
      );

      const result = await config.setWorkingHours('staff', ownerId, hours);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.workingHours.deleteMany).toHaveBeenCalledWith({
        where: { ownerKind: 'staff', ownerId },
      });
      expect(prisma.workingHours.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ ownerKind: 'staff', ownerId, weekday: 0 }),
        ]),
      });
      expect(result).toHaveLength(2);
    });

    it('should delete existing hours and create new ones for chair', async () => {
      const ownerId = '00000000-0000-0000-0000-000000000020';
      const hours = [{ weekday: 1, startTime: '08:00', endTime: '18:00' }];

      prisma.workingHours.findMany.mockResolvedValue([
        {
          id: 'id-0',
          ownerKind: 'chair',
          ownerId,
          weekday: 1,
          startTime: new Date('1970-01-01T08:00:00.000Z'),
          endTime: new Date('1970-01-01T18:00:00.000Z'),
        },
      ]);

      await config.setWorkingHours('chair', ownerId, hours);

      expect(prisma.workingHours.deleteMany).toHaveBeenCalledWith({
        where: { ownerKind: 'chair', ownerId },
      });
      expect(prisma.workingHours.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ ownerKind: 'chair', ownerId, weekday: 1 }),
        ],
      });
    });

    it('should handle empty hours array (clear all)', async () => {
      const ownerId = '00000000-0000-0000-0000-000000000010';

      prisma.workingHours.findMany.mockResolvedValue([]);

      const result = await config.setWorkingHours('staff', ownerId, []);

      expect(prisma.workingHours.deleteMany).toHaveBeenCalledWith({
        where: { ownerKind: 'staff', ownerId },
      });
      expect(prisma.workingHours.createMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should call deleteMany before createMany (replace semantics)', async () => {
      const ownerId = '00000000-0000-0000-0000-000000000010';
      const hours = [{ weekday: 2, startTime: '10:00', endTime: '14:00' }];

      const callOrder: string[] = [];
      prisma.workingHours.deleteMany.mockImplementation(async () => {
        callOrder.push('deleteMany');
        return { count: 1 };
      });
      prisma.workingHours.createMany.mockImplementation(async () => {
        callOrder.push('createMany');
        return { count: 1 };
      });
      prisma.workingHours.findMany.mockImplementation(async () => {
        callOrder.push('findMany');
        return [];
      });

      await config.setWorkingHours('staff', ownerId, hours);

      expect(callOrder).toEqual(['deleteMany', 'createMany', 'findMany']);
    });

    it('should parse startTime and endTime into Date objects', async () => {
      const ownerId = '00000000-0000-0000-0000-000000000010';
      const hours = [{ weekday: 3, startTime: '09:30', endTime: '17:45' }];

      prisma.workingHours.findMany.mockResolvedValue([]);

      await config.setWorkingHours('staff', ownerId, hours);

      const createCall = prisma.workingHours.createMany.mock.calls[0][0];
      const entry = createCall.data[0];

      expect(entry.startTime).toBeInstanceOf(Date);
      expect(entry.endTime).toBeInstanceOf(Date);
      expect(entry.startTime.getUTCHours()).toBe(9);
      expect(entry.startTime.getUTCMinutes()).toBe(30);
      expect(entry.endTime.getUTCHours()).toBe(17);
      expect(entry.endTime.getUTCMinutes()).toBe(45);
    });
  });

  describe('getWorkingHours', () => {
    it('should retrieve working hours for a staff member', async () => {
      const ownerId = '00000000-0000-0000-0000-000000000010';
      const mockData = [
        {
          id: 'wh-1',
          ownerKind: 'staff',
          ownerId,
          weekday: 1,
          startTime: new Date('1970-01-01T09:00:00.000Z'),
          endTime: new Date('1970-01-01T17:00:00.000Z'),
        },
      ];
      prisma.workingHours.findMany.mockResolvedValue(mockData);

      const result = await config.getWorkingHours('staff', ownerId);

      expect(prisma.workingHours.findMany).toHaveBeenCalledWith({
        where: { ownerKind: 'staff', ownerId },
      });
      expect(result).toEqual(mockData);
    });

    it('should return empty array when no hours configured', async () => {
      prisma.workingHours.findMany.mockResolvedValue([]);

      const result = await config.getWorkingHours('chair', 'some-id');

      expect(result).toEqual([]);
    });
  });

  describe('addDayOff (R4.1)', () => {
    it('should create a day off for a staff member', async () => {
      const staffMemberId = '00000000-0000-0000-0000-000000000010';
      const onDate = '2025-03-15';

      const result = await config.addDayOff(staffMemberId, onDate);

      expect(prisma.dayOff.create).toHaveBeenCalledWith({
        data: {
          staffMemberId,
          onDate: new Date(onDate),
        },
      });
      expect(result.staffMemberId).toBe(staffMemberId);
      expect(result.id).toBeDefined();
    });
  });

  describe('removeDayOff', () => {
    it('should delete the day off by ID', async () => {
      const dayOffId = '00000000-0000-0000-0000-000000000100';

      await config.removeDayOff(dayOffId);

      expect(prisma.dayOff.delete).toHaveBeenCalledWith({
        where: { id: dayOffId },
      });
    });
  });

  describe('getDaysOff', () => {
    it('should retrieve all days off for a staff member', async () => {
      const staffMemberId = '00000000-0000-0000-0000-000000000010';
      const mockDaysOff = [
        { id: 'do-1', staffMemberId, onDate: new Date('2025-03-15') },
        { id: 'do-2', staffMemberId, onDate: new Date('2025-03-20') },
      ];
      prisma.dayOff.findMany.mockResolvedValue(mockDaysOff);

      const result = await config.getDaysOff(staffMemberId);

      expect(prisma.dayOff.findMany).toHaveBeenCalledWith({
        where: { staffMemberId },
      });
      expect(result).toEqual(mockDaysOff);
    });

    it('should return empty array when no days off', async () => {
      prisma.dayOff.findMany.mockResolvedValue([]);

      const result = await config.getDaysOff('some-id');

      expect(result).toEqual([]);
    });
  });

  describe('addChairUnavailable (R4.2)', () => {
    it('should create an unavailable period for a chair', async () => {
      const chairId = '00000000-0000-0000-0000-000000000020';
      const periodStart = new Date('2025-03-15T10:00:00Z');
      const periodEnd = new Date('2025-03-15T14:00:00Z');

      const result = await config.addChairUnavailable(chairId, periodStart, periodEnd);

      expect(prisma.chairUnavailable.create).toHaveBeenCalledWith({
        data: {
          chairId,
          periodStart,
          periodEnd,
        },
      });
      expect(result.chairId).toBe(chairId);
      expect(result.periodStart).toEqual(periodStart);
      expect(result.periodEnd).toEqual(periodEnd);
    });
  });

  describe('removeChairUnavailable', () => {
    it('should delete the chair unavailable period by ID', async () => {
      const id = '00000000-0000-0000-0000-000000000200';

      await config.removeChairUnavailable(id);

      expect(prisma.chairUnavailable.delete).toHaveBeenCalledWith({
        where: { id },
      });
    });
  });

  describe('getChairUnavailable', () => {
    it('should retrieve all unavailable periods for a chair', async () => {
      const chairId = '00000000-0000-0000-0000-000000000020';
      const mockPeriods = [
        {
          id: 'cu-1',
          chairId,
          periodStart: new Date('2025-03-15T10:00:00Z'),
          periodEnd: new Date('2025-03-15T14:00:00Z'),
        },
      ];
      prisma.chairUnavailable.findMany.mockResolvedValue(mockPeriods);

      const result = await config.getChairUnavailable(chairId);

      expect(prisma.chairUnavailable.findMany).toHaveBeenCalledWith({
        where: { chairId },
      });
      expect(result).toEqual(mockPeriods);
    });

    it('should return empty array when no periods configured', async () => {
      prisma.chairUnavailable.findMany.mockResolvedValue([]);

      const result = await config.getChairUnavailable('some-id');

      expect(result).toEqual([]);
    });
  });

  describe('addHoliday (R4.3)', () => {
    it('should create a salon holiday', async () => {
      const salonId = '00000000-0000-0000-0000-000000000001';
      const onDate = '2025-03-21';

      const result = await config.addHoliday(salonId, onDate);

      expect(prisma.holiday.create).toHaveBeenCalledWith({
        data: {
          salonId,
          onDate: new Date(onDate),
        },
      });
      expect(result.salonId).toBe(salonId);
      expect(result.id).toBeDefined();
    });
  });

  describe('removeHoliday', () => {
    it('should delete the holiday by ID', async () => {
      const holidayId = '00000000-0000-0000-0000-000000000300';

      await config.removeHoliday(holidayId);

      expect(prisma.holiday.delete).toHaveBeenCalledWith({
        where: { id: holidayId },
      });
    });
  });

  describe('getHolidays', () => {
    it('should retrieve all holidays for a salon', async () => {
      const salonId = '00000000-0000-0000-0000-000000000001';
      const mockHolidays = [
        { id: 'h-1', salonId, onDate: new Date('2025-03-21') },
        { id: 'h-2', salonId, onDate: new Date('2025-04-01') },
      ];
      prisma.holiday.findMany.mockResolvedValue(mockHolidays);

      const result = await config.getHolidays(salonId);

      expect(prisma.holiday.findMany).toHaveBeenCalledWith({
        where: { salonId },
        orderBy: { onDate: 'asc' },
      });
      expect(result).toEqual(mockHolidays);
    });

    it('should return empty array when no holidays configured', async () => {
      prisma.holiday.findMany.mockResolvedValue([]);

      const result = await config.getHolidays('some-id');

      expect(result).toEqual([]);
    });
  });

  describe('setSalonBrandAccent (signature-ui-system R4.1)', () => {
    const salonId = '00000000-0000-0000-0000-000000000001';

    it('should persist a non-null accent key on the salon', async () => {
      await config.setSalonBrandAccent(salonId, 'rose');

      expect(prisma.salon.update).toHaveBeenCalledWith({
        where: { id: salonId },
        data: { brandAccent: 'rose' },
      });
    });

    it('should clear the accent (null) to fall back to the signature default', async () => {
      await config.setSalonBrandAccent(salonId, null);

      expect(prisma.salon.update).toHaveBeenCalledWith({
        where: { id: salonId },
        data: { brandAccent: null },
      });
    });
  });
});
