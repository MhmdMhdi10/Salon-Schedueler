import { SchedulingEngine } from './scheduling-engine';

/**
 * Unit tests for walk-in double-resource enforcement.
 *
 * Requirements: R13.1
 *
 * Walk-in appointments must obey the same double-resource constraint as online bookings.
 * They use source='walkin' but inherit identical overlap/exclusion rules.
 */

// Helper to create a time-only Date (as Prisma stores @db.Time at epoch)
function timeDate(hours: number, minutes: number): Date {
  const d = new Date('1970-01-01T00:00:00.000Z');
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

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

function setupStandardMocks(prisma: any) {
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
        weekday: 5,
        startTime: timeDate(9, 0),
        endTime: timeDate(17, 0),
      },
    ])
    .mockResolvedValueOnce([
      {
        id: 'wh-2',
        ownerKind: 'chair',
        ownerId: CHAIR_ID,
        weekday: 5,
        startTime: timeDate(9, 0),
        endTime: timeDate(17, 0),
      },
    ]);
}

describe('Walk-in double-resource enforcement (R13.1)', () => {
  it('walk-in booking creates appointment with source=walkin and same overlap constraints', async () => {
    const prisma = createMockPrisma();
    setupStandardMocks(prisma);

    const createdAppt = {
      id: 'appt-walkin-1',
      salonId: SALON_ID,
      customerId: CUSTOMER_ID,
      staffMemberId: STAFF_ID,
      chairId: CHAIR_ID,
      serviceId: SERVICE_ID,
      startAt: new Date(START_AT),
      endAt: new Date('2024-03-15T10:45:00.000Z'),
      status: 'pending',
      source: 'walkin',
      holdExpiresAt: null,
      createdAt: new Date(),
    };
    prisma.appointment.create.mockResolvedValue(createdAppt);

    const engine = new SchedulingEngine(prisma);
    const result = await engine.book({
      salonId: SALON_ID,
      serviceId: SERVICE_ID,
      startAt: START_AT,
      customerId: CUSTOMER_ID,
      source: 'walkin',
    });

    expect(result.status).toBe('pending');
    if (result.status === 'pending') {
      expect(result.appointment.source).toBe('walkin');
    }

    // Verify appointment was created with source='walkin' and correct time range
    expect(prisma.appointment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        salonId: SALON_ID,
        customerId: CUSTOMER_ID,
        staffMemberId: STAFF_ID,
        chairId: CHAIR_ID,
        serviceId: SERVICE_ID,
        source: 'walkin',
        status: 'pending',
        startAt: new Date(START_AT),
        endAt: new Date('2024-03-15T10:45:00.000Z'), // 30min + 15min buffer
      }),
    });
  });

  it('walk-in is rejected when staff is busy (same constraint as online)', async () => {
    const prisma = createMockPrisma();
    setupStandardMocks(prisma);

    // Staff has an existing overlapping appointment
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
      source: 'walkin',
    });

    expect(result).toEqual({ status: 'rejected', reason: 'no_availability' });
  });

  it('walk-in is rejected when chair is busy (same constraint as online)', async () => {
    const prisma = createMockPrisma();
    setupStandardMocks(prisma);

    // Chair has an existing overlapping appointment
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'appt-existing',
        salonId: SALON_ID,
        staffMemberId: 'other-staff',
        chairId: CHAIR_ID,
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
      source: 'walkin',
    });

    expect(result).toEqual({ status: 'rejected', reason: 'no_availability' });
  });

  it('walk-in triggers exclusion constraint retry just like online booking (R9.5)', async () => {
    const STAFF_2 = 'staff-2';
    const prisma = createMockPrisma();

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

    // First attempt fails with exclusion violation (another walk-in raced), second succeeds
    const exclusionError = { code: 'P2002', meta: { target: ['no_staff_overlap'] } };
    const successfulAppt = {
      id: 'appt-walkin-2',
      salonId: SALON_ID,
      customerId: CUSTOMER_ID,
      staffMemberId: STAFF_2,
      chairId: CHAIR_ID,
      serviceId: SERVICE_ID,
      startAt: new Date(START_AT),
      endAt: new Date('2024-03-15T10:45:00.000Z'),
      status: 'pending',
      source: 'walkin',
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
      source: 'walkin',
    });

    expect(result.status).toBe('pending');
    if (result.status === 'pending') {
      expect(result.appointment.source).toBe('walkin');
    }
    // Retried with a different staff member
    expect(prisma.appointment.create).toHaveBeenCalledTimes(2);
  });

  it('walk-in respects equipment requirements (same as online)', async () => {
    const prisma = createMockPrisma();

    prisma.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      salonId: SALON_ID,
      name: 'Hair Dryer Service',
      durationMin: 30,
      bufferMin: 10,
      priceRial: BigInt(300000),
      requiresDeposit: false,
      depositRial: null,
      serviceStaff: [{ serviceId: SERVICE_ID, staffMemberId: STAFF_ID }],
      serviceEquipment: [{ serviceId: SERVICE_ID, equipmentId: 'eq-dryer' }],
    });

    prisma.staffMember.findMany.mockResolvedValue([
      { id: STAFF_ID, salonId: SALON_ID, fullName: 'Ali', role: 'Stylist', active: true },
    ]);

    prisma.workingHours.findMany.mockResolvedValueOnce([
      { id: 'wh-1', ownerKind: 'staff', ownerId: STAFF_ID, weekday: 5, startTime: timeDate(9, 0), endTime: timeDate(17, 0) },
    ]);

    // Chair does NOT have the required equipment
    prisma.chair.findMany.mockResolvedValue([
      { id: CHAIR_ID, salonId: SALON_ID, name: 'Chair A', active: true, chairEquipment: [] },
    ]);

    const engine = new SchedulingEngine(prisma);
    const result = await engine.book({
      salonId: SALON_ID,
      serviceId: SERVICE_ID,
      startAt: START_AT,
      customerId: CUSTOMER_ID,
      source: 'walkin',
    });

    // Walk-in rejected because no chair has the required equipment
    expect(result).toEqual({ status: 'rejected', reason: 'no_availability' });
  });
});
