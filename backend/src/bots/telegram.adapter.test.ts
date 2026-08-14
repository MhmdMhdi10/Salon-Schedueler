import { TelegramAdapter } from './telegram.adapter';

/**
 * Unit tests for the concrete `TelegramAdapter`.
 *
 * Validates: Requirements 1.1, 1.7, 1.8
 *
 * The send/parse behavior is covered exhaustively by `bot-adapter.base.test.ts`;
 * here we only assert the Telegram-specific wiring the concrete adapter
 * supplies: its `platform` id, the public Telegram Bot-API base URL used to
 * build the send endpoint, token-derived `enabled`, and graceful disable (no
 * network call) when no token is configured.
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

describe('TelegramAdapter', () => {
  it('reports the telegram platform', () => {
    expect(new TelegramAdapter().platform).toBe('telegram');
  });

  it('derives enabled from token presence (Requirement 1.8)', () => {
    expect(new TelegramAdapter().enabled).toBe(false);
    expect(new TelegramAdapter({ token: '' }).enabled).toBe(false);
    expect(new TelegramAdapter({ token: 'TKN' }).enabled).toBe(true);
  });

  it('posts to the public Telegram Bot-API endpoint when enabled', async () => {
    let capturedUrl = '';
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      capturedUrl = url;
      return jsonResponse({ ok: true });
    });

    const adapter = new TelegramAdapter({ token: 'TKN' });
    const result = await adapter.send({ chatId: '12345', text: 'سلام' });

    expect(result).toEqual({ ok: true });
    expect(capturedUrl).toBe('https://api.telegram.org/botTKN/sendMessage');
  });

  it('gracefully disables (no network call) when no token is configured', async () => {
    const adapter = new TelegramAdapter();
    const result = await adapter.send({ chatId: '1', text: 'hi' });

    expect(result.ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
