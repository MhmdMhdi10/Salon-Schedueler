# Per-screen Design QA & per-page SEO QA — recorded results

This document records the outcome of running the governing per-screen and
per-page QA checklists across every redesigned surface, as required by
**task 12.2** of the `ui-ux-redesign` spec (Requirements 12.1, 8.2, 8.3, 8.4,
8.7, 10.1).

- **Design QA checklist** — `.kiro/steering/ui-ux-skills.md` §14 (structure &
  hierarchy, tokens & theming in light + dark, states, forms, RTL & i18n,
  accessibility, performance, content).
- **SEO QA checklist** — `.kiro/steering/seo-skills.md` §14 (indexability,
  rendering, metadata & social, structured data, i18n/RTL, CWV, mobile/PWA,
  local), run on every **indexable** public page only.

It is a **presentation-only** verification pass (R12.6): no backend, API, or
domain changes. It complements `accessibility.md` (the WCAG floor + manual-AT
honesty note) and does not restate it.

## How this was verified

The audit was performed by reading each screen's source against the checklists
and cross-referencing the shared infrastructure that backs the checks:

- **Tokens / theming** — every screen consumes Tailwind classes mapped to the
  `tokens.css` CSS variables (`text-text`, `bg-surface`, `text-muted`,
  `border-border`, `duration-fast`, `shadow-1`, `z-sticky`, …); no raw
  hex/px/ms literals were found in the redesigned page components. Token-pair
  contrast for **both** light and dark is proven numerically in
  `src/styles/contrast.test.ts`; the `ThemeProvider` syncs `data-theme` and the
  `theme-color` meta.
- **States / a11y** — exercised by the component + page suites under an RTL
  (`dir="rtl"`) render, each asserting no serious/critical axe violations via
  `src/test/a11y.tsx` and the single-`<h1>` ordered-heading helper.
- **SEO** — `<SeoHead>` (noindex-by-default), `robots.txt`, `sitemap.xml`, and
  the build-time prerender (`scripts/prerender.mjs`) inject content + meta +
  JSON-LD into the initial HTML of public routes.

### Verification commands (this pass)

| Gate | Command | Result |
| --- | --- | --- |
| Type check | `tsc -p tsconfig.json --noEmit` (web) | **pass** — no type errors |
| Test suite | `vitest run` (web) | **pass** — 443 passed, 1 skipped (42 files) |

> Note: the full `npm run build` additionally runs `vite build` + `prerender` +
> `analyze-bundle`, which write to `dist/`/`node_modules/.vite`. In this
> sandbox those steps hit a filesystem-permission (`EACCES`) error that is
> unrelated to code correctness; `tsc` and the complete `vitest` suite (which
> includes the preserved i18n-rtl, pwa, admin, and integration tests) are green.
> The axe runs emit a benign jsdom `HTMLCanvasElement.getContext` warning — the
> documented jsdom contrast limitation (see `accessibility.md`); contrast is
> covered by `contrast.test.ts` and the Lighthouse gate instead.

Legend: **✅ pass** · **➖ n/a** (criterion does not apply to this screen) ·
**⚠ note/gap** (see the notes column).

---

## A. Customer funnel (web) — Design QA (`ui-ux §14`)

All five funnel routes are `noindex` app flows, so only the Design QA checklist
applies (their SEO is "correctly noindexed" — see §D).

### A.1 Auth — `/auth` (`AuthPage.tsx`)

