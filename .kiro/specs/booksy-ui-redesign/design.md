# Design Document — Booksy-Faithful UI Redesign

## Overview

This design specifies a **re-skin and re-composition** of the existing `packages/web`
frontend to a visual identity faithful to the real **booksy.com**: a teal action color over a
clean, high-contrast black/white minimal foundation, photography-forward cards, understated
chrome, search-first discovery, and a calendar-centric owner dashboard.

It is deliberately **not** a greenfield build. The platform already ships the full foundation —
routing (`App.tsx`), a component library (`components/ui`, `components/layout`,
`components/sections`, `components/brand`), a two-source-of-truth token architecture
(`packages/web/src/styles/tokens.css` mirrored by `packages/shared/src/tokens/index.ts`), an
i18n catalog, PWA (`vite-plugin-pwa`), and the SEO/a11y/RTL patterns (`components/seo`,
`react-helmet-async`, logical-property CSS). This redesign changes **token values** and
**page composition**; it does not rebuild infrastructure or touch any backend/API contract.

The change supersedes the prior `booksy-newyork-redesign` magenta/noir visual direction
(currently shipped in `tokens.css` / `@salon/shared`) but keeps the same shared foundation
those specs established. The three guardrail tests stay in force with updated expected values:
`styles/contrast.test.ts`, `styles/distinctiveness.test.ts`, and
`styles/tokens-complete.test.ts`.

### Design goals

1. **Faithful to booksy.com** as documented in `docs/design-research/booksy-analysis.md` — the
   single source of design truth (booksy.com blocks crawling).
2. **Accessible teal** — resolve that booksy's literal `#05CFA6` fails WCAG AA (4.5:1) as small
   text on white by splitting the teal into a *deep interactive teal* (text/CTA fill) and a
   *bright signature teal* used only as a large fill with dark ink.
3. **Zero regression** to routing, component API surface, API client shapes, i18n, PWA, RTL,
   Jalali dates, Persian numerals, and the SEO index/noindex split.
4. **Tokens-only, logical-properties-only** authored styles, enforced by the distinctiveness
   guardrail.

### What changes vs. what is reused

| Layer | Action |
| --- | --- |
| `tokens.css` + `@salon/shared` token **values** | **Re-skin** to Booksy_Identity (teal/black-white) |
| `contrast.test.ts`, `distinctiveness.test.ts`, `tokens-complete.test.ts` | **Update expected values**; keep enforcing |
| Component library (`components/**`) | **Re-skin + re-compose**; keep component APIs |
| Pages (`pages/**`) | **Re-compose** layout/section rhythm; keep routes |
| `App.tsx` routing, public/authed split | **Reuse unchanged** |
| API client, backend, Prisma schema | **Untouched** |
| i18n catalog (`fa.json`) | **Add keys** only; no hard-coded Farsi |
| PWA manifest / service worker | **Reuse**; only `theme_color` re-derived from new primary |

---

## Architecture

### Token flow (unchanged architecture, re-skinned values)

```
packages/shared/src/tokens/index.ts   ← pure values (lightColors / darkColors / typography …)
        │  (byte-identical values)
        ▼
packages/web/src/styles/tokens.css    ← :root (light) + [data-theme="dark"] custom properties
        │  (var(--token) / Tailwind theme mapping)
        ▼
Component_Library + pages             ← consume tokens ONLY (no raw hex/px/ms)
        │
        ├── contrast.test.ts          ← imports @salon/shared, asserts every pairing ≥ AA
        ├── tokens-complete.test.ts   ← asserts display/body type invariant + parity
        └── distinctiveness.test.ts   ← scans authored source for generic/raw-literal regressions
```

The two token sources must stay **byte-identical** for the semantic color values. The steering
files (`ui-ux-skills.md`, `signature-design-language.md`) currently document the salon-luxe
plum-wine palette; per requirement assumption 2 they are updated in lockstep to the
Booksy_Identity so all sources agree.

### Rendering / routing (reused)

