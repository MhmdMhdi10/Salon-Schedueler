import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
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
  /** Booking outcome: `confirmed` (auto-approved) or `pending` (awaiting approval). */
  status?: 'pending' | 'confirmed';
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
 * The one screen where emphasized motion is allowed: a reassuring "request
 * submitted" moment — a clock icon + «درخواست رزرو شما ثبت شد» announcing the
 * booking now awaits salon approval — that is **reduced-motion-aware**. The icon
 * springs/scales in (the signature `motion-safe:animate-success-pop`, the single
 * use of the emphasized easing token, driven from `--dur-slow`/`--ease-emphasized`
 * and animating only `opacity`/`transform`). Under `prefers-reduced-motion` the
 * `motion-safe:` guard plus the authoritative reduced-motion block in `tokens.css`
 * drop the transform; the animation never gates the content or the next action
 * (ui-ux §9, R6.1–R6.5, R1.6).
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

  const details = (location.state as BookingSuccessState | null) ?? {};
  const { serviceName, startAt, salonName } = details;
  const hasSummary = Boolean(serviceName || startAt || salonName);
  // The receipt presents two server-decided outcomes: an auto-approved booking
  // (confirmed — success green + check) or one awaiting admin approval (pending —
  // warning amber + clock). Default to pending (the common, non-success case).
  const isConfirmed = details.status === 'confirmed';

  return (
    <div
      data-testid="booking-success"
      className="mx-auto flex w-full max-w-funnel flex-col items-center gap-6 py-8 text-center"
    >
      <SeoHead title={t('seo.titles.success')} />

      {/* The outcome moment. Confirmed → success green + check; pending →
          warning amber + clock. Either way it is reduced-motion-aware and never
          gates content or the next action (ui-ux §3, §6, §9). */}
      <div className="flex flex-col items-center gap-3">
        <span
          className={`inline-flex h-16 w-16 items-center justify-center rounded-pill motion-safe:animate-success-pop ${
            isConfirmed ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
          }`}
          role="img"
          aria-label={
            isConfirmed
              ? t('booking.successIconLabel')
              : t('booking.pendingIconLabel')
          }
        >
          {isConfirmed ? (
            <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
          ) : (
            <Clock className="h-9 w-9" aria-hidden="true" />
          )}
        </span>
        <h1 className="text-xl font-bold text-text">
          {isConfirmed ? t('booking.success') : t('booking.pendingTitle')}
        </h1>
        <p className="max-w-[40ch] text-sm text-muted">
          {isConfirmed ? t('booking.successSubtitle') : t('booking.pendingSubtitle')}
        </p>
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
