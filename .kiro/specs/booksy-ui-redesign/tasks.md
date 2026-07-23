# Implementation Plan: Booksy-Faithful UI Redesign

## Overview

This is a **re-skin + re-composition** of the existing `packages/web` frontend — not a
greenfield build. Tasks re-skin the token **values** (both sources of truth), turn the three
guardrail suites green with updated expected values, then re-skin/re-compose the component
library, re-compose each page, wire motion, verify SEO/JSON-LD and PWA `theme_color`, and land
the property/example test suites. Component APIs, routes, and API client shapes are reused
unchanged; no backend changes.

Reference files: `packages/web/src/styles/tokens.css`,
`packages/shared/src/tokens/index.ts`, `packages/web/src/styles/{contrast,distinctiveness,tokens-complete}.test.ts`,
`packages/web/src/components/**`, `packages/web/src/pages/**`, `packages/web/src/components/seo/**`.

## Tasks

- [x] 1. Token re-skin to Booksy_Identity (both sources, byte-identical)
  - [x] 1.1 Re-skin shared token values in `packages/shared/src/tokens/index.ts`
    - Replace `lightColors` and `darkColors` values with the design's token-value contract (deep teal `#0B7A68` primary, bright `#05CFA6` accent, near-black/white foundation for light; luminous `#2DE0BE` primary for dark) — shape unchanged, values only
    - Keep non-color tokens (typography scale, display pairing, spacing, radius, elevation, motion) unchanged
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 17.3_

  - [x] 1.2 Mirror the same values into `packages/web/src/styles/tokens.css`
    - Update `:root` (light) and `[data-theme="dark"]` custom properties to be byte-identical to the shared source for every semantic color role
    - Re-tint/soften shadows for the clean foundation (neutral low-contrast light shadows; border + subtle shadow in dark; re-tint or drop authored `--shadow-glow` to faint teal)
    - _Requirements: 2.1, 2.2, 2.5, 2.6_

  - [x]* 1.3 Update `packages/web/src/styles/contrast.test.ts` expected values
    - Update expected pairings to the Booksy_Identity table; keep test logic unchanged
    - **Property 1: Every shipped color pairing clears WCAG AA (both themes)**
    - **Validates: Requirements 2.3, 2.4, 2.5, 13.2**

  - [x]* 1.4 Add/confirm token-parity assertions in `packages/web/src/styles/tokens-complete.test.ts`
    - Assert `tokens.css` values equal `@salon/shared` `lightColors`/`darkColors` for every role; confirm display/body invariant still holds
    - **Property 2: The two token sources are byte-identical** and **Property 4: display/body type pairing invariant**
    - **Validates: Requirements 2.2, 12.3, 17.5**

- [x] 2. Checkpoint - guardrail suites green after re-skin
  - Run `contrast.test.ts`, `tokens-complete.test.ts`, `distinctiveness.test.ts`. Ensure all pass with updated values, ask the user if questions arise.
  - _Requirements: 17.5_

- [ ] 3. Re-skin `components/ui` foundation primitives
  - [ ] 3.1 Re-skin `Button.tsx`, `Card.tsx`, `Badge.tsx`
    - Primary Button = deep-teal fill + white text; ghost/outline reads understated black-on-white; keep all interactive states and props unchanged
    - Card = cleaner surface, `--radius-lg`, low neutral shadow, photography-forward variant hook for `SalonCard`
    - Badge = rating-overlay style (star + Persian numeral) and status-as-text-on-tint; no API change
    - _Requirements: 2.7, 17.2_

  - [ ] 3.2 Re-skin `SalonPlaceholder.tsx` and `Picture.tsx`
    - `SalonPlaceholder` renders branded `Motif` + tokens (never gray box)
    - `Picture` emits AVIF/WebP + `srcset` + explicit `width`/`height`; `fetchpriority` support for LCP image
    - _Requirements: 10.2, 10.3, 10.5_

  - [ ]* 3.3 Write property test for `Picture` intrinsic dimensions
    - **Property 13: Images declare intrinsic dimensions to prevent layout shift**
    - **Validates: Requirements 10.2**

  - [ ]* 3.4 Write property test for `SalonPlaceholder` branded fallback
    - **Property 14: Missing salon imagery yields the branded placeholder**
    - **Validates: Requirements 10.5**

