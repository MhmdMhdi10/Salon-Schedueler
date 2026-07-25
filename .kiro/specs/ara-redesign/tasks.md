# Implementation Plan: آرا (Ārā) Redesign

## Overview

This is a **presentation-only re-skin + re-composition** of the existing `packages/web` frontend
into the **آرا (Ārā)** brand — a boosky-adapted visual language kept fully Persian/RTL/Jalali/Rial
for the Iranian market. Tasks tune the token **values** (all three lockstep sources
byte-identical), rebrand to آرا, re-theme the `Motif`, re-skin/re-compose the component library and
each surface, reuse the real reference-clone assets, and land the property/example test suites.
Component APIs, routes, API-client shapes, the i18n catalog structure, and semantic token names are
reused unchanged; **no backend changes.**

Traceability is to the numbered **Goals, Scope & Locked Decisions** and the **Correctness
Properties** in `design.md` (there is no separate `requirements.md`; Design is the entry point).

Reference files: `packages/shared/src/tokens/index.ts`, `packages/web/src/styles/tokens.css`,
`.kiro/steering/ui-ux-skills.md`, `packages/web/src/styles/{contrast,distinctiveness,tokens-complete}.test.ts`,
`packages/web/src/components/**`, `packages/web/src/pages/**`, `packages/web/src/components/seo/**`,
`packages/web/public/manifest.json`, `packages/web/src/i18n/fa.json`, and the reference clone at
`/home/mti/Desktop/ai-website-cloner-template/public/**`.

> **Guardrail reminder (every task):** after the task, run `contrast.test.ts`,
> `tokens-complete.test.ts`, `distinctiveness.test.ts` + `npm run check` and keep them green.

## Tasks

- [x] 1. Brand + tokens foundation (آرا identity + tuned two-tier teal, byte-identical across all three sources)
  - [x] 1.1 Tune + write token values in `packages/shared/src/tokens/index.ts`
    - Keep the two-tier teal (deep `#0B7A68` primary, bright `#05CFA6` accent large-fill-only, `#116E60` secondary; luminous dark counterparts); apply any boosky-ward tuning **only within** the tuning boundaries; shape unchanged, values only. Editing `packages/shared` here is expected.
    - _Design: Token Strategy (two-tier teal, tuning boundaries); Goals 4, 5_
  - [x] 1.2 Mirror values into `tokens.css` + the `ui-ux-skills.md` palette table; establish the آرا brand
    - Make `:root` (light) + `[data-theme="dark"]` byte-identical to `@salon/shared` for every role; keep the `ui-ux-skills.md` table in lockstep; tokenize/soften shadows as needed.
    - Re-derive `manifest.json` `theme_color` from the light primary; confirm `<meta name="theme-color">` still switches per theme.
    - Re-theme `components/brand/Motif.tsx` from crossed-razors to the آرا adornment (petal/bloom arc) device — token-driven fills only, re-tints per theme + tenant, `aria-hidden`, size via `className`.
    - Rebrand the name token to آرا: `seo/config.ts` `SITE_NAME`, `manifest.json` `name`/`short_name`/`description`, and the brand-name occurrences in `fa.json` (`app.title`, `app.footer`, `auth.agreeSuffix`, `legal.*`, `business.*`); keep descriptive body copy.
    - _Design: Token Strategy, Brand Identity; Goals 1, 5, 6, 10, 11_
  - [x] 1.3 Update/confirm contrast guardrail expected pairings
    - If any token value changed, update `contrast.test.ts` expected values (test logic unchanged); otherwise confirm green.
    - **Property 1: Every shipped color pairing clears WCAG AA (both themes)** — Validates Goals 4, 7
  - [x] 1.4 Confirm token parity + display/body invariant
    - Assert `tokens.css` == `@salon/shared` per role in `tokens-complete.test.ts`; confirm `display weight > body` AND `display line-height < body`.
    - **Property 2: The three token sources are byte-identical** and **Property 4: display/body invariant** — Validates Goals 5, 7
  - _Guardrails: run contrast/tokens-complete/distinctiveness + `npm run check`; keep green._

