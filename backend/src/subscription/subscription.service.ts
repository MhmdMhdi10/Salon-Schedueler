import type { PrismaClient } from '@prisma/client';
import type { PaymentService } from '../payment/index.js';
import {
  buildPlans,
  DEFAULT_GRACE_DAYS,
  MAX_SUBSCRIPTION_WINDOW_DAYS,
  PURCHASABLE_SUBSCRIPTION_PLAN_KINDS,
  SUBSCRIPTION_REMINDER_DAYS,
  isPurchasableSubscriptionPlan,
  type PlanDefinition,
  type SubscriptionPlanKind,
  type SubscriptionPrices,
  type SubscriptionStatus,
} from './plans.js';

/**
 * Subscription_Service — owns the subscription lifecycle state machine
 * (Requirements 3.1, 3.2, 3.3, 3.9, 3.10, 3.11, 3.12).
 *
 * State machine:
 *
 *   [*] ──register──▶ trial (configured trial days)
 *   trial ──payment──▶ active
 *   trial ──trial ended, no payment──▶ grace
 *   active ──renewal──▶ active (remaining days accumulate)
 *   active ──period ended, no renewal──▶ grace
 *   grace ──payment in grace──▶ active
 *   grace ──grace ended──▶ expired
 *   expired ──re-payment──▶ active
 *
 * `getStatus` returns the *effective* status: it derives `grace`/`expired` from
 * the persisted `expiresAt`/`graceUntil` timestamps rather than trusting a
 * possibly-stale stored status, so transitions happen as time passes without a
 * background job (Requirements 3.9, 3.10).
 *
 * Money fields are integer Rial (IRR) carried as `bigint`. Plan prices are
 * configurable; plan durations are fixed domain constants (Requirement 3.2).
 *
 * Purchase/activation (`initiatePurchase`/`activateFromPayment`) reuse the
 * existing `PaymentService` gateway integration — no second gateway is created
 * (Requirements 3.4, 3.6, 3.7). Activation is idempotent: processing the same
 * `SubscriptionPayment` twice never applies activation twice (Property 6).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A persisted subscription row (mirrors the `Subscription` Prisma model). */
export interface SubscriptionRecord {
  id: string;
  salonId: string;
  status: SubscriptionStatus;
  planKind: SubscriptionPlanKind;
  startedAt: Date;
  expiresAt: Date;
  graceUntil: Date | null;
  createdAt: Date;
}

/** A persisted subscription-payment row (mirrors the `SubscriptionPayment` model). */
export interface SubscriptionPaymentRecord {
  id: string;
  subscriptionId: string;
  planKind: SubscriptionPlanKind;
  amountRial: bigint;
  status: 'pending' | 'paid' | 'refunded' | 'retained' | 'failed';
  gateway: string;
  authority: string | null;
  refId: string | null;
  createdAt: Date;
}

export interface SubscriptionServiceOptions {
  /** Free-trial length in days (Requirement 3.3). */
  trialDays: number;
  /** Configurable paid-plan prices in IRR (Requirement 3.2). */
  prices: SubscriptionPrices;
  /** Grace-period length in days applied after a paid window lapses. */
  graceDays?: number;
  /**
   * Path appended to the PaymentService callback base URL for subscription
   * gateway returns. Defaults to `/subscriptions/callback`.
   */
  callbackPath?: string;
}

/** Stable errors returned when a subscription purchase cannot be accepted. */
export type SubscriptionErrorCode =
  | 'SUBSCRIPTION_PLAN_UNAVAILABLE'
  | 'SUBSCRIPTION_WINDOW_LIMIT_REACHED'
  | 'SUBSCRIPTION_PAYMENT_PENDING';

export class SubscriptionDomainError extends Error {
  constructor(public readonly code: SubscriptionErrorCode) {
    super(code);
    this.name = 'SubscriptionDomainError';
  }
}

/** Minimal inbox port used by the subscription reminder dispatcher. */
export interface SubscriptionReminderInbox {
  emit(input: {
    salonId: string;
    audience: 'owner';
    type: 'subscription.expiring';
    title: string;
    body: string;
    payload: Record<string, unknown>;
  }): Promise<unknown>;
  /** Optional atomic-ish dedupe helper supplied by the durable salon inbox. */
  emitOnce?: (
    input: {
      salonId: string;
      audience: 'owner';
      type: 'subscription.expiring';
      title: string;
      body: string;
      payload: Record<string, unknown>;
    },
    dedupeKey: string,
  ) => Promise<boolean>;
  /** Compatibility fallback for simple test/adapter implementations. */
  hasReminder?: (salonId: string, dedupeKey: string, type?: string) => Promise<boolean>;
}

