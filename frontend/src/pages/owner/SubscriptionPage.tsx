import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Hourglass,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  ApiError,
  subscriptionApi,
  type SubscriptionPlan,
  type SubscriptionPlanKind,
  type SubscriptionStatus,
  type SubscriptionStatusResponse,
} from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { SeoHead } from '../../components/seo';
import {
  Badge,
  type BadgeStatus,
  Button,
  Card,
  CardContent,
  CardTitle,
  EmptyState,
  ErrorState,
  JalaliDate,
  Money,
  Num,
  RadioGroup,
  Skeleton,
} from '../../components/ui';
import { easings } from '../../lib/motion-variants';

/**
 * Owner-panel subscription management — «اشتراک من» (task 5.3; R3.8, R3.9, R2.1;
 * ui-ux §3 status-not-color-only, §6 data states, §11 RTL/Jalali/Rial, §13
 * action-verb copy).
 *
 * Replaces the section placeholder with the real surface:
 *
 *  1. **Status (R3.4, R3.5):** the effective status (`trial`/`active`/`grace`/
 *     `expired`) from `subscriptionApi.getStatus`, shown with an **icon + text**
 *     `Badge` (never color-only, §3) and the expiry rendered as a Jalali date in
 *     Persian digits (`<JalaliDate>`, §11).
 *  2. **Plan selection (R3.1, R3.2):** the configurable, IRR-priced paid plans
 *     (monthly/quarterly/annual) as a `RadioGroup`; prices use `<Money>` (Rial,
 *     Persian digits, grouped) and durations `<Num>`.
 *  3. **Purchase (R3.6):** on confirm we call `initiatePurchase` and hand off to
 *     the returned gateway URL — success is never faked, money flows are
 *     confirmed by the server (the activation callback, §12).
 *  4. **Gating (R3.5 / 402 `SUBSCRIPTION_REQUIRED`):** an `expired` owner is led
 *     to the renewal surface — a prominent callout + the plan picker framed as
 *     "renew". Reads stay available; writes are gated server-side.
 *  5. **Data states (§6):** skeleton while loading, error + retry, populated.
 *
 * The whole owner area is private and never indexed, so `<SeoHead>` keeps its
 * `noindex` default (seo §1). The `owner-subscription-page` testID and the
 * surrounding `dir`/`lang` contract are preserved.
 */

/** The paid plans the owner can buy/renew with, in ascending duration order. */
const PAID_PLAN_ORDER: SubscriptionPlanKind[] = ['monthly', 'quarterly', 'annual'];

type LoadStatus = 'loading' | 'success' | 'error';

/** The purchase hand-off state machine (idle → submitting → redirecting/error). */
type PurchaseStatus = 'idle' | 'submitting' | 'redirecting' | 'error';

/** Icon per status — universal/semantic glyphs, not mirrored in RTL (§11). */
const STATUS_ICON: Record<SubscriptionStatus, LucideIcon> = {
  trial: Clock,
  active: CheckCircle2,
  grace: Hourglass,
  expired: XCircle,
};

/** Maps the subscription status onto a Badge status (color + icon pairing). */
const STATUS_BADGE: Record<SubscriptionStatus, BadgeStatus> = {
  trial: 'info',
  active: 'success',
  grace: 'warning',
  expired: 'danger',
};

/**
 * Performs the payment-gateway hand-off. Extracted so it can be stubbed in
 * tests (mirrors `BookingConfirmPage`'s `redirectToGateway`).
 */
function redirectToGateway(url: string): void {
  window.location.href = url;
}

/** Layout-matched skeleton shown while the subscription data loads (§6/§12). */
function SubscriptionSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      data-testid="subscription-loading"
      role="status"
      aria-busy="true"
      aria-label={t('owner.subscription.loadingLabel')}
      className="flex flex-col gap-6"
    >
      <Skeleton variant="rect" className="h-28" />
      <Skeleton variant="rect" className="h-48" />
    </div>
  );
}

type SubscriptionPaymentResult = 'success' | 'error';

