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
 * state (R4.6 "confirm the booking with its details"), and mirrored into
 * sessionStorage so a hard refresh keeps showing the *real* outcome instead of
 * silently downgrading a confirmed booking to «در انتظار تایید». Without either
 * source the page never fabricates a receipt — it renders an honest
 * «رزرو فعالی یافت نشد» state (this is the single most trust-sensitive screen).
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

/** sessionStorage key holding the last real booking outcome (refresh-proof). */
export const LAST_BOOKING_KEY = 'ara-last-booking';

/** Best-effort read of the persisted outcome; malformed/missing → null. */
function readPersistedBooking(): BookingSuccessState | null {
  try {
    const raw = sessionStorage.getItem(LAST_BOOKING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BookingSuccessState;
    return parsed && (parsed.status === 'confirmed' || parsed.status === 'pending') ? parsed : null;
  } catch {
    return null;
  }
}

/** Best-effort persist (quota/private-mode failures are silently ignored). */
function writePersistedBooking(state: BookingSuccessState): void {
  try {
    sessionStorage.setItem(LAST_BOOKING_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable — the summary simply won't survive refresh.
  }
}

/** Formats an ISO instant to an `HH:mm` label; digits are localized for display. */
function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Customer **booking-success** receipt at `/booking/success` (Req 7.6, R4.6;
 * آرا Redesign — celebration animation with CelebrationRing + ConfettiParticles,
 * emphasized easing).
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
 * Wrapped in a minimal chrome-free layout (no nav, no header — just the
 * content + sticky bottom CTAs in thumb reach). Keyboard-operable RTL focus
 * order. `noindex`.
 *
 * The `booking-success` testID is preserved so existing tests stay green.
 */
export function BookingSuccessPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const prefersReduced = useReducedMotion();

  // Hydrate from router state (the real handoff from the confirm step) or,
  // on refresh, from the persisted copy. A fresh handoff refreshes the copy.
  const routed = location.state as BookingSuccessState | null;
  const details: BookingSuccessState = routed?.status ? routed : (readPersistedBooking() ?? {});
  if (routed?.status) writePersistedBooking(routed);

  const { serviceName, startAt, salonName } = details;
  const hasSummary = Boolean(serviceName || startAt || salonName);
  // The receipt presents two server-decided outcomes: an auto-approved booking
  // (confirmed — success green + check) or one awaiting admin approval (pending —
  // warning amber + clock).
  const isConfirmed = details.status === 'confirmed';

  // Direct visits / refreshes with no known booking: never fabricate a
  // receipt — render an honest empty state with the home CTA instead.
  if (!details.status) {
    return (
      <div
        data-testid="booking-success"
        data-shell="funnel-success"
        className="flex min-h-screen flex-col overflow-x-hidden bg-bg text-text"
      >
        <SeoHead title={t('seo.titles.success')} />
        <main
          id="funnel-content"
          tabIndex={-1}
          className="mx-auto flex w-full max-w-funnel flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center"
        >
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-pill bg-elevated text-muted">
            <CalendarClock className="h-9 w-9" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-bold text-text">{t('booking.noRecentTitle')}</h1>
          <p className="max-w-[40ch] text-sm text-muted">{t('booking.noRecentBody')}</p>
          <Button size="lg" onClick={() => navigate('/')}>
            {t('booking.successCta')}
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div
      data-testid="booking-success"
      data-shell="funnel-success"
      className="flex min-h-screen flex-col overflow-x-hidden bg-bg text-text"
    >
      <SeoHead title={t('seo.titles.success')} />

      {/* Chrome-free main content — no header/nav, just the celebration */}
      <main
        id="funnel-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-funnel flex-1 flex-col items-center gap-6 px-4 py-8 text-center"
      >
        {/* ── Celebration Animation Layer ─────────────────────────────────── */}
        {/* CelebrationRing + ConfettiParticles fire on mount for the confirmed
            outcome. Both components internally check useReducedMotion() and
            return null under reduce — no transforms run. (Req 3.4, 3.5, 3.7) */}
        <div className="relative flex flex-col items-center gap-3">
          {/* Celebration effects — decorative, pointer-events-none, aria-hidden */}
          <div className="relative flex items-center justify-center">
            {/* Celebrate ONLY a confirmed outcome — confetti over the amber
                «در انتظار تایید» state would misrepresent the server truth. */}
            {isConfirmed && (
              <>
                <CelebrationRing />
                <ConfettiParticles />
              </>
            )}

            {/* Status icon with emphasized easing pop — the ONE special moment.
                Under reduced-motion the transform never runs (opacity only).
                The icon is the focal anchor for the ring + confetti burst. */}
            <motion.span
              className={`relative inline-flex h-16 w-16 items-center justify-center rounded-pill motion-safe:animate-success-pop ${
                isConfirmed ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
              }`}
              role="img"
              aria-label={
                isConfirmed ? t('booking.successIconLabel') : t('booking.pendingIconLabel')
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
      </main>

      {/* ── Sticky Bottom CTAs (thumb-zone) ────────────────────────────── */}
      <div className="sticky bottom-0 z-sticky border-t border-border bg-bg pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-funnel flex-col gap-3 px-4 py-4">
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
    </div>
  );
}
