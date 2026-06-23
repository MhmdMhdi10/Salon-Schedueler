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
  const fromEnv =
    typeof process !== 'undefined' && process.env ? process.env.API_BASE_URL : undefined;
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_API_BASE_URL;
}

/** Base URL of the HTTP API the mobile client targets. */
export const API_BASE_URL: string = readApiBaseUrl();
