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
  warnIfPlaceholder,
  absoluteUrl,
  salonPath,
  cityPath,
  servicePath,
} from './generate-sitemap.mjs';
import { loadSiteData } from './site-data.mjs';

export { DEFAULT_SITE_URL, STATIC_INDEXABLE_PATHS };

/** Brand/site name — the right-hand side of the title template (seo §3). */
export const SITE_NAME = 'آرا';

/** Declared content locale (seo §6). */
export const OG_LOCALE = 'fa_IR';

/** Branded default Open Graph image (1200×630, seo §4), relative to the host. */
export const DEFAULT_OG_IMAGE_PATH = '/og/default.jpg';

/** Builds the «{صفحه} | آرا» title, or the bare site name when no page name. */
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
    heading: 'مشتری‌ها پیدایتان می‌کنند؛ آرا باقی مسیر را مرتب می‌کند',
    description:
      'ویترین آنلاین، رزرو ۲۴ ساعته، تقویم کارکنان و پروندهٔ مشتری را در یک پنل فارسی داشته باشید؛ از اولین جست‌وجو تا نوبت بعدی.',
  },
  '/about': {
    title: 'درباره ما',
    heading: 'درباره آرا',
    description:
      'آرا، سامانه آنلاین رزرو نوبت سالن‌های زیبایی در ایران است؛ ساده، سریع و قابل اعتماد برای مشتریان و صاحبان سالن.',
  },
  '/contact': {
    title: 'تماس با ما',
    heading: 'تماس با ما',
    description:
      'برای پشتیبانی، همکاری یا افزودن سالن خود به آرا با ما در ارتباط باشید.',
  },
  '/privacy': {
    title: 'حریم خصوصی',
    heading: 'سیاست حریم خصوصی',
    description:
      'نحوه گردآوری، نگه‌داری و محافظت از اطلاعات کاربران در آرا.',
  },
  '/terms': {
    title: 'قوانین و مقررات',
    heading: 'قوانین و مقررات',
    description:
      'شرایط استفاده از آرا برای مشتریان و صاحبان سالن‌های زیبایی.',
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
 * JSON-LD for a salon profile (seo §5). Only fields actually present in the
 * salon's own data are emitted — we never fabricate address/geo/reviews
 * (seo §5 honesty rule). With the route data now loaded straight from
 * `src/data/salons.ts`, the NAP here mirrors the visible page block and the
 * client `buildSalonJsonLd()` (seo §11 — NAP identical everywhere).
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
  if (salon.image) {
    beautySalon.image = /^https?:\/\//i.test(salon.image)
      ? salon.image
      : `${siteUrl}${salon.image}`;
  }
  if (salon.telephone) beautySalon.telephone = salon.telephone;
  if (salon.priceRange) beautySalon.priceRange = salon.priceRange;
  if (salon.address && salon.address.streetAddress) {
    beautySalon.address = {
      '@type': 'PostalAddress',
      streetAddress: salon.address.streetAddress,
      addressLocality: salon.address.addressLocality,
      addressRegion: salon.address.addressRegion,
      addressCountry: salon.address.addressCountry,
    };
  }
  if (
    salon.geo &&
    typeof salon.geo.latitude === 'number' &&
    typeof salon.geo.longitude === 'number'
  ) {
    beautySalon.geo = {
      '@type': 'GeoCoordinates',
      latitude: salon.geo.latitude,
      longitude: salon.geo.longitude,
    };
  }
  if (Array.isArray(salon.openingHours) && salon.openingHours.length > 0) {
    beautySalon.openingHoursSpecification = salon.openingHours
      .filter((h) => h && h.day && !h.closed && h.opens && h.closes)
      .map((h) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: h.day,
        opens: h.opens,
        closes: h.closes,
      }));
  }

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
              { href: '/business/register', text: 'ثبت رایگان کسب‌وکار' },
              { href: '/search', text: 'جست‌وجوی سالن‌ها' },
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
 * Prerendered **noindex** shells that are deliberately NOT in the sitemap
 * (`buildRoutes` stays the exact sitemap mirror the tests pin):
 *
 *  - `/search` — the home hero submits here. Without its own prerendered file a
 *    non-JS crawler fetching `/search` would receive the HOME document (robots
 *    `index,follow` + the home canonical) via the SPA fallback — exactly the
 *    conflicting-signal problem this step exists to prevent. The shell carries
 *    `noindex,follow` and no canonical; robots.txt additionally disallows it.
 *
 *  - `404.html` — the hosting fallback document for unknown URLs. It is the
 *    same Vite template (so React mounts and renders `NotFoundPage` for
 *    whatever URL was requested) but its initial HTML asserts `noindex,follow`
 *    and shows the not-found scaffold instead of the home page's content. See
 *    {@link SERVER_REWRITE_NOTE} for how hosts should serve it.
 */
