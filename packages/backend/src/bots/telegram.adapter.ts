import { BotAdapterBase, type BotAdapterConfig } from './bot-adapter.base';
import type { BotPlatform } from './bot-adapter.interface';

/**
 * Concrete `Bot_Adapter` for Telegram.
 *
 * All send/parse logic is inherited from `BotAdapterBase`; Telegram only needs
 * to declare its `platform` and the public Bot-API base URL. The bot token is
 * supplied as runtime configuration (read from the environment by the
 * Composition_Root) and is never hard-coded (Requirements 1.7, 8.1).
 *
 * `enabled` is derived from token presence by the base: when no token is
 * configured the adapter reports `enabled = false` and `send` returns a failure
 * without performing any network call, so the rest of the platform keeps
 * working (Requirement 1.8).
 *
 * Requirements: 1.1, 1.7, 1.8
 */
export class TelegramAdapter extends BotAdapterBase {
  readonly platform: BotPlatform = 'telegram';
  protected readonly defaultBaseUrl = 'https://api.telegram.org';

  constructor(config: BotAdapterConfig = {}) {
    super(config);
  }
}
