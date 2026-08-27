import { MelliPayamakSharedOtpAdapter } from './melipayamak-shared-otp.adapter';

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

describe('MelliPayamakSharedOtpAdapter', () => {
  const endpointUrl = 'https://console.melipayamak.com/api/send/shared/test-token';

  it('mirrors the reference script payload and returns the requested code', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenInit = init;
      return jsonResponse({ recId: 3741437414, status: '' });
    });

    const result = await new MelliPayamakSharedOtpAdapter({
      endpointUrl,
      bodyId: 524,
    }).sendOtp('09304116941', '123456');

    expect(seenUrl).toBe(endpointUrl);
    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(JSON.parse(seenInit?.body as string)).toEqual({
      bodyId: 524,
      to: '09304116941',
      args: ['123456'],
    });
    expect(result).toEqual({
      ok: true,
      providerId: '3741437414',
      code: '123456',
    });
  });

  it('sends non-OTP shared templates with positional args unchanged', async () => {
    let seenInit: RequestInit | undefined;
    (global.fetch as jest.Mock).mockImplementation(async (_url: string, init: RequestInit) => {
      seenInit = init;
      return jsonResponse({ recId: 'template-message-id', status: '' });
    });

    const result = await new MelliPayamakSharedOtpAdapter({ endpointUrl }).sendTemplate(
      '09120000000',
      525115,
      ['سالن آرا', 'علی محمدی', 'منتظر تأیید', 'حسین', '۱۴۰۵/۰۶/۰۴', '۱۰:۳۰'],
    );

    expect(JSON.parse(seenInit?.body as string)).toEqual({
      bodyId: 525115,
      to: '09120000000',
      args: ['سالن آرا', 'علی محمدی', 'منتظر تأیید', 'حسین', '۱۴۰۵/۰۶/۰۴', '۱۰:۳۰'],
    });
    expect(result).toEqual({ ok: true, providerId: 'template-message-id' });
  });

  it('generates a six-digit code when called without one', async () => {
    let sentCode = '';
    (global.fetch as jest.Mock).mockImplementation(async (_url: string, init: RequestInit) => {
      sentCode = JSON.parse(init.body as string).args[0];
      return jsonResponse({ recId: 'message-id' });
    });

    const result = await new MelliPayamakSharedOtpAdapter({ endpointUrl }).sendOtp('09304116941');

    expect(sentCode).toMatch(/^\d{6}$/);
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string).bodyId).toBe(523232);
    expect(result).toEqual({ ok: true, providerId: 'message-id', code: sentCode });
  });

  it('maps provider validation errors without throwing', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ status: 'مستلزم تنظیم و تأیید مدیر' }, 400),
    );

    const result = await new MelliPayamakSharedOtpAdapter({ endpointUrl }).sendOtp(
      '09304116941',
      '123456',
    );

    expect(result).toEqual({
      ok: false,
      error: 'Melli Payamak HTTP 400: مستلزم تنظیم و تأیید مدیر',
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('does not send an invalid code', async () => {
    const result = await new MelliPayamakSharedOtpAdapter({ endpointUrl }).sendOtp(
      '09304116941',
      'abc',
    );

    expect(result).toEqual({ ok: false, error: 'OTP code must contain 4 to 10 digits' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
