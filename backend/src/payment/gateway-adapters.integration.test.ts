import { ZarinpalAdapter } from './zarinpal.adapter';
import { IdPayAdapter } from './idpay.adapter';
import { ZibalAdapter } from './zibal.adapter';

/**
 * Integration tests for payment gateway adapters using recorded HTTP fixtures.
 * Validates: Requirements 10.2, 10.3
 *
 * Since we cannot connect to live sandbox APIs in automated tests, we mock
 * the global `fetch` to simulate recorded gateway responses. The tests verify
 * correct request payloads, response handling, and the invariant that
 * request MUST precede verify/refund in every flow.
 */

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  (global.fetch as jest.Mock).mockImplementation(impl);
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: new Headers(),
    redirected: false,
    statusText: 'OK',
    type: 'basic',
    url: '',
    clone: () => jsonResponse(body, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob([]),
    formData: async () => new FormData(),
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('ZarinpalAdapter integration', () => {
  const adapter = new ZarinpalAdapter({
    merchantId: 'test-merchant-123',
    baseUrl: 'https://sandbox.zarinpal.com',
  });

  describe('request → verify flow', () => {
    it('should complete a full request then verify cycle with correct payloads', async () => {
      const callOrder: string[] = [];

      mockFetch(async (url: string, init?: RequestInit) => {
        if (url.includes('/pg/v4/payment/request.json')) {
          callOrder.push('request');
          const body = JSON.parse(init?.body as string);
          // Assert request payload
          expect(body.merchant_id).toBe('test-merchant-123');
          expect(body.amount).toBe(500000);
          expect(body.callback_url).toBe('https://salon.app/callback');
          return jsonResponse({
            data: { authority: 'A00000000000000000000000000123456', code: 100 },
          });
        }
        if (url.includes('/pg/v4/payment/verify.json')) {
          callOrder.push('verify');
          const body = JSON.parse(init?.body as string);
          // Assert verify payload
          expect(body.merchant_id).toBe('test-merchant-123');
          expect(body.authority).toBe('A00000000000000000000000000123456');
          expect(body.amount).toBe(500000);
          return jsonResponse({
            data: { code: 100, ref_id: 98765 },
          });
        }
        return jsonResponse({}, 404);
      });

      // Step 1: Request
      const requestResult = await adapter.request(500000, 'https://salon.app/callback', {
        description: 'Haircut deposit',
      });
      expect(requestResult.authority).toBe('A00000000000000000000000000123456');
      expect(requestResult.redirectUrl).toContain('A00000000000000000000000000123456');

      // Step 2: Verify (must come after request)
      const verifyResult = await adapter.verify('A00000000000000000000000000123456', 500000);
      expect(verifyResult.ok).toBe(true);
      expect(verifyResult.refId).toBe('98765');

      // Assert flow order: request MUST precede verify
      expect(callOrder).toEqual(['request', 'verify']);
    });

    it('should pass correct amount and callback URL in request', async () => {
      mockFetch(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string);
        expect(body.amount).toBe(1000000);
        expect(body.callback_url).toBe('https://mysalon.ir/pay/callback');
        expect(body.merchant_id).toBe('test-merchant-123');
        return jsonResponse({
          data: { authority: 'AUTH_TOKEN_ABC', code: 100 },
        });
      });

      const result = await adapter.request(1000000, 'https://mysalon.ir/pay/callback', {});
      expect(result.authority).toBe('AUTH_TOKEN_ABC');
    });
  });

  describe('refund flow', () => {
    it('should call refund endpoint with merchant_id, authority/refId, and amount', async () => {
      mockFetch(async (url: string, init?: RequestInit) => {
        expect(url).toContain('/pg/v4/payment/refund.json');
        const body = JSON.parse(init?.body as string);
        expect(body.merchant_id).toBe('test-merchant-123');
        expect(body.authority).toBe('REF_12345');
        expect(body.amount).toBe(250000);
        return jsonResponse({ data: { code: 100 } });
      });

      const result = await adapter.refund('REF_12345', 250000);
      expect(result.ok).toBe(true);
    });

    it('should return ok=false when refund fails', async () => {
      mockFetch(async () => {
        return jsonResponse({ data: { code: -51 } });
      });

      const result = await adapter.refund('REF_99999', 100000);
      expect(result.ok).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should throw on HTTP error during request', async () => {
      mockFetch(async () => jsonResponse({}, 500));

      await expect(
        adapter.request(100000, 'https://salon.app/cb', {}),
      ).rejects.toThrow('Zarinpal request failed: HTTP 500');
    });

    it('should return ok=false on HTTP error during verify', async () => {
      mockFetch(async () => jsonResponse({}, 503));

      const result = await adapter.verify('SOME_AUTH', 100000);
      expect(result.ok).toBe(false);
    });

    it('should return ok=false when verify returns non-100 code', async () => {
      mockFetch(async () => {
        return jsonResponse({ data: { code: -51, ref_id: null } });
      });

      const result = await adapter.verify('BAD_AUTH', 100000);
      expect(result.ok).toBe(false);
    });

    it('should throw when request returns no authority', async () => {
      mockFetch(async () => {
        return jsonResponse({ data: { code: -11 }, errors: { code: -11, message: 'Invalid merchant' } });
      });

      await expect(
        adapter.request(100000, 'https://salon.app/cb', {}),
      ).rejects.toThrow();
    });
  });
});

