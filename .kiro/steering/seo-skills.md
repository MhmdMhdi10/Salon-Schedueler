---
inclusion: fileMatch
fileMatchPattern: 'packages/web/**'
---

# SEO Skills — Salon Booking PWA (Persian, RTL, SPA)

A senior SEO playbook for this app's web package. The product is a Persian (Farsi),
**right-to-left** salon appointment-booking PWA built with React 18 + Vite +
`react-router-dom` v7 + `react-i18next` (default `fa`) + `vite-plugin-pwa`. It is rendered
**client-side** today (`main.tsx` mounts `<App/>`; no SSR/prerender), which has direct
consequences for what can rank — see §8.

**Be honest about the starting point.** Almost every current route is **transactional or
authenticated** and should **not** be a search target:

| Route | Indexable? | Why |
| --- | --- | --- |
| `/` , `/auth` | **noindex** | OTP login wall, no content |
| `/qr/:payload` | **noindex** | Per-visit QR payload, not a stable URL |
| `/salon/:salonId/book`, `/.../confirm` | **noindex** | Funnel steps, thin/duplicate |
| `/booking/success` | **noindex** | Per-user receipt |
| `/admin/*` | **noindex** | Private owner/staff area |

The SEO opportunity therefore requires **new public surfaces** that don't exist yet:

| New public route (recommended) | Purpose | Index? |
| --- | --- | --- |
| `/` (marketing home) | What the platform is, value prop, CTA | **index** |
| `/s/:slug` (public salon profile) | NAP, services, hours, gallery, reviews, "book" CTA | **index** |
| `/city/:city` or `/services/:type` | Local/category discovery pages | **index** |
| `/about`, `/contact`, `/privacy`, `/terms` | Trust & legal | **index** |

> Keep the **authed app client-rendered**; make the **public marketing + salon-profile
> pages crawlable** (prerendered/SSG or SSR). That split is the whole strategy.

---

## 1. SEO principles & what to index

- **Index public, NOINDEX the app.** Marketing home, public per-salon profiles, city/service
  discovery, and legal pages are search surfaces. The booking funnel, auth/OTP, QR landings,
  and admin are **not** — tag them `<meta name="robots" content="noindex,follow">` and keep
  them out of the sitemap.
- **One job per URL.** A salon profile is a *content* page (discover + decide); the booking
  funnel is an *app* flow. Don't merge them — link from profile → funnel with a clear CTA.
- **Earn the click with intent match.** Iranian users search «سالن زیبایی [محله/شهر]»,
  «آرایشگاه مردانه نزدیک من», «قیمت کوتاهی مو [شهر]». Public pages should target those
  Persian queries with real content, not the app shell.
- **No doorway/thin pages.** City/service pages must carry genuine, differentiated content
  (real salons, real services, real copy) — not templated near-duplicates.

---

## 2. Document structure & semantic HTML

- **One `<h1>` per page** describing the page intent (e.g. on `/s/:slug`:
  «سالن زیبایی رز — آرایشگاه زنانه در تهران، ولنجک»). Headings in order, no level skips.
- **Landmarks:** `header > nav`, `main`, `footer`, plus `article`/`section` for profile
  blocks (services, hours, gallery, reviews).
- **Descriptive links.** «مشاهده خدمات سالن رز» beats «اینجا». Link text is a ranking and
  accessibility signal.
- **Document attributes** are already correct in `index.html`: `lang="fa"` + `dir="rtl"`.
  Keep them on every rendered/prerendered page and ensure the prerenderer preserves them.
- **Images** carry meaningful Persian `alt` (e.g. «نمونه کار رنگ مو در سالن رز»); decorative
  images use empty `alt=""`.

---

## 3. Metadata (per route)

Manage `<head>` per route with **`react-helmet-async`** (SSR/prerender-safe) — wrap the app
in `HelmetProvider` and set head tags inside each public page component.

- **Title template:** `«{صفحه} | رزرو سالن»`, ≤ ~60 chars; unique per page. Examples:
  - Home: «رزرو آنلاین نوبت سالن‌های زیبایی | رزرو سالن»
  - Salon: «سالن رز، آرایشگاه زنانه ولنجک تهران | رزرو سالن»
- **Meta description:** unique, ~120–155 chars, action + value + locality; written for humans
  in natural Persian (not keyword-stuffed).
