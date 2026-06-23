import type { PaymentGateway } from './payment-gateway.interface';

/**
 * IDPay adapter implementing PaymentGateway.
 *
 * Uses the IDPay sandbox API by default. All amounts in integer Rial (R10.5).
 * The adapter calls the expected API endpoints; live credentials are not required
 * for development — configurable sandbox URLs are used.
 *
 * IDPay flow:
 * 1. POST /v1.1/payment → returns id (authority) + link (redirect URL)
 * 2. Redirect customer to link
 * 3. POST /v1.1/payment/verify → returns track_id (ref_id)
 * 4. POST /v1.1/payment/refund → refund (IDPay does not have a direct refund API;
 *    this is a stub for the expected flow)
 */
export class IdPayAdapter implements PaymentGateway {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly sandbox: boolean;

  constructor(options?: { apiKey?: string; baseUrl?: string; sandbox?: boolean }) {
    this.apiKey = options?.apiKey ?? 'test-api-key';
    this.baseUrl = options?.baseUrl ?? 'https://api.idpay.ir';
    this.sandbox = options?.sandbox ?? true;
  }

  async request(
    amountRial: number,
    callbackUrl: string,
    meta: { description?: string; email?: string; mobile?: string },
  ): Promise<{ authority: string; redirectUrl: string }> {
    const url = `${this.baseUrl}/v1.1/payment`;

    const body = {
      order_id: `order_${Date.now()}`,
      amount: amountRial,
      callback: callbackUrl,
      desc: meta.description ?? 'Salon booking deposit',
      mail: meta.email,
      phone: meta.mobile,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-KEY': this.apiKey,
    };

    if (this.sandbox) {
      headers['X-SANDBOX'] = '1';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`IDPay request failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      id?: string;
      link?: string;
      error_code?: number;
      error_message?: string;
    };

    if (!data.id || !data.link) {
      throw new Error(
        `IDPay request failed: ${data.error_message ?? JSON.stringify(data)}`,
      );
    }

    return { authority: data.id, redirectUrl: data.link };
  }

  async verify(authority: string, amountRial: number): Promise<{ ok: boolean; refId?: string }> {
    const url = `${this.baseUrl}/v1.1/payment/verify`;

    const body = {
      id: authority,
      order_id: `order_verify_${authority}`,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-KEY': this.apiKey,
    };

    if (this.sandbox) {
      headers['X-SANDBOX'] = '1';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return { ok: false };
    }

    const data = (await response.json()) as {
      status?: number;
      track_id?: string | number;
      amount?: number;
      error_code?: number;
    };

    // IDPay returns status 100 for already verified, 101 for newly verified
    if ((data.status === 100 || data.status === 101) && data.amount === amountRial) {
      return { ok: true, refId: String(data.track_id) };
    }

    return { ok: false };
  }

  async refund(refId: string, amountRial: number): Promise<{ ok: boolean }> {
    // IDPay does not provide a standard refund API endpoint in all plans.
    // This implementation calls the expected refund endpoint as a stub.
    const url = `${this.baseUrl}/v1.1/payment/refund`;

    const body = {
      id: refId,
      amount: amountRial,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-KEY': this.apiKey,
    };

    if (this.sandbox) {
      headers['X-SANDBOX'] = '1';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return { ok: false };
    }

    const data = (await response.json()) as {
      status?: number;
      error_code?: number;
    };

    if (data.status === 200) {
      return { ok: true };
    }

    return { ok: false };
  }
}