describe('IdPayAdapter integration', () => {
  const adapter = new IdPayAdapter({
    apiKey: 'test-idpay-key-xyz',
    baseUrl: 'https://api.idpay.ir',
    sandbox: true,
  });

  describe('request → verify flow', () => {
    it('should complete a full request then verify cycle with correct payloads', async () => {
      const callOrder: string[] = [];

      mockFetch(async (url: string, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string>;

        if (url.includes('/v1.1/payment') && !url.includes('/verify')) {
          callOrder.push('request');
          const body = JSON.parse(init?.body as string);
          // Assert request payload
          expect(body.amount).toBe(750000);
          expect(body.callback).toBe('https://salon.app/idpay/callback');
          // Assert API key header
          expect(headers['X-API-KEY']).toBe('test-idpay-key-xyz');
          expect(headers['X-SANDBOX']).toBe('1');
          return jsonResponse({
            id: 'idpay-tx-id-001',
            link: 'https://idpay.ir/p/ws-sandbox/idpay-tx-id-001',
          });
        }
        if (url.includes('/v1.1/payment/verify')) {
          callOrder.push('verify');
          const body = JSON.parse(init?.body as string);
          // Assert verify payload contains id
          expect(body.id).toBe('idpay-tx-id-001');
          expect(headers['X-API-KEY']).toBe('test-idpay-key-xyz');
          return jsonResponse({
            status: 101,
            track_id: 'TRACK_ABC_123',
            amount: 750000,
          });
        }
        return jsonResponse({}, 404);
      });

      // Step 1: Request
      const requestResult = await adapter.request(750000, 'https://salon.app/idpay/callback', {
        description: 'Color service deposit',
      });
      expect(requestResult.authority).toBe('idpay-tx-id-001');
      expect(requestResult.redirectUrl).toBe('https://idpay.ir/p/ws-sandbox/idpay-tx-id-001');

      // Step 2: Verify (must come after request)
      const verifyResult = await adapter.verify('idpay-tx-id-001', 750000);
      expect(verifyResult.ok).toBe(true);
      expect(verifyResult.refId).toBe('TRACK_ABC_123');

      // Assert flow order: request MUST precede verify
      expect(callOrder).toEqual(['request', 'verify']);
    });

    it('should pass correct API key and sandbox headers', async () => {
      mockFetch(async (_url: string, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers['X-API-KEY']).toBe('test-idpay-key-xyz');
        expect(headers['X-SANDBOX']).toBe('1');
        expect(headers['Content-Type']).toBe('application/json');
        return jsonResponse({ id: 'tx-999', link: 'https://idpay.ir/p/tx-999' });
      });

      const result = await adapter.request(300000, 'https://cb.app/pay', {});
      expect(result.authority).toBe('tx-999');
    });
  });

  describe('error handling', () => {
    it('should throw on HTTP error during request', async () => {
      mockFetch(async () => jsonResponse({}, 403));

      await expect(
        adapter.request(100000, 'https://salon.app/cb', {}),
      ).rejects.toThrow('IDPay request failed: HTTP 403');
    });

    it('should return ok=false on HTTP error during verify', async () => {
      mockFetch(async () => jsonResponse({}, 500));

      const result = await adapter.verify('some-id', 100000);
      expect(result.ok).toBe(false);
    });

    it('should return ok=false when verify amount does not match', async () => {
      mockFetch(async () => {
        return jsonResponse({
          status: 101,
          track_id: 'TRACK_X',
          amount: 50000, // Different from requested amount
        });
      });

      // Request verify with 100000 but response has amount 50000
      const result = await adapter.verify('some-id', 100000);
      expect(result.ok).toBe(false);
    });

    it('should return ok=false when verify returns non-success status', async () => {
      mockFetch(async () => {
        return jsonResponse({ status: 0, track_id: null, amount: 100000 });
      });

      const result = await adapter.verify('bad-id', 100000);
      expect(result.ok).toBe(false);
    });

    it('should throw when request returns no id or link', async () => {
      mockFetch(async () => {
        return jsonResponse({
          error_code: 32,
          error_message: 'Amount is less than minimum',
        });
      });

      await expect(
        adapter.request(100, 'https://salon.app/cb', {}),
      ).rejects.toThrow('IDPay request failed');
    });
  });
});