/**
 * Minimal view of the Prisma delegate this service needs. Declared locally
 * because the checked-in generated Prisma client can be stale and may not yet
 * expose the `subscription` model types; the Composition_Root passes the real
 * `PrismaClient` and we access the delegate through this narrow shape.
 */
interface SubscriptionDelegate {
  create(args: { data: Record<string, unknown> }): Promise<SubscriptionRecord>;
  findUnique(args: { where: { salonId: string } }): Promise<SubscriptionRecord | null>;
  findMany(args: { where: Record<string, unknown> }): Promise<SubscriptionRecord[]>;
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<SubscriptionRecord>;
}

/** Narrow view of the `subscriptionPayment` delegate (stale-client safe). */
interface SubscriptionPaymentDelegate {
  create(args: { data: Record<string, unknown> }): Promise<SubscriptionPaymentRecord>;
  findUnique(args: { where: { id: string } }): Promise<SubscriptionPaymentRecord | null>;
  findFirst?(args: { where: Record<string, unknown> }): Promise<SubscriptionPaymentRecord | null>;
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<SubscriptionPaymentRecord>;
}

export class SubscriptionService {
  private readonly prisma: PrismaClient;
  private readonly paymentService: PaymentService;
  private readonly trialDays: number;
  private readonly graceDays: number;
  private readonly callbackPath: string;
  private readonly plans: Record<SubscriptionPlanKind, PlanDefinition>;

  constructor(
    prisma: PrismaClient,
    paymentService: PaymentService,
    options: SubscriptionServiceOptions,
  ) {
    this.prisma = prisma;
    this.paymentService = paymentService;
    this.trialDays = options.trialDays;
    this.graceDays = options.graceDays ?? DEFAULT_GRACE_DAYS;
    this.callbackPath = options.callbackPath ?? '/subscriptions/callback';
    this.plans = buildPlans(options.trialDays, options.prices);
  }

  /** Access the `subscription` delegate through the narrow local shape. */
  private get subscriptions(): SubscriptionDelegate {
    // The generated client may lag the schema; cast through unknown so this
    // compiles against a stale client while still hitting the real delegate.
    return (this.prisma as unknown as { subscription: SubscriptionDelegate }).subscription;
  }

  /** Access the `subscriptionPayment` delegate through the narrow local shape. */
  private get subscriptionPayments(): SubscriptionPaymentDelegate {
    return (this.prisma as unknown as { subscriptionPayment: SubscriptionPaymentDelegate })
      .subscriptionPayment;
  }

  /** All plan definitions (durations + configurable prices). */
  getPlans(): PlanDefinition[] {
    return Object.values(this.plans);
  }

  /** Only plans that can be purchased now; legacy annual definitions stay readable. */
  getPurchasablePlans(): PlanDefinition[] {
    return PURCHASABLE_SUBSCRIPTION_PLAN_KINDS.map((kind) => this.plans[kind]);
  }

  /** Find a subscription payment by its gateway authority string. */
  async findPaymentByAuthority(authority: string): Promise<SubscriptionPaymentRecord | null> {
    const findFirst = this.subscriptionPayments.findFirst;
    return findFirst ? findFirst.call(this.subscriptionPayments, { where: { authority } }) : null;
  }

  /** Release a gateway checkout that returned a definitive failure. */
  async markPaymentFailedByAuthority(authority: string): Promise<void> {
    const findFirst = this.subscriptionPayments.findFirst;
    if (!findFirst) return;
    const payment = await findFirst.call(this.subscriptionPayments, {
      where: { authority, status: 'pending' },
    });
    if (!payment) return;
    await this.subscriptionPayments.update({
      where: { id: payment.id },
      data: { status: 'failed' },
    });
  }

  /** Look up a single plan definition by kind. */
  getPlan(kind: SubscriptionPlanKind): PlanDefinition {
    return this.plans[kind];
  }

  /**
   * Start a free trial for a newly registered salon (Requirement 3.3).
   *
   * Creates a `Subscription` with status `trial`, plan `trial`, and
   * `expiresAt = now + configured trial days`. No grace window applies to a
   * trial: when the trial lapses without payment the subscription enters
   * `grace` (the trial→grace transition) computed by `getStatus`.
   */
  async startTrial(salonId: string, now: Date = new Date()): Promise<SubscriptionRecord> {
    const expiresAt = addDays(now, this.trialDays);
    return this.subscriptions.create({
      data: {
        salonId,
        status: 'trial',
        planKind: 'trial',
        startedAt: now,
        expiresAt,
        graceUntil: addDays(expiresAt, this.graceDays),
      },
    });
  }

