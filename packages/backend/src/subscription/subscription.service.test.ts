import { SubscriptionService, computeEffectiveStatus, computeRenewedExpiry } from './subscription.service';
import type { SubscriptionRecord } from './subscription.service';
import {
  buildPlans,
  DEFAULT_SUBSCRIPTION_PRICES,
  DEFAULT_TRIAL_DAYS,
  PLAN_DURATION_DAYS,
} from './plans';
import type { SubscriptionStatus } from './plans';

/**
 * Unit tests for the Subscription_Service state machine and effective-status
 * computation (Requirements 3.1, 3.2, 3.3, 3.9, 3.10, 3.12). Dedicated property
 * tests follow in task 3.4.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2024-01-01T00:00:00.000Z');

function rec(overrides: Partial<SubscriptionRecord>): SubscriptionRecord {
  return {
    id: 'sub-1',
    salonId: 'salon-1',
    status: 'trial',
    planKind: 'trial',
    startedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 14 * MS_PER_DAY),
    graceUntil: new Date(NOW.getTime() + 21 * MS_PER_DAY),
    createdAt: NOW,
    ...overrides,
  };
}

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
        const record = {
          id,
          authority: null,
          refId: null,
          createdAt: NOW,
          ...data,
        };
        payments.set(id, record);
        return record;
      },
      async findUnique({ where }: { where: { id: string } }): Promise<any> {
        return payments.get(where.id) ?? null;
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
    _setRow(r: SubscriptionRecord | null) {
      row = r;
    },
    _setSubscription(r: SubscriptionRecord) {
      row = r;
    },
  } as any;
}

/**
 * Fake PaymentService exposing only the gateway methods the
 * Subscription_Service uses. Lets tests drive success/failure deterministically
 * without a real gateway.
 */
function createMockPaymentService(
  overrides: {
    verifyOk?: boolean;
    refId?: string;
    authority?: string;
    redirectUrl?: string;
  } = {},
) {
  return {
    requestCalls: [] as Array<{ amountRial: number; callbackPath: string; description: string }>,
    verifyCalls: [] as Array<{ authority: string; amountRial: number }>,
    getGatewayName() {
      return 'zarinpal';
    },
    async requestGatewayPayment(amountRial: number, callbackPath: string, description: string) {
      this.requestCalls.push({ amountRial, callbackPath, description });
      return {
        authority: overrides.authority ?? 'auth-1',
        redirectUrl: overrides.redirectUrl ?? 'https://gateway.example/pay/auth-1',
      };
    },
    async verifyGatewayPayment(authority: string, amountRial: number) {
      this.verifyCalls.push({ authority, amountRial });
      return { ok: overrides.verifyOk ?? true, refId: overrides.refId ?? 'ref-1' };
    },
  } as any;
}

const options = {
  trialDays: DEFAULT_TRIAL_DAYS,
  prices: DEFAULT_SUBSCRIPTION_PRICES,
  graceDays: 7,
};

function makeService(
  prisma = createMockPrisma(),
  payment = createMockPaymentService(),
  opts = options,
) {
  return { prisma, payment, service: new SubscriptionService(prisma, payment, opts) };
}

describe('SubscriptionService.startTrial (R3.3)', () => {
  it('creates a trial subscription expiring after the configured trial days', async () => {
    const prisma = createMockPrisma();
    const service = new SubscriptionService(prisma, createMockPaymentService(), options);

    const sub = await service.startTrial('salon-1', NOW);

    expect(sub.status).toBe('trial');
    expect(sub.planKind).toBe('trial');
    expect(sub.expiresAt.getTime()).toBe(NOW.getTime() + DEFAULT_TRIAL_DAYS * MS_PER_DAY);
  });

  it('honours a configurable trial length', async () => {
    const prisma = createMockPrisma();
    const service = new SubscriptionService(prisma, createMockPaymentService(), { ...options, trialDays: 30 });

    const sub = await service.startTrial('salon-1', NOW);

    expect(sub.expiresAt.getTime()).toBe(NOW.getTime() + 30 * MS_PER_DAY);
  });
});

describe('SubscriptionService.getStatus effective computation (R3.9, R3.10)', () => {
  it('returns trial while within the trial window', async () => {
    const prisma = createMockPrisma();
    const service = new SubscriptionService(prisma, createMockPaymentService(), options);
    await service.startTrial('salon-1', NOW);

    const status = await service.getStatus('salon-1', new Date(NOW.getTime() + 5 * MS_PER_DAY));
    expect(status).toBe('trial');
  });

  it('returns grace once the trial window has lapsed without payment (trial -> grace)', async () => {
    const prisma = createMockPrisma();
    const service = new SubscriptionService(prisma, createMockPaymentService(), options);
    await service.startTrial('salon-1', NOW);

    const status = await service.getStatus('salon-1', new Date(NOW.getTime() + 16 * MS_PER_DAY));
    expect(status).toBe('grace');
  });

  it('returns expired once the grace window has lapsed (grace -> expired)', async () => {
    const prisma = createMockPrisma();
    const service = new SubscriptionService(prisma, createMockPaymentService(), options);
    await service.startTrial('salon-1', NOW);

    const status = await service.getStatus('salon-1', new Date(NOW.getTime() + 30 * MS_PER_DAY));
    expect(status).toBe('expired');
  });

  it('returns expired when no subscription exists for the salon', async () => {
    const prisma = createMockPrisma();
    const service = new SubscriptionService(prisma, createMockPaymentService(), options);

    const status = await service.getStatus('unknown-salon', NOW);
    expect(status).toBe('expired');
  });
});