- [ ] 4. Re-skin status + card components (non-color signal, localized content)
  - [ ] 4.1 Re-skin `SlotGrid.tsx` states
    - available/selected/held/full/past distinguishable by fill + label + icon (not color alone); selected chip uses teal
    - _Requirements: 8.3, 8.4, 13.6_

  - [ ] 4.2 Re-skin `SalonCard.tsx` and `ServiceCardList.tsx`
    - `SalonCard`: large hero image, rating badge overlay, compact hierarchy (name → rating → location → starting price Rial/Persian numerals)
    - `ServiceCardList`: category-grouped list, per-service "Book" action pinned to logical `end`
    - _Requirements: 6.1, 7.2, 8.2_

  - [ ]* 4.3 Write property test for non-color status signalling
    - **Property 6: Status is never conveyed by color alone** (SlotGrid/Badge/Toast)
    - **Validates: Requirements 8.3, 13.6**

  - [ ]* 4.4 Write property test for card content + localization
    - **Property 7: Cards render all required fields with localized values**
    - **Validates: Requirements 6.1, 8.2**

- [ ] 5. Re-skin stepper, filter, rating, and localization primitives
  - [ ] 5.1 Re-skin `BookingStepper.tsx`, `FilterBar.tsx`, `RatingStars.tsx`/`Rating.tsx`
    - Stepper: visible progress (۱ خدمت · ۲ تاریخ · ۳ زمان · ۴ تایید), current step teal, completed step secondary-teal check
    - FilterBar: sticky/collapsible filter + sort chips
    - Rating: amber stars (universal, not mirrored), Persian-numeral review count
    - _Requirements: 6.2, 8.1_

  - [ ]* 5.2 Write property tests for `Num.tsx`/`Money.tsx` formatting
    - **Property 8: Number and currency formatting is localized**
    - **Validates: Requirements 12.4, 12.6**

  - [ ]* 5.3 Write property test for Jalali round-trip (`JalaliDate`/Jalali util)
    - **Property 9: Jalali date conversion round-trips**
    - **Validates: Requirements 12.5**

  - [ ]* 5.4 Write property test for icon-mirroring classification
    - **Property 10: Icon mirroring matches directionality class**
    - **Validates: Requirements 12.7**

- [ ] 6. Re-skin layout/section/brand and theme components
  - [ ] 6.1 Re-skin `components/layout` shells and `Motif`
    - `AppShell`: understated chrome (minimal header/nav, single `<main>`, skip link, footer, `Motif` mark beside wordmark)
    - `OwnerShell`/`OwnerSidebar`/`OwnerBottomTabs`: calendar-centric nav; `FunnelShell`: no chrome + sticky bottom CTA on mobile
    - `Motif` re-tints to teal via tokens
    - _Requirements: 3.1, 3.3, 9.5, 11.2_

  - [ ] 6.2 Re-skin `components/sections` composition helpers
    - `EditorialSplit`/`FeatureMosaic`/`SectionRhythm`/`MetricsSection` re-skinned; confirm tenant-accent path (`TenantTheme`/`tenantTokens.ts`) unchanged and token-driven
    - _Requirements: 5.3, 5.5, 7.5_

  - [ ]* 6.3 Write property test for tenant-accent AA foreground
    - **Property 11: Tenant accent always yields an AA-legible foreground** (`theme/tenantTokens`)
    - **Validates: Requirements 7.5**

- [ ] 7. Checkpoint - component re-skin
  - Ensure all component tests + `distinctiveness.test.ts` pass, ask the user if questions arise.
  - _Requirements: 2.7, 17.2_

