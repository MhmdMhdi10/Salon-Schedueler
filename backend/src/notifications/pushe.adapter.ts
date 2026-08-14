import type { PushProvider, PushPayload, PushDeliveryResult } from './push-provider.interface';
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  fetchWithTimeout,
  logDeliveryOutcome,
  toErrorMessage,
} from './provider-http';

/**
 * Configuration for the Pushe push adapter. Supplied by the Composition_Root
 * from environment variables — no secrets are hard-coded (Requirement 5.6).
 */
export interface PusheConfig {
  /** Pushe API token (sent as `Authorization: Token <apiKey>`). */
  apiKey?: string;
  /** API base URL. Defaults to the public Pushe endpoint. */
  baseUrl?: string;
  /** Pushe application id the device belongs to. */
  appId?: string;
  /** Per-request timeout in milliseconds. Defaults to ~10s. */
  timeoutMs?: number;
}

/**
 * Pushe push notification adapter — local push provider for the Iranian market
 * (works on devices without Google Play Services).
 *
 * Performs a real HTTP POST to `/v2/messaging/notifications/` with the configured
 * token. On an HTTP 2xx response carrying a notification id it returns
 * `{ ok: true, providerId }`; on any non-2xx response, provider error body,
 * network error, or timeout it returns `{ ok: false, error }` and never throws
 * (Requirements 5.2, 5.3, 5.4).
 *
 * Requirements: R5.2, R5.3, R5.4, R5.6 (orig R12.3)
 */
export class PusheAdapter implements PushProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly appId?: string;
  private readonly timeoutMs: number;

  constructor(config: PusheConfig = {}) {
    this.apiKey = config.apiKey ?? '';
    this.baseUrl = config.baseUrl ?? 'https://api.pushe.co';
    this.appId = config.appId;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  async send(token: string, payload: PushPayload): Promise<PushDeliveryResult> {
    const url = `${this.baseUrl}/v2/messaging/notifications/`;

    const body = {
      application: this.appId,
      devices: [token],
      notification: { title: payload.title, body: payload.body },
    };

    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Token ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        },
        this.timeoutMs,
      );

      if (!response.ok) {
        return this.fail(token, `Pushe HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        id?: number | string;
        notification_id?: number | string;
        message_id?: number | string;
        detail?: string;
        message?: string;
      };

      const providerId = data.id ?? data.notification_id ?? data.message_id;
      if (providerId !== undefined && providerId !== null) {
        return this.ok(token, String(providerId));
      }

      return this.fail(token, data.detail ?? data.message ?? 'Pushe response missing notification id');
    } catch (err) {
      return this.fail(token, toErrorMessage(err));
    }
  }

  private ok(target: string, providerId: string): PushDeliveryResult {
    logDeliveryOutcome({ provider: 'pushe', target, ok: true, providerId });
    return { ok: true, providerId };
  }

  private fail(target: string, error: string): PushDeliveryResult {
    logDeliveryOutcome({ provider: 'pushe', target, ok: false, error });
    return { ok: false, error };
  }
}
