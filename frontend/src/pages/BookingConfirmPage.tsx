import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Clock, CreditCard, MapPin, Scissors, Store } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { bookingApi, customerApi, getAccessToken, salonApi } from '../api/client';
import { SeoHead } from '../components/seo';
import { FunnelShell } from '../components/layout';
import { readSalonName } from '../utils/salonName';
import {
  Button,
  EmptyState,
  ErrorState,
  JalaliDate,
  Money,
  Skeleton,
  Spinner,
  TextField,
  toPersianDigits,
} from '../components/ui';

/** Funnel selection handed over from the availability step via router state. */
interface ConfirmSelection {
  serviceId: string;
  startAt: string;
  /** Preferred stylist carried from the availability step (optional). */
  preferredStaffId?: string;
  locationType?: 'salon' | 'customer';
  locationAddress?: string;
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
 * How long the «در حال انتقال به درگاه پرداخت…» state may last before we treat
 * the gateway navigation as failed and return the CTA to an actionable state.
 */
const GATEWAY_REDIRECT_FALLBACK_MS = 10_000;

/**
 * Duck-types a rejection as an authentication failure (not signed in / token
 * expired) without depending on the `ApiError` class.
 */
function isAuthFailure(err: unknown): boolean {
  const e = err as { status?: number; code?: string } | null;
  return !!e && (e.status === 401 || e.code === 'UNAUTHORIZED');
}

/**
 * Customer **booking-confirm** step at `/salon/:salonId/book/confirm`
 * (R4.5, R7.2, R7.5; ui-ux Booking-Confirm recipe, §6, §8, §12).
 *
 * Wrapped in `FunnelShell` (no nav chrome, sticky bottom CTA in thumb reach —
 * آرا Design Goals 12, 15, 17). Summary card shows:
 * - Service name
 * - Jalali date (Persian)
 * - Time (Persian digits)
 * - Rial price (Persian numerals)
 * - Salon name
 *
 * Keyboard-operable RTL focus order (tab through summary → CTA). `noindex`.
 */
export function BookingConfirmPage() {
  const { t } = useTranslation();
  const { salonId } = useParams<{ salonId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const prefersReduced = useReducedMotion();

  const state = location.state as (ConfirmSelection & { autoConfirm?: boolean }) | undefined;

  const [service, setService] = useState<Service | null>(null);
  const [detailsStatus, setDetailsStatus] = useState<DetailsStatus>('loading');
  const [confirmStatus, setConfirmStatus] = useState<ConfirmStatus>('idle');
  const [profileStatus, setProfileStatus] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [customerName, setCustomerName] = useState('');
  const [nameRequired, setNameRequired] = useState(false);
  const [nameError, setNameError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [locationAddress, setLocationAddress] = useState(state?.locationAddress ?? '');
  const [locationError, setLocationError] = useState('');

  const redirectedToAuthRef = useRef(false);
  const profileCheckedRef = useRef(false);

  const isPending = confirmStatus === 'submitting' || confirmStatus === 'redirecting';
  const bookingLocation = state?.locationType ?? 'salon';

  // While a booking request is in flight we warn against closing the tab —
  // but the payment-gateway redirect is itself a navigation, and the listener
  // attached during 'submitting' is still live when `window.location.href` is
  // assigned (React has not re-run effects yet). `allowUnloadRef` lets the
  // redirect opt out synchronously so the customer is never blocked by a
  // native «Leave site?» dialog mid-payment.
  const allowUnloadRef = useRef(false);
  const gatewayFallbackTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isPending) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      if (allowUnloadRef.current) return undefined;
      event.preventDefault();
      event.returnValue = t('booking.abandonWarning');
      return event.returnValue;
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isPending, t]);

