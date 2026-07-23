# Implementation Plan — Booksy-Faithful Frontend Redesign

## Overview

This plan converts the design into incremental, test-driven coding steps against the existing
`packages/web` app (React 18 + Vite + TS strict + react-router-dom v7 + react-i18next + Tailwind +
Radix + Framer Motion + vite-plugin-pwa) and the shared token source `packages/shared/src/tokens`.

Sequence: (1) lock the Booksy_Identity **token values** in lockstep across the two sources of
truth and update the enforcing tests; (2) re-skin and restructure the UI **primitives**; (3)
redesign each **surface** (home → business → register → discovery → profile → booking → owner →
auth/QR/legal); (4) wire **SEO / structured data**; (5) **performance / PWA**; (6) wire the
**required gates** (axe, Lighthouse CWV, public JS budget, code-split isolation, prerender content,
RTL/PWA non-regression) and confirm the token/contrast/distinctiveness/tokens-complete suites stay
green with the new palette.

Routes, the public/authenticated split, semantic token *names*, the i18n catalog structure, and
every backend API + API-client request/response shape are preserved. No backend changes.

Property tests reference the design's Correctness Properties and are tagged
`Feature: booksy-frontend-redesign, Property {n}`.

## Tasks

- [x] 1. Lock Booksy_Identity token values in lockstep (foundation)
  - [x] 1.1 Set the resolved light + dark palette in both token sources
    - Write the resolved hex values from the design's palette tables into
      `packages/shared/src/tokens/index.ts` (`lightColors` / `darkColors`) and
      `packages/web/src/styles/tokens.css` (`:root` + `[data-theme="dark"]`), keeping the two
      byte-identical for every semantic color role; preserve all existing semantic token names,
      the type/spacing/radius/elevation/z/motion tokens, and the display-vs-body invariant
      (`--font-weight-display` > body, `--line-height-display` < body)
    - Re-derive PWA `theme_color`/`<meta name="theme-color">` inputs from the new `--color-primary`
    - _Requirements: 2.1, 2.2, 2.5, 14.3_

  - [x] 1.2 Property test: token source parity
    - **Property 1: Token source parity**
    - **Validates: Requirements 2.2**
    - Update/confirm the assertion that `tokens.css` equals `@salon/shared` for every semantic
      color role in both themes

  - [x] 1.3 Property test: palette meets WCAG AA (update `contrast.test.ts` expectations)
    - **Property 2: Palette meets WCAG AA**
    - **Validates: Requirements 2.3, 2.4, 15.2**

  - [x] 1.4 Property test: display type never uniform with body type
    - **Property 5: Display type is never uniform with body type**
    - **Validates: Requirements 14.3**

  - [x] 1.5 Property test: distinctiveness guardrail (update `distinctiveness.test.ts` for the
        Booksy palette, no indigo/purple family, no raw literals, logical props only)
    - **Property 4: Distinctiveness guardrail flags iff a forbidden pattern is present**
    - **Validates: Requirements 2.7, 2.8**

  - [x] 1.6 Update `tokens-complete.test.ts` to assert role completeness for the new palette
    - Confirm every required role exists in both themes and the display/body invariant holds
    - _Requirements: 2.1, 2.5_

- [x] 2. Checkpoint — token layer green
  - Ensure the token, contrast, distinctiveness, and tokens-complete tests pass with the new
    values; ask the user if questions arise.

