import type { PrismaClient } from '@prisma/client';
import {
  BotBookingStateMachine,
  parseStart,
  type BookingOutcomePresenter,
  type BotBookingOutcome,
  type BotAuthPort,
  type BotBookingPort,
  type BotSchedulingPort,
} from './booking-state-machine';
import { toPersianDigits } from './persian-digits';
import type {
  BotAdapter,
  BotPlatform,
  BotSendResult,
  InboundBotUpdate,
  OutboundBotMessage,
} from './bot-adapter.interface';
import type { BookingRequest, BookingResult, TimeSlot } from '../scheduling/scheduling-engine';

/**
 * Unit tests for the in-chat conversational booking state machine (task 7.2).
 *
 * They drive the machine with faked SchedulingEngine / BookingFlow / AuthService
 * and an in-memory BotSession/BotChat store, covering:
 *  - step progression service → date → slot → confirm,
 *  - that booking goes through BookingFlow.book with `source: 'bot'`,
 *  - the unlinked → OTP → BotChat-created path,
 *  - Persian-digit / Jalali rendering of dates and times.
 *
 * Requirements: 1.6, 6.6
 */

const PLATFORM: BotPlatform = 'telegram';
const CHAT_ID = '12345';
const SALON_ID = 'salon-1';

// ─── Fakes ───────────────────────────────────────────────────────────────────

/** Captures every outbound message; always reports success. */
class CapturingAdapter implements BotAdapter {
  readonly platform: BotPlatform = PLATFORM;
  readonly enabled = true;
  readonly sent: OutboundBotMessage[] = [];

  async send(message: OutboundBotMessage): Promise<BotSendResult> {
    this.sent.push(message);
    return { ok: true };
  }

  parseUpdate(): InboundBotUpdate | null {
    return null;
  }

  /** The most recent outbound message. */
  last(): OutboundBotMessage {
    return this.sent[this.sent.length - 1];
  }
}

class FakeScheduling implements BotSchedulingPort {
  calls: Array<{ salonId: string; serviceId: string; date: string }> = [];
  constructor(private readonly slots: TimeSlot[]) {}
  async getAvailability(query: {
    salonId: string;
    serviceId: string;
    date: string;
  }): Promise<TimeSlot[]> {
    this.calls.push(query);
    return this.slots;
  }
}

class FakeBooking implements BotBookingPort {
  readonly requests: BookingRequest[] = [];
  constructor(private readonly result: BookingResult) {}
  async book(req: BookingRequest): Promise<BookingResult> {
    this.requests.push(req);
    return this.result;
  }
}

class FakeAuth implements BotAuthPort {
  readonly requested: string[] = [];
  readonly verified: Array<{ phone: string; code: string }> = [];
  constructor(private readonly verifyOk: boolean = true) {}
  async requestOtp(phone: string): Promise<void> {
    this.requested.push(phone);
  }
  async verifyOtp(phone: string, code: string): Promise<unknown> {
    this.verified.push({ phone, code });
    if (!this.verifyOk) {
      throw new Error('OTP_MISMATCH');
    }
    return { accessToken: 'a', refreshToken: 'r' };
  }
}

/** In-memory BotSession/BotChat/service/customer store behind the narrow cast. */
class InMemoryDb {
  sessions: Array<{
    id: string;
    platform: string;
    chatId: string;
    step: string;
    draftJson: unknown;
  }> = [];
  chats: Array<{
    id: string;
    platform: string;
    chatId: string;
    customerId: string | null;
  }> = [];
  private seq = 0;

  constructor(
    private readonly services: Array<{ id: string; name: string; salonId: string }>,
    private readonly customersByPhone: Map<string, { id: string }>,
  ) {}

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  get botSession() {
    const store = this;
    return {
      async findFirst(args: { where: { platform: string; chatId: string } }) {
        return (
          store.sessions.find(
            (s) =>
              s.platform === args.where.platform && s.chatId === args.where.chatId,
          ) ?? null
        );
      },
      async create(args: { data: Record<string, unknown> }) {
        const row = {
          id: store.id('session'),
          platform: args.data.platform as string,
          chatId: args.data.chatId as string,
          step: args.data.step as string,
          draftJson: args.data.draftJson,
        };
        store.sessions.push(row);
        return row;
      },
      async update(args: { where: { id: string }; data: Record<string, unknown> }) {
        const row = store.sessions.find((s) => s.id === args.where.id);
        if (!row) throw new Error('session not found');
        if (args.data.step !== undefined) row.step = args.data.step as string;
        if (args.data.draftJson !== undefined) row.draftJson = args.data.draftJson;
        return row;
      },
      async delete(args: { where: { id: string } }) {
        store.sessions = store.sessions.filter((s) => s.id !== args.where.id);
        return {};
      },
    };
  }

