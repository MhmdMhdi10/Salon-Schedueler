import { PusheAdapter } from './pushe.adapter';
import { NajvaAdapter } from './najva.adapter';
import type { PushPayload } from './push-provider.interface';

/**
 * Adapter-level tests for the real push provider adapters (Pushe, Najva).
 *
 * Validates: Requirements 5.2, 5.3, 5.4, 5.6
 *
 * `global.fetch` is mocked (same style as the payment gateway integration
 * tests). The tests assert request endpoint/payload/auth, success mapping to
 * `{ ok: true, providerId }`, and graceful failure (`{ ok: false, error }` with
 * no exception thrown) on HTTP errors, missing-id bodies, network throws, and
 * timeouts.
 */

const originalFetch = global.fetch;
let logSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

const payload: PushPayload = { title: 'یادآوری نوبت', body: 'نوبت شما نزدیک است' };

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

describe('PusheAdapter', () => {
  const adapter = new PusheAdapter({ apiKey: 'pushe-test-token', appId: 'app-42' });

  it('POSTs to the notifications endpoint with a Token auth header and device payload', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    mockFetch(async (url, init) => {
      seenUrl = url;
      seenInit = init;
      return jsonResponse({ id: 'notif-123' });
    });

    const result = await adapter.send('device-token-abc', payload);

    expect(seenUrl).toBe('https://api.pushe.co/v2/messaging/notifications/');
    expect(seenInit?.method).toBe('POST');
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Token pushe-test-token');
    expect(headers['Content-Type']).toBe('application/json');
    const sentBody = JSON.parse(seenInit?.body as string);
    expect(sentBody).toEqual({
      application: 'app-42',
      devices: ['device-token-abc'],
      notification: { title: payload.title, body: payload.body },
    });
    expect(result).toEqual({ ok: true, providerId: 'notif-123' });
  });

  it('returns a failure result on a non-2xx HTTP response (no throw)', async () => {
    mockFetch(async () => jsonResponse({}, 403));

    const result = await adapter.send('device-token-abc', payload);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('403');
    }
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns a failure result when the body carries no notification id (no throw)', async () => {
    mockFetch(async () => jsonResponse({ detail: 'invalid token' }));

    const result = await adapter.send('device-token-abc', payload);

    expect(result).toEqual({ ok: false, error: 'invalid token' });
  });

  it('returns a failure result when fetch rejects (network error, no throw)', async () => {
    mockFetch(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    });

    const result = await adapter.send('device-token-abc', payload);

    expect(result).toEqual({ ok: false, error: 'getaddrinfo ENOTFOUND' });
  });

  it('returns a failure result when the request times out (no throw)', async () => {
    const fastAdapter = new PusheAdapter({ apiKey: 'k', timeoutMs: 10 });
    mockHangingFetchAbortable();

    const result = await fastAdapter.send('device-token-abc', payload);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('request timed out');
    }
  });
});

describe('NajvaAdapter', () => {
  const adapter = new NajvaAdapter({ apiKey: 'najva-test-key' });

  it('POSTs to the notifications endpoint with a Bearer auth header and subscriber payload', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    mockFetch(async (url, init) => {
      seenUrl = url;
      seenInit = init;
      return jsonResponse({ id: 987 });
    });

    const result = await adapter.send('najva-token-xyz', payload);

    expect(seenUrl).toBe('https://api.najva.com/api/v1/notifications/');
    expect(seenInit?.method).toBe('POST');
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer najva-test-key');
    expect(headers['Content-Type']).toBe('application/json');
    const sentBody = JSON.parse(seenInit?.body as string);
    expect(sentBody).toEqual({
      subscribers: ['najva-token-xyz'],
      title: payload.title,
      body: payload.body,
    });
    expect(result).toEqual({ ok: true, providerId: '987' });
  });

  it('returns a failure result on a non-2xx HTTP response (no throw)', async () => {
    mockFetch(async () => jsonResponse({}, 500));

    const result = await adapter.send('najva-token-xyz', payload);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('500');
    }
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns a failure result when the body carries no notification id (no throw)', async () => {
    mockFetch(async () => jsonResponse({ message: 'subscriber not found' }));

    const result = await adapter.send('najva-token-xyz', payload);

    expect(result).toEqual({ ok: false, error: 'subscriber not found' });
  });

  it('returns a failure result when fetch rejects (network error, no throw)', async () => {
    mockFetch(async () => {
      throw new Error('network down');
    });

    const result = await adapter.send('najva-token-xyz', payload);

    expect(result).toEqual({ ok: false, error: 'network down' });
  });

  it('returns a failure result when the request times out (no throw)', async () => {
    const fastAdapter = new NajvaAdapter({ apiKey: 'k', timeoutMs: 10 });
    mockHangingFetchAbortable();

    const result = await fastAdapter.send('najva-token-xyz', payload);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('request timed out');
    }
  });
});
