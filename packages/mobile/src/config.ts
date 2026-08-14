/**
 * Runtime configuration for the Salon Booking mobile app.
 *
 * Requirement 6.1: the client targets a configurable real API base URL rather
 * than a hard-coded production host.
 */

/**
 * Default API base URL used when `API_BASE_URL` is not provided by the
 * environment. It points at a local backend for development. Production builds
 * MUST set `API_BASE_URL` (for example `https://api.example.com`) so that no
 * production host is hard-coded in the source.
 */
export const DEFAULT_API_BASE_URL = 'http://localhost:3000';

/**
 * Reads the API base URL from the `API_BASE_URL` environment variable. For
 * React Native this value is injected at build time (e.g. via a `.env` loader
 * or the bundler's `process.env` replacement); in tests and Node it is read
 * directly from `process.env`. Falls back to {@link DEFAULT_API_BASE_URL}.
 */
function readApiBaseUrl(): string {
  // Prefer the Expo runtime config (`app.json` → expo.extra.apiBaseUrl), which
  // points at the dev machine's LAN IP so a physical phone on the same Wi-Fi can
  // reach the backend. Falls back to `process.env.API_BASE_URL`, then the local
  // default. Wrapped in try/catch so non-Expo runtimes (tests/Node) are safe.
  try {
    // Lazy require so Jest/Node (where `expo-constants` is absent) never break.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    const extra =
      Constants?.expoConfig?.extra ?? Constants?.manifest?.extra ?? undefined;
    const fromExpo = extra?.apiBaseUrl;
    if (typeof fromExpo === 'string' && fromExpo.length > 0) {
      return fromExpo;
    }
  } catch {
    // expo-constants not available (tests/Node) — fall through to env/default.
  }
  const fromEnv =
    typeof process !== 'undefined' && process.env ? process.env.API_BASE_URL : undefined;
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_API_BASE_URL;
}

/**
 * All backend HTTP routes are mounted under `/api` (see backend `http/app.ts`).
 * The web app reaches them same-origin via a dev proxy, but the mobile client
 * talks to the backend host directly, so the `/api` prefix must be part of the
 * base URL. Normalize here: strip any trailing slash, then ensure a single
 * `/api` suffix — whether the configured URL already includes it or not.
 */
function withApiPrefix(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.replace(/\/+$/, '');
  return /\/api$/.test(trimmed) ? trimmed : `${trimmed}/api`;
}

/** Base URL of the HTTP API the mobile client targets (includes `/api`). */
export const API_BASE_URL: string = withApiPrefix(readApiBaseUrl());