| Checklist group | Result | Notes |
| --- | --- | --- |
| Structure & hierarchy | ✅ | Single `<h1>` (`auth.title`); one primary CTA («دریافت کد» / «تایید»); secondary actions (resend/change-phone) are `ghost`. |
| Tokens & theming (light+dark) | ✅ | Tokens only; OTP boxes/border/focus use `border-border`/`outline-focus`. |
| States | ✅ | Button `loading`; inline `role="alert"` error that **keeps** typed input; resend timer countdown. |
| Forms | ✅ | Visible labels; phone `type=tel inputMode=tel dir=ltr autoComplete=tel` + `^09\d{9}$` with digit normalization; OTP `inputMode=numeric autoComplete=one-time-code` paste/auto-advance/backspace + resend timer. |
| RTL & i18n | ✅ | Logical layout; LTR-isolated phone/OTP inside RTL; back chevron mirrored (`rtl:-scale-x-100`); Persian digits; all copy from `auth.*`. |
| Accessibility | ✅ | Keyboard operable; visible focus ring; OTP boxes ≥44px tall; `aria-live` on resend; `role="alert"` error. |
| Performance | ✅ | Route is `React.lazy`-split; no images; above-the-fold font preloaded in `index.html`. |
| Content | ✅ | Verb CTAs; «کد ارسال شد» success toast; specific error copy. |
| **Preserved hooks** | ✅ | `auth-page` testID + `role="alert"` error pattern intact. |

### A.2 QR landing — `/qr/:payload` (`QrLandingPage.tsx`)

| Checklist group | Result | Notes |
| --- | --- | --- |
| Structure & hierarchy | ✅ | Single `<h1>` (salon name); one primary CTA «انتخاب خدمت». |
| Tokens & theming | ✅ | Tokens only across loading/error/resolved. |
| States | ✅ | Skeleton header while resolving (no CLS); **two distinct** errors — `malformed` vs `unregistered` — each with a next step; resolved state. |
| Forms | ➖ | No form. |
| RTL & i18n | ✅ | Logical layout; QR/store icons not mirrored (universal); copy from `salon.qr.*`. |
| Accessibility | ✅ | `role="status"` busy skeleton; back link ≥44px; icons `aria-hidden`. |
| Performance | ✅ | Skeleton-first; route code-split. |
| Content | ✅ | Distinct, actionable error copy + «بازگشت به خانه». |
| **Preserved hooks** | ✅ | `qr-landing` testID on resolved view. |

### A.3 Availability — `/salon/:salonId/book` (`AvailabilityPage.tsx`)

| Checklist group | Result | Notes |
| --- | --- | --- |
| Structure & hierarchy | ✅ | Single `<h1>`; ordered `<h2>` sections (service/date/time); `section` landmarks. |
| Tokens & theming | ✅ | Tokens only; primitives (`RadioGroup`, `SlotGrid`, `JalaliDatePicker`). |
| States | ✅ | Service list + slot grid each: skeleton → empty («…روز دیگری انتخاب کنید») → error+retry → populated; five slot states distinguishable without color. |
| Forms | ✅ | Service radio cards; Jalali picker replaces native date input (bottom sheet on mobile, popover on desktop); past dates disabled. |
| RTL & i18n | ✅ | Persian months/digits, Iranian-week order, ISO only at API boundary; `<Money>` Rial; copy from `booking.*`. |
| Accessibility | ✅ | Keyboard-operable picker/slots; `role="status"` loaders; slot chips ≥44px. |
| Performance | ✅ | Skeletons first; Jalali picker pulled in within the code-split route. |
| Content | ✅ | Verb CTAs; empty/error give next steps. |
| **Preserved hooks** | ✅ | `availability-page` testID; selection persisted for back-navigation. |

### A.4 Booking confirm — `/salon/:salonId/book/confirm` (`BookingConfirmPage.tsx`)

| Checklist group | Result | Notes |
| --- | --- | --- |
| Structure & hierarchy | ✅ | Single `<h1>`; sticky bottom CTA «تایید رزرو» is the one primary action. |
| Tokens & theming | ✅ | Tokens only; sticky bar uses `z-sticky` + `bg-surface`. |
| States | ✅ | Summary loading skeleton / error+retry; confirm idle → in-button loading → explicit **payment-redirect** surface → error+retry; **never fakes success**. |
| Forms | ➖ | No input form; the confirm action is the form. |
| RTL & i18n | ✅ | `<JalaliDate>` + Persian-digit time + `<Money>` Rial; copy from `booking.*`. |
| Accessibility | ✅ | Sticky CTA clears `env(safe-area-inset-bottom)`; `role="status"` redirect; abandon `beforeunload` guard while pending. |
| Performance | ✅ | Skeleton-first; route code-split. |
| Content | ✅ | Deposit notice; specific confirm-error copy. |
| **Preserved hooks** | ✅ | `booking-confirm` testID (+ `booking-confirm-cta`). |