  /**
   * Compute the *effective* current status for a salon (Requirements 3.9, 3.10).
   *
   * The stored `status` is treated as the base, but expiry/grace are derived
   * from the timestamps so the lifecycle advances purely with the passage of
   * time:
   *   - If `now` is before `expiresAt`, the stored `trial`/`active` status holds.
   *   - If `expiresAt` has passed but `now` is within `graceUntil`, status is `grace`.
   *   - If `graceUntil` has passed (or is absent), status is `expired`.
   *
   * @returns the effective status, or `'expired'` when no subscription exists.
   */
  async getStatus(salonId: string, now: Date = new Date()): Promise<SubscriptionStatus> {
    const sub = await this.subscriptions.findUnique({ where: { salonId } });
    if (!sub) {
      return 'expired';
    }
    return computeEffectiveStatus(sub, now);
  }

  /**
   * Effective status plus the fields the owner panel needs to render the
   * subscription card: the current plan and the expiry instant. Returns null
   * when the salon has no subscription row at all (callers decide the default).
   */
  async getStatusResponse(
    salonId: string,
    now: Date = new Date(),
  ): Promise<{ status: SubscriptionStatus; planKind: SubscriptionPlanKind; expiresAt: Date } | null> {
    const sub = await this.subscriptions.findUnique({ where: { salonId } });
    if (!sub) {
      return null;
    }
    return {
      status: computeEffectiveStatus(sub, now),
      planKind: sub.planKind,
      expiresAt: sub.expiresAt,
    };
  }

  /**
   * Begin purchasing a paid plan (Requirements 3.4, 3.6).
   *
   * Creates a `SubscriptionPayment` row in `pending` status with the amount
   * taken from the *configured* plan price, then asks the existing
   * `PaymentService` to open a gateway payment and returns the customer
   * redirect URL. The shared gateway integration is reused — no second gateway
   * is created. The gateway `authority` is persisted on the payment so the
   * callback can be reconciled later.
   *
   * @throws if the salon has no subscription, or if `trial` (a non-purchasable
   *   plan) is requested.
   */
  async initiatePurchase(
    salonId: string,
    plan: SubscriptionPlanKind,
    now: Date = new Date(),
  ): Promise<{ redirectUrl: string }> {
    if (!isPurchasableSubscriptionPlan(plan)) {
      throw new SubscriptionDomainError('SUBSCRIPTION_PLAN_UNAVAILABLE');
    }

    const subscription = await this.subscriptions.findUnique({ where: { salonId } });
    if (!subscription) {
      throw new Error(`No subscription found for salon ${salonId}`);
    }

    // Do not open a second checkout while the first gateway payment is still
    // pending. Without this guard, two quarter payments could be made before
    // either callback arrives; the expiry cap would protect dates but could
    // leave the owner paying twice for one usable window.
    const findFirst = this.subscriptionPayments.findFirst;
    const pendingPayment = findFirst
      ? await findFirst.call(this.subscriptionPayments, {
          where: { subscriptionId: subscription.id, status: 'pending' },
        })
      : null;
    if (pendingPayment) {
      // Keep the lock until the gateway sends a definitive callback. Releasing
      // it by timer could allow a late successful payment to be charged twice.
      throw new SubscriptionDomainError('SUBSCRIPTION_PAYMENT_PENDING');
    }

    const planDef = this.plans[plan];
    const proposedExpiry = computeRenewedExpiryWithinLimit(
      subscription.expiresAt,
      planDef.durationDays,
      now,
    );
    if (!proposedExpiry) {
      throw new SubscriptionDomainError('SUBSCRIPTION_WINDOW_LIMIT_REACHED');
    }
    const gatewayName = this.paymentService.getGatewayName();

    // Create the pending payment record (amount from configured plan price).
    const payment = await this.subscriptionPayments.create({
      data: {
        subscriptionId: subscription.id,
        planKind: plan,
        amountRial: planDef.priceRial,
        status: 'pending',
        gateway: gatewayName,
      },
    });

    // Reuse the existing gateway integration to obtain a redirect URL.
    const { authority, redirectUrl } = await this.paymentService.requestGatewayPayment(
      Number(planDef.priceRial),
      this.callbackPath,
      `Subscription ${plan} for salon ${salonId}`,
    );

    // Persist the gateway authority for later reconciliation.
    await this.subscriptionPayments.update({
      where: { id: payment.id },
      data: { authority },
    });

    return { redirectUrl };
  }