describe('computeEffectiveStatus state transitions', () => {
  const cases: Array<{
    name: string;
    record: Pick<SubscriptionRecord, 'status' | 'expiresAt' | 'graceUntil'>;
    now: Date;
    expected: SubscriptionStatus;
  }> = [
    {
      name: 'active within window stays active',
      record: rec({ status: 'active' }),
      now: new Date(NOW.getTime() + 3 * MS_PER_DAY),
      expected: 'active',
    },
    {
      name: 'active past window enters grace (active -> grace)',
      record: rec({ status: 'active' }),
      now: new Date(NOW.getTime() + 15 * MS_PER_DAY),
      expected: 'grace',
    },
    {
      name: 'active past grace becomes expired',
      record: rec({ status: 'active' }),
      now: new Date(NOW.getTime() + 25 * MS_PER_DAY),
      expected: 'expired',
    },
    {
      name: 'trial within window stays trial',
      record: rec({ status: 'trial' }),
      now: new Date(NOW.getTime() + 1 * MS_PER_DAY),
      expected: 'trial',
    },
    {
      name: 'no grace window set -> expired immediately after window',
      record: rec({ status: 'active', graceUntil: null }),
      now: new Date(NOW.getTime() + 15 * MS_PER_DAY),
      expected: 'expired',
    },
    {
      name: 'stored expired stays expired even within a stale window',
      record: rec({ status: 'expired' }),
      now: NOW,
      expected: 'expired',
    },
  ];

  it.each(cases)('$name', ({ record, now, expected }) => {
    expect(computeEffectiveStatus(record, now)).toBe(expected);
  });

  it('treats the exact expiry boundary as no-longer-active (grace)', () => {
    const record = rec({ status: 'active' });
    expect(computeEffectiveStatus(record, record.expiresAt)).toBe('grace');
  });
});

describe('plan definitions (R3.1, R3.2)', () => {
  it('exposes trial + monthly/quarterly/annual with fixed durations and configurable prices', () => {
    const plans = buildPlans(DEFAULT_TRIAL_DAYS, DEFAULT_SUBSCRIPTION_PRICES);

    expect(plans.trial.durationDays).toBe(DEFAULT_TRIAL_DAYS);
    expect(plans.trial.priceRial).toBe(0n);
    expect(plans.monthly.durationDays).toBe(PLAN_DURATION_DAYS.monthly);
    expect(plans.quarterly.durationDays).toBe(PLAN_DURATION_DAYS.quarterly);
    expect(plans.annual.durationDays).toBe(PLAN_DURATION_DAYS.annual);
  });

  it('carries prices as bigint IRR and reflects configured values', () => {
    const custom = { monthlyRial: 1n, quarterlyRial: 2n, annualRial: 3n };
    const plans = buildPlans(DEFAULT_TRIAL_DAYS, custom);

    expect(typeof plans.monthly.priceRial).toBe('bigint');
    expect(plans.monthly.priceRial).toBe(1n);
    expect(plans.quarterly.priceRial).toBe(2n);
    expect(plans.annual.priceRial).toBe(3n);
  });

  it('getPlans/getPlan expose definitions from the service', () => {
    const service = new SubscriptionService(createMockPrisma(), createMockPaymentService(), options);
    expect(service.getPlans()).toHaveLength(4);
    expect(service.getPlan('annual').durationDays).toBe(PLAN_DURATION_DAYS.annual);
  });
});

describe('SubscriptionService.initiatePurchase (R3.4, R3.6)', () => {
  it('creates a pending payment with the configured plan price and returns the gateway redirect', async () => {
    const { prisma, payment, service } = makeService();
    await service.startTrial('salon-1', NOW);

    const result = await service.initiatePurchase('salon-1', 'monthly');

    expect(result.redirectUrl).toBe('https://gateway.example/pay/auth-1');
    // The gateway was asked for the configured monthly price in IRR.
    expect(payment.requestCalls).toHaveLength(1);
    expect(payment.requestCalls[0].amountRial).toBe(Number(DEFAULT_SUBSCRIPTION_PRICES.monthlyRial));

    // A pending SubscriptionPayment was created with the gateway authority.
    const created = await prisma.subscriptionPayment.findUnique({ where: { id: 'pay-1' } });
    expect(created.status).toBe('pending');
    expect(created.planKind).toBe('monthly');
    expect(created.amountRial).toBe(DEFAULT_SUBSCRIPTION_PRICES.monthlyRial);
    expect(created.authority).toBe('auth-1');
  });

  it('rejects purchasing the non-purchasable trial plan', async () => {
    const { service } = makeService();
    await service.startTrial('salon-1', NOW);

    await expect(service.initiatePurchase('salon-1', 'trial')).rejects.toThrow();
  });

  it('throws when the salon has no subscription', async () => {
    const { service } = makeService();
    await expect(service.initiatePurchase('unknown', 'monthly')).rejects.toThrow();
  });
});

