import { BaleAdapter } from './bale.adapter';

/**
 * Unit tests for the concrete `BaleAdapter`.
 *
 * Validates: Requirements 1.1, 1.7, 1.8
 *
 * Bale is API-compatible with Telegram, so the shared send/parse logic is
 * covered by `bot-adapter.base.test.ts`. Here we assert only the Bale-specific
 * wiring: its `platform` id, the public Bale Bot-API base URL
 * (`https://tapi.bale.ai`) used to build the send endpoint, token-derived
 * `enabled`, and graceful disable (no network call) when no token is set.
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

describe('BaleAdapter', () => {
  it('reports the bale platform', () => {
    expect(new BaleAdapter().platform).toBe('bale');
  });

  it('derives enabled from token presence (Requirement 1.8)', () => {
    expect(new BaleAdapter().enabled).toBe(false);
    expect(new BaleAdapter({ token: '' }).enabled).toBe(false);
    expect(new BaleAdapter({ token: 'TKN' }).enabled).toBe(true);
  });

  it('posts to the public Bale Bot-API endpoint when enabled', async () => {
    let capturedUrl = '';
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      capturedUrl = url;
      return jsonResponse({ ok: true });
    });

    const adapter = new BaleAdapter({ token: 'TKN' });
    const result = await adapter.send({ chatId: '12345', text: 'سلام' });

    expect(result).toEqual({ ok: true });
    expect(capturedUrl).toBe('https://tapi.bale.ai/botTKN/sendMessage');
  });

  it('gracefully disables (no network call) when no token is configured', async () => {
    const adapter = new BaleAdapter();
    const result = await adapter.send({ chatId: '1', text: 'hi' });

    expect(result.ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
