/**
 * Build-time public-route prerender / static-site-generation step
 * (task 4.4; seo §8 "Rendering strategy"; R9.1, R9.2).
 *
 * ## What this does
 *
 * The authenticated app stays a pure client-rendered SPA (auth / booking funnel
 * / admin) — those routes need no indexing and already emit `noindex,follow`
 * via the client `<SeoHead>` (task 4.2). This step does the *other* half of the
 * split strategy: it writes **static HTML for the public, indexable routes** so
 * that crawlers (and the first paint) get the page's content, `<head>` metadata
 * (title / description / canonical / OG / Twitter / hreflang), and JSON-LD
 * structured data **in the initial HTML response — without running app JS**
 * (verify with View Source, not just DevTools — seo §8).
 *
 * The set of prerendered routes mirrors the SEO indexability map and the
 * sitemap exactly (single source of truth — see `generate-sitemap.mjs`):
 *
 *   - `/`                              marketing home  (WebSite + Organization)
 *   - `/about` `/contact` `/privacy` `/terms`   trust / legal pages
 *   - `/s/:slug`                       public salon profiles, one per build-time
 *                                      slug in `scripts/salons.json`
 *                                      (BeautySalon + Service + BreadcrumbList)
 *
 * It runs **after** `vite build` (see the npm `build` script): it reads the
 * freshly built `dist/index.html` as a template (so the hashed asset/CSS/font
 * tags Vite injected are carried into every prerendered page verbatim — they
 * are absolute `/assets/…` URLs that resolve from any nested route directory),
 * then writes one HTML file per route:
 *
 *   `/`            → `dist/index.html`           (overwrites the SPA template)
 *   `/about`       → `dist/about/index.html`
 *   `/s/salon-rose`→ `dist/s/salon-rose/index.html`
 *
 * The core string-building functions are pure and exported so they can be unit-
 * and property-tested without touching the filesystem (see
 * `scripts/__tests__/prerender.test.ts`). Running this module directly
 * (`node scripts/prerender.mjs`) performs the filesystem write.
 *
 * ## Server rewrite / host-fallback note for deep links (seo §7, §8) ── IMPORTANT
 *
 * Because routing is client-side History-API (`BrowserRouter`), a deep link to
 * a public URL must return the **matching prerendered HTML**, not the SPA
 * `index.html` 404. Configure the static host / CDN so that:
 *
 *   1. An exact file match wins: a request for `/s/salon-rose` serves
 *      `dist/s/salon-rose/index.html`, `/about` serves `dist/about/index.html`,
 *      etc. (Most hosts do this automatically via "clean URLs" / `index.html`
 *      directory resolution — e.g. Nginx `try_files $uri $uri/ /index.html;`,
 *      Netlify/Vercel pretty-URL rewrites, S3+CloudFront with a Function that
 *      appends `/index.html`.)
 *   2. The SPA fallback (`/index.html`) is used **only** for the
 *      non-prerendered app routes (auth, QR landings, the `/salon/.../book`
 *      funnel steps, `/booking/...`, and `/admin/...`). Those serve the home
 *      template until React mounts; their client `<SeoHead>` immediately
 *      asserts `noindex,follow`, so they stay out of the index even when
 *      reached via the fallback.
 *   3. Pick a single canonical host (apex *or* `www`) and 301 the other, so the
 *      absolute canonicals emitted here always resolve to a 200 (seo §3, §7).
 *
 * See the example Nginx/Caddy snippets exported as {@link SERVER_REWRITE_NOTE}
 * so the deployment config can reuse them verbatim.
 *
 * ## Honest caveat (seo §8)
 *
 * Prerendering needs a **build-time list of salon slugs**; a salon added after
 * the build is not indexable until the next rebuild. Mitigate with scheduled
 * rebuilds / incremental regeneration, or graduate `/s/:slug` to SSR
 * (React Router v7 framework mode) if profiles change frequently — at the cost
 * of running a Node server. The body content written here is a semantic SEO
 * scaffold (real `<h1>` / landmarks / links + valid JSON-LD); as the public
 * page components land (tasks 5.1–5.3) this step can be upgraded to render them
 * with `renderToString` for pixel-parity, with no change to the routing or the
 * head/JSON-LD contract pinned by the tests.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_SITE_URL,
  STATIC_INDEXABLE_PATHS,
  resolveSiteUrl,
  absoluteUrl,
  salonPath,
  cityPath,
  servicePath,
  readSalons,
  readDiscovery,
} from './generate-sitemap.mjs';

export { DEFAULT_SITE_URL, STATIC_INDEXABLE_PATHS };

/** Brand/site name — the right-hand side of the title template (seo §3). */
export const SITE_NAME = 'رزرو سالن';