`App.tsx` stays as-is: `HelmetProvider` → `ThemeProvider` → `BrowserRouter` → `AuthProvider`,
with `React.lazy` route-level code splitting. The owner panel (`/owner/*`) renders outside
`AppShell` in its own `OwnerShell`; public + customer surfaces render inside `AppShell` with
`PageTransition`; the booking funnel is wrapped in `FunnelTenantTheme` for per-salon accent.
Public routes remain prerender/SSR targets; authed routes remain client-rendered (R14.3).

---

## Token Re-Skin: Booksy_Identity Palette

### The teal contrast problem and its resolution

booksy's brand teal `#05CFA6` has a contrast ratio of only **2.0:1** on white — it fails both
the 4.5:1 (text) and 3:1 (non-text) thresholds. The current `contrast.test.ts` uses the single
`--color-primary` token in **both** directions: as a fill carrying `--color-primary-contrast`
text (needs ≥ 4.5:1) **and** as colored text/links on `bg`/`surface` (needs ≥ 4.5:1). A single
bright-teal primary can therefore never pass.

**Resolution (R2.4, assumption 3): a two-tier teal.**

- **`--color-primary` = deep teal `#0B7A68`** — the interactive teal. Clears 4.5:1 *both*
  directions (5.25:1 as text on white; white text on it 5.25:1). Used for CTAs (teal fill +
  white text), links, small teal text, icons, and the focus ring.
- **`--color-accent` = bright signature teal `#05CFA6`** — booksy's literal teal, preserved.
  Used **only as a large fill** (hero wash, large selected-state fills, decorative bands) with
  **dark ink** overlaid (`#0A0A0A` on `#05CFA6` = 9.88:1). It is never used as small text or as
  a standalone non-text indicator on a light surface. The contrast test does not assert accent
  as text (it is decorative, always paired with a label), matching how the guardrail treats it.
- **`--color-secondary` = deep teal `#116E60`** — supporting emphasis and decorative
  completed-step badges; text-safe (6.13:1 on white).

This keeps the interface unmistakably teal while every shipped text pairing clears AA.

### Light theme — semantic tokens (verified)

| Token | Hex | Role | Key contrast (verified) |
| --- | --- | --- | --- |
| `--color-bg` | `#FFFFFF` | Page background | — |
| `--color-surface` | `#F5F6F7` | Cards, sheets, alt sections | text 17.x:1 |
| `--color-elevated` | `#FFFFFF` | Menus, dialogs, popovers | — |
| `--color-text` | `#111417` | Near-black primary text | 18.48:1 on bg |
| `--color-text-muted` | `#586170` | Secondary/help text | 6.25:1 on bg, 5.78:1 on surface |
| `--color-border` | `#E4E7EA` | Dividers, input borders | decorative (exempt) |
| `--color-primary` | `#0B7A68` | Deep teal action / CTA fill / links / focus | text 5.25:1 on white; white-on 5.25:1 |
| `--color-primary-contrast` | `#FFFFFF` | Text/icon on primary & danger fills | 5.25:1 on primary |
| `--color-secondary` | `#116E60` | Secondary emphasis, completed-step badge | 6.13:1 on white |
| `--color-accent` | `#05CFA6` | Bright signature teal — **large fills only, dark ink** | dark ink 9.88:1 on accent |
| `--color-success` | `#1F7A43` | Booked, paid, confirmed | ≥ 4.5:1 on bg/surface |
| `--color-warning` | `#9A5B12` | Expiring OTP, low slots | ≥ 4.5:1 on bg/surface |
| `--color-danger` | `#B3261E` | Failed pay, cancel, errors | white-on ≥ 4.5:1 |
| `--color-info` | `#1F5FAE` | Neutral notices | ≥ 4.5:1 on bg/surface |
| `--color-focus-ring` | `#0B7A68` | Focus outline | ≥ 3:1 on bg/surface/elevated |

### Dark theme — semantic tokens (verified)

Booksy dark preserves the high-contrast minimal character: near-black surfaces, luminous text,
luminous teal highlights.

