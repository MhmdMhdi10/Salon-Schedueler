import type { PushProvider, PushPayload, PushDeliveryResult } from './push-provider.interface';
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  fetchWithTimeout,
  logDeliveryOutcome,
  toErrorMessage,
} from './provider-http';

/**
 * Configuration for the Najva push adapter. Supplied by the Composition_Root
 * from environment variables — no secrets are hard-coded (Requirement 5.6).
 */
export interface NajvaConfig {
  /** Najva API key (sent as `Authorization: Bearer <apiKey>`). */
  apiKey?: string;
  /** API base URL. Defaults to the public Najva endpoint. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to ~10s. */
  timeoutMs?: number;
}

/**
 * Najva push notification adapter — alternative local push provider for the
 * Iranian market.
 *
 * Performs a real HTTP POST to `/api/v1/notifications/` with the configured
 * key. On an HTTP 2xx response carrying a notification id it returns
 * `{ ok: true, providerId }`; on any non-2xx response, provider error body,
 * network error, or timeout it returns `{ ok: false, error }` and never throws
 * (Requirements 5.2, 5.3, 5.4).
 *
 * Requirements: R5.2, R5.3, R5.4, R5.6 (orig R12.3)
 */
export class NajvaAdapter implements PushProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: NajvaConfig = {}) {
    this.apiKey = config.apiKey ?? '';
    this.baseUrl = config.baseUrl ?? 'https://api.najva.com';
    this.timeoutMs = config.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  async send(token: string, payload: PushPayload): Promise<PushDeliveryResult> {
    const url = `${this.baseUrl}/api/v1/notifications/`;

    const body = {
      subscribers: [token],
      title: payload.title,
      body: payload.body,
    };

    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        },
        this.timeoutMs,
      );

      if (!response.ok) {
        return this.fail(token, `Najva HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        id?: number | string;
        notification_id?: number | string;
        data?: { id?: number | string };
        message?: string;
      };

      const providerId = data.id ?? data.notification_id ?? data.data?.id;
      if (providerId !== undefined && providerId !== null) {
        return this.ok(token, String(providerId));
      }

      return this.fail(token, data.message ?? 'Najva response missing notification id');
    } catch (err) {
      return this.fail(token, toErrorMessage(err));
    }
  }

  private ok(target: string, providerId: string): PushDeliveryResult {
    logDeliveryOutcome({ provider: 'najva', target, ok: true, providerId });
    return { ok: true, providerId };
  }

  private fail(target: string, error: string): PushDeliveryResult {
    logDeliveryOutcome({ provider: 'najva', target, ok: false, error });
    return { ok: false, error };
  }
}
