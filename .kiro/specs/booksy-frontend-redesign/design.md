# Design Document — Booksy-Faithful Frontend Redesign

## Overview

This design specifies an end-to-end frontend redesign of the Salon Booking PWA
(`packages/web`) to a visual identity faithful to the real **booksy.com**: a deep interactive
teal action color over a clean, high-contrast black/white minimal foundation, photography
carrying the color, understated chrome, search-first discovery, and a calendar-centric owner
dashboard.

Unlike a pure re-skin, this redesign permits **deeper structural changes to component internals
and page layouts** wherever a closer match to booksy's real look requires it — while keeping the
semantic token *names*, the route paths, the public/authenticated split, and every backend API
contract and API-client request/response shape unchanged. It **supersedes the visual direction**
of both prior specs (`booksy-newyork-redesign` magenta/noir and `booksy-ui-redesign` teal
re-skin), replacing them with a single cohesive Booksy_Identity direction and keeping the shared
foundation (routing, i18n catalog, PWA, SEO route split, a11y patterns, tokens-only architecture)
intact.

Stack (unchanged): React 18 + Vite + TypeScript (strict) + `react-router-dom` v7 +
`react-i18next` (default `fa`, RTL) + Tailwind CSS + Radix UI + Framer Motion + `vite-plugin-pwa`.

The governing design source is `docs/design-research/booksy-analysis.md`, supplemented by
best-effort fresh reference gathering. booksy.com blocks automated scraping, so where live
references are inaccessible the documented analysis governs (Assumption 5).

### What changes vs. what is reused

| Layer | Action |
| --- | --- |
| `tokens.css` + `@salon/shared` token **values** | Booksy_Identity (teal/black-white) — already shipped; verified in lockstep |
| `contrast.test.ts`, `distinctiveness.test.ts`, `tokens-complete.test.ts` | Kept enforcing; expected values track the palette; docstrings updated to Booksy_Identity |
| Component library (`components/**`) | Re-skin **and** deeper structural changes; component APIs, token names preserved |
| Pages (`pages/**`) | Re-compose layout + section rhythm; deeper structural changes permitted; routes unchanged |
| `App.tsx` routing, public/authed split, code-splitting | Reused unchanged |
| API client (`api/**`), backend, Prisma schema | Untouched |
| i18n catalog (`fa.json`) | Add keys only; no hard-coded Farsi in JSX |
| PWA manifest / service worker | Reused; only `theme_color` re-derived from the primary token |
| Steering (`ui-ux-skills.md`, `signature-design-language.md`) | Already document Booksy_Identity; kept in lockstep |

### Resolved design decisions (Requirement 1.4)

- **Two-tier teal.** booksy's literal `#05CFA6` fails WCAG AA (~2.0:1) as small text on white.
  Resolution: `--color-primary = #0B7A68` (deep teal, AA in both directions) for CTAs, links,
  small teal text, icons, and the focus ring; `--color-accent = #05CFA6` reserved for large
  decorative fills with dark ink overlaid. This is the shipped palette and passes
  `contrast.test.ts`.
- **Fidelity over prior interpretations.** Where a prior spec's magenta/noir or earlier teal
  composition conflicts with booksy's real look, this design follows booksy (Requirement 19.4);
  no superseded treatment remains on any redesigned surface.
- **Structural changes are allowed** (Assumption 4): component internals and page layouts may be
  restructured for a closer match, provided token names, routes, and API-client shapes are stable.

---

## Architecture

### Token flow (architecture unchanged, values are Booksy_Identity)

```
packages/shared/src/tokens/index.ts   ← pure values (lightColors / darkColors / typography …)
        │  (byte-identical semantic color values)
        ▼
packages/web/src/styles/tokens.css    ← :root (light) + [data-theme="dark"] custom properties
        │  (var(--token) / Tailwind theme mapping)
        ▼
Component_Library + pages             ← consume tokens ONLY (no raw hex/px/ms; logical props only)
        │
        ├── contrast.test.ts          ← imports @salon/shared, asserts every pairing ≥ AA
        ├── tokens-complete.test.ts   ← asserts role completeness + display/body type invariant
        └── distinctiveness.test.ts   ← scans authored source for generic/raw-literal regressions
```