export function buildNoindexRoutes() {
  return [
    {
      path: '/search',
      outputPath: 'search/index.html',
      title: 'جستجوی سالن‌ها',
      heading: 'جستجوی سالن‌ها',
      description:
        'جستجوی خدمت، سالن یا شهر — نتایج با بارگذاری برنامه نمایش داده می‌شوند.',
      robots: 'noindex,follow',
      ogType: 'website',
      jsonLd: [],
      links: [
        { href: '/', text: 'بازگشت به خانه' },
        { href: '/city/tehran', text: 'سالن‌های تهران' },
      ],
    },
    {
      path: '/404',
      outputPath: '404.html',
      title: 'صفحه پیدا نشد',
      heading: 'این صفحه پیدا نشد',
      description:
        'آدرسی که وارد کرده‌اید وجود ندارد یا جابه‌جا شده است. از پیوندهای زیر ادامه دهید.',
      robots: 'noindex,follow',
      ogType: 'website',
      jsonLd: [],
      links: [
        { href: '/', text: 'بازگشت به خانه' },
        { href: '/search', text: 'جستجوی سالن‌ها' },
        { href: '/business', text: 'ثبت سالن' },
      ],
    },
  ];
}

/**
 * Renders the `<head>` SEO tags for a route (everything the crawler must see in
 * the initial HTML): canonical, robots, hreflang self-reference + `x-default`,
 * and the Open Graph / Twitter card set (seo §3, §4, §6). Title is handled
 * separately by template substitution.
 *
 * Every tag carries a bare `data-prerender` attribute so `src/main.tsx` can
 * remove the whole static set just before React mounts — after hydration
 * `react-helmet-async` owns the head exclusively, and the DOM never holds two
 * conflicting canonicals/robots/OG sets (the duplication a JS-rendering crawler
 * would otherwise index).
 *
 * Routes with `robots: 'noindex,follow'` (the prerendered `/search` shell and
 * the `404.html` hosting fallback) emit ONLY title/description/robots — no
 * canonical, hreflang, OG, or JSON-LD, since those pages must carry no indexing
 * signals (a canonical on the 404 fallback document would be actively wrong
 * when a host serves it for arbitrary unknown URLs).
 */
export function renderHeadTags(route, siteUrl) {
  const fullTitle = pageTitle(route.title);
  const robots = route.robots || 'index,follow';
  const lines = [
    `<meta data-prerender name="description" content="${escapeHtml(route.description)}" />`,
    `<meta data-prerender name="robots" content="${robots}" />`,
  ];

  if (robots.startsWith('noindex')) {
    return lines.map((l) => `  ${l}`).join('\n');
  }

  const image = `${siteUrl}${DEFAULT_OG_IMAGE_PATH}`;
  const c = route.canonical;
  lines.push(
    `<link data-prerender rel="canonical" href="${escapeHtml(c)}" />`,
    `<link data-prerender rel="alternate" hreflang="fa" href="${escapeHtml(c)}" />`,
    `<link data-prerender rel="alternate" hreflang="fa-IR" href="${escapeHtml(c)}" />`,
    `<link data-prerender rel="alternate" hreflang="x-default" href="${escapeHtml(siteUrl)}" />`,
    `<meta data-prerender property="og:type" content="${escapeHtml(route.ogType)}" />`,
    `<meta data-prerender property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta data-prerender property="og:locale" content="${OG_LOCALE}" />`,
    `<meta data-prerender property="og:title" content="${escapeHtml(fullTitle)}" />`,
    `<meta data-prerender property="og:description" content="${escapeHtml(route.description)}" />`,
    `<meta data-prerender property="og:url" content="${escapeHtml(c)}" />`,
    `<meta data-prerender property="og:image" content="${escapeHtml(image)}" />`,
    `<meta data-prerender property="og:image:width" content="1200" />`,
    `<meta data-prerender property="og:image:height" content="630" />`,
    `<meta data-prerender name="twitter:card" content="summary_large_image" />`,
    `<meta data-prerender name="twitter:title" content="${escapeHtml(fullTitle)}" />`,
    `<meta data-prerender name="twitter:description" content="${escapeHtml(route.description)}" />`,
    `<meta data-prerender name="twitter:image" content="${escapeHtml(image)}" />`,
  );
  for (const node of route.jsonLd) {
    lines.push(
      `<script data-prerender type="application/ld+json">${serializeJsonLd(node)}</script>`,
    );
  }
  return lines.map((l) => `  ${l}`).join('\n');
}

