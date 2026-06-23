import type { SmsProvider, SmsDeliveryResult } from '../auth/sms-provider.interface';
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  fetchWithTimeout,
  logDeliveryOutcome,
  toErrorMessage,
} from './provider-http';

/**
 * Configuration for the Kavenegar SMS adapter. Supplied by the Composition_Root
 * from environment variables — no secrets are hard-coded (Requirement 5.6).
 */
export interface KavenegarConfig {
  /** Kavenegar API key. */
  apiKey?: string;
  /** API base URL. Defaults to the public Kavenegar endpoint. */
  baseUrl?: string;
  /** Optional sender line; omitted when not configured (uses the account default). */
  sender?: string;
  /** Per-request timeout in milliseconds. Defaults to ~10s. */
  timeoutMs?: number;
}

/**
 * Kavenegar SMS adapter — primary SMS provider for the Iranian market.
 *
 * Performs a real HTTP POST to `/v1/{apiKey}/sms/send.json` with the configured
 * API key. On an HTTP 2xx response whose body reports success it returns
 * `{ ok: true, providerId }` (the Kavenegar `messageid`); on any non-2xx
 * response, provider error body, network error, or timeout it returns
 * `{ ok: false, error }` and never throws (Requirements 5.1, 5.3, 5.4).
 *
 * Requirements: R5.1, R5.3, R5.4, R5.6 (orig R12.1)
 */
export class KavenegarSmsAdapter implements SmsProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly sender?: string;
  private readonly timeoutMs: number;

  constructor(config: KavenegarConfig = {}) {
    this.apiKey = config.apiKey ?? '';
    this.baseUrl = config.baseUrl ?? 'https://api.kavenegar.com';
    this.sender = config.sender;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  async send(phone: string, message: string): Promise<SmsDeliveryResult> {
    const url = `${this.baseUrl}/v1/${this.apiKey}/sms/send.json`;

    const params = new URLSearchParams();
    params.set('receptor', phone);
    params.set('message', message);
    if (this.sender) {
      params.set('sender', this.sender);
    }

    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        },
        this.timeoutMs,
      );

      if (!response.ok) {
        return this.fail(phone, `Kavenegar HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        return?: { status?: number; message?: string };
        entries?: Array<{ messageid?: number | string; statustext?: string }>;
      };

      const apiStatus = data.return?.status;
      const messageId = data.entries?.[0]?.messageid;

      if (apiStatus === 200 && messageId !== undefined && messageId !== null) {
        return this.ok(phone, String(messageId));
      }

      return this.fail(
        phone,
        data.return?.message ?? `Kavenegar error status ${apiStatus ?? 'unknown'}`,
      );
    } catch (err) {
      return this.fail(phone, toErrorMessage(err));
    }
  }

  private ok(target: string, providerId: string): SmsDeliveryResult {
    logDeliveryOutcome({ provider: 'kavenegar', target, ok: true, providerId });
    return { ok: true, providerId };
  }

  private fail(target: string, error: string): SmsDeliveryResult {
    logDeliveryOutcome({ provider: 'kavenegar', target, ok: false, error });
    return { ok: false, error };
  }
}
