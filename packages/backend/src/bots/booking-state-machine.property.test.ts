import fc from 'fast-check';
import type { PrismaClient } from '@prisma/client';
import {
  BotBookingStateMachine,
  type BookingOutcomePresenter,
  type BotBookingOutcome,
  type BotAuthPort,
  type BotBookingPort,
  type BotSchedulingPort,
} from './booking-state-machine';
import type {
  BotAdapter,
  BotPlatform,
  BotSendResult,
  InboundBotUpdate,
  OutboundBotMessage,
} from './bot-adapter.interface';
import type {
  BookingRequest,
  BookingResult,
  TimeSlot,
} from '../scheduling/scheduling-engine';

/**
 * Property Tests — Feature: salon-platform-expansion
 *
 * Covers the in-chat conversational booking state machine (task 7.4). These
 * reuse the same in-memory BotSession/BotChat harness style as
 * `booking-state-machine.test.ts`, but drive arbitrary inputs through
 * fast-check (>= 100 runs each).
 *
 * Property 1: chat identity uniqueness — Validates: Requirements 1.6
 * Property 2: single booking source    — Validates: Requirements 1.6, 6.6
 * Property 3: no OTP/token leak         — Validates: Requirements 1.7, 8.1
 */

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const SALON_ID = 'salon-1';

const SERVICES = [
  { id: 'svc-haircut', name: 'کوتاهی مو', salonId: SALON_ID },
  { id: 'svc-color', name: 'رنگ مو', salonId: SALON_ID },
];

const SLOTS: TimeSlot[] = [
  { startAt: '2024-03-16T09:00:00Z', endAt: '2024-03-16T09:30:00Z' },
  { startAt: '2024-03-16T10:00:00Z', endAt: '2024-03-16T10:30:00Z' },
];

/** Date callbacks the date-step accepts (any YYYY-MM-DD passes the regex). */
const VALID_DATES = [
  '2024-03-15',
  '2024-03-16',
  '2024-03-17',
  '2024-03-18',
  '2024-03-19',
];

const PENDING_RESULT: BookingResult = {
  status: 'pending',
  appointment: { id: 'appt-1' } as never,
};

// ─── Fakes (mirroring booking-state-machine.test.ts) ─────────────────────────

/**
 * Captures every outbound message. Holds a (never-rendered) `token` to stand in
 * for the env-configured bot token, so Property 3 can assert the token never
 * leaks into any message the state machine emits.
 */
class CapturingAdapter implements BotAdapter {
  readonly enabled = true;
  readonly sent: OutboundBotMessage[] = [];

  constructor(
    readonly platform: BotPlatform,
    readonly token: string = '',
  ) {}

  async send(message: OutboundBotMessage): Promise<BotSendResult> {
    this.sent.push(message);
    return { ok: true };
  }

  parseUpdate(): InboundBotUpdate | null {
    return null;
  }
}