- [x] 2. Global chrome (AppShell / FunnelShell / OwnerShell + آرا wordmark & Motif)
  - [x] 2.1 Re-skin `AppShell` header/nav/footer
    - Understated boosky chrome: minimal header/nav, single `<main>`, skip link, footer, `Motif` `mark` beside the آرا wordmark (display tokens); **tokenize the raw `bg-[#f5f5f6]` literal** and any other non-token literals so distinctiveness stays green.
    - _Design: Component Adaptation Inventory, Brand Identity; Goals 10, 13, 17_
  - [x] 2.2 Re-skin `FunnelShell`
    - No nav chrome during the funnel; sticky bottom CTA on mobile in the bottom third (thumb reach).
    - _Design: Per-Surface Composition; Goals 13, 17_
  - [x] 2.3 Re-skin `OwnerShell` / `OwnerBottomTabs` / `AdminShell`
    - Calendar-centric owner nav; sidebar on desktop, bottom tabs on mobile; single `<main>` per page.
    - _Design: Component Adaptation Inventory; Goal 17_
  - [x] 2.4 Verify `ThemeToggle` / `OwnerThemeToggle`
    - Toggle causes no reload and no layout shift; `<meta name="theme-color">` follows the active theme.
    - _Design: Component Adaptation Inventory; Goal 6_
  - [x] 2.5 Write render + axe test for shell structure
    - Header/nav/main/footer landmarks + skip link present; one `<h1>` slot per shell.
    - **Property 12: exactly one h1 + required landmarks** — Validates Goal 17
  - _Guardrails: run contrast/tokens-complete/distinctiveness + `npm run check`; keep green._

- [x] 3. Category icons (reference-clone SVGs → app taxonomy, boosky-style browser)
  - [x] 3.1 Copy + wire the real category SVGs
    - Copy the used SVGs into `packages/web/public/images/categories/` (or extract into `components/icons.tsx`); map to the app taxonomy (haircut/color/makeup/nails/skin/brows + barbershop); token-driven fill (`currentColor`/tokens), RTL-aware, Persian `aria-label`s. **No placeholders.**
    - _Design: Category Taxonomy & Icons, Asset Reuse Plan; Goals 8, 9, 13_
  - [x] 3.2 Build the boosky-style horizontal category browser
    - Reuse existing list/scroll patterns; wire into the `AppShell` category nav and the `MarketingHome` hero region; ≥ 44×44 targets; no horizontal overflow.
    - _Design: Category Taxonomy & Icons; Goals 8, 17_
  - [x] 3.3 Write property test for icon-mirroring classification
    - **Property 10: Icon mirroring matches directionality class** — Validates Goals 8, 13
  - _Guardrails: run contrast/tokens-complete/distinctiveness + `npm run check`; keep green._

- [x] 4. MarketingHome `/` (search-first hero, category browser, showcase, editorial rhythm)
  - [x] 4.1 Re-compose hero + search-first + section rhythm
    - Photography hero + scrim + `Motif` band, display-treatment Persian headline, search-first entry above the fold (LCP hero eager + `fetchpriority="high"` + preload); category browser; photography-forward `SalonCard` grid + `StaggerContainer`; editorial "How It Works" (`EditorialSplit`/`FeatureMosaic`); `MetricsSection` large Persian numerals; `SectionRhythm`.
    - _Design: Per-Surface Composition, Motion Approach; Goals 2, 9, 15, 17_
  - [x] 4.2 Wire `WebSite` + `Organization` JSON-LD (آرا) + indexable head
    - `SeoHead index` with unique title/description/canonical/OG; JSON-LD names = آرا.
    - _Design: SEO & Structured Data; Goals 10, 12_
  - [x] 4.3 Write render + axe test for MarketingHome structure
    - **Property 12: exactly one h1 + required landmarks** — Validates Goal 17
  - _Guardrails: run contrast/tokens-complete/distinctiveness + `npm run check`; keep green._

