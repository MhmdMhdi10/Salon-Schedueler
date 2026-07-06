import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarClock, CalendarPlus, CheckCircle2, Clock, Scissors, Store } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { SeoHead } from '../components/seo';
import {
  Button,
  Card,
  CelebrationRing,
  ConfettiParticles,
  JalaliDate,
  toPersianDigits,
} from '../components/ui';
import { easings } from '../lib/motion-variants';

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
 * Customer **booking-success** receipt at `/booking/success` (Req 7.6, R4.6;
 * Booksy + NYC Redesign — celebration animation with CelebrationRing +
 * ConfettiParticles).
 *
 * The one screen where emphasized motion is allowed: a celebratory moment with
 * an expanding ring burst, confetti particles, and a checkmark pop animation.
 * Under `prefers-reduced-motion: reduce`, the CelebrationRing and
 * ConfettiParticles return null (handled internally), and the checkmark pop
 * degrades to an opacity-only fade via the `motion-safe:` CSS variant + the
 * authoritative reduced-motion block in `tokens.css`.
 *
 * Below the celebration, a **what / when / where** summary card confirms the
 * booking details (service · Jalali date + time · salon), composed from
 * design-system primitives (`Card`, `<JalaliDate>`). The details arrive via
 * router state from the confirm step; when absent the card is simply omitted.
 *
 * Two clear secondary CTAs: «افزودن به تقویم» (Add to Calendar) and
 * «بازگشت به خانه» (Back to Home).
 *
 * The `booking-success` testID is preserved so existing tests stay green. This
 * is a per-user receipt and must never be indexed; `<SeoHead>` (noindex default)
 * emits `noindex,follow`.
 */
export function BookingSuccessPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const prefersReduced = useReducedMotion();

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
      className="mx-auto flex w-full max-w-funnel flex-col items-center gap-6 px-4 py-8 text-center"
    >
      <SeoHead title={t('seo.titles.success')} />

      {/* ── Celebration Animation Layer ─────────────────────────────────── */}
      {/* CelebrationRing + ConfettiParticles fire on mount for the confirmed
          outcome. Both components internally check useReducedMotion() and
          return null under reduce — no transforms run. (Req 3.4, 3.5, 3.7) */}
      <div className="relative flex flex-col items-center gap-3">
        {/* Celebration effects — decorative, pointer-events-none, aria-hidden */}
        <div className="relative flex items-center justify-center">
          <CelebrationRing />
          <ConfettiParticles />

          {/* Status icon with success-pop keyframe — gated by motion-safe so
              under reduced-motion the transform never runs (only opacity stays).
              The icon is the focal anchor for the ring + confetti burst. */}
          <motion.span
            className={`relative inline-flex h-16 w-16 items-center justify-center rounded-pill motion-safe:animate-success-pop ${
              isConfirmed ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
            }`}
            role="img"
            aria-label={
              isConfirmed
                ? t('booking.successIconLabel')
                : t('booking.pendingIconLabel')
            }
            initial={prefersReduced ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              duration: 0.4,
              ease: easings.emphasized,
              delay: 0.15,
            }}
          >
            {isConfirmed ? (
              <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
            ) : (
              <Clock className="h-9 w-9" aria-hidden="true" />
            )}
          </motion.span>
        </div>

        {/* Heading + subtitle */}
        <h1 className="text-xl font-bold text-text">
          {isConfirmed ? t('booking.success') : t('booking.pendingTitle')}
        </h1>
        <p className="max-w-[40ch] text-sm text-muted">
          {isConfirmed ? t('booking.successSubtitle') : t('booking.pendingSubtitle')}
        </p>
      </div>

      {/* ── What / When / Where Summary ────────────────────────────────── */}
      {/* Omitted entirely when no details arrived via router state. */}
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

      {/* ── Secondary CTAs ─────────────────────────────────────────────── */}
      {/* Sticky bottom for thumb-zone on mobile (Req 10.2) */}
      <div className="sticky bottom-0 z-sticky -mx-4 mt-auto flex w-[calc(100%+2rem)] flex-col gap-3 border-t border-border bg-bg px-4 pb-[env(safe-area-inset-bottom)] pt-4 md:static md:mx-0 md:w-full md:border-t-0 md:bg-transparent md:p-0">
        {/* Add to Calendar — secondary action */}
        {startAt && (
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            startIcon={<CalendarPlus className="h-5 w-5" />}
            onClick={() => {
              // Generate a basic .ics download for the appointment
              const start = new Date(startAt);
              const end = new Date(start.getTime() + 60 * 60 * 1000); // 1h default
              const pad = (n: number) => String(n).padStart(2, '0');
              const toICS = (d: Date) =>
                `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
              const ics = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'BEGIN:VEVENT',
                `DTSTART:${toICS(start)}`,
                `DTEND:${toICS(end)}`,
                `SUMMARY:${serviceName ?? t('booking.heading')}`,
                salonName ? `LOCATION:${salonName}` : '',
                'END:VEVENT',
                'END:VCALENDAR',
              ]
                .filter(Boolean)
                .join('\r\n');
              const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'booking.ics';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t('booking.addToCalendar')}
          </Button>
        )}

        {/* Back to Home — primary next action */}
        <Button size="lg" fullWidth onClick={() => navigate('/')}>
          {t('booking.successCta')}
        </Button>
      </div>
    </div>
  );
}
