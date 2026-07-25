import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
// @ts-expect-error — plain ESM build script, no type declarations.
import {
  DEFAULT_SITE_URL,
  STATIC_INDEXABLE_PATHS,
  SITE_NAME,
  pageTitle,
  escapeHtml,
  serializeJsonLd,
  slugToName,
  homeJsonLd,
  salonJsonLd,
  buildRoutes,
  renderHeadTags,
  renderBody,
  injectIntoTemplate,
  SERVER_REWRITE_NOTE,
} from '../prerender.mjs';

/**
 * Tests for the public-route prerender / SSG build step (task 4.4; seo §8;
 * R9.1, R9.2).
 *
 * The governing standard requires that the public, indexable routes (`/`, the
 * legal pages, and every `/s/:slug`) deliver their **content + meta + JSON-LD
 * in the initial HTML** — without running app JS. These tests pin that contract
 * on the pure string-building core (so View Source would see the same output)
 * and confirm the route set matches the sitemap's indexability map exactly,
 * while the noindex app/admin/funnel routes are never prerendered.
 */

/** The full set of noindex path prefixes from the SEO indexability map. */
const NOINDEX_PREFIXES = [
  '/auth',
  '/admin/',
  '/booking/',
  '/qr/',
  '/api/',
  '/salon/',
];

/** A minimal stand-in for the Vite-built dist/index.html template. */
const TEMPLATE = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>سامانه رزرو سالن</title>
  <script type="module" crossorigin src="/assets/index-abc.js"></script>
  <link rel="stylesheet" crossorigin href="/assets/index-def.css">
</head>
<body>
  <div id="root"></div>
