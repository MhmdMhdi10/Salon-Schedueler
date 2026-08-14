import { BotAdapterBase, type BotAdapterConfig } from './bot-adapter.base';
import type { BotPlatform } from './bot-adapter.interface';

/**
 * Concrete `Bot_Adapter` for Bale (بله).
 *
 * Bale exposes a Bot API that is compatible with Telegram's, so this adapter
 * reuses all of `BotAdapterBase`'s send/parse logic and only overrides the
 * `platform` identifier and the public Bot-API base URL
 * (`https://tapi.bale.ai`) (Requirement 1.1).
 *
 * The bot token is supplied as runtime configuration (read from the environment
 * by the Composition_Root) and is never hard-coded (Requirements 1.7, 8.1).
 * When no token is configured the base reports `enabled = false` and `send`
 * fails without any network call, so other channels keep working gracefully
 * (Requirement 1.8).
 *
 * Requirements: 1.1, 1.7, 1.8
 */
export class BaleAdapter extends BotAdapterBase {
  readonly platform: BotPlatform = 'bale';
  protected readonly defaultBaseUrl = 'https://tapi.bale.ai';

  constructor(config: BotAdapterConfig = {}) {
    super(config);
  }
}
