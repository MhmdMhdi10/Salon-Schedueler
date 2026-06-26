# Implementation Plan: UI/UX Redesign

## Overview

This plan rebuilds the frontend's presentation layer incrementally, lowest-level first: design tokens → component primitives → app shell → SEO/rendering foundation → public pages → customer pages → admin pages → mobile screens → localization polish → accessibility → performance → final checkpoint. Each task composes from the work before it so there is no orphaned UI.

All work is **presentation only** — no backend, API-contract, or domain changes (R12.6). Every screen is consumed against the per-screen Design QA checklist in `.kiro/steering/ui-ux-skills.md`, and every public page against the SEO QA checklist in `.kiro/steering/seo-skills.md`. Token values, route indexability, JSON-LD shapes, and CWV budgets come verbatim from those two steering files, which are the governing standards.

Existing test hooks must be preserved so the current suites stay green: `dir="rtl"`/`lang="fa"` on the document and `App.tsx`; the `fa.json` section keys; the `manifest.json` fields; a `/sw.js` with `install`/`activate`/`fetch` handlers registered in `main.tsx`; and the admin/integration `data-testid`s and ARIA roles.

## Tasks

- [x] 1. Tooling and design tokens (web)
  - [x] 1.1 Add additive dependencies and configure Tailwind CSS v3
    - Install Tailwind + PostCSS/Autoprefixer, Radix UI primitives, lucide-react, Framer Motion, react-helmet-async, and the axe test helper as dev dep
    - Create `tailwind.config.js` with `darkMode: ['class', '[data-theme="dark"]']`, `content` globs over `src/**/*.{ts,tsx}`, and `theme.extend` mapping colors/spacing/radius/fontSize/zIndex/shadow/easing to CSS variables
    - Enable logical-property utilities (built-in `ms/me/ps/pe/start/end/text-start/text-end`; add `tailwindcss-logical` only if a gap appears)
    - _Requirements: 1.5, 1.7_
  - [x] 1.2 Author the global token stylesheet and import it once in `main.tsx`
    - `@tailwind base/components/utilities` plus `:root` (light) and `[data-theme="dark"]` token blocks using the exact palette/type/space/radius/shadow/z/motion values from `ui-ux-skills.md`
    - Add a CSS reset/normalize in the base layer; set body font stack `'Vazirmatn', system-ui, 'Segoe UI', Tahoma, sans-serif` and body line-height 1.75
    - _Requirements: 1.1, 1.4, 1.5, 1.6_
  - [x] 1.3 Self-host Vazirmatn and define color modes
    - Add the variable woff2 (subset to Arabic/Latin ranges), `@font-face` with `font-display: swap`, and a metrics-matched fallback; preload the above-the-fold weight
    - Verify light and dark token sets resolve and that no component references raw hex/px/ms
    - _Requirements: 1.2, 1.3, 7.1, 9.5, 9.6_
  - [x] 1.4 Export a shared TS token object for React Native parity
    - A pure `tokens.ts` shape (color/space/radius/type values only) consumable by both web and the mobile theme
    - _Requirements: 1.1, 6.1_

- [x] 2. Core accessible component primitives (R2 inventory), with component tests + axe
  - [x] 2.1 Buttons, inputs, and form fields
    - Button/IconButton (variants: primary/secondary/ghost/danger; all six interaction states incl. loading + `aria-busy`; ≥44×44 targets); TextField/Textarea with visible label, helper, error (text+icon, `aria-describedby`, `aria-invalid`)
    - _Requirements: 2.1, 2.2, 2.4, 2.6, 2.7_
  - [x] 2.2 Selection and overlay primitives on Radix
    - Select, Checkbox, Radio, Switch, Dialog/Modal (focus trap + Esc/overlay close + focus restore), Sheet/Drawer (bottom-sheet on mobile, safe-area aware), Tabs (RTL arrow-key nav), Tooltip
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.9_
  - [x] 2.3 Display, feedback, and status components
    - Card, Badge/Chip (status = color + icon + text), Toast (live-region announce + optional undo), Skeleton, Spinner, Empty-State, Error-State (cause + retry), Avatar
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 2.10_
  - [x] 2.4 Jalali date picker, time/slot components, and formatters
    - JalaliDatePicker (Radix Popover + grid, Persian months/weekdays/digits, Iranian-week order, ISO only at the API boundary); SlotGrid/slot chip with the five slot states; `<Money>` (Rial), `<JalaliDate>`, `<Num>`, and a `<bdi>`/DirText bidi helper
    - _Requirements: 2.1, 2.8, 7.2, 7.3, 7.4, 7.5_
  - [x] 2.5 Component tests + axe checks for every primitive
    - Testing Library state coverage and a `vitest-axe` assertion failing on serious/critical violations; RTL mirroring of directional iconography verified
    - _Requirements: 2.2, 2.3, 2.9, 10.4, 12.4_