describe('SubscriptionService.activateFromPayment (R3.5, R3.7, R3.11)', () => {
  it('activates the subscription and extends expiry on a verified payment (R3.7)', async () => {
    const { prisma, service } = makeService(createMockPrisma(), createMockPaymentService({ verifyOk: true }));
    await service.startTrial('salon-1', NOW);
    await service.initiatePurchase('salon-1', 'monthly');

    const before = await prisma.subscription.findUnique({ where: { salonId: 'salon-1' } });
    const updated = await service.activateFromPayment('pay-1', NOW);

    expect(updated.status).toBe('active');
    expect(updated.planKind).toBe('monthly');
    // Trial window (still active) extended by 30 days on top of remaining time.
    expect(updated.expiresAt.getTime()).toBe(
      before.expiresAt.getTime() + PLAN_DURATION_DAYS.monthly * MS_PER_DAY,
    );

    const paid = await prisma.subscriptionPayment.findUnique({ where: { id: 'pay-1' } });
    expect(paid.status).toBe('paid');
    expect(paid.refId).toBe('ref-1');
  });

  it('is idempotent: processing the same payment twice does not activate twice (R3.7, Property 6)', async () => {
    const { prisma, payment, service } = makeService(
      createMockPrisma(),
      createMockPaymentService({ verifyOk: true }),
    );
    await service.startTrial('salon-1', NOW);
    await service.initiatePurchase('salon-1', 'monthly');

    const first = await service.activateFromPayment('pay-1', NOW);
    const expiryAfterFirst = first.expiresAt.getTime();

    const second = await service.activateFromPayment('pay-1', NOW);

    // Expiry is unchanged by the second processing; no double extension.
    expect(second.expiresAt.getTime()).toBe(expiryAfterFirst);
    // The gateway was only verified once — the second call short-circuited.
    expect(payment.verifyCalls).toHaveLength(1);

    const paid = await prisma.subscriptionPayment.findUnique({ where: { id: 'pay-1' } });
    expect(paid.status).toBe('paid');
  });

  it('leaves the subscription unchanged on a failed payment (R3.5/3.8)', async () => {
    const prisma = createMockPrisma();
    const { service } = makeService(prisma, createMockPaymentService({ verifyOk: false }));
    await service.startTrial('salon-1', NOW);
    await service.initiatePurchase('salon-1', 'monthly');

    const before = await prisma.subscription.findUnique({ where: { salonId: 'salon-1' } });
    const result = await service.activateFromPayment('pay-1', NOW);

    expect(result.status).toBe(before.status);
    expect(result.expiresAt.getTime()).toBe(before.expiresAt.getTime());

    const failed = await prisma.subscriptionPayment.findUnique({ where: { id: 'pay-1' } });
    expect(failed.status).toBe('failed');
  });

  it('extends from now when the current window has already lapsed', async () => {
    const prisma = createMockPrisma();
    const { service } = makeService(prisma, createMockPaymentService({ verifyOk: true }));
    await service.startTrial('salon-1', NOW);
    await service.initiatePurchase('salon-1', 'monthly');

    // Renew well after the trial + grace window has lapsed.
    const later = new Date(NOW.getTime() + 100 * MS_PER_DAY);
    const updated = await service.activateFromPayment('pay-1', later);

    expect(updated.expiresAt.getTime()).toBe(later.getTime() + PLAN_DURATION_DAYS.monthly * MS_PER_DAY);
  });
});

describe('computeRenewedExpiry renewal accumulation (R3.11, Property 5)', () => {
  it('adds duration on top of the remaining window when still active', () => {
    const expiresAt = new Date(NOW.getTime() + 10 * MS_PER_DAY);
    const renewed = computeRenewedExpiry(expiresAt, 30, NOW);
    expect(renewed.getTime()).toBe(expiresAt.getTime() + 30 * MS_PER_DAY);
    // Remaining days are not lost: new expiry exceeds now + duration.
    expect(renewed.getTime()).toBeGreaterThan(NOW.getTime() + 30 * MS_PER_DAY);
  });

  it('extends from now when the window has already lapsed', () => {
    const expiresAt = new Date(NOW.getTime() - 5 * MS_PER_DAY);
    const renewed = computeRenewedExpiry(expiresAt, 30, NOW);
    expect(renewed.getTime()).toBe(NOW.getTime() + 30 * MS_PER_DAY);
  });
});