  useEffect(() => () => window.clearTimeout(gatewayFallbackTimer.current), []);

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
  }, [state, detailsStatus]);

  /**
   * Name collection happens after OTP, when an access token exists. Existing
   * customers with a saved name pass through without seeing another field.
   */
  const ensureCustomerProfile = async (): Promise<boolean> => {
    if (!getAccessToken()) return true;

    let requiresName = nameRequired;
    if (!profileCheckedRef.current) {
      setProfileStatus('loading');
      setProfileError('');
      let response: Awaited<ReturnType<typeof customerApi.getProfile>>;
      try {
        response = await customerApi.getProfile();
      } catch (error) {
        setProfileStatus('ready');
        setProfileError(t('booking.profileError', { defaultValue: 'ذخیره اطلاعات مشتری انجام نشد؛ دوباره تلاش کنید.' }));
        throw error;
      }
      const savedName = response.customer.fullName?.trim() ?? '';
      profileCheckedRef.current = true;
      requiresName = savedName.length === 0;
      setCustomerName(savedName);
      setNameRequired(requiresName);
      setProfileStatus('ready');
    }

    if (!requiresName) return true;

    const normalizedName = customerName.trim();
    if (normalizedName.length < 2) {
      setNameRequired(true);
      setNameError(t('booking.nameError', { defaultValue: 'نام و نام خانوادگی را وارد کنید.' }));
      setProfileStatus('ready');
      setConfirmStatus('idle');
      return false;
    }

    setProfileStatus('loading');
    setNameError('');
    let response: Awaited<ReturnType<typeof customerApi.updateProfile>>;
    try {
      response = await customerApi.updateProfile(normalizedName);
    } catch (error) {
      setProfileStatus('ready');
      setProfileError(t('booking.profileError', { defaultValue: 'ذخیره اطلاعات مشتری انجام نشد؛ دوباره تلاش کنید.' }));
      throw error;
    }
    setCustomerName(response.customer.fullName?.trim() ?? normalizedName);
    setNameRequired(false);
    setProfileStatus('ready');
    return true;
  };

  const handleConfirm = async () => {
    if (!salonId || !state) return;
    if (bookingLocation === 'customer' && locationAddress.trim().length < 5) {
      setLocationError(
        t('booking.locationAddressError', {
          defaultValue: 'آدرس مراجعه را وارد کنید.',
        }),
      );
      return;
    }
    if (bookingLocation === 'customer' && locationAddress.trim().length > 300) {
      setLocationError(
        t('booking.locationAddressTooLong', {
          defaultValue: 'آدرس باید حداکثر ۳۰۰ کاراکتر باشد.',
        }),
      );
      return;
    }
    setLocationError('');
    setConfirmStatus('submitting');
    try {
      if (!(await ensureCustomerProfile())) return;

      const result = await bookingApi.create({
        salonId,
        serviceId: state.serviceId,
        startAt: state.startAt,
        preferredStaffId: state.preferredStaffId,
        ...(bookingLocation === 'customer'
          ? { locationType: 'customer' as const, locationAddress: locationAddress.trim() }
          : {}),
      });

      if (result.status === 'held' && result.deposit?.method === 'card_transfer') {
        const appointmentId =
          result.appointment && typeof result.appointment === 'object' && 'id' in result.appointment
            ? String((result.appointment as { id: string }).id)
            : '';
        if (!appointmentId) {
          setConfirmStatus('error');
          return;
        }
        navigate(`/booking/deposit/${appointmentId}`);
      } else if (result.status === 'held' && result.paymentRedirectUrl) {
        // Let the gateway navigation through the beforeunload guard, then
        // arm a fallback: if the browser never actually leaves (blocked
        // popup policy, bad URL, ...), surface the error state instead of
        // spinning on «در حال انتقال…» forever.
        allowUnloadRef.current = true;
        setConfirmStatus('redirecting');
        gatewayFallbackTimer.current = window.setTimeout(() => {
          allowUnloadRef.current = false;
          setConfirmStatus('error');
        }, GATEWAY_REDIRECT_FALLBACK_MS);
        redirectToGateway(result.paymentRedirectUrl);
      } else if (result.status === 'pending' || result.status === 'confirmed') {
        navigate('/booking/success', {
          state: {
            status: result.status,
            serviceName: service?.name,
            startAt: state.startAt,
            salonName: readSalonName(salonId) ?? undefined,
            locationType: bookingLocation,
            locationAddress:
              bookingLocation === 'customer' ? locationAddress.trim() : undefined,
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
              locationType: bookingLocation,
              locationAddress:
                bookingLocation === 'customer' ? locationAddress : undefined,
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
      <FunnelShell currentStep="confirm" salonName={salonName ?? undefined} onBack={backToBooking}>
        <div data-testid="booking-confirm">
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
      </FunnelShell>
    );
  }

  const time = toPersianDigits(timeLabel(state.startAt));

  // Sticky CTA button rendered in FunnelShell's thumb-zone bar
  const ctaButton = (
    <Button
      fullWidth
      size="lg"
      onClick={handleConfirm}
      loading={confirmStatus === 'submitting' || confirmStatus === 'redirecting'}
      disabled={detailsStatus !== 'ready' || profileStatus === 'loading'}
      startIcon={<CreditCard className="h-5 w-5" />}
    >
      {t('booking.confirm')}
    </Button>
  );

  return (
    <FunnelShell
      currentStep="confirm"
      salonName={salonName ?? undefined}
      onBack={backToBooking}
      cta={ctaButton}
    >
      <div data-testid="booking-confirm" className="flex flex-col gap-6">
        <SeoHead title={t('seo.titles.confirm')} />

        {/* Page heading — sr-only since the stepper provides visual context */}
        <h1 className="sr-only">{t('booking.confirmHeading')}</h1>

        {/* Receipt-like summary card */}
        <section aria-labelledby="summary-title">
          <h2 id="summary-title" className="sr-only">
            {t('booking.summaryTitle')}
          </h2>

          {detailsStatus === 'loading' && (
            <div
              className="rounded-lg border border-border bg-elevated p-4 shadow-2 sm:p-6"
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
              <div className="border-b border-dashed border-border px-4 py-4 sm:px-6">
                <h3 className="text-lg font-bold text-text">{t('booking.receiptTitle')}</h3>
              </div>

              {/* Receipt rows */}
              <dl className="px-4 py-3 sm:px-6 sm:py-4">
                {/* Service */}
                <div className="flex flex-col items-start gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <dt className="flex items-center gap-2 text-sm text-muted">
                    <Scissors className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {t('booking.serviceLabel')}
                  </dt>
                  <dd className="max-w-full break-words text-sm font-semibold text-text sm:text-end">{service.name}</dd>
                </div>

                {/* Dotted divider */}
                <div className="border-t border-dashed border-border" aria-hidden="true" />

                {/* Date */}
                <div className="flex flex-col items-start gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <dt className="flex items-center gap-2 text-sm text-muted">
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
                <div className="flex flex-col items-start gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <dt className="flex items-center gap-2 text-sm text-muted">
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
                <div className="flex flex-col items-start gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <dt className="flex items-center gap-2 text-sm text-muted">
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
                    <div className="border-t border-dashed border-border" aria-hidden="true" />

                    <div className="flex flex-col items-start gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <dt className="flex items-center gap-2 text-sm text-muted">
                        <Store className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {t('booking.salonLabel')}
                      </dt>
                      <dd className="max-w-full break-words text-sm font-semibold text-text sm:text-end">{salonName}</dd>
                    </div>
                  </>
                )}

                {bookingLocation === 'customer' && locationAddress.trim() && (
                  <>
                    <div className="border-t border-dashed border-border" aria-hidden="true" />
                    <div className="flex flex-col items-start gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <dt className="flex items-center gap-2 text-sm text-muted">
                        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {t('booking.locationAddressLabel', { defaultValue: 'آدرس مراجعه' })}
                      </dt>
                      <dd className="max-w-full break-words text-sm font-semibold text-text sm:text-end">
                        {locationAddress.trim()}
                      </dd>
                    </div>
                  </>
                )}
              </dl>

              {/* Deposit/payment notice */}
              <div className="border-t border-dashed border-border px-4 py-4 sm:px-6">
                <p className="rounded-md bg-surface p-3 text-xs text-muted">
                  {t('booking.depositNotice')}
                </p>
              </div>
            </motion.div>
          )}
        </section>

        {bookingLocation === 'customer' && (
          <section
            aria-labelledby="booking-location-title"
            className="rounded-lg border border-border bg-elevated p-4 shadow-2 sm:p-5"
          >
            <div className="mb-3 flex items-start gap-2">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
              <div>
                <h2 id="booking-location-title" className="text-base font-bold text-text">
                  {t('booking.locationAddressTitle', { defaultValue: 'آدرس مراجعه' })}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {t('booking.locationAddressHint', {
                    defaultValue: 'آدرس دقیق محل حضور شما را برای آرایشگر بنویسید.',
                  })}
                </p>
              </div>
            </div>
            <TextField
              label={t('booking.locationAddressLabel', { defaultValue: 'آدرس کامل' })}
              placeholder={t('booking.locationAddressPlaceholder', {
                defaultValue: 'شهر، محله، خیابان، پلاک و واحد',
              })}
              value={locationAddress}
              onChange={(event) => {
                setLocationAddress(event.target.value);
                if (locationError) setLocationError('');
              }}
              error={locationError}
              helperText={!locationError ? 'حداکثر ۳۰۰ کاراکتر' : undefined}
              maxLength={300}
              required
            />
          </section>
        )}

        {(nameRequired || profileError) && (
          <section
            aria-labelledby="customer-profile-title"
            className="rounded-lg border border-border bg-elevated p-4 shadow-2 sm:p-5"
          >
            <div className="mb-3">
              <h2 id="customer-profile-title" className="text-base font-bold text-text">
                {t('booking.nameTitle', { defaultValue: 'نام برای رزرو' })}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {t('booking.nameBody', { defaultValue: 'برای اینکه سالن شما را درست بشناسد، نام را فقط یک‌بار ثبت کنید.' })}
              </p>
            </div>
            <TextField
              label={t('booking.nameLabel', { defaultValue: 'نام و نام خانوادگی' })}
              value={customerName}
              onChange={(event) => {
                setCustomerName(event.target.value);
                if (nameError) setNameError('');
                if (profileError) setProfileError('');
              }}
              error={nameError}
              helperText={
                !nameError
                  ? t('booking.nameHelper', { defaultValue: 'این نام برای رزروهای بعدی ذخیره می‌شود.' })
                  : undefined
              }
              autoComplete="name"
              maxLength={120}
              required
            />
          </section>
        )}

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
      </div>
    </FunnelShell>
  );
}