### A.5 Booking success — `/booking/success` (`BookingSuccessPage.tsx`)

| Checklist group | Result | Notes |
| --- | --- | --- |
| Structure & hierarchy | ✅ | Single `<h1>`; one clear next action «بازگشت به خانه». |
| Tokens & theming | ✅ | Tokens only; success uses `text-success` + icon + text (not color-only). |
| States | ✅ | Success moment; summary card omitted gracefully when no router state. |
| Forms | ➖ | No form. |
| RTL & i18n | ✅ | `<JalaliDate>` + Persian-digit time; copy from `booking.*`. |
| Accessibility | ✅ | **Reduced-motion-aware** (`useReducedMotion` → opacity-only); success icon `role="img"` + `aria-label`; animation never gates content. |
| Performance | ✅ | No blocking media; route code-split. |
| Content | ✅ | What/when/where summary + confident copy. |
| **Preserved hooks** | ✅ | `booking-success` testID. |

---

## B. Admin (web) — Design QA (`ui-ux §14`)

All `/admin/*` routes are `noindex` (private); only Design QA applies.

### B.1 Configuration — `/admin/config` (`ConfigurationPage.tsx`)

| Checklist group | Result | Notes |
| --- | --- | --- |
| Structure & hierarchy | ✅ | Single `<h1>`; ordered section `<h2>`s; sectioned cards (Staff/Chairs/Services/Holidays). |
| Tokens & theming | ✅ | Tokens only; primitives throughout. |
| States | ✅ | `config-loading` skeleton sections; `config-error` + retry; per-section empty states with create CTA. |
| Forms | ✅ | Inline add forms with visible labels; numeric fields `inputMode=numeric dir=ltr`. |
| RTL & i18n | ✅ | Breadcrumb (خانه ‹ تنظیمات) + in-page anchor nav; `<Money>` Rial; copy from `admin.*`. |
| Accessibility | ✅ | Anchor chips + summary ≥44px; destructive delete → confirm `Dialog` + **undo** toast «بازگردانی»; advanced behind `<details>` disclosure. |
| Performance | ✅ | Skeleton-first; route code-split. |
| Content | ✅ | Forgiveness/undo; specific empty/error copy. |
| **Preserved hooks** | ✅ | `admin-configuration`, `config-loading`, `config-error`, `staff-list`/`chairs-list`/`services-list`/`holidays-list`. |

### B.2 Calendar — `/admin/calendar` (`CalendarPage.tsx`)

| Checklist group | Result | Notes |
| --- | --- | --- |
| Structure & hierarchy | ✅ | Single `<h1>`; day/week Radix `Tabs`. |
| Tokens & theming | ✅ | Tokens only; tabular-nums times. |
| States | ✅ | `calendar-loading` skeleton grid; `calendar-error` + retry; `calendar-empty`; populated day rail / 7-col week grid. |
| Forms | ➖ | No form. |
| RTL & i18n | ✅ | Week grid **Saturday-first** (Iranian week), RTL by layout; `<JalaliDate>`/`<Num>`; status `Badge` = color **+ icon + text**. |
| Accessibility | ✅ | `role="tab"`/`aria-selected` preserved, RTL arrow-key nav; `role="grid"`/`gridcell`. |
| Performance | ✅ | Skeleton-first; route code-split. |
| Content | ✅ | «نوبتی در این بازه نیست» empty; friendly error. |
| **Preserved hooks** | ✅ | `admin-calendar`, `calendar-day`/`-week`/`-loading`/`-error`/`-appointments`/`-empty`; tab semantics. |

### B.3 Analytics — `/admin/analytics` (`AnalyticsPage.tsx`)

