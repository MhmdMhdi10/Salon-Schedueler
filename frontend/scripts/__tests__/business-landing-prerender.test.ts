import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain ESM build script, no type declarations.
import {
  DEFAULT_SITE_URL,
  STATIC_INDEXABLE_PATHS,
  pageTitle,
  buildRoutes,
  renderHeadTags,
  renderBody,
  injectIntoTemplate,
} from '../prerender.mjs';
// @ts-expect-error — plain ESM build script, no type declarations.
import { absoluteUrl } from '../generate-sitemap.mjs';

/**
 * Focused SEO/prerender tests for the owner-acquisition launch home `/`
 * (task 6.2; R5.4).
 *
 * Task 6.1 built the landing component (`src/pages/BusinessLanding.tsx`) and
 * registered the route in the prerender / sitemap source of truth. The
 * component-level CTA routing + indexability are already pinned by
 * `src/pages/__tests__/BusinessLanding.test.tsx`. These tests pin the **other
 * half** of the split-rendering strategy (seo §8): that the *prerendered*
 * `/` HTML — what `View Source` shows without running app JS — carries
 * the indexable head, the WebSite + Organization JSON-LD, and the crawlable
 * owner CTA links, all in the **initial HTML** (R5.4).
 *
 * The set of noindex path prefixes from the SEO indexability map (seo §1).
 */
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

/** Resolves the launch-home route descriptor from the prerender source. */
function businessRoute() {
  const route = buildRoutes({ siteUrl: DEFAULT_SITE_URL, salons: [] }).find(
    (r: { path: string }) => r.path === '/',
  );
  if (!route) throw new Error('/ route missing from buildRoutes');
  return route;
}

describe('business landing — sitemap inclusion (R5.4; seo §1/§7)', () => {
  it('lists / and not /business in STATIC_INDEXABLE_PATHS', () => {
    expect(STATIC_INDEXABLE_PATHS).toContain('/');
    expect(STATIC_INDEXABLE_PATHS).not.toContain('/business');
  });

  it('emits the business home at the root index', () => {
    const route = businessRoute();
    expect(route.outputPath).toBe('index.html');
    expect(route.canonical).toBe(absoluteUrl(DEFAULT_SITE_URL, '/'));
  });

  it('never treats / as a noindex surface', () => {
    for (const prefix of NOINDEX_PREFIXES) {
      expect('/'.startsWith(prefix)).toBe(false);
    }
  });
});

describe('business landing — indexable head in initial HTML (R5.4; seo §3/§4/§6)', () => {
  it('renders robots index,follow + a self-referencing root canonical', () => {
    const route = businessRoute();
    const head = renderHeadTags(route, DEFAULT_SITE_URL);
    const canonical = absoluteUrl(DEFAULT_SITE_URL, '/');
    expect(head).toContain('<meta data-prerender name="robots" content="index,follow" />');
    expect(head).toContain(`<link data-prerender rel="canonical" href="${canonical}" />`);
    expect(head).toContain(`hreflang="fa" href="${canonical}"`);
    expect(head).toContain(`hreflang="fa-IR" href="${canonical}"`);
    expect(head).toContain('hreflang="x-default"');
  });

  it('renders the OG + Twitter card set for the landing', () => {
    const route = businessRoute();
    const head = renderHeadTags(route, DEFAULT_SITE_URL);
    const canonical = absoluteUrl(DEFAULT_SITE_URL, '/');
    const fullTitle = pageTitle(route.title);
    expect(head).toContain('property="og:type" content="website"');
    expect(head).toContain('property="og:locale" content="fa_IR"');
    expect(head).toContain(`property="og:title" content="${fullTitle}"`);
    expect(head).toContain(`property="og:url" content="${canonical}"`);
    expect(head).toContain('property="og:image"');
    expect(head).toContain('name="twitter:card" content="summary_large_image"');
    expect(head).toContain(`name="twitter:title" content="${fullTitle}"`);
  });

  it('injects the unique title + head + body content into the full document', () => {
    const route = businessRoute();
    const html = injectIntoTemplate(TEMPLATE, route, DEFAULT_SITE_URL);
    const fullTitle = pageTitle(route.title);

    // Unique, templated «{صفحه} | آرا» title swapped in.
    expect(html).toContain(`<title>${fullTitle}</title>`);
    expect(html).not.toContain('<title>سامانه رزرو سالن</title>');

    // Robots + canonical present in the initial HTML (View Source parity).
    expect(html).toContain('<meta data-prerender name="robots" content="index,follow" />');
    expect(html).toContain(
      `<link data-prerender rel="canonical" href="${absoluteUrl(DEFAULT_SITE_URL, '/')}" />`,
    );

    // #root carries real content (one <h1>, not empty) without running app JS.
    expect(html).not.toContain('<div id="root"></div>');
    expect((html.match(/<h1>/g) || []).length).toBe(1);

    // dir/lang contract preserved; built asset tags carried through verbatim.
    expect(html).toContain('lang="fa"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('/assets/index-abc.js');
    expect(html).toContain('/assets/index-def.css');
  });
});

describe('business landing — WebSite + Organization JSON-LD (R5.4; seo §5)', () => {
  it('emits both WebSite and Organization nodes on the route descriptor', () => {
    const route = businessRoute();
    const types = route.jsonLd.map((n: { '@type': string }) => n['@type']);
    expect(types).toContain('WebSite');
    expect(types).toContain('Organization');
    for (const node of route.jsonLd) {
      expect(node['@context']).toBe('https://schema.org');
    }
  });

  it('inlines parseable JSON-LD <script> tags in the prerendered head', () => {
    const route = businessRoute();
    const head = renderHeadTags(route, DEFAULT_SITE_URL);
    const matches = head.match(
      /<script data-prerender type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    );
    expect(matches).not.toBeNull();
    expect((matches || []).length).toBe(2);
    expect(head).toContain('"@type":"WebSite"');
    expect(head).toContain('"@type":"Organization"');
  });
});

describe('business landing — crawlable CTA routing in prerendered HTML', () => {
  it('exposes owner registration without marketplace search links', () => {
    const route = businessRoute();
    const hrefs = route.links.map((l: { href: string }) => l.href);
    expect(hrefs).toContain('/business/register');
    expect(hrefs).not.toContain('/search');
  });

  it('renders owner registration without marketplace anchors in the prerendered body', () => {
    const route = businessRoute();
    const body = renderBody(route);
    expect(body).toContain('href="/business/register"');
    expect(body).not.toContain('href="/search"');
  });

  it('includes owner registration without marketplace anchors in the full document', () => {
    const route = businessRoute();
    const html = injectIntoTemplate(TEMPLATE, route, DEFAULT_SITE_URL);
    expect(html).toContain('href="/business/register"');
    expect(html).not.toContain('href="/search"');
  });
});
