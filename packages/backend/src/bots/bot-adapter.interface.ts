/**
 * Bot messaging port (Telegram, Bale, ...).
 *
 * This is the bot-channel equivalent of `SmsProvider`: concrete adapters
 * (`Telegram_Adapter`, `Bale_Adapter`) implement this interface and are
 * injected by the Composition_Root. Telegram and Bale are API-similar, so the
 * bulk of the logic lives in the shared `BotAdapterBase` and only the
 * per-platform `baseUrl`/payload shape is overridden (Requirement 1.1).
 *
 * Bot tokens are supplied as runtime configuration read from environment
 * variables only — never hard-coded (Requirements 1.7, 8.1).
 */

/**
 * Messaging platform identifier.
 *
 * Mirrors the Prisma `BotPlatform` enum (`telegram` | `bale`). It is declared
 * locally as a string-literal union so the bot layer compiles independently of
 * the generated Prisma client, while remaining structurally compatible with
 * the persisted enum values.
 */
export type BotPlatform = 'telegram' | 'bale';

/** An inline button offered to the user (service/date/slot selection). */
export interface BotButton {
  /** Human-readable label shown on the button. */
  label: string;
  /** Opaque callback payload echoed back when the user taps the button. */
  data: string;
}

/** A platform-independent outbound message. */
export interface OutboundBotMessage {
  /** Destination chat id on the target platform. */
  chatId: string;
  /** Message body text. */
  text: string;
  /** Optional inline buttons (e.g. service/date/slot choices). */
  buttons?: BotButton[];
}

/** A normalized inbound update parsed from a platform webhook body. */
export interface InboundBotUpdate {
  /** Platform the update originated from. */
  platform: BotPlatform;
  /** Chat id the update belongs to. */
  chatId: string;
  /** Free-text message content, when present. */
  text?: string;
  /** Inline-button callback payload, when the user tapped a button. */
  callbackData?: string;
}

/** Result of an outbound send attempt — mirrors `SmsDeliveryResult`. */
export type BotSendResult = { ok: true } | { ok: false; error: string };

/**
 * Adapter for a single messaging platform. Telegram and Bale share structure,
 * so most behavior is provided by `BotAdapterBase`.
 */
export interface BotAdapter {
  /** Which platform this adapter talks to. */
  readonly platform: BotPlatform;
  /** Whether a token is configured and the adapter is active. */
  readonly enabled: boolean;
  /** Send a message; aligned with `SmsProvider.send`. Never throws. */
  send(message: OutboundBotMessage): Promise<BotSendResult>;
  /** Normalize a raw webhook body into an `InboundBotUpdate`, or `null`. */
  parseUpdate(raw: unknown): InboundBotUpdate | null;
}
