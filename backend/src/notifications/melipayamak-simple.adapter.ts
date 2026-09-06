import type { SmsDeliveryResult, SmsProvider } from '../auth/sms-provider.interface';
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  fetchWithTimeout,
  logDeliveryOutcome,
  toErrorMessage,
} from './provider-http';

/** Configuration for Melli Payamak's plain-text SMS endpoint. */
export interface MelliPayamakSimpleConfig {
  /** Full `/api/send/simple/<token>` URL. Keep the token in environment config. */
  endpointUrl?: string;
  /** Sender line registered in the Melli Payamak account. */
  from?: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

interface MelliPayamakSimpleResponse {
  recId?: string | number;
  recID?: string | number;
  status?: string | number | null;
}

/**
 * Sends arbitrary staff-authored and fallback notification SMS messages via
 * Melli Payamak's simple JSON endpoint.
 *
 * Request shape: `{ from, to, text }`. The provider accepts the request when
 * it returns a record id; a non-empty status without an id is treated as an
 * error so the owner UI can offer retry instead of reporting a false success.
 */
export class MelliPayamakSimpleAdapter implements SmsProvider {
  private readonly endpointUrl: string;
  private readonly from?: string;
  private readonly timeoutMs: number;

  constructor(config: MelliPayamakSimpleConfig = {}) {
    this.endpointUrl = config.endpointUrl?.trim() ?? '';
    this.from = config.from?.trim() || undefined;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  async send(phone: string, message: string): Promise<SmsDeliveryResult> {
    if (!this.endpointUrl) {
      return this.fail(phone, 'Melli Payamak simple endpoint is not configured');
    }
    if (!this.from) {
      return this.fail(phone, 'Melli Payamak sender line is not configured');
    }
    if (!message.trim()) {
      return this.fail(phone, 'SMS message cannot be empty');
    }

    try {
      const response = await fetchWithTimeout(
        this.endpointUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ from: this.from, to: phone, text: message }),
        },
        this.timeoutMs,
      );

      const data = await this.readResponse(response);
      if (!response.ok) {
        return this.fail(phone, this.httpError(response.status, data));
      }
      if (!data) {
        return this.fail(phone, 'Melli Payamak returned a non-JSON response');
      }

      const providerId = data.recId ?? data.recID;
      if (providerId !== undefined && providerId !== null && String(providerId).trim()) {
        return this.ok(phone, String(providerId));
      }

      return this.fail(
        phone,
        data.status !== undefined && data.status !== null && String(data.status).trim()
          ? String(data.status)
          : 'Melli Payamak did not return a record id',
      );
    } catch (error) {
      return this.fail(phone, toErrorMessage(error));
    }
  }

  private async readResponse(response: Response): Promise<MelliPayamakSimpleResponse | undefined> {
    try {
      return (await response.json()) as MelliPayamakSimpleResponse;
    } catch {
      return undefined;
    }
  }

  private httpError(status: number, data?: MelliPayamakSimpleResponse): string {
    const providerMessage =
      data?.status !== undefined && data.status !== null ? String(data.status).trim() : '';
    return providerMessage
      ? `Melli Payamak HTTP ${status}: ${providerMessage}`
      : `Melli Payamak HTTP ${status}`;
  }

  private ok(target: string, providerId: string): SmsDeliveryResult {
    logDeliveryOutcome({
      provider: 'melipayamak-simple',
      target,
      ok: true,
      providerId,
    });
    return { ok: true, providerId };
  }

  private fail(target: string, error: string): SmsDeliveryResult {
    logDeliveryOutcome({ provider: 'melipayamak-simple', target, ok: false, error });
    return { ok: false, error };
  }
}