| Token | Hex | Role | Key contrast (verified) |
| --- | --- | --- | --- |
| `--color-bg` | `#0F1111` | Near-black page background | — |
| `--color-surface` | `#181B1B` | Cards, sheets, alt sections | text 16.x:1 |
| `--color-elevated` | `#222626` | Menus, dialogs, popovers | — |
| `--color-text` | `#F4F6F6` | Luminous primary text | 17.46:1 on bg |
| `--color-text-muted` | `#A6ADAD` | Secondary/help text | 8.3:1 on bg, 7.6:1 on surface |
| `--color-border` | `#2A2F2F` | Dividers, input borders | decorative (exempt) |
| `--color-primary` | `#2DE0BE` | Luminous teal action / CTA fill / links / focus | 11.29:1 on bg; ink-on 11.29:1 |
| `--color-primary-contrast` | `#0F1111` | Dark ink on primary & danger fills | 11.29:1 on primary |
| `--color-secondary` | `#4FE3C8` | Secondary emphasis, completed-step badge | ≥ 3:1 on bg/surface |
| `--color-accent` | `#38E0C0` | Bright signature teal highlight (dark ink) | dark ink 11.36:1 |
| `--color-success` | `#69D08C` | Booked, paid, confirmed | ≥ 4.5:1 on bg/surface |
| `--color-warning` | `#E7B45C` | Expiring OTP, low slots | ≥ 4.5:1 on bg/surface |
| `--color-danger` | `#F2938C` | Failed pay, cancel, errors | ink-on ≥ 4.5:1 |
| `--color-info` | `#86B6F0` | Neutral notices | ≥ 4.5:1 on bg/surface |
| `--color-focus-ring` | `#2DE0BE` | Focus outline | ≥ 3:1 on all surfaces |

> The full AA matrix (both themes) was pre-verified against the exact assertions in
> `contrast.test.ts` using the shared `styles/contrast.ts` math: **all pairings pass.** The test
> imports `lightColors`/`darkColors` from `@salon/shared`, so updating both token sources to the
> table above (byte-identical) turns the suite green with no test-logic change.

### Non-color tokens (unchanged)

Typography scale, heroic display scale (`--font-3xl…5xl`), the display pairing tokens
(`--font-weight-body: 400`, `--font-weight-display: 800`, `--line-height-display: 1.15`,
`--tracking-display`), spacing (8pt grid), radius, elevation, z-index ladder, and motion tokens
are **reused unchanged**. The display/body invariant enforced by `tokens-complete.test.ts`
(display weight > body weight AND display line-height < body line-height) continues to hold.

Shadows are lightened for the clean booksy foundation: light-mode shadows stay low-contrast
neutral (no magenta glow); dark-mode uses border + subtle shadow rather than colored glow. The
`--shadow-glow` token is re-tinted to a faint teal (or removed from authored usage) to match the
understated chrome.

### PWA `theme_color` (R16.1, R16.4)

`manifest.json` `theme_color` is re-derived from the new light primary. The `<meta
name="theme-color">` continues to switch with the active theme via `ThemeProvider`
(light → light primary/bg, dark → dark bg). The manifest `theme_color` literal is data, not an
authored style, so it is exempt from the distinctiveness scan.

---

## Component Re-Skin Inventory

All components already consume tokens, so the re-skin is mostly automatic. The table lists the
composition/behavior changes needed to hit the booksy-faithful direction. **No component API
(props) changes** (R17.2).

### `components/ui`

