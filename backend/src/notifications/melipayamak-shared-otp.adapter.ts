import * as crypto from 'crypto';
import type { OtpDeliveryResult, OtpProvider } from '../auth/otp-provider.interface';
import type {
  SmsDeliveryResult,
  SmsTemplateProvider,
} from '../auth/sms-provider.interface';
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  fetchWithTimeout,
  logDeliveryOutcome,
  toErrorMessage,
} from './provider-http';
import { MELLI_PAYAMAK_TEMPLATE_BODY_IDS } from './melipayamak-template-body-ids';

const DEFAULT_BODY_ID = MELLI_PAYAMAK_TEMPLATE_BODY_IDS.otp;

/** Configuration for Melli Payamak's shared-template endpoint. */
export interface MelliPayamakSharedOtpConfig {
  /** Full `/api/send/shared/<token>` URL, normally supplied by MELIPAYAMAK_URL. */
  endpointUrl?: string;
  /** Shared OTP template id. Defaults to the approved Ara OTP template. */
  bodyId?: number;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

interface MelliPayamakResponse {
  recId?: string | number;
  recID?: string | number;
  messageId?: string | number;
  messageID?: string | number;
  status?: string | null;
  title?: string;
}

/**
 * Sends Ara OTPs and fixed notification messages through Melli Payamak shared
 * templates. Request shape mirrors send_melipayamak.py:
 * `{ bodyId, to, args: [value0, value1, ...] }`.
 */
export class MelliPayamakSharedOtpAdapter implements OtpProvider, SmsTemplateProvider {
  private readonly endpointUrl: string;
  private readonly bodyId: number;
  private readonly timeoutMs: number;

  constructor(config: MelliPayamakSharedOtpConfig = {}) {
    this.endpointUrl = config.endpointUrl?.trim() ?? '';
    const bodyId = config.bodyId ?? DEFAULT_BODY_ID;
    this.bodyId = Number.isInteger(bodyId) && bodyId > 0 ? bodyId : DEFAULT_BODY_ID;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  async sendOtp(phone: string, requestedCode?: string): Promise<OtpDeliveryResult> {
    const code = requestedCode?.trim() || this.generateOtpCode();
    if (!/^\d{4,10}$/.test(code)) {
      return this.fail(phone, 'OTP code must contain 4 to 10 digits');
    }

    const delivery = await this.sendTemplate(phone, this.bodyId, [code]);
    if (!delivery.ok) {
      return delivery;
    }

    return { ok: true, providerId: delivery.providerId, code };
  }

  async sendTemplate(
    phone: string,
    bodyId: number,
    args: string[],
  ): Promise<SmsDeliveryResult> {
    if (!this.endpointUrl) {
      return this.fail(phone, 'Melli Payamak shared endpoint is not configured');
    }

    if (!Number.isInteger(bodyId) || bodyId <= 0) {
      return this.fail(phone, 'Melli Payamak template bodyId must be a positive integer');
    }

    if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
      return this.fail(phone, 'Melli Payamak template args must be strings');
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
          body: JSON.stringify({
            bodyId,
            to: phone,
            args,
          }),
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

      const providerId = data?.recId ?? data?.recID ?? data?.messageId ?? data?.messageID;
      if (providerId !== undefined && providerId !== null) {
        return this.ok(phone, String(providerId));
      }

      const providerStatus = typeof data.status === 'string' ? data.status.trim() : '';
      if (providerStatus) {
        return this.fail(phone, providerStatus);
      }

      return this.ok(phone, 'melipayamak-shared');
    } catch (err) {
      return this.fail(phone, toErrorMessage(err));
    }
  }

  private generateOtpCode(): string {
    return (crypto.randomBytes(4).readUInt32BE(0) % 1_000_000).toString().padStart(6, '0');
  }

  private async readResponse(response: Response): Promise<MelliPayamakResponse | undefined> {
    try {
      return (await response.json()) as MelliPayamakResponse;
    } catch {
      return undefined;
    }
  }

  private httpError(status: number, data?: MelliPayamakResponse): string {
    const providerMessage =
      (typeof data?.status === 'string' ? data.status.trim() : '') ||
      (typeof data?.title === 'string' ? data.title.trim() : '');
    return providerMessage
      ? `Melli Payamak HTTP ${status}: ${providerMessage}`
      : `Melli Payamak HTTP ${status}`;
  }

  private ok(target: string, providerId: string): SmsDeliveryResult {
    // Never log template args (which may contain the OTP). Only provider id is logged.
    logDeliveryOutcome({
      provider: 'melipayamak-shared',
      target,
      ok: true,
      providerId,
    });
    return { ok: true, providerId };
  }

  private fail(target: string, error: string): { ok: false; error: string } {
    logDeliveryOutcome({ provider: 'melipayamak-shared', target, ok: false, error });
    return { ok: false, error };
  }
}
