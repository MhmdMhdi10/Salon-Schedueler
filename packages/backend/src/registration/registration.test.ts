import { SalonRegistration } from './salon-registration';
import { ResourceRegistration } from './resource-registration';
import { RegistrationError } from './registration-error';
import { encodeSalonQr } from '@salon/shared';

// ─── Mock Prisma client ────────────────────────────────────────────────────────

function createMockPrisma() {
  const salons = new Map<string, any>();
  const salonsByQrToken = new Map<string, any>();
  const staffMembers: any[] = [];
  const chairs: any[] = [];
  const equipment: any[] = [];

  let idCounter = 0;
  const genId = () => `uuid-${++idCounter}`;

  return {
    salon: {
      create: jest.fn(async ({ data }: any) => {
        const salon = {
          id: genId(),
          name: data.name,
          qrToken: data.qrToken,
          timezone: data.timezone ?? 'Asia/Tehran',
          createdAt: new Date(),
        };
        salons.set(salon.id, salon);
        salonsByQrToken.set(salon.qrToken, salon);
        return salon;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return salons.get(where.id) ?? null;
        if (where.qrToken) return salonsByQrToken.get(where.qrToken) ?? null;
        return null;
      }),
    },
    staffMember: {
      create: jest.fn(async ({ data }: any) => {
        const member = {
          id: genId(),
          salonId: data.salonId,
          fullName: data.fullName,
          role: data.role,
          active: true,
        };
        staffMembers.push(member);
        return member;
      }),
    },
    chair: {
      create: jest.fn(async ({ data }: any) => {
        const chair = {
          id: genId(),
          salonId: data.salonId,
          name: data.name,
          active: true,
        };
        chairs.push(chair);
        return chair;
      }),
    },
    equipment: {
      create: jest.fn(async ({ data }: any) => {
        const eq = {
          id: genId(),
          salonId: data.salonId,
          name: data.name,
        };
        equipment.push(eq);
        return eq;
      }),
    },
    _salons: salons,
    _salonsByQrToken: salonsByQrToken,
    _staffMembers: staffMembers,
    _chairs: chairs,
    _equipment: equipment,
  } as any;
}

// ─── SalonRegistration tests ───────────────────────────────────────────────────

describe('SalonRegistration', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let salonReg: SalonRegistration;

  beforeEach(() => {
    prisma = createMockPrisma();
    salonReg = new SalonRegistration(prisma);
  });

  describe('createSalon', () => {
    it('creates a salon with a unique qr_token (R7.1)', async () => {
      const salon = await salonReg.createSalon('Test Salon');

      expect(salon.name).toBe('Test Salon');
      expect(salon.qrToken).toBeDefined();
      expect(salon.qrToken.length).toBeGreaterThan(0);
      expect(salon.timezone).toBe('Asia/Tehran');
    });

    it('uses provided timezone when specified', async () => {
      const salon = await salonReg.createSalon('Salon 2', 'Europe/London');

      expect(salon.timezone).toBe('Europe/London');
    });

    it('generates unique qr_tokens for different salons', async () => {
      const salon1 = await salonReg.createSalon('Salon 1');
      const salon2 = await salonReg.createSalon('Salon 2');

      expect(salon1.qrToken).not.toBe(salon2.qrToken);
    });
  });

  describe('getSalonQrPayload', () => {
    it('returns an encoded QR payload for a valid salon', async () => {
      const salon = await salonReg.createSalon('My Salon');
      const payload = await salonReg.getSalonQrPayload(salon.id);

      expect(payload).toBe(encodeSalonQr(salon.qrToken));
      expect(payload).toContain('https://book.salon.app/s/v1.');
    });

    it('throws when salon does not exist', async () => {
      await expect(salonReg.getSalonQrPayload('non-existent-id')).rejects.toThrow(
        'Salon not found',
      );
    });
  });

  describe('resolveSalonByQr', () => {
    it('resolves a valid QR payload to the correct salon (R7.2)', async () => {
      const salon = await salonReg.createSalon('Resolved Salon');
      const payload = encodeSalonQr(salon.qrToken);

      const resolved = await salonReg.resolveSalonByQr(payload);

      expect(resolved.id).toBe(salon.id);
      expect(resolved.name).toBe('Resolved Salon');
    });

    it('throws QR_MALFORMED for a malformed payload (R7.5)', async () => {
      try {
        await salonReg.resolveSalonByQr('garbage-data');
        fail('Expected RegistrationError');
      } catch (err) {
        expect(err).toBeInstanceOf(RegistrationError);
        expect((err as RegistrationError).code).toBe('QR_MALFORMED');
      }
    });

    it('throws QR_MALFORMED for payload with invalid checksum (R7.5)', async () => {
      const payload = 'https://book.salon.app/s/v1.some-token.00000000';

      try {
        await salonReg.resolveSalonByQr(payload);
        fail('Expected RegistrationError');
      } catch (err) {
        expect(err).toBeInstanceOf(RegistrationError);
        expect((err as RegistrationError).code).toBe('QR_MALFORMED');
      }
    });

    it('throws QR_UNREGISTERED for a well-formed payload with unknown token (R7.4)', async () => {
      // Create a valid QR payload for a token that's not in the database
      const unknownToken = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const payload = encodeSalonQr(unknownToken);

      try {
        await salonReg.resolveSalonByQr(payload);
        fail('Expected RegistrationError');
      } catch (err) {
        expect(err).toBeInstanceOf(RegistrationError);
        expect((err as RegistrationError).code).toBe('QR_UNREGISTERED');
      }
    });

    it('QR_MALFORMED and QR_UNREGISTERED have distinct error codes (R7.4, R7.5)', async () => {
      const malformedPayload = 'not-a-valid-url';
      const unknownPayload = encodeSalonQr('unknown-token-xyz');

      let malformedCode: string | undefined;
      let unregisteredCode: string | undefined;

      try {
        await salonReg.resolveSalonByQr(malformedPayload);
      } catch (err) {
        malformedCode = (err as RegistrationError).code;
      }

      try {
        await salonReg.resolveSalonByQr(unknownPayload);
      } catch (err) {
        unregisteredCode = (err as RegistrationError).code;
      }

      expect(malformedCode).toBe('QR_MALFORMED');
      expect(unregisteredCode).toBe('QR_UNREGISTERED');
      expect(malformedCode).not.toBe(unregisteredCode);
    });
  });
});

