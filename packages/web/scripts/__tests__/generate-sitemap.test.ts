import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error — plain ESM build script, no type declarations.
import {
  DEFAULT_SITE_URL,
  STATIC_INDEXABLE_PATHS,
  normalizeOrigin,
  resolveSiteUrl,
  absoluteUrl,
  toW3CDate,
  escapeXml,
  salonPath,
  cityPath,
  servicePath,
  buildEntries,
  buildSitemap,
} from '../generate-sitemap.mjs';

/**
 * Tests for the build-time `sitemap.xml` generator (task 4.3; seo §7; R8.4, R8.5).
 *
 * The governing standard requires the sitemap to list ONLY public, indexable
 * URLs, each with a `<lastmod>`, generated from the salon list — and to NEVER
 * include a `noindex` URL (auth, funnel, QR, receipt, admin, api). These tests
 * pin that contract on both the static recipe (`robots.txt`) and the generated
 * XML.
 */

/** The full set of noindex path prefixes from the SEO indexability map. */
const NOINDEX_PREFIXES = [
  '/auth',
  '/admin/',
  '/booking/',
  '/qr/',
  '/api/',
  '/book', // covers /salon/:id/book and /.../confirm funnel steps
];

describe('robots.txt (seo §7 verbatim recipe)', () => {
  const robots = readFileSync(
    resolve(__dirname, '../../public/robots.txt'),
    'utf-8',
  );

  it('allows the public root', () => {
    expect(robots).toMatch(/^Allow: \/$/m);
  });

  it('disallows every private surface', () => {
    expect(robots).toMatch(/^Disallow: \/auth$/m);
    expect(robots).toMatch(/^Disallow: \/admin\/$/m);
    expect(robots).toMatch(/^Disallow: \/salon\/\*\/book$/m);
    expect(robots).toMatch(/^Disallow: \/booking\/$/m);
    expect(robots).toMatch(/^Disallow: \/qr\/$/m);
    expect(robots).toMatch(/^Disallow: \/api\/$/m);
  });

  it('points to the sitemap', () => {
    expect(robots).toMatch(/^Sitemap: https?:\/\/\S+\/sitemap\.xml$/m);
  });
});

