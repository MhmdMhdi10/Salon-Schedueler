import type { PrismaClient } from '@prisma/client';
import { formatJalaliWithDay } from '@salon/shared';
import type {
  BookingRequest,
  BookingResult,
  BookingPayment,
  TimeSlot,
} from '../scheduling/scheduling-engine.js';
import type {
  BotAdapter,
  BotButton,
  BotPlatform,
  BotSendResult,
  InboundBotUpdate,
  OutboundBotMessage,
} from './bot-adapter.interface.js';
import type { BotUpdateHandler } from './bot.service.js';
import { normalizeDigits, toPersianDigits } from './persian-digits.js';

/**
 * In-chat conversational booking — the `BotUpdateHandler` that drives a
 * `BotSession`-backed state machine (service → date → slot → confirm, with an
 * OTP sub-flow when the chat is not yet linked to a customer).
 *
 * Design principles (Requirements 1.6, 6.6):
 *  - REUSE, don't rewrite: availability comes from `SchedulingEngine`
 *    (`BotSchedulingPort`) and the actual booking goes through `BookingFlow.book`
 *    (`BotBookingPort`) with `source: 'bot'` — the bot never re-implements
 *    scheduling rules so all channels share one source of truth.
 *  - State is persisted server-side in `BotSession` (never in process memory) so
 *    a conversation survives restart / horizontal scale.
 *  - Identity reuses the existing OTP flow in-chat (`AuthService`): when no
 *    `BotChat` links the conversation to a customer, the bot collects a phone,
 *    `requestOtp`s, verifies the code, then creates the `BotChat` link.
 *  - Dates render in Jalali with Persian digits; counters/times use Persian
 *    digits (Requirement 6.6).
 *
 * Task 7.3 owns the held/redirect + confirmation messaging: it plugs in through
 * the {@link BookingOutcomePresenter} seam, which receives the `BookingResult`
 * after `book(...)` is called. Task 7.2 stops at calling `book` and clearing the
 * session, leaving that seam clean.
 */

/** The scheduling capability the bot needs. `SchedulingEngine` satisfies it. */
export interface BotSchedulingPort {
  getAvailability(query: {
    salonId: string;
    serviceId: string;
    date: string;
  }): Promise<TimeSlot[]>;
}

/** The booking capability the bot needs. `BookingFlow` satisfies it. */
export interface BotBookingPort {
  book(req: BookingRequest): Promise<BookingResult>;
}

/** Payment capability used when a bot booking creates a held appointment. */
export interface BotPaymentPort {
  initiateDeposit(appointmentId: string): Promise<BookingPayment>;
}

/** The OTP/identity capability the bot needs. `AuthService` satisfies it. */
export interface BotAuthPort {
  requestOtp(phone: string): Promise<void>;
  verifyOtp(phone: string, code: string): Promise<unknown>;
}

/** Context handed to the 7.3 result presenter after a booking is attempted. */
export interface BotBookingOutcome {
  platform: BotPlatform;
  chatId: string;
  result: BookingResult;
  /** The draft that produced the booking (service/date/time for messaging). */
  draft: BookingDraft;
  /** Send a message back to the originating chat (no-op when adapter absent). */
  send(message: OutboundBotMessage): Promise<BotSendResult>;
}

/**
 * Seam for task 7.3: present the booking result (held → gateway link,
 * confirmed → details). The default is a no-op so task 7.2 only drives the
 * conversation up to `book(...)` without fabricating success messaging.
 */
export interface BookingOutcomePresenter {
  present(outcome: BotBookingOutcome): Promise<void>;
}

/** The per-conversation draft persisted as `BotSession.draftJson`. */
export interface BookingDraft {
  salonId: string;
  serviceId?: string;
  serviceName?: string;
  /** Chosen Gregorian date, `YYYY-MM-DD`. */
  date?: string;
  /** Chosen slot start, ISO datetime. */
  startAt?: string;
  /** Phone collected during the OTP sub-flow (normalized to ASCII digits). */
  phone?: string;
  /** Where we are inside the OTP sub-flow. */
  otpStage?: 'phone' | 'code';
}

