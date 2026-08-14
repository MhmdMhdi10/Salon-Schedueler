/**
 * Feature: salon-booking-system, Property 10: Service-definition validation
 *
 * For any proposed Service definition, the Service_Catalog rejects it with a
 * validation error when the duration is non-positive or the Buffer_Time is
 * negative or the price is negative, and accepts it otherwise.
 *
 * Validates: Requirements 5.3, 5.4
 */

import * as fc from 'fast-check';
import { ServiceCatalog } from './service-catalog';
import { ValidationError } from './validation-error';

// --- Mock PrismaClient ---

function createMockPrisma() {
  return {
    service: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: '00000000-0000-0000-0000-000000000099',
          salonId: data.salonId,
          name: data.name,
          durationMin: data.durationMin,
          bufferMin: data.bufferMin,
          priceRial: data.priceRial,
          requiresDeposit: data.requiresDeposit,
          depositRial: data.depositRial ?? null,
        }),
      ),
    },
  } as any;
}

// --- Generators ---

/** A valid UUID v4 string */
const uuidArb = fc.uuid();

/** Non-empty name (1–50 chars) */
const nameArb = fc.string({ minLength: 1, maxLength: 50 });

/** Positive integer duration (valid: > 0) */
const validDurationArb = fc.integer({ min: 1, max: 480 });

/** Non-negative integer buffer (valid: >= 0) */
const validBufferArb = fc.integer({ min: 0, max: 120 });

/** Non-negative integer price (valid: >= 0) */
const validPriceArb = fc.integer({ min: 0, max: 10_000_000 });

/** Non-positive integer duration (invalid: <= 0) */
const invalidDurationArb = fc.integer({ min: -1000, max: 0 });

/** Negative integer buffer (invalid: < 0) */
const invalidBufferArb = fc.integer({ min: -1000, max: -1 });

/** Negative integer price (invalid: < 0) */
const invalidPriceArb = fc.integer({ min: -10_000_000, max: -1 });

// --- Property Tests ---

describe('Property 10: Service-definition validation', () => {
  it('valid inputs are accepted (duration > 0, buffer >= 0, price >= 0)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        nameArb,
        validDurationArb,
        validBufferArb,
        validPriceArb,
        fc.boolean(),
        async (salonId, name, duration, buffer, price, requiresDeposit) => {
          const prisma = createMockPrisma();
          const catalog = new ServiceCatalog(prisma);

          const input = {
            salonId,
            name,
            durationMinutes: duration,
            bufferMinutes: buffer,
            priceRial: price,
            requiresDeposit,
            requiredEquipmentIds: [],
          };

          // Should resolve without throwing ValidationError
          const result = await catalog.createService(input);
          return result !== undefined && result !== null;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('inputs with duration <= 0 are rejected with ValidationError (R5.3)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        nameArb,
        invalidDurationArb,
        validBufferArb,
        validPriceArb,
        fc.boolean(),
        async (salonId, name, duration, buffer, price, requiresDeposit) => {
          const prisma = createMockPrisma();
          const catalog = new ServiceCatalog(prisma);

          const input = {
            salonId,
            name,
            durationMinutes: duration,
            bufferMinutes: buffer,
            priceRial: price,
            requiresDeposit,
            requiredEquipmentIds: [],
          };

          try {
            await catalog.createService(input);
            return false; // Should not succeed
          } catch (err) {
            return err instanceof ValidationError;
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('inputs with buffer < 0 are rejected with ValidationError (R5.4)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        nameArb,
        validDurationArb,
        invalidBufferArb,
        validPriceArb,
        fc.boolean(),
        async (salonId, name, duration, buffer, price, requiresDeposit) => {
          const prisma = createMockPrisma();
          const catalog = new ServiceCatalog(prisma);

          const input = {
            salonId,
            name,
            durationMinutes: duration,
            bufferMinutes: buffer,
            priceRial: price,
            requiresDeposit,
            requiredEquipmentIds: [],
          };

          try {
            await catalog.createService(input);
            return false; // Should not succeed
          } catch (err) {
            return err instanceof ValidationError;
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('inputs with price < 0 are rejected with ValidationError (R5.4)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        nameArb,
        validDurationArb,
        validBufferArb,
        invalidPriceArb,
        fc.boolean(),
        async (salonId, name, duration, buffer, price, requiresDeposit) => {
          const prisma = createMockPrisma();
          const catalog = new ServiceCatalog(prisma);

          const input = {
            salonId,
            name,
            durationMinutes: duration,
            bufferMinutes: buffer,
            priceRial: price,
            requiresDeposit,
            requiredEquipmentIds: [],
          };

          try {
            await catalog.createService(input);
            return false; // Should not succeed
          } catch (err) {
            return err instanceof ValidationError;
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
