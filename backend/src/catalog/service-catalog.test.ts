import { ServiceCatalog } from './service-catalog';
import { ValidationError } from './validation-error';

/**
 * Unit tests for ServiceCatalog
 *
 * Tests validate:
 * - Valid input creates a service (R5.1)
 * - Non-positive duration is rejected (R5.3)
 * - Negative buffer is rejected (R5.4)
 * - Negative price is rejected (R5.4)
 * - Structured field-level errors are returned
 * - BigInt conversion for price and deposit
 * - setServiceStaff replaces staff mappings atomically (R6.1)
 * - setServiceEquipment replaces equipment mappings atomically (R6.3)
 */

// Mock PrismaClient
function createMockPrisma() {
  const serviceStaff = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  };

  const serviceEquipment = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  };

  const prisma = {
    service: {
      create: jest.fn().mockImplementation(({ data }) => {
        return Promise.resolve({
          id: '00000000-0000-0000-0000-000000000001',
          salonId: data.salonId,
          name: data.name,
          durationMin: data.durationMin,
          bufferMin: data.bufferMin,
          priceRial: data.priceRial,
          requiresDeposit: data.requiresDeposit,
          depositRial: data.depositRial,
        });
      }),
      delete: jest.fn().mockResolvedValue({ id: 'service-1' }),
    },
    serviceStaff,
    serviceEquipment,
    $transaction: jest.fn().mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      // The transaction callback receives the same prisma instance (mock)
      return fn(prisma);
    }),
  } as any;

  return prisma;
}

function validInput() {
  return {
    salonId: 'a0000000-0000-0000-0000-000000000001',
    name: 'Haircut',
    durationMinutes: 30,
    bufferMinutes: 10,
    priceRial: 500000,
    requiresDeposit: false,
    requiredEquipmentIds: [],
  };
}

describe('ServiceCatalog', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let catalog: ServiceCatalog;

  beforeEach(() => {
    prisma = createMockPrisma();
    catalog = new ServiceCatalog(prisma);
  });

  describe('createService - valid input', () => {
    it('should create a service and return it (R5.1)', async () => {
      const input = validInput();
      const result = await catalog.createService(input);

      expect(result).toBeDefined();
      expect(result.name).toBe('Haircut');
      expect(result.durationMin).toBe(30);
      expect(result.bufferMin).toBe(10);
      expect(result.priceRial).toBe(BigInt(500000));
      expect(result.requiresDeposit).toBe(false);
    });

    it('should convert priceRial to BigInt', async () => {
      const input = validInput();
      input.priceRial = 1000000;
      await catalog.createService(input);

      expect(prisma.service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priceRial: BigInt(1000000),
          }),
        }),
      );
    });

    it('should convert depositRial to BigInt when present', async () => {
      const input = { ...validInput(), requiresDeposit: true, depositRial: 100000 };
      await catalog.createService(input);

      expect(prisma.service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            depositRial: BigInt(100000),
          }),
        }),
      );
    });

    it('should set depositRial to null when not provided', async () => {
      const input = validInput();
      await catalog.createService(input);

      expect(prisma.service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            depositRial: null,
          }),
        }),
      );
    });

    it('should accept zero buffer (edge case)', async () => {
      const input = { ...validInput(), bufferMinutes: 0 };
      const result = await catalog.createService(input);

      expect(result.bufferMin).toBe(0);
    });

    it('should accept zero price (free service)', async () => {
      const input = { ...validInput(), priceRial: 0 };
      const result = await catalog.createService(input);

      expect(result.priceRial).toBe(BigInt(0));
    });
  });

  describe('createService - non-positive duration rejected (R5.3)', () => {
    it('should reject duration of 0', async () => {
      const input = { ...validInput(), durationMinutes: 0 };

      await expect(catalog.createService(input)).rejects.toThrow(ValidationError);

      try {
        await catalog.createService(input);
      } catch (err) {
        const ve = err as ValidationError;
        expect(ve.fieldErrors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'durationMinutes' }),
          ]),
        );
      }
    });

    it('should reject negative duration', async () => {
      const input = { ...validInput(), durationMinutes: -5 };

      await expect(catalog.createService(input)).rejects.toThrow(ValidationError);
    });
  });

  describe('createService - negative buffer rejected (R5.4)', () => {
    it('should reject negative buffer', async () => {
      const input = { ...validInput(), bufferMinutes: -1 };

      await expect(catalog.createService(input)).rejects.toThrow(ValidationError);

      try {
        await catalog.createService(input);
      } catch (err) {
        const ve = err as ValidationError;
        expect(ve.fieldErrors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'bufferMinutes' }),
          ]),
        );
      }
    });
  });

  describe('createService - negative price rejected (R5.4)', () => {
    it('should reject negative price', async () => {
      const input = { ...validInput(), priceRial: -100 };

      await expect(catalog.createService(input)).rejects.toThrow(ValidationError);

      try {
        await catalog.createService(input);
      } catch (err) {
        const ve = err as ValidationError;
        expect(ve.fieldErrors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'priceRial' }),
          ]),
        );
      }
    });
  });

  describe('createService - structured error details', () => {
    it('should include multiple field errors for multiple invalid fields', async () => {
      const input = { ...validInput(), durationMinutes: 0, bufferMinutes: -1, priceRial: -10 };

      try {
        await catalog.createService(input);
        fail('Expected ValidationError');
      } catch (err) {
        const ve = err as ValidationError;
        expect(ve).toBeInstanceOf(ValidationError);
        expect(ve.code).toBe('VALIDATION_ERROR');
        expect(ve.fieldErrors.length).toBeGreaterThanOrEqual(3);

        const fields = ve.fieldErrors.map((e) => e.field);
        expect(fields).toContain('durationMinutes');
        expect(fields).toContain('bufferMinutes');
        expect(fields).toContain('priceRial');
      }
    });

    it('should have a human-readable error message', async () => {
      const input = { ...validInput(), durationMinutes: -1 };

      try {
        await catalog.createService(input);
        fail('Expected ValidationError');
      } catch (err) {
        const ve = err as ValidationError;
        expect(ve.message).toContain('Validation failed');
        expect(ve.message).toContain('durationMinutes');
      }
    });

    it('should reject missing name', async () => {
      const input = { ...validInput(), name: '' };

      await expect(catalog.createService(input)).rejects.toThrow(ValidationError);
    });

    it('should reject invalid salonId (not UUID)', async () => {
      const input = { ...validInput(), salonId: 'not-a-uuid' };

      await expect(catalog.createService(input)).rejects.toThrow(ValidationError);
    });
  });

  describe('createService - does not call Prisma on invalid input', () => {
    it('should not persist when validation fails', async () => {
      const input = { ...validInput(), durationMinutes: 0 };

      await expect(catalog.createService(input)).rejects.toThrow(ValidationError);
      expect(prisma.service.create).not.toHaveBeenCalled();
    });
  });
});

