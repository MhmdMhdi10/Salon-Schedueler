import { AuthScreen, AUTH_SCREEN } from './AuthScreen';
import { requestOtp, verifyOtp } from './AuthScreen.logic';
import { getAccessToken, setAccessToken } from '../api/client';

/**
 * Tests for the mobile AuthScreen.
 * Verifies the OTP flow calls the API client and handles success/error, that
 * tokens are stored on success, and that the screen exports a real component.
 * Requirement: 7.4, 7.5
 */

const mockFetch = jest.fn();

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function errorResponse(status: number, body: unknown) {
  return { ok: false, status, json: async () => body };
}

beforeEach(() => {
  mockFetch.mockReset();
  (global as { fetch: unknown }).fetch = mockFetch;
  setAccessToken(null);
});

describe('AuthScreen component export', () => {
  it('exports a real function component and a route name', () => {
    expect(typeof AuthScreen).toBe('function');
    expect(AUTH_SCREEN).toBe('AuthScreen');
  });
});

describe('AuthScreen OTP flow logic', () => {
  it('requestOtp calls the OTP request endpoint and reports success', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({}));

    const result = await requestOtp('09120000000');

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/auth/otp/request');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ phone: '09120000000' });
  });

  it('requestOtp returns a structured error when the request fails', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(400, { code: 'VALIDATION_ERROR', message: 'bad phone' }));

    const result = await requestOtp('invalid');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('bad phone');
    }
  });

  it('verifyOtp stores tokens and persists them on success', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({ accessToken: 'access-1', refreshToken: 'refresh-1' })
    );
    const persist = jest.fn();

    const result = await verifyOtp('09120000000', '123456', persist);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tokens).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    }
    expect(getAccessToken()).toBe('access-1');
    expect(persist).toHaveBeenCalledWith({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    const [url, options] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/auth/otp/verify');
    expect(JSON.parse(options.body)).toEqual({ phone: '09120000000', code: '123456' });
  });

  it('verifyOtp returns a structured error and stores no token on failure', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(401, { code: 'OTP_INVALID', message: 'wrong code' }));
    const persist = jest.fn();

    const result = await verifyOtp('09120000000', '000000', persist);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('wrong code');
    }
    expect(getAccessToken()).toBeNull();
    expect(persist).not.toHaveBeenCalled();
  });
});
