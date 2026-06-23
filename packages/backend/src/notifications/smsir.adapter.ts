import type { SmsProvider, SmsDeliveryResult } from '../auth/sms-provider.interface';
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  fetchWithTimeout,
  logDeliveryOutcome,
  toErrorMessage,
} from './provider-http';

/**
 * Configuration for the SMS.ir adapter. Supplied by the Composition_Root from
 * environment variables — no secrets are hard-coded (Requirement 5.6).
 */
export interface SmsIrConfig {
  /** SMS.ir API key (sent as the `x-api-key` header). */
  apiKey?: string;
  /** API base URL. Defaults to the public SMS.ir endpoint. */
  baseUrl?: string;
  /** Sender line number registered with the SMS.ir account. */
  lineNumber?: string;
  /** Per-request timeout in milliseconds. Defaults to ~10s. */
  timeoutMs?: number;
}

/**
 * SMS.ir adapter — alternative SMS provider for the Iranian market.
 *
 * Performs a real HTTP POST to `/v1/send/bulk` with the configured API key in
 * the `x-api-key` header. On an HTTP 2xx response reporting success it returns
 * `{ ok: true, providerId }` (the SMS.ir message id); on any non-2xx response,
 * provider error body, network error, or timeout it returns
 * `{ ok: false, error }` and never throws (Requirements 5.1, 5.3, 5.4).
 *
 * Requirements: R5.1, R5.3, R5.4, R5.6 (orig R12.1)
 */
export class SmsIrAdapter implements SmsProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly lineNumber?: string;
  private readonly timeoutMs: number;

  constructor(config: SmsIrConfig = {}) {
    this.apiKey = config.apiKey ?? '';
    this.baseUrl = config.baseUrl ?? 'https://api.sms.ir';
    this.lineNumber = config.lineNumber;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  async send(phone: string, message: string): Promise<SmsDeliveryResult> {
    const url = `${this.baseUrl}/v1/send/bulk`;

    const body = {
      lineNumber: this.lineNumber,
      messageText: message,
      mobiles: [phone],
    };

    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-api-key': this.apiKey,
          },
          body: JSON.stringify(body),
        },
        this.timeoutMs,
      );

      if (!response.ok) {
        return this.fail(phone, `SMS.ir HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        status?: number;
        message?: string;
        data?: { messageIds?: Array<number | string>; cost?: number };
      };

      const messageId = data.data?.messageIds?.[0];

      // SMS.ir reports success with status === 1.
      if (data.status === 1 && messageId !== undefined && messageId !== null) {
        return this.ok(phone, String(messageId));
      }

      return this.fail(
        phone,
        data.message ?? `SMS.ir error status ${data.status ?? 'unknown'}`,
      );
    } catch (err) {
      return this.fail(phone, toErrorMessage(err));
    }
  }

  private ok(target: string, providerId: string): SmsDeliveryResult {
    logDeliveryOutcome({ provider: 'smsir', target, ok: true, providerId });
    return { ok: true, providerId };
  }

  private fail(target: string, error: string): SmsDeliveryResult {
    logDeliveryOutcome({ provider: 'smsir', target, ok: false, error });
    return { ok: false, error };
  }
}