- [x] 3. App shell, layout, header, navigation, and theme + language/RTL handling
  - [x] 3.1 ThemeProvider with persisted light/dark and OS fallback
    - Resolve theme (localStorage → `prefers-color-scheme` → light), set `data-theme` on `<html>`, sync `<meta name="theme-color">` per theme; header theme toggle with no reload / no layout shift
    - _Requirements: 1.8, 3.3, 3.4, 11.4_
  - [x] 3.2 App shell, landmarks, and responsive layout
    - Replace the bare wrapper in `App.tsx` with header/`main`/footer, skip-to-content link, single `<main>`, RTL logical layout; keep `dir="rtl"`/`lang="fa"`; responsive at sm/md/lg/xl with no 360px overflow
    - _Requirements: 3.1, 3.2, 3.5, 3.8_
  - [x] 3.3 Customer funnel shell and admin shell
    - Funnel: top bar + stepper (۱ خدمت · ۲ تاریخ · ۳ زمان · ۴ تایید) + centered card (max ~480px) + sticky bottom CTA clearing safe-area; Admin: side/top nav + breadcrumbs on desktop, bottom tab bar (تقویم · آمار · تنظیمات) on mobile
    - _Requirements: 3.1, 3.2, 3.6_
  - [x] 3.4 Route-level code splitting and loading UI
    - `React.lazy` + `Suspense` for `/admin/*`, Jalali picker, and charts; non-blocking route loader that reserves layout (no CLS)
    - _Requirements: 3.7, 9.3_

- [x] 4. SEO and rendering foundation
  - [x] 4.1 HelmetProvider + `<SeoHead>` and `<JsonLd>` components
    - Wrap the app in `HelmetProvider`; `<SeoHead>` centralizes title template («{صفحه} | رزرو سالن»), meta description, absolute canonical (single host, params stripped), robots directive, OG/Twitter (`og:locale=fa_IR`, 1200×630 image), and `hreflang` (`fa`/`fa-IR` + `x-default`); **default to `noindex`** so pages opt in to indexing
    - _Requirements: 8.2, 8.3, 8.6, 8.7_
  - [x] 4.2 Apply `noindex` to all app/admin/auth/funnel routes
    - `noindex,follow` on `/`(old login)/`/auth`, `/qr/:payload`, `/salon/*/book`, `/.../confirm`, `/booking/success`, `/admin/*`; ensure none are in the sitemap
    - _Requirements: 8.7_
  - [x] 4.3 robots.txt and build-time sitemap.xml
    - `public/robots.txt` allowing public pages and disallowing `/auth`,`/admin/`,`/salon/*/book`,`/booking/`,`/qr/`,`/api/` with a `Sitemap:` line; generate `sitemap.xml` from the salon list at build, indexable URLs only, with `<lastmod>`
    - _Requirements: 8.4, 8.5_
  - [x] 4.4 Public-route prerender (SSG) build step
    - Prerender `/`, legal pages, and `/s/:slug` (enumerated slugs) so content + meta + JSON-LD are in initial HTML; add the server rewrite/host-fallback note for deep links; verify via View Source
    - _Requirements: 9.1, 9.2_
  - [x] 4.5 PWA manifest + service worker polish
    - Extend `manifest.json` with a 512×512 maskable icon (+ optional screenshots); author the SW via `vite-plugin-pwa` `injectManifest` emitting `/sw.js` with `install`/`activate`/`fetch` handlers (precache shell; salon images CacheFirst; public API GETs StaleWhileRevalidate; never cache authed/`noindex` HTML) so `main.tsx` still registers `/sw.js`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [x] 5. Public marketing and salon-profile pages (indexable, SEO-complete)
  - [x] 5.1 Marketing home at `/`
    - Hero + value prop + primary CTA, trust/legal footer; `<SeoHead>` index + `WebSite`/`Organization` JSON-LD; LCP-optimized hero (preloaded image + font, `fetchpriority="high"`); move the login surface fully to `/auth`
    - _Requirements: 8.1, 8.2, 8.3, 8.8, 9.1, 9.4_
  - [x] 5.2 Public salon profile at `/s/:slug`
    - Single `<h1>`, services/hours (Iranian week)/gallery (sized, lazy, Persian `alt`)/lazy map embed, NAP block, CTA → funnel; JSON-LD `BeautySalon`+`Service`(`priceCurrency:"IRR"`)+`BreadcrumbList`; ASCII slug + self-canonical
    - _Requirements: 8.1, 8.3, 8.4, 8.8, 9.1_
  - [x] 5.3 (Optional) discovery and legal pages
    - `/city/:city` and `/services/:type` with real differentiated content; `/about|/contact|/privacy|/terms`; all indexable, in sitemap, SEO-complete
    - _Requirements: 8.1, 8.4, 8.8_

