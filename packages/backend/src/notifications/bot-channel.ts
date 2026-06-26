import type { BotAdapter, BotPlatform } from '../bots/bot-adapter.interface';
import type { SmsProvider } from '../auth/sms-provider.interface';
import type { NotificationLogEntry } from './notification.service';

/**
 * Bot_Channel — the bot-based notification channel that sits behind the existing
 * `NotificationService`, aligned with `SmsProvider` (Requirement 1.2).
 *
 * It routes OTP codes (Requirement 1.3), appointment reminders (Requirement 1.4),
 * and owner new-booking / cancellation notices (Requirement 1.5) through a
 * messaging bot when the recipient has a linked `BotChat`. When no `BotChat`
 * exists, the platform adapter is disabled, or the bot send fails, it falls back
 * to SMS so delivery still happens (Requirement 1.9). Every attempt is recorded
 * in `NotificationLog`: bot attempts under channel `telegram`/`bale` and the SMS
 * fallback under channel `sms`, each with status `sent` or `failed`
 * (Requirements 1.9, 1.10).
 *
 * Reuse, not rewrite: the bot transport is provided by the existing
 * `BotAdapter`s, the fallback by the existing `SmsProvider`, and logging via the
 * same `NotificationLog` sink used by `NotificationService`.
 */

/** A recipient's linked bot chat, resolved from the persisted `BotChat`. */
export interface BotChatRef {
  /** Platform the chat lives on (`telegram` | `bale`). */
  platform: BotPlatform;
  /** Opaque chat id on that platform. */
  chatId: string;
}

/**
 * A notification recipient. Either a customer (OTP, reminders) or a staff member
 * such as the salon owner (new-booking / cancellation notices). The phone number
 * is always required so the channel can fall back to SMS.
 */
export type BotRecipient =
  | { kind: 'customer'; customerId: string; phone: string }
  | { kind: 'staff'; staffMemberId: string; phone: string };

/**
 * Data-access port for the bot channel. Kept separate from Prisma so tests can
 * supply in-memory fakes (mirrors `NotificationRepository`).
 */
export interface BotChannelRepository {
  /** Resolve the recipient's linked bot chat, or `null` when none is linked. */
  findBotChat(recipient: BotRecipient): Promise<BotChatRef | null>;
  /** Log a single delivery attempt. */
  logNotification(
    entry: Omit<NotificationLogEntry, 'id' | 'createdAt'>,
  ): Promise<NotificationLogEntry>;
}

/** Outcome of a delivery attempt through the bot channel. */
export interface BotChannelDeliveryResult {
  /** Whether the message was ultimately delivered (via bot or SMS fallback). */
  ok: boolean;
  /** The channel that successfully delivered, or the last attempted channel. */
  channel: NotificationLogEntry['channel'];
  /** Whether the bot channel was attempted (a `BotChat` existed and was enabled). */
  attemptedBot: boolean;
  /** Whether delivery fell back to SMS (bot absent, disabled, or failed). */
  fellBackToSms: boolean;
}

/** Optional per-delivery metadata. */
export interface BotChannelSendOptions {
  /** Appointment this notification relates to, for the log row. */
  appointmentId?: string | null;
}

export class BotChannel {
  private readonly adapters: Map<BotPlatform, BotAdapter>;
  private readonly smsProvider: SmsProvider;
  private readonly repository: BotChannelRepository;

  /**
   * @param adapters - Bot adapters to route through, keyed internally by platform.
   *   A disabled adapter (no token) is treated the same as an absent `BotChat`.
   * @param smsProvider - Existing SMS provider used as the fallback channel.
   * @param repository - Bot-chat lookup and notification logging.
   */
  constructor(
    adapters: BotAdapter[],
    smsProvider: SmsProvider,
    repository: BotChannelRepository,
  ) {
    this.adapters = new Map(adapters.map((a) => [a.platform, a]));
    this.smsProvider = smsProvider;
    this.repository = repository;
  }

  /**
   * Deliver an OTP code to a customer through the bot when a `BotChat` exists,
   * otherwise via SMS (Requirement 1.3). OTP has no associated appointment, so
   * the log row's `appointmentId` is `null`.
   */
  async sendOtp(recipient: BotRecipient, message: string): Promise<BotChannelDeliveryResult> {
    return this.deliver(recipient, message, { appointmentId: null });
  }

  /**
   * Deliver an appointment reminder to a customer through the bot when a
   * `BotChat` exists, otherwise via SMS (Requirement 1.4).
   */
  async sendReminder(
    recipient: BotRecipient,
    message: string,
    options?: BotChannelSendOptions,
  ): Promise<BotChannelDeliveryResult> {
    return this.deliver(recipient, message, options);
  }

  /**
   * Deliver a new-booking or cancellation notice to the salon owner through the
   * bot when a `BotChat` exists, otherwise via SMS (Requirement 1.5).
   */
  async sendOwnerNotice(
    recipient: BotRecipient,
    message: string,
    options?: BotChannelSendOptions,
  ): Promise<BotChannelDeliveryResult> {
    return this.deliver(recipient, message, options);
  }

  /**
   * Core routing: try the bot channel when the recipient has a linked, enabled
   * chat; fall back to SMS on absence, disabled adapter, or bot failure. Each
   * attempt is logged. Never throws — transport errors are converted to logged
   * failures, mirroring `SmsProvider`/`BotAdapter`.
   */
  async deliver(
    recipient: BotRecipient,
    message: string,
    options?: BotChannelSendOptions,
  ): Promise<BotChannelDeliveryResult> {
    const appointmentId = options?.appointmentId ?? null;
    const botChat = await this.repository.findBotChat(recipient);
    const adapter = botChat ? this.adapters.get(botChat.platform) : undefined;

    // Attempt bot delivery only when a chat is linked AND its adapter is enabled.
    if (botChat && adapter && adapter.enabled) {
      const result = await adapter.send({ chatId: botChat.chatId, text: message });

      await this.repository.logNotification({
        appointmentId,
        channel: botChat.platform,
        status: result.ok ? 'sent' : 'failed',
        error: result.ok ? null : result.error,
      });

      if (result.ok) {
        return {
          ok: true,
          channel: botChat.platform,
          attemptedBot: true,
          fellBackToSms: false,
        };
      }

      // Bot send failed → fall back to SMS (Requirement 1.9).
      const fallback = await this.sendSms(recipient.phone, message, appointmentId);
      return {
        ok: fallback.ok,
        channel: 'sms',
        attemptedBot: true,
        fellBackToSms: true,
      };
    }

    // No linked chat or adapter disabled → SMS fallback (Requirement 1.9).
    const fallback = await this.sendSms(recipient.phone, message, appointmentId);
    return {
      ok: fallback.ok,
      channel: 'sms',
      attemptedBot: false,
      fellBackToSms: true,
    };
  }

  /** Send via SMS and log the outcome. */
  private async sendSms(
    phone: string,
    message: string,
    appointmentId: string | null,
  ): Promise<{ ok: boolean }> {
    const result = await this.smsProvider.send(phone, message);
    await this.repository.logNotification({
      appointmentId,
      channel: 'sms',
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? null : result.error,
    });
    return { ok: result.ok };
  }
}
