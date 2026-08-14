import type {
  BotAdapter,
  BotPlatform,
  InboundBotUpdate,
} from './bot-adapter.interface';

/**
 * Conversational-update handler seam.
 *
 * `Bot_Service` normalizes a raw webhook body into an `InboundBotUpdate` and
 * forwards it to a `BotUpdateHandler`. Task 7.1 only wires the routing/dispatch
 * layer, so the default handler is a no-op; task 7.2 implements the
 * `BotSession`-backed booking state machine behind this same interface without
 * touching the routes or `handleUpdate` plumbing.
 */
export interface BotUpdateHandler {
  /**
   * Process a single normalized inbound update (a message or an inline-button
   * tap). Implementations should be self-contained; any error is caught by
   * `Bot_Service` so the webhook never fails.
   */
  handle(update: InboundBotUpdate): Promise<void>;
}

/** Default handler used until the booking state machine (task 7.2) lands. */
const NOOP_HANDLER: BotUpdateHandler = {
  async handle(): Promise<void> {
    // Intentionally empty: dispatch target is fleshed out in task 7.2.
  },
};

/**
 * Bot_Service — the entry point for inbound messaging-platform webhooks.
 *
 * The public bot webhook routes (`POST /api/bots/telegram/:secret` and
 * `/api/bots/bale/:secret`) normalize to `handleUpdate(platform, rawBody)`.
 * This service selects the matching platform adapter, parses the raw body into
 * a normalized `InboundBotUpdate`, and dispatches it to the conversational
 * handler.
 *
 * `handleUpdate` NEVER throws: the messaging platform retries webhooks that do
 * not return 2xx, so any parse/dispatch failure is swallowed and logged
 * internally rather than propagated to the route (which always answers 200 to
 * avoid retry storms).
 *
 * Tokens and the webhook secret are runtime configuration read from the
 * environment by the Composition_Root; this service never logs them
 * (Requirements 1.1, 1.6, 8.1).
 */
export class BotService {
  private readonly adapters: Map<BotPlatform, BotAdapter>;
  private readonly handler: BotUpdateHandler;

  constructor(adapters: BotAdapter[], handler: BotUpdateHandler = NOOP_HANDLER) {
    this.adapters = new Map(adapters.map((a) => [a.platform, a]));
    this.handler = handler;
  }

  /**
   * Normalize and dispatch a raw webhook body for the given platform.
   *
   * Steps:
   *  1. Resolve the platform adapter; unknown platform → ignored.
   *  2. `adapter.parseUpdate(rawBody)` → `InboundBotUpdate | null`; an
   *     unrecognized body parses to `null` and is ignored.
   *  3. Forward the normalized update to the conversational handler.
   *
   * All errors are caught internally so the caller (the webhook route) can
   * always answer 200 (Requirement 1.6, 8.1). Returns `true` when an update was
   * parsed and dispatched, `false` otherwise — useful for tests/diagnostics.
   */
  async handleUpdate(platform: BotPlatform, rawBody: unknown): Promise<boolean> {
    try {
      const adapter = this.adapters.get(platform);
      if (!adapter) {
        return false;
      }
      const update = adapter.parseUpdate(rawBody);
      if (update === null) {
        return false;
      }
      await this.handler.handle(update);
      return true;
    } catch (err) {
      // Never propagate to the route. Log internally without leaking secrets.
      logBotError(platform, err);
      return false;
    }
  }
}

/**
 * Log a bot-processing failure for the given platform. Logs only the platform
 * and a sanitized error message — never the bot token or the webhook secret
 * (Requirement 8.1).
 */
function logBotError(platform: BotPlatform, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(`[bot:${platform}] update processing failed: ${message}`);
}
