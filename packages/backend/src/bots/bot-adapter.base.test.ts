import { BotAdapterBase, type BotAdapterConfig } from './bot-adapter.base';
import type { BotPlatform } from './bot-adapter.interface';

/**
 * Unit tests for the shared `BotAdapterBase`.
 *
 * Validates: Requirements 1.1, 1.7, 1.8
 *
 * The base holds the send/parse logic shared by Telegram and Bale; concrete
 * adapters (task 2.2) only supply `platform`/`defaultBaseUrl`. We exercise the
 * base through a minimal test subclass and a mocked `global.fetch` (same style
 * as `notifications/sms-adapters.test.ts`), asserting: the request
 * endpoint/payload, success/failure mapping that never throws, graceful disable
 * when no token is configured, and webhook update normalization.
 */

class TestBotAdapter extends BotAdapterBase {
  readonly platform: BotPlatform = 'telegram';
  protected readonly defaultBaseUrl = 'https://api.example.test';

  constructor(config: BotAdapterConfig = {}) {
    super(config);
  }
}

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

describe('BotAdapterBase.enabled', () => {
  it('is false when no token is configured (graceful disable)', () => {
    expect(new TestBotAdapter().enabled).toBe(false);
    expect(new TestBotAdapter({ token: '' }).enabled).toBe(false);
  });

  it('is true when a token is present', () => {
    expect(new TestBotAdapter({ token: 'abc' }).enabled).toBe(true);
  });
});