- [x] 5. `/business` (+ `/business/register`)
  - [x] 5.1 Re-compose `BusinessLanding`
    - Persian display hero + value prop + CTA; editorial rhythm; indexable `SeoHead`.
    - _Design: Per-Surface Composition; Goals 2, 12, 17_
  - [x] 5.2 Re-compose `business/RegisterSalonPage`
    - Card onboarding wizard; visible labels + inline Persian errors; `noindex`.
    - _Design: Per-Surface Composition; Goals 12, 19_
  - [x] 5.3 Write render + axe test (landing structure + register form errors)
    - **Property 12** (one h1 + landmarks) and **Property 16** (accessible form errors) — Validates Goals 17, 19
  - _Guardrails: run contrast/tokens-complete/distinctiveness + `npm run check`; keep green._

- [x] 6. `/s/:slug` salon profile
  - [x] 6.1 Re-compose hero + name + Book Now
    - Full-width gallery hero (`ImageCarousel`), display-treatment name, location, rating, prominent teal "Book Now" → `/salon/:salonId/book`.
    - _Design: Per-Surface Composition; Goals 2, 17_
  - [x] 6.2 Re-compose services + info sections + tenant accent
    - `ServiceCardList` grouped by category + per-service Book; description, Iranian-week opening hours, lazy map embed, staff gallery; tenant accent scoped via `TenantTheme` runtime vars (AA-safe).
    - _Design: Per-Surface Composition, Component Adaptation Inventory; Goals 2, 15, 16_
  - [x] 6.3 Wire salon JSON-LD + indexable head
    - `BeautySalon`/`HairSalon` (NAP), `Service` list (IRR), `BreadcrumbList`, `OpeningHoursSpecification` (Iranian week); OG uses salon hero image; `SeoHead index`.
    - _Design: SEO & Structured Data; Goal 12_
  - [x] 6.4 Write property tests for tenant accent + card content
    - **Property 11: tenant accent yields AA foreground** and **Property 7: cards render required localized fields** — Validates Goals 16, 8, 15
  - [x] 6.5 Write render + axe test for profile structure
    - **Property 12** (one h1 + landmarks), Book Now navigation — Validates Goal 17
  - _Guardrails: run contrast/tokens-complete/distinctiveness + `npm run check`; keep green._

- [x] 7. Discovery `/city/:city` + `/services/:type`
  - [x] 7.1 Re-compose grid, filters, states
    - Photography-forward `SalonCard` grid (3/2/1 responsive, no overflow), sticky/collapsible `FilterBar`, skeleton cards while loading (not a spinner), styled Persian empty state with next action; reuse `useInfiniteScroll`.
    - _Design: Per-Surface Composition; Goals 15, 17, 18_
  - [x] 7.2 Wire `BreadcrumbList` + indexable head
    - `SeoHead index`; breadcrumb JSON-LD matches the visible breadcrumb.
    - _Design: SEO & Structured Data; Goal 12_
  - [x] 7.3 Write render + axe test for discovery states + structure
    - Populated / loading-skeleton / empty; **Property 12** (one h1 + landmarks) and **Property 7** (card content) — Validates Goals 17, 8, 15
  - _Guardrails: run contrast/tokens-complete/distinctiveness + `npm run check`; keep green._

- [x] 8. Legal + trust `/about`, `/contact`, `/privacy`, `/terms`
  - [x] 8.1 Re-compose legal pages
    - ~70ch reading columns; آرا brand; indexable `SeoHead` + present in the sitemap.
    - _Design: Per-Surface Composition, SEO & Structured Data; Goals 10, 12, 17_
  - [x] 8.2 Write render + axe test for legal structure
    - **Property 12: exactly one h1 + required landmarks** — Validates Goal 17
  - _Guardrails: run contrast/tokens-complete/distinctiveness + `npm run check`; keep green._

