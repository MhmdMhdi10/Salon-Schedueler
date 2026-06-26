import fc from 'fast-check';
import type { PrismaClient } from '@prisma/client';
import { encodeSalonQr, parseSalonQr } from '@salon/shared';
import { QrService, DEFAULT_QR_SOURCE } from './qr.service';

/**
 * Property Tests — Feature: salon-platform-expansion
 *
 * Covers stable per-salon QR generation, the campaign destination URL, and
 * scan counting owned by the QR_Service.
 *
 * Property 7: QR payload stability / round-trip — Validates: Requirements 4.1, 4.2
 * Campaign-url assertion                         — Validates: Requirements 4.4
 * Scan-count assertion                           — Validates: Requirements 4.4, 4.5
 */

// ─── Mock Prisma (mirroring qr.service.test.ts) ──────────────────────────────

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

// ─── Generators ──────────────────────────────────────────────────────────────

/**
 * Arbitrary salon `qrToken`. Tokens are non-empty (the codec rejects an empty
 * token as malformed) and drawn from a realistic id-like charset plus dots, so
 * the round-trip property is exercised even when a token itself contains the
 * `.` separator the codec uses internally.
 */
const qrTokenArb = fc
  .stringOf(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.'.split(''),
    ),
    { minLength: 1, maxLength: 64 },
  )
  .filter((t) => t.length > 0);

/** Arbitrary public profile slug. */
const slugArb = fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.length > 0);

/** Arbitrary campaign source value. */
const sourceArb = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')), {
    minLength: 1,
    maxLength: 20,
  })
  .filter((s) => s.length > 0);

// ─── Property 7: QR payload stability / round-trip ───────────────────────────

describe('Feature: salon-platform-expansion, Property 7: QR payload stability/round-trip', () => {
  it('buildSalonQrPayload round-trips through parseSalonQr back to the original qrToken (R4.1, R4.2)', async () => {
    await fc.assert(
      fc.asyncProperty(qrTokenArb, async (qrToken) => {
        const { prisma } = createMockPrisma([{ id: 'salon-1', qrToken }]);
        const service = new QrService(prisma);

        const payload = await service.buildSalonQrPayload('salon-1');

        // The payload is exactly what the shared codec produces for the token,
        // and parsing it recovers the original, unchanged token.
        expect(payload).toBe(encodeSalonQr(qrToken));
        expect(parseSalonQr(payload)).toEqual({ kind: 'ok', salonToken: qrToken });
      }),
      { numRuns: 200 },
    );
  });

  it('repeated calls with an unchanged qrToken yield identical payloads (R4.2)', async () => {
    await fc.assert(
      fc.asyncProperty(qrTokenArb, fc.integer({ min: 2, max: 6 }), async (qrToken, calls) => {
        const { prisma } = createMockPrisma([{ id: 'salon-1', qrToken }]);
        const service = new QrService(prisma);

        const first = await service.buildSalonQrPayload('salon-1');
        for (let i = 1; i < calls; i++) {
          const next = await service.buildSalonQrPayload('salon-1');
          // Stable: every call reproduces the first payload byte-for-byte.
          expect(next).toBe(first);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Campaign-url assertion ──────────────────────────────────────────────────

describe('Feature: salon-platform-expansion, Property 7 (campaign url): utm_source always present', () => {
  it('buildSalonQrUrl includes the default utm_source=qr for any slug (R4.4)', () => {
    fc.assert(
      fc.property(slugArb, (slug) => {
        const { prisma } = createMockPrisma([]);
        const service = new QrService(prisma);

        const url = service.buildSalonQrUrl(slug);
        const parsed = new URL(url);

        // The campaign source is always attached, defaulting to `qr`.
        expect(parsed.searchParams.get('utm_source')).toBe(DEFAULT_QR_SOURCE);
        // ...and the slug is preserved (URL-encoded) on the /s/ path.
        expect(parsed.pathname).toBe(`/s/${encodeURIComponent(slug)}`);
      }),
      { numRuns: 100 },
    );
  });

  it('buildSalonQrUrl includes the supplied campaign source for any slug/source (R4.4)', () => {
    fc.assert(
      fc.property(slugArb, sourceArb, (slug, source) => {
        const { prisma } = createMockPrisma([]);
        const service = new QrService(prisma);

        const url = service.buildSalonQrUrl(slug, source);
        const parsed = new URL(url);

        expect(parsed.searchParams.get('utm_source')).toBe(source);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Scan-count assertion ────────────────────────────────────────────────────

describe('Feature: salon-platform-expansion, Property 7 (scan count): one event per recordScan', () => {
  it('recordScan inserts exactly one QrScanEvent per call with the given salonId/source (R4.4, R4.5)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 24 }),
        sourceArb,
        fc.integer({ min: 1, max: 10 }),
        async (salonId, source, callCount) => {
          const { prisma, scanEvents } = createMockPrisma([]);
          const service = new QrService(prisma);

          for (let i = 0; i < callCount; i++) {
            await service.recordScan(salonId, source);
          }

          // Exactly one event is inserted per call — no more, no less.
          expect(scanEvents).toHaveLength(callCount);
          // Every inserted event carries the supplied salonId and source.
          for (const event of scanEvents) {
            expect(event).toMatchObject({ salonId, source });
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