| Component | Re-skin / re-composition |
| --- | --- |
| `Button` | Primary variant = deep-teal fill + white text; ghost/outline secondary reads as understated black-on-white; keep all interactive states (default→loading) |
| `Card` | Cleaner surface, softer radius (`--radius-lg`), photography-forward variant used by `SalonCard`; low neutral shadow |
| `Badge` | Rating badge overlay style (star + number), teal/status badges as text on 10% tint |
| `SalonCard` | **Photography-forward**: large hero image (16:9/square), rating badge overlay, compact hierarchy (name → rating → location → starting price in Rial/Persian numerals) |
| `ServiceCardList` | Booksy-style category-grouped list; per-service "Book" action right-aligned by logical `end` |
| `SlotGrid` | Available/selected/held/full/past states distinguishable by fill + label + icon (not color alone); selected chip uses teal |
| `BookingStepper` | Visible progress indicator (۱ خدمت · ۲ تاریخ · ۳ زمان · ۴ تایید); current step teal, completed step secondary-teal check |
| `FilterBar` | Sticky/collapsible filter + sort chips for discovery |
| `RatingStars` / `Rating` | Gold/amber stars (universal, not mirrored); numeric review count in Persian numerals |
| `ParallaxHero` | Reused; hero background = photography + scrim (no indigo/purple gradient), optional `Motif` band |
| `ScrollReveal` / `StaggerContainer` / `Motion` | Reused unchanged; token-driven durations/easing |
| `Celebration` | Reused; booking-success moment with emphasized easing (R4.5) |
| `JalaliDatePicker` / `JalaliDate` / `MobileDatePicker` | Reused; bottom-sheet on mobile; Persian month/weekday labels, Persian digits |
| `Picture` | AVIF/WebP + `srcset` + explicit `width`/`height`; `fetchpriority` for LCP |
| `SalonPlaceholder` | Branded placeholder using `Motif` + tokens (never a gray box) — R10.5 |
| `Skeleton` / `EmptyState` / `ErrorState` | Reused; ensure every data surface uses skeleton (not spinner), Persian empty/error copy + retry |
| `Num` / `Money` / `DirText` | Reused; Persian numerals, Rial formatting, bidi isolation |
| `Dialog` / `Sheet` / `Tabs` / `Tooltip` / `Toast` | Reused; focus trap, Esc, labelled, restore focus |
| `Three` (`Salon3D*`) | Out of scope for the clean booksy direction; excluded from distinctiveness scan already; not added to public bundles |

### `components/layout`, `sections`, `brand`

| Component | Re-skin / re-composition |
| --- | --- |
| `AppShell` | Understated chrome: minimal header/nav, single `<main>`, skip link, footer, `Motif` `mark` beside wordmark |
| `OwnerShell` / `OwnerSidebar` / `OwnerBottomTabs` | Calendar-centric owner nav; sidebar desktop, bottom tabs mobile |
| `FunnelShell` | No nav chrome during booking funnel; sticky bottom CTA on mobile |
| `EditorialSplit` / `FeatureMosaic` / `SectionRhythm` | Used to avoid "single row of equal cards" and to vary section rhythm on Marketing_Home / Business_Landing |
| `Motif` (`mark`/`band`/`watermark`) | Token-driven; re-tints to teal automatically; recurs on brand surfaces and empty states |
| `MetricsSection` / `OwnerBenefitsSection` | Social-proof metrics as large Persian numerals |
| `HeaderAuthNav` | Minimal auth affordance |

### `components/theme`

`ThemeProvider`, `ThemeToggle`, `OwnerThemeToggle` reused. Tenant accent path
(`TenantTheme`, `FunnelTenantTheme`, `tenantTokens.ts`) reused unchanged — it derives an
AA-safe on-accent foreground via `styles/contrast.ts` (`onAccentForeground` / `ensureAaFill`),
which continues to guarantee ≥ 4.5:1 body / ≥ 3:1 large on any salon Brand_Accent (R7.5).

---

## Per-Page Re-Composition

### Marketing_Home (`/`) — R5, R15.4

- **Hero**: photography background + scrim for legibility, Persian headline in the display
  treatment (`text-display`), a `Motif` `band` divider, and a **search-first** entry point
  (service + location) as the primary above-the-fold interactive element (R3.2). Hero image is
  the LCP: eager, `fetchpriority="high"`, preloaded (R10.3).
- **Salon showcase**: responsive grid of photography-forward `SalonCard`s with `StaggerContainer`
  scroll-reveal entrances.
- **How It Works**: `EditorialSplit` / `FeatureMosaic` asymmetric layout (never a single row of
  equal cards) (R5.3).
- **Social proof**: `MetricsSection` with large Persian-numeral metrics.
- **Section rhythm**: `SectionRhythm` alternates `--color-bg`/`--color-surface` and density
  (R5.5).