- [x] 3. Re-skin and restructure UI primitives (Component_Library)
  - [x] 3.1 Buttons, cards, badges, ratings to Booksy_Identity
    - Update `Button.tsx`, `IconButton.tsx` (teal primary fill, full interactive-state set,
      ≥44×44 touch targets, visible press feedback), `Card.tsx` (photography-forward variant:
      hero media slot, rounded corners, hover elevation), `Badge.tsx`, `Rating.tsx`,
      `RatingStars.tsx` (status = color + icon + text); tokens only, logical properties only
    - _Requirements: 2.7, 2.8, 13.3, 15.6_

  - [x] 3.2 Salon card + placeholder + service list
    - Restructure `SalonCard.tsx` to the booksy card (hero image → rating overlay → name →
      location → starting price in Rial/Persian digits), style `SalonPlaceholder.tsx` with the
      brand motif, and update `ServiceCardList.tsx` (grouped by category, per-service "Book")
    - _Requirements: 1.3, 6.1, 7.2, 12.5_

  - [x] 3.3 Booking primitives: stepper, slot grid, celebration
    - Update `BookingStepper.tsx`/`BookingFlowTransition.tsx` (visible step progress, state kept
      on back), `SlotGrid.tsx` (chip states available/selected/held/full/past distinguishable
      without color alone; selected uses teal), `Celebration.tsx` (emphasized-easing success)
    - _Requirements: 4.5, 8.1, 8.3, 8.4, 8.8, 15.6_

  - [x] 3.4 Jalali date primitives + filter bar
    - Update `JalaliDatePicker.tsx`, `JalaliDate.tsx`, `MobileDatePicker.tsx`, `DayScroller.tsx`
      (Persian month/weekday labels, bottom-sheet on mobile, lazy-loadable) and `FilterBar.tsx`
      (sticky/collapsible sort+filter chip bar, RTL)
    - _Requirements: 6.2, 8.3, 13.2, 14.5_

  - [x] 3.5 Localization primitives: Num, Money, DirText
    - Update `Num.tsx`, `Money.tsx`, `DirText.tsx` for Persian numerals everywhere, Rial
      formatting with thousands grouping + localized label, and `<bdi>`/`unicode-bidi: isolate`
      for mixed Persian/Latin/numeric runs
    - _Requirements: 14.4, 14.6, 14.8_

  - [x] 3.6 Property tests for localization primitives
    - **Property 6: All display digits are Persian** — **Validates: Requirements 14.4, 14.6**
    - **Property 7: Rial formatting preserves value and groups thousands** — **Validates: 14.6**
    - **Property 11: Bidi runs are isolated** — **Validates: Requirements 14.8**

  - [x] 3.6b Jalali/ISO + digit-normalization utilities
    - Ensure the date and digit utilities in `src/utils`/`src/lib` provide total, idempotent digit
      normalization and lossless Jalali⇄ISO conversion used at the API boundary only
    - _Requirements: 14.4, 14.5, 10.2_

  - [x] 3.7 Property tests for date/digit utilities
    - **Property 8: Jalali ⇄ ISO round-trips at the API boundary** — **Validates: Requirements 14.5**
    - **Property 9: Digit normalization is total and idempotent** — **Validates: 14.4, 10.2**

  - [x] 3.8 Image + data-surface + Radix overlay primitives
    - Update `Picture.tsx`/`ImageCarousel.tsx` (AVIF/WebP `srcset`, explicit width/height, lazy
      below fold, `fetchpriority="high"` hero), the data-surface set `Skeleton.tsx`/
      `EmptyState.tsx`/`ErrorState.tsx`/`Spinner.tsx`/`Toast.tsx`, and the Radix-backed
      `Dialog.tsx`/`Sheet.tsx`/`Tabs.tsx`/`Select.tsx`/`Switch.tsx`/`Checkbox.tsx`/
      `RadioGroup.tsx`/`TextField.tsx`/`Textarea.tsx`/`field.tsx` (visible labels, inline errors
      via `aria-describedby`, `aria-invalid`, focus trap, Esc close, focus restore, labeled)
    - Alt text: `Picture.tsx`/`ImageCarousel.tsx` require a meaningful Persian `alt` for
      content images and emit empty `alt=""` for purely decorative images so they are ignored by
      assistive tech
    - _Requirements: 12.2, 12.3, 12.4, 15.4, 15.5_

  - [x] 3.9 Icon mirroring policy
    - Ensure directional icons mirror under RTL by default and only the universal set (search,
      clock, checkmark) is exempt, in the shared icon helper used by the Component_Library
    - _Requirements: 14.7_

  - [x] 3.10 Property test: directional icons mirror iff not universal
    - **Property 10: Directional icons mirror iff not universal**
    - **Validates: Requirements 14.7**

  - [x] 3.11 Motion + editorial layout primitives to token-driven Booksy motion
    - Update `Motion.tsx`, `ScrollReveal.tsx`, `StaggerContainer.tsx`, `AnimatedCounter.tsx`,
      `ParallaxHero.tsx` (Framer Motion, transform/opacity only, reduced-motion aware, no raw
      duration/easing literals) and confirm `EditorialSplit.tsx`/`FeatureMosaic.tsx`/
      `SectionRhythm.tsx` support asymmetric layouts and section rhythm
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 3.12 Example tests: dialog/sheet focus behavior + reduced-motion
    - Assert each Dialog/Sheet traps focus, closes on Escape, restores focus to the trigger, and
      that `prefers-reduced-motion` disables transform animations while keeping opacity feedback
    - _Requirements: 4.4, 15.5, 15.8_