  get botChat() {
    const store = this;
    return {
      async findFirst(args: { where: { platform: string; chatId: string } }) {
        return (
          store.chats.find(
            (c) =>
              c.platform === args.where.platform && c.chatId === args.where.chatId,
          ) ?? null
        );
      },
      async create(args: { data: Record<string, unknown> }) {
        const row = {
          id: store.id('chat'),
          platform: args.data.platform as string,
          chatId: args.data.chatId as string,
          customerId: (args.data.customerId as string) ?? null,
        };
        store.chats.push(row);
        return row;
      },
    };
  }

  get service() {
    const store = this;
    return {
      async findMany(args: { where: { salonId: string } }) {
        return store.services.filter((s) => s.salonId === args.where.salonId);
      },
    };
  }

  get customer() {
    const store = this;
    return {
      async findUnique(args: { where: { phone: string } }) {
        return store.customersByPhone.get(args.where.phone) ?? null;
      },
    };
  }
}

/** Presenter that records the outcome handed off to task 7.3. */
class RecordingPresenter implements BookingOutcomePresenter {
  outcomes: BotBookingOutcome[] = [];
  async present(outcome: BotBookingOutcome): Promise<void> {
    this.outcomes.push(outcome);
  }
}

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const SERVICES = [
  { id: 'svc-haircut', name: 'کوتاهی مو', salonId: SALON_ID },
  { id: 'svc-color', name: 'رنگ مو', salonId: SALON_ID },
];

const SLOTS: TimeSlot[] = [
  { startAt: '2024-03-16T09:00:00Z', endAt: '2024-03-16T09:30:00Z' },
  { startAt: '2024-03-16T10:00:00Z', endAt: '2024-03-16T10:30:00Z' },
];

const PENDING_RESULT: BookingResult = {
  status: 'pending',
  // The state machine never reads appointment fields; a minimal stub is enough.
  appointment: { id: 'appt-1' } as never,
};

interface HarnessOptions {
  linkedCustomerId?: string;
  verifyOk?: boolean;
  bookingResult?: BookingResult;
  slots?: TimeSlot[];
  customersByPhone?: Map<string, { id: string }>;
}

function makeHarness(opts: HarnessOptions = {}) {
  const adapter = new CapturingAdapter();
  const scheduling = new FakeScheduling(opts.slots ?? SLOTS);
  const booking = new FakeBooking(opts.bookingResult ?? PENDING_RESULT);
  const auth = new FakeAuth(opts.verifyOk ?? true);
  const presenter = new RecordingPresenter();
  const db = new InMemoryDb(
    SERVICES,
    opts.customersByPhone ?? new Map([['09120000000', { id: 'cust-1' }]]),
  );

  if (opts.linkedCustomerId) {
    db.chats.push({
      id: 'chat-pre',
      platform: PLATFORM,
      chatId: CHAT_ID,
      customerId: opts.linkedCustomerId,
    });
  }

  const machine = new BotBookingStateMachine({
    adapters: [adapter],
    scheduling,
    booking,
    auth,
    prisma: db as unknown as PrismaClient,
    outcome: presenter,
    // Fixed clock so date-button generation is deterministic.
    now: () => new Date('2024-03-15T12:00:00Z'),
  });

  return { adapter, scheduling, booking, auth, presenter, db, machine };
}

function msg(text: string, callbackData?: string): InboundBotUpdate {
  const update: InboundBotUpdate = { platform: PLATFORM, chatId: CHAT_ID };
  if (text) update.text = text;
  if (callbackData) update.callbackData = callbackData;
  return update;
}

