import fc from 'fast-check';
import type { Request, Response, NextFunction } from 'express';
import {
  SubscriptionService,
  computeEffectiveStatus,
  computeRenewedExpiry,
} from './subscription.service';
import type { SubscriptionRecord } from './subscription.service';
import {
  DEFAULT_SUBSCRIPTION_PRICES,
  DEFAULT_TRIAL_DAYS,
  PLAN_DURATION_DAYS,
} from './plans';
import type { SubscriptionStatus } from './plans';
import { requireActiveSubscription } from '../http/middleware/require-subscription';

/**
 * Property Tests — Feature: salon-platform-expansion
 *
 * Covers the subscription lifecycle (state machine, renewal, callback
 * idempotency) and the panel write-gating middleware.
 *
 * Property 4: subscription status exclusivity — Validates: Requirements 3.1, 3.10
 * Property 5: renewal without loss        — Validates: Requirements 3.11
 * Property 6: callback idempotency        — Validates: Requirements 3.7
 * Property 8: write gating                — Validates: Requirements 3.9
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ALL_STATUSES: SubscriptionStatus[] = ['trial', 'active', 'grace', 'expired'];

/**
 * Forward-only rank of the lifecycle. As real time advances for a fixed
 * persisted record, the effective status may only move forward through
 * `trial|active` → `grace` → `expired`; it must never move backward. This rank
 * encodes the allowed direction of the state machine.
 */
const STATUS_RANK: Record<SubscriptionStatus, number> = {
  trial: 0,
  active: 0,
  grace: 1,
  expired: 2,
};

// ─── Generators ──────────────────────────────────────────────────────────────

const baseEpoch = Date.UTC(2024, 0, 1);

/** Arbitrary persisted record as the state machine would produce one. */
const subscriptionRecordArb = fc
  .record({
    // The persisted base status is one of the forward-looking statuses or expired.
    status: fc.constantFrom<SubscriptionStatus>('trial', 'active', 'expired'),
    // expiresAt as a day-offset from the base epoch (may be past or future).
    expiresOffsetDays: fc.integer({ min: -60, max: 60 }),
    // Grace window length in days after expiry; sometimes there is no grace window.
    graceDays: fc.option(fc.integer({ min: 0, max: 30 }), { nil: null }),
  })
  .map(({ status, expiresOffsetDays, graceDays }) => {
    const expiresAt = new Date(baseEpoch + expiresOffsetDays * MS_PER_DAY);
    const graceUntil =
      graceDays === null ? null : new Date(expiresAt.getTime() + graceDays * MS_PER_DAY);
    return { status, expiresAt, graceUntil };
  });

/**
 * Reachable persisted record: the state machine only ever *persists* a
 * forward-looking base status (`trial`/`active`) — `grace`/`expired` are derived
 * from timestamps by `computeEffectiveStatus`, never stored as a base. The
 * monotonicity property is meaningful only for these reachable records (a
 * record persisted as `expired` while still inside its window is not a state
 * the service can produce).
 */
const reachableRecordArb = fc
  .record({
    status: fc.constantFrom<SubscriptionStatus>('trial', 'active'),
    expiresOffsetDays: fc.integer({ min: -60, max: 60 }),
    graceDays: fc.option(fc.integer({ min: 0, max: 30 }), { nil: null }),
  })
  .map(({ status, expiresOffsetDays, graceDays }) => {
    const expiresAt = new Date(baseEpoch + expiresOffsetDays * MS_PER_DAY);
    const graceUntil =
      graceDays === null ? null : new Date(expiresAt.getTime() + graceDays * MS_PER_DAY);
    return { status, expiresAt, graceUntil };
  });

/** Arbitrary "now" as a day-offset from the base epoch. */
const nowArb = fc
  .integer({ min: -120, max: 120 })
  .map((days) => new Date(baseEpoch + days * MS_PER_DAY));

// ─── Mocks (mirroring subscription.service.test.ts) ───────────────────────────

const NOW = new Date('2024-01-01T00:00:00.000Z');