- [x] 4. Shells and navigation chrome
  - [x] 4.1 Understated public chrome + fail-closed owner nav
    - Update `AppShell.tsx` (header/nav/main/footer landmarks, skip link, understated chrome,
      single-`<h1>` guarantee), `FunnelShell.tsx` (no nav chrome during booking), `OwnerShell.tsx`
      + `OwnerBottomTabs.tsx` + `OwnerSidebar.tsx` (fail-closed: render Persian error state if the
      required nav for the active breakpoint fails to render), `HeaderAuthNav.tsx`, `RouteLoader.tsx`
    - Preserve existing route structure and public/authed split in `App.tsx`
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 9.6, 19.1_

  - [x] 4.2 Example tests: landmarks/single-h1 and fail-closed owner nav
    - Assert every rendered page exposes header/nav/main/footer + exactly one `<h1>`, funnel has
      no nav chrome, and the owner dashboard shows a Persian error state when required nav fails
    - _Requirements: 3.6, 9.6_

  - [x] 4.3 Example test: theme switch without full reload or layout shift
    - Assert toggling `ThemeToggle` flips `ThemeProvider`'s `data-theme` and updates token-driven
      styling in place (no navigation/full page reload, component instances preserved) and that
      layout geometry is unchanged across the switch (no layout shift)
    - _Requirements: 2.6_

- [x] 5. Checkpoint — primitives and shells green
  - Ensure all component and shell tests pass; ask the user if questions arise.

- [x] 6. Redesign Marketing Home `/`
  - [x] 6.1 Recompose `MarketingHome.tsx` to booksy-faithful layout
    - Hero (Persian display headline over salon photography + scrim, brand Motif divider),
      search-first entry point as the primary above-the-fold element, photography-forward
      `SalonCard` grid with staggered scroll-reveal, editorial "How It Works" (EditorialSplit/
      FeatureMosaic), `MetricsSection` with large Persian numerals, varied `SectionRhythm`
    - _Requirements: 3.2, 5.1, 5.2, 5.3, 5.4, 5.5, 12.1_

  - [x] 6.2 Update `MarketingHome.test.tsx` + `marketing-cta.test.tsx` + `MarketingHome.cwv.test.tsx`
    - Assert search-first hero, section rhythm, CTA wiring, and CWV budget markers
    - _Requirements: 5.1, 5.5, 5.6_

- [x] 7. Redesign Business Landing `/business` and Salon Registration `/business/register`
  - [x] 7.1 Recompose `BusinessLanding.tsx`
    - Persian display hero + value prop + CTA to `/business/register`; `OwnerBenefitsSection`
      editorial layout; varied section rhythm
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 7.2 Restyle `business/RegisterSalonPage.tsx`
    - Card-based onboarding, visible labels, inline Persian validation errors, `noindex`
    - _Requirements: 10.6_

  - [x] 7.3 Update `BusinessLanding.test.tsx`
    - Assert editorial layout, CTA target, and section rhythm
    - _Requirements: 11.1, 11.2_