/** Declared content locale (seo §6). */
export const OG_LOCALE = 'fa_IR';

/** Branded default Open Graph image (1200×630, seo §4), relative to the host. */
export const DEFAULT_OG_IMAGE_PATH = '/og/default.jpg';

/** Builds the «{صفحه} | رزرو سالن» title, or the bare site name when no page name. */
export function pageTitle(name) {
  const trimmed = name == null ? '' : String(name).trim();
  return trimmed === '' ? SITE_NAME : `${trimmed} | ${SITE_NAME}`;
}

/** Escapes the five XML/HTML-significant characters for safe text/attribute output. */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Serializes a JSON-LD node to a string safe to embed inside `<script>` — the
 * same escaping the client `<JsonLd>` component uses so the markup can never
 * break out of the script element.
 */
export function serializeJsonLd(node) {
  return JSON.stringify(node)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** Turns an ASCII salon slug ("salon-rose") into a human display name ("Salon Rose"). */
export function slugToName(slug) {
  return String(slug)
    .trim()
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Persian display copy for the static, indexable routes (home + legal/trust). */
const STATIC_ROUTE_CONTENT = {
  '/': {
    title: 'رزرو آنلاین نوبت سالن‌های زیبایی',
    heading: 'رزرو آنلاین نوبت سالن‌های زیبایی',
    description:
      'به‌سادگی نوبت کوتاهی، رنگ و میکاپ را در بهترین سالن‌های زیبایی شهر آنلاین رزرو کنید؛ انتخاب خدمت، تاریخ و زمان تنها در چند ثانیه.',
  },
  '/business': {
    title: 'پلتفرم مدیریت و رزرو آنلاین برای صاحبان سالن زیبایی',
    heading: 'سالن خود را آنلاین کنید و نوبت‌ها را هوشمند مدیریت کنید',
    description:
      'با رزرو سالن، نوبت‌دهی آنلاین، تقویم، یادآوری پیامک و ربات، و گزارش‌های مدیریتی را یک‌جا داشته باشید؛ همین حالا با دورهٔ آزمایشی رایگان شروع کنید.',
  },
  '/about': {
    title: 'درباره ما',
    heading: 'درباره رزرو سالن',
    description:
      'رزرو سالن، سامانه آنلاین رزرو نوبت سالن‌های زیبایی در ایران است؛ ساده، سریع و قابل اعتماد برای مشتریان و صاحبان سالن.',
  },
  '/contact': {
    title: 'تماس با ما',
    heading: 'تماس با ما',
    description:
      'برای پشتیبانی، همکاری یا افزودن سالن خود به رزرو سالن با ما در ارتباط باشید.',
  },
  '/privacy': {
    title: 'حریم خصوصی',
    heading: 'سیاست حریم خصوصی',
    description:
      'نحوه گردآوری، نگه‌داری و محافظت از اطلاعات کاربران در سامانه رزرو سالن.',
  },
  '/terms': {
    title: 'قوانین و مقررات',
    heading: 'قوانین و مقررات',
    description:
      'شرایط استفاده از سامانه رزرو سالن برای مشتریان و صاحبان سالن‌های زیبایی.',
  },
};

/** Site-wide `Organization` + `WebSite` JSON-LD for the marketing home (seo §5). */
export function homeJsonLd(siteUrl) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: siteUrl,
      inLanguage: 'fa-IR',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: siteUrl,
    },
  ];
}