- **Canonical:** absolute `https://…` `<link rel="canonical">` on every indexable page; pick
  one host (www vs apex) and 301 the other. Strip tracking/query params from canonicals.
- **Robots meta:** indexable pages omit it (or `index,follow`); app routes set
  `noindex,follow` (see §1). Centralize this in a small `<Seo>` wrapper so it's hard to get
  wrong.

---

## 4. Open Graph & Twitter cards

Set on every public page (defaults at the layout level, overridden per page):

```html
<meta property="og:type" content="website" /> <!-- "business.business" for salon profiles -->
<meta property="og:site_name" content="رزرو سالن" />
<meta property="og:locale" content="fa_IR" />
<meta property="og:title" content="سالن رز، آرایشگاه زنانه ولنجک تهران" />
<meta property="og:description" content="رزرو آنلاین نوبت کوتاهی، رنگ و میکاپ در سالن رز." />
<meta property="og:url" content="https://example.ir/s/salon-rose" />
<meta property="og:image" content="https://example.ir/og/salon-rose.jpg" /> <!-- 1200×630, <1MB -->
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
```

- Provide a branded **default OG image** and a per-salon image where available.
- Persian text renders in OG images — generate them RTL-correct (server-side or build-time),
  don't rely on social platforms to shape Farsi text.

---

## 5. Structured data (JSON-LD)

Emit JSON-LD `<script type="application/ld+json">` per page. Only mark up content **visible**
on the page; never fabricate reviews/ratings.