/** Constructor dependencies for {@link BotBookingStateMachine}. */
export interface BotBookingStateMachineDeps {
  /** Adapters used to send outbound messages, keyed internally by platform. */
  adapters: BotAdapter[];
  scheduling: BotSchedulingPort;
  booking: BotBookingPort;
  /** Optional for backwards-compatible fakes; production wiring provides it. */
  payment?: BotPaymentPort;
  auth: BotAuthPort;
  /** Real `PrismaClient`; `BotSession`/`BotChat`/lookups via narrow-cast. */
  prisma: PrismaClient;
  /** Task 7.3 plugs the held/confirmed messaging here; defaults to no-op. */
  outcome?: BookingOutcomePresenter;
  /** Clock seam for date-option generation (testability). */
  now?: () => Date;
  /** Number of upcoming days offered as date buttons. Default 7. */
  dateOptionDays?: number;
  /** Maximum number of slot buttons shown. Default 8. */
  maxSlots?: number;
}

// ─── Persisted session step names (mirror BotSession.step) ───────────────────
const STEP = {
  service: 'service',
  date: 'date',
  slot: 'slot',
  otp: 'otp',
  confirm: 'confirm',
  done: 'done',
} as const;

// ─── Inline-button callback prefixes ─────────────────────────────────────────
const CB = {
  service: 'svc:',
  date: 'date:',
  slot: 'slot:',
  confirm: 'confirm:',
} as const;

// ─── Persian conversation copy ───────────────────────────────────────────────
const MSG = {
  startHint:
    'برای شروع رزرو، لطفاً از لینک ربات سالن استفاده کنید یا دستور /book را همراه شناسهٔ سالن بفرستید.',
  noServices: 'این سالن در حال حاضر خدمتی برای رزرو ندارد.',
  chooseService: 'لطفاً خدمت موردنظر را انتخاب کنید:',
  chooseDate: 'لطفاً روز موردنظر را انتخاب کنید:',
  chooseSlot: 'لطفاً ساعت موردنظر را انتخاب کنید:',
  noSlots: 'برای این روز ساعت آزادی وجود ندارد. لطفاً روز دیگری انتخاب کنید:',
  askPhone: 'برای ادامه، لطفاً شمارهٔ موبایل خود را وارد کنید:',
  askCode: 'کد تأیید برای شما ارسال شد. لطفاً کد را وارد کنید:',
  otpError: 'کد واردشده نادرست یا منقضی است. لطفاً دوباره کد را وارد کنید:',
  cancelled: 'رزرو لغو شد. هر زمان خواستید دوباره شروع کنید.',
  confirmYes: 'بله، تأیید می‌کنم',
  confirmNo: 'خیر، لغو',
} as const;

/**
 * Narrow views of the Prisma delegates the state machine touches. Declared
 * locally because the checked-in generated client can lag the schema and may
 * not yet expose the `BotSession`/`BotChat` model types; the Composition_Root
 * passes the real `PrismaClient` and we reach the delegates through this narrow
 * shape (the stale-client narrow-cast pattern used by `QrService`).
 */
interface BotSessionRow {
  id: string;
  platform: string;
  chatId: string;
  step: string;
  draftJson: unknown;
}
interface BotChatRow {
  id: string;
  platform: string;
  chatId: string;
  customerId: string | null;
}
interface StateMachinePrisma {
  botSession: {
    findFirst(args: {
      where: { platform: string; chatId: string };
    }): Promise<BotSessionRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<BotSessionRow>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<BotSessionRow>;
    delete(args: { where: { id: string } }): Promise<unknown>;
  };
  botChat: {
    findFirst(args: {
      where: { platform: string; chatId: string };
    }): Promise<BotChatRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<BotChatRow>;
  };
  service: {
    findMany(args: {
      where: { salonId: string };
      orderBy?: unknown;
    }): Promise<Array<{ id: string; name: string; salonId: string }>>;
  };
  customer: {
    findUnique(args: {
      where: { phone: string };
    }): Promise<{ id: string } | null>;
  };
}