The two token sources stay byte-identical for semantic color values; the CI suite fails if they
drift, if any pairing drops below AA, or if authored source reintroduces a raw literal / physical
property / indigo-purple family.

### Rendering / routing (reused unchanged — Requirement 19.1)

`App.tsx` stays: `HelmetProvider` → `ThemeProvider` → `BrowserRouter` → `AuthProvider`, with
`React.lazy` route-level code splitting. The owner panel (`/owner/*`) renders outside `AppShell`
in its own `OwnerShell` via `OwnerLayout` (auth bootstrap + RBAC). Public + customer surfaces
render inside `AppShell` with `PageTransition`. The booking funnel is wrapped in
`FunnelTenantTheme` for per-salon Brand_Accent. Legacy `/admin/*` paths redirect into `/owner/*`.

- Public routes (`/`, `/business`, `/s/:slug`, `/city/:city`, `/services/:type`, legal) remain
  prerender/SSR targets and indexable.
- Authenticated + transactional routes (booking funnel, `/owner/*`, `/auth`, `/qr/:payload`,
  `/business/register`) remain client-rendered and `noindex`.

### Layering strategy

The redesign is a *layering* on the tokenized, RTL-first foundation: components keep consuming the
same semantic token names; what changes is (1) token **values**, (2) the display-type pairing,
(3) the brand `Motif`, (4) layout rhythm via the editorial primitives, and (5) deeper per-surface
structural composition where a closer booksy match warrants it.

---

## Design Token Strategy

### Light palette (`:root`) — resolved hex, AA-verified

| Token | Value | Role | AA note |
| --- | --- | --- | --- |
| `--color-bg` | `#FFFFFF` | Page background | — |
| `--color-surface` | `#F5F6F7` | Cards, sheets, alt sections | text ≥ 4.5:1 |
| `--color-elevated` | `#FFFFFF` | Menus, dialogs, popovers | — |
| `--color-text` | `#111417` | Primary near-black ink | 18.x:1 on white |
| `--color-text-muted` | `#586170` | Secondary/help text | ≥ 4.5:1 on bg/surface |
| `--color-border` | `#E4E7EA` | Dividers, input borders | decorative (exempt) |
| `--color-primary` | `#0B7A68` | Deep teal CTA, links, small teal text, icons | ~5.25:1 both directions |
| `--color-primary-contrast` | `#FFFFFF` | Ink on primary | 5.25:1 on primary |
| `--color-secondary` | `#116E60` | Secondary emphasis, completed-step badge | ≥ 3:1 non-text/large |
| `--color-accent` | `#05CFA6` | Bright signature teal — large fills only, dark ink | not AA as small text |
| `--color-success` | `#1F7A43` | Booked, paid, confirmed | ≥ 4.5:1 as text |
| `--color-warning` | `#9A5B12` | Expiring OTP, low slots | ≥ 4.5:1 as text |
| `--color-danger` | `#B3261E` | Failed pay, cancel, errors | ≥ 4.5:1 as text |
| `--color-info` | `#1F5FAE` | Neutral notices | ≥ 4.5:1 as text |
| `--color-focus-ring` | `#0B7A68` | Focus outline | ≥ 3:1 on bg/surface/elevated |

### Dark palette (`[data-theme="dark"]`) — resolved hex, AA-verified

