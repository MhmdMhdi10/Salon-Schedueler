import { formatJalaliWithDay } from '@salon/shared';
import type { BookingResult } from '../scheduling/scheduling-engine.js';
import type {
  BookingDraft,
  BookingOutcomePresenter,
  BotBookingOutcome,
} from './booking-state-machine.js';
import { toPersianDigits } from './persian-digits.js';

/**
 * Task 7.3 — the REAL {@link BookingOutcomePresenter}.
 *
 * After the conversational state machine calls `BookingFlow.book(...)`, it hands
 * the server's {@link BookingResult} to this presenter. The presenter turns the
 * three result branches into Persian outbound messages and sends them through
 * `outcome.send(...)`:
 *
 *  - `confirmed` → confirmation details (service/date/time). This is the ONLY
 *    branch that may tell the user the booking is done.
 *  - `held`      → the payment gateway link (`payment.redirectUrl`) with an
 *    explicit "payment required" message. It must NOT claim the booking is
 *    confirmed.
 *  - `rejected`  → a clear failure message (the slot is no longer available).
 *
 * CRITICAL (Requirement 1.6 / design "never fabricate success"): confirmation
 * is presented only when the server result is `confirmed`. The presenter never
 * invents a success the scheduling engine did not return.
 */

// ─── Persian outcome copy ────────────────────────────────────────────────────
export const OUTCOME_MSG = {
  /** Heading for the confirmed-booking details message. */
  confirmedHeading: 'رزرو شما با موفقیت ثبت شد ✅',
  /** Heading shown before the payment link when the booking is held. */
  heldHeading:
    'برای نهایی‌شدن رزرو لطفاً پرداخت را تکمیل کنید. این رزرو هنوز قطعی نشده است.',
  /** Label preceding the payment gateway link. */
  heldPayPrompt: 'لینک پرداخت:',
  /** Shown when a held result somehow lacks a redirect URL. */
  heldNoLink:
    'برای تکمیل رزرو نیاز به پرداخت است، اما لینک پرداخت در دسترس نیست. لطفاً دوباره تلاش کنید.',
  /** Failure message when the slot is no longer available. */
  rejectedNoAvailability:
    'متأسفانه این زمان دیگر در دسترس نیست. لطفاً زمان دیگری را انتخاب کنید.',
  /** Generic rejection (defensive; same family as no-availability). */
  rejectedSlotUnavailable:
    'متأسفانه این زمان دیگر قابل رزرو نیست. لطفاً زمان دیگری را انتخاب کنید.',
} as const;

/**
 * Default {@link BookingOutcomePresenter} wired in the Composition_Root,
 * replacing the no-op the state machine uses by default.
 */
export class DefaultBookingOutcomePresenter implements BookingOutcomePresenter {
  async present(outcome: BotBookingOutcome): Promise<void> {
    const text = formatOutcomeText(outcome.result, outcome.draft);
    await outcome.send({ chatId: outcome.chatId, text });
  }
}

/**
 * Pure formatter for a booking outcome. Exposed for unit testing the exact
 * message produced for each result branch.
 */
export function formatOutcomeText(
  result: BookingResult,
  draft: BookingDraft,
): string {
  switch (result.status) {
    case 'confirmed':
      return [OUTCOME_MSG.confirmedHeading, ...detailLines(draft)].join('\n');

    case 'held': {
      const url = result.payment.redirectUrl;
      if (!url) {
        return OUTCOME_MSG.heldNoLink;
      }
      return [
        OUTCOME_MSG.heldHeading,
        ...detailLines(draft),
        `${OUTCOME_MSG.heldPayPrompt} ${url}`,
      ].join('\n');
    }

    case 'rejected':
      return result.reason === 'no_availability'
        ? OUTCOME_MSG.rejectedNoAvailability
        : OUTCOME_MSG.rejectedSlotUnavailable;
  }
}

/** Service/date/time detail lines from the draft, omitting any missing field. */
function detailLines(draft: BookingDraft): string[] {
  return [
    draft.serviceName ? `خدمت: ${draft.serviceName}` : '',
    draft.date ? `تاریخ: ${jalaliDayLabel(draft.date)}` : '',
    draft.startAt ? `ساعت: ${timeLabel(draft.startAt)}` : '',
  ].filter((line) => line.length > 0);
}

// ─── Persian/Jalali rendering (mirrors the state machine's display helpers) ───

/** Jalali day label (e.g. «شنبه ۱۴۰۳/۰۱/۰۱») with Persian digits. */
function jalaliDayLabel(isoDate: string): string {
  // Noon-UTC anchor avoids a day-shift when formatting across time zones.
  const d = new Date(`${isoDate}T12:00:00Z`);
  return toPersianDigits(formatJalaliWithDay(d));
}

/** Persian-digit `HH:MM` derived from an ISO datetime. */
function timeLabel(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return toPersianDigits(`${hh}:${mm}`);
}