/** No-op presenter used until task 7.3 supplies real outcome messaging. */
const NOOP_PRESENTER: BookingOutcomePresenter = {
  async present(): Promise<void> {
    // Intentionally empty: held/confirmed messaging is task 7.3.
  },
};

export class BotBookingStateMachine implements BotUpdateHandler {
  private readonly adapters: Map<BotPlatform, BotAdapter>;
  private readonly scheduling: BotSchedulingPort;
  private readonly booking: BotBookingPort;
  private readonly payment?: BotPaymentPort;
  private readonly auth: BotAuthPort;
  private readonly prisma: PrismaClient;
  private readonly outcome: BookingOutcomePresenter;
  private readonly now: () => Date;
  private readonly dateOptionDays: number;
  private readonly maxSlots: number;

  constructor(deps: BotBookingStateMachineDeps) {
    this.adapters = new Map(deps.adapters.map((a) => [a.platform, a]));
    this.scheduling = deps.scheduling;
    this.booking = deps.booking;
    this.payment = deps.payment;
    this.auth = deps.auth;
    this.prisma = deps.prisma;
    this.outcome = deps.outcome ?? NOOP_PRESENTER;
    this.now = deps.now ?? (() => new Date());
    this.dateOptionDays = deps.dateOptionDays ?? 7;
    this.maxSlots = deps.maxSlots ?? 8;
  }

  /** Access the Prisma delegates through the narrow local shape. */
  private get db(): StateMachinePrisma {
    return this.prisma as unknown as StateMachinePrisma;
  }

  /**
   * Process one inbound update. Self-contained and best-effort: `Bot_Service`
   * wraps this so the webhook never fails. A `/start`|`/book` message (re)starts
   * the flow; otherwise the update is dispatched by the persisted session step.
   */
  async handle(update: InboundBotUpdate): Promise<void> {
    const { platform, chatId } = update;

    const start = parseStart(update.text);
    if (start) {
      await this.beginBooking(platform, chatId, start.salonId);
      return;
    }

    const session = await this.loadSession(platform, chatId);
    if (!session) {
      await this.send(platform, chatId, MSG.startHint);
      return;
    }

    const draft = (session.draftJson ?? {}) as BookingDraft;
    switch (session.step) {
      case STEP.service:
        return this.onServiceStep(session, draft, update);
      case STEP.date:
        return this.onDateStep(session, draft, update);
      case STEP.slot:
        return this.onSlotStep(session, draft, update);
      case STEP.otp:
        return this.onOtpStep(session, draft, update);
      case STEP.confirm:
        return this.onConfirmStep(session, draft, update);
      default:
        // Unknown/terminal step: nudge the user to restart.
        await this.send(platform, chatId, MSG.startHint);
    }
  }

  // ─── Step: entry ───────────────────────────────────────────────────────────

  private async beginBooking(
    platform: BotPlatform,
    chatId: string,
    salonId: string | undefined,
  ): Promise<void> {
    if (!salonId) {
      await this.send(platform, chatId, MSG.startHint);
      return;
    }

    const services = await this.listServices(salonId);
    if (services.length === 0) {
      await this.send(platform, chatId, MSG.noServices);
      return;
    }

    const draft: BookingDraft = { salonId };
    await this.upsertSession(platform, chatId, STEP.service, draft);
    await this.send(platform, chatId, MSG.chooseService, this.serviceButtons(services));
  }

  // ─── Step: service ───────────────────────────────────────────────────────────