- [x] 9. Auth `/auth` + QR `/qr/:payload`
  - [x] 9.1 Re-compose `AuthPage`
    - Phone + 6-digit OTP with visible labels, resend timer, inline Persian errors; phone/OTP `dir="ltr"`, bidi-isolated, digits normalized on submit; Persian display digits; `noindex`.
    - _Design: Per-Surface Composition; Goals 12, 15, 19_
  - [x] 9.2 Re-compose `QrLandingPage`
    - Salon intro + CTA into the funnel; branded, `noindex`.
    - _Design: Per-Surface Composition; Goal 12_
  - [x] 9.3 Write property/render tests for number formatting + form errors
    - **Property 8: number/currency formatting localized** and **Property 16: accessible form errors** — Validates Goals 15, 19
  - _Guardrails: run contrast/tokens-complete/distinctiveness + `npm run check`; keep green._

- [x] 10. Booking funnel `/salon/:salonId/book`, `/book/confirm`, `/booking/success`
  - [x] 10.1 Re-compose service step + stepper back-state
    - `BookingStepper` visible progress; service step photography card list with select animation; step state preserved on back navigation.
    - _Design: Per-Surface Composition, Motion Approach; Goals 17, 19_
  - [x] 10.2 Re-compose date/time step
    - `JalaliDatePicker` (Persian labels/digits) + `SlotGrid` — available chips selectable, unavailable distinguishable **without color**, selected animates to teal, bottom-sheet on mobile.
    - _Design: Per-Surface Composition; Goals 14, 15, 17_
  - [x] 10.3 Re-compose confirm + success + funnel chrome
    - Confirm summary card (service, Jalali date, time, Rial price, salon name); `BookingSuccessPage` `Celebration` (emphasized easing) + details; `FunnelShell` no chrome + sticky mobile CTA; keyboard-operable RTL focus order; `noindex`.
    - _Design: Per-Surface Composition, Motion Approach; Goals 12, 15, 17_
  - [x] 10.4 Write property tests for funnel + Jalali + non-color status
    - **Property 15: funnel preserves step state on back nav**, **Property 9: Jalali round-trip**, **Property 6: non-color status** — Validates Goals 19, 15, 14
  - [x] 10.5 Write render + axe test for funnel steps + form errors
    - Skeleton/error+retry states; **Property 16** (accessible form errors) and **Property 12** (structure) — Validates Goals 19, 17
  - _Guardrails: run contrast/tokens-complete/distinctiveness + `npm run check`; keep green._

- [x] 11. Owner/admin `/owner/*`
  - [x] 11.1 Re-compose calendar
    - `OwnerCalendarPage` day/week grid + time grid + color-coded appointment blocks (service + customer) + animated view transitions + RTL arrow navigation; keyboard view switching and grid-cell focus with correct RTL arrow direction.
    - _Design: Per-Surface Composition; Goals 14, 17_
  - [x] 11.2 Re-compose analytics
    - `OwnerAnalyticsPage` minimal-chrome charts with teal highlights; utilization + Rial/Persian-numeral revenue + busiest windows; chart lib lazy-loaded.
    - _Design: Per-Surface Composition; Goal 15_
  - [x] 11.3 Re-compose configuration + owner surfaces
    - `OwnerConfigurationPage` card sections with inline edit affordances (staff/services/chairs/holidays); subscription/transactions/notifications/QR surfaces re-skinned; sidebar desktop / bottom tabs mobile; skeleton / empty / error+retry; `noindex`; kept code-split off public/funnel routes.
    - _Design: Per-Surface Composition; Goals 12, 17_
  - [x] 11.4 Write render + axe test for owner surfaces
    - **Property 12** (one h1 + landmarks), keyboard nav, and **Property 6** (non-color status on calendar blocks) — Validates Goals 17, 14
  - _Guardrails: run contrast/tokens-complete/distinctiveness + `npm run check`; keep green._