// ─── ResourceRegistration tests ────────────────────────────────────────────────

describe('ResourceRegistration', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let resourceReg: ResourceRegistration;
  let salonId: string;

  beforeEach(async () => {
    prisma = createMockPrisma();
    resourceReg = new ResourceRegistration(prisma);

    // Create a salon to register resources against
    const salonReg = new SalonRegistration(prisma);
    const salon = await salonReg.createSalon('Test Salon');
    salonId = salon.id;
  });

  describe('registerStaffMember', () => {
    it('creates a staff member with the given role (R3.1)', async () => {
      const staff = await resourceReg.registerStaffMember(salonId, 'Ali Rezaei', 'Stylist');

      expect(staff.salonId).toBe(salonId);
      expect(staff.fullName).toBe('Ali Rezaei');
      expect(staff.role).toBe('Stylist');
      expect(staff.active).toBe(true);
    });

    it('can register multiple staff members for the same salon', async () => {
      const staff1 = await resourceReg.registerStaffMember(salonId, 'Staff 1', 'Owner');
      const staff2 = await resourceReg.registerStaffMember(salonId, 'Staff 2', 'Admin');
      const staff3 = await resourceReg.registerStaffMember(salonId, 'Staff 3', 'Stylist');

      expect(staff1.id).not.toBe(staff2.id);
      expect(staff2.id).not.toBe(staff3.id);
      expect(prisma._staffMembers.length).toBe(3);
    });

    it('supports all valid roles', async () => {
      const owner = await resourceReg.registerStaffMember(salonId, 'Owner', 'Owner');
      const admin = await resourceReg.registerStaffMember(salonId, 'Admin', 'Admin');
      const stylist = await resourceReg.registerStaffMember(salonId, 'Stylist', 'Stylist');

      expect(owner.role).toBe('Owner');
      expect(admin.role).toBe('Admin');
      expect(stylist.role).toBe('Stylist');
    });
  });

  describe('registerChair', () => {
    it('creates a chair for the salon (R3.2)', async () => {
      const chair = await resourceReg.registerChair(salonId, 'Chair A');

      expect(chair.salonId).toBe(salonId);
      expect(chair.name).toBe('Chair A');
      expect(chair.active).toBe(true);
    });

    it('can register multiple chairs for the same salon', async () => {
      const chair1 = await resourceReg.registerChair(salonId, 'Chair 1');
      const chair2 = await resourceReg.registerChair(salonId, 'Chair 2');

      expect(chair1.id).not.toBe(chair2.id);
      expect(prisma._chairs.length).toBe(2);
    });
  });

  describe('registerEquipment', () => {
    it('creates equipment for the salon', async () => {
      const eq = await resourceReg.registerEquipment(salonId, 'Hair Dryer');

      expect(eq.salonId).toBe(salonId);
      expect(eq.name).toBe('Hair Dryer');
    });

    it('can register multiple equipment items', async () => {
      await resourceReg.registerEquipment(salonId, 'Hair Dryer');
      await resourceReg.registerEquipment(salonId, 'Straightener');
      await resourceReg.registerEquipment(salonId, 'Curling Iron');

      expect(prisma._equipment.length).toBe(3);
    });
  });
});

// ─── RegistrationError tests ───────────────────────────────────────────────────

describe('RegistrationError', () => {
  it('has a QR_MALFORMED code with default message', () => {
    const err = new RegistrationError('QR_MALFORMED');
    expect(err.code).toBe('QR_MALFORMED');
    expect(err.name).toBe('RegistrationError');
    expect(err.message).toContain('malformed');
  });

  it('has a QR_UNREGISTERED code with default message', () => {
    const err = new RegistrationError('QR_UNREGISTERED');
    expect(err.code).toBe('QR_UNREGISTERED');
    expect(err.name).toBe('RegistrationError');
    expect(err.message).toContain('registered');
  });

  it('accepts a custom message', () => {
    const err = new RegistrationError('QR_MALFORMED', 'Custom msg');
    expect(err.message).toBe('Custom msg');
    expect(err.code).toBe('QR_MALFORMED');
  });

  it('is an instance of Error', () => {
    const err = new RegistrationError('QR_MALFORMED');
    expect(err).toBeInstanceOf(Error);
  });
});