- [x] 8. Redesign Discovery `/city/:city` and `/services/:type`
  - [x] 8.1 Recompose `DiscoveryPages.tsx`
    - `SalonCard` grid (hero photo, rating overlay, name, location, starting price Rial/Persian);
      sticky/collapsible `FilterBar`; responsive 3/2/1 columns with no horizontal overflow;
      skeleton cards while loading; styled Persian empty state with a clear next action
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 12.1, 13.1_

  - [x] 8.2 Update `DiscoveryPages.test.tsx`
    - Assert responsive columns, skeleton-on-load, and empty state
    - _Requirements: 6.3, 6.4, 6.5_

- [x] 9. Redesign Salon Profile `/s/:slug`
  - [x] 9.1 Recompose `SalonProfilePage.tsx`
    - Hero gallery, salon name in display type, location/rating, prominent teal "Book Now" → funnel;
      `ServiceCardList` grouped by category with per-service "Book"; info sections (description,
      hours with Iranian week Saturday-first, address with lazy map embed, staff gallery); apply
      Brand_Accent via scoped runtime tokens with AA-safe on-accent foreground; supply meaningful
      Persian `alt` for gallery/staff photos and `alt=""` for decorative imagery
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 12.1, 12.4_

  - [x] 9.2 Property test: tenant accent foreground stays AA (extend `tenant-contrast.test.ts`)
    - **Property 3: Tenant accent foreground stays AA**
    - **Validates: Requirements 7.5**

  - [x] 9.3 Update `SalonProfilePage.test.tsx`
    - Assert grouped services with per-service Book, hours ordering, and Book Now navigation
    - _Requirements: 7.2, 7.3, 7.4_

- [x] 10. Redesign Booking Flow `/salon/:salonId/book`, `/book/confirm`, `/booking/success`
  - [x] 10.1 Recompose booking service + date/time steps
    - Wire `BookingStepper` progress across `AvailabilityPage.tsx` (or the service/date-time step
      pages): photography-consistent service cards with animated select; `JalaliDatePicker` +
      `SlotGrid` chips (unavailable muted, not color-only); selected chip animates to teal;
      skeleton per step, Persian error + retry, no artificial delay; RTL keyboard focus order;
      step state retained on back
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7, 8.8, 13.2_

  - [x] 10.2 Recompose `BookingConfirmPage.tsx` and `BookingSuccessPage.tsx`
    - Confirmation summary card (service, Jalali date, time, Rial, salon); success celebration
      moment with booking details; render inside `FunnelShell` (no nav chrome)
    - _Requirements: 8.5, 8.6, 4.5_

  - [x] 10.3 Update booking tests (`BookingConfirmPage.test.tsx`, `BookingSuccessPage.test.tsx`,
        `BookingSuccessPage.reduced-motion.test.tsx`, `booking-flow-keyboard-a11y.test.tsx`,
        `AvailabilityPage.test.tsx`)
    - Assert step progress + back-state retention, slot selection feedback, summary contents,
      celebration, and RTL keyboard operability
    - _Requirements: 8.1, 8.4, 8.5, 8.6, 8.8_

- [x] 11. Checkpoint — public + funnel surfaces green
  - Ensure all page tests pass; ask the user if questions arise.