| Token | Value | Role |
| --- | --- | --- |
| `--color-bg` | `#0F1111` | Near-black page bg |
| `--color-surface` | `#181B1B` | Dark cards, sheets |
| `--color-elevated` | `#222626` | Menus, dialogs |
| `--color-text` | `#F4F6F6` | Luminous primary ink |
| `--color-text-muted` | `#A6ADAD` | Secondary text |
| `--color-border` | `#2A2F2F` | Dark dividers |
| `--color-primary` | `#2DE0BE` | Luminous teal action |
| `--color-primary-contrast` | `#0F1111` | Dark ink on luminous teal |
| `--color-secondary` | `#4FE3C8` | Secondary emphasis |
| `--color-accent` | `#38E0C0` | Luminous signature fill |
| `--color-success` | `#69D08C` | Confirmed |
| `--color-warning` | `#E7B45C` | Warning |
| `--color-danger` | `#F2938C` | Error/cancel |
| `--color-info` | `#86B6F0` | Notices |
| `--color-focus-ring` | `#2DE0BE` | Focus outline |

Dark mode uses border + subtle near-black shadow for depth (heavy colored glows read poorly on
dark), preserving the high-contrast minimal character rather than "invert and ship."

### Non-color tokens (reused, unchanged)

- **Type scale** `--font-2xs … --font-2xl`, heroic display scale `--font-3xl/4xl/5xl` (48/60/72px).
- **Display pairing** `--font-weight-body:400`, `--font-weight-display:800`,
  `--line-height-display:1.15`, `--tracking-display:-0.02em`. Invariant (enforced): display weight
  > body weight AND display line-height < body line-height.
- **Spacing** 8pt grid; **radius** sm/md/lg/pill; **elevation** shadow-1/2/3; **z-index** ladder;
  **motion** `--dur-fast/base/slow/enter/exit/stagger/celebration` + `--ease-standard/emphasized/
  spring/decelerate`.

### Token consumption rules (guardrail-enforced)

- Components consume tokens only — no raw hex/px/ms in authored styles (`distinctiveness.test.ts`).
- CSS logical properties only for flow-relative spacing — no physical `left`/`right`; `rtl:`/`ltr:`
  variants are the sanctioned sign-flip escape hatch; rare literals opt out with
  `// distinctiveness-ok: <reason>`.
- Tenant Brand_Accent injected as runtime CSS custom properties on the scoped `TenantTheme`
  wrapper only, never as authored literals; on-accent foreground derived via
  `styles/contrast.ts` (`ensureAaFill` / `onAccentForeground`) to guarantee AA.

### Two sources of truth kept in lockstep

`packages/web/src/styles/tokens.css` and `packages/shared/src/tokens/index.ts` hold identical
semantic color values (byte-identical). The steering palette table is the third reference and is
already aligned. Any value change updates all three plus the test expectations in the same change.

---

## Component Inventory and Structural Changes

The component library already exists; the redesign re-skins it and applies targeted structural
changes. Component APIs and token names are preserved (Requirement 19.3).

### UI primitives (`components/ui`)

| Component | Change |
| --- | --- |
| `Button`, `IconButton` | Teal primary fill; full interactive-state set; press feedback on touch (≥44×44) |
| `Card` | Photography-forward variant: large hero media slot, rounded corners, hover elevation |
| `Badge`, `Rating`, `RatingStars` | Rating badge overlay for salon cards; status = color + icon + text |
| `SalonCard` | Restructured to booksy card: hero image → rating overlay → name → location → starting price (Rial/Persian digits); `SalonPlaceholder` for missing imagery |
| `ServiceCardList` | booksy service list grouped by category, per-service "Book" action |
| `SlotGrid` | Selectable chip grid; states available/selected/held/full/past distinguishable without color; selected uses teal |
| `JalaliDatePicker`, `JalaliDate`, `MobileDatePicker`, `DayScroller` | Jalali calendar, Persian month/weekday labels, bottom-sheet on mobile; lazy-loaded |
| `BookingStepper`, `BookingFlowTransition` | Visible step progress (service→date→time→confirm); state retained on back |
| `Celebration` | Booking-success celebration using emphasized easing |
| `FilterBar` | Sticky/collapsible filter + sort chip bar (RTL) |
| `Picture`, `ImageCarousel` | AVIF/WebP `srcset`, explicit width/height, lazy below fold, `fetchpriority="high"` hero |
| `Num`, `Money`, `DirText` | Persian numerals; Rial formatting; bidi isolation for mixed runs |
| `Skeleton`, `EmptyState`, `ErrorState`, `Spinner`, `Toast` | Data-surface state set: skeleton → empty → error+retry → success |
| `Dialog`, `Sheet`, `Tabs`, `Select`, `Switch`, `Checkbox`, `RadioGroup`, `TextField`, `Textarea`, `field` | Radix-backed; focus trap, Esc close, focus restore, labeled; visible labels + inline errors |
| `Motion`, `ScrollReveal`, `StaggerContainer`, `AnimatedCounter`, `ParallaxHero` | Framer Motion; transform/opacity only; reduced-motion aware |