- [ ] 8. Re-compose Marketing_Home (`MarketingHome.tsx`)
  - [ ] 8.1 Re-compose hero + search-first + section rhythm
    - Photography hero + scrim, display-treatment Persian headline, search-first entry above the fold as primary interaction; LCP hero eager + `fetchpriority="high"` + preload
    - Photography-forward `SalonCard` showcase with `StaggerContainer`; "How It Works" via `EditorialSplit`/`FeatureMosaic`; `MetricsSection` large Persian numerals; `SectionRhythm` alternates bg/surface
    - _Requirements: 3.2, 5.1, 5.2, 5.3, 5.4, 5.5, 10.1_

  - [ ]* 8.2 Write render + axe test for Marketing_Home structure
    - **Property 12: exactly one h1 + required landmarks** (this page)
    - **Validates: Requirements 3.4, 5.1**

- [ ] 9. Re-compose Discovery_Surface (`DiscoveryPages.tsx`)
  - [ ] 9.1 Re-compose grid, filters, states
    - Photography-forward `SalonCard` grid (3/2/1 responsive, no overflow), sticky/collapsible `FilterBar`, skeleton cards while loading (not spinner), styled Persian empty state with next action; reuse `useInfiniteScroll`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 10.1, 11.1_

  - [ ]* 9.2 Write render + axe test for Discovery states + structure
    - Populated / loading-skeleton / empty; one h1 + landmarks (**Property 12**)
    - _Requirements: 3.4, 6.4, 6.5_

- [ ] 10. Re-compose Salon_Profile (`SalonProfilePage.tsx`)
  - [ ] 10.1 Re-compose hero, services, info sections, Book Now
    - Full-width gallery hero (`ImageCarousel`), display-treatment name, location, rating, prominent teal "Book Now" → `/salon/:salonId/book`
    - `ServiceCardList` grouped by category; info sections (description, Iranian-week opening hours, address + lazy map embed, staff gallery); tenant accent via `TenantTheme`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 10.1_

  - [ ]* 10.2 Write render + axe test for Salon_Profile structure
    - One h1 + landmarks (**Property 12**), Book Now navigation
    - _Requirements: 3.4, 7.1, 7.4_

- [ ] 11. Re-compose Booking_Flow (`BookingConfirmPage.tsx`, `BookingSuccessPage.tsx`, funnel pages)
  - [ ] 11.1 Re-compose service → date/time → confirm steps
    - `BookingStepper` progress; service step photography card list with select animation; Jalali picker + `SlotGrid` (available chips selectable, unavailable muted/distinguishable without color, bottom-sheet on mobile); selected slot animates to teal; confirm summary card (service, Jalali date, time, Rial price, salon name)
    - No nav chrome during funnel; sticky bottom CTA in bottom third on mobile; skeleton while loading, Persian error + retry on failure; keyboard-operable RTL focus order
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.8, 11.2_

  - [ ] 11.2 Wire `Celebration` success moment
    - `BookingSuccessPage` presents `Celebration` with emphasized easing + booking details
    - _Requirements: 4.5, 8.6_

  - [ ]* 11.3 Write property test for funnel step-state preservation
    - **Property 15: booking funnel preserves step state on back navigation**
    - **Validates: Requirements 8.8**

  - [ ]* 11.4 Write render + axe test for booking steps + form errors
    - Skeleton/error+retry states; **Property 16: form fields signal errors accessibly**
    - **Validates: Requirements 8.7, 13.4**

- [ ] 12. Re-compose Owner_Dashboard (`pages/owner/**`)
  - [ ] 12.1 Re-compose calendar-centric dashboard
    - Apply Booksy_Identity; `OwnerCalendarPage` day/week views + time grid + color-coded appointment blocks (service + customer) + animated view transitions; `OwnerSidebar` desktop / `OwnerBottomTabs` mobile
    - Keyboard view switching, date nav, grid-cell focus with correct RTL arrow direction
    - _Requirements: 9.1, 9.2, 9.5, 9.7_

  - [ ] 12.2 Re-compose analytics + config pages
    - `OwnerAnalyticsPage`: metrics (utilization, Rial/Persian-numeral revenue, busiest windows) via minimal-chrome charts with teal highlights, chart lib lazy-loaded
    - `OwnerConfigurationPage`: staff/services/chairs/holidays card sections with inline edit affordances
    - Skeletons while loading; Persian error + cause + retry
    - _Requirements: 9.3, 9.4, 9.6, 14.4_

  - [ ]* 12.3 Write render + axe test for owner surfaces
    - One h1 + landmarks (**Property 12**), skeleton/error states, keyboard nav
    - _Requirements: 3.4, 9.6, 9.7_