describe('ZibalAdapter integration', () => {
  const adapter = new ZibalAdapter({
    merchant: 'test-zibal-merchant',
    baseUrl: 'https://gateway.zibal.ir',
  });

  it('uses Zibal request and verify endpoints with Rial amounts', async () => {
    const callOrder: string[] = [];

    mockFetch(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      if (url.endsWith('/v1/request')) {
        callOrder.push('request');
        expect(body).toEqual({
          merchant: 'test-zibal-merchant',
          amount: 250000,
          callbackUrl: 'https://salon.app/api/payments/callback',
          description: 'Haircut deposit',
          orderId: 'appt-1',
        });
        return jsonResponse({ trackId: 15966442233311, result: 100, message: 'success' });
      }
      if (url.endsWith('/v1/verify')) {
        callOrder.push('verify');
        expect(body).toEqual({ merchant: 'test-zibal-merchant', trackId: 15966442233311 });
        return jsonResponse({ result: 100, amount: 250000, refNumber: 98765 });
      }
      return jsonResponse({}, 404);
    });

    const requestResult = await adapter.request(250000, 'https://salon.app/api/payments/callback', {
      description: 'Haircut deposit',
      orderId: 'appt-1',
    });
    expect(requestResult).toEqual({
      authority: '15966442233311',
      redirectUrl: 'https://gateway.zibal.ir/start/15966442233311',
    });

    await expect(adapter.verify(requestResult.authority, 250000)).resolves.toEqual({
      ok: true,
      refId: '98765',
    });
    expect(callOrder).toEqual(['request', 'verify']);
  });

  it('rejects failed or amount-mismatched verification', async () => {
    mockFetch(async (url: string) => {
      if (url.endsWith('/v1/verify')) {
        return jsonResponse({ result: 100, amount: 100000, refNumber: 1 });
      }
      return jsonResponse({ result: 202, message: 'not paid' });
    });

    await expect(adapter.verify('15966442233311', 250000)).resolves.toEqual({ ok: false });
    await expect(adapter.verify('not-a-track-id', 250000)).resolves.toEqual({ ok: false });
  });

  it('fails request when Zibal returns a non-success result', async () => {
    mockFetch(async () => jsonResponse({ result: 103, message: 'merchant disabled' }));

    await expect(
      adapter.request(250000, 'https://salon.app/api/payments/callback', {}),
    ).rejects.toThrow('Zibal request failed: 103: merchant disabled');
  });

  it('fails closed for refunds because the documented IPG API has no refund endpoint', async () => {
    await expect(adapter.refund('98765', 250000)).resolves.toEqual({ ok: false });
  });
});