### Layout + editorial primitives (`components/layout`)

`AppShell` (public/customer shell: header/main/footer landmarks, skip link, understated chrome),
`OwnerShell` + `OwnerBottomTabs` + `OwnerSidebar` (fail-closed owner nav), `FunnelShell`
(no-chrome funnel), `AdminShell`, `HeaderAuthNav`, `RouteLoader` (layout-reserving skeleton).
Editorial primitives `EditorialSplit`, `FeatureMosaic`, `SectionRhythm` drive asymmetric layouts
and section rhythm (no sole row of equal cards).

### Brand, sections, SEO, theme

`components/brand/Motif` (petal-arc mark/band/watermark, token-driven, `aria-hidden`);
`components/sections` (`MetricsSection`, `OwnerBenefitsSection`); `components/seo`
(`SeoHead` default `noindex`, `JsonLd`, `config`); `components/theme` (`ThemeProvider`,
`ThemeToggle`, `OwnerThemeToggle`, `TenantTheme`, `FunnelTenantTheme`, `tenantTokens`).

---

## Page-by-Page Design

### Marketing Home `/` (Requirement 5)
Hero: Persian display headline over salon photography with a scrim, brand `Motif band` divider,
and the search-first entry point (service + location) as the primary above-the-fold element.
Salon showcase = photography-forward `SalonCard` grid with staggered scroll-reveal. "How It Works"
uses `EditorialSplit`/`FeatureMosaic` (asymmetric, not equal cards). Social proof =
`MetricsSection` large Persian numerals. `SectionRhythm` alternates layout/background/density.
Indexable; JSON-LD `WebSite` + `Organization`; OG/Twitter; CWV budgets.

### Business Landing `/business` (Requirement 11)
Hero with Persian display headline + value prop + CTA to `/business/register`; owner benefits via
`OwnerBenefitsSection` editorial layout; varied section rhythm; indexable + OG.

### Salon Registration `/business/register` (Requirement 10.6)
Card-based onboarding, visible labels, inline Persian validation, `noindex`.

### Discovery `/city/:city`, `/services/:type` (Requirement 6)
`SalonCard` grid (hero photo, rating overlay, name, location, starting price Rial/Persian);
sticky/collapsible `FilterBar`; responsive 3/2/1 columns, no horizontal overflow; skeleton cards
while loading; styled empty state; indexable + `BreadcrumbList`.

### Salon Profile `/s/:slug` (Requirement 7)
Hero gallery, salon name in display type, location/rating, prominent teal "Book Now" → funnel.
`ServiceCardList` grouped by category with per-service "Book". Info sections: description, hours
(Iranian week, Saturday first), address with lazy map embed, staff gallery. Brand_Accent applied
via scoped runtime tokens with AA-safe foreground. JSON-LD `BeautySalon`/`HairSalon` (NAP,
`Service` in IRR, `BreadcrumbList`, `OpeningHoursSpecification`); indexable with salon+city title
and hero OG image.

### Booking Flow `/salon/:salonId/book`, `/book/confirm`, `/booking/success` (Requirement 8)
Multi-step with `BookingStepper` progress. Service step = photography-consistent cards with
animated select. Date/time = `JalaliDatePicker` + `SlotGrid` chips (unavailable muted, not
color-only); selected chip animates to teal. Confirm = summary card (service, Jalali date, time,
Rial, salon). Success = `Celebration`. Skeleton per step, error+retry, no artificial delay.
Keyboard-operable with RTL focus order; step state retained on back. No nav chrome (`FunnelShell`);
`noindex` + excluded from sitemap.