/**
 * Scoped styles for the pre-hydration scaffold, injected into `<head>` with the
 * other `data-prerender` tags (and removed with them when React mounts). The
 * rules consume the design tokens from the built stylesheet (`--color-*`,
 * `--font-family-sans` from tokens.css, which IS linked in the template), so on
 * a slow connection the crawlable scaffold paints in the brand type/palette —
 * centered, height-reserving — instead of flashing browser-default serif text.
 * All values are CSS custom properties except structural literals, which live
 * in this build script (never authored `src/**` styles), outside the
 * distinctiveness guardrail's scan scope.
 */
export const PRERENDER_STYLE = `<style data-prerender>
  .prerender-content{min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:var(--color-bg);color:var(--color-text);font-family:var(--font-family-sans)}
  .prerender-content main{max-width:40rem;padding:var(--space-6,32px) var(--space-4,16px);text-align:center}
  .prerender-content h1{font-size:var(--font-xl);font-weight:var(--font-weight-display,800);
    line-height:var(--line-height-display,1.2);margin:0 0 var(--space-4,16px)}
  .prerender-content p{font-size:var(--font-xs);line-height:1.8;color:var(--color-text-muted);
    margin:0 0 var(--space-5,24px)}
  .prerender-content nav ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;
    gap:var(--space-3,12px);justify-content:center}
  .prerender-content nav a{display:inline-block;padding:var(--space-2,8px) var(--space-4,16px);
    border:1px solid var(--color-border);border-radius:999px;color:var(--color-primary);
    text-decoration:none;font-size:var(--font-xs)}
</style>`;

/**
 * Renders the in-`#root` body content: a semantic SEO scaffold with a single
 * `<h1>`, the description, and crawlable internal links inside the existing
 * `header`/`main`/`footer` landmark contract. React replaces this on mount; it
 * exists so View Source / non-JS crawlers see real content (seo §2, §8), and
 * {@link PRERENDER_STYLE} keeps it on-brand until hydration.
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
  html = html.replace(
    /<\/head>/,
    () => `${headTags}\n  ${PRERENDER_STYLE}\n</head>`,
  );

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
# document only for routes without their own file.
#
# The build emits /404.html — the same app shell with a noindex head and a
# not-found scaffold. Use IT (not index.html) as the unknown-URL fallback so
# React still mounts (and renders NotFoundPage for the requested URL) while
# crawlers see noindex instead of the home document. Known noindex app routes
# (auth, /salon/:id/book funnel, /qr, /owner) also land on this fallback; their
# client <SeoHead> keeps them noindex either way.
#
# Nginx:
#   location / { try_files $uri $uri/ $uri/index.html /404.html; }
#
# Caddy:
#   try_files {path} {path}/ {path}/index.html /404.html
#
# Netlify/static hosts that only support an index.html SPA fallback: keep the
# index.html fallback — NotFoundPage still renders after hydration; 404.html is
# then only used by hosts (GitHub Pages, S3 error document) that pick it up
# automatically.
#
# Pick one canonical host (apex OR www) and 301 the other so every absolute
# canonical resolves to a 200.`;

/**
 * CLI entry: read the built template + the route data from the app source
 * (src/data via `site-data.mjs`), prerender every public route plus the
 * noindex `/search` and `404.html` shells.
 */
export async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const distDir = resolve(here, '../dist');
  const templatePath = resolve(distDir, 'index.html');

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
  const { salons, cities, serviceTypes } = await loadSiteData();
  const routes = [
    ...buildRoutes({ siteUrl, salons, cities, serviceTypes }),
    ...buildNoindexRoutes(),
  ];

  for (const route of routes) {
    const outPath = resolve(distDir, route.outputPath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, injectIntoTemplate(template, route, siteUrl), 'utf-8');
  }

  warnIfPlaceholder(siteUrl, 'prerender');
  // eslint-disable-next-line no-console
  console.log(
    `[prerender] wrote ${routes.length} static pages ` +
      `(${STATIC_INDEXABLE_PATHS.length} static + ${salons.length} salon + ` +
      `${cities.length} city + ${serviceTypes.length} service + 2 noindex shells, host ${siteUrl})`,
  );
}

// Run only when invoked directly, not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