- **SEO**: indexable; unique title/description/canonical, OG, JSON-LD `WebSite` + `Organization`
  via `SeoHead`/`JsonLd`.

### Discovery_Surface (`/city/:city`, `/services/:type`) — R6, R15

- Grid of photography-forward `SalonCard`s: hero image, rating badge overlay, name, location,
  starting price (Rial, Persian numerals).
- `FilterBar` sticky/collapsible filter + sort.
- Responsive: 3 columns desktop / 2 tablet / 1 mobile, no horizontal overflow (R6.3, R11.1).
- **Loading** = skeleton cards matching final dimensions (not a spinner). **Empty** = styled
  Persian empty state with suggestion + next action. Uses existing `useInfiniteScroll`.
- **SEO**: indexable; JSON-LD `BreadcrumbList`.

### Salon_Profile (`/s/:slug`) — R7, R15.3

- **Hero header**: full-width gallery (`ImageCarousel`), salon name in display treatment,
  location, rating, prominent teal "Book Now" CTA.
- **Services**: `ServiceCardList` grouped by category; each row shows name, duration, price
  (Rial/Persian numerals), per-service "Book" action.
- **Info sections**: description, opening hours on the Iranian week (Saturday first), address +
  lazy-loaded map embed, staff gallery (`Avatar`s).
- **Book Now** → navigates to `/salon/:salonId/book`.
- **Tenant accent**: `TenantTheme` scopes the salon's Brand_Accent to CTAs via runtime CSS vars,
  AA-verified on the accent foreground (R7.5).
- **SEO**: indexable; JSON-LD `BeautySalon`/`HairSalon` (NAP), `Service` list (IRR),
  `BreadcrumbList`, `OpeningHoursSpecification` (Iranian week); OG uses salon hero image.

### Booking_Flow (`/salon/:salonId/book`, `/confirm`, `/booking/success`) — R8, R11, R15.2

- `BookingStepper` with visible progress (service → date/time → confirm).
- **Service step**: photography-consistent card list; select animates to selected state.
- **Date/time step**: Jalali date picker (Persian labels/digits) + `SlotGrid`; available slots
  as selectable chips, unavailable muted and distinguishable without color; bottom-sheet pattern
  on mobile.
- **Slot select**: chip animates to selected using teal (R8.4).
- **Confirm step**: summary card (service, Jalali date, time, Rial price, salon name).
- **Success**: `Celebration` moment (emphasized easing) + booking details.
- **States**: skeleton while loading; Persian error + retry on failure.
- **A11y**: keyboard-operable, logical RTL focus order, step state retained on back nav.
- **Chrome**: no nav during funnel; sticky bottom CTA on mobile in the bottom third (R11.2).
- **SEO**: `noindex`, excluded from sitemap (R8.9, R15.2).

### Owner_Dashboard (`/owner/*`) — R9, R15.2

- Booksy_Identity applied; **calendar is the hub**.
- **Calendar** (`/owner/calendar`): day/week views, time grid, appointments as color-coded blocks
  with service + customer info, animated view transitions.
- **Analytics** (`/owner/analytics`): utilization, revenue (Rial/Persian numerals), busiest
  windows via chart components with minimal chrome and teal highlights for key data. Chart lib
  lazy-loaded.
- **Config** (`/owner/config`): staff, services, chairs, holidays as card sections with inline
  edit affordances; advanced options behind progressive disclosure.
- **Nav**: `OwnerSidebar` desktop, `OwnerBottomTabs` mobile.
- **States**: skeletons; Persian error + cause + retry.
- **A11y**: keyboard view switching, date nav, grid-cell focus with correct RTL arrow direction.
- **SEO**: `noindex`; kept in its own code-split bundle off public/funnel routes (R14.2).

---

## Motion Approach (R4)

- **Reuse** the existing Framer-Motion layer (`ScrollReveal`, `StaggerContainer`, `ParallaxHero`,
  `Celebration`, `Motion`, `PageTransition`, `BookingFlowTransition`) — no new motion framework.
