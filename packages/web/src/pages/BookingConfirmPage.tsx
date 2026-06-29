import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Clock, CreditCard, Scissors } from 'lucide-react';
import { bookingApi, salonApi } from '../api/client';
import { SeoHead } from '../components/seo';
import { readSalonName } from '../utils/salonName';
import {
  Button,
  Card,
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
 * expired) without depending on the `ApiError` class. We intentionally avoid
 * `instanceof ApiError` so this stays robust across module/test boundaries
 * where the concrete error type may not be the same reference — we only read
 * the shape (`status` / `code`) the API surfaces on a 401.
 */
function isAuthFailure(err: unknown): boolean {
  const e = err as { status?: number; code?: string } | null;
  return !!e && (e.status === 401 || e.code === 'UNAUTHORIZED');
}

/**
 * Customer **booking-confirm** step at `/salon/:salonId/book/confirm`
 * (R4.5, R7.2, R7.5; ui-ux Booking-Confirm recipe, §6, §8, §12).
 *
 * The last gate before money moves. The redesign composes design-system
 * primitives instead of bare HTML:
 *
 *  - **Summary card** — the chosen service, the **Jalali** date and time
 *    (`<JalaliDate>` + Persian-digit time), and the **Rial** price (`<Money>`),
 *    plus a deposit/payment notice (R4.5, R7.2, R7.5). The card carries its own
 *    loading (skeleton) / error (retry) states while the service detail loads.
 *  - **Sticky bottom CTA** «تایید رزرو» in the thumb zone, clearing the device
 *    safe-area inset so it is always reachable one-handed (ui-ux §5).
 *  - **Confirm states** — idle → in-button loading → an explicit
 *    **payment-redirect** surface («در حال انتقال به درگاه پرداخت...») shown
 *    before the gateway hand-off → error with retry (ui-ux §6).
 *  - **Abandon warning** — while a booking/payment is in flight a `beforeunload`
 *    guard warns the customer before they drop a partially completed/paid
 *    booking (ui-ux §8 "warn before abandoning a partially completed/paid
 *    booking").
 *
 * The `booking-confirm` testID is preserved and the `bookingApi`/`salonApi`
 * calls are unchanged — this is presentation only. A booking-funnel step is
 * thin/duplicate content and must never be indexed; `<SeoHead>` (noindex
 * default) emits `noindex,follow` (seo §1, R8.7).
 */
export function BookingConfirmPage() {
  const { t } = useTranslation();
  const { salonId } = useParams<{ salonId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state as
    | (ConfirmSelection & { autoConfirm?: boolean })
    | undefined;

  const [service, setService] = useState<Service | null>(null);
  const [detailsStatus, setDetailsStatus] = useState<DetailsStatus>('loading');
  const [confirmStatus, setConfirmStatus] = useState<ConfirmStatus>('idle');

  // Guards against bouncing to /auth more than once (e.g. a flaky 401 on retry)
  // and against re-redirecting after we've already returned authenticated.
  const redirectedToAuthRef = useRef(false);

  // A booking is "in flight" once the customer commits and until the gateway
  // hand-off / success navigation takes over. During this window leaving the
  // page risks a partially completed/paid booking, so we arm an unload guard.
  const isPending = confirmStatus === 'submitting' || confirmStatus === 'redirecting';

  useEffect(() => {
    if (!isPending) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Modern browsers show their own generic copy; a non-empty returnValue
      // is what actually triggers the native confirm dialog.
      event.returnValue = t('booking.abandonWarning');
      return event.returnValue;
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isPending, t]);

  // Resolve the chosen service so the summary can show its name + Rial price.
  // The selection only carries the service id; we look it up via the unchanged
  // services endpoint (presentation adaptation only).
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

  // Resume after returning authenticated from /auth: once the summary details
  // are ready (so the success receipt can carry `service.name`), auto-run the
  // booking exactly once. The flag is set by AuthPage on its way back here.
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
        // Money is confirmed by the server; show the explicit redirect surface
        // and hand off to the payment gateway. Keep the pending guard armed.
        setConfirmStatus('redirecting');
        redirectToGateway(result.paymentRedirectUrl);
      } else if (result.status === 'pending' || result.status === 'confirmed') {
        // pending = awaiting admin approval; confirmed = auto-approved by the
        // salon/stylist policy. Both reach the receipt, which presents the right
        // state from `status` (no fabricated success — the server decided).
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
      // Not signed in (or the token expired): route to phone+OTP login and resume
      // the booking automatically afterwards. Only redirect on a genuine auth
      // failure, only once, and never after we already came back from /auth.
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

  // Guard: arriving here without a selection (e.g. a direct deep link) can't
  // confirm anything. Offer a clear way back into the funnel. Still emit the
  // noindex head so the route never leaks.
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
      className="mx-auto flex w-full max-w-funnel flex-col gap-6 py-6"
    >
      <SeoHead title={t('seo.titles.confirm')} />
      <h1 className="text-xl font-bold text-text">{t('booking.confirmHeading')}</h1>

      {/* Summary card: service · Jalali date/time · Rial price · deposit notice. */}
      <section aria-labelledby="summary-title" className="flex flex-col gap-3">
        <h2 id="summary-title" className="sr-only">
          {t('booking.summaryTitle')}
        </h2>

        {detailsStatus === 'loading' && (
          <Card loading loadingLabel={t('booking.detailsLoadingLabel')}>
            <Skeleton variant="text" />
          </Card>
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
          <Card as="section">
            <dl className="flex flex-col divide-y divide-border">
              <div className="flex items-center justify-between gap-4 py-2 first:pt-0">
                <dt className="flex items-center gap-2 text-sm text-muted">
                  <Scissors className="h-4 w-4" aria-hidden="true" />
                  {t('booking.serviceLabel')}
                </dt>
                <dd className="text-sm font-medium text-text">{service.name}</dd>
              </div>

              <div className="flex items-center justify-between gap-4 py-2">
                <dt className="flex items-center gap-2 text-sm text-muted">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  {t('booking.dateLabel')}
                </dt>
                <dd className="text-sm font-medium text-text">
                  <JalaliDate value={state.startAt} withWeekday />
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4 py-2">
                <dt className="flex items-center gap-2 text-sm text-muted">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  {t('booking.timeLabel')}
                </dt>
                <dd className="text-sm font-medium text-text">
                  {t('booking.timeAt', { time })}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4 py-2 last:pb-0">
                <dt className="flex items-center gap-2 text-sm text-muted">
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                  {t('booking.priceLabel')}
                </dt>
                <dd className="text-sm font-bold text-text">
                  <Money amountRial={service.priceRial} />
                </dd>
              </div>
            </dl>

            <p className="mt-4 rounded-md bg-bg p-3 text-xs text-muted">
              {t('booking.depositNotice')}
            </p>
          </Card>
        )}
      </section>

      {/* Explicit payment-redirect surface, shown before the gateway hand-off. */}
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

      {/* Confirm failure: friendly cause + retry (never a raw error). */}
      {confirmStatus === 'error' && (
        <ErrorState
          title={t('booking.confirmErrorTitle')}
          description={t('booking.confirmErrorBody')}
          retryLabel={t('common.retry')}
          onRetry={handleConfirm}
        />
      )}

      {/* Sticky bottom CTA «تایید رزرو» in the thumb zone, clearing safe-area. */}
      <div
        data-testid="booking-confirm-cta"
        className="sticky bottom-0 z-sticky -mx-4 border-t border-border bg-surface px-4 pb-[env(safe-area-inset-bottom)] pt-3"
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