| Checklist group | Result | Notes |
| --- | --- | --- |
| Structure & hierarchy | ✅ | Single `<h1>`; KPI cards + table + lazy chart with ordered headings. |
| Tokens & theming | ✅ | Tokens only; `tabular-nums`/`tnum` figures. |
| States | ✅ | `analytics-loading` skeleton dashboard; `analytics-error` + retry; per-surface empty states. |
| Forms | ➖ | No form. |
| RTL & i18n | ✅ | `<Num>`/`<Money>` Rial; numeric column logical `end` alignment; copy from `admin.analyticsPage.*`. |
| Accessibility | ✅ | Table `scope="col"` headers; chart behind `Suspense` skeleton; KPI hints `sr-only`. |
| Performance | ✅ | Chart `React.lazy` — off first paint and off other bundles. |
| Content | ✅ | KPI hints; specific empty/error copy. |
| **Preserved hooks** | ✅ | `admin-analytics`, `analytics-loading`/`-error`/`-utilization`/`-revenue`/`-busiest`. |

---

## C. Public pages (web) — Design QA + **SEO QA**

These are the indexable surfaces; both checklists apply.

### C.1 Marketing home — `/` (`MarketingHome.tsx`)

Design QA: ✅ across all groups — single `<h1>`, one primary CTA, tokens only,
crawlable footer nav, value cards as `article`s, logical RTL layout, copy from
`home.*`.

| SEO QA group | Result | Notes |
| --- | --- | --- |
| Indexability | ✅ | `<SeoHead index>` → `index,follow`; self-canonical `/`; in `sitemap.xml`; not blocked by robots. |
| Rendering | ✅ | Prerendered (`scripts/prerender.mjs` `homeJsonLd`) — content + meta + `WebSite`/`Organization` JSON-LD in initial HTML. |
| Metadata & social | ✅ | Unique title/description (`seo.titles.home`/`descriptions.home`); OG/Twitter; `og:locale=fa_IR`; 1200×630 image. |
| Structured data | ✅ | `WebSite` + `Organization`. |
| i18n / RTL | ✅ | `lang=fa`/`dir=rtl` (SeoHead + document); `hreflang` fa/fa-IR/x-default; clean canonical. |
| Performance (CWV) | ✅ | Hero is LCP: AVIF preload + `fetchpriority=high`; `<Picture>` AVIF/WebP/PNG `srcset`; explicit `width`/`height` (CLS-safe); app bundles code-split off. |
| Mobile/PWA | ✅ | CTA ≥44px; no 360px overflow; manifest valid. |
| Local | ➖ | Platform-level page, no single NAP. |

### C.2 Salon profile — `/s/:slug` (`SalonProfilePage.tsx`)

Design QA: ✅ — single `<h1>`, ordered `article`/`section` blocks, one CTA into
the funnel, tokens only, Iranian-week hours, Persian `alt` gallery, bidi-isolated
phone/hours, copy from `salon.profile.*`.

| SEO QA group | Result | Notes |
| --- | --- | --- |
| Indexability | ✅ | `<SeoHead index>`; self-canonical `/s/:slug`; in sitemap (`/s/salon-rose`); unknown slug → noindex not-found surface. |
| Rendering | ✅ | Prerendered per enumerated slug — content + meta + JSON-LD in initial HTML. |
| Metadata & social | ✅ | Unique title (salon name) + description (tagline); OG `business.business` + per-salon image; Twitter card. |
| Structured data | ✅ | `BeautySalon` + one `Service` per offering (`priceCurrency:"IRR"`) + `BreadcrumbList`, built from on-page data (NAP consistent, nothing fabricated). |
| i18n / RTL | ✅ | `lang/dir` correct; `hreflang` self-ref; ASCII slug clean canonical. |
| Performance (CWV) | ✅ | Gallery `<Picture>` sized + lazy; **map embed lazy-loaded**; funnel/admin bundles not loaded here. |
| Mobile/PWA | ✅ | CTA ≥44px; no 360px overflow. |
| Local | ✅ | NAP block identical to JSON-LD; Iranian-week `openingHoursSpecification`; precise `geo`; map embed present. |

### C.3 Discovery — `/city/:city`, `/services/:type` (`DiscoveryPages.tsx`)

Design QA: ✅ — single `<h1>`, ordered sections, descriptive link text, empty
state for no-matches, tokens only, copy from `discovery.*`.

