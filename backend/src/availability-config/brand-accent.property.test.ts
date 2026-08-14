/**
 * Feature: signature-ui-system, Property 4: Brand_Accent selection persists across sessions
 *
 * For any Brand_Accent key in the curated ACCENTS palette, persisting it for a
 * salon and then re-reading it in a new session returns the same key. The write
 * path is AvailabilityConfig.setSalonBrandAccent (owner-guarded at the API layer)
 * and the public read path is SalonRegistration.getSalonBrandAccent (the
 * anonymous storefront/funnel read). Both are exercised against a shared
 * in-memory store standing in for the salon row, so a fresh reader instance
 * models a brand-new session reading the persisted value.
 *
 * Validates: Requirements 4.1
 */

import * as fc from 'fast-check';
import { AvailabilityConfig } from './availability-config';
import { SalonRegistration } from '../registration/salon-registration';

/**
 * In-memory Prisma stand-in: `salon.update` persists `brand_accent` and
 * `salon.findUnique` reads it back, so set→read round-trips through one store
 * exactly as a real row would across sessions. No database required.
 */
function createMockPrisma() {
  const store = new Map<string, string | null>();
  return {
    salon: {
      update: jest.fn(async ({ where, data }: any) => {
        store.set(where.id, data.brandAccent ?? null);
        return { id: where.id, brandAccent: store.get(where.id) ?? null };
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        if (!store.has(where.id)) {
          return null;
        }
        return { brandAccent: store.get(where.id) ?? null };
      }),
    },
  } as any;
}

/** Mirrors the curated `ACCENTS` palette keys used by the storefront theming. */
const accentKeyArb = fc.constantFrom(
  'rose',
  'amber',
  'emerald',
  'violet',
  'magenta',
  'teal',
  'night',
);

describe('Feature: signature-ui-system, Property 4: Brand_Accent selection persists across sessions', () => {
  it('persisting an accent then re-reading it in a new session returns the same key', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), accentKeyArb, async (salonId, accentKey) => {
        const prisma = createMockPrisma();
        const writer = new AvailabilityConfig(prisma);
        await writer.setSalonBrandAccent(salonId, accentKey);

        // A fresh reader over the same persistent store models a new session.
        const reader = new SalonRegistration(prisma);
        const read = await reader.getSalonBrandAccent(salonId);
        return read === accentKey;
      }),
      { numRuns: 100 },
    );
  });

  it('clearing the accent to null persists as the signature default across sessions', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), accentKeyArb, async (salonId, accentKey) => {
        const prisma = createMockPrisma();
        const writer = new AvailabilityConfig(prisma);
        await writer.setSalonBrandAccent(salonId, accentKey); // configure first
        await writer.setSalonBrandAccent(salonId, null); // then clear to default

        const reader = new SalonRegistration(prisma);
        return (await reader.getSalonBrandAccent(salonId)) === null;
      }),
      { numRuns: 100 },
    );
  });
});