/**
 * `BeautySalon` + `BreadcrumbList` (+ `Service` per offering when present)
 * JSON-LD for a salon profile (seo §5). Only fields actually known at build
 * time are emitted — we never fabricate address/geo/reviews (seo §5 honesty
 * rule); richer markup arrives with the real profile data (task 5.2).
 */
export function salonJsonLd(salon, siteUrl) {
  const name = salon.name || slugToName(salon.slug);
  const url = absoluteUrl(siteUrl, salonPath(salon.slug));

  const beautySalon = {
    '@context': 'https://schema.org',
    '@type': 'BeautySalon',
    name,
    url,
  };
  if (salon.image) beautySalon.image = salon.image;
  if (salon.telephone) beautySalon.telephone = salon.telephone;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'خانه', item: siteUrl },
      { '@type': 'ListItem', position: 2, name, item: url },
    ],
  };

  const nodes = [beautySalon, breadcrumb];

  if (Array.isArray(salon.services)) {
    for (const service of salon.services) {
      if (!service || typeof service.name !== 'string') continue;
      const node = {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: service.name,
        provider: { '@type': 'BeautySalon', name },
      };
      if (service.price != null) {
        node.offers = {
          '@type': 'Offer',
          price: String(service.price),
          priceCurrency: 'IRR',
        };
      }
      nodes.push(node);
    }
  }

  return nodes;
}

/**
 * `BreadcrumbList` JSON-LD for a discovery page (خانه ‹ this page), mirroring
 * the visible breadcrumb (seo §5). The matching salons carry their own
 * `BeautySalon`/`Service` markup on their profile pages, so the discovery page
 * never duplicates (or fabricates) it.
 */
export function discoveryJsonLd(name, path, siteUrl) {
  const url = absoluteUrl(siteUrl, path);
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'خانه', item: siteUrl },
        { '@type': 'ListItem', position: 2, name, item: url },
      ],
    },
  ];
}

/**
 * Builds the full descriptor for every prerendered route from the static set
 * plus the salon list and the discovery list (cities + service types):
 * `{ path, outputPath, title, description, heading, canonical, ogType, jsonLd,
 * links }`.
 */