| SEO QA group | Result | Notes |
| --- | --- | --- |
| Indexability | ✅ | `<SeoHead index>`; self-canonical; city + 3 service slugs in sitemap; unknown slug → noindex not-found. |
| Rendering | ✅ | Prerendered; content + `BreadcrumbList` JSON-LD in initial HTML. |
| Metadata & social | ✅ | Unique heading/intro per page; OG/Twitter defaults. |
| Structured data | ✅ | `BreadcrumbList` (خانه ‹ page); salon entities carry their own markup on profiles (no duplication). |
| i18n / RTL | ✅ | Native Persian copy (not auto-translated), real neighborhoods/services; ASCII slugs. |
| Performance (CWV) | ✅ | Light content pages; no heavy bundles. |
| Mobile/PWA | ✅ | Links ≥44px; no overflow. |
| Local | ✅ | Real city/neighborhood names + Iranian-context service terms. |
| **Differentiation (seo §1, no doorway)** | ✅ | Hand-written per-city/per-service intro/body + real matching salons — not templated near-duplicates. |

### C.4 Legal/trust — `/about`, `/contact`, `/privacy`, `/terms` (`LegalPages.tsx`)

Design QA: ✅ — single `<h1>`, ordered `<h2>` sections, breadcrumb, tokens only,
bidi-isolated email/phone (`<DirText>`), copy from `legal.*`.

| SEO QA group | Result | Notes |
| --- | --- | --- |
| Indexability | ✅ | `<SeoHead index>`; self-canonical; all four in sitemap. |
| Rendering | ✅ | Prerendered (`STATIC_ROUTE_CONTENT`) — content + meta in initial HTML; intentionally JS-light. |
| Metadata & social | ✅ | Unique title/description per page (`seo.titles.*`/`descriptions.*`). |
| Structured data | ➖ | Informational pages — no entity markup required. |
| i18n / RTL | ✅ | `lang/dir` correct; `hreflang` self-ref. |
| Performance (CWV) | ✅ | Minimal main-thread work; no images. |
| Mobile/PWA | ✅ | Links ≥44px; no overflow. |
| Local | ➖ | `/contact` exposes channel NAP; others n/a. |

---

## D. SEO indexability matrix (whole site)

Confirms the "index public, noindex the app" split (seo §1, R8.7) is correct and
self-consistent (canonical ⇄ sitemap ⇄ robots):

| Route | Robots (via `<SeoHead>`) | In sitemap? | robots.txt | Correct? |
| --- | --- | --- | --- | --- |
| `/` | `index,follow` | yes | allowed | ✅ |
| `/s/:slug` | `index,follow` | yes (enumerated) | allowed | ✅ |
| `/city/:city`, `/services/:type` | `index,follow` | yes | allowed | ✅ |
| `/about` `/contact` `/privacy` `/terms` | `index,follow` | yes | allowed | ✅ |
| `/auth` | `noindex,follow` (default) | no | `Disallow: /auth` | ✅ |
| `/qr/:payload` | `noindex,follow` | no | `Disallow: /qr/` | ✅ |
| `/salon/*/book`, `/.../confirm` | `noindex,follow` | no | `Disallow: /salon/*/book` | ✅ |
| `/booking/success` | `noindex,follow` | no | `Disallow: /booking/` | ✅ |
| `/admin/*` | `noindex,follow` | no | `Disallow: /admin/` | ✅ |

`<SeoHead>` defaults to `noindex`, so any future private route is safe by
omission. No `noindex` route appears in `sitemap.xml`.

---

## E. Mobile (React Native) screens — Design QA (applicable subset)

Native screens; web-only checklist items (canonical/JSON-LD/sitemap, fonts
`preload`, `<h1>` semantics) are **n/a**. Verified against the RN theme
(`theme.ts`, sourced from the same `tokens.ts` values as web).

### E.1 AuthScreen (`screens/AuthScreen.tsx`)