- **Token-driven only**: durations/easing come from `--dur-*` / `--ease-*`; no raw ms/easing
  literals (enforced by the distinctiveness scan).
- **Compositor-friendly only**: animate `transform`/`opacity`; never `width`/`height`/`top`/`left`
  (protects CLS).
- **Restraint**: booksy's clean feel means purposeful transitions only — reveal-on-scroll,
  press/selection feedback, step transitions, and the single success celebration. No decorative
  loops.
- **`prefers-reduced-motion: reduce`**: drop transforms/parallax/particles, keep opacity
  crossfades, never block action completion (already honored globally in `tokens.css` and by
  `Motion`).
- **Emphasized easing** reserved for the booking-success `Celebration` moment (R4.5).

---

## Data Models and Interfaces

No new domain models. Presentation-only view types adapt existing API client shapes for display
(R1.3, R17.3). Relevant interfaces already exist and are reused:

- **Tenant accent**: `AccentTheme` in `components/theme/tenantTokens.ts` (`from`, `ink`, derived
  on-accent foreground via `styles/contrast.ts`). Injected as runtime CSS custom properties on
  the scoped `TenantTheme` / `FunnelTenantTheme` wrapper — never authored color literals.
- **SEO**: `SeoHead` (default `noindex`; pages opt into indexing), `JsonLd`, and `seo/config.ts`
  for site-wide constants. Index/noindex split preserved exactly per R15.
- **Tokens**: `ColorPalette` (`@salon/shared`) — the interface both token sources satisfy.

### Token value contract (both sources byte-identical)

```ts
// packages/shared/src/tokens/index.ts  — updated VALUES only, same shape
export const lightColors: ColorPalette = {
  bg: '#FFFFFF', surface: '#F5F6F7', elevated: '#FFFFFF',
  text: '#111417', textMuted: '#586170', border: '#E4E7EA',
  primary: '#0B7A68', primaryContrast: '#FFFFFF',
  secondary: '#116E60', accent: '#05CFA6',
  success: '#1F7A43', warning: '#9A5B12', danger: '#B3261E', info: '#1F5FAE',
  focusRing: '#0B7A68',
};
export const darkColors: ColorPalette = {
  bg: '#0F1111', surface: '#181B1B', elevated: '#222626',
  text: '#F4F6F6', textMuted: '#A6ADAD', border: '#2A2F2F',
  primary: '#2DE0BE', primaryContrast: '#0F1111',
  secondary: '#4FE3C8', accent: '#38E0C0',
  success: '#69D08C', warning: '#E7B45C', danger: '#F2938C', info: '#86B6F0',
  focusRing: '#2DE0BE',
};
```

`tokens.css` `:root` and `[data-theme="dark"]` mirror these exactly.

---

## Error Handling

- **Data surfaces** (discovery grid, slot grid, calendar, analytics, config): skeleton while
  loading; on failure a Persian `ErrorState` with cause + retry (never a raw stack/HTTP code);
  styled `EmptyState` with a next action when there is no data.
- **Booking funnel**: step-scoped errors with retry; step state preserved on back navigation;
  payment result confirmed by server only (no optimistic "paid").
- **Async announcements**: OTP/payment/slot-load results via `aria-live`/`role="alert"`.
- **Tenant accent**: if a salon's Brand_Accent would fail AA, `ensureAaFill`/`onAccentForeground`
  deterministically darken the fill / pick a legible ink so the CTA stays AA — no unreadable
  state ships.
- **Images**: on missing salon imagery, render the branded `SalonPlaceholder` (Motif + tokens),
  not a gray box.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of
the system — a formal statement about what the system should do. Properties bridge the
human-readable requirements and machine-verifiable correctness guarantees. Because this feature
is a re-skin + re-composition, the properties below target the pure, universally-quantifiable
slices (contrast math, color/number formatting, calendar conversion, token parity, source
scanning, routing policy); visual composition and CWV/bundle budgets are validated by
example-based render tests and Lighthouse/build gates in the Testing Strategy, not as properties.*