### Owner Dashboard `/owner/*` (Requirement 9)
Booksy_Identity, calendar as hub. `OwnerCalendarPage` day/week time grid, color-coded appointment
blocks with service/customer, animated view switches. `OwnerAnalyticsPage` minimal-chrome charts
with teal highlights, Rial/Persian metrics. `OwnerConfigurationPage` card sections (staff,
services, chairs, holidays) with inline edit. Subscription/transactions/notifications/QR share
card sections + chrome. `OwnerSidebar` desktop / `OwnerBottomTabs` mobile as fail-closed required
nav (Persian error state if it fails to render). Skeleton/empty/error+retry per surface.
Keyboard view-switch/date-nav/grid-focus with correct RTL arrow direction. `noindex`.

### Auth `/auth`, QR `/qr/:payload`, Legal `/about|/contact|/privacy|/terms` (Requirement 10)
Auth: phone + six-digit OTP, `dir="ltr"` Latin entry internally, visible labels, resend timer,
inline Persian errors, Persian display digits; `noindex`. QR: salon intro + CTA into funnel;
`noindex`. Legal: readable ~70ch columns, consistent typography; indexable (title/description/
canonical).

---

## RTL / i18n / Jalali Approach (Requirement 14)

- **Direction:** `dir="rtl"` + `lang="fa"` on the document root; CSS logical properties only.
- **Typography:** self-hosted Vazirmatn variable woff2, metrics-matched Tahoma fallback,
  `font-display: swap`, above-the-fold weight preloaded; display treatment for headings.
- **Numerals:** Persian digits for all display (prices, dates, counts, metrics) via `Num`/`Money`;
  phone/OTP keep Latin `dir="ltr"` internally, normalized on submit.
- **Dates:** Jalali everywhere with Persian month/weekday labels; convert to/from ISO only at the
  API boundary.
- **Currency:** Iranian Rial, Persian digits, thousands grouping, localized label.
- **Icons:** directional icons (chevrons, arrows, progress carets) mirror in RTL; default is
  directional/mirrored; only the explicit universal set (search, clock, checkmark) does not mirror.
- **Bidi:** mixed Persian/Latin/numeric runs isolated via `<bdi>`/`unicode-bidi: isolate` (`DirText`).
- **Catalog:** all strings from `react-i18next` `fa.json`, grouped by domain; add keys, no inline
  Farsi. Non-regression checks assert font preload+swap and bdi isolation and fail the build.

---

## Animation Strategy (Requirement 4)

- Framer Motion only (existing layer); durations/easing from tokens (`--dur-*`, `--ease-*`), no raw
  literals.
- Animate only `transform`/`opacity`; never layout-reflowing properties.
- `prefers-reduced-motion: reduce` disables transform/parallax/particles, keeps opacity crossfades
  and essential state feedback; never blocks completing an action.
- Booking success uses the emphasized easing celebration moment.
- Applications: page transitions (`PageTransition`), staggered card reveals (`ScrollReveal`/
  `StaggerContainer`), stepper/slot select feedback, counter roll-ups, restrained hero parallax.

---

## Performance / SEO / PWA Approach

### Performance & CWV (Requirement 16)
Targets on mid-range mobile: LCP < 2.5s, INP < 200ms, CLS < 0.1. Route-level code splitting keeps
owner bundles off public/funnel routes (build-time isolation check). Public routes prerendered/SSR
serve meaningful HTML without client JS (per-route content check). Lazy-load below-fold images,
chart libs, Jalali picker (reserve space to avoid CLS). Public initial JS ≤ ~150KB gzip
(build-time budget check). Lighthouse CI gates CWV; a non-executed check counts as a failure.