/** In-memory single-row Prisma stub for the `subscription` delegate. */
function createMockPrisma() {
  let row: SubscriptionRecord | null = null;
  const payments = new Map<string, any>();
  let paymentSeq = 0;
  return {
    subscription: {
      async create({ data }: { data: Record<string, unknown> }): Promise<SubscriptionRecord> {
        row = {
          id: 'generated-id',
          createdAt: (data.startedAt as Date) ?? NOW,
          ...(data as unknown as Omit<SubscriptionRecord, 'id' | 'createdAt'>),
        };
        return row;
      },
      async findUnique({
        where,
      }: {
        where: { salonId?: string; id?: string };
      }): Promise<SubscriptionRecord | null> {
        if (!row) return null;
        if (where.id !== undefined) return row.id === where.id ? row : null;
        return row.salonId === where.salonId ? row : null;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }): Promise<SubscriptionRecord> {
        if (!row || row.id !== where.id) throw new Error('subscription not found');
        row = { ...row, ...(data as Partial<SubscriptionRecord>) };
        return row;
      },
    },
    subscriptionPayment: {
      async create({ data }: { data: Record<string, unknown> }): Promise<any> {
        const id = `pay-${++paymentSeq}`;
        const record = { id, authority: null, refId: null, createdAt: NOW, ...data };
        payments.set(id, record);
        return record;
      },
      async findUnique({ where }: { where: { id: string } }): Promise<any> {
        return payments.get(where.id) ?? null;
      },
      async findFirst({ where }: { where: { subscriptionId?: string; status?: string; authority?: string } }): Promise<any> {
        return [...payments.values()].find(
          (payment) =>
            (where.subscriptionId === undefined || payment.subscriptionId === where.subscriptionId) &&
            (where.status === undefined || payment.status === where.status) &&
            (where.authority === undefined || payment.authority === where.authority),
        ) ?? null;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }): Promise<any> {
        const existing = payments.get(where.id);
        if (!existing) throw new Error('payment not found');
        const updated = { ...existing, ...data };
        payments.set(where.id, updated);
        return updated;
      },
    },
  } as any;
}

/** Fake PaymentService exposing only the gateway methods the service uses. */
function createMockPaymentService(overrides: { verifyOk?: boolean } = {}) {
  return {
    requestCalls: [] as Array<{ amountRial: number }>,
    verifyCalls: [] as Array<{ authority: string; amountRial: number }>,
    getGatewayName() {
      return 'zarinpal';
    },
    async requestGatewayPayment(amountRial: number) {
      this.requestCalls.push({ amountRial });
      return { authority: 'auth-1', redirectUrl: 'https://gateway.example/pay/auth-1' };
    },
    async verifyGatewayPayment(authority: string, amountRial: number) {
      this.verifyCalls.push({ authority, amountRial });
      return { ok: overrides.verifyOk ?? true, refId: 'ref-1' };
    },
  } as any;
}

const serviceOptions = {
  trialDays: DEFAULT_TRIAL_DAYS,
  prices: DEFAULT_SUBSCRIPTION_PRICES,
  graceDays: 7,
};

// ─── Property 4: subscription status exclusivity ──────────────────────────────