  private async onServiceStep(
    session: BotSessionRow,
    draft: BookingDraft,
    update: InboundBotUpdate,
  ): Promise<void> {
    const { platform, chatId } = update;
    const serviceId = stripPrefix(update.callbackData, CB.service);

    const services = await this.listServices(draft.salonId);
    const chosen = serviceId
      ? services.find((s) => s.id === serviceId)
      : undefined;

    if (!chosen) {
      // Stale/invalid tap: re-present the service menu.
      await this.send(platform, chatId, MSG.chooseService, this.serviceButtons(services));
      return;
    }

    const next: BookingDraft = {
      ...draft,
      serviceId: chosen.id,
      serviceName: chosen.name,
    };
    await this.updateSession(session.id, STEP.date, next);
    await this.send(platform, chatId, MSG.chooseDate, this.dateButtons());
  }

  // ─── Step: date ───────────────────────────────────────────────────────────

  private async onDateStep(
    session: BotSessionRow,
    draft: BookingDraft,
    update: InboundBotUpdate,
  ): Promise<void> {
    const { platform, chatId } = update;
    const date = stripPrefix(update.callbackData, CB.date);

    if (!date || !isIsoDate(date)) {
      await this.send(platform, chatId, MSG.chooseDate, this.dateButtons());
      return;
    }

    const slots = await this.scheduling.getAvailability({
      salonId: draft.salonId,
      serviceId: draft.serviceId as string,
      date,
    });

    if (slots.length === 0) {
      // Keep the user on the date step so they can pick another day.
      await this.send(platform, chatId, MSG.noSlots, this.dateButtons());
      return;
    }

    const next: BookingDraft = { ...draft, date };
    await this.updateSession(session.id, STEP.slot, next);
    await this.send(platform, chatId, MSG.chooseSlot, this.slotButtons(slots));
  }

  // ─── Step: slot ───────────────────────────────────────────────────────────

  private async onSlotStep(
    session: BotSessionRow,
    draft: BookingDraft,
    update: InboundBotUpdate,
  ): Promise<void> {
    const { platform, chatId } = update;
    const startAt = stripPrefix(update.callbackData, CB.slot);

    if (!startAt) {
      // Re-derive slots for the stored date so the menu stays actionable.
      const slots = draft.date
        ? await this.scheduling.getAvailability({
            salonId: draft.salonId,
            serviceId: draft.serviceId as string,
            date: draft.date,
          })
        : [];
      await this.send(platform, chatId, MSG.chooseSlot, this.slotButtons(slots));
      return;
    }

    const next: BookingDraft = { ...draft, startAt };

    // Identity gate: linked chats go straight to confirm; otherwise OTP.
    const chat = await this.findChat(platform, chatId);
    if (chat?.customerId) {
      await this.updateSession(session.id, STEP.confirm, next);
      await this.sendConfirmPrompt(platform, chatId, next);
      return;
    }

    const otpDraft: BookingDraft = { ...next, otpStage: 'phone' };
    await this.updateSession(session.id, STEP.otp, otpDraft);
    await this.send(platform, chatId, MSG.askPhone);
  }

  // ─── Step: otp sub-flow ───────────────────────────────────────────────────

  private async onOtpStep(
    session: BotSessionRow,
    draft: BookingDraft,
    update: InboundBotUpdate,
  ): Promise<void> {
    const { platform, chatId } = update;
    const text = update.text ? normalizeDigits(update.text).trim() : '';

    if (draft.otpStage === 'phone') {
      const phone = text.replace(/\D/g, '');
      if (phone.length === 0) {
        await this.send(platform, chatId, MSG.askPhone);
        return;
      }
      await this.auth.requestOtp(phone);
      const next: BookingDraft = { ...draft, phone, otpStage: 'code' };
      await this.updateSession(session.id, STEP.otp, next);
      await this.send(platform, chatId, MSG.askCode);
      return;
    }

    // otpStage === 'code'
    const code = text.replace(/\D/g, '');
    if (code.length === 0 || !draft.phone) {
      await this.send(platform, chatId, MSG.askCode);
      return;
    }

    try {
      await this.auth.verifyOtp(draft.phone, code);
    } catch {
      // Stay on the code stage so the user can retry (never leak the code).
      await this.send(platform, chatId, MSG.otpError);
      return;
    }

    const customer = await this.db.customer.findUnique({
      where: { phone: draft.phone },
    });
    if (!customer) {
      // Verification succeeded but the customer could not be resolved.
      await this.send(platform, chatId, MSG.otpError);
      return;
    }

    await this.createChat(platform, chatId, customer.id);

    const next: BookingDraft = { ...draft, otpStage: undefined };
    await this.updateSession(session.id, STEP.confirm, next);
    await this.sendConfirmPrompt(platform, chatId, next);
  }