### SEO & structured data (Requirement 17)
`SeoHead` defaults to `noindex` so new private routes never leak by omission; public routes opt
into indexing with unique title/description/canonical, OG/Twitter (`og:locale=fa_IR`, 1200×630
RTL-correct image), `hreflang` `fa-IR` + `x-default`. JSON-LD: home `WebSite`+`Organization`;
salon `BeautySalon`/`HairSalon` + `Service` (IRR) + `BreadcrumbList` + `OpeningHoursSpecification`
(Iranian week). `robots.txt` allows public, disallows app/admin/api; `sitemap.xml` lists only
indexable URLs (generated from the salon list).

### PWA preservation (Requirement 18)
Manifest: Persian name/short_name/description, icons 192/512 + maskable, `theme_color` from the
primary token, `display:standalone`, `dir:rtl`, `lang:fa`, `start_url`. Service worker serves a
cached app shell offline. Caching must not cache authenticated API responses in a way that leaks
one user's data to another (security-sensitive non-regression check). `<meta name="theme-color">`
updates with the active theme.

---

## Testing Strategy

**Dual approach:** property-based tests for universal invariants; example/integration/snapshot
tests for specific scenarios, structure, and infrastructure. Property tests run ≥ 100 iterations
and are tagged `Feature: booksy-frontend-redesign, Property {n}: {text}`.