export function buildRoutes({ siteUrl, salons = [], cities = [], serviceTypes = [] }) {
  const routes = STATIC_INDEXABLE_PATHS.map((path) => {
    const content = STATIC_ROUTE_CONTENT[path];
    const isHome = path === '/';
    const isBusiness = path === '/business';
    return {
      path,
      outputPath: path === '/' ? 'index.html' : `${path.replace(/^\//, '')}/index.html`,
      title: content.title,
      heading: content.heading,
      description: content.description,
      canonical: absoluteUrl(siteUrl, path),
      ogType: 'website',
      // Both the marketing home and the owner-acquisition landing carry the
      // site-wide WebSite + Organization structured data (seo §5).
      jsonLd: isHome || isBusiness ? homeJsonLd(siteUrl) : [],
      // Home links out to the legal/trust pages for crawlable internal linking;
      // the landing links to owner sign-up + the booking entry + back home.
      links: isHome
        ? [
            { href: '/about', text: 'درباره ما' },
            { href: '/contact', text: 'تماس با ما' },
            { href: '/privacy', text: 'حریم خصوصی' },
            { href: '/terms', text: 'قوانین و مقررات' },
          ]
        : isBusiness
          ? [
              { href: '/owner', text: 'ثبت‌نام صاحب سالن' },
              { href: '/', text: 'رزرو نوبت به‌عنوان مشتری' },
            ]
          : [{ href: '/', text: 'بازگشت به خانه' }],
    };
  });

  const salonRoutes = salons
    .filter((s) => s && typeof s.slug === 'string' && s.slug.trim() !== '')
    .map((salon) => {
      const slug = salon.slug.trim();
      const name = salon.name || slugToName(slug);
      const path = salonPath(slug);
      return {
        path,
        outputPath: `s/${slug}/index.html`,
        title: name,
        heading: name,
        description:
          salon.description ||
          `رزرو آنلاین نوبت خدمات زیبایی در ${name} — انتخاب خدمت، تاریخ و زمان به‌صورت آنلاین.`,
        canonical: absoluteUrl(siteUrl, path),
        ogType: 'business.business',
        jsonLd: salonJsonLd(salon, siteUrl),
        links: [{ href: '/', text: 'بازگشت به خانه' }],
      };
    });

  const cityRoutes = cities
    .filter((c) => c && typeof c.slug === 'string' && c.slug.trim() !== '')
    .map((city) => {
      const slug = city.slug.trim();
      const name = city.name || slugToName(slug);
      const path = cityPath(slug);
      const heading = `سالن‌های زیبایی در ${name}`;
      return {
        path,
        outputPath: `city/${slug}/index.html`,
        title: heading,
        heading,
        description:
          city.description ||
          `بهترین سالن‌های زیبایی ${name} را پیدا کنید و نوبت کوتاهی، رنگ و میکاپ را آنلاین رزرو کنید.`,
        canonical: absoluteUrl(siteUrl, path),
        ogType: 'website',
        jsonLd: discoveryJsonLd(heading, path, siteUrl),
        links: [{ href: '/', text: 'بازگشت به خانه' }],
      };
    });

  const serviceRoutes = serviceTypes
    .filter((s) => s && typeof s.slug === 'string' && s.slug.trim() !== '')
    .map((service) => {
      const slug = service.slug.trim();
      const name = service.name || slugToName(slug);
      const path = servicePath(slug);
      const heading = `${name} در سالن‌های زیبایی`;
      return {
        path,
        outputPath: `services/${slug}/index.html`,
        title: heading,
        heading,
        description:
          service.description ||
          `سالن‌های ${name} را با قیمت و زمان شفاف مقایسه کنید و نوبت دلخواهتان را آنلاین رزرو کنید.`,
        canonical: absoluteUrl(siteUrl, path),
        ogType: 'website',
        jsonLd: discoveryJsonLd(heading, path, siteUrl),
        links: [{ href: '/', text: 'بازگشت به خانه' }],
      };
    });

  return [...routes, ...salonRoutes, ...cityRoutes, ...serviceRoutes];
}

/**
 * Renders the `<head>` SEO tags for a route (everything the crawler must see in
 * the initial HTML): canonical, robots `index,follow`, hreflang self-reference
 * + `x-default`, and the Open Graph / Twitter card set (seo §3, §4, §6). Title
 * is handled separately by template substitution.
 */
