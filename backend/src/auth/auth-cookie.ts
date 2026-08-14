import type { Request, Response } from 'express';

/** Stable cookie name shared by the browser auth controller and its tests. */
export const REFRESH_COOKIE_NAME = 'salon_refresh';
/** Keep cookie scope narrower than the whole application. */
export const REFRESH_COOKIE_PATH = '/api/auth';
/** Must stay aligned with AuthService's default refresh lifetime. */
export const REFRESH_COOKIE_MAX_AGE_SECONDS = 604_800;

function serializeRefreshCookie(
  value: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  const maxAge = Math.max(0, Math.floor(maxAgeSeconds));
  return [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAge}`,
    `Path=${REFRESH_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

/** Set the rotating refresh credential without exposing it to JavaScript. */
export function setRefreshCookie(
  response: Response,
  token: string,
  maxAgeSeconds = REFRESH_COOKIE_MAX_AGE_SECONDS,
  secure = process.env.NODE_ENV === 'production',
): void {
  response.setHeader(
    'Set-Cookie',
    serializeRefreshCookie(token, maxAgeSeconds, secure),
  );
}

/** Read only the named refresh cookie; malformed values are treated as absent. */
export function readRefreshCookie(request: Request): string | undefined {
  const raw = request.headers.cookie;
  if (!raw) return undefined;

  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== REFRESH_COOKIE_NAME) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value) || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Expire the refresh credential using the same cookie scope as set(). */
export function clearRefreshCookie(
  response: Response,
  secure = process.env.NODE_ENV === 'production',
): void {
  setRefreshCookie(response, '', 0, secure);
}