</body>
</html>`;

describe('title + escaping helpers', () => {
  it('builds the «{صفحه} | آرا» title template', () => {
    expect(pageTitle('درباره ما')).toBe('درباره ما | آرا');
  });

  it('falls back to the bare site name when no page name', () => {
    expect(pageTitle('')).toBe(SITE_NAME);
    expect(pageTitle('   ')).toBe(SITE_NAME);
    expect(pageTitle(null)).toBe(SITE_NAME);
  });

  it('escapes HTML-significant characters', () => {
    expect(escapeHtml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f');
  });

  it('escapes JSON-LD so it cannot break out of <script>', () => {
    const out = serializeJsonLd({ '@type': 'X', name: '</script><b>' });
    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c');
  });

  it('humanizes a slug into a display name', () => {
    expect(slugToName('salon-rose')).toBe('Salon Rose');
    expect(slugToName('salon-noor-vip')).toBe('Salon Noor Vip');
  });
});

describe('JSON-LD builders (seo §5)', () => {
  it('home emits WebSite + Organization', () => {
    const nodes = homeJsonLd(DEFAULT_SITE_URL);
    const types = nodes.map((n) => n['@type']);
    expect(types).toContain('WebSite');
    expect(types).toContain('Organization');
    for (const n of nodes) expect(n['@context']).toBe('https://schema.org');
  });

  it('salon emits BeautySalon + BreadcrumbList, never fabricating address/geo', () => {
    const nodes = salonJsonLd({ slug: 'salon-rose' }, DEFAULT_SITE_URL);
    const beauty = nodes.find((n) => n['@type'] === 'BeautySalon');
    const crumb = nodes.find((n) => n['@type'] === 'BreadcrumbList');
    expect(beauty.url).toBe(`${DEFAULT_SITE_URL}/s/salon-rose`);
    expect(beauty.address).toBeUndefined();
    expect(beauty.geo).toBeUndefined();
    expect(crumb.itemListElement).toHaveLength(2);
  });

  it('salon emits one Service node per offering with IRR pricing', () => {
    const nodes = salonJsonLd(
      {
        slug: 'salon-rose',
        name: 'سالن رز',
        services: [{ name: 'کوتاهی مو', price: 2500000 }],
      },
      DEFAULT_SITE_URL,
    );
    const service = nodes.find((n) => n['@type'] === 'Service');
    expect(service.name).toBe('کوتاهی مو');
    expect(service.offers.priceCurrency).toBe('IRR');
    expect(service.offers.price).toBe('2500000');
  });
});

describe('buildRoutes', () => {
  it('prerenders exactly the static indexable paths plus one per salon', () => {
    const routes = buildRoutes({
      siteUrl: DEFAULT_SITE_URL,
      salons: [{ slug: 'salon-rose' }, { slug: 'salon-noor' }],
    });
    expect(routes).toHaveLength(STATIC_INDEXABLE_PATHS.length + 2);
    const paths = routes.map((r) => r.path);
    for (const p of STATIC_INDEXABLE_PATHS) expect(paths).toContain(p);
    expect(paths).toContain('/s/salon-rose');
    expect(paths).toContain('/s/salon-noor');
  });

  it('maps each route to a clean directory-index output path', () => {
    const routes = buildRoutes({
      siteUrl: DEFAULT_SITE_URL,
      salons: [{ slug: 'salon-rose' }],
    });
    const byPath = Object.fromEntries(routes.map((r) => [r.path, r.outputPath]));
    expect(byPath['/']).toBe('index.html');
    expect(byPath['/about']).toBe('about/index.html');
    expect(byPath['/s/salon-rose']).toBe('s/salon-rose/index.html');
  });

  it('skips salons with missing/blank slugs', () => {
    const routes = buildRoutes({
      siteUrl: DEFAULT_SITE_URL,
      salons: [{ slug: '' }, { slug: '  ' }, {}, null, { slug: 'ok' }],
    });
    const salonRoutes = routes.filter((r) => r.path.startsWith('/s/'));
    expect(salonRoutes).toHaveLength(1);
    expect(salonRoutes[0].path).toBe('/s/ok');
  });

  it('prerenders /city/:slug and /services/:slug discovery routes', () => {
    const routes = buildRoutes({
      siteUrl: DEFAULT_SITE_URL,
      cities: [{ slug: 'tehran', name: 'تهران' }],
      serviceTypes: [{ slug: 'haircut', name: 'کوتاهی مو' }],
    });
    const byPath = Object.fromEntries(routes.map((r) => [r.path, r]));
    expect(byPath['/city/tehran'].outputPath).toBe('city/tehran/index.html');
    expect(byPath['/services/haircut'].outputPath).toBe(
      'services/haircut/index.html',
    );
    // Each discovery route carries a BreadcrumbList in its JSON-LD.
    expect(byPath['/city/tehran'].jsonLd.map((n) => n['@type'])).toContain(
      'BreadcrumbList',
    );
    expect(byPath['/services/haircut'].jsonLd.map((n) => n['@type'])).toContain(
      'BreadcrumbList',
    );
  });

  it('skips discovery entries with missing/blank slugs', () => {
    const routes = buildRoutes({
      siteUrl: DEFAULT_SITE_URL,
      cities: [{ slug: '' }, { slug: '  ' }, {}, null, { slug: 'ok-city' }],
      serviceTypes: [{ slug: '' }, { slug: 'ok-service' }],
    });
    expect(routes.filter((r) => r.path.startsWith('/city/'))).toHaveLength(1);
    expect(routes.filter((r) => r.path.startsWith('/services/'))).toHaveLength(1);
  });

  it('never produces a route for a noindex surface', () => {
    const routes = buildRoutes({ siteUrl: DEFAULT_SITE_URL, salons: [] });
    for (const r of routes) {
      for (const prefix of NOINDEX_PREFIXES) {
        expect(r.path.startsWith(prefix)).toBe(false);
      }
    }
  });
});

describe('renderHeadTags (initial-HTML meta — seo §3/§4/§6)', () => {
  it('emits index,follow, canonical, hreflang and OG for an indexable page', () => {
    const [home] = buildRoutes({ siteUrl: DEFAULT_SITE_URL, salons: [] });
    const head = renderHeadTags(home, DEFAULT_SITE_URL);
    expect(head).toContain('<meta name="robots" content="index,follow" />');
    expect(head).toContain(`<link rel="canonical" href="${DEFAULT_SITE_URL}" />`);
    expect(head).toContain('hreflang="fa"');
    expect(head).toContain('hreflang="fa-IR"');
    expect(head).toContain('hreflang="x-default"');
    expect(head).toContain('property="og:locale" content="fa_IR"');
    expect(head).toContain('name="twitter:card" content="summary_large_image"');
  });

  it('inlines the route JSON-LD scripts', () => {
    const [home] = buildRoutes({ siteUrl: DEFAULT_SITE_URL, salons: [] });
    const head = renderHeadTags(home, DEFAULT_SITE_URL);
    expect(head).toContain('application/ld+json');
    expect(head).toContain('"@type":"WebSite"');
  });
});

describe('renderBody (semantic SEO scaffold — seo §2/§8)', () => {
  it('renders exactly one <h1> with the heading and the description', () => {
    const salonRoute = buildRoutes({
      siteUrl: DEFAULT_SITE_URL,
      salons: [{ slug: 'salon-rose', name: 'سالن رز' }],
    }).find((r) => r.path === '/s/salon-rose');
    const body = renderBody(salonRoute);
    expect((body.match(/<h1>/g) || []).length).toBe(1);
    expect(body).toContain('سالن رز');
    expect(body).toContain('<main id="main-content">');
  });
});

describe('injectIntoTemplate (full prerendered document)', () => {
  it('replaces the title, injects head tags, and fills #root with content', () => {
    const [home] = buildRoutes({ siteUrl: DEFAULT_SITE_URL, salons: [] });
    const html = injectIntoTemplate(TEMPLATE, home, DEFAULT_SITE_URL);

    // Title swapped to the templated page title.
    expect(html).toContain(`<title>${pageTitle(home.title)}</title>`);
    expect(html).not.toContain('<title>سامانه رزرو سالن</title>');

    // Head SEO present in the initial HTML.
    expect(html).toContain('<meta name="robots" content="index,follow" />');
    expect(html).toContain('application/ld+json');

    // #root carries real content (not empty) — View Source would see it.
    expect(html).not.toContain('<div id="root"></div>');
    expect(html).toContain('<h1>');

    // The Vite-built asset + CSS tags are preserved verbatim.
    expect(html).toContain('/assets/index-abc.js');
    expect(html).toContain('/assets/index-def.css');

    // Document contract preserved (seo §2).
    expect(html).toContain('lang="fa"');
    expect(html).toContain('dir="rtl"');
  });

  it('is idempotent-safe: reusing the pristine template never double-injects', () => {
    const routes = buildRoutes({
      siteUrl: DEFAULT_SITE_URL,
      salons: [{ slug: 'salon-rose' }],
    });
    for (const r of routes) {
      const html = injectIntoTemplate(TEMPLATE, r, DEFAULT_SITE_URL);
      expect((html.match(/<meta name="robots"/g) || []).length).toBe(1);
      expect((html.match(/id="root"/g) || []).length).toBe(1);
    }
  });
});

describe('server rewrite / host-fallback note (seo §7/§8)', () => {
  it('documents the deep-link rewrite for deployment', () => {
    expect(SERVER_REWRITE_NOTE).toMatch(/try_files/);
    expect(SERVER_REWRITE_NOTE).toMatch(/index\.html/);
    expect(SERVER_REWRITE_NOTE.toLowerCase()).toMatch(/canonical host/);
  });
});

describe('property: prerender contract holds for arbitrary salon lists', () => {
  const slugArb = fc
    .stringMatching(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .filter((s) => s.length > 0 && s.length < 40);

  const salonArb = fc.record({
    slug: slugArb,
    name: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  });

  it('every prerendered page is index,follow, has one <h1>, valid JSON-LD, and no noindex route', () => {
    fc.assert(
      fc.property(fc.array(salonArb, { maxLength: 25 }), (salons) => {
        const routes = buildRoutes({ siteUrl: DEFAULT_SITE_URL, salons });

        // Exactly the static set plus one per (valid) salon.
        expect(routes).toHaveLength(STATIC_INDEXABLE_PATHS.length + salons.length);

        for (const route of routes) {
          // No prerendered route is ever a noindex surface (R9.1/9.2).
          for (const prefix of NOINDEX_PREFIXES) {
            expect(route.path.startsWith(prefix)).toBe(false);
          }

          const html = injectIntoTemplate(TEMPLATE, route, DEFAULT_SITE_URL);

          // index,follow in the initial HTML.
          expect(html).toContain('<meta name="robots" content="index,follow" />');
          // Self-referencing absolute canonical.
          expect(html).toContain(
            `<link rel="canonical" href="${route.canonical}" />`,
          );
          // Exactly one <h1>; content present in #root.
          expect((html.match(/<h1>/g) || []).length).toBe(1);
          expect(html).not.toContain('<div id="root"></div>');

          // Every JSON-LD node is parseable (after unescaping the script guard).
          for (const node of route.jsonLd) {
            const json = serializeJsonLd(node)
              .replace(/\\u003c/g, '<')
              .replace(/\\u003e/g, '>')
              .replace(/\\u0026/g, '&');
            expect(() => JSON.parse(json)).not.toThrow();
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
