import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Clock, CreditCard, Scissors, Store } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { bookingApi, salonApi } from '../api/client';
import { SeoHead } from '../components/seo';
import { readSalonName } from '../utils/salonName';
import {
  BookingStepper,
  Button,
  EmptyState,
  ErrorState,
  JalaliDate,
  Money,
  Skeleton,
  Spinner,
  toPersianDigits,
} from '../components/ui';

/** Funnel selection handed over from the availability step via router state. */
interface ConfirmSelection {
  serviceId: string;
  startAt: string;
  /** Preferred stylist carried from the availability step (optional). */
  preferredStaffId?: string;
}

/** A bookable service as returned by the salon services endpoint (unchanged contract). */
interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceRial: number;
}

/** Async status for loading the chosen service's summary details. */
type DetailsStatus = 'loading' | 'error' | 'ready';

/**
 * The confirm/pay action's state machine (ui-ux §6 interactive states, §12):
 *   idle → submitting (in-button spinner) → redirecting (explicit
 *   "going to the payment gateway" surface) before `window.location` hands off;
 *   any failure lands in `error` with a retry. There is no "success" member —
 *   success is owned by the server: a `confirmed` response navigates to the
 *   success receipt, a `held` response redirects to the gateway. We never fake
 *   it (ui-ux §12 "Do not fake payment success").
 */
type ConfirmStatus = 'idle' | 'submitting' | 'redirecting' | 'error';

/** Formats an ISO instant to an `HH:mm` label; digits are localized for display. */
function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Performs the gateway hand-off. Extracted so it can be stubbed in tests. */
function redirectToGateway(url: string): void {
  window.location.href = url;
}

/**
 * Duck-types a rejection as an authentication failure (not signed in / token
 * expired) without depending on the `ApiError` class.
 */
function isAuthFailure(err: unknown): boolean {
  const e = err as { status?: number; code?: string } | null;
  return !!e && (e.status === 401 || e.code === 'UNAUTHORIZED');
}

/** Booking stepper steps (step 3 = confirm). */
const BOOKING_STEPS = [
  { key: 'service', label: 'خدمت' },
  { key: 'datetime', label: 'تاریخ' },
  { key: 'confirm', label: 'تایید' },
];

/**
 * Customer **booking-confirm** step at `/salon/:salonId/book/confirm`
 * (R4.5, R7.2, R7.5; ui-ux Booking-Confirm recipe, §6, §8, §12).
 *
 * Redesigned as a premium receipt-like summary card with:
 * - BookingStepper showing step 3 active
 * - Elevated card (shadow-2, rounded-lg) with receipt styling
 * - Dotted dividers between sections (token-driven border)
 * - Labeled rows: service, date (Jalali), time, price (Rial), salon name
 * - All text Persian, Persian digits, Jalali dates
 * - CTA in thumb zone (bottom third of viewport on mobile)
 * - Token-only styling, logical properties for RTL
 */
