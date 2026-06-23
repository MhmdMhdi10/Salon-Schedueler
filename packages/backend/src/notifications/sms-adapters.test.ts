import { KavenegarSmsAdapter } from './kavenegar.adapter';
import { SmsIrAdapter } from './smsir.adapter';

/**
 * Adapter-level tests for the real SMS provider adapters (Kavenegar, SMS.ir).
 *
 * Validates: Requirements 5.1, 5.3, 5.4, 5.6
 *
 * We cannot reach the live provider APIs in automated tests, so `global.fetch`
 * is mocked (the same style as `payment/gateway-adapters.integration.test.ts`).
 * The tests assert the request endpoint/payload/auth, success mapping to
 * `{ ok: true, providerId }`, and graceful failure (`{ ok: false, error }` with
 * no exception thrown) on HTTP errors, provider-error bodies, network throws,
 * and timeouts.
 */

const originalFetch = global.fetch;
let logSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  global.fetch = jest.fn();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = originalFetch;
  logSpy.mockRestore();
  errorSpy.mockRestore();
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

/**
 * A fetch implementation that never resolves until its request is aborted, at
 * which point it rejects with an AbortError — letting us exercise the adapter's
 * timeout path with a small configured timeout.
 */
function mockHangingFetchAbortable() {
  mockFetch((_url, init) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      const fail = () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      };
      if (signal?.aborted) {
        fail();
        return;
      }
      signal?.addEventListener('abort', fail);
    });
  });
}

describe('KavenegarSmsAdapter', () => {
  const adapter = new KavenegarSmsAdapter({
    apiKey: 'kav-test-key',
    sender: '10004346',
  });

  it('POSTs to the send.json endpoint with the api key in the path and the message in the body', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    mockFetch(async (url, init) => {
      seenUrl = url;
      seenInit = init;
      return jsonResponse({
        return: { status: 200, message: 'OK' },
        entries: [{ messageid: 8792343, statustext: 'sent' }],
      });
    });

    const result = await adapter.send('09121234567', 'سلام');

    expect(seenUrl).toBe('https://api.kavenegar.com/v1/kav-test-key/sms/send.json');
    expect(seenInit?.method).toBe('POST');
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(seenInit?.body as string);
    expect(params.get('receptor')).toBe('09121234567');
    expect(params.get('message')).toBe('سلام');
    expect(params.get('sender')).toBe('10004346');
    expect(result).toEqual({ ok: true, providerId: '8792343' });
  });

  it('maps a provider-error body (HTTP 200, status !== 200) to a failure result without throwing', async () => {
    mockFetch(async () =>
      jsonResponse({ return: { status: 411, message: 'invalid receptor' }, entries: null }),
    );

    const result = await adapter.send('bad', 'hi');

    expect(result).toEqual({ ok: false, error: 'invalid receptor' });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns a failure result on a non-2xx HTTP response (no throw)', async () => {
    mockFetch(async () => jsonResponse({}, 500));

    const result = await adapter.send('09121234567', 'hi');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('500');
    }
  });

  it('returns a failure result when fetch rejects (network error, no throw)', async () => {
    mockFetch(async () => {
      throw new Error('ECONNREFUSED');
    });

    const result = await adapter.send('09121234567', 'hi');

    expect(result).toEqual({ ok: false, error: 'ECONNREFUSED' });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns a failure result when the request times out (no throw)', async () => {
    const fastAdapter = new KavenegarSmsAdapter({ apiKey: 'k', timeoutMs: 10 });
    mockHangingFetchAbortable();

    const result = await fastAdapter.send('09121234567', 'hi');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('request timed out');
    }
  });
});

describe('SmsIrAdapter', () => {
  const adapter = new SmsIrAdapter({
    apiKey: 'smsir-test-key',
    lineNumber: '30007',
  });

  it('POSTs to /v1/send/bulk with the x-api-key header and a JSON payload', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    mockFetch(async (url, init) => {
      seenUrl = url;
      seenInit = init;
      return jsonResponse({ status: 1, message: 'موفق', data: { messageIds: [1234567], cost: 1 } });
    });

    const result = await adapter.send('09120000000', 'your code');

    expect(seenUrl).toBe('https://api.sms.ir/v1/send/bulk');
    expect(seenInit?.method).toBe('POST');
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('smsir-test-key');
    expect(headers['Content-Type']).toBe('application/json');
    const sentBody = JSON.parse(seenInit?.body as string);
    expect(sentBody).toEqual({
      lineNumber: '30007',
      messageText: 'your code',
      mobiles: ['09120000000'],
    });
    expect(result).toEqual({ ok: true, providerId: '1234567' });
  });

  it('maps a provider-error body (status !== 1) to a failure result without throwing', async () => {
    mockFetch(async () => jsonResponse({ status: 0, message: 'invalid api key' }));

    const result = await adapter.send('09120000000', 'hi');

    expect(result).toEqual({ ok: false, error: 'invalid api key' });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns a failure result on a non-2xx HTTP response (no throw)', async () => {
    mockFetch(async () => jsonResponse({}, 401));

    const result = await adapter.send('09120000000', 'hi');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('401');
    }
  });

  it('returns a failure result when fetch rejects (network error, no throw)', async () => {
    mockFetch(async () => {
      throw new Error('socket hang up');
    });

    const result = await adapter.send('09120000000', 'hi');

    expect(result).toEqual({ ok: false, error: 'socket hang up' });
  });

  it('returns a failure result when the request times out (no throw)', async () => {
    const fastAdapter = new SmsIrAdapter({ apiKey: 'k', lineNumber: '1', timeoutMs: 10 });
    mockHangingFetchAbortable();

    const result = await fastAdapter.send('09120000000', 'hi');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('request timed out');
    }
  });
});