- [x] 12. Responsive + RTL + theme QA
  - [x] 12.1 Cross-cutting sweep
    - No horizontal overflow at 360px; logical-property RTL sweep (no physical left/right for flow spacing); light + dark on every surface; reduced-motion; directional-icon mirroring with universal icons exempt; bidi isolation on mixed Farsi/Latin/number runs; ≥ 44×44px targets.
    - _Design: Motion Approach, Component Adaptation Inventory; Goals 13, 14, 15, 17_
  - [x] 12.2 Write cross-cutting property/axe suite
    - axe serious/critical = 0 in RTL across pages; **Property 3** (distinctiveness scan) and **Property 10** (icon mirroring) — Validates Goals 13, 8
  - _Guardrails: run contrast/tokens-complete/distinctiveness + `npm run check`; keep green._

- [x] 13. Final asset / parity audit
  - [x] 13.1 Asset + visual-parity pass
    - Confirm reference-clone asset reuse is complete with **no placeholders**; boosky visual-parity pass; confirm no superseded magenta / NYC-noir treatment (magenta hex, `from-indigo`/`to-purple`, crossed-razors remnants) remains anywhere in authored source.
    - _Design: Asset Reuse Plan, boosky Design-Language Adaptation; Goals 2, 9, 13_
  - [x] 13.2 SEO + brand consistency
    - Verify index/noindex + sitemap consistency across the full route table; manifest / JSON-LD / `SITE_NAME` all read آرا.
    - _Design: SEO & Structured Data, Brand Identity; Goals 10, 12_
  - [x] 13.3 Full suite + guardrails green + route policy
    - Run the full suite: `contrast.test.ts`, `distinctiveness.test.ts`, `tokens-complete.test.ts`, all property + render/axe tests, and `npm run check`; **Property 5** (route robots/sitemap policy). Record the manual-AT honesty note.
    - **Property 5: route robots/sitemap policy is consistent** — Validates Goal 12
  - _Guardrails: run contrast/tokens-complete/distinctiveness + `npm run check`; keep green._

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core
  re-skin/re-compose sub-tasks are never optional.
- Traceability is to `design.md`'s numbered **Goals, Scope & Locked Decisions** and the
  **Correctness Properties** (this spec has no separate `requirements.md`).
- This is a **presentation-only** change: component APIs, routes, API-client shapes, the i18n
  catalog structure, and semantic token names are reused unchanged; no backend changes.
- Task 1 edits `packages/shared` (the shared token source) — this is expected and required for the
  three sources to stay byte-identical.
- The `contrast` / `distinctiveness` / `tokens-complete` suites are the regression tripwire. Because
  the shipped values already pass, they stay green as long as any tuning respects the tuning
  boundaries and is mirrored across all three sources.
- Assets are reused from the real reference clone — **no placeholders**. The English boosky app
  screenshots (`images/app/*-en.webp`) are used as decorative device shots with Persian `alt`; a
  Persian capture swap is a known follow-up, not a placeholder.
- Automated checks are necessary but not sufficient; full WCAG 2.2 AA conformance still requires
  manual assistive-technology testing (RTL/Farsi) and expert review (Goal 20).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["2.1", "2.2", "2.3", "2.4", "3.1", "3.2"] },
    { "id": 4, "tasks": ["2.5", "3.3"] },
    { "id": 5, "tasks": ["4.1", "4.2", "5.1", "5.2", "6.1", "6.2", "6.3", "7.1", "7.2", "8.1"] },
    { "id": 6, "tasks": ["9.1", "9.2", "10.1", "10.2", "10.3", "11.1", "11.2", "11.3"] },
    { "id": 7, "tasks": ["4.3", "5.3", "6.4", "6.5", "7.3", "8.2", "9.3", "10.4", "10.5", "11.4"] },
    { "id": 8, "tasks": ["12.1"] },
    { "id": 9, "tasks": ["12.2"] },
    { "id": 10, "tasks": ["13.1", "13.2"] },
    { "id": 11, "tasks": ["13.3"] }
  ]
}
```