  // ─── Step: confirm ───────────────────────────────────────────────────────────

  private async onConfirmStep(
    session: BotSessionRow,
    draft: BookingDraft,
    update: InboundBotUpdate,
  ): Promise<void> {
    const { platform, chatId } = update;
    const choice = stripPrefix(update.callbackData, CB.confirm);

    if (choice === 'no') {
      await this.clearSession(session.id);
      await this.send(platform, chatId, MSG.cancelled);
      return;
    }

    if (choice !== 'yes') {
      // Unrecognized tap: re-present the confirmation prompt.
      await this.sendConfirmPrompt(platform, chatId, draft);
      return;
    }

    const chat = await this.findChat(platform, chatId);
    const customerId = chat?.customerId;
    if (!customerId || !draft.serviceId || !draft.startAt) {
      // Defensive: missing identity or selection — restart cleanly.
      await this.clearSession(session.id);
      await this.send(platform, chatId, MSG.startHint);
      return;
    }

    // Single source of truth: book through BookingFlow with source 'bot'.
    let result = await this.booking.book({
      salonId: draft.salonId,
      serviceId: draft.serviceId,
      startAt: draft.startAt,
      customerId,
      source: 'bot',
    });

    // The HTTP booking route starts payment after BookingFlow returns. Bots call
    // BookingFlow directly, so they must create the same payment session before
    // presenting a held result; otherwise gateway links are placeholders and
    // card-transfer instructions are missing entirely.
    if (result.status === 'held' && this.payment) {
      try {
        result = { ...result, payment: await this.payment.initiateDeposit(result.appointment.id) };
      } catch {
        await this.clearSession(session.id);
        await this.send(platform, chatId, 'رزرو موقت ایجاد شد اما آماده‌سازی پرداخت انجام نشد. لطفاً از سایت دوباره تلاش کنید.');
        return;
      }
    }

    // Conversation is finished; clear server-side state before handing the
    // result to the (task 7.3) presenter seam.
    await this.clearSession(session.id);

    const adapter = this.adapters.get(platform);
    await this.outcome.present({
      platform,
      chatId,
      result,
      draft,
      send: (message) =>
        adapter
          ? adapter.send(message)
          : Promise.resolve<BotSendResult>({ ok: false, error: 'no adapter' }),
    });
  }

  // ─── Prompt builders ───────────────────────────────────────────────────────

  private serviceButtons(
    services: Array<{ id: string; name: string }>,
  ): BotButton[] {
    return services.map((s) => ({ label: s.name, data: `${CB.service}${s.id}` }));
  }