function tap(callbackData: string): InboundBotUpdate {
  return { platform: PLATFORM, chatId: CHAT_ID, callbackData };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('parseStart', () => {
  it('recognizes /start and /book with a salon-id payload', () => {
    expect(parseStart('/book salon-1')).toEqual({ salonId: 'salon-1' });
    expect(parseStart('/start salon-9')).toEqual({ salonId: 'salon-9' });
    expect(parseStart('/start')).toEqual({ salonId: undefined });
  });

  it('returns null for non-start text', () => {
    expect(parseStart('سلام')).toBeNull();
    expect(parseStart(undefined)).toBeNull();
    expect(parseStart('')).toBeNull();
  });
});

describe('BotBookingStateMachine — linked chat happy path', () => {
  it('progresses service → date → slot → confirm and books with source "bot"', async () => {
    const h = makeHarness({ linkedCustomerId: 'cust-1' });

    // Start: presents the service menu and persists a session at step "service".
    await h.machine.handle(msg('/book salon-1'));
    expect(h.db.sessions).toHaveLength(1);
    expect(h.db.sessions[0].step).toBe('service');
    const serviceButtons = h.adapter.last().buttons ?? [];
    expect(serviceButtons.map((b) => b.label)).toEqual(['کوتاهی مو', 'رنگ مو']);

    // Choose a service → advances to "date".
    await h.machine.handle(tap('svc:svc-haircut'));
    expect(h.db.sessions[0].step).toBe('date');
    expect((h.db.sessions[0].draftJson as { serviceId: string }).serviceId).toBe(
      'svc-haircut',
    );
    expect((h.adapter.last().buttons ?? []).length).toBeGreaterThan(0);

    // Choose a date → calls getAvailability and advances to "slot".
    await h.machine.handle(tap('date:2024-03-16'));
    expect(h.scheduling.calls).toEqual([
      { salonId: SALON_ID, serviceId: 'svc-haircut', date: '2024-03-16' },
    ]);
    expect(h.db.sessions[0].step).toBe('slot');
    const slotButtons = h.adapter.last().buttons ?? [];
    expect(slotButtons).toHaveLength(2);

    // Choose a slot → linked chat skips OTP and goes to "confirm".
    await h.machine.handle(tap('slot:2024-03-16T09:00:00Z'));
    expect(h.db.sessions[0].step).toBe('confirm');

    // Confirm → books through BookingFlow with source 'bot', then clears session.
    await h.machine.handle(tap('confirm:yes'));
    expect(h.booking.requests).toHaveLength(1);
    expect(h.booking.requests[0]).toEqual({
      salonId: SALON_ID,
      serviceId: 'svc-haircut',
      startAt: '2024-03-16T09:00:00Z',
      customerId: 'cust-1',
      source: 'bot',
    });
    expect(h.db.sessions).toHaveLength(0);

    // The result is handed to the (task 7.3) presenter seam.
    expect(h.presenter.outcomes).toHaveLength(1);
    expect(h.presenter.outcomes[0].result.status).toBe('pending');
  });

  it('cancels and clears the session on confirm:no', async () => {
    const h = makeHarness({ linkedCustomerId: 'cust-1' });
    await h.machine.handle(msg('/book salon-1'));
    await h.machine.handle(tap('svc:svc-haircut'));
    await h.machine.handle(tap('date:2024-03-16'));
    await h.machine.handle(tap('slot:2024-03-16T09:00:00Z'));

    await h.machine.handle(tap('confirm:no'));
    expect(h.booking.requests).toHaveLength(0);
    expect(h.db.sessions).toHaveLength(0);
    expect(h.adapter.last().text).toContain('لغو');
  });
});

describe('BotBookingStateMachine — unlinked OTP path', () => {
  it('collects phone, requests + verifies OTP, creates BotChat, then books', async () => {
    const h = makeHarness(); // no linked chat

    await h.machine.handle(msg('/book salon-1'));
    await h.machine.handle(tap('svc:svc-haircut'));
    await h.machine.handle(tap('date:2024-03-16'));

    // Slot selection on an unlinked chat enters the OTP sub-flow (asks phone).
    await h.machine.handle(tap('slot:2024-03-16T09:00:00Z'));
    expect(h.db.sessions[0].step).toBe('otp');
    expect(h.adapter.last().text).toContain('موبایل');

    // Provide phone (Persian digits) → normalized + requestOtp called.
    await h.machine.handle(msg('۰۹۱۲۰۰۰۰۰۰۰'));
    expect(h.auth.requested).toEqual(['09120000000']);
    expect(h.adapter.last().text).toContain('کد');

    // No BotChat yet, and no booking yet.
    expect(h.db.chats).toHaveLength(0);
    expect(h.booking.requests).toHaveLength(0);

    // Provide code → verifyOtp, BotChat created, advances to confirm.
    await h.machine.handle(msg('۱۲۳۴۵۶'));
    expect(h.auth.verified).toEqual([{ phone: '09120000000', code: '123456' }]);
    expect(h.db.chats).toHaveLength(1);
    expect(h.db.chats[0].customerId).toBe('cust-1');
    expect(h.db.sessions[0].step).toBe('confirm');

    // Confirm → booking carries the resolved customerId and source 'bot'.
    await h.machine.handle(tap('confirm:yes'));
    expect(h.booking.requests[0].customerId).toBe('cust-1');
    expect(h.booking.requests[0].source).toBe('bot');
  });

  it('re-prompts for the code on a failed verification without leaking it', async () => {
    const h = makeHarness({ verifyOk: false });

    await h.machine.handle(msg('/book salon-1'));
    await h.machine.handle(tap('svc:svc-haircut'));
    await h.machine.handle(tap('date:2024-03-16'));
    await h.machine.handle(tap('slot:2024-03-16T09:00:00Z'));
    await h.machine.handle(msg('09120000000'));
    await h.machine.handle(msg('000000'));

    // Stays on the OTP step; no chat created; no booking; code not echoed back.
    expect(h.db.sessions[0].step).toBe('otp');
    expect(h.db.chats).toHaveLength(0);
    expect(h.booking.requests).toHaveLength(0);
    expect(h.adapter.last().text).not.toContain('000000');
  });
});

describe('BotBookingStateMachine — no availability', () => {
  it('keeps the user on the date step when no slots are free', async () => {
    const h = makeHarness({ slots: [] });
    await h.machine.handle(msg('/book salon-1'));
    await h.machine.handle(tap('svc:svc-haircut'));
    await h.machine.handle(tap('date:2024-03-16'));

    expect(h.db.sessions[0].step).toBe('date');
    expect(h.adapter.last().text).toContain('ساعت آزادی');
  });
});

describe('BotBookingStateMachine — Persian/Jalali rendering (Requirement 6.6)', () => {
  it('renders date buttons in Jalali with Persian digits', async () => {
    const h = makeHarness({ linkedCustomerId: 'cust-1' });
    await h.machine.handle(msg('/book salon-1'));
    await h.machine.handle(tap('svc:svc-haircut'));

    const dateButtons = h.adapter.last().buttons ?? [];
    expect(dateButtons.length).toBe(7);
    // 2024-03-15 → 1402/12/25 in Jalali; rendered with Persian digits.
    const firstLabel = dateButtons[0].label;
    expect(firstLabel).toContain('۱۴۰۲');
    expect(firstLabel).not.toMatch(/[0-9]/); // no Latin digits in the display
    // Carries a day name (e.g. «جمعه»/«پنجشنبه»).
    expect(firstLabel).toMatch(/\u0600-\u06FF|[آ-ی]/u);
  });

  it('renders slot buttons as Persian-digit times', async () => {
    const h = makeHarness({ linkedCustomerId: 'cust-1' });
    await h.machine.handle(msg('/book salon-1'));
    await h.machine.handle(tap('svc:svc-haircut'));
    await h.machine.handle(tap('date:2024-03-16'));

    const slotButtons = h.adapter.last().buttons ?? [];
    expect(slotButtons.map((b) => b.label)).toEqual([
      toPersianDigits('09:00'),
      toPersianDigits('10:00'),
    ]);
    expect(slotButtons[0].label).not.toMatch(/[0-9]/);
  });

  it('shows the chosen service/date/time in the confirm prompt', async () => {
    const h = makeHarness({ linkedCustomerId: 'cust-1' });
    await h.machine.handle(msg('/book salon-1'));
    await h.machine.handle(tap('svc:svc-haircut'));
    await h.machine.handle(tap('date:2024-03-16'));
    await h.machine.handle(tap('slot:2024-03-16T09:00:00Z'));

    const confirm = h.adapter.last();
    expect(confirm.text).toContain('کوتاهی مو');
    expect(confirm.text).toContain(toPersianDigits('09:00'));
    expect((confirm.buttons ?? []).map((b) => b.data)).toEqual([
      'confirm:yes',
      'confirm:no',
    ]);
  });
});

describe('BotBookingStateMachine — robustness', () => {
  it('nudges the user to start when no session exists and text is not a command', async () => {
    const h = makeHarness();
    await h.machine.handle(msg('سلام'));
    expect(h.db.sessions).toHaveLength(0);
    expect(h.adapter.last().text).toContain('شروع رزرو');
  });

  it('re-presents the service menu on an invalid service tap', async () => {
    const h = makeHarness({ linkedCustomerId: 'cust-1' });
    await h.machine.handle(msg('/book salon-1'));
    await h.machine.handle(tap('svc:does-not-exist'));
    // Still on the service step; menu re-presented.
    expect(h.db.sessions[0].step).toBe('service');
    expect((h.adapter.last().buttons ?? []).length).toBe(2);
  });

  it('reports no services when the salon has none', async () => {
    const adapter = new CapturingAdapter();
    const db = new InMemoryDb([], new Map());
    const machine = new BotBookingStateMachine({
      adapters: [adapter],
      scheduling: new FakeScheduling([]),
      booking: new FakeBooking(PENDING_RESULT),
      auth: new FakeAuth(),
      prisma: db as unknown as PrismaClient,
    });
    await machine.handle(msg('/book salon-1'));
    expect(adapter.last().text).toContain('خدمتی');
    expect(db.sessions).toHaveLength(0);
  });
});
