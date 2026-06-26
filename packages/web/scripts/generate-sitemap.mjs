/**
 * Build-time `sitemap.xml` generator (seo §7; R8.4, R8.5).
 *
 * The sitemap lists **only public, indexable URLs** — the marketing home, the
 * legal/trust pages, and the public per-salon profiles (`/s/:slug`) enumerated
 * from the build-time salon list. It MUST NEVER include a `noindex` URL (auth,
 * the booking funnel, QR landings, per-user receipts, or any `/admin/*` page) —
 * those are excluded by construction here and disallowed in `robots.txt`.
 *
 * The file is emitted into `public/` so Vite copies it verbatim into `dist/`
 * during `vite build`; the npm `build` script runs this first (see
 * package.json). Every `<url>` carries a `<lastmod>` (W3C `YYYY-MM-DD`): a
 * salon's own `lastmod` when present, otherwise the build date.
 *
 * The core string-building functions are pure and exported so they can be unit-
 * and property-tested without touching the filesystem (see
 * `scripts/__tests__/generate-sitemap.test.ts`). Running this module directly
 * (`node scripts/generate-sitemap.mjs`) reads `scripts/salons.json` and writes
 * `public/sitemap.xml`.
 *
 * The canonical host mirrors `src/components/seo/config.ts`: it is read from the
 * build-time `VITE_PUBLIC_SITE_URL` env, falling back to the documented
 * steering placeholder, so staging/production point at the real origin.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The documented placeholder origin used across the SEO steering examples. */
export const DEFAULT_SITE_URL = 'https://example.ir';

/**
 * Static, indexable routes (the SEO indexability map): the marketing home and
 * the trust/legal pages. Funnel, auth, QR, receipt, and admin routes are
 * deliberately absent — they are `noindex` and must never be listed.
 */
export const STATIC_INDEXABLE_PATHS = [
  '/',
  '/business',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
];

/** Strips trailing slashes from an origin so URL joins don't double up. */
export function normalizeOrigin(origin) {
  return String(origin).replace(/\/+$/, '');
}

/** The single canonical host, honoring `VITE_PUBLIC_SITE_URL` like config.ts. */
export function resolveSiteUrl(env = process.env) {
  return normalizeOrigin(env.VITE_PUBLIC_SITE_URL || DEFAULT_SITE_URL);
}

/**
 * Joins a route path onto the site origin, collapsing the root to the bare host
 * (no trailing slash) so the home URL matches the home canonical exactly.
 */
export function absoluteUrl(siteUrl, path) {
  const origin = normalizeOrigin(siteUrl);
  const pathname = String(path).startsWith('/') ? path : `/${path}`;
  if (pathname === '/') return origin;
  return `${origin}${pathname.replace(/\/+$/, '')}`;
}

/** Formats a Date (or ISO/`YYYY-MM-DD` string) as a W3C `YYYY-MM-DD` date. */
export function toW3CDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid lastmod date: ${String(value)}`);
  }
  return d.toISOString().slice(0, 10);
}

/** XML-escapes a text value for safe inclusion in element content. */
export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Builds an `/s/:slug` path from a salon slug. */
export function salonPath(slug) {
  return `/s/${String(slug).trim()}`;
}

/** Builds a `/city/:slug` path from a city slug. */
export function cityPath(slug) {
  return `/city/${String(slug).trim()}`;
}

/** Builds a `/services/:slug` path from a service-type slug. */
export function servicePath(slug) {
  return `/services/${String(slug).trim()}`;
}

/**
 * Builds the full list of indexable sitemap entries — `{ loc, lastmod }` — from
 * the static routes plus the salon list. The build date backfills any salon
 * without its own `lastmod`; static pages use the build date.
 */
export function buildEntries({ siteUrl, salons = [], cities = [], serviceTypes = [], buildDate = new Date() }) {
  const fallbackLastmod = toW3CDate(buildDate);

  const staticEntries = STATIC_INDEXABLE_PATHS.map((path) => ({
    loc: absoluteUrl(siteUrl, path),
    lastmod: fallbackLastmod,
  }));

  const salonEntries = salons
    .filter((salon) => salon && typeof salon.slug === 'string' && salon.slug.trim() !== '')
    .map((salon) => ({
      loc: absoluteUrl(siteUrl, salonPath(salon.slug)),
      lastmod: salon.lastmod ? toW3CDate(salon.lastmod) : fallbackLastmod,
    }));

  const cityEntries = cities
    .filter((c) => c && typeof c.slug === 'string' && c.slug.trim() !== '')
    .map((c) => ({
      loc: absoluteUrl(siteUrl, cityPath(c.slug)),
      lastmod: c.lastmod ? toW3CDate(c.lastmod) : fallbackLastmod,
    }));

  const serviceEntries = serviceTypes
    .filter((s) => s && typeof s.slug === 'string' && s.slug.trim() !== '')
    .map((s) => ({
      loc: absoluteUrl(siteUrl, servicePath(s.slug)),
      lastmod: s.lastmod ? toW3CDate(s.lastmod) : fallbackLastmod,
    }));

  return [...staticEntries, ...salonEntries, ...cityEntries, ...serviceEntries];
}

/** Serializes sitemap entries into a valid urlset XML document. */
export function buildSitemap({ siteUrl, salons = [], cities = [], serviceTypes = [], buildDate = new Date() }) {
  const entries = buildEntries({ siteUrl, salons, cities, serviceTypes, buildDate });
  const urls = entries
    .map(
      (entry) =>
        `  <url>\n` +
        `    <loc>${escapeXml(entry.loc)}</loc>\n` +
        `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>\n` +
        `  </url>`,
    )
    .join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${urls}\n` +
    `</urlset>\n`
  );
}

/** Reads and parses the build-time salon list, tolerating a missing file. */
export function readSalons(salonsPath) {
  try {
    const raw = readFileSync(salonsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.salons) ? parsed.salons : [];
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Reads the build-time discovery list (`{ cities, serviceTypes }`), tolerating
 * a missing file. Drives the `/city/:slug` and `/services/:slug` sitemap +
 * prerender entries (seo §1, §7).
 */
export function readDiscovery(discoveryPath) {
  try {
    const raw = readFileSync(discoveryPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      cities: Array.isArray(parsed.cities) ? parsed.cities : [],
      serviceTypes: Array.isArray(parsed.serviceTypes) ? parsed.serviceTypes : [],
    };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { cities: [], serviceTypes: [] };
    throw err;
  }
}

/** CLI entry: read the salon list, build the sitemap, write `public/sitemap.xml`. */
export function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const salonsPath = resolve(here, 'salons.json');
  const discoveryPath = resolve(here, 'discovery.json');
  const outPath = resolve(here, '../public/sitemap.xml');

  const siteUrl = resolveSiteUrl();
  const salons = readSalons(salonsPath);
  const { cities, serviceTypes } = readDiscovery(discoveryPath);
  const xml = buildSitemap({
    siteUrl,
    salons,
    cities,
    serviceTypes,
    buildDate: new Date(),
  });

  writeFileSync(outPath, xml, 'utf-8');
  // eslint-disable-next-line no-console
  console.log(
    `[sitemap] wrote ${outPath} (${STATIC_INDEXABLE_PATHS.length} static + ` +
      `${salons.length} salon + ${cities.length} city + ${serviceTypes.length} service URLs, host ${siteUrl})`,
  );
}

// Run only when invoked directly, not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