### Property 1: Every shipped color pairing clears WCAG AA (both themes)

*For any* theme in {light, dark} and *for any* foreground/background pairing the UI actually
composes, the WCAG contrast ratio is at least 4.5:1 for text pairings and at least 3:1 for
large-text/non-text pairings (focus ring, secondary decorative fills).

**Validates: Requirements 2.3, 2.4, 2.5, 13.2**

### Property 2: The two token sources are byte-identical

*For any* semantic color role, the value in `packages/web/src/styles/tokens.css` equals the value
in `packages/shared/src/tokens/index.ts` (`lightColors`/`darkColors`) for the same theme.

**Validates: Requirements 2.2, 17.5**

### Property 3: Authored source contains no generic/raw-literal regressions

*For any* authored source line (`src/**/*.{ts,tsx,css}`, excluding the scoped exemptions), the
distinctiveness scan reports a violation *if and only if* the line contains a forbidden pattern
(indigo→purple gradient, physical left/right for flow spacing, raw hex/px/ms in a style context,
or a Component_Library element with an inline color/style literal).

**Validates: Requirements 2.7, 4.2, 12.1**

### Property 4: The display/body type pairing invariant holds

*For any* valid token set, the display font-weight is strictly greater than the body font-weight
AND the display line-height is strictly less than the body line-height, so headings can never
render visually uniform with body copy.

**Validates: Requirements 12.3, 17.5**

### Property 5: Route robots/sitemap policy is consistent

*For any* route in the application route table, an indexable route emits `index` with a unique
title, meta description, and canonical URL and appears in `sitemap.xml`, while a
transactional/authenticated route (Booking_Flow, Owner_Dashboard, `/auth`, `/qr/:payload`) emits
`noindex` and is absent from `sitemap.xml`; every URL listed in `sitemap.xml` is an indexable
route.

**Validates: Requirements 8.9, 9.8, 15.1, 15.2, 15.5**

### Property 6: Status is never conveyed by color alone

*For any* status-bearing surface (badge, slot chip in any of available/selected/held/full/past,
toast), the rendered output carries a non-color distinguisher — a text label and/or an icon
and/or an ARIA state — in addition to its color.

**Validates: Requirements 8.3, 13.6**

### Property 7: Cards render all required fields with localized values

*For any* generated salon record, the rendered `SalonCard` contains the salon name, rating,
location, and starting price; and *for any* generated service, the rendered service card contains
the name, duration, and price — with every displayed monetary/count value rendered in Persian
numerals.

**Validates: Requirements 6.1, 8.2**

### Property 8: Number and currency formatting is localized

*For any* non-negative amount, the money formatter output contains only Persian digits, applies
thousands grouping, and includes the currency label; and *for any* numeric display value, the
number formatter output contains only Persian digits.

**Validates: Requirements 12.4, 12.6**

### Property 9: Jalali date conversion round-trips

*For any* valid calendar date, converting ISO → Jalali → ISO yields the original date (and the
Jalali representation uses Persian month/weekday labels and Persian digits for display).

**Validates: Requirements 12.5**

### Property 10: Icon mirroring matches directionality class

*For any* icon, it is mirrored under RTL *if and only if* it belongs to the directional set
(chevrons, arrows, progress carets, breadcrumb separators); universal icons (search, clock,
checkmark, phone, camera/QR, logos, media play) are never mirrored.

**Validates: Requirements 12.7**

### Property 11: Tenant accent always yields an AA-legible foreground

*For any* accent fill color, the derived on-accent foreground/fill pair produced by the tenant
theming derivation (`onAccentForeground` / `ensureAaFill`) clears WCAG AA — at least 4.5:1 for
body text and at least 3:1 for large/non-text — on the scoped storefront wrapper.

**Validates: Requirements 7.5**

### Property 12: Every page has exactly one h1 and the required landmarks

*For any* rendered page (public, customer, or owner), the document contains exactly one `<h1>`,
headings in non-skipping order, and the `header`, `nav`, `main`, and `footer` landmarks.

**Validates: Requirements 3.4**