- [x] 6. Customer pages redesign (one sub-task per page)
  - [x] 6.1 Auth page (`AuthPage.tsx`)
    - Centered card; phone step (`tel`/`dir=ltr`/`autoComplete=tel`, `^09\d{9}$`, digit normalization) + OTP step (6 boxes, `one-time-code`, paste, auto-advance, resend timer in Persian digits); loading/error states; «کد ارسال شد» toast; preserve the `role="alert"` error and `auth-page` testID
    - _Requirements: 4.1, 4.2, 7.6, 10.6_
  - [x] 6.2 QR landing (`QrLandingPage.tsx`)
    - Skeleton while resolving; salon header + primary CTA «انتخاب خدمت»; distinct malformed vs unregistered error states; keep `qr-landing` testID
    - _Requirements: 4.3, 2.3_
  - [x] 6.3 Availability (`AvailabilityPage.tsx`)
    - Service selector with Rial price; Jalali date picker (bottom sheet on mobile) replacing native date input; slot chip grid with skeleton → empty → populated and the five slot states; preserve `availability-page` testID and selection-state-on-back
    - _Requirements: 4.4, 7.2, 7.5, 7.8, 2.3_
  - [x] 6.4 Booking confirm (`BookingConfirmPage.tsx`)
    - Summary (service, Jalali date/time, Rial price, deposit notice); sticky CTA «تایید رزرو»; idle/loading/payment-redirect/error states; abandon warning; preserve `booking-confirm` testID; never fake success
    - _Requirements: 4.5, 7.2, 7.5_
  - [x] 6.5 Booking success (`BookingSuccessPage.tsx`)
    - Success moment (reduced-motion-aware), what/when/where summary, clear next action; preserve `booking-success` testID
    - _Requirements: 4.6, 1.6_

- [x] 7. Admin pages redesign (one sub-task per page)
  - [x] 7.1 Configuration (`admin/ConfigurationPage.tsx`)
    - Sectioned cards (Staff/Chairs/Services/Holidays) with anchor nav + breadcrumbs and inline add forms; advanced options disclosure; loading/empty/error states; confirm + undo on destructive actions; preserve `admin-configuration`, `config-loading`, `config-error`, and list testIDs
    - _Requirements: 5.1, 5.4, 5.5, 2.3_
  - [x] 7.2 Calendar (`admin/CalendarPage.tsx`)
    - Radix Tabs day/week (preserve `role="tab"`/`aria-selected`); day time-rail and week 7-col Saturday-first grid; appointment blocks with Jalali time + status badge; loading/empty/error; preserve `admin-calendar`/`calendar-*` testIDs
    - _Requirements: 5.2, 5.5, 7.2, 2.3_
  - [x] 7.3 Analytics (`admin/AnalyticsPage.tsx`)
    - KPI cards (utilization %, Rial revenue, busiest window) + legible tables/lazy charts with tabular numerals and logical-`end` numeric alignment; loading/empty/error; preserve `admin-analytics`/`analytics-*` testIDs
    - _Requirements: 5.3, 5.4, 7.5, 2.3_

