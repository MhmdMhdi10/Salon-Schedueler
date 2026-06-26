import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarClock, CheckCircle2, Clock, Scissors, Store } from 'lucide-react';
import { SeoHead } from '../components/seo';
import { Button, Card, JalaliDate, toPersianDigits } from '../components/ui';

/**
 * Display-only booking summary handed over from the confirm step via router
 * state (R4.6 "confirm the booking with its details"). Every field is optional
 * so the receipt still renders if it is reached without state (e.g. a direct
 * deep link or a hard refresh) — the success moment + next action never depend
 * on the summary being present.
 */
interface BookingSuccessState {
  /** What — the booked service name. */
  serviceName?: string;
  /** When — the appointment start as an ISO instant (rendered Jalali + time). */
  startAt?: string;
  /** Where — the salon name. */
  salonName?: string;
}

/** Formats an ISO instant to an `HH:mm` label; digits are localized for display. */
function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Customer **booking-success** receipt at `/booking/success` (R4.6, R1.6;
 * ui-ux Booking-Success recipe, §6 states, §9 motion).
 *
 * The one screen where emphasized motion is allowed: a confident success
 * moment — a success icon + «رزرو شما با موفقیت ثبت شد» — that is
 * **reduced-motion-aware**. The icon springs/scales in by default; under
 * `prefers-reduced-motion` we drop the transform and keep a plain opacity
 * crossfade, and the animation never gates the content or the next action
 * (ui-ux §9, R1.6). `useReducedMotion()` reads the live media query so the
 * choice is honored without a reload.
 *
 * Below the moment, a **what / when / where** summary card confirms the booking
 * details (service · Jalali date + time · salon), composed from the design-system
 * primitives (`Card`, `<JalaliDate>`). The details arrive via router state from
 * the confirm step; when absent the card is simply omitted. A single clear next
 * action «بازگشت به خانه» returns the customer home.
 *
 * The `booking-success` testID is preserved so existing tests stay green. This
 * is a per-user receipt and must never be indexed; `<SeoHead>` (noindex default)
 * emits `noindex,follow` (seo §1, R8.7).
 */
export function BookingSuccessPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  const details = (location.state as BookingSuccessState | null) ?? {};
  const { serviceName, startAt, salonName } = details;
  const hasSummary = Boolean(serviceName || startAt || salonName);

  // Emphasized entrance for the success moment. Under reduced-motion we keep an
  // opacity-only crossfade (no scale/transform); otherwise the icon springs in.
  const iconMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, scale: 0.6 },
        animate: { opacity: 1, scale: 1 },
        transition: { type: 'spring' as const, stiffness: 260, damping: 18 },
      };

  return (
    <div
      data-testid="booking-success"
      className="mx-auto flex w-full max-w-funnel flex-col items-center gap-6 py-8 text-center"
    >
      <SeoHead title={t('seo.titles.success')} />

      {/* The success moment: animated check + confident confirmation copy. */}
      <div className="flex flex-col items-center gap-3">
        <motion.span
          {...iconMotion}
          className="inline-flex h-16 w-16 items-center justify-center rounded-pill bg-success/10 text-success"
          role="img"
          aria-label={t('booking.successIconLabel')}
        >
          <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
        </motion.span>
        <h1 className="text-xl font-bold text-text">{t('booking.success')}</h1>
        <p className="max-w-[40ch] text-sm text-muted">{t('booking.successSubtitle')}</p>
      </div>

      {/* What / when / where summary — omitted entirely when no details arrived. */}
      {hasSummary && (
        <section aria-labelledby="success-summary-title" className="w-full">
          <h2 id="success-summary-title" className="sr-only">
            {t('booking.successDetailsTitle')}
          </h2>
          <Card as="section" className="text-start">
            <dl className="flex flex-col divide-y divide-border">
              {serviceName && (
                <div className="flex items-center justify-between gap-4 py-2 first:pt-0">
                  <dt className="flex items-center gap-2 text-sm text-muted">
                    <Scissors className="h-4 w-4" aria-hidden="true" />
                    {t('booking.serviceLabel')}
                  </dt>
                  <dd className="text-sm font-medium text-text">{serviceName}</dd>
                </div>
              )}

              {startAt && (
                <>
                  <div className="flex items-center justify-between gap-4 py-2">
                    <dt className="flex items-center gap-2 text-sm text-muted">
                      <CalendarClock className="h-4 w-4" aria-hidden="true" />
                      {t('booking.dateLabel')}
                    </dt>
                    <dd className="text-sm font-medium text-text">
                      <JalaliDate value={startAt} withWeekday />
                    </dd>
                  </div>

                  <div className="flex items-center justify-between gap-4 py-2">
                    <dt className="flex items-center gap-2 text-sm text-muted">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      {t('booking.timeLabel')}
                    </dt>
                    <dd className="text-sm font-medium text-text">
                      {t('booking.timeAt', { time: toPersianDigits(timeLabel(startAt)) })}
                    </dd>
                  </div>
                </>
              )}

              {salonName && (
                <div className="flex items-center justify-between gap-4 py-2 last:pb-0">
                  <dt className="flex items-center gap-2 text-sm text-muted">
                    <Store className="h-4 w-4" aria-hidden="true" />
                    {t('booking.whereLabel')}
                  </dt>
                  <dd className="text-sm font-medium text-text">{salonName}</dd>
                </div>
              )}
            </dl>
          </Card>
        </section>
      )}

      {/* Clear next action. */}
      <Button size="lg" fullWidth onClick={() => navigate('/')}>
        {t('booking.successCta')}
      </Button>
    </div>
  );
}