export function renderHeadTags(route, siteUrl) {
  const fullTitle = pageTitle(route.title);
  const image = `${siteUrl}${DEFAULT_OG_IMAGE_PATH}`;
  const c = route.canonical;
  const lines = [
    `<meta name="description" content="${escapeHtml(route.description)}" />`,
    `<meta name="robots" content="index,follow" />`,
    `<link rel="canonical" href="${escapeHtml(c)}" />`,
    `<link rel="alternate" hreflang="fa" href="${escapeHtml(c)}" />`,
    `<link rel="alternate" hreflang="fa-IR" href="${escapeHtml(c)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(siteUrl)}" />`,
    `<meta property="og:type" content="${escapeHtml(route.ogType)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:locale" content="${OG_LOCALE}" />`,
    `<meta property="og:title" content="${escapeHtml(fullTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(route.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(c)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(fullTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(route.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ];
  for (const node of route.jsonLd) {
    lines.push(
      `<script type="application/ld+json">${serializeJsonLd(node)}</script>`,
    );
  }
  return lines.map((l) => `  ${l}`).join('\n');
}

/**
 * Renders the in-`#root` body content: a semantic SEO scaffold with a single
 * `<h1>`, the description, and crawlable internal links inside the existing
 * `header`/`main`/`footer` landmark contract. React replaces this on mount; it
 * exists so View Source / non-JS crawlers see real content (seo §2, §8).
 */
export function renderBody(route) {
  const linkItems = route.links
    .map(
      (l) =>
        `        <li><a href="${escapeHtml(l.href)}">${escapeHtml(l.text)}</a></li>`,
    )
    .join('\n');
  return [
    '<div class="prerender-content">',
    '      <main id="main-content">',
    `        <h1>${escapeHtml(route.heading)}</h1>`,
    `        <p>${escapeHtml(route.description)}</p>`,
    '        <nav aria-label="پیوندها"><ul>',
    linkItems,
    '        </ul></nav>',
    '      </main>',
    '    </div>',
  ].join('\n');
}

/**
 * Injects a route's title, head tags, and body content into the built Vite HTML
 * template. Pure: returns the new HTML string, leaving the template untouched.
 */
export function injectIntoTemplate(template, route, siteUrl) {
  const fullTitle = pageTitle(route.title);

  // Use function replacers (not replacement strings): the injected title/head/
  // body can contain `$` sequences (e.g. an escaped `&lt;` preceded by `$`),
  // and `String.replace` would otherwise interpret `$&`/`$<name>` as special
  // patterns and corrupt the output (re-inserting the matched text).
  let html = template.replace(
    /<title>[\s\S]*?<\/title>/,
    () => `<title>${escapeHtml(fullTitle)}</title>`,
  );

  const headTags = renderHeadTags(route, siteUrl);
  html = html.replace(/<\/head>/, () => `${headTags}\n</head>`);

  const body = renderBody(route);
  html = html.replace(
    /<div id="root">\s*<\/div>/,
    () => `<div id="root">${body}</div>`,
  );

  return html;
}

/** Example server config the deployment can reuse for the deep-link rewrite. */
export const SERVER_REWRITE_NOTE = `# Deep-link rewrite for prerendered public routes (seo §7, §8).
# Serve the matching prerendered file when it exists; fall back to the SPA
# shell (index.html) only for the noindex app/admin/funnel routes.
#
# Nginx:
#   location / { try_files $uri $uri/ $uri/index.html /index.html; }
#
# Caddy:
#   try_files {path} {path}/ {path}/index.html /index.html
#
# Pick one canonical host (apex OR www) and 301 the other so every absolute
# canonical resolves to a 200.`;

/** CLI entry: read the built template + salon list, prerender every public route. */
export function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const distDir = resolve(here, '../dist');
  const templatePath = resolve(distDir, 'index.html');
  const salonsPath = resolve(here, 'salons.json');

  // Read the pristine Vite template ONCE up front; reuse it for every route so
  // overwriting dist/index.html (the home output) can't double-inject.
  let template;
  try {
    template = readFileSync(templatePath, 'utf-8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(
        `[prerender] ${templatePath} not found — run \`vite build\` before prerendering.`,
      );
    }
    throw err;
  }

  const siteUrl = resolveSiteUrl();
  const salons = readSalons(salonsPath);
  const { cities, serviceTypes } = readDiscovery(
    resolve(here, 'discovery.json'),
  );
  const routes = buildRoutes({ siteUrl, salons, cities, serviceTypes });

  for (const route of routes) {
    const outPath = resolve(distDir, route.outputPath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, injectIntoTemplate(template, route, siteUrl), 'utf-8');
  }

  // eslint-disable-next-line no-console
  console.log(
    `[prerender] wrote ${routes.length} static pages ` +
      `(${STATIC_INDEXABLE_PATHS.length} static + ${routes.length - STATIC_INDEXABLE_PATHS.length} dynamic, host ${siteUrl})`,
  );
}

// Run only when invoked directly, not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
