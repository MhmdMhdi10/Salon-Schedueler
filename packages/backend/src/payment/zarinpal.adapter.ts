import type { PaymentGateway } from './payment-gateway.interface';

/**
 * Zarinpal adapter implementing PaymentGateway.
 *
 * Uses the Zarinpal sandbox API by default. All amounts in integer Rial (R10.5).
 * The adapter calls the expected API endpoints; live credentials are not required
 * for development — configurable sandbox URLs are used.
 *
 * Zarinpal flow:
 * 1. POST /pg/v4/payment/request.json → returns authority
 * 2. Redirect customer to payment page with authority
 * 3. POST /pg/v4/payment/verify.json → returns ref_id
 * 4. POST /pg/v4/payment/refund.json → refund
 */
export class ZarinpalAdapter implements PaymentGateway {
  private readonly merchantId: string;
  private readonly baseUrl: string;
  private readonly paymentPageUrl: string;

  constructor(options?: { merchantId?: string; baseUrl?: string; paymentPageUrl?: string }) {
    this.merchantId = options?.merchantId ?? 'test-merchant-id';
    this.baseUrl = options?.baseUrl ?? 'https://sandbox.zarinpal.com';
    this.paymentPageUrl = options?.paymentPageUrl ?? 'https://sandbox.zarinpal.com/pg/StartPay';
  }

  async request(
    amountRial: number,
    callbackUrl: string,
    meta: { description?: string; email?: string; mobile?: string },
  ): Promise<{ authority: string; redirectUrl: string }> {
    const url = `${this.baseUrl}/pg/v4/payment/request.json`;

    const body = {
      merchant_id: this.merchantId,
      amount: amountRial,
      callback_url: callbackUrl,
      description: meta.description ?? 'Salon booking deposit',
      metadata: {
        email: meta.email,
        mobile: meta.mobile,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Zarinpal request failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      data?: { authority?: string; code?: number };
      errors?: any;
    };

    if (!data.data?.authority) {
      throw new Error(`Zarinpal request failed: ${JSON.stringify(data.errors ?? data)}`);
    }

    const authority = data.data.authority;
    const redirectUrl = `${this.paymentPageUrl}/${authority}`;

    return { authority, redirectUrl };
  }

  async verify(authority: string, amountRial: number): Promise<{ ok: boolean; refId?: string }> {
    const url = `${this.baseUrl}/pg/v4/payment/verify.json`;

    const body = {
      merchant_id: this.merchantId,
      amount: amountRial,
      authority,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return { ok: false };
    }

    const data = (await response.json()) as {
      data?: { code?: number; ref_id?: number | string };
      errors?: any;
    };

    // Zarinpal returns code 100 or 101 for success
    if (data.data?.code === 100 || data.data?.code === 101) {
      return { ok: true, refId: String(data.data.ref_id) };
    }

    return { ok: false };
  }

  async refund(refId: string, amountRial: number): Promise<{ ok: boolean }> {
    const url = `${this.baseUrl}/pg/v4/payment/refund.json`;

    const body = {
      merchant_id: this.merchantId,
      authority: refId,
      amount: amountRial,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return { ok: false };
    }

    const data = (await response.json()) as {
      data?: { code?: number };
      errors?: any;
    };

    if (data.data?.code === 100) {
      return { ok: true };
    }

    return { ok: false };
  }
}
