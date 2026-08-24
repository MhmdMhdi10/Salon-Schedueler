import { MelliPayamakOtpAdapter } from './melipayamak-otp.adapter';

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

describe('MelliPayamakOtpAdapter', () => {
  const endpointUrl = 'https://console.melipayamak.com/api/send/otp/test-token';

  it('POSTs the recipient and persists the provider-generated code', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenInit = init;
      return jsonResponse({ code: '3741437414', status: 'موفق' });
    });

    const result = await new MelliPayamakOtpAdapter({ endpointUrl }).sendOtp('09123456789');

    expect(seenUrl).toBe(endpointUrl);
    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(JSON.parse(seenInit?.body as string)).toEqual({ to: '09123456789' });
    expect(result).toEqual({
      ok: true,
      providerId: 'melipayamak-otp',
      code: '3741437414',
    });
  });

  it('maps provider errors without throwing', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ status: 'شماره نامعتبر است' }),
    );

    const result = await new MelliPayamakOtpAdapter({ endpointUrl }).sendOtp('bad');

    expect(result).toEqual({ ok: false, error: 'شماره نامعتبر است' });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('maps non-2xx responses without throwing', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, 401));

    const result = await new MelliPayamakOtpAdapter({ endpointUrl }).sendOtp('09123456789');

    expect(result).toEqual({ ok: false, error: 'Melli Payamak HTTP 401' });
  });

  it('returns a failure when the endpoint response has no numeric code', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ status: 'خطا' }));

    const result = await new MelliPayamakOtpAdapter({ endpointUrl }).sendOtp('09123456789');

    expect(result).toEqual({ ok: false, error: 'خطا' });
  });
});
