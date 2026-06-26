import type { PrismaClient } from '@prisma/client';
import { encodeSalonQr, parseSalonQr } from '@salon/shared';
import { QrService, DEFAULT_PUBLIC_BASE_URL } from './qr.service';

/**
 * Unit tests for the QR_Service (Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.7).
 * Dedicated property / round-trip tests follow in task 4.3.
 */

interface SalonRow {
  id: string;
  qrToken: string;
}

/** In-memory Prisma stub exposing `salon.findUnique` and `qrScanEvent.create`. */
function createMockPrisma(salons: SalonRow[]) {
  const byId = new Map(salons.map((s) => [s.id, s]));
  const scanEvents: Array<{ id: string; salonId: string; source: string }> = [];
  let seq = 0;
  const prisma = {
    salon: {
      async findUnique({ where }: { where: { id?: string } }): Promise<SalonRow | null> {
        if (where.id === undefined) return null;
        return byId.get(where.id) ?? null;
      },
    },
    qrScanEvent: {
      async create({ data }: { data: Record<string, unknown> }) {
        const record = {
          id: `scan-${++seq}`,
          salonId: data.salonId as string,
          source: data.source as string,
        };
        scanEvents.push(record);
        return record;
      },
    },
  };
  return { prisma: prisma as unknown as PrismaClient, scanEvents };
}

describe('QrService.buildSalonQrPayload', () => {
  it('encodes the salon qrToken via the shared codec (R4.1, R4.2)', async () => {
    const { prisma } = createMockPrisma([{ id: 'salon-1', qrToken: 'token-abc' }]);
    const service = new QrService(prisma);

    const payload = await service.buildSalonQrPayload('salon-1');

    expect(payload).toBe(encodeSalonQr('token-abc'));
  });

  it('produces a payload that round-trips back to the qrToken (R4.2, Property 7)', async () => {
    const { prisma } = createMockPrisma([{ id: 'salon-1', qrToken: 'token-abc' }]);
    const service = new QrService(prisma);

    const payload = await service.buildSalonQrPayload('salon-1');
    const parsed = parseSalonQr(payload);

    expect(parsed).toEqual({ kind: 'ok', salonToken: 'token-abc' });
  });

  it('is stable across repeated calls while qrToken is unchanged (R4.7)', async () => {
    const { prisma } = createMockPrisma([{ id: 'salon-1', qrToken: 'token-abc' }]);
    const service = new QrService(prisma);

    const first = await service.buildSalonQrPayload('salon-1');
    const second = await service.buildSalonQrPayload('salon-1');

    expect(first).toBe(second);
  });

  it('throws when the salon does not exist', async () => {
    const { prisma } = createMockPrisma([]);
    const service = new QrService(prisma);

    await expect(service.buildSalonQrPayload('missing')).rejects.toThrow('Salon not found: missing');
  });
});

describe('QrService.buildSalonQrUrl', () => {
  it('builds the public profile URL with the default utm_source=qr (R4.3, R4.4)', () => {
    const { prisma } = createMockPrisma([]);
    const service = new QrService(prisma);

    expect(service.buildSalonQrUrl('my-salon')).toBe(
      `${DEFAULT_PUBLIC_BASE_URL}/s/my-salon?utm_source=qr`,
    );
  });

  it('honors a custom campaign source', () => {
    const { prisma } = createMockPrisma([]);
    const service = new QrService(prisma);

    expect(service.buildSalonQrUrl('my-salon', 'instagram')).toBe(
      `${DEFAULT_PUBLIC_BASE_URL}/s/my-salon?utm_source=instagram`,
    );
  });

  it('honors a configurable public base URL and strips a trailing slash', () => {
    const { prisma } = createMockPrisma([]);
    const service = new QrService(prisma, { publicBaseUrl: 'https://salon.example.com/' });

    expect(service.buildSalonQrUrl('my-salon')).toBe(
      'https://salon.example.com/s/my-salon?utm_source=qr',
    );
  });

  it('url-encodes the slug', () => {
    const { prisma } = createMockPrisma([]);
    const service = new QrService(prisma);

    expect(service.buildSalonQrUrl('a salon/with chars')).toBe(
      `${DEFAULT_PUBLIC_BASE_URL}/s/a%20salon%2Fwith%20chars?utm_source=qr`,
    );
  });
});

describe('QrService.recordScan', () => {
  it('inserts a QrScanEvent with the salon and source (R4.4, R4.5)', async () => {
    const { prisma, scanEvents } = createMockPrisma([{ id: 'salon-1', qrToken: 'token-abc' }]);
    const service = new QrService(prisma);

    await service.recordScan('salon-1', 'qr');

    expect(scanEvents).toHaveLength(1);
    expect(scanEvents[0]).toMatchObject({ salonId: 'salon-1', source: 'qr' });
  });
});