- [ ] 13. Checkpoint - page re-composition
  - Ensure all page render/axe tests pass, no horizontal overflow at any breakpoint, ask the user if questions arise.
  - _Requirements: 11.1_

- [ ] 14. Motion re-skin verification
  - [ ] 14.1 Confirm token-driven, compositor-friendly, reduced-motion motion
    - Verify `ScrollReveal`/`StaggerContainer`/`ParallaxHero`/`Celebration`/`Motion` use only `--dur-*`/`--ease-*` tokens and animate only `transform`/`opacity`; reduced-motion drops transforms/parallax/particles, keeps opacity crossfades; ParallaxHero hero = photography + scrim (no gradient)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 14.2 Confirm motion property test passes (`styles/motion.property.test.ts`)
    - Token-only durations/easing; **Property 3** distinctiveness scan covers raw ms/easing
    - **Validates: Requirements 2.7, 4.2, 12.1**

- [ ] 15. SEO / structured data verification and PWA theme_color
  - [ ] 15.1 Verify index/noindex split and JSON-LD across pages
    - Public routes indexable (unique title/description/canonical, OG, `hreflang` fa-IR + x-default) via `SeoHead`; Marketing_Home JSON-LD `WebSite` + `Organization`; Salon_Profile JSON-LD `BeautySalon`/`HairSalon` (NAP), `Service` (IRR), `BreadcrumbList`, `OpeningHoursSpecification` (Iranian week); Discovery `BreadcrumbList`; funnel + owner + `/auth` + `/qr/:payload` `noindex` and out of sitemap
    - _Requirements: 5.7, 6.6, 7.6, 7.7, 8.9, 9.8, 15.1, 15.2, 15.3, 15.4, 15.6, 15.7_

  - [ ] 15.2 Re-derive PWA `theme_color` from new primary
    - Update `manifest.json` `theme_color` to the new light primary; confirm `<meta name="theme-color">` switches with active theme via `ThemeProvider`
    - _Requirements: 16.1, 16.4_

  - [ ]* 15.3 Write property test for route robots/sitemap policy
    - **Property 5: route robots/sitemap policy is consistent** (`components/seo` route-policy test)
    - **Validates: Requirements 8.9, 9.8, 15.1, 15.2, 15.5**

- [ ] 16. Final checkpoint - full suite + guardrails
  - Ensure `contrast.test.ts`, `distinctiveness.test.ts`, `tokens-complete.test.ts`, all property and render/axe tests pass; ask the user if questions arise.
  - _Requirements: 13.7, 17.5_

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core re-skin/re-compose tasks are never optional.
- Each task references specific requirement clauses and, where applicable, the design's correctness property it validates.
- This is a re-skin + re-composition: component APIs, routes, and API client shapes are reused unchanged; no backend changes.
- The `contrast`/`distinctiveness`/`tokens-complete` suites are the regression tripwire — updating token values in both sources turns them green with no test-logic change.
- Automated checks are necessary but not sufficient; full WCAG 2.2 AA conformance still requires manual assistive-technology testing and expert review (R13.8).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["3.1", "3.2", "4.1", "4.2", "5.1", "6.1", "6.2"] },
    { "id": 4, "tasks": ["3.3", "3.4", "4.3", "4.4", "5.2", "5.3", "5.4", "6.3", "14.1", "14.2"] },
    { "id": 5, "tasks": ["8.1", "9.1", "10.1", "11.1", "12.1", "12.2"] },
    { "id": 6, "tasks": ["11.2", "15.1", "15.2"] },
    { "id": 7, "tasks": ["8.2", "9.2", "10.2", "11.3", "11.4", "12.3", "15.3"] }
  ]
}
```
