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
 * (`node scripts/generate-sitemap.mjs`) enumerates the route data from the app
 * source (`scripts/site-data.mjs` → src/data/{salons,discovery,taxonomy}.ts)
 * and writes `public/sitemap.xml` AND `public/robots.txt` — robots is generated
 * from the same origin helper so the `Sitemap:` line can never drift from the
 * canonical host.
 *
 * The canonical host mirrors `src/components/seo/config.ts`: it is read from
 * the build-time `VITE_SITE_ORIGIN` env (legacy alias `VITE_PUBLIC_SITE_URL`),
 * falling back to the documented steering placeholder. Deployments MUST set the
 * real origin — `main()` prints a loud warning when the placeholder ships.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSiteData } from './site-data.mjs';

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

/**
 * The single canonical host. Honors `VITE_SITE_ORIGIN` (the documented deploy
 * knob) with `VITE_PUBLIC_SITE_URL` as a legacy alias — exactly the order
 * `src/components/seo/config.ts` uses — so every emitter (SeoHead, JSON-LD,
 * sitemap, robots, prerender) resolves the same origin from one env var.
 */
export function resolveSiteUrl(env = process.env) {
  return normalizeOrigin(
    env.VITE_SITE_ORIGIN || env.VITE_PUBLIC_SITE_URL || DEFAULT_SITE_URL,
  );
}

/** True when the resolved origin is still the placeholder (not deploy-ready). */
export function isPlaceholderSiteUrl(siteUrl) {
  return normalizeOrigin(siteUrl) === DEFAULT_SITE_URL;
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

// NOTE: the legacy `scripts/salons.json` / `scripts/discovery.json` readers are
// gone — the route data now comes from `scripts/site-data.mjs`, which loads the
// live `src/data/{salons,discovery,taxonomy}.ts` modules so the sitemap and the
// rendered pages can never enumerate different slugs.

/**
 * Builds `robots.txt` from the same origin helper the sitemap uses (seo §7).
 * Disallows exactly the noindex/transactional surfaces: auth, admin/owner
 * panels, the booking funnel, QR landings, the API, the salon-registration
 * wizard, and internal search results (crawl-budget hygiene; the routes also
 * emit `noindex` client-side as belt-and-braces).
 */
export function buildRobots(siteUrl) {
  const origin = normalizeOrigin(siteUrl);
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /auth',
    'Disallow: /admin/',
    'Disallow: /owner/',
    'Disallow: /salon/*/book',
    'Disallow: /booking/',
    'Disallow: /qr/',
    'Disallow: /api/',
    'Disallow: /business/register',
    'Disallow: /search',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

/** Loud, actionable warning when a build still points at the placeholder host. */
export function warnIfPlaceholder(siteUrl, label) {
  if (!isPlaceholderSiteUrl(siteUrl)) return;
  // eslint-disable-next-line no-console
  console.warn(
    `\n[${label}] WARNING: canonical host is the placeholder ${DEFAULT_SITE_URL}.\n` +
      `[${label}]          Set VITE_SITE_ORIGIN=https://<real-domain> in the build\n` +
      `[${label}]          environment before publishing — every canonical, OG URL,\n` +
      `[${label}]          JSON-LD url, sitemap <loc> and robots Sitemap line uses it.\n`,
  );
}

/**
 * CLI entry: enumerate the route data from the app source (src/data via
 * `site-data.mjs`), then write `public/sitemap.xml` + `public/robots.txt`.
 */
export async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const sitemapPath = resolve(here, '../public/sitemap.xml');
  const robotsPath = resolve(here, '../public/robots.txt');

  const siteUrl = resolveSiteUrl();
  const { salons, cities, serviceTypes } = await loadSiteData();
  const xml = buildSitemap({
    siteUrl,
    salons,
    cities,
    serviceTypes,
    buildDate: new Date(),
  });

  writeFileSync(sitemapPath, xml, 'utf-8');
  writeFileSync(robotsPath, buildRobots(siteUrl), 'utf-8');
  warnIfPlaceholder(siteUrl, 'sitemap');
  // eslint-disable-next-line no-console
  console.log(
    `[sitemap] wrote ${sitemapPath} (${STATIC_INDEXABLE_PATHS.length} static + ` +
      `${salons.length} salon + ${cities.length} city + ${serviceTypes.length} service URLs, host ${siteUrl})\n` +
      `[sitemap] wrote ${robotsPath} from the same origin helper`,
  );
}

// Run only when invoked directly, not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