| Group | Result | Notes |
| --- | --- | --- |
| Tokens & theming | ✅ | Token-driven `StyleSheet` (no raw hex); light/dark via `ThemeProvider`. |
| States | ✅ | Primary button `ActivityIndicator` loading + `accessibilityState.busy`; inline error. |
| Forms | ✅ | Phone `keyboardType=phone-pad` LTR + `autoComplete=tel`; 6 OTP boxes `number-pad` + `oneTimeCode`, auto-advance/backspace; resend timer in Persian digits. |
| RTL & i18n | ✅ | `row-reverse` OTP; LTR digit entry inside RTL; copy from `auth.*`. |
| Accessibility | ✅ | `accessibilityRole="button"`/`"alert"`; targets ≥44–48px. |
| **Preserved hooks** | ✅ | `auth-error` testID (+ `auth-screen`, inputs, `primary-button`). |

### E.2 QrScanScreen (`screens/QrScanScreen.tsx`)

| Group | Result | Notes |
| --- | --- | --- |
| Tokens & theming | ✅ | Token-driven frame/corners; logical insets (`insetInlineStart/End`). |
| States | ✅ | idle/scanning → resolving → resolved → error; **distinct** malformed vs unregistered messaging + generic fallback; rescan affordance. |
| RTL & i18n | ✅ | Logical insets mirror corners; copy from `salon.*`/`common.*`. |
| Accessibility | ✅ | `accessibilityRole` image/summary/alert/button; targets ≥48px. |
| **Preserved hooks** | ✅ | `qr-loading`/`qr-error`/`qr-success`. |

### E.3 AvailabilityScreen (`screens/AvailabilityScreen.tsx`)

| Group | Result | Notes |
| --- | --- | --- |
| Tokens & theming | ✅ | Token-driven styles; active/past/skeleton chip styles. |
| States | ✅ | Service list + slot grid: skeleton → empty → error+retry → populated; confirm idle → loading → **redirecting** → success/error (never fakes success). |
| Forms / picker | ✅ | Jalali month grid (Persian months/digits, Saturday-first), ISO at API boundary; past dates disabled. |
| RTL & i18n | ✅ | `row-reverse` grids; Rial formatting + Persian digits; mirrored chevrons; copy from `booking.*`/`common.*`. |
| Accessibility | ✅ | `accessibilityRole` radio/button/alert/progressbar; targets ≥44px. |
| **Preserved hooks** | ✅ | `availability-screen`, `service-*`/`slot-*`/`day-*`, `booking-summary`/`-error`/`-loading`/`-success`, `confirm-button`. |

---

## F. Gaps & follow-ups

The redesign meets the §14 checklists across all surfaces. The remaining items
are **known, by-design limits** rather than defects in the screens:

1. **Light/dark + RTL + contrast are verified by proxy, not by eye in CI.**
   axe-core cannot compute `color-contrast` under jsdom, so contrast is proven
   numerically (`contrast.test.ts`) and re-checked by the Lighthouse gate on the
   prerendered pages. Per-screen visual confirmation in both themes is part of
   the manual pass below.
2. **Screen-reader / keyboard-only / expert review remain manual.** As stated in
   `accessibility.md` (R10.7), automated checks are a floor. Full WCAG 2.2 AA
   sign-off still needs VoiceOver/TalkBack/NVDA runs in **RTL/Farsi**,
   keyboard-only traversal of every flow, and expert review — not yet performed.
3. **CWV are budget/Lighthouse-verified, not field-verified.** LCP/INP/CLS are
   checked against prerendered URLs via Lighthouse and the `web-vitals` field
   hook is wired (task 11.3); real 75th-percentile field data requires
   production traffic.
4. **SEO host + placeholder data.** `robots.txt`/`sitemap.xml`/canonicals use the
   `https://example.ir` placeholder host and an enumerated salon list
   (`scripts/salons.json`); swap to the real host and salon feed at launch, and
   re-validate JSON-LD with Google's Rich Results Test.
5. **Mobile dark-mode + AT.** RN screens consume the themed tokens, but a device
   pass (light/dark, TalkBack/VoiceOver, dynamic-type) is a manual follow-up.

No code changes were required by this audit; all preserved test hooks
(`data-testid`, ARIA roles, `fa.json` section keys, `dir`/`lang` contract) are
intact and the web `tsc` + `vitest` gates pass.