- [x] 12. Redesign Owner Dashboard `/owner/*`
  - [x] 12.1 Recompose `OwnerCalendarPage.tsx`
    - Day/week time-grid views, color-coded appointment blocks with service + customer info,
      animated view switches, RTL-correct arrow-key grid navigation and date nav; skeleton/empty/
      error+retry per surface
    - _Requirements: 9.1, 9.2, 9.7, 9.8_

  - [x] 12.2 Recompose `OwnerAnalyticsPage.tsx`
    - Minimal-chrome charts with teal highlights, Rial/Persian metrics (utilization, revenue,
      busiest windows); lazy-load the chart library
    - _Requirements: 9.3, 16.4_

  - [x] 12.3 Recompose `OwnerConfigurationPage.tsx`
    - Card-based sections for staff, services, chairs, holidays with inline edit affordances
    - _Requirements: 9.4_

  - [x] 12.4 Apply Booksy_Identity to remaining owner pages
    - Restyle `SubscriptionPage.tsx`, `OwnerTransactionsPage.tsx`, `OwnerNotificationsPage.tsx`,
      `MyQrPage.tsx`/`QrPage.tsx`/`StylistQrGallery.tsx` with consistent card sections and shared
      owner chrome; keep `noindex`
    - _Requirements: 9.5, 9.9_

  - [x] 12.5 Update owner tests + reuse property suites
    - Update `CalendarPage.test.tsx`, `CalendarPage.keyboard.test.tsx`, `AnalyticsPage.test.tsx`,
      `ConfigurationPage.test.tsx`, and the owner data-surface/error/metric-non-color property
      tests
    - _Requirements: 9.2, 9.7, 9.8, 15.6_

- [x] 13. Redesign Auth `/auth`, QR `/qr/:payload`, and Legal surfaces
  - [x] 13.1 Restyle `AuthPage.tsx`
    - Booksy_Identity, phone field + six-digit OTP with visible labels and resend timer, inline
      Persian errors tied to fields; phone/OTP kept Latin `dir="ltr"` internally, normalized on
      submit; countdown/helper digits shown as Persian numerals; `noindex`
    - _Requirements: 10.1, 10.2, 10.5, 14.4_

  - [x] 13.2 Restyle `QrLandingPage.tsx` and `LegalPages.tsx`
    - QR: salon intro + CTA into funnel, `noindex`; Legal: readable ~70ch columns, consistent
      typography, indexable
    - _Requirements: 10.3, 10.4, 10.5_

  - [x] 13.3 Update auth/QR/legal tests
    - Update `AuthPage.*` suites (OTP order, digit normalization, preservation), `QrLandingPage.test.tsx`,
      `LegalPages.test.tsx`
    - _Requirements: 10.1, 10.2, 10.4_

- [x] 14. SEO and structured data
  - [x] 14.1 Per-route head + JSON-LD via `SeoHead`/`JsonLd`/`config`
    - Confirm `SeoHead` defaults to `noindex`; set unique title/description/canonical + OG/Twitter
      (`og:locale=fa_IR`, 1200×630 image) + `hreflang` `fa-IR`+`x-default` on public routes; emit
      `WebSite`+`Organization` on home; `BeautySalon`/`HairSalon` + `Service` (IRR) +
      `BreadcrumbList` + `OpeningHoursSpecification` (Iranian week) on salon profile;
      `BreadcrumbList` on discovery
    - _Requirements: 5.7, 6.6, 7.6, 7.7, 11.4, 17.1, 17.3, 17.4, 17.6, 17.7_

  - [x] 14.2 robots.txt + sitemap generation
    - Ensure `public/robots.txt` allows public and disallows app/admin/api, and
      `scripts/generate-sitemap.mjs` lists only indexable URLs generated from the salon list
    - _Requirements: 17.2, 17.5_

  - [x] 14.3 Property tests: route indexability + sitemap consistency
    - **Property 12: Route indexability partition** — **Validates: 17.1, 17.2, 5.7, 8.9, 9.9, 10.5**
    - **Property 13: Sitemap contains only indexable URLs** — **Validates: 17.2, 17.5**
    - Update `noindex-routes.test.tsx`, `marketing-seo.property.test.tsx`, `seo-verification.test.tsx`

