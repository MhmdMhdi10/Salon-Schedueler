import { MelliPayamakSimpleAdapter } from './melipayamak-simple.adapter';

const originalFetch = global.fetch;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  global.fetch = jest.fn();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = originalFetch;
  errorSpy.mockRestore();
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('MelliPayamakSimpleAdapter', () => {
  const endpointUrl = 'https://console.melipayamak.com/api/send/simple/test-token';

  it('POSTs from, to, and text and returns the provider record id', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenInit = init;
      return jsonResponse({ recId: '3741437414', status: '' });
    });

    const result = await new MelliPayamakSimpleAdapter({
      endpointUrl,
      from: '50001234',
    }).send('09304116941', 'پیام آزمایشی');

    expect(seenUrl).toBe(endpointUrl);
    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(JSON.parse(seenInit?.body as string)).toEqual({
      from: '50001234',
      to: '09304116941',
      text: 'پیام آزمایشی',
    });
    expect(result).toEqual({ ok: true, providerId: '3741437414' });
  });

  it('maps provider errors without throwing', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ recId: null, status: 'اعتبار کافی نیست' }),
    );

    const result = await new MelliPayamakSimpleAdapter({
      endpointUrl,
      from: '50001234',
    }).send('09304116941', 'سلام');

    expect(result).toEqual({ ok: false, error: 'اعتبار کافی نیست' });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('fails closed when sender configuration is missing', async () => {
    const result = await new MelliPayamakSimpleAdapter({ endpointUrl }).send(
      '09304116941',
      'سلام',
    );

    expect(result).toEqual({
      ok: false,
      error: 'Melli Payamak sender line is not configured',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
