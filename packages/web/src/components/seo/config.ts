/**
 * Site-wide SEO constants and the canonical-URL helper.
 *
 * These centralize the few values that every public page's `<head>` depends on
 * (the single canonical host, the site name used in the title template, the
 * default OG image) so they're defined once and impossible to drift between
 * pages (seo §3, §4, §6).
 *
 * ## Single canonical host (seo §3, §7)
 *
 * SEO requires picking **one** host (apex vs `www`) and 301-ing the other; the
 * canonical of every indexable page must be an absolute `https://…` URL on that
 * host with tracking/query params stripped. The host is read from
 * `VITE_PUBLIC_SITE_URL` at build time so staging/production can point at the
 * real origin; it falls back to the documented placeholder used throughout the
 * steering examples. (Confirm the real apex-vs-www choice before launch — see
 * the design doc's "Public host & slugs" open question.)
 */

/** Brand/site name — the right-hand side of the title template, and `og:site_name`. */
export const SITE_NAME = 'رزرو سالن';

/** Suffix appended to every page title: «{صفحه} | رزرو سالن» (seo §3). */
export const TITLE_TEMPLATE_SUFFIX = ` | ${SITE_NAME}`;

/** Declared content locale (seo §6). */
export const OG_LOCALE = 'fa_IR';
export const HTML_LANG = 'fa';

/**
 * The single canonical host, without a trailing slash. Read from the build-time
 * env so deployments can override it; defaults to the steering placeholder.
 */
export const SITE_URL: string = normalizeOrigin(
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta).env?.VITE_PUBLIC_SITE_URL) ||
    'https://example.ir',
);

/**
 * Branded default Open Graph image (1200×630, seo §4). Absolute on the site host.
 * Source template: public/og/default.svg (RTL-correct Persian text, magenta brand).
 * Raster variants: default.jpg, default.webp, default.avif (generated via scripts/generate-og-images.ts).
 * Social platforms require raster formats — always serve .jpg in og:image meta.
 */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og/default.jpg`;
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** Strips a trailing slash from an origin so URL joins don't double up. */
function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}

/**
 * Builds an absolute canonical URL on the single site host from a path.
 *
 * - Joins `path` onto `SITE_URL` (a leading slash is added if missing).
 * - **Strips the query string and hash** so tracking params (`utm_*`, `gclid`,
 *   session ids) never leak into a canonical (seo §3, §7).
 * - Collapses a root path to the bare host (`https://example.ir`) — no trailing
 *   slash — so the home canonical is stable.
 *
 * Falls back to a relative resolution if `path` is already an absolute URL on a
 * different origin (kept as-is, query stripped) so callers can pass a known
 * absolute canonical when they have one.
 */
export function absoluteCanonical(path: string): string {
  const trimmedOfParams = stripParams(path);
  // Already absolute? Keep its origin + path, params already stripped.
  if (/^https?:\/\//i.test(trimmedOfParams)) {
    return trimmedOfParams.replace(/\/+$/, '') || trimmedOfParams;
  }
  const pathname = trimmedOfParams.startsWith('/')
    ? trimmedOfParams
    : `/${trimmedOfParams}`;
  // Root → bare host without trailing slash.
  if (pathname === '/') return SITE_URL;
  return `${SITE_URL}${pathname.replace(/\/+$/, '')}`;
}

/** Removes the `?query` and `#hash` portions of a URL/path. */
function stripParams(path: string): string {
  const queryIndex = path.indexOf('?');
  const hashIndex = path.indexOf('#');
  let end = path.length;
  if (queryIndex !== -1) end = Math.min(end, queryIndex);
  if (hashIndex !== -1) end = Math.min(end, hashIndex);
  return path.slice(0, end);
}