### Property 13: Images declare intrinsic dimensions to prevent layout shift

*For any* rendered content image, the output declares explicit `width` and `height` (or an
`aspect-ratio`) and emits modern-format (`AVIF`/`WebP`) sources with a fallback.

**Validates: Requirements 10.2**

### Property 14: Missing salon imagery yields the branded placeholder

*For any* salon lacking imagery, the render produces the branded `SalonPlaceholder` (brand
`Motif` + Booksy_Identity tokens) rather than a generic gray box or a broken image.

**Validates: Requirements 10.5**

### Property 15: The booking funnel preserves step state on back navigation

*For any* partially completed booking state, navigating backward and then forward through the
`BookingStepper` returns the funnel to the same entered state (selected service, date, time).

**Validates: Requirements 8.8**

### Property 16: Form fields signal errors accessibly

*For any* form field in an error state, the field sets `aria-invalid` and is tied to its inline
error message (text + icon) via `aria-describedby`.

**Validates: Requirements 13.4**

---

## Testing Strategy

### Dual approach

- **Property tests** (fast-check, ≥ 100 iterations each) validate the universal properties above.
  Each test carries the tag `Feature: booksy-ui-redesign, Property {n}: {property text}` and
  references its design property.
- **Example / render tests** (Vitest + Testing Library + `vitest-axe`) validate composition,
  presence, states (skeleton / empty / error+retry / populated), theme toggling, SEO head tags,
  JSON-LD validity, focus management, and reduced-motion behavior.
- **Integration / build gates** (Lighthouse CI, bundle-size + chunk-graph checks, prerender HTML
  checks) validate CWV, the ≤ ~150KB public JS budget, code-split isolation, prerendered content,
  and PWA offline behavior — the criteria classified INTEGRATION in prework.

### Property → test mapping

| Property | Test home | Kind |
| --- | --- | --- |
| 1 Contrast (both themes) | `styles/contrast.test.ts` | Existing gate, expected values updated |
| 2 Token parity | `styles/tokens-complete.test.ts` (or a parity test) | Property over role set |
| 3 Distinctiveness scan | `styles/distinctiveness.test.ts` | Existing property gate |
| 4 Display/body invariant | `styles/tokens-complete.test.ts` | Existing invariant |
| 5 Robots/sitemap policy | `components/seo` route-policy test | Property over route table |
| 6 Non-color status signal | `SlotGrid` / `Badge` / `Toast` tests | Property over states |
| 7 Card content | `SalonCard` / `ServiceCardList` tests | Property over generated records |
| 8 Number/currency formatting | `Num` / `Money` tests | Property over amounts |
| 9 Jalali round-trip | Jalali util test | Round-trip property |
| 10 Icon mirroring | icon-direction util test | Classification property |
| 11 Tenant-accent AA | `theme/tenantTokens` test | Property over arbitrary fills |
| 12 Page structure | per-page render + axe | Property over route table |
| 13 Image dimensions | `Picture` test | Render property |
| 14 Branded placeholder | `SalonPlaceholder` render | Property over no-image input |
| 15 Funnel state preservation | booking-flow test | Round-trip over partial states |
| 16 Form-error wiring | `field` / form tests | Render property |

### Configuration and honesty note

- Property tests run a minimum of 100 iterations (fast-check default or explicit `numRuns`).
- Parsers/serializers here are the Jalali↔ISO converter and the number formatters — each gets a
  round-trip property (Property 8, 9) per the PBT guidance.
- The `contrast.test.ts`, `distinctiveness.test.ts`, and `tokens-complete.test.ts` suites are the
  regression tripwire for the re-skin: updating the token **values** in both sources to the
  Booksy_Identity table turns them green with no change to test logic.
- **Automated checks are necessary but not sufficient.** Full WCAG 2.2 AA conformance requires
  manual testing with assistive technologies (VoiceOver/iOS, TalkBack/Android, NVDA — all in
  RTL/Farsi), keyboard-only walkthroughs, and expert accessibility review. Every automated pass is
  a floor, not a certificate (R13.8).
