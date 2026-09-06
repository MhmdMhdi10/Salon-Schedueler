import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Browser auth tests. Refresh credentials stay in an HttpOnly cookie; JS only
 * owns the short-lived access token in memory. */

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  localStorage.clear();
});

describe('bootstrapAuth', () => {
  it('asks the HttpOnly cookie-backed refresh endpoint on page bootstrap', async () => {
    const client = await import('../client');
    mockFetch.mockResolvedValueOnce(jsonResponse({ accessToken: 'access-new' }));

    const ok = await client.bootstrapAuth();

    expect(ok).toBe(true);
    expect(client.getAccessToken()).toBe('access-new');
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-Auth-Client': 'web' }),
      }),
    );
  });

  it('clears the in-memory access token when the cookie refresh fails', async () => {
    const client = await import('../client');
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 'UNAUTHORIZED', message: 'bad' }, false, 401),
    );

    const ok = await client.bootstrapAuth();

    expect(ok).toBe(false);
    expect(client.getAccessToken()).toBeNull();
  });
});

describe('expired access token recovery', () => {
  it('refreshes once and retries the failed authenticated request', async () => {
    const client = await import('../client');
    client.setAccessToken('access-expired');
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ code: 'UNAUTHORIZED', message: 'expired' }, false, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'access-new' }))
      .mockResolvedValueOnce(jsonResponse({ utilization: {}, revenue: {}, busiestWindows: [] }));

    await client.adminApi.getAnalytics('salon-1', '2026-06-25', '2026-07-25');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[1]?.[0]).toContain('/auth/refresh');
    expect(mockFetch.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer access-new' }),
      }),
    );
  });
});

describe('field-level API validation errors', () => {
  it('preserves the invalid field and explains service validation failures', async () => {
    const client = await import('../client');
    client.setAccessToken('access-token');
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 'VALIDATION_ERROR', field: 'maxDurationMinutes' }, false, 400),
    );

    const error = await client.adminApi
      .updateService('salon-1', 'service-1', {
        durationMode: 'variable',
        minDurationMinutes: 60,
        maxDurationMinutes: 30,
      })
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'maxDurationMinutes' });
    expect(client.getApiErrorMessage(error)).toBe(
      'حداکثر زمان باید بین ۵ تا ۴۸۰ دقیقه و حداقل به‌اندازه حداقل زمان باشد.',
    );
  });
});

describe('signOut', () => {
  it('clears the in-memory access token without writing browser storage', async () => {
    const client = await import('../client');
    client.setAccessToken('access-1');

    client.signOut();

    expect(client.getAccessToken()).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});