export function BookingConfirmPage() {
  const { t } = useTranslation();
  const { salonId } = useParams<{ salonId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const prefersReduced = useReducedMotion();

  const state = location.state as
    | (ConfirmSelection & { autoConfirm?: boolean })
    | undefined;

  const [service, setService] = useState<Service | null>(null);
  const [detailsStatus, setDetailsStatus] = useState<DetailsStatus>('loading');
  const [confirmStatus, setConfirmStatus] = useState<ConfirmStatus>('idle');

  const redirectedToAuthRef = useRef(false);

  const isPending = confirmStatus === 'submitting' || confirmStatus === 'redirecting';

  useEffect(() => {
    if (!isPending) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = t('booking.abandonWarning');
      return event.returnValue;
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isPending, t]);

  const loadDetails = useCallback(() => {
    if (!salonId || !state) return;
    setDetailsStatus('loading');
    salonApi
      .getServices(salonId)
      .then((res) => {
        const found = res.services.find((s) => s.id === state.serviceId);
        if (!found) {
          setDetailsStatus('error');
          return;
        }
        setService(found);
        setDetailsStatus('ready');
      })
      .catch(() => setDetailsStatus('error'));
  }, [salonId, state]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const didAutoConfirmRef = useRef(false);
  useEffect(() => {
    if (!didAutoConfirmRef.current && state?.autoConfirm && detailsStatus === 'ready') {
      didAutoConfirmRef.current = true;
      void handleConfirm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, detailsStatus]);

  const handleConfirm = async () => {
    if (!salonId || !state) return;
    setConfirmStatus('submitting');
    try {
      const result = await bookingApi.create({
        salonId,
        serviceId: state.serviceId,
        startAt: state.startAt,
        preferredStaffId: state.preferredStaffId,
      });

      if (result.status === 'held' && result.paymentRedirectUrl) {
        setConfirmStatus('redirecting');
        redirectToGateway(result.paymentRedirectUrl);
      } else if (result.status === 'pending' || result.status === 'confirmed') {
        navigate('/booking/success', {
          state: {
            status: result.status,
            serviceName: service?.name,
            startAt: state.startAt,
            salonName: readSalonName(salonId) ?? undefined,
          },
        });
      } else {
        setConfirmStatus('error');
      }
    } catch (err) {
      if (isAuthFailure(err) && !state.autoConfirm && !redirectedToAuthRef.current) {
        redirectedToAuthRef.current = true;
        setConfirmStatus('idle');
        navigate('/auth', {
          state: {
            returnTo: location.pathname,
            returnState: {
              serviceId: state.serviceId,
              startAt: state.startAt,
              preferredStaffId: state.preferredStaffId,
            },
          },
        });
        return;
      }
      setConfirmStatus('error');
    }
  };

  const backToBooking = () => navigate(`/salon/${salonId}/book`);

  const salonName = useMemo(() => readSalonName(salonId ?? ''), [salonId]);

  // Guard: arriving here without a selection (e.g. a direct deep link)
  if (!state) {
    return (
      <div
        data-testid="booking-confirm"
        className="mx-auto flex w-full max-w-funnel flex-col gap-6 py-6"
      >
        <SeoHead title={t('seo.titles.confirm')} />
        <h1 className="text-xl font-bold text-text">{t('booking.confirmHeading')}</h1>
        <EmptyState
          icon={<CalendarClock className="h-8 w-8" />}
          title={t('booking.missingSelectionTitle')}
          description={t('booking.missingSelectionBody')}
          action={
            <Button variant="secondary" onClick={backToBooking}>
              {t('booking.backToBooking')}
            </Button>
          }
        />
      </div>
    );
  }

  const time = toPersianDigits(timeLabel(state.startAt));

  return (
    <div
      data-testid="booking-confirm"
      className="mx-auto flex w-full max-w-funnel flex-col gap-6 px-4 py-6"
    >
      <SeoHead title={t('seo.titles.confirm')} />

      {/* Page heading — visually styled as stepper context */}
      <h1 className="sr-only">{t('booking.confirmHeading')}</h1>

      {/* Progress stepper — step 3 (confirm) active */}
      <BookingStepper steps={BOOKING_STEPS} currentStep={2} className="mb-2" />

      {/* Receipt-like summary card */}
      <section aria-labelledby="summary-title">
        <h2 id="summary-title" className="sr-only">
          {t('booking.summaryTitle')}
        </h2>

        {detailsStatus === 'loading' && (
          <div
            className="rounded-lg border border-border bg-elevated p-6 shadow-2"
            role="status"
            aria-label={t('booking.detailsLoadingLabel')}
          >
            <Skeleton variant="text" className="mb-4 w-1/3" />
            <div className="flex flex-col gap-4">
              <Skeleton variant="text" className="w-full" />
              <Skeleton variant="text" className="w-full" />
              <Skeleton variant="text" className="w-full" />
              <Skeleton variant="text" className="w-2/3" />
            </div>
          </div>
        )}

        {detailsStatus === 'error' && (
          <ErrorState
            title={t('booking.detailsErrorTitle')}
            description={t('booking.detailsErrorBody')}
            retryLabel={t('common.retry')}
            onRetry={loadDetails}
          />
        )}

        {detailsStatus === 'ready' && service && (
          <motion.div
            className="overflow-hidden rounded-lg border border-border bg-elevated shadow-2"
            initial={prefersReduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
          >
            {/* Card header */}
            <div className="border-b border-dashed border-border px-6 py-4">
              <h3 className="text-lg font-bold text-text">
                {t('booking.receiptTitle')}
              </h3>
            </div>

            {/* Receipt rows */}
            <dl className="px-6 py-4">
              {/* Service */}
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2 text-sm text-text-muted">
                  <Scissors className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('booking.serviceLabel')}
                </dt>
                <dd className="text-sm font-semibold text-text">{service.name}</dd>
              </div>

              {/* Dotted divider */}
              <div className="border-t border-dashed border-border" aria-hidden="true" />

              {/* Date */}
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2 text-sm text-text-muted">
                  <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('booking.dateLabel')}
                </dt>
                <dd className="text-sm font-semibold text-text">
                  <JalaliDate value={state.startAt} withWeekday />
                </dd>
              </div>

              {/* Dotted divider */}
              <div className="border-t border-dashed border-border" aria-hidden="true" />

              {/* Time */}
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2 text-sm text-text-muted">
                  <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('booking.timeLabel')}
                </dt>
                <dd className="text-sm font-semibold text-text">
                  {t('booking.timeAt', { time })}
                </dd>
              </div>

              {/* Dotted divider */}
              <div className="border-t border-dashed border-border" aria-hidden="true" />

              {/* Price */}
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2 text-sm text-text-muted">
                  <CreditCard className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('booking.priceLabel')}
                </dt>
                <dd className="text-base font-bold text-text">
                  <Money amountRial={service.priceRial} />
                </dd>
              </div>

              {/* Salon name (if available) */}
              {salonName && (
                <>
                  {/* Dotted divider */}
                  <div
                    className="border-t border-dashed border-border"
                    aria-hidden="true"
                  />

                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="flex items-center gap-2 text-sm text-text-muted">
                      <Store className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {t('booking.salonLabel')}
                    </dt>
                    <dd className="text-sm font-semibold text-text">{salonName}</dd>
                  </div>
                </>
              )}
            </dl>

            {/* Deposit/payment notice */}
            <div className="border-t border-dashed border-border px-6 py-4">
              <p className="rounded-md bg-surface p-3 text-xs text-text-muted">
                {t('booking.depositNotice')}
              </p>
            </div>
          </motion.div>
        )}
      </section>

      {/* Explicit payment-redirect surface */}
      {confirmStatus === 'redirecting' && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 text-sm font-medium text-text"
        >
          <Spinner size="sm" />
          {t('booking.paymentRedirect')}
        </p>
      )}

      {/* Confirm failure: friendly cause + retry */}
      {confirmStatus === 'error' && (
        <ErrorState
          title={t('booking.confirmErrorTitle')}
          description={t('booking.confirmErrorBody')}
          retryLabel={t('common.retry')}
          onRetry={handleConfirm}
        />
      )}

      {/* Sticky bottom CTA «تایید رزرو» — thumb zone, clearing safe-area */}
      <div
        data-testid="booking-confirm-cta"
        className="sticky bottom-0 z-sticky -mx-4 mt-auto border-t border-border bg-bg px-4 pb-[env(safe-area-inset-bottom)] pt-4"
      >
        <Button
          fullWidth
          size="lg"
          onClick={handleConfirm}
          loading={confirmStatus === 'submitting' || confirmStatus === 'redirecting'}
          disabled={detailsStatus !== 'ready'}
          startIcon={<CreditCard className="h-5 w-5" />}
        >
          {t('booking.confirm')}
        </Button>
      </div>
    </div>
  );
}
