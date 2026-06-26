import {
  DefaultBookingOutcomePresenter,
  formatOutcomeText,
  OUTCOME_MSG,
} from './booking-outcome-presenter';
import type {
  BookingDraft,
  BotBookingOutcome,
} from './booking-state-machine';
import { toPersianDigits } from './persian-digits';
import type {
  BotSendResult,
  OutboundBotMessage,
} from './bot-adapter.interface';
import type { BookingResult } from '../scheduling/scheduling-engine';

/**
 * Unit tests for the task 7.3 booking-outcome presenter.
 *
 * They verify the three result branches map to the right outbound message:
 *  - confirmed → confirmation details, no fabrication beyond the server status,
 *  - held      → the gateway redirect link present, NOT claiming confirmation,
 *  - rejected  → a clear failure message.
 *
 * Requirements: 1.6
 */

const DRAFT: BookingDraft = {
  salonId: 'salon-1',
  serviceId: 'svc-haircut',
  serviceName: 'کوتاهی مو',
  date: '2024-03-16',
  startAt: '2024-03-16T09:00:00Z',
};

const CONFIRMED: BookingResult = {
  status: 'confirmed',
  appointment: { id: 'appt-1' } as never,
};

const HELD: BookingResult = {
  status: 'held',
  appointment: { id: 'appt-2' } as never,
  payment: {
    paymentId: 'pay-1',
    redirectUrl: 'https://gateway.example/pay/pay-1',
  },
};

const REJECTED_NO_AVAIL: BookingResult = {
  status: 'rejected',
  reason: 'no_availability',
};

const REJECTED_SLOT: BookingResult = {
  status: 'rejected',
  reason: 'slot_unavailable',
};

/** Phrases that would amount to fabricating a confirmed booking. */
const CONFIRMATION_PHRASES = [
  OUTCOME_MSG.confirmedHeading,
  'با موفقیت ثبت شد',
  'رزرو شما با موفقیت',
];

describe('formatOutcomeText — confirmed', () => {
  it('renders the confirmation heading and Jalali/Persian-digit details', () => {
    const text = formatOutcomeText(CONFIRMED, DRAFT);

    expect(text).toContain(OUTCOME_MSG.confirmedHeading);
    expect(text).toContain('کوتاهی مو');
    // Time rendered with Persian digits, no Latin digits in the time label.
    expect(text).toContain(toPersianDigits('09:00'));
    // Jalali year for 2024-03-16 is 1402.
    expect(text).toContain('۱۴۰۲');
  });

  it('omits detail lines for missing draft fields', () => {
    const text = formatOutcomeText(CONFIRMED, { salonId: 'salon-1' });
    expect(text).toBe(OUTCOME_MSG.confirmedHeading);
    expect(text).not.toContain('خدمت:');
    expect(text).not.toContain('تاریخ:');
    expect(text).not.toContain('ساعت:');
  });
});

describe('formatOutcomeText — held', () => {
  it('includes the gateway redirect link', () => {
    const text = formatOutcomeText(HELD, DRAFT);
    expect(text).toContain('https://gateway.example/pay/pay-1');
    expect(text).toContain(OUTCOME_MSG.heldPayPrompt);
  });

  it('does NOT claim the booking is confirmed (no fabricated success)', () => {
    const text = formatOutcomeText(HELD, DRAFT);
    for (const phrase of CONFIRMATION_PHRASES) {
      expect(text).not.toContain(phrase);
    }
    // Makes clear payment is still required.
    expect(text).toContain(OUTCOME_MSG.heldHeading);
  });

  it('falls back to a no-link message when redirectUrl is empty', () => {
    const heldNoUrl: BookingResult = {
      status: 'held',
      appointment: { id: 'appt-3' } as never,
      payment: { paymentId: 'pay-2', redirectUrl: '' },
    };
    const text = formatOutcomeText(heldNoUrl, DRAFT);
    expect(text).toBe(OUTCOME_MSG.heldNoLink);
    for (const phrase of CONFIRMATION_PHRASES) {
      expect(text).not.toContain(phrase);
    }
  });
});

describe('formatOutcomeText — rejected', () => {
  it('returns a clear failure message for no_availability', () => {
    const text = formatOutcomeText(REJECTED_NO_AVAIL, DRAFT);
    expect(text).toBe(OUTCOME_MSG.rejectedNoAvailability);
    for (const phrase of CONFIRMATION_PHRASES) {
      expect(text).not.toContain(phrase);
    }
  });

  it('returns a clear failure message for slot_unavailable', () => {
    const text = formatOutcomeText(REJECTED_SLOT, DRAFT);
    expect(text).toBe(OUTCOME_MSG.rejectedSlotUnavailable);
    for (const phrase of CONFIRMATION_PHRASES) {
      expect(text).not.toContain(phrase);
    }
  });
});

describe('DefaultBookingOutcomePresenter', () => {
  function makeOutcome(result: BookingResult): {
    outcome: BotBookingOutcome;
    sent: OutboundBotMessage[];
  } {
    const sent: OutboundBotMessage[] = [];
    const outcome: BotBookingOutcome = {
      platform: 'telegram',
      chatId: 'chat-1',
      result,
      draft: DRAFT,
      async send(message: OutboundBotMessage): Promise<BotSendResult> {
        sent.push(message);
        return { ok: true };
      },
    };
    return { outcome, sent };
  }

  it('sends the confirmation message to the originating chat on confirmed', async () => {
    const { outcome, sent } = makeOutcome(CONFIRMED);
    await new DefaultBookingOutcomePresenter().present(outcome);

    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe('chat-1');
    expect(sent[0].text).toContain(OUTCOME_MSG.confirmedHeading);
  });

  it('sends the gateway link and no confirmation on held', async () => {
    const { outcome, sent } = makeOutcome(HELD);
    await new DefaultBookingOutcomePresenter().present(outcome);

    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('https://gateway.example/pay/pay-1');
    expect(sent[0].text).not.toContain(OUTCOME_MSG.confirmedHeading);
  });

  it('sends a failure message on rejected', async () => {
    const { outcome, sent } = makeOutcome(REJECTED_NO_AVAIL);
    await new DefaultBookingOutcomePresenter().present(outcome);

    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe(OUTCOME_MSG.rejectedNoAvailability);
  });
});