  private dateButtons(): BotButton[] {
    const base = this.now();
    const buttons: BotButton[] = [];
    for (let i = 0; i < this.dateOptionDays; i++) {
      const day = new Date(
        Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i),
      );
      const iso = day.toISOString().slice(0, 10);
      buttons.push({ label: jalaliDayLabel(iso), data: `${CB.date}${iso}` });
    }
    return buttons;
  }

  private slotButtons(slots: TimeSlot[]): BotButton[] {
    return slots.slice(0, this.maxSlots).map((slot) => ({
      label: timeLabel(slot.startAt),
      data: `${CB.slot}${slot.startAt}`,
    }));
  }

  private async sendConfirmPrompt(
    platform: BotPlatform,
    chatId: string,
    draft: BookingDraft,
  ): Promise<void> {
    const lines = [
      'لطفاً رزرو خود را تأیید کنید:',
      `خدمت: ${draft.serviceName ?? '-'}`,
      draft.date ? `تاریخ: ${jalaliDayLabel(draft.date)}` : '',
      draft.startAt ? `ساعت: ${timeLabel(draft.startAt)}` : '',
    ].filter((l) => l.length > 0);
    await this.send(platform, chatId, lines.join('\n'), [
      { label: MSG.confirmYes, data: `${CB.confirm}yes` },
      { label: MSG.confirmNo, data: `${CB.confirm}no` },
    ]);
  }

  // ─── Persistence helpers (BotSession / BotChat via narrow-cast) ──────────────

  private async loadSession(
    platform: BotPlatform,
    chatId: string,
  ): Promise<BotSessionRow | null> {
    return this.db.botSession.findFirst({ where: { platform, chatId } });
  }

  /** Create the session if absent, else reset its step/draft (entry point). */
  private async upsertSession(
    platform: BotPlatform,
    chatId: string,
    step: string,
    draft: BookingDraft,
  ): Promise<void> {
    const existing = await this.loadSession(platform, chatId);
    if (existing) {
      await this.updateSession(existing.id, step, draft);
      return;
    }
    await this.db.botSession.create({
      data: { platform, chatId, step, draftJson: draft as unknown as object },
    });
  }

  private async updateSession(
    id: string,
    step: string,
    draft: BookingDraft,
  ): Promise<void> {
    await this.db.botSession.update({
      where: { id },
      data: { step, draftJson: draft as unknown as object },
    });
  }

  private async clearSession(id: string): Promise<void> {
    await this.db.botSession.delete({ where: { id } });
  }

  private async findChat(
    platform: BotPlatform,
    chatId: string,
  ): Promise<BotChatRow | null> {
    return this.db.botChat.findFirst({ where: { platform, chatId } });
  }

  private async createChat(
    platform: BotPlatform,
    chatId: string,
    customerId: string,
  ): Promise<void> {
    await this.db.botChat.create({
      data: { platform, chatId, customerId },
    });
  }

  private async listServices(
    salonId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.db.service.findMany({
      where: { salonId },
      orderBy: { name: 'asc' },
    });
  }

  // ─── Outbound send (no-op when no adapter / disabled) ────────────────────────

  private async send(
    platform: BotPlatform,
    chatId: string,
    text: string,
    buttons?: BotButton[],
  ): Promise<void> {
    const adapter = this.adapters.get(platform);
    if (!adapter || !adapter.enabled) {
      return;
    }
    const message: OutboundBotMessage = { chatId, text };
    if (buttons && buttons.length > 0) {
      message.buttons = buttons;
    }
    await adapter.send(message);
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Detect a conversation-start command. Recognizes `/start` and `/book`,
 * optionally followed by a salon-id deep-link payload. Returns `null` when the
 * text is not a start command so normal step dispatch proceeds.
 */
export function parseStart(
  text: string | undefined,
): { salonId?: string } | null {
  if (!text) {
    return null;
  }
  const trimmed = text.trim();
  const match = /^\/(start|book)(?:@\w+)?(?:\s+(\S+))?/i.exec(trimmed);
  if (!match) {
    return null;
  }
  return { salonId: match[2] };
}

/** Strip a known callback prefix, returning the payload or `undefined`. */
function stripPrefix(
  data: string | undefined,
  prefix: string,
): string | undefined {
  if (typeof data !== 'string' || !data.startsWith(prefix)) {
    return undefined;
  }
  return data.slice(prefix.length);
}

/** Whether `value` is a `YYYY-MM-DD` calendar date. */
function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Jalali day label (e.g. «شنبه ۱۴۰۳/۰۱/۰۱») with Persian digits. */
function jalaliDayLabel(isoDate: string): string {
  // Noon-UTC anchor avoids day-shift when formatting across time zones.
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
