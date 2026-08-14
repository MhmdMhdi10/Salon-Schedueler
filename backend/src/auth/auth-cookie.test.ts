import type { Request, Response } from 'express';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './auth-cookie.js';

describe('refresh cookie contract', () => {
  it('writes an HttpOnly SameSite cookie scoped to auth routes', () => {
    const response = { setHeader: jest.fn() } as unknown as Response;

    setRefreshCookie(response, 'refresh token', 604800, false);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('salon_refresh=refresh%20token'),
    );
    const header = String((response.setHeader as jest.Mock).mock.calls[0]?.[1]);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/api/auth');
    expect(header).toContain('Max-Age=604800');
    expect(header).not.toContain('Secure');
  });

  it('adds Secure only when requested for production HTTPS', () => {
    const response = { setHeader: jest.fn() } as unknown as Response;

    setRefreshCookie(response, 'refresh', 60, true);

    const header = String((response.setHeader as jest.Mock).mock.calls[0]?.[1]);
    expect(header).toContain('Secure');
  });

  it('reads and decodes the refresh cookie without accepting another cookie', () => {
    const request = {
      headers: { cookie: 'theme=dark; salon_refresh=refresh%20token' },
    } as unknown as Request;

    expect(readRefreshCookie(request)).toBe('refresh token');
  });

  it('clears the cookie with an expired max age', () => {
    const response = { setHeader: jest.fn() } as unknown as Response;

    clearRefreshCookie(response, false);

    const header = String((response.setHeader as jest.Mock).mock.calls[0]?.[1]);
    expect(header).toContain('salon_refresh=');
    expect(header).toContain('Max-Age=0');
    expect(header).toContain('HttpOnly');
  });
});
