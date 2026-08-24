import type { OtpDeliveryResult, OtpProvider } from '../auth/otp-provider.interface';
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  fetchWithTimeout,
  logDeliveryOutcome,
  toErrorMessage,
} from './provider-http';

/** Configuration for the Melli Payamak OTP endpoint. */
export interface MelliPayamakOtpConfig {
  /** Full endpoint URL, including the account-specific path token. */
  endpointUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to ~10s. */
  timeoutMs?: number;
}

/**
 * Melli Payamak's generated-code OTP API.
 *
 * The endpoint accepts only `{ to }` and returns the code it sent. It must not
 * be used as the generic SMS provider because appointment notifications need a
 * message body; AuthService consumes this provider only for login OTPs.
 */
export class MelliPayamakOtpAdapter implements OtpProvider {
  private readonly endpointUrl: string;
  private readonly timeoutMs: number;

  constructor(config: MelliPayamakOtpConfig = {}) {
    this.endpointUrl = config.endpointUrl?.trim() ?? '';
    this.timeoutMs = config.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  async sendOtp(phone: string): Promise<OtpDeliveryResult> {
    if (!this.endpointUrl) {
      return this.fail(phone, 'Melli Payamak OTP endpoint is not configured');
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
          body: JSON.stringify({ to: phone }),
        },
        this.timeoutMs,
      );

      if (!response.ok) {
        return this.fail(phone, `Melli Payamak HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        code?: string | number;
        status?: string;
      };
      const code = data.code === undefined || data.code === null ? '' : String(data.code).trim();

      if (!/^\d{4,10}$/.test(code)) {
        return this.fail(phone, data.status || 'Melli Payamak returned an invalid OTP code');
      }

      return this.ok(phone, code);
    } catch (err) {
      return this.fail(phone, toErrorMessage(err));
    }
  }

  private ok(target: string, code: string): OtpDeliveryResult {
    // Never log the generated OTP. The provider id is intentionally static.
    logDeliveryOutcome({
      provider: 'melipayamak-otp',
      target,
      ok: true,
      providerId: 'melipayamak-otp',
    });
    return { ok: true, providerId: 'melipayamak-otp', code };
  }

  private fail(target: string, error: string): OtpDeliveryResult {
    logDeliveryOutcome({ provider: 'melipayamak-otp', target, ok: false, error });
    return { ok: false, error };
  }
}