  /**
   * Activate (or renew) a subscription from a gateway return (Requirements
   * 3.5, 3.7, 3.11). IDEMPOTENT (Property 6): a `SubscriptionPayment` that is
   * no longer `pending` is never applied twice — the current subscription is
   * returned unchanged.
   *
   * On a verified payment the payment row is marked `paid`, the subscription is
   * set to `active`, and the new plan's `durationDays` is ADDED to the
   * remaining window so no remaining days are lost:
   *   - If the subscription is still within its window, extend from `expiresAt`.
   *   - If the window has already lapsed, extend from `now`.
   *
   * A failed/unverified payment marks the payment `failed` and leaves the
   * subscription unchanged (Requirement 3.5/3.8).
   */
  async activateFromPayment(
    subscriptionPaymentId: string,
    now: Date = new Date(),
  ): Promise<SubscriptionRecord> {
    const payment = await this.subscriptionPayments.findUnique({
      where: { id: subscriptionPaymentId },
    });
    if (!payment) {
      throw new Error(`SubscriptionPayment ${subscriptionPaymentId} not found`);
    }

    const subscription = await this.subscriptions.findUnique({
      where: { salonId: await this.resolveSalonId(payment.subscriptionId) },
    });
    if (!subscription) {
      throw new Error(`Subscription ${payment.subscriptionId} not found`);
    }

    // IDEMPOTENCY GUARD (Property 6): only a still-pending payment can apply an
    // activation. A payment already marked paid/failed/etc. must not re-apply.
    if (payment.status !== 'pending') {
      return subscription;
    }

    if (!payment.authority) {
      throw new Error(`SubscriptionPayment ${subscriptionPaymentId} has no gateway authority`);
    }

    // Verify with the shared gateway integration.
    const verifyResult = await this.paymentService.verifyGatewayPayment(
      payment.authority,
      Number(payment.amountRial),
    );

    if (!verifyResult.ok) {
      // Failed payment: mark failed, leave the subscription unchanged (R3.5/3.8).
      await this.subscriptionPayments.update({
        where: { id: payment.id },
        data: { status: 'failed' },
      });
      return subscription;
    }

    // Mark the payment paid first so a concurrent/duplicate callback that reads
    // it afterwards short-circuits on the idempotency guard above.
    await this.subscriptionPayments.update({
      where: { id: payment.id },
      data: { status: 'paid', refId: verifyResult.refId ?? null },
    });

    const planDef = this.plans[payment.planKind];
    const newExpiresAt = computeCappedRenewedExpiry(
      subscription.expiresAt,
      planDef.durationDays,
      now,
    );
    const graceUntil = addDays(newExpiresAt, this.graceDays);

    return this.subscriptions.update({
      where: { id: subscription.id },
      data: {
        status: 'active',
        planKind: payment.planKind,
        expiresAt: newExpiresAt,
        graceUntil,
      },
    });
  }

  /**
   * Find active/trial subscriptions inside the reminder horizon. The query is
   * intentionally bounded so the cron task remains cheap as the platform grows.
   */
  async findSubscriptionsExpiringBy(
    now: Date = new Date(),
    maxLeadDays: number = Math.max(...SUBSCRIPTION_REMINDER_DAYS),
  ): Promise<SubscriptionRecord[]> {
    return this.subscriptions.findMany({
      where: {
        status: { in: ['trial', 'active'] },
        expiresAt: { gt: now, lte: addDays(now, maxLeadDays) },
      },
    });
  }

