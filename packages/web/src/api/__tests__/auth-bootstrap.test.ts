import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for the access-token bootstrap from a stored refresh token (task 5.1;
 * R2.2). These exercise the client helpers directly: persisting the refresh
 * token on OTP verify, restoring the in-memory access token on load, rotating
 * the stored token, and clearing everything on sign-out. Tokens are never
 * logged — only their presence/absence is asserted.
 */

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

describe('refresh token persistence', () => {
  it('stores and reads the refresh token', async () => {
    const client = await import('../client');
    client.setRefreshToken('refresh-1');
    expect(client.getRefreshToken()).toBe('refresh-1');
    expect(localStorage.getItem(client.REFRESH_TOKEN_KEY)).toBe('refresh-1');
  });

  it('clears the refresh token when set to null', async () => {
    const client = await import('../client');
    client.setRefreshToken('refresh-1');
    client.setRefreshToken(null);
    expect(client.getRefreshToken()).toBeNull();
  });
});

describe('bootstrapAuth', () => {
  it('returns false and makes no request when no refresh token is stored', async () => {
    const client = await import('../client');
    const ok = await client.bootstrapAuth();
    expect(ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(client.getAccessToken()).toBeNull();
  });

  it('restores the access token from a stored refresh token', async () => {
    const client = await import('../client');
    client.setRefreshToken('refresh-1');
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ accessToken: 'access-new', refreshToken: 'refresh-2' }),
    );

    const ok = await client.bootstrapAuth();

    expect(ok).toBe(true);
    expect(client.getAccessToken()).toBe('access-new');
    // Rotated refresh token is persisted for the next reload.
    expect(client.getRefreshToken()).toBe('refresh-2');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('clears a stale refresh token and returns false when refresh fails', async () => {
    const client = await import('../client');
    client.setRefreshToken('expired');
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 'UNAUTHORIZED', message: 'bad' }, false, 401),
    );

    const ok = await client.bootstrapAuth();

    expect(ok).toBe(false);
    expect(client.getAccessToken()).toBeNull();
    expect(client.getRefreshToken()).toBeNull();
  });
});

describe('expired access token recovery', () => {
  it('refreshes once and retries the failed authenticated request', async () => {
    const client = await import('../client');
    client.setAccessToken('access-expired');
    client.setRefreshToken('refresh-1');
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ code: 'UNAUTHORIZED', message: 'expired' }, false, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'access-new', refreshToken: 'refresh-2' }))
      .mockResolvedValueOnce(jsonResponse({ utilization: {}, revenue: {}, busiestWindows: [] }));

    await client.adminApi.getAnalytics('salon-1', '2026-06-25', '2026-07-25');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[1]?.[0]).toContain('/auth/refresh');
    expect(mockFetch.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer access-new' }),
      }),
    );
    expect(client.getRefreshToken()).toBe('refresh-2');
  });
});

describe('signOut', () => {
  it('clears the in-memory access token and the stored refresh token', async () => {
    const client = await import('../client');
    client.setAccessToken('access-1');
    client.setRefreshToken('refresh-1');

    client.signOut();

    expect(client.getAccessToken()).toBeNull();
    expect(client.getRefreshToken()).toBeNull();
  });
});