describe('ServiceCatalog - setServiceStaff (R6.1)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let catalog: ServiceCatalog;

  beforeEach(() => {
    prisma = createMockPrisma();
    catalog = new ServiceCatalog(prisma);
  });

  it('should delete existing staff mappings and create new ones', async () => {
    const serviceId = '00000000-0000-0000-0000-000000000001';
    const staffIds = [
      '00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000011',
    ];

    await catalog.setServiceStaff(serviceId, staffIds);

    // Should be called within a transaction
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Should delete all existing entries for the service
    expect(prisma.serviceStaff.deleteMany).toHaveBeenCalledWith({
      where: { serviceId },
    });

    // Should create new entries
    expect(prisma.serviceStaff.createMany).toHaveBeenCalledWith({
      data: [
        { serviceId, staffMemberId: '00000000-0000-0000-0000-000000000010' },
        { serviceId, staffMemberId: '00000000-0000-0000-0000-000000000011' },
      ],
    });
  });

  it('should handle empty staffIds by deleting all and creating none', async () => {
    const serviceId = '00000000-0000-0000-0000-000000000001';

    await catalog.setServiceStaff(serviceId, []);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.serviceStaff.deleteMany).toHaveBeenCalledWith({
      where: { serviceId },
    });
    expect(prisma.serviceStaff.createMany).not.toHaveBeenCalled();
  });

  it('should handle a single staffId', async () => {
    const serviceId = '00000000-0000-0000-0000-000000000001';
    const staffIds = ['00000000-0000-0000-0000-000000000010'];

    await catalog.setServiceStaff(serviceId, staffIds);

    expect(prisma.serviceStaff.createMany).toHaveBeenCalledWith({
      data: [{ serviceId, staffMemberId: '00000000-0000-0000-0000-000000000010' }],
    });
  });

  it('should call deleteMany before createMany (replace semantics)', async () => {
    const serviceId = '00000000-0000-0000-0000-000000000001';
    const staffIds = ['00000000-0000-0000-0000-000000000010'];

    const callOrder: string[] = [];
    prisma.serviceStaff.deleteMany.mockImplementation(async () => {
      callOrder.push('deleteMany');
      return { count: 1 };
    });
    prisma.serviceStaff.createMany.mockImplementation(async () => {
      callOrder.push('createMany');
      return { count: 1 };
    });

    await catalog.setServiceStaff(serviceId, staffIds);

    expect(callOrder).toEqual(['deleteMany', 'createMany']);
  });
});

