import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  fetchWithTimeout,
  logDeliveryOutcome,
  toErrorMessage,
} from '../notifications/provider-http';
import type {
  BotAdapter,
  BotPlatform,
  BotSendResult,
  InboundBotUpdate,
  OutboundBotMessage,
} from './bot-adapter.interface';

/**
 * Configuration shared by every bot adapter. Supplied by the Composition_Root
 * from environment variables — no token is hard-coded (Requirements 1.7, 8.1).
 */
export interface BotAdapterConfig {
  /** Platform bot token. Absence disables the adapter (`enabled = false`). */
  token?: string;
  /** API base URL override. Defaults to the platform's public endpoint. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to ~10s. */
  timeoutMs?: number;
}

/**
 * Shape of the Bot-API `sendMessage` request body shared by Telegram and Bale.
 * Both platforms accept `chat_id`, `text`, and an inline keyboard under
 * `reply_markup.inline_keyboard` (a grid of `{ text, callback_data }` buttons).
 */
export interface BotSendPayload {
  chat_id: string;
  text: string;
  reply_markup?: {
    inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
  };
}

/**
 * Shared base for the Telegram and Bale adapters. Both platforms expose an
 * API-compatible Bot API, so all send/parse logic lives here and concrete
 * adapters only supply the `platform` and the default `baseUrl` (and may
 * override `buildSendPayload`/`sendUrl` if a platform ever diverges)
 * (Requirement 1.1).
 *
 * `send` performs a real HTTP POST to `{baseUrl}/bot{token}/sendMessage` and,
 * mirroring `SmsProvider`, never throws: any HTTP error, provider-error body,
 * network failure, or timeout is converted into `{ ok: false, error }`
 * (Requirement 1.9). When no token is configured the adapter is disabled and
 * `send` returns a failure without performing any network call (Requirement 1.8).
 *
 * Requirements: 1.1, 1.7, 1.8, 8.1
 */
export abstract class BotAdapterBase implements BotAdapter {
  /** Which platform this adapter talks to. */
  abstract readonly platform: BotPlatform;

  /** Default API base URL for the platform when none is configured. */
  protected abstract readonly defaultBaseUrl: string;

  private readonly token: string;
  private readonly configuredBaseUrl?: string;
  private readonly timeoutMs: number;

  protected constructor(config: BotAdapterConfig = {}) {
    this.token = config.token ?? '';
    this.configuredBaseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  /** Whether a token is configured and the adapter is active. */
  get enabled(): boolean {
    return this.token.length > 0;
  }

  /** Effective API base URL (configured override or platform default). */
  protected get baseUrl(): string {
    return this.configuredBaseUrl ?? this.defaultBaseUrl;
  }

  /**
   * Build the Bot-API `sendMessage` URL. Telegram and Bale share the
   * `/bot{token}/sendMessage` convention; overridable per platform.
   */
  protected sendUrl(): string {
    return `${this.baseUrl}/bot${this.token}/sendMessage`;
  }

  /**
   * Translate a platform-independent message into the Bot-API request body.
   * Overridable per platform if a payload shape ever diverges.
   */
  protected buildSendPayload(message: OutboundBotMessage): BotSendPayload {
    const payload: BotSendPayload = {
      chat_id: message.chatId,
      text: message.text,
    };
    if (message.buttons && message.buttons.length > 0) {
      payload.reply_markup = {
        // One button per row keeps long Persian labels readable.
        inline_keyboard: message.buttons.map((button) => [
          { text: button.label, callback_data: button.data },
        ]),
      };
    }
    return payload;
  }

  async send(message: OutboundBotMessage): Promise<BotSendResult> {
    if (!this.enabled) {
      return this.fail(message.chatId, `${this.platform} adapter disabled (no token)`);
    }

    try {
      const response = await fetchWithTimeout(
        this.sendUrl(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(this.buildSendPayload(message)),
        },
        this.timeoutMs,
      );

      if (!response.ok) {
        return this.fail(message.chatId, `${this.platform} HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        ok?: boolean;
        description?: string;
      };

      if (data.ok === true) {
        return this.ok(message.chatId);
      }

      return this.fail(
        message.chatId,
        data.description ?? `${this.platform} send rejected`,
      );
    } catch (err) {
      return this.fail(message.chatId, toErrorMessage(err));
    }
  }

  /**
   * Normalize a raw Bot-API update into an `InboundBotUpdate`. Handles both a
   * plain `message` and a `callback_query` (inline-button tap). Returns `null`
   * when the body is unrecognized or carries no chat id, so callers can ignore
   * it without throwing.
   */
  parseUpdate(raw: unknown): InboundBotUpdate | null {
    if (typeof raw !== 'object' || raw === null) {
      return null;
    }
    const update = raw as {
      message?: { chat?: { id?: unknown }; text?: unknown };
      callback_query?: {
        data?: unknown;
        message?: { chat?: { id?: unknown } };
      };
    };

    // Inline-button tap takes precedence: it carries the callback payload.
    const callback = update.callback_query;
    if (callback) {
      const chatId = normalizeChatId(callback.message?.chat?.id);
      if (chatId === null) {
        return null;
      }
      return {
        platform: this.platform,
        chatId,
        callbackData:
          typeof callback.data === 'string' ? callback.data : undefined,
      };
    }

    const message = update.message;
    if (message) {
      const chatId = normalizeChatId(message.chat?.id);
      if (chatId === null) {
        return null;
      }
      return {
        platform: this.platform,
        chatId,
        text: typeof message.text === 'string' ? message.text : undefined,
      };
    }

    return null;
  }

  private ok(target: string): BotSendResult {
    logDeliveryOutcome({ provider: this.platform, target, ok: true });
    return { ok: true };
  }

  private fail(target: string, error: string): BotSendResult {
    logDeliveryOutcome({ provider: this.platform, target, ok: false, error });
    return { ok: false, error };
  }
}

/**
 * Coerce a Bot-API chat id (number or string) into a string, or `null` when it
 * is missing/unusable. Telegram sends numeric ids; normalizing to string keeps
 * the persisted `BotChat.chatId` representation stable.
 */
function normalizeChatId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}