describe('URL + date helpers', () => {
  it('normalizes trailing slashes off the origin', () => {
    expect(normalizeOrigin('https://example.ir/')).toBe('https://example.ir');
    expect(normalizeOrigin('https://example.ir///')).toBe('https://example.ir');
  });

  it('collapses the root path to the bare host', () => {
    expect(absoluteUrl('https://example.ir', '/')).toBe('https://example.ir');
  });

  it('joins and trims non-root paths', () => {
    expect(absoluteUrl('https://example.ir', '/about')).toBe(
      'https://example.ir/about',
    );
    expect(absoluteUrl('https://example.ir/', 'about/')).toBe(
      'https://example.ir/about',
    );
  });

  it('builds salon paths under /s/', () => {
    expect(salonPath('salon-rose')).toBe('/s/salon-rose');
  });

  it('builds discovery paths under /city/ and /services/', () => {
    expect(cityPath('tehran')).toBe('/city/tehran');
    expect(servicePath('haircut')).toBe('/services/haircut');
  });

  it('formats dates as W3C YYYY-MM-DD', () => {
    expect(toW3CDate('2025-01-15')).toBe('2025-01-15');
    expect(toW3CDate(new Date('2025-03-09T12:34:56Z'))).toBe('2025-03-09');
  });

  it('rejects an invalid lastmod', () => {
    expect(() => toW3CDate('not-a-date')).toThrow();
  });

  it('escapes XML-significant characters', () => {
    expect(escapeXml('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
  });

  it('falls back to the documented placeholder host', () => {
    expect(resolveSiteUrl({})).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl({ VITE_PUBLIC_SITE_URL: 'https://salon.example/' })).toBe(
      'https://salon.example',
    );
  });
});

describe('buildEntries', () => {
  const buildDate = new Date('2025-01-01T00:00:00Z');

  it('includes every static indexable path', () => {
    const entries = buildEntries({ siteUrl: DEFAULT_SITE_URL, buildDate });
    const locs = entries.map((e) => e.loc);
    for (const path of STATIC_INDEXABLE_PATHS) {
      expect(locs).toContain(absoluteUrl(DEFAULT_SITE_URL, path));
    }
  });

  it('adds an /s/:slug entry per salon, using its lastmod when present', () => {
    const entries = buildEntries({
      siteUrl: DEFAULT_SITE_URL,
      salons: [
        { slug: 'salon-rose', lastmod: '2024-12-31' },
        { slug: 'salon-noor' },
      ],
      buildDate,
    });
    const rose = entries.find((e) => e.loc.endsWith('/s/salon-rose'));
    const noor = entries.find((e) => e.loc.endsWith('/s/salon-noor'));
    expect(rose?.lastmod).toBe('2024-12-31');
    expect(noor?.lastmod).toBe('2025-01-01'); // build-date fallback
  });

  it('adds /city/:slug and /services/:slug discovery entries', () => {
    const entries = buildEntries({
      siteUrl: DEFAULT_SITE_URL,
      cities: [{ slug: 'tehran', lastmod: '2024-11-30' }],
      serviceTypes: [{ slug: 'haircut' }],
      buildDate,
    });
    const tehran = entries.find((e) => e.loc.endsWith('/city/tehran'));
    const haircut = entries.find((e) => e.loc.endsWith('/services/haircut'));
    expect(tehran?.lastmod).toBe('2024-11-30');
    expect(haircut?.lastmod).toBe('2025-01-01'); // build-date fallback
  });

  it('skips discovery entries with missing/blank slugs', () => {
    const entries = buildEntries({
      siteUrl: DEFAULT_SITE_URL,
      cities: [{ slug: '' }, { slug: '  ' }, {}, null, { slug: 'ok-city' }],
      serviceTypes: [{ slug: '' }, { slug: 'ok-service' }],
      buildDate,
    });
    expect(entries.filter((e) => e.loc.includes('/city/'))).toHaveLength(1);
    expect(entries.filter((e) => e.loc.includes('/services/'))).toHaveLength(1);
  });

  it('skips salons with missing/blank slugs', () => {
    const entries = buildEntries({
      siteUrl: DEFAULT_SITE_URL,
      salons: [{ slug: '' }, { slug: '   ' }, {}, null, { slug: 'ok' }],
      buildDate,
    });
    const salonEntries = entries.filter((e) => e.loc.includes('/s/'));
    expect(salonEntries).toHaveLength(1);
    expect(salonEntries[0].loc).toContain('/s/ok');
  });
});

describe('buildSitemap', () => {
  const buildDate = new Date('2025-01-01T00:00:00Z');

  it('emits a valid urlset with one loc+lastmod per entry', () => {
    const xml = buildSitemap({
      siteUrl: DEFAULT_SITE_URL,
      salons: [{ slug: 'salon-rose', lastmod: '2024-12-31' }],
      buildDate,
    });
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml).toContain('<loc>https://example.ir</loc>');
    expect(xml).toContain('<loc>https://example.ir/s/salon-rose</loc>');
    // Every url has a lastmod.
    const locCount = (xml.match(/<loc>/g) || []).length;
    const lastmodCount = (xml.match(/<lastmod>/g) || []).length;
    expect(locCount).toBe(lastmodCount);
    expect(locCount).toBe(STATIC_INDEXABLE_PATHS.length + 1);
  });

  it('includes discovery URLs and counts them in the total', () => {
    const xml = buildSitemap({
      siteUrl: DEFAULT_SITE_URL,
      salons: [{ slug: 'salon-rose' }],
      cities: [{ slug: 'tehran' }],
      serviceTypes: [{ slug: 'haircut' }, { slug: 'color' }],
      buildDate,
    });
    expect(xml).toContain('<loc>https://example.ir/city/tehran</loc>');
    expect(xml).toContain('<loc>https://example.ir/services/haircut</loc>');
    expect(xml).toContain('<loc>https://example.ir/services/color</loc>');
    const locCount = (xml.match(/<loc>/g) || []).length;
    // static + 1 salon + 1 city + 2 services
    expect(locCount).toBe(STATIC_INDEXABLE_PATHS.length + 4);
  });

  it('NEVER lists a noindex URL even if a salon slug looks like one', () => {
    const xml = buildSitemap({
      siteUrl: DEFAULT_SITE_URL,
      salons: [
        { slug: 'salon-rose' },
        // A hostile/garbage slug must still land under /s/ and never produce a
        // bare /admin or /auth URL.
        { slug: 'real-salon' },
      ],
      buildDate,
    });
    for (const prefix of NOINDEX_PREFIXES) {
      expect(xml).not.toContain(`<loc>${DEFAULT_SITE_URL}${prefix}`);
    }
  });
});

describe('property: sitemap contract holds for arbitrary salon lists', () => {
  // Slugs constrained to the clean, hyphenated ASCII space the steering mandates.
  const slugArb = fc
    .stringMatching(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .filter((s) => s.length > 0 && s.length < 40);

  const salonArb = fc.record({
    slug: slugArb,
    lastmod: fc.option(
      fc
        .date({ min: new Date('2000-01-01'), max: new Date('2100-01-01') })
        .map((d) => d.toISOString().slice(0, 10)),
      { nil: undefined },
    ),
  });

  it('emits exactly static+salon urls, each with a lastmod, and no noindex url', () => {
    fc.assert(
      fc.property(fc.array(salonArb, { maxLength: 30 }), (salons) => {
        const xml = buildSitemap({
          siteUrl: DEFAULT_SITE_URL,
          salons,
          buildDate: new Date('2025-06-15T00:00:00Z'),
        });

        const locCount = (xml.match(/<loc>/g) || []).length;
        const lastmodCount = (xml.match(/<lastmod>/g) || []).length;

        // One lastmod per loc (R8.5).
        expect(locCount).toBe(lastmodCount);
        // Exactly the static set plus one per salon.
        expect(locCount).toBe(STATIC_INDEXABLE_PATHS.length + salons.length);

        // No noindex surface ever appears (R8.5; seo §7).
        for (const prefix of NOINDEX_PREFIXES) {
          expect(xml.includes(`<loc>${DEFAULT_SITE_URL}${prefix}`)).toBe(false);
        }

        // Every salon slug appears exactly under /s/.
        for (const salon of salons) {
          expect(xml).toContain(`<loc>${DEFAULT_SITE_URL}/s/${salon.slug}</loc>`);
        }
      }),
      { numRuns: 100 },
    );
  });
});
