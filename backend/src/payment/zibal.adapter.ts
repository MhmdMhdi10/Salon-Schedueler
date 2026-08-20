import type { PaymentGateway } from './payment-gateway.interface';

const DEFAULT_BASE_URL = 'https://gateway.zibal.ir';

interface ZibalResponse {
  trackId?: number | string;
  result?: number;
  message?: string;
  amount?: number | string;
  refNumber?: number | string;
}

function normalizeTrackId(value: unknown): string {
  const trackId = typeof value === 'number' ? String(value) : value;
  if (typeof trackId !== 'string' || !/^\d+$/.test(trackId)) {
    throw new Error('Zibal response did not contain a valid trackId');
  }

  const numericTrackId = Number(trackId);
  if (!Number.isSafeInteger(numericTrackId) || numericTrackId <= 0) {
    throw new Error('Zibal response contained an unsafe trackId');
  }

  return trackId;
}

function trackIdNumber(authority: string): number | undefined {
  if (!/^\d+$/.test(authority)) return undefined;
  const value = Number(authority);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function failureMessage(operation: string, data: ZibalResponse): string {
  const detail = [data.result, data.message].filter((value) => value !== undefined).join(': ');
  return `Zibal ${operation} failed${detail ? `: ${detail}` : ''}`;
}

/**
 * Zibal IPG adapter.
 *
 * Zibal's documented flow is request → `/start/{trackId}` → verify. Amounts
 * are integer Rial. The public IPG specification does not expose a refund
 * endpoint, so refund requests fail closed and require manual handling.
 */
export class ZibalAdapter implements PaymentGateway {
  private readonly merchant: string;
  private readonly baseUrl: string;

  constructor(options?: { merchant?: string; baseUrl?: string }) {
    this.merchant = options?.merchant ?? 'zibal';
    this.baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  async request(
    amountRial: number,
    callbackUrl: string,
    meta: { description?: string; email?: string; mobile?: string; orderId?: string },
  ): Promise<{ authority: string; redirectUrl: string }> {
    if (!Number.isSafeInteger(amountRial) || amountRial <= 1000) {
      throw new Error(
        'Zibal request failed: amount must be an integer Rial value greater than 1000',
      );
    }

    const body = {
      merchant: this.merchant,
      amount: amountRial,
      callbackUrl,
      ...(meta.description ? { description: meta.description } : {}),
      ...(meta.orderId ? { orderId: meta.orderId } : {}),
      ...(meta.mobile ? { mobile: meta.mobile } : {}),
    };

    const response = await fetch(`${this.baseUrl}/v1/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as ZibalResponse;

    if (!response.ok || data.result !== 100 || data.trackId === undefined) {
      throw new Error(failureMessage('request', data));
    }

    const authority = normalizeTrackId(data.trackId);
    return {
      authority,
      redirectUrl: `${this.baseUrl}/start/${authority}`,
    };
  }

  async verify(authority: string, amountRial: number): Promise<{ ok: boolean; refId?: string }> {
    const trackId = trackIdNumber(authority);
    if (trackId === undefined) return { ok: false };

    const response = await fetch(`${this.baseUrl}/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: this.merchant, trackId }),
    });

    if (!response.ok) return { ok: false };

    const data = (await response.json()) as ZibalResponse;
    const resultOk = data.result === 100 || data.result === 201;
    const amountMatches = data.amount === undefined || Number(data.amount) === amountRial;
    if (!resultOk || !amountMatches) return { ok: false };

    return {
      ok: true,
      refId: data.refNumber === undefined ? authority : String(data.refNumber),
    };
  }

  async refund(_refId: string, _amountRial: number): Promise<{ ok: boolean }> {
    return { ok: false };
  }
}