- [x] 15. Performance and PWA
  - [x] 15.1 Code-split isolation + lazy heavy assets
    - Confirm route-level `React.lazy` keeps owner bundles off public/funnel routes; lazy-load
      below-fold images, chart library, and the Jalali picker with reserved space to avoid CLS
    - _Requirements: 16.2, 16.4_

  - [x] 15.2 Prerender public routes with meaningful HTML
    - Confirm `scripts/prerender.mjs` emits primary content + head + JSON-LD into initial HTML for
      each public route while authed routes stay client-rendered
    - _Requirements: 16.3, 16.9_

  - [x] 15.3 PWA manifest + service worker preservation
    - Manifest: Persian name/short_name/description, icons 192/512 + maskable, `theme_color` from
      the primary token, `display:standalone`, `dir:rtl`, `lang:fa`, `start_url`; offline cached
      app shell; `<meta name="theme-color">` updates with theme; no cross-user auth-response caching
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

  - [x] 15.4 Non-regression tests: offline shell + no cross-user auth caching + font/bidi
    - Assert the SW serves a cached app shell offline, the caching strategy never leaks one user's
      authenticated API responses to another, Vazirmatn is preloaded with `font-display: swap`, and
      mixed runs use `<bdi>`/`unicode-bidi: isolate`
    - _Requirements: 18.5, 18.6, 14.9_

- [x] 16. Wire required build/CI gates
  - [x] 16.1 Public-route JS budget check
    - Ensure `scripts/analyze-bundle.mjs` fails the build if public-route initial JS exceeds
      ~150KB gzip
    - _Requirements: 16.5, 16.7_

  - [x] 16.2 Code-split isolation check
    - Add/confirm a build-time check that fails if any Owner_Dashboard bundle loads on public or
      funnel routes
    - _Requirements: 16.8_

  - [x] 16.3 Prerender content check + Lighthouse CWV gate
    - Ensure CI (`.github/workflows/web-a11y.yml` / `lighthouserc.json`) fails the build if a
      public route's prerendered HTML lacks primary content, or if measured LCP/INP-proxy/CLS
      exceed the thresholds (LCP<2.5s, INP<200ms, CLS<0.1)
    - _Requirements: 16.1, 16.6, 16.9, 16.10, 5.6_

  - [x] 16.4 Axe accessibility gate
    - Ensure the vitest axe checks run against key components/pages and fail the build on serious/
      critical violations in RTL
    - _Requirements: 15.1, 15.2, 15.3, 15.7_

- [x] 17. Final checkpoint — non-regression and full gate run
  - Run the full suite and gates; confirm the token, contrast, distinctiveness, tokens-complete,
    and axe suites pass with Booksy_Identity values and that no superseded magenta/noir or earlier
    teal treatment remains on any surface. Ensure all tests pass; ask the user if questions arise.
  - _Requirements: 15.7, 19.2, 19.3, 19.4, 19.5_

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core
  implementation tasks are never optional.
- Each task references the specific requirement clauses it satisfies for traceability.
- Property tasks each reference a single Correctness Property from the design and the requirement
  clause it validates.
- The token layer (Task 1) ships first and in lockstep so every downstream surface consumes stable
  semantic token names.
- Routes, the public/authenticated split, semantic token names, and API-client request/response
  shapes are preserved throughout; there are no backend changes.
- The axe, Lighthouse CWV, JS-budget, code-split-isolation, and prerender-content gates are
  REQUIRED and gating: a check that fails or does not run counts as not met.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.6"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6b", "3.8", "3.9", "3.11"] },
    { "id": 3, "tasks": ["3.6", "3.7", "3.10", "3.12", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "6.1", "7.1", "7.2", "8.1", "9.1", "13.1", "13.2"] },
    { "id": 5, "tasks": ["6.2", "7.3", "8.2", "9.2", "9.3", "10.1", "10.2", "12.1", "12.2", "12.3", "12.4", "13.3"] },
    { "id": 6, "tasks": ["10.3", "12.5", "14.1", "14.2", "15.1", "15.2", "15.3"] },
    { "id": 7, "tasks": ["14.3", "15.4", "16.1", "16.2", "16.3", "16.4"] }
  ]
}
```