class FakeScheduling implements BotSchedulingPort {
  constructor(private readonly slots: TimeSlot[]) {}
  async getAvailability(): Promise<TimeSlot[]> {
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

/**
 * OTP fake: `verifyOtp` succeeds only when the submitted code matches
 * `expectedCode`; any other code throws (mirrors a failed verification). When
 * no expected code is supplied, every verification succeeds.
 */
class FakeAuth implements BotAuthPort {
  readonly requested: string[] = [];
  readonly verified: Array<{ phone: string; code: string }> = [];
  constructor(private readonly expectedCode?: string) {}
  async requestOtp(phone: string): Promise<void> {
    this.requested.push(phone);
  }
  async verifyOtp(phone: string, code: string): Promise<unknown> {
    this.verified.push({ phone, code });
    if (this.expectedCode !== undefined && code !== this.expectedCode) {
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

interface HarnessOptions {
  /** Pre-link a chat (chosen platform/chatId) to this customer id. */
  linkedCustomerId?: string;
  linkPlatform?: BotPlatform;
  linkChatId?: string;
  /** OTP code that `verifyOtp` will accept. */
  expectedCode?: string;
  /** Phone → customer map used to resolve identity after OTP. */
  customersByPhone?: Map<string, { id: string }>;
  /** Token configured on the capturing adapters. */
  token?: string;
}

function makeHarness(opts: HarnessOptions = {}) {
  // Register an adapter for both platforms so messages are captured for any key.
  const telegram = new CapturingAdapter('telegram', opts.token ?? '');
  const bale = new CapturingAdapter('bale', opts.token ?? '');
  const scheduling = new FakeScheduling(SLOTS);
  const booking = new FakeBooking(PENDING_RESULT);
  const auth = new FakeAuth(opts.expectedCode);
  const presenter = new RecordingPresenter();
  const db = new InMemoryDb(
    SERVICES,
    opts.customersByPhone ?? new Map([['09123456789', { id: 'cust-1' }]]),
  );

  if (opts.linkedCustomerId) {
    db.chats.push({
      id: 'chat-pre',
      platform: opts.linkPlatform ?? 'telegram',
      chatId: opts.linkChatId ?? 'chat-0',
      customerId: opts.linkedCustomerId,
    });
  }

  const machine = new BotBookingStateMachine({
    adapters: [telegram, bale],
    scheduling,
    booking,
    auth,
    prisma: db as unknown as PrismaClient,
    outcome: presenter,
    now: () => new Date('2024-03-15T12:00:00Z'),
  });

  const adapters: Record<BotPlatform, CapturingAdapter> = { telegram, bale };
  return { adapters, scheduling, booking, auth, presenter, db, machine };
}

/** Every outbound message text + button labels/data, for the given key. */
function outboundStrings(adapter: CapturingAdapter): string[] {
  const out: string[] = [];
  for (const m of adapter.sent) {
    out.push(m.text);
    for (const b of m.buttons ?? []) {
      out.push(b.label);
      out.push(b.data);
    }
  }
  return out;
}

// ─── Update builders for the chosen (platform, chatId) ───────────────────────

function text(platform: BotPlatform, chatId: string, t: string): InboundBotUpdate {
  return { platform, chatId, text: t };
}
function tap(platform: BotPlatform, chatId: string, data: string): InboundBotUpdate {
  return { platform, chatId, callbackData: data };
}

// ─── Property 1: chat identity uniqueness ────────────────────────────────────

/** A small vocabulary of conversational actions for the random-walk generator. */
type Action =
  | { kind: 'start' }
  | { kind: 'startNoSalon' }
  | { kind: 'service'; valid: boolean }
  | { kind: 'date' }
  | { kind: 'slot' }
  | { kind: 'phone' }
  | { kind: 'code' }
  | { kind: 'confirmYes' }
  | { kind: 'confirmNo' }
  | { kind: 'garbage' };

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  fc.constant<Action>({ kind: 'start' }),
  fc.constant<Action>({ kind: 'startNoSalon' }),
  fc.record({ kind: fc.constant<'service'>('service'), valid: fc.boolean() }),
  fc.constant<Action>({ kind: 'date' }),
  fc.constant<Action>({ kind: 'slot' }),
  fc.constant<Action>({ kind: 'phone' }),
  fc.constant<Action>({ kind: 'code' }),
  fc.constant<Action>({ kind: 'confirmYes' }),
  fc.constant<Action>({ kind: 'confirmNo' }),
  fc.constant<Action>({ kind: 'garbage' }),
);

function actionToUpdate(
  action: Action,
  platform: BotPlatform,
  chatId: string,
): InboundBotUpdate {
  switch (action.kind) {
    case 'start':
      return text(platform, chatId, `/book ${SALON_ID}`);
    case 'startNoSalon':
      return text(platform, chatId, '/start');
    case 'service':
      return tap(platform, chatId, action.valid ? 'svc:svc-haircut' : 'svc:nope');
    case 'date':
      return tap(platform, chatId, 'date:2024-03-16');
    case 'slot':
      return tap(platform, chatId, 'slot:2024-03-16T09:00:00Z');
    case 'phone':
      return text(platform, chatId, '09123456789');
    case 'code':
      return text(platform, chatId, '123456');
    case 'confirmYes':
      return tap(platform, chatId, 'confirm:yes');
    case 'confirmNo':
      return tap(platform, chatId, 'confirm:no');
    case 'garbage':
      return text(platform, chatId, 'سلام چطوری');
  }
}

describe('Feature: salon-platform-expansion, Property 1: chat identity uniqueness', () => {
  it('never holds more than one BotSession or BotChat per (platform, chatId) for any update sequence (R1.6)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<BotPlatform>('telegram', 'bale'),
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.array(actionArb, { minLength: 1, maxLength: 30 }),
        async (platform, chatId, actions) => {
          // Identity resolves successfully through OTP, so the link can be created.
          const h = makeHarness({ expectedCode: '123456' });

          for (const action of actions) {
            await h.machine.handle(actionToUpdate(action, platform, chatId));
          }

          const sessions = h.db.sessions.filter(
            (s) => s.platform === platform && s.chatId === chatId,
          );
          const chats = h.db.chats.filter(
            (c) => c.platform === platform && c.chatId === chatId,
          );

          // At most one BotSession and one BotChat for the key — the machine
          // upserts/links idempotently no matter how updates interleave.
          expect(sessions.length).toBeLessThanOrEqual(1);
          expect(chats.length).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 2: single booking source ───────────────────────────────────────

describe('Feature: salon-platform-expansion, Property 2: single booking source', () => {
  it('every conversation reaching confirm:yes books exactly once through BookingFlow.book with source "bot" (R1.6, R6.6)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<BotPlatform>('telegram', 'bale'),
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.constantFrom('svc-haircut', 'svc-color'),
        fc.constantFrom(...VALID_DATES),
        fc.constantFrom(...SLOTS.map((s) => s.startAt)),
        fc.boolean(),
        async (platform, chatId, serviceId, date, startAt, preLinked) => {
          const h = makeHarness(
            preLinked
              ? {
                  linkedCustomerId: 'cust-1',
                  linkPlatform: platform,
                  linkChatId: chatId,
                }
              : { expectedCode: '123456' },
          );

          // Drive a valid conversation to confirm:yes.
          await h.machine.handle(text(platform, chatId, `/book ${SALON_ID}`));
          await h.machine.handle(tap(platform, chatId, `svc:${serviceId}`));
          await h.machine.handle(tap(platform, chatId, `date:${date}`));
          await h.machine.handle(tap(platform, chatId, `slot:${startAt}`));

          if (!preLinked) {
            // Unlinked chats go through the in-chat OTP sub-flow first.
            await h.machine.handle(text(platform, chatId, '09123456789'));
            await h.machine.handle(text(platform, chatId, '123456'));
          }

          await h.machine.handle(tap(platform, chatId, 'confirm:yes'));

          // BookingFlow.book is the one and only booking path, invoked exactly
          // once, and every captured request carries source: 'bot'.
          expect(h.booking.requests).toHaveLength(1);
          for (const req of h.booking.requests) {
            expect(req.source).toBe('bot');
            expect(req.salonId).toBe(SALON_ID);
            expect(req.serviceId).toBe(serviceId);
            expect(req.startAt).toBe(startAt);
            expect(req.customerId).toBe('cust-1');
          }
          // The result is handed to the presenter (no fabricated success path).
          expect(h.presenter.outcomes).toHaveLength(1);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 3: no OTP/token leak ───────────────────────────────────────────

/** Arbitrary numeric OTP code (4–6 digits). */
const otpCodeArb = fc
  .stringOf(fc.constantFrom(...'0123456789'.split('')), {
    minLength: 4,
    maxLength: 6,
  })
  // Avoid coincidental substring collision with the fixed phone number.
  .filter((code) => !'09123456789'.includes(code));

/** Arbitrary bot token with a distinctive prefix (never produced by the UI). */
const tokenArb = fc
  .stringOf(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:_-'.split(''),
    ),
    { minLength: 4, maxLength: 40 },
  )
  .map((s) => `TKN_${s}`);

describe('Feature: salon-platform-expansion, Property 3: no OTP/token leak', () => {
  it('never leaks the OTP code into outbound messages or persisted state, nor the bot token into messages (R1.7, R8.1)', async () => {
    const PHONE = '09123456789';
    await fc.assert(
      fc.asyncProperty(otpCodeArb, tokenArb, async (code, token) => {
        const platform: BotPlatform = 'telegram';
        const chatId = 'chat-otp';
        const h = makeHarness({
          expectedCode: code,
          token,
          customersByPhone: new Map([[PHONE, { id: 'cust-1' }]]),
        });

        // Walk the unlinked flow to the OTP code stage.
        await h.machine.handle(text(platform, chatId, `/book ${SALON_ID}`));
        await h.machine.handle(tap(platform, chatId, 'svc:svc-haircut'));
        await h.machine.handle(tap(platform, chatId, 'date:2024-03-16'));
        await h.machine.handle(tap(platform, chatId, 'slot:2024-03-16T09:00:00Z'));
        await h.machine.handle(text(platform, chatId, PHONE));

        // A failed verification (wrong code), then the correct one.
        await h.machine.handle(text(platform, chatId, '00'));
        await h.machine.handle(text(platform, chatId, code));

        // Complete the booking.
        await h.machine.handle(tap(platform, chatId, 'confirm:yes'));

        const messages = outboundStrings(h.adapters[platform]);

        // The OTP code never appears in any outbound message.
        for (const s of messages) {
          expect(s.includes(code)).toBe(false);
        }
        // The bot token never appears in any outbound message.
        for (const s of messages) {
          expect(s.includes(token)).toBe(false);
        }
        // The OTP code is never persisted to session draft or chat rows.
        const persisted = JSON.stringify({
          sessions: h.db.sessions,
          chats: h.db.chats,
        });
        expect(persisted.includes(code)).toBe(false);
        expect(persisted.includes(token)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});