describe('ServiceCatalog - setServiceEquipment (R6.3)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let catalog: ServiceCatalog;

  beforeEach(() => {
    prisma = createMockPrisma();
    catalog = new ServiceCatalog(prisma);
  });

  it('should delete existing equipment mappings and create new ones', async () => {
    const serviceId = '00000000-0000-0000-0000-000000000001';
    const equipmentIds = [
      '00000000-0000-0000-0000-000000000020',
      '00000000-0000-0000-0000-000000000021',
    ];

    await catalog.setServiceEquipment(serviceId, equipmentIds);

    // Should be called within a transaction
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Should delete all existing entries for the service
    expect(prisma.serviceEquipment.deleteMany).toHaveBeenCalledWith({
      where: { serviceId },
    });

    // Should create new entries
    expect(prisma.serviceEquipment.createMany).toHaveBeenCalledWith({
      data: [
        { serviceId, equipmentId: '00000000-0000-0000-0000-000000000020' },
        { serviceId, equipmentId: '00000000-0000-0000-0000-000000000021' },
      ],
    });
  });

  it('should handle empty equipmentIds by deleting all and creating none', async () => {
    const serviceId = '00000000-0000-0000-0000-000000000001';

    await catalog.setServiceEquipment(serviceId, []);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.serviceEquipment.deleteMany).toHaveBeenCalledWith({
      where: { serviceId },
    });
    expect(prisma.serviceEquipment.createMany).not.toHaveBeenCalled();
  });

  it('should handle a single equipmentId', async () => {
    const serviceId = '00000000-0000-0000-0000-000000000001';
    const equipmentIds = ['00000000-0000-0000-0000-000000000020'];

    await catalog.setServiceEquipment(serviceId, equipmentIds);

    expect(prisma.serviceEquipment.createMany).toHaveBeenCalledWith({
      data: [{ serviceId, equipmentId: '00000000-0000-0000-0000-000000000020' }],
    });
  });

  it('should call deleteMany before createMany (replace semantics)', async () => {
    const serviceId = '00000000-0000-0000-0000-000000000001';
    const equipmentIds = ['00000000-0000-0000-0000-000000000020'];

    const callOrder: string[] = [];
    prisma.serviceEquipment.deleteMany.mockImplementation(async () => {
      callOrder.push('deleteMany');
      return { count: 1 };
    });
    prisma.serviceEquipment.createMany.mockImplementation(async () => {
      callOrder.push('createMany');
      return { count: 1 };
    });

    await catalog.setServiceEquipment(serviceId, equipmentIds);

    expect(callOrder).toEqual(['deleteMany', 'createMany']);
  });
});

describe('ServiceCatalog - deleteService', () => {
  it('removes join-table mappings before deleting the service in one transaction', async () => {
    const prisma = createMockPrisma();
    const catalog = new ServiceCatalog(prisma);
    const callOrder: string[] = [];

    prisma.serviceStaff.deleteMany.mockImplementation(async () => {
      callOrder.push('staff');
      return { count: 1 };
    });
    prisma.serviceEquipment.deleteMany.mockImplementation(async () => {
      callOrder.push('equipment');
      return { count: 1 };
    });
    prisma.service.delete.mockImplementation(async () => {
      callOrder.push('service');
      return { id: 'service-1' };
    });

    await catalog.deleteService('service-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.serviceStaff.deleteMany).toHaveBeenCalledWith({
      where: { serviceId: 'service-1' },
    });
    expect(prisma.serviceEquipment.deleteMany).toHaveBeenCalledWith({
      where: { serviceId: 'service-1' },
    });
    expect(prisma.service.delete).toHaveBeenCalledWith({ where: { id: 'service-1' } });
    expect(callOrder).toEqual(['staff', 'equipment', 'service']);
  });
});
