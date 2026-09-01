/**
 * Subscription plan definitions (Requirement 3.1, 3.2).
 *
 * The platform keeps a free trial plus the historical paid-plan definitions.
 * Only monthly and quarterly plans are currently purchasable. The annual
 * definition remains readable so existing subscriptions and old reports keep
 * working after the catalogue change.
 */

/** Effective subscription lifecycle status. Mirrors the `SubscriptionStatus` enum. */
export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'expired';

/** Subscription plan kind. Mirrors the `SubscriptionPlanKind` enum. */
export type SubscriptionPlanKind = 'trial' | 'monthly' | 'quarterly' | 'annual';

/** Paid plans currently exposed for new purchases. */
export const PURCHASABLE_SUBSCRIPTION_PLAN_KINDS = ['monthly', 'quarterly'] as const;
export type PurchasableSubscriptionPlanKind =
  (typeof PURCHASABLE_SUBSCRIPTION_PLAN_KINDS)[number];

/** A single plan: its kind, how many days it grants, and its price in IRR. */
export interface PlanDefinition {
  kind: SubscriptionPlanKind;
  /** Number of days this plan adds to the subscription window. */
  durationDays: number;
  /** Price in integer Rial (IRR). Trial is always 0. Configurable for paid plans. */
  priceRial: bigint;
}

/** Configurable prices for the paid plans, in integer Rial (IRR). */
export interface SubscriptionPrices {
  monthlyRial: bigint;
  quarterlyRial: bigint;
  annualRial: bigint;
}

/**
 * Fixed plan durations in days. These are domain constants (not configurable):
 * a month is 30 days, a quarter 90 days, a year 365 days. The trial length is
 * configurable and supplied separately.
 */
export const PLAN_DURATION_DAYS: Record<Exclude<SubscriptionPlanKind, 'trial'>, number> = {
  monthly: 30,
  quarterly: 90,
  annual: 365,
};

/** Maximum distance between now and a subscription expiry. */
export const MAX_SUBSCRIPTION_WINDOW_DAYS = PLAN_DURATION_DAYS.quarterly;

/** Reminder checkpoints used by the subscription maintenance task. */
export const SUBSCRIPTION_REMINDER_DAYS = [7, 3, 1] as const;

export function isPurchasableSubscriptionPlan(
  kind: string,
): kind is PurchasableSubscriptionPlanKind {
  return (PURCHASABLE_SUBSCRIPTION_PLAN_KINDS as readonly string[]).includes(kind);
}

/** Documented default paid-plan prices in IRR, used when no env override is set. */
export const DEFAULT_SUBSCRIPTION_PRICES: SubscriptionPrices = {
  monthlyRial: 2_000_000n,
  quarterlyRial: 5_400_000n, // ~10% discount vs 3× monthly
  annualRial: 19_200_000n, // ~20% discount vs 12× monthly
};

/** Default free-trial length in days (Requirement 3.1, 3.3). */
export const DEFAULT_TRIAL_DAYS = 14;

/** Default grace-period length in days applied after a window lapses. */
export const DEFAULT_GRACE_DAYS = 7;

/**
 * Build the full set of plan definitions from the configured trial length and
 * paid-plan prices. The trial plan is always free (price 0).
 */
export function buildPlans(trialDays: number, prices: SubscriptionPrices): Record<SubscriptionPlanKind, PlanDefinition> {
  return {
    trial: { kind: 'trial', durationDays: trialDays, priceRial: 0n },
    monthly: { kind: 'monthly', durationDays: PLAN_DURATION_DAYS.monthly, priceRial: prices.monthlyRial },
    quarterly: {
      kind: 'quarterly',
      durationDays: PLAN_DURATION_DAYS.quarterly,
      priceRial: prices.quarterlyRial,
    },
    annual: { kind: 'annual', durationDays: PLAN_DURATION_DAYS.annual, priceRial: prices.annualRial },
  };
}