- [x] 8. Mobile React Native screens redesign (one sub-task per screen)
  - [x] 8.1 RN ThemeProvider from shared tokens
    - Map `tokens.ts` to an RN theme (color/space/radius/type); RTL + Persian typography baseline; no logic changes
    - _Requirements: 6.1, 6.5_
  - [x] 8.2 AuthScreen (`screens/AuthScreen.tsx`)
    - Themed phone/OTP inputs, primary button with loading, OTP resend timer, error via existing `auth-error` testID; Persian digits + RTL
    - _Requirements: 6.2, 7.4, 7.5_
  - [x] 8.3 QrScanScreen (`screens/QrScanScreen.tsx`)
    - Themed scan frame + idle/resolving/resolved/error states; keep distinct malformed vs unregistered messaging and `qr-loading`/`qr-error`/`qr-success` testIDs
    - _Requirements: 6.3, 7.5_
  - [x] 8.4 Availability/booking screen
    - Build the screen UI shell (service/date/slot + booking) with loading/empty/error/success, Jalali picker, Persian digits, RTL, consistent with the web funnel
    - _Requirements: 6.4, 7.2, 7.5_

- [x] 9. Localization, RTL, Jalali, numerals, and Rial polish pass (all UI)
  - [x] 9.1 i18n catalog completeness
    - Move all redesigned copy into `fa.json` under `auth.*/booking.*/salon.*/admin.*/common.*`; no hard-coded Farsi in JSX; keep existing section keys intact
    - _Requirements: 7.1, 12.2_
  - [x] 9.2 Jalali + numerals + Rial everywhere
    - Apply `<JalaliDate>`/`<Num>`/`<Money>` across all surfaces; Persian digits for display, Rial formatting with grouping, machine data in IRR; verify Gregorian↔Jalali round-trip via the shared utilities
    - _Requirements: 7.2, 7.3, 7.4, 7.5_
  - [x] 9.3 RTL correctness sweep
    - Audit for any physical `left/right`/`float`/`translateX` assumptions; confirm logical properties throughout, mirrored directional icons (not universal), and `<bdi>`-isolated mixed Latin/Persian/number runs; LTR-isolated phone/OTP inputs inside RTL
    - _Requirements: 7.6, 7.7, 7.8_

- [x] 10. Accessibility pass (WCAG 2.2 AA targets)
  - [x] 10.1 Keyboard, focus, and landmarks
    - Logical RTL focus order, visible focus-ring (focus-appearance/non-text-contrast), dialog/sheet focus management, single-`<h1>`/ordered-heading audit per page
    - _Requirements: 10.2, 10.3, 3.8_
  - [x] 10.2 Contrast, text alternatives, and forms
    - Verify AA contrast in light+dark for all token pairs and states; meaningful `alt` (or decorative `alt=""`); programmatic labels/error identification on every form
    - _Requirements: 1.3, 10.5, 10.6_
  - [x] 10.3 Automated a11y in CI + manual-testing note
    - Wire axe checks into the component/page suites and Lighthouse a11y into CI as a gate; document that automated checks are a floor and that full AA conformance requires manual AT testing (VoiceOver/TalkBack/NVDA in RTL/Farsi), keyboard-only runs, and expert review
    - _Requirements: 10.1, 10.4, 10.7_

- [x] 11. Performance pass (Core Web Vitals)
  - [x] 11.1 Bundle and code-split verification
    - Confirm funnel/admin/charts/Jalali picker are not loaded on public pages; initial public-page JS ≤ ~150KB gzip
    - _Requirements: 9.3_
  - [x] 11.2 Font and image optimization
    - Subset/preload Vazirmatn with `swap` + fallback metrics; responsive `srcset` + AVIF/WebP, lazy below the fold, explicit dimensions/`aspect-ratio`; `fetchpriority="high"` hero
    - _Requirements: 9.5, 9.6_
  - [x] 11.3 CWV verification + field reporting
    - Verify LCP < 2.5s, INP < 200ms, CLS < 0.1 on a mid-range mobile profile via Lighthouse on prerendered URLs; wire `web-vitals` field reporting
    - _Requirements: 9.4_

- [x] 12. Final checkpoint: green build + per-screen QA
  - [x] 12.1 Full build and test sweep across workspaces
    - `packages/web` build (tsc + vite) and `vitest` green (incl. preserved i18n-rtl, pwa, admin, integration tests); `packages/mobile` `tsc --noEmit` and Jest green; no type errors
    - _Requirements: 12.2, 12.3, 12.5, 12.6_
  - [x] 12.2 Apply the Design QA and SEO QA checklists per screen
    - Run the `ui-ux-skills.md` per-screen checklist (states, light+dark, RTL, contrast, keyboard, empty/error) on every redesigned screen and the `seo-skills.md` per-page checklist on every indexable page; record results
    - _Requirements: 12.1, 8.2, 8.3, 8.4, 8.7, 10.1_