describe('BotAdapterBase.send', () => {
  it('posts to /bot{token}/sendMessage with chat_id and text', async () => {
    let capturedUrl = '';
    let capturedBody: unknown;
    mockFetch(async (url, init) => {
      capturedUrl = url;
      capturedBody = JSON.parse(String(init?.body));
      return jsonResponse({ ok: true });
    });

    const adapter = new TestBotAdapter({ token: 'TKN', baseUrl: 'https://api.example.test' });
    const result = await adapter.send({ chatId: '12345', text: 'سلام' });

    expect(result).toEqual({ ok: true });
    expect(capturedUrl).toBe('https://api.example.test/botTKN/sendMessage');
    expect(capturedBody).toEqual({ chat_id: '12345', text: 'سلام' });
  });

  it('maps inline buttons into reply_markup.inline_keyboard', async () => {
    let capturedBody: { reply_markup?: { inline_keyboard?: unknown } } = {};
    mockFetch(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return jsonResponse({ ok: true });
    });

    const adapter = new TestBotAdapter({ token: 'TKN' });
    await adapter.send({
      chatId: '1',
      text: 'انتخاب خدمت',
      buttons: [
        { label: 'اصلاح مو', data: 'svc:1' },
        { label: 'رنگ', data: 'svc:2' },
      ],
    });

    expect(capturedBody.reply_markup).toEqual({
      inline_keyboard: [
        [{ text: 'اصلاح مو', callback_data: 'svc:1' }],
        [{ text: 'رنگ', callback_data: 'svc:2' }],
      ],
    });
  });

  it('returns a failure (no network call) when the adapter is disabled', async () => {
    const adapter = new TestBotAdapter();
    const result = await adapter.send({ chatId: '1', text: 'hi' });

    expect(result.ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns { ok: false } on a non-2xx HTTP response without throwing', async () => {
    mockFetch(async () => jsonResponse({}, 500));
    const adapter = new TestBotAdapter({ token: 'TKN' });

    const result = await adapter.send({ chatId: '1', text: 'hi' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('HTTP 500');
    }
  });

  it('returns { ok: false } when the body reports ok=false', async () => {
    mockFetch(async () => jsonResponse({ ok: false, description: 'chat not found' }));
    const adapter = new TestBotAdapter({ token: 'TKN' });

    const result = await adapter.send({ chatId: '1', text: 'hi' });

    expect(result).toEqual({ ok: false, error: 'chat not found' });
  });

  it('returns { ok: false } on a network error without throwing', async () => {
    mockFetch(async () => {
      throw new Error('network down');
    });
    const adapter = new TestBotAdapter({ token: 'TKN' });

    const result = await adapter.send({ chatId: '1', text: 'hi' });

    expect(result).toEqual({ ok: false, error: 'network down' });
  });
});

describe('BotAdapterBase token secrecy in logs (Requirements 1.7, 8.1)', () => {
  // A distinctive token so a substring match is unambiguous if it ever leaks.
  const SECRET_TOKEN = '123456789:AA-SECRET-BOT-TOKEN-do-not-leak';

  /** Concatenate every argument passed to console.log/console.error. */
  function capturedLogOutput(): string {
    const all = [...logSpy.mock.calls, ...errorSpy.mock.calls];
    return all.map((args: unknown[]) => args.map((a) => String(a)).join(' ')).join('\n');
  }

  it('never writes the bot token to logs on a successful send', async () => {
    mockFetch(async () => jsonResponse({ ok: true }));
    const adapter = new TestBotAdapter({ token: SECRET_TOKEN });

    const result = await adapter.send({ chatId: 'chat-1', text: 'سلام' });

    expect(result.ok).toBe(true);
    expect(capturedLogOutput()).not.toContain(SECRET_TOKEN);
  });

  it('never writes the bot token to logs on an HTTP-error failure path', async () => {
    mockFetch(async () => jsonResponse({}, 500));
    const adapter = new TestBotAdapter({ token: SECRET_TOKEN });

    const result = await adapter.send({ chatId: 'chat-1', text: 'hi' });

    expect(result.ok).toBe(false);
    const output = capturedLogOutput();
    expect(output).not.toContain(SECRET_TOKEN);
    // The failure is still observable — it logged something for this attempt.
    expect(output.length).toBeGreaterThan(0);
  });

  it('never writes the bot token to logs when the network throws', async () => {
    mockFetch(async () => {
      throw new Error('connect ECONNREFUSED');
    });
    const adapter = new TestBotAdapter({ token: SECRET_TOKEN });

    const result = await adapter.send({ chatId: 'chat-1', text: 'hi' });

    expect(result.ok).toBe(false);
    // The structured delivery log identifies the attempt by chatId only; the
    // token lives in the request URL and is never logged as `target`.
    const loggedRecords = errorSpy.mock.calls
      .map((args: unknown[]) => args.map((a) => String(a)).join(' '))
      .filter((line: string) => line.includes('[notify]'));
    expect(loggedRecords.length).toBeGreaterThan(0);
    for (const record of loggedRecords) {
      expect(record).not.toContain(SECRET_TOKEN);
      expect(record).toContain('chat-1');
    }
  });

  it('does not echo the token into the BotSendResult.error returned to callers', async () => {
    mockFetch(async () => jsonResponse({ ok: false, description: 'chat not found' }));
    const adapter = new TestBotAdapter({ token: SECRET_TOKEN });

    const result = await adapter.send({ chatId: 'chat-1', text: 'hi' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain(SECRET_TOKEN);
    }
  });
});

describe('BotAdapterBase.parseUpdate', () => {
  it('normalizes a plain text message', () => {
    const adapter = new TestBotAdapter({ token: 'TKN' });
    const update = adapter.parseUpdate({
      message: { chat: { id: 42 }, text: '/book' },
    });

    expect(update).toEqual({ platform: 'telegram', chatId: '42', text: '/book' });
  });

  it('normalizes a callback_query (inline button tap)', () => {
    const adapter = new TestBotAdapter({ token: 'TKN' });
    const update = adapter.parseUpdate({
      callback_query: { data: 'svc:1', message: { chat: { id: '7' } } },
    });

    expect(update).toEqual({ platform: 'telegram', chatId: '7', callbackData: 'svc:1' });
  });

  it('returns null for unrecognized or chat-less bodies', () => {
    const adapter = new TestBotAdapter({ token: 'TKN' });

    expect(adapter.parseUpdate(null)).toBeNull();
    expect(adapter.parseUpdate('nope')).toBeNull();
    expect(adapter.parseUpdate({})).toBeNull();
    expect(adapter.parseUpdate({ message: { text: 'no chat' } })).toBeNull();
  });
});