- **Property tests (this design's Correctness Properties):** token parity, palette AA, tenant
  accent AA, distinctiveness guardrail, display/body invariant, Persian numerals, Rial formatting,
  Jalali round-trip, digit normalization, icon mirroring, robots partition, sitemap/noindex
  consistency, bidi isolation.
- **Example tests:** theme toggle behavior, dialog/sheet focus trap + Esc + restore, per-surface
  state machines (skeleton/empty/error/success), single-`<h1>`/landmarks per page.
- **Integration/gates (REQUIRED, non-negotiable):** axe checks on key components/pages (fail on
  serious/critical); Lighthouse CI CWV; public JS budget; code-split isolation; prerender/SSR
  content; offline app-shell; no cross-user auth caching. A check that fails **or does not run**
  counts as not met.
- **Non-regression:** existing token/contrast/distinctiveness/tokens-complete/axe suites stay
  green with Booksy_Identity values (Requirement 19.5).

Automated checks are a floor, not a certificate: full WCAG 2.2 AA conformance requires manual AT
testing (VoiceOver/iOS, TalkBack/Android, NVDA in RTL/Farsi), keyboard-only runs, and expert
review.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a
system — a formal, machine-verifiable statement about what the system should do.*

### Property 1: Token source parity
*For any* semantic color role, the value declared in `packages/web/src/styles/tokens.css` equals
the value in `packages/shared/src/tokens/index.ts` for both the light and dark themes.
**Validates: Requirements 2.2**

### Property 2: Palette meets WCAG AA
*For all* foreground/background token pairings the UI ships, in both light and dark themes, the
WCAG contrast ratio is at least 4.5:1 for normal text and at least 3:1 for large text and non-text
UI (focus ring, decorative fills paired with a label).
**Validates: Requirements 2.3, 2.4, 15.2**

### Property 3: Tenant accent foreground stays AA
*For any* valid Brand_Accent fill color, the derived on-accent foreground (via the shared contrast
derivation) clears WCAG AA against the AA-adjusted fill (≥ 4.5:1 body text, ≥ 3:1 large/non-text).
**Validates: Requirements 7.5**

### Property 4: Distinctiveness guardrail flags iff a forbidden pattern is present
*For any* authored source line, the guardrail reports a violation if and only if the line contains
a forbidden pattern (raw hex/px/ms in a style context, physical `left`/`right` for flow spacing, or
the indigo/purple family/gradient), and each reported violation carries its file and rule.
**Validates: Requirements 2.7, 2.8**

### Property 5: Display type is never uniform with body type
*For all* theme configurations, the display font weight is strictly greater than the body weight
AND the display line-height is strictly less than the body line-height.
**Validates: Requirements 14.3**

### Property 6: All display digits are Persian
*For any* non-negative number rendered as a user-facing price, date, count, or metric, the
formatted output contains only Persian (Eastern-Arabic) digits and no ASCII digits.
**Validates: Requirements 14.4, 14.6**

### Property 7: Rial formatting preserves value and groups thousands
*For any* monetary amount, formatting it as Iranian Rial groups thousands and re-parsing the
formatted string recovers the original amount.
**Validates: Requirements 14.6**

### Property 8: Jalali ⇄ ISO round-trips at the API boundary
*For any* valid calendar date, converting ISO → Jalali and back to ISO yields the original ISO
date.
**Validates: Requirements 14.5**

### Property 9: Digit normalization is total and idempotent
*For any* string of Persian, Arabic, or Latin digits, normalization maps every digit to its Latin
form (preserving length and numeric value) and applying normalization again produces the same
result.
**Validates: Requirements 14.4, 10.2**

### Property 10: Directional icons mirror iff not universal
*For any* icon, it is mirrored under RTL if and only if it is not a member of the explicit
universal-icon set (search, clock, checkmark).
**Validates: Requirements 14.7**

### Property 11: Bidi runs are isolated
*For any* string mixing Persian with Latin or numeric runs, the rendered output isolates each
embedded run using `<bdi>` or `unicode-bidi: isolate`.
**Validates: Requirements 14.8**

### Property 12: Route indexability partition
*For any* application route, its robots directive is indexable if and only if the route belongs to
the public indexable set (`/`, `/business`, `/city/:city`, `/services/:type`, `/s/:slug`, and the
legal routes); every other route is `noindex`.
**Validates: Requirements 17.1, 17.2, 5.7, 8.9, 9.9, 10.5**

### Property 13: Sitemap contains only indexable URLs
*For any* URL listed in `sitemap.xml`, the corresponding route is indexable; no `noindex` route
ever appears in the sitemap.
**Validates: Requirements 17.2, 17.5**

---

## Requirements Mapping

| Requirement | Covered by |
| --- | --- |
| 1 Booksy-faithful alignment | Overview (resolved decisions), Page-by-Page, editorial primitives |
| 2 Visual identity + tokens | Design Token Strategy; Properties 1, 2, 4, 5 |
| 3 Understated chrome + search-first nav | Architecture (shells), Marketing Home, Owner Dashboard; landmark example tests |
| 4 Animation & motion | Animation Strategy |
| 5 Marketing Home | Page-by-Page (Home); Properties 6, 12; CWV/SEO gates |
| 6 Discovery | Page-by-Page (Discovery); state example tests; Property 12 |
| 7 Salon Profile | Page-by-Page (Profile); Property 3 (Brand_Accent); JSON-LD |
| 8 Booking Flow | Page-by-Page (Booking); Properties 6, 8, 12; state/keyboard example tests |
| 9 Owner Dashboard | Page-by-Page (Owner); fail-closed nav + state example tests; Property 12 |
| 10 Auth/QR/Legal | Page-by-Page; Properties 9, 12, 13 |
| 11 Business Landing | Page-by-Page (Business); editorial primitives |
| 12 Photography | Component Inventory (`Picture`/`ImageCarousel`/`SalonPlaceholder`); performance |
| 13 Responsive/mobile-first | Layout strategy; responsive column + touch-target example/axe tests |
| 14 RTL/i18n/Jalali | RTL/i18n Approach; Properties 5, 6, 7, 8, 9, 10, 11 |
| 15 Accessibility | Testing Strategy (axe gate); Property 2; focus-trap example tests |
| 16 Performance/CWV | Performance approach; Lighthouse CI + budget + isolation + prerender gates |
| 17 SEO + structured data | SEO approach; Properties 12, 13 |
| 18 PWA | PWA approach; offline-shell + no-auth-cache integration tests |
| 19 Foundation reuse + non-regression | Architecture (reuse); Testing Strategy (suite stays green) |