/** Chrome-free callback result, matching the booking payment result surface. */
function SubscriptionPaymentResultPage({ result }: { result: SubscriptionPaymentResult }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const prefersReduced = useReducedMotion();
  const isSuccess = result === 'success';
  const title = t(
    isSuccess ? 'owner.subscription.paymentSuccessTitle' : 'owner.subscription.paymentErrorTitle',
  );

  return (
    <div
      dir="rtl"
      lang="fa"
      data-testid="subscription-payment-result"
      data-payment-result={result}
      data-shell="funnel-payment-result"
      className="flex min-h-screen min-h-[100dvh] flex-col overflow-x-hidden bg-bg text-text"
    >
      <SeoHead title={title} />

      <main
        id="funnel-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-funnel flex-1 flex-col items-center justify-center gap-6 px-4 py-8 text-center"
      >
        <div className="relative flex flex-col items-center gap-3">
          <motion.span
            className={`relative inline-flex h-20 w-20 items-center justify-center rounded-pill motion-safe:animate-success-pop ${
              isSuccess ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
            }`}
            role="img"
            aria-label={title}
            initial={prefersReduced ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: easings.emphasized, delay: 0.15 }}
          >
            {isSuccess ? (
              <CheckCircle2 className="h-11 w-11" aria-hidden="true" />
            ) : (
              <XCircle className="h-11 w-11" aria-hidden="true" />
            )}
          </motion.span>

          <h1 className="text-xl font-bold text-text">{title}</h1>
          <p className="max-w-[38ch] text-sm leading-7 text-muted">
            {t(
              isSuccess
                ? 'owner.subscription.paymentSuccessBody'
                : 'owner.subscription.paymentErrorBody',
            )}
          </p>
        </div>

        {!isSuccess && (
          <Card as="section" className="w-full text-start" role="alert">
            <p className="text-sm leading-7 text-muted">
              {t('owner.subscription.paymentErrorHint')}
            </p>
          </Card>
        )}
      </main>

      <div className="sticky bottom-0 z-sticky border-t border-border bg-bg pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto w-full max-w-funnel px-4 py-4">
          <Button
            size="lg"
            fullWidth
            onClick={() => navigate('/owner/subscription', { replace: true })}
          >
            {t('owner.subscription.paymentResultCta')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SubscriptionManagementPage() {
  const { t } = useTranslation();
  const params = useParams<{ salonId?: string }>();
  const sessionSalonId = useSalonId();
  const salonId = params.salonId ?? sessionSalonId;

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [subscription, setSubscription] = useState<SubscriptionStatusResponse | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanKind | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseStatus>('idle');

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError('');

    Promise.all([subscriptionApi.getStatus(salonId), subscriptionApi.getPlans()])
      .then(([statusRes, plansRes]) => {
        if (!active) return;
        setSubscription(statusRes);
        // Only paid plans are purchasable; keep them in a stable display order.
        const paid = plansRes.plans
          .filter((p) => p.kind !== 'trial')
          .sort((a, b) => PAID_PLAN_ORDER.indexOf(a.kind) - PAID_PLAN_ORDER.indexOf(b.kind));
        setPlans(paid);
        setStatus('success');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : t('owner.subscription.errorTitle'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [salonId, reloadToken, t]);

  const isExpired = subscription?.status === 'expired';
  const isGrace = subscription?.status === 'grace';
  // An expired owner is renewing (read-only panel until paid); others purchase.
  const purchaseLabel = isExpired
    ? t('owner.subscription.renewCta')
    : t('owner.subscription.purchaseCta');

  const handlePurchase = async () => {
    if (!selectedPlan) return;
    setPurchaseStatus('submitting');
    try {
      const { redirectUrl } = await subscriptionApi.initiatePurchase(salonId, selectedPlan);
      // Money is confirmed by the server (activation callback); show the
      // explicit redirect surface and hand off to the gateway (§12).
      setPurchaseStatus('redirecting');
      redirectToGateway(redirectUrl);
    } catch {
      setPurchaseStatus('error');
    }
  };

  return (
    <section data-testid="owner-subscription-page" className="flex flex-col gap-6">
      <SeoHead title={t('owner.subscription.title')} />

      <header className="flex flex-col gap-2">
        <h1 className="text-xl text-display text-text">{t('owner.subscription.title')}</h1>
        <p className="max-w-[60ch] text-sm text-muted">{t('owner.subscription.subtitle')}</p>
      </header>

      {status === 'loading' && <SubscriptionSkeleton />}

      {status === 'error' && (
        <ErrorState
          data-testid="subscription-error"
          title={t('owner.subscription.errorTitle')}
          description={error}
          retryLabel={t('owner.subscription.retry')}
          onRetry={() => setReloadToken((n) => n + 1)}
        />
      )}

      {status === 'success' && subscription && (
        <>
          {/* Current status — icon + text Badge (never color-only) + Jalali expiry. */}
          <Card as="section" data-testid="subscription-status" className="flex flex-col gap-3">
            <CardTitle as="h2" className="text-lg font-medium text-text">
              {t('owner.subscription.statusTitle')}
            </CardTitle>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Badge
                  status={STATUS_BADGE[subscription.status]}
                  icon={(() => {
                    const Icon = STATUS_ICON[subscription.status];
                    return <Icon className="h-3.5 w-3.5" aria-hidden="true" />;
                  })()}
                >
                  {t(`owner.subscription.status.${subscription.status}`)}
                </Badge>
              </div>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t('owner.subscription.expiresAt')}:</span>
                <JalaliDate
                  data-testid="subscription-expiry"
                  value={subscription.expiresAt}
                  withWeekday
                  className="text-text"
                />
              </p>
            </CardContent>
          </Card>

          {/* Renewal/grace gating callout (R3.5; reflects 402 SUBSCRIPTION_REQUIRED). */}
          {(isExpired || isGrace) && (
            <Card
              as="section"
              data-testid={isExpired ? 'subscription-renewal' : 'subscription-grace'}
              className={
                isExpired
                  ? 'flex flex-col gap-2 border-danger/30 bg-danger/10'
                  : 'flex flex-col gap-2 border-warning/30 bg-warning/10'
              }
              role={isExpired ? 'alert' : undefined}
            >
              <div
                className={
                  isExpired
                    ? 'flex items-center gap-2 text-danger'
                    : 'flex items-center gap-2 text-warning'
                }
              >
                <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
                <CardTitle as="h2" className="text-md font-medium">
                  {isExpired
                    ? t('owner.subscription.expiredCalloutTitle')
                    : t('owner.subscription.graceCalloutTitle')}
                </CardTitle>
              </div>
              <CardContent className="text-sm text-text">
                {isExpired
                  ? t('owner.subscription.expiredCalloutBody')
                  : t('owner.subscription.graceCalloutBody')}
              </CardContent>
            </Card>
          )}

          {/* Plan selection + purchase/renew (R3.1, R3.2, R3.6). */}
          <Card as="section" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <CardTitle as="h2" className="text-lg font-medium text-text">
                {t('owner.subscription.plansTitle')}
              </CardTitle>
              <p className="text-sm text-muted">{t('owner.subscription.plansHint')}</p>
            </div>

            {plans.length === 0 ? (
              <EmptyState
                data-testid="subscription-plans-empty"
                icon={<CreditCard className="h-8 w-8" />}
                title={t('owner.subscription.plansEmptyTitle')}
                description={t('owner.subscription.plansEmptyBody')}
              />
            ) : (
              <>
                <RadioGroup
                  data-testid="subscription-plans"
                  label={t('owner.subscription.plansLabel')}
                  labelHidden
                  value={selectedPlan ?? ''}
                  onValueChange={(value) => setSelectedPlan(value as SubscriptionPlanKind)}
                  options={plans.map((plan) => ({
                    value: plan.kind,
                    label: (
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-medium text-text">
                          {t(`owner.subscription.plan.${plan.kind}`)}
                        </span>
                        <Money amountRial={plan.priceRial} className="text-text" />
                      </span>
                    ),
                    helperText: (
                      <span className="flex items-center gap-1">
                        <Num value={plan.durationDays} />
                        <span>{t('owner.subscription.durationUnit')}</span>
                      </span>
                    ),
                  }))}
                />

                {purchaseStatus === 'redirecting' ? (
                  <p
                    data-testid="subscription-redirecting"
                    role="status"
                    className="flex items-center gap-2 text-sm text-muted"
                  >
                    <Hourglass className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {t('owner.subscription.redirecting')}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {purchaseStatus === 'error' && (
                      <p
                        data-testid="subscription-purchase-error"
                        role="alert"
                        className="flex items-center gap-2 text-sm text-danger"
                      >
                        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {t('owner.subscription.purchaseError')}
                      </p>
                    )}
                    <Button
                      data-testid="subscription-purchase"
                      variant="primary"
                      startIcon={<CreditCard className="h-4 w-4" />}
                      disabled={!selectedPlan}
                      loading={purchaseStatus === 'submitting'}
                      onClick={handlePurchase}
                      className="self-start"
                    >
                      {purchaseLabel}
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </section>
  );
}

export function OwnerSubscriptionPage() {
  const [searchParams] = useSearchParams();
  const paymentResult = searchParams.get('payment');

  if (paymentResult === 'success' || paymentResult === 'error') {
    return <SubscriptionPaymentResultPage result={paymentResult} />;
  }

  return <SubscriptionManagementPage />;
}

export default OwnerSubscriptionPage;