- **`Organization` + `WebSite`** (site-wide, on home): include `name`, `url`, `logo`, and a
  `SearchAction` if/when on-site search exists.

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "رزرو سالن",
  "url": "https://example.ir",
  "inLanguage": "fa-IR",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://example.ir/search?q={query}",
    "query-input": "required name=query"
  }
}
```

- **`HairSalon`/`BeautySalon`** (a `LocalBusiness` subtype) on each `/s/:slug`:

```json
{
  "@context": "https://schema.org",
  "@type": "BeautySalon",
  "name": "سالن رز",
  "image": "https://example.ir/og/salon-rose.jpg",
  "telephone": "+98-21-1234-5678",
  "priceRange": "$$",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "تهران",
    "addressRegion": "تهران",
    "streetAddress": "ولنجک، خیابان نمونه، پلاک ۱۰",
    "addressCountry": "IR"
  },
  "geo": { "@type": "GeoCoordinates", "latitude": 35.80, "longitude": 51.40 },
  "openingHoursSpecification": [{
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Saturday","Sunday","Monday","Tuesday","Wednesday"],
    "opens": "10:00", "closes": "20:00"
  }],
  "url": "https://example.ir/s/salon-rose"
}
```

- **`Service`** per offered service (link to `OfferCatalog`), with `name`, `provider`, and
  `offers.price` + `priceCurrency: "IRR"` (Iranian Rial; if the UI shows Toman, keep machine
  data in IRR and be consistent).
- **`BreadcrumbList`** matching the visible breadcrumb (خانه ‹ تهران ‹ سالن رز).
- **`AggregateRating`/`Review`** only when reviews are real, on-page, and policy-compliant —
  never invented to farm rich results.
- **Validate** with Google's Rich Results Test and Schema.org validator; keep NAP identical
  to the visible page and to off-site listings (§11).

---

## 6. International SEO

- The product is **single-locale Persian**. Set `lang="fa"`/`dir="rtl"` everywhere and
  declare locale explicitly:
  - `og:locale = fa_IR`, JSON-LD `inLanguage = fa-IR`.
  - `hreflang`: with one language you can self-reference `fa` (and `fa-IR`) plus
    `x-default` → home. Only add more `hreflang` entries if you genuinely ship more locales.
- **Locale-aware URLs:** keep clean Persian-friendly slugs. Prefer transliterated/ASCII slugs
  (`/s/salon-rose`) or properly percent-encoded Persian — be consistent and canonical either
  way.
- **Avoid auto-translated boilerplate.** Don't machine-translate English templates into Farsi;
  write native Persian copy. Mixed Farsi/Latin/number strings must stay bidi-correct (see the
  UI/UX RTL guidance).

---

## 7. Crawlability

- **robots.txt** (in `packages/web/public/`): allow public pages, disallow app/admin/api,
  and point to the sitemap.

```
User-agent: *
Allow: /
Disallow: /auth
Disallow: /admin/
Disallow: /salon/*/book
Disallow: /booking/
Disallow: /qr/
Disallow: /api/
Sitemap: https://example.ir/sitemap.xml
```

- **sitemap.xml:** list **only** indexable URLs (home, salon profiles, city/service, legal),
  with `<lastmod>`. Generate at build time from the salon list; never include noindex URLs.
- **Canonical + noindex** consistency: a `noindex` page must not appear in the sitemap; a
  canonical must point to an indexable 200 URL (never to a noindex/redirect).
- **Clean URLs:** lowercase, hyphenated slugs, no `#` hash routing (BrowserRouter is already
  used — good), no session IDs or QR payloads in indexable URLs.
- **History API routing** needs a server rewrite (or host fallback) so deep links to public
  pages return the right prerendered HTML, not a 404.

---

## 8. Rendering strategy for SPA/PWA (the crux)

**Be explicit about the limitation:** the app mounts React on an empty `<div id="root">`
(`index.html` → `main.tsx`). Crawlers that don't execute JS see no content; even JS-capable
crawlers render on a delay and inconsistently. **Client-only rendering loses SEO on public
pages.** Options, in order of preference for this stack:

| Approach | What | Best for | Trade-offs |
| --- | --- | --- | --- |
| **SSG / prerender** | Build-time HTML for public routes (e.g. `vite-plugin-prerender`/`puppeteer` step, or a separate prerender of `/`, `/s/:slug`, `/about`…) | Mostly-static marketing + profile pages | Needs a build-time list of salon slugs; rebuild/ISR on data change |
| **SSR (RR v7 framework mode)** | `react-router` v7 framework/Remix-style SSR for public routes | Fresh, frequently-changing profiles | More infra (Node server), bigger change from current SPA |
| **Dynamic rendering** | Serve prerendered HTML to bots only | Stopgap | Google discourages it; maintenance burden — avoid long-term |

**Recommended:** keep the **authenticated app client-rendered** (auth/booking/admin stay a
pure SPA), and **prerender/SSR only the public routes**. Inject per-page `<head>` (via
`react-helmet-async`) and JSON-LD into the prerendered HTML so meta/OG/schema exist in the
initial response. Verify with "View Source" (not just DevTools) and URL Inspection's rendered
HTML — content and meta must be present **without** running app JS.

---

## 9. Core Web Vitals & performance

Targets (field data, 75th percentile): **LCP < 2.5s · INP < 200ms · CLS < 0.1**.

- **Performance budgets:** initial public-page JS ≤ ~150KB gzip; defer the app/admin bundles
  off the marketing/profile pages (route-level code-splitting). The customer funnel and admin
  charts/Jalali picker must not load on a public profile.
- **LCP:** prerender/SSR the hero text/image; preload the LCP image and the above-the-fold
  Vazirmatn weight; `fetchpriority="high"` on the hero image.
- **CLS:** set explicit `width`/`height` or `aspect-ratio` on all images (gallery, OG-style
  banners); reserve space for async blocks; `font-display: swap` with a metrics-matched
  fallback to limit reflow.
- **INP:** keep main-thread work small on public pages; avoid heavy hydration — prefer static
  HTML + minimal/no JS for purely informational sections.
- **PWA caching:** `vite-plugin-pwa`/Workbox — precache the shell, runtime-cache salon images
  (CacheFirst with expiration) and API GETs (StaleWhileRevalidate). Don't let the SW serve
  stale `noindex`/auth HTML to crawlers.

---

## 10. PWA & mobile-friendliness

- **Manifest** (`public/manifest.json`) is present with `name`, `short_name`, `description`,
  `lang: "fa"`, `dir: "rtl"`, `theme_color`, and 192/512 icons — good. **Add a `512×512`
  `purpose: "maskable"` icon** and (optionally) screenshots for richer install UI.
- **Installability:** valid manifest + HTTPS + service worker + `start_url` (`/`) that loads
  offline-tolerant. Verify the install prompt and the standalone launch.
- **Viewport:** `width=device-width, initial-scale=1` is set — keep it; don't disable user
  zoom.
- **Mobile usability:** tap targets ≥ 44×44px, no horizontal scroll at 360px, legible Farsi
  body (≥ 16px), and content not hidden behind interstitials (avoid intrusive popups that
  Google penalizes on mobile).

---

## 11. Local SEO (Iran context)

- **NAP consistency:** Name/Address/Phone identical across the salon profile page, JSON-LD,
  and every off-site listing. Inconsistency dilutes local ranking and trust.
- **Maps & discovery:** Google Business Profile matters where Google is used, but for the
  Iranian market also prioritize local platforms — **Neshan** and **Balad** maps, and the
  **Torob/local directory** ecosystem — for embeds and listings. Embed a map on each profile
  (lazy-loaded) and expose precise `geo` in JSON-LD.
- **Localized content:** real neighborhood/city names in Persian (محله/منطقه), service terms
  as Iranians search them, and opening hours that respect the **Iranian week** (Saturday is
  the first working day; Friday is the weekend) — reflect this in `openingHoursSpecification`.
- **Reviews:** encourage on-platform reviews and surface them honestly; never fabricate.

---

## 12. Measurement

- **Search Console:** verify the property, submit `sitemap.xml`, monitor Coverage (confirm app
  routes are *excluded by noindex* and public pages are *indexed*), and use URL Inspection to
  confirm rendered HTML contains content + meta + JSON-LD.
- **Analytics:** GA4 (or a privacy-friendly alternative) with **consent awareness** — gate
  non-essential tracking behind consent, anonymize where possible, and keep PII (phone
  numbers, OTPs) out of analytics events. Track funnel events (qr_view → book_start →
  slot_select → pay → success) for product, not for indexing.
- **Web Vitals field data:** use the `web-vitals` library to send LCP/INP/CLS to your
  analytics, and watch the CrUX/Search Console "Core Web Vitals" report.
- **Validation in CI:** run Lighthouse (SEO + a11y + perf) and a structured-data check against
  prerendered public URLs as a build gate.

---

## 13. Accessibility ⇄ SEO overlap

Many a11y wins are SEO wins — do them once, benefit twice:

- **Semantic markup & landmarks** → clearer document structure for crawlers and AT.
- **One `<h1>` + ordered headings** → better topical understanding and snippet extraction.
- **Descriptive link text** → ranking signal *and* screen-reader usability.
- **Meaningful `alt`** → image search *and* non-visual access.
- **`lang`/`dir` correctness** → correct rendering for crawlers, translation, and AT.
- **Performance/CLS discipline** → better CWV *and* a calmer experience for everyone.

(See the UI/UX skills file for the full WCAG 2.2 AA guidance and the honesty note that
automated checks are necessary but not sufficient.)

---

## 14. SEO QA checklist (per public page)

Run before publishing any **indexable** page:

**Indexability**
- [ ] Correct `index`/`noindex` for this route (app/admin/funnel = noindex)
- [ ] Self-referencing absolute canonical to a 200 URL
- [ ] In `sitemap.xml` if indexable; absent if noindex; not blocked by robots.txt

**Rendering**
- [ ] Content + meta + JSON-LD present in **initial HTML** (View Source / URL Inspection),
      not only after JS runs

**Metadata & social**
- [ ] Unique title (≤ ~60 chars) and meta description (~120–155 chars), natural Persian
- [ ] OG/Twitter tags complete; `og:locale = fa_IR`; OG image 1200×630, RTL-correct

**Structured data**
- [ ] Appropriate JSON-LD (WebSite/Organization · BeautySalon · Service · BreadcrumbList)
- [ ] Matches visible content; NAP consistent; validates with no errors

**i18n / RTL**
- [ ] `lang="fa"` + `dir="rtl"` on the document; native Persian copy (not auto-translated)
- [ ] `hreflang` self-reference (fa / fa-IR) + `x-default`; clean canonical slug

**Performance (CWV)**
- [ ] LCP < 2.5s, INP < 200ms, CLS < 0.1 on mobile; within JS budget
- [ ] Images sized + lazy below fold; fonts preloaded with `swap`; app bundles not loaded here

**Mobile/PWA**
- [ ] No horizontal scroll at 360px; tap targets ≥ 44×44px; no intrusive interstitials
- [ ] Manifest valid; install + offline shell verified

**Local**
- [ ] NAP, hours (Iranian week), geo, and map embed present and consistent