describe('Feature: salon-platform-expansion, Property 4: subscription status exclusivity', () => {
  it('computeEffectiveStatus returns exactly one of trial|active|grace|expired for any record and time', () => {
    fc.assert(
      fc.property(subscriptionRecordArb, nowArb, (record, now) => {
        const status = computeEffectiveStatus(record, now);
        // Exactly one valid status value is produced.
        expect(ALL_STATUSES).toContain(status);
      }),
      { numRuns: 100 },
    );
  });

  it('transitions only move forward through the lifecycle as time advances', () => {
    fc.assert(
      fc.property(reachableRecordArb, nowArb, nowArb, (record, t1, t2) => {
        const earlier = t1.getTime() <= t2.getTime() ? t1 : t2;
        const later = t1.getTime() <= t2.getTime() ? t2 : t1;

        const statusEarlier = computeEffectiveStatus(record, earlier);
        const statusLater = computeEffectiveStatus(record, later);

        // The effective status may only advance (trial/active -> grace -> expired),
        // never regress, as the clock moves forward.
        expect(STATUS_RANK[statusLater]).toBeGreaterThanOrEqual(STATUS_RANK[statusEarlier]);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 5: renewal without loss ─────────────────────────────────────────

describe('Feature: salon-platform-expansion, Property 5: renewal without loss', () => {
  it('renewed expiry equals max(now, expiresAt) + durationDays, preserving remaining days', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -90, max: 90 }), // current expiry offset (days) from base epoch
        fc.constantFrom(
          PLAN_DURATION_DAYS.monthly,
          PLAN_DURATION_DAYS.quarterly,
          PLAN_DURATION_DAYS.annual,
        ),
        fc.integer({ min: -90, max: 90 }), // now offset (days) from base epoch
        (expiresOffsetDays, durationDays, nowOffsetDays) => {
          const expiresAt = new Date(baseEpoch + expiresOffsetDays * MS_PER_DAY);
          const now = new Date(baseEpoch + nowOffsetDays * MS_PER_DAY);

          const renewed = computeRenewedExpiry(expiresAt, durationDays, now);

          const base = Math.max(now.getTime(), expiresAt.getTime());
          // New expiry is exactly base + duration ...
          expect(renewed.getTime()).toBe(base + durationDays * MS_PER_DAY);
          // ... which is >= both now + duration and expiresAt + duration: no
          // remaining days are ever lost.
          expect(renewed.getTime()).toBeGreaterThanOrEqual(now.getTime() + durationDays * MS_PER_DAY);
          expect(renewed.getTime()).toBeGreaterThanOrEqual(
            expiresAt.getTime() + durationDays * MS_PER_DAY,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 6: callback idempotency ─────────────────────────────────────────

describe('Feature: salon-platform-expansion, Property 6: callback idempotency', () => {
  it('processing the same SubscriptionPayment twice never applies activation/extension twice', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<'monthly' | 'quarterly'>('monthly', 'quarterly'),
        fc.integer({ min: 0, max: 100 }), // days after trial start that the callback fires
        async (plan, callbackOffsetDays) => {
          const prisma = createMockPrisma();
          const payment = createMockPaymentService({ verifyOk: true });
          const service = new SubscriptionService(prisma, payment, serviceOptions);

          await service.startTrial('salon-1', NOW);
          await service.initiatePurchase('salon-1', plan);

          const callbackTime = new Date(NOW.getTime() + callbackOffsetDays * MS_PER_DAY);

          const first = await service.activateFromPayment('pay-1', callbackTime);
          const second = await service.activateFromPayment('pay-1', callbackTime);

          // Expiry after the 2nd call is identical to after the 1st: no double extension.
          expect(second.expiresAt.getTime()).toBe(first.expiresAt.getTime());
          expect(second.status).toBe('active');
          // The gateway was verified exactly once; the duplicate short-circuited.
          expect(payment.verifyCalls).toHaveLength(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 8: write gating ─────────────────────────────────────────────────

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const;
const UNSAFE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

function makeReq(method: string, salonId: string): Request {
  return {
    method,
    params: { salonId },
    body: {},
    principal: { id: 'user-1', role: 'Owner' },
  } as unknown as Request;
}

function makeRes() {
  const res: any = {};
  res.statusCode = undefined;
  res.body = undefined;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload: unknown) => {
    res.body = payload;
    return res;
  };
  return res;
}

describe('Feature: salon-platform-expansion, Property 8: write gating', () => {
  it('expired blocks any unsafe (write) method with 402 and never calls next', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...UNSAFE_METHODS), async (method) => {
        const service = { getStatus: jest.fn(async () => 'expired' as SubscriptionStatus) };
        const mw = requireActiveSubscription(service);
        const req = makeReq(method, 'salon-1');
        const res = makeRes();
        let nextCalled = false;
        const next: NextFunction = () => {
          nextCalled = true;
        };

        await mw(req, res as unknown as Response, next);

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(402);
        expect(res.body).toEqual({ code: 'SUBSCRIPTION_REQUIRED' });
      }),
      { numRuns: 100 },
    );
  });

  it('expired allows any safe (read) method through', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...SAFE_METHODS), async (method) => {
        const service = { getStatus: jest.fn(async () => 'expired' as SubscriptionStatus) };
        const mw = requireActiveSubscription(service);
        const req = makeReq(method, 'salon-1');
        const res = makeRes();
        let nextCalled = false;
        const next: NextFunction = () => {
          nextCalled = true;
        };

        await mw(req, res as unknown as Response, next);

        expect(nextCalled).toBe(true);
        expect(res.statusCode).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('trial/active/grace allow every method (read and write) through', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<SubscriptionStatus>('trial', 'active', 'grace'),
        fc.constantFrom(...SAFE_METHODS, ...UNSAFE_METHODS),
        async (status, method) => {
          const service = { getStatus: jest.fn(async () => status) };
          const mw = requireActiveSubscription(service);
          const req = makeReq(method, 'salon-1');
          const res = makeRes();
          let nextCalled = false;
          const next: NextFunction = () => {
            nextCalled = true;
          };

          await mw(req, res as unknown as Response, next);

          expect(nextCalled).toBe(true);
          expect(res.statusCode).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});