  /**
   * Write at most one durable inbox reminder per checkpoint. Checkpoints are
   * ۷، ۳ و ۱ روز before expiry by default; the closest due checkpoint wins when
   * the scheduler was temporarily offline, preventing a burst of stale notices.
   */
  async dispatchExpiryReminders(
    inbox: SubscriptionReminderInbox,
    now: Date = new Date(),
    reminderDays: readonly number[] = SUBSCRIPTION_REMINDER_DAYS,
  ): Promise<number> {
    const checkpoints = [...new Set(reminderDays)]
      .filter((days) => Number.isFinite(days) && days > 0)
      .sort((a, b) => a - b);
    if (checkpoints.length === 0) return 0;

    const expiring = await this.findSubscriptionsExpiringBy(now, Math.max(...checkpoints));
    const results = await Promise.allSettled(
      expiring.map(async (subscription) => {
        const expiryMs = subscription.expiresAt.getTime();
        const nowMs = now.getTime();
        const due = checkpoints.filter(
          (days) => nowMs >= expiryMs - days * MS_PER_DAY && nowMs < expiryMs,
        );
        if (due.length === 0) return false;

        // Use closest due checkpoint. This makes a delayed scheduler useful
        // without sending several old reminders in one maintenance pass.
        const daysBefore = due[0];
        const dedupeKey = `subscription-expiry:${subscription.id}:${daysBefore}`;
        const daysText = daysBefore.toLocaleString('fa-IR');
        const input = {
          salonId: subscription.salonId,
          audience: 'owner' as const,
          type: 'subscription.expiring' as const,
          title: 'یادآوری تمدید اشتراک',
          body:
            daysBefore === 1
              ? 'اشتراک سالن شما فردا به پایان می‌رسد. برای ادامهٔ دسترسی، اشتراک را تمدید کنید.'
              : `اشتراک سالن شما ${daysText} روز دیگر به پایان می‌رسد. برای جلوگیری از قطع دسترسی، اشتراک را تمدید کنید.`,
          payload: {
            subscriptionId: subscription.id,
            reminderDaysBefore: daysBefore,
            expiresAt: subscription.expiresAt.toISOString(),
            dedupeKey,
          },
        };

        if (inbox.emitOnce) return inbox.emitOnce(input, dedupeKey);
        if (inbox.hasReminder && (await inbox.hasReminder(subscription.salonId, dedupeKey))) {
          return false;
        }
        await inbox.emit(input);
        return true;
      }),
    );

    return results.reduce(
      (count, result) => count + (result.status === 'fulfilled' && result.value ? 1 : 0),
      0,
    );
  }

  /**
   * Resolve a salonId from a subscriptionId. The narrow delegate only exposes
   * `findUnique({ where: { salonId } })`, so we read through the full client.
   */
  private async resolveSalonId(subscriptionId: string): Promise<string> {
    const row = await (
      this.prisma as unknown as {
        subscription: {
          findUnique(args: {
            where: { id: string };
          }): Promise<{ salonId: string } | null>;
        };
      }
    ).subscription.findUnique({ where: { id: subscriptionId } });
    if (!row) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }
    return row.salonId;
  }
}

/**
 * Compute the renewed expiry without losing remaining days (Requirement 3.11,
 * Property 5). If the current window is still in the future, the new duration
 * is added on top of the remaining `expiresAt`; if it has already lapsed, the
 * new window starts from `now`.
 */
export function computeRenewedExpiry(
  currentExpiresAt: Date,
  durationDays: number,
  now: Date,
): Date {
  const base = currentExpiresAt.getTime() > now.getTime() ? currentExpiresAt : now;
  return addDays(base, durationDays);
}

/** Return null when a renewal would pass the rolling three-month ceiling. */
export function computeRenewedExpiryWithinLimit(
  currentExpiresAt: Date,
  durationDays: number,
  now: Date,
  maxWindowDays: number = MAX_SUBSCRIPTION_WINDOW_DAYS,
): Date | null {
  const renewed = computeRenewedExpiry(currentExpiresAt, durationDays, now);
  return renewed.getTime() <= addDays(now, maxWindowDays).getTime() ? renewed : null;
}

/**
 * Safety net for already-created/concurrent payments. Never extends beyond the
 * ceiling; never shortens an existing entitlement that was already beyond it.
 */
export function computeCappedRenewedExpiry(
  currentExpiresAt: Date,
  durationDays: number,
  now: Date,
  maxWindowDays: number = MAX_SUBSCRIPTION_WINDOW_DAYS,
): Date {
  const renewed = computeRenewedExpiry(currentExpiresAt, durationDays, now);
  const ceiling = addDays(now, maxWindowDays);
  if (currentExpiresAt.getTime() > ceiling.getTime()) return currentExpiresAt;
  return renewed.getTime() > ceiling.getTime() ? ceiling : renewed;
}

/**
 * Pure derivation of the effective status from persisted dates. Exported for
 * direct unit/property testing of the state machine without a database.
 */
export function computeEffectiveStatus(
  sub: Pick<SubscriptionRecord, 'status' | 'expiresAt' | 'graceUntil'>,
  now: Date,
): SubscriptionStatus {
  const nowMs = now.getTime();

  // Still within the active/trial window.
  if (nowMs < sub.expiresAt.getTime()) {
    // A lapsed window can never read as a fresh trial/active again; only the
    // forward-looking statuses are meaningful here.
    return sub.status === 'expired' ? 'expired' : sub.status;
  }

  // Window has elapsed: in grace if a grace deadline is set and not yet passed.
  if (sub.graceUntil && nowMs < sub.graceUntil.getTime()) {
    return 'grace';
  }

  // Past the grace deadline (or no grace window): expired.
  return 'expired';
}

/** Add a whole number of days to a date, returning a new `Date`. */
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}
