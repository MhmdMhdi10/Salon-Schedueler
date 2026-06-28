# Design Document — Signature UI System

## Overview

This design elevates the already-shipped, tokenized RTL design system into a **distinctive, premium, salon-luxe visual identity** without breaking the existing component-library contracts. It is a layering exercise, not a rewrite: every Component_Library element keeps consuming the same semantic token names (`--color-primary`, `--color-accent`, `--color-surface`, …); we change the *values* those tokens resolve to, add a deliberate type pairing and a brand motif, introduce a per-tenant accent mechanism scoped at runtime, and lock the result in with automated guardrails and governance.

The single most important architectural fact this design is built around: **the palette has three sources of truth that must stay byte-identical.**

| Source | Role | Consumed by |
| --- | --- | --- |
| `packages/shared/src/tokens/index.ts` (`lightColors` / `darkColors`) | Authoritative pure values | `styles/contrast.test.ts` (the AA guard) and React Native |
| `packages/web/src/styles/tokens.css` (`:root` / `[data-theme="dark"]`) | CSS custom properties | The browser, via Tailwind (`tailwind.config.js` maps tokens → utilities) |
| `.kiro/steering/ui-ux-skills.md` (color table) | Governing documentation | Humans + the PreToolUse advisory hook |

Changing the signature palette means editing all three in lockstep. `contrast.test.ts` imports `lightColors`/`darkColors` from `@salon/shared` and asserts the AA matrix — so the shared file is the gate, and `tokens.css` mirrors it.

The second crux is **per-tenant theming (R4)**. The Component_Library must stay tokens-only, so a salon's Brand_Accent cannot be an authored literal anywhere; it is injected as **runtime CSS custom properties on a scoped wrapper** around the storefront subtree, reusing the existing `ACCENTS` / `AccentTheme` / `accentVars` from `pages/owner/marketing-assets.ts`. Because a storefront must show the salon's accent to *any anonymous visitor*, the accent needs server-side persistence — which tensions with the requirements' Non-Goal "no backend schema changes." This document recommends a minimal additive column mirroring `Salon.autoApprove`, and **explicitly flags that additive field as a scoped deviation requiring the user's sign-off**, with a no-backend fallback offered (see [§4 Tenant Theming](#4-tenant-theming-system-r4-the-crux)).

### Detected implementation language

TypeScript / TSX (dominant across `packages/web` and `packages/backend`), CSS for tokens, and SQL for the additive migration. All code examples below use those.

### What this design deliberately does NOT change

- No scheduling/domain logic, no API *contract* changes beyond additive read/write fields (Non-Goal preserved except the explicitly-flagged accent column).
- No removal of the token system, Component_Library, ThemeProvider, or funnel redesign.
- No new product features beyond what the signature identity and per-tenant theming require.

---

## Architecture

### Layered model

```
┌──────────────────────────────────────────────────────────────────┐
│  Signature_Design_Language  (NEW: palette values, type pairing,    │
│  brand motif, layout rhythm, anti-generic rules)                   │
├──────────────────────────────────────────────────────────────────┤
│  Tenant_Theming_System  (NEW: TenantTheme wrapper injects runtime  │
│  --color-* overrides on the storefront subtree only)               │
├──────────────────────────────────────────────────────────────────┤
│  Design_Token_System  (EXISTING: tokens.css + @salon/shared,       │
│  mapped to utilities by tailwind.config.js)                        │
├──────────────────────────────────────────────────────────────────┤
│  Component_Library  (EXISTING, tokens-only — UNCHANGED interfaces) │
└──────────────────────────────────────────────────────────────────┘
```

The signature language is expressed **entirely at the token layer and through a small number of new shared components** (a brand `Motif`, display-type helpers, a `TenantTheme` wrapper). Surfaces (MarketingHome, BusinessLanding, the owner dashboard, the storefront) are re-composed using existing primitives plus those new shared pieces — they never reach for raw literals.

### Token-flow diagram (palette change)

```
edit lightColors/darkColors  ──►  contrast.test.ts re-runs AA matrix (gate)
        (shared)                          │
            │ mirror (identical hex)      ▼
            ▼                        PASS required
   tokens.css :root / [data-theme]  ──►  Tailwind utilities (bg-primary, …)
            │ document                          │
            ▼                                    ▼
   ui-ux-skills.md color table          every surface re-tinted, zero JSX churn
```

### Tenant-theming runtime flow

```
Storefront route mounts
   │
   ├─ resolve salon (GET /salons/by-qr/:payload  or  data/salons.ts for /s/:slug)
   │     → { id, name, brandAccent? , displayName?, logoUrl? }
   │
   ├─ <TenantTheme accentKey={brandAccent}>           ← scoped wrapper (data-tenant-theme)
   │     sets inline style: --color-primary, --color-primary-contrast,
   │     --color-accent, --color-focus-ring  (derived from ACCENTS[accentKey])
   │     on the subtree root ONLY; global :root tokens untouched
   │        │
   │        └─ funnel / profile render with Component_Library (tokens-only) → tenant-tinted
   │
   └─ on PWA install: applySalonManifest({ themeColor: derived, startPath: storefront })
```

### Quality-gate wiring (existing + new)

```
npm run test --workspace @salon/web   (vitest run)
   ├─ styles/contrast.test.ts          (EXISTING — AA matrix on @salon/shared)   ← guards R1.5
   ├─ component/page suites + vitest-axe (EXISTING — no serious/critical a11y)   ← guards R9.2
   ├─ styles/tenant-contrast.test.ts   (NEW — on-accent AA for all ACCENTS)      ← guards R4.3
   ├─ styles/tokens-complete.test.ts   (NEW — both themes define every role)     ← guards R1.1/1.6
   └─ styles/distinctiveness.test.ts   (NEW — anti-generic source scan)          ← guards R2/R6/R9.5/R11
npm run build --workspace @salon/web  → prerender → Lighthouse (a11y + CWV)      ← guards R9.4/R9.6
.github/workflows/web-a11y.yml runs both gates on packages/web/** changes
```

---

## Components and Interfaces

### 1. Signature palette (R1.1, R1.5, R1.6, R2.1)

A **warm editorial "salon-luxe"** direction replaces the indigo/purple seed. The personality is plum-wine + terracotta clay over warm bone/sand neutrals with an espresso ink — unmistakably a beauty brand, and nothing like the default AI indigo→purple. Every value below was verified against the exact pairings in `contrast.test.ts` (the AA matrix: primary-contrast on primary/danger ≥ 4.5; text and muted on bg/surface/elevated ≥ 4.5; status + primary as text on bg/surface ≥ 4.5; focus ring ≥ 3; primary-contrast on secondary ≥ 3).

#### Recommended light theme (`:root` in `tokens.css` ⇄ `lightColors` in shared)

| Token | New value | Was | Role |
| --- | --- | --- | --- |
| `--color-bg` | `#FBF7F2` | `#ffffff` | Warm porcelain page bg |
| `--color-surface` | `#F4ECE1` | `#f7f8fa` | Warm sand cards/sheets |
| `--color-elevated` | `#FFFFFF` | `#ffffff` | Menus/dialogs |
| `--color-text` | `#241C18` | `#16181d` | Espresso ink |
| `--color-text-muted` | `#6E5C50` | `#5b6472` | Warm taupe |
| `--color-border` | `#E4D8CB` | `#e3e6eb` | Warm divider |
| `--color-primary` | `#8E2F50` | `#5457e6` | Plum-wine brand action |
| `--color-primary-contrast` | `#FFFFFF` | `#ffffff` | On-primary text |
| `--color-secondary` | `#2E6E63` | `#0ea5a4` | Deep eucalyptus |
| `--color-accent` | `#A6452A` | `#d946ef` | Terracotta clay highlight |
| `--color-success` | `#1F7A43` | `#15803d` | Confirmed/paid |
| `--color-warning` | `#9A5B12` | `#b45309` | Expiring/low |
| `--color-danger` | `#B3261E` | `#b91c1c` | Failure/cancel |
| `--color-info` | `#1F5FAE` | `#1d4ed8` | Neutral notice |
| `--color-focus-ring` | `#8E2F50` | `#5457e6` | Focus outline |

Verified ratios (light): primary-contrast/primary **7.86**, primary/bg **7.37**, primary/surface **6.71**, accent-as-text/bg **5.62**, accent/surface **5.11** — all clear AA; focus ring and on-secondary clear their 3:1 bars.

#### Recommended dark theme (`[data-theme="dark"]` ⇄ `darkColors`)

| Token | New value | Was |
| --- | --- | --- |
| `--color-bg` | `#17110F` | `#0b0f1a` |
| `--color-surface` | `#211915` | `#121826` |
| `--color-elevated` | `#2C2119` | `#1b2233` |
| `--color-text` | `#F6EEE7` | `#eef1f6` |
| `--color-text-muted` | `#BBA99B` | `#9aa4b2` |
| `--color-border` | `#3A2D25` | `#2a3344` |
| `--color-primary` | `#E59CB3` | `#818cf8` |
| `--color-primary-contrast` | `#17110F` | `#0b0f1a` |
| `--color-secondary` | `#79C9BB` | `#2dd4bf` |
| `--color-accent` | `#EB9A7A` | `#e879f9` |
| `--color-success` | `#69D08C` | `#4ade80` |
| `--color-warning` | `#E7B45C` | `#fbbf24` |
| `--color-danger` | `#F2938C` | `#f87171` |
| `--color-info` | `#86B6F0` | `#60a5fa` |
| `--color-focus-ring` | `#E59CB3` | `#a5b4fc` |

Verified ratios (dark): primary-contrast/primary **8.67**, primary/bg **8.67**, primary/surface **8.02**, accent/bg **8.40** — all clear AA. In dark mode the text-bearing fill keeps the established pattern (light primary carrying dark `primary-contrast` ink), so `Button`/`SlotGrid`/`FunnelShell` need no change.

> Rationale: dark, saturated warm hues are required because `--color-primary` is used **both** as a fill (white text on it) *and* as text on near-white surfaces, so it must clear 4.5:1 in both directions — exactly the constraint that ruled out a light "champagne gold" primary. The accent is intentionally a clay terracotta (not magenta), keeping it warm and usable as badge text (≥ 4.5 on bg and surface).

The shadow tokens, dark-mode border-led shadows, spacing, radius, z-index, and motion tokens in `tokens.css` are **unchanged**.

### 2. Type pairing + brand motif (R1.2, R1.3, R8.1)

#### Display vs body type tokens

Vazirmatn is a variable face (`font-weight: 100 900`, already self-hosted in `tokens.css`), so a heavier display weight costs no extra download. Add display tokens alongside the existing scale in **both** `tokens.css` and `@salon/shared` (and surface them through `tailwind.config.js`):

```css
:root {
  /* Display treatment — distinct from body in weight, line-height, tracking */
  --font-weight-body: 400;
  --font-weight-display: 800;        /* heavier than the 700 headings use today */
  --line-height-display: 1.15;       /* tighter than body 1.75 / heading 1.25 */
  --tracking-display: -0.01em;       /* optional editorial tightening */
}
```

A `Display` helper (or a `.text-display` utility composed in `tailwind.config.js`) applies `font-weight: var(--font-weight-display); line-height: var(--line-height-display); letter-spacing: var(--tracking-display);`. The invariant (enforced by a test, see Properties): **display weight > body weight AND display line-height < body line-height**, so headings can never render visually uniform with body (R1.2 has "no exception" wording — the token relationship guarantees it).

#### Brand motif — one reusable signature device

Add `packages/web/src/components/brand/Motif.tsx`, exported via a new `components/brand/index.ts` barrel. The motif is a **token-driven SVG "petal arc"** (a salon-evocative overlapping-arc mark) that renders with `currentColor`/token fills so it re-tints per theme and per tenant automatically.

```tsx
// components/brand/Motif.tsx
export type MotifVariant = 'mark' | 'band' | 'watermark';
export interface MotifProps {
  variant?: MotifVariant;      // 'mark' = logo-scale, 'band' = hero divider, 'watermark' = faint bg
  className?: string;          // sizing only; color comes from tokens
  'aria-hidden'?: boolean;     // decorative by default
}
/** Decorative signature shape. Uses var(--color-primary)/var(--color-accent) via
 *  currentColor + fill tokens so it inherits theme AND tenant accent overrides. */
export function Motif({ variant = 'mark', className, ...rest }: MotifProps): JSX.Element;
```

Recurrence map: the `mark` next to the brand wordmark in `AppShell`/`OwnerShell`/`FunnelShell` headers; the `band` as the hero divider on MarketingHome and BusinessLanding and as the `SalonProfilePage` header flourish; the `watermark` faint behind owner empty states. Because it reads `--color-primary`/`--color-accent`, the motif on a tenant storefront automatically takes the salon's Brand_Accent.

### 3. Layout rhythm / anti-generic primitives (R1.4, R2.2, R2.5, R3.4)

Add a few **editorial layout primitives** (thin wrappers over CSS grid, logical-property only) in `components/layout` and re-use them so surfaces stop reading as "stacked equal cards":

- `EditorialSplit` — asymmetric 2-column (e.g. `grid-template-columns: 1.4fr 1fr` / `1fr 1.4fr` alternating), used for heroes and feature rows; collapses to one column under `md`.
- `FeatureMosaic` — a deliberately uneven grid for 3+ peer features (one lead tile + supporting tiles) so a "single row of equal cards" is never the only option (R2.2).
- `SectionRhythm` — alternates section background between `--color-bg` and `--color-surface` and varies vertical density, so consecutive sections differ (R3.4).

Explicit anti-generic rules (encoded as guardrail + checklist, see §7):
- **No default indigo→purple hero gradient.** Hero backgrounds derive from palette tokens (solid `--color-surface`, a token-driven motif band, or a warm `--color-primary`/`--color-accent` wash) — never a literal `linear-gradient(... #6366f1 ... #a855f7 ...)` or the indigo/purple hex family in authored styles (R2.1).
- **Vary section rhythm** via `SectionRhythm` (R3.4).
- **No sole 3-equal-card row** for peer features — at least one surface uses `FeatureMosaic` or `EditorialSplit` (R2.2). Today both `MarketingHome` and `BusinessLanding` use `grid md:grid-cols-3` equal cards; those become mosaic/split.
- **Domain-specific visual** present (salon imagery via the existing `<Picture>` hero, or the `Motif`) — not solely a row of monochrome lucide icons (R2.5).

### 4. Tenant Theming System (R4 — the crux)

#### Mechanism: a scoped runtime wrapper

Add `packages/web/src/components/theme/TenantTheme.tsx`. It wraps a storefront subtree and writes the salon's accent as **inline CSS custom properties** on its own element, overriding `--color-primary`, `--color-primary-contrast`, `--color-accent`, and `--color-focus-ring` for everything inside — and nothing outside (R4.2, R4.7). Because cascade variables inherit, the unchanged Component_Library picks them up with zero code change.

```tsx
// components/theme/TenantTheme.tsx
import type { CSSProperties } from 'react';
import { resolveAccent, type AccentTheme } from '../../pages/owner/marketing-assets';
import { deriveTenantTokens } from './tenantTokens';

export interface TenantThemeProps {
  /** Brand_Accent key (from ACCENTS) or null/undefined → signature default. */
  accentKey?: string | null;
  children: React.ReactNode;
}

/** Scopes a salon's Brand_Accent to its storefront subtree via runtime token
 *  overrides. Outside this element the global signature theme is unchanged. */
export function TenantTheme({ accentKey, children }: TenantThemeProps) {
  // R4.4: any missing/invalid key resolves to a safe default (resolveAccent
  // already falls back to ACCENTS[0]); when accentKey is nullish we apply NO
  // overrides and inherit the signature default palette.
  const style: CSSProperties | undefined = accentKey
    ? deriveTenantTokens(resolveAccent(accentKey))
    : undefined;
  return (
    <div data-tenant-theme={accentKey ?? 'default'} style={style}>
      {children}
    </div>
  );
}
```

`deriveTenantTokens` reuses the existing `AccentTheme` shape (`{ key, from, to, soft, ink }`) and produces the override map:

```ts
// components/theme/tenantTokens.ts
import type { CSSProperties } from 'react';
import type { AccentTheme } from '../../pages/owner/marketing-assets';
import { onAccentForeground, ensureAaFill } from './contrast'; // shared WCAG math

export function deriveTenantTokens(a: AccentTheme): CSSProperties {
  const primary = ensureAaFill(a.from);                 // darken until white clears 4.5 if needed
  return {
    '--color-primary': primary,
    '--color-primary-contrast': onAccentForeground(primary), // white | a.ink, whichever clears AA
    '--color-accent': a.to,
    '--color-focus-ring': primary,
  } as CSSProperties;
}
```

#### On-accent foreground derivation (R4.3) — grounded, not assumed

Naive "white text on the accent" is **unsafe**: computed against the existing `ACCENTS` swatches, white-on-`from` clears 4.5:1 for only 2 of 7 (violet 4.51, night 10.06); `rose`/`amber`/`emerald` need the dark `ink`; and `magenta`/`teal` clear neither white *nor* `ink` on the raw `from` color. So the derivation is:

1. `onAccentForeground(fill)` returns whichever of `#FFFFFF` or the accent's `ink` has the higher contrast against `fill`, but only if it clears **4.5:1** (body) / **3:1** (large/non-text).
2. When neither clears 4.5 on the raw accent (magenta/teal), `ensureAaFill(from)` deterministically darkens the fill (reduce L\* in steps) until white text clears 4.5, then white is used. This keeps a vivid brand action that is still AA.
3. Non-text accent uses (the `--color-accent` highlight, motif fills, borders) only need ≥ 3:1 and may use `a.to`/`a.soft` directly.

The WCAG math is the same `contrastRatio` already implemented in `styles/contrast.test.ts`; we extract it into a shared `styles/contrast.ts` so both the test and `tenantTokens.ts` import one implementation (no duplication). A new `styles/tenant-contrast.test.ts` asserts, **for every accent in `ACCENTS`**, that the derived `--color-primary` / `--color-primary-contrast` pair clears 4.5:1 (Property 5).

#### Light/dark + reduced-motion preservation (R4.8)

`TenantTheme` overrides only the four accent-related variables; `--color-bg`/`--color-surface`/`--color-text` etc. still come from `:root` vs `[data-theme="dark"]`, so toggling the theme inside a tenant storefront still works and the surfaces stay theme-correct. The accent itself has a light and dark resolution: in dark mode we apply the accent over the dark neutrals and re-derive `ensureAaFill` against the dark background so the action stays legible. `prefers-reduced-motion` handling is untouched (it lives in `tokens.css` `@media` + components); the wrapper adds no motion.

#### Brand mark (R4.5)

The storefront header (`FunnelShell` salon name slot + `SalonProfilePage` `<h1>`) renders the **salon name as the primary brand mark**, using `displayName ?? name`, with the salon logo (when present) beside it via the existing `Avatar`, and the platform identifier ("رزرو سالن") demoted to a subordinate footer/byline. `FunnelShell` already accepts `salonName`; we extend the storefront to pass `displayName ?? name` and an optional `logoUrl`.

#### PWA derivation (R4.6) — tie into `pwa/salonManifest.ts`

`applySalonManifest` already builds a per-salon blob manifest and sets `start_url`/`scope`/iOS title. Today `SHARED_MANIFEST.theme_color` is the hard-coded `#6366f1`. We extend `SalonManifestOptions` with an optional `themeColor` and use the **accent-derived** color (the same `ensureAaFill(from)` result, or the salon's `soft` for chrome) when present, falling back to the signature `--color-primary`. `start_url` is already the storefront booking path, satisfying the scoping requirement.

```ts
export interface SalonManifestOptions {
  name: string; shortName?: string; startPath: string;
  themeColor?: string;   // NEW: derived from the salon Brand_Accent
}
```

#### Persistence — the decision that needs sign-off

R4.1 requires the accent to **persist across sessions**, and R4.2 requires the **customer-facing storefront** to show it to *any* visitor (including anonymous QR scans and crawled `/s/:slug` profiles). Client-only storage (localStorage) cannot satisfy "any visitor," so persistence must be server-side. That tensions with the Non-Goal "no backend schema changes."

**Recommended (minimal, additive) approach — mirrors how `Salon.autoApprove` was added:**

1. **Prisma** (`schema.prisma`, `Salon` model) — add a nullable column (no default ⇒ null = "use signature default"):
   ```prisma
   brandAccent String? @map("brand_accent")
   ```
2. **Migration** — new `prisma/migrations/00000000000006_brand_accent/migration.sql`:
   ```sql
   -- Per-salon Brand_Accent key (additive, nullable). null = signature default.
   ALTER TABLE "salon" ADD COLUMN IF NOT EXISTS "brand_accent" TEXT;
   ```
3. **Dev constraints** (`docker/db/dev-constraints.sql`) — idempotent mirror, exactly like the `auto_approve` lines already there:
   ```sql
   ALTER TABLE salon ADD COLUMN IF NOT EXISTS brand_accent text;
   ```
4. **Read (public)** — extend the salon resolve response in `salon.routes.ts` (`GET /salons/by-qr/:payload`) and/or add `GET /salons/:id/brand` returning `{ brandAccent, displayName?, logoUrl? }`, so an anonymous storefront visitor gets the accent. Mirror the existing `{ salon: { id, name } }` shape additively.
5. **Write (owner)** — add `POST /salons/:id/brand-accent` guarded by `requireRole('configure_salon')`, body `{ brandAccent: string | null }` — a direct copy of the `/salons/:id/auto-approve` handler in `admin.routes.ts`. Surface it client-side as `brandAccentApi.set(salonId, key)` next to `approvalPolicyApi` in `api/client.ts`.
6. **Static `/s/:slug` profiles** (`data/salons.ts`) — add an optional `brandAccent?: string` field to `SalonProfile` so prerendered profiles carry the accent without a DB round-trip.

**This additive `Salon.brandAccent` field is a scoped deviation from the "no backend schema changes" Non-Goal and needs the user's explicit sign-off.**

**No-backend fallback (offered):** keep all of the above *client-side only* — the Owner_Dashboard previews/persists the accent in `localStorage` and applies `TenantTheme` for the **owner's own session**, plus the static `data/salons.ts brandAccent` for prerendered profiles. Anonymous, cross-device storefront theming would then be limited to the static-profile accent (no live per-salon DB value). This honors the Non-Goal literally but cannot show an owner's freshly-chosen accent to a third-party visitor until a build re-runs. The user chooses which path ships.

### 5. Marketing surfaces (R3) + Owner dashboard (R5)

#### MarketingHome (`/`) and BusinessLanding (`/business`)

Both currently use a symmetric `grid md:grid-cols-2` hero and a `grid md:grid-cols-3` equal-card value row. Redesign, reusing existing primitives + new ones:

- **Hero** → `EditorialSplit` (asymmetric), token background (no gradient cliché), a `Motif variant="band"` divider, single most-prominent primary CTA (`Button` primary) — preserving the existing LCP `<Picture>` (AVIF/WebP/PNG preload, `fetchpriority="high"`) and `<SeoHead index>` + `<JsonLd>` exactly as-is (R3.5 unchanged; keeps CWV/SEO green).
- **Value props** → `FeatureMosaic` (uneven) instead of 3 equal cards (R2.2), still crawlable cards with real `home.*`/`business.*` Persian copy (R2.4, R3.2).
- **Section rhythm** → wrap sections in `SectionRhythm` so backgrounds/density alternate (R3.4).
- **CTA routing (R3.6)** → unchanged targets (`/` hero CTA → `/s/salon-rose`; business CTA → `/owner`); the design only requires the route fire on activation with no interstitial — already true. Trust block shows only on-page-real proof (R3.3).

#### Owner dashboard — Calendar (`OwnerCalendarPage` → admin `CalendarPage`) and Analytics (`OwnerAnalyticsPage` → admin `AnalyticsPage` + `AnalyticsChart`)

These reuse the admin pages verbatim (per `pages/owner/index.tsx`), so changes land in the admin components and flow through.

- **Calendar (R5.1, R5.3, R5.4)** — day + week views with a legible time/resource grid; numbers via `<Num>` with `tabular-nums` aligned on a baseline; keyboard view-switch/date-nav/cell focus with RTL-correct arrow keys (ArrowRight = inline-start in RTL); skeleton matching the grid while loading.
- **Analytics (R5.2)** — `AnalyticsChart` is already a token-driven, dependency-free SVG/flex bar chart with `role="img"` + label and `<Num>` Persian tabular values. To satisfy "never color-only," each bar/metric pairs color with a **text value + label** and the page provides an **accessible table equivalent** (the existing busiest-windows table) alongside the chart; KPI cards label each metric in text. The single `bg-primary` bar fill now inherits the signature primary; we add a non-color encoding (value label already present) so meaning never relies on hue.
- **Data states (R5.4, R5.5, R5.6)** — standardize all three owner data surfaces on the lifecycle: `Skeleton` (matching final layout) while `status === 'loading' | 'idle'` → `EmptyState` only when `status === 'success' && isEmpty` → `ErrorState` (cause + retry, no stack/HTTP) when `status === 'error'`, and the error state may appear after a prior successful load (refresh failure). These map directly onto the existing `EmptyState`/`ErrorState`/`Skeleton`/`Card loading` primitives.

### 6. Motion (R6) + component states (R7) + typography/numerics (R8)

- **Motion (R6)** — expressed only through the existing `--dur-*`/`--ease-*` tokens (mapped to `duration-*`/`ease-*` Tailwind utilities, already used by `Button`). Authored animations use `transform`/`opacity` only (never `width`/`height`/`top`). The `framer-motion` dependency (already in `package.json`) may drive entrances, but durations/easings are passed from the tokens, not literals. Reduced-motion: the global `@media (prefers-reduced-motion: reduce)` block in `tokens.css` already collapses transitions; signature micro-interactions add opacity-only fallbacks and never gate action completion. Emphasized easing (`--ease-emphasized`) is reserved for the booking-success moment (`BookingSuccessPage`).
- **Component states (R7)** — already strong (`Button` has all six interactive states; `Card`/`Skeleton`/`EmptyState`/`ErrorState`/`Toast` cover data states). The signature work is to ensure these render with the *new* signature tokens (automatic via the palette change) and to extend the same skeleton→empty/error→populated discipline to any surface still missing it. `Toast` (ARIA live region) remains the explicit success confirmation (R7.5).
- **Typography/numerics (R8)** — `<Num>`, `<Money>`, `<JalaliDate>`, `<DirText>` already exist and centralize Persian digits, Rial formatting, Jalali display, and bidi isolation. Signature additions: apply the display tokens to hero/section titles (R8.1); ensure `tabular-nums` is applied wherever `<Num>`/`<Money>` render (R8.3); keep `max-w-prose` (70ch) on long body copy (R8.6). Input fields keep Latin entry + submit-time normalization (R8.2), unchanged.

### 7. Quality gates + anti-generic lint (R9, R11)

#### New distinctiveness guardrail — `packages/web/src/styles/distinctiveness.test.ts`

A vitest that scans **authored source** (`src/**/*.{ts,tsx,css}`, excluding tests, `tokens.css`, generated/3D `components/three`, and `marketing-assets.ts` where accent literals legitimately live) and fails on forbidden patterns, reporting each violating file + rule (R11.3, R11.4):

| Rule | Detection (regex over authored source) | Maps to |
| --- | --- | --- |
| No indigo→purple gradient | `linear-gradient(` combined with indigo/purple hex family (`#6366f1`,`#818cf8`,`#a855f7`,`#8b5cf6`,`#d946ef`,`#e879f9`) or `from-indigo`/`to-purple` Tailwind | R2.1, R11.3 |
| No physical L/R for flow spacing | `\b(margin|padding)-(left|right)\b`, `\b(left|right):` in CSS, Tailwind `\b(ml|mr|pl|pr|left|right)-` (allow `rtl:`-prefixed sign flips + documented exceptions) | R9.5, R11.3 |
| No raw hex/px/ms in authored styles | hex `#[0-9a-f]{3,6}`, `\d+px`, `\d+ms` outside `tokens.css` and outside tenant runtime data | R6.1, R9.5, R11.3 |
| Library usage carries signature tokens | heuristic: a flagged surface using a Component_Library element with an inline color/`style` literal instead of tokens | R2.3, R11.3 |

**Realism / false positives (honest scope):** a pure-regex scan cannot prove semantic "distinctiveness." It is a *regression tripwire*, not a certificate. To keep it low-noise: scope tightly (exclude `tokens.css`, `marketing-assets.ts`, `components/three`, `*.test.*`, generated assets); allow an inline `// distinctiveness-ok: <reason>` opt-out comment for the rare legitimate literal (e.g. an SVG `viewBox`, which is not a px style); treat `rtl:`-prefixed and logical utilities as compliant. The check complements — does not replace — `contrast.test.ts`, the `vitest-axe` suites, and the Lighthouse a11y/CWV gate already wired in `web-a11y.yml`. CWV/bundle budgets (R9.4, R9.6) stay enforced by the existing `lighthouserc.json` + `analyze-bundle.mjs` build steps; the public routes keep their code-split boundaries (no admin/chart/Jalali on `/`, `/business`, `/s/:slug`).

#### Token completeness — `styles/tokens-complete.test.ts`

Asserts that for every semantic role in `ColorPalette`, **both** `lightColors` and `darkColors` define a non-empty value, and that the display type tokens satisfy weight/line-height relationships (R1.1, R1.6, R1.2).

### 8. Governance (R10)

#### Edits to `.kiro/steering/ui-ux-skills.md` (R10.1)

Add a new top section **"Signature Design Language"** documenting: the salon-luxe palette tables (light + dark, the new hex values), the display/body type pairing tokens, the `Motif` device and its recurrence, the editorial/asymmetric layout primitives, and the anti-generic constraints. Update the existing §2 color table and the line that currently reads "Seed palette is built around the existing brand indigo `#6366f1`" so the steering file matches the shipped tokens (the requirements state: where this document and a steering file disagree, the steering file wins — so they must agree).

#### New steering skill file — `.kiro/steering/signature-design-language.md` (R10.2)

Front-matter scopes it to web source so it auto-includes when editing those files:

```markdown
---
inclusion: fileMatch
fileMatchPattern: 'packages/web/src/**/*.{ts,tsx,css}'
---
# Signature Design Language — enforceable rules
- Use the salon-luxe palette tokens; never the indigo/purple family.
- No default indigo→purple hero gradient; derive hero bg from tokens/motif.
- 3+ peer features: use FeatureMosaic/EditorialSplit, not one equal-card row.
- Display titles use the display tokens (heavier weight, tighter line-height).
- Brand motif present on hero/brand surfaces.
- Tokens-only; logical properties only; tenant accent via runtime vars only.
```

#### Two agent hooks under `.kiro/hooks/` (R10.3–R10.5) — advisory only

The `.kiro/hooks/` directory does not exist yet; it will be created. Both hooks are **advisory: they may run tests / surface reminders but never block a save and never delete or rewrite file contents** (R10.5).

`post-file-save-web-a11y.kiro.hook` (R10.3):
```json
{
  "enabled": true,
  "name": "Web a11y/contrast on save",
  "description": "Runs the web contrast + axe suites when a web component/style file is saved (advisory).",
  "event": "PostFileSave",
  "matcher": "packages/web/.*\\.(ts|tsx|css)$",
  "action": {
    "type": "runCommand",
    "command": "npm run test --workspace @salon/web -- styles/contrast.test.ts styles/tenant-contrast.test.ts styles/distinctiveness.test.ts",
    "blocking": false
  }
}
```

`pre-tool-use-design-reminder.kiro.hook` (R10.4):
```json
{
  "enabled": true,
  "name": "Signature design-language reminder",
  "description": "Surfaces the distinctive design-language rules before a web file write (advisory; never blocks or edits).",
  "event": "PreToolUse",
  "matcher": "fs_write|str_replace",
  "action": {
    "type": "advisory",
    "message": "Signature design language: salon-luxe palette tokens only; no indigo→purple gradient; display tokens for titles; motif on brand surfaces; logical properties only; tenant accent via runtime vars. See .kiro/steering/signature-design-language.md.",
    "blocking": false
  }
}
```

> Note: field names follow the workspace hook runner's schema; the contract that matters per R10.5 is `blocking: false` and no file mutation — both hooks only read/run tests or print a reminder.

---

## Data Models

### Accent + on-accent foreground (web, presentation)

```ts
// Reused as-is from pages/owner/marketing-assets.ts
interface AccentTheme { key: string; from: string; to: string; soft: string; ink: string; }

// NEW (components/theme/tenantTokens.ts) — derived, never stored
interface TenantTokenOverrides {
  '--color-primary': string;          // ensureAaFill(from)
  '--color-primary-contrast': string; // onAccentForeground(primary): white | ink (AA-checked)
  '--color-accent': string;           // to
  '--color-focus-ring': string;       // primary
}
```

### Salon brand (backend) — additive, flagged for sign-off

```prisma
model Salon {
  // …existing fields (id, name, qrToken, timezone, autoApprove, createdAt)…
  brandAccent String? @map("brand_accent")   // NEW, nullable; null = signature default
}
```

API shapes (additive — no breaking change):
```ts
// READ (public): extend GET /salons/by-qr/:payload  OR add GET /salons/:id/brand
{ salon: { id: string; name: string; brandAccent?: string | null } }
// WRITE (owner, configure_salon): POST /salons/:id/brand-accent
//   body: { brandAccent: string | null }  → { ok: true, brandAccent }
```

### Static profile (web, presentation)

```ts
// data/salons.ts — SalonProfile gains:
brandAccent?: string;   // optional Brand_Accent key for prerendered /s/:slug
```

---

## Per-surface change map

| Requirement | Files / components touched |
| --- | --- |
| R1.1, R1.5, R1.6, R2.1 (palette) | `packages/shared/src/tokens/index.ts` (lightColors/darkColors), `packages/web/src/styles/tokens.css`, `.kiro/steering/ui-ux-skills.md` (table); guarded by `styles/contrast.test.ts` |
| R1.2, R8.1, R8.3 (type pairing) | `tokens.css` + shared tokens (display tokens), `tailwind.config.js`, hero/section titles in marketing + shells |
| R1.3, R2.5 (motif) | NEW `components/brand/Motif.tsx` + `components/brand/index.ts`; used in `AppShell`, `OwnerShell`, `FunnelShell`, `MarketingHome`, `BusinessLanding`, `SalonProfilePage` |
| R1.4, R2.2, R3.4 (layout rhythm) | NEW `components/layout/EditorialSplit.tsx`, `FeatureMosaic.tsx`, `SectionRhythm.tsx`; applied in `MarketingHome`, `BusinessLanding` |
| R3.1–R3.3, R3.5, R3.6 (marketing) | `MarketingHome.tsx`, `BusinessLanding.tsx` (unchanged `SeoHead`/`JsonLd`/`Picture`); `i18n/fa.json` (`home.*`/`business.*`) |
| R4.1 (persist) | `schema.prisma`, NEW migration, `dev-constraints.sql`, `api/client.ts` (`brandAccentApi`), owner config UI; OR localStorage fallback |
| R4.2, R4.7, R4.8 (scoped override) | NEW `components/theme/TenantTheme.tsx`, `tenantTokens.ts`; applied around storefront subtrees (`SalonProfilePage`, funnel pages via `FunnelShell`) |
| R4.3 (on-accent AA) | NEW `styles/contrast.ts` (extracted math), `components/theme/tenantTokens.ts`; guarded by NEW `styles/tenant-contrast.test.ts` |
| R4.4 (fallback) | `TenantTheme` + `resolveAccent` (already falls back to `ACCENTS[0]`) |
| R4.5 (brand mark) | `FunnelShell.tsx`, `SalonProfilePage.tsx`, `Avatar` |
| R4.6 (PWA) | `pwa/salonManifest.ts` (`themeColor` option; replace hard-coded `#6366f1`) |
| R5.1, R5.3, R5.4 (calendar) | `pages/admin/CalendarPage.tsx` |
| R5.2, R5.4–R5.6 (analytics) | `pages/admin/AnalyticsPage.tsx`, `pages/admin/AnalyticsChart.tsx` |
| R6 (motion) | `tokens.css` (existing reduced-motion block), shared micro-interaction components; `framer-motion` driven by tokens |
| R7 (states) | `components/ui/{Button,Card,Skeleton,EmptyState,ErrorState,Toast}.tsx` (re-tinted via tokens; discipline extended) |
| R8.2, R8.4, R8.5 (numerics/dates/bidi) | `components/ui/{Num,Money,JalaliDate,DirText}.tsx` (existing) |
| R9.2 (gates) | existing suites + `web-a11y.yml` |
| R9.4, R9.6 (CWV/bundle) | existing `lighthouserc.json`, `scripts/analyze-bundle.mjs`, route code-splitting in `App.tsx` |
| R9.5, R11.3, R11.4 (lint) | NEW `styles/distinctiveness.test.ts` |
| R10.1 (steering) | `.kiro/steering/ui-ux-skills.md` |
| R10.2 (steering) | NEW `.kiro/steering/signature-design-language.md` |
| R10.3–R10.5 (hooks) | NEW `.kiro/hooks/post-file-save-web-a11y.kiro.hook`, `.kiro/hooks/pre-tool-use-design-reminder.kiro.hook` |
| R11.1, R11.2 (checklist) | NEW `packages/web/docs/distinctiveness-checklist.md` |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — a formal statement of what the system should do. These bridge the human-readable requirements and machine-verifiable tests. Each property below is universally quantified and annotated with the requirements it validates. They were derived from the prework testability analysis, with redundant criteria consolidated.*

### Property 1: Default palette meets AA everywhere it is used

For all foreground/background token pairings the UI ships (text and muted text on bg/surface/elevated; `primary-contrast` on primary and on danger; status colors and primary used as text on bg/surface; focus ring; `primary-contrast` on secondary), in **both** the light and dark themes, the WCAG contrast ratio is at least 4.5:1 for body text and at least 3:1 for large/non-text pairings.

**Validates: Requirements 1.5**

### Property 2: Token completeness across both themes

For all semantic color roles in `ColorPalette` and for all signature type/motion tokens, both the light theme and the dark theme define a non-empty value, so the identity is complete in each theme.

**Validates: Requirements 1.1, 1.6**

### Property 3: Display type is always distinct from body type

For all heading/display text, the display weight is strictly greater than the body weight and the display line-height is strictly less than the body line-height, so display text can never render visually uniform with body text.

**Validates: Requirements 1.2, 8.1**

### Property 4: Brand_Accent selection persists across sessions

For any Brand_Accent key in the curated `ACCENTS` palette, persisting it for a salon and then re-reading it in a new session returns the same key.

**Validates: Requirements 4.1**

### Property 5: Derived on-accent foreground meets AA

For any Brand_Accent in `ACCENTS` (and any tenant-supplied accent), the derived on-accent foreground (`--color-primary-contrast` over the derived `--color-primary` fill) meets at least 4.5:1 for body text and at least 3:1 for large text and non-text UI.

**Validates: Requirements 4.3**

### Property 6: Accent override is scoped and leaves the global theme unchanged

For any Brand_Accent applied to a storefront subtree, the accent is expressed only as runtime CSS custom properties on the scoped wrapper, the document-root token values are unchanged, and Component_Library elements inside reference only tokens (no authored color literals).

**Validates: Requirements 4.2, 4.7**

### Property 7: Accent resolution is total and falls back safely

For any accent key value (including absent, unknown, or malformed strings), the Tenant_Theming_System resolves to a usable theme — the signature default when no valid accent applies — and never renders the storefront unstyled or retries indefinitely.

**Validates: Requirements 4.4**

### Property 8: Brand mark uses the salon's display identity

For any salon Storefront, the primary brand mark text equals the salon's configured display name when present and otherwise the salon's stored name, and the platform identifier is rendered in a subordinate position.

**Validates: Requirements 4.5**

### Property 9: PWA install identity derives from the accent and scopes to the storefront

For any salon with a Brand_Accent, installing the PWA from its Storefront produces a manifest whose `theme-color` is derived from that accent and whose `start_url` is that salon's Storefront path.

**Validates: Requirements 4.6**

### Property 10: An active accent preserves theme switching and reduced-motion

For any Brand_Accent active on a Storefront and any theme, toggling light/dark still updates the surface tokens, and `prefers-reduced-motion: reduce` behavior is unchanged by the accent wrapper.

**Validates: Requirements 4.8**

### Property 11: Data-surface lifecycle shows skeleton then the resolved state

For any data surface and any async lifecycle, while the request is pending or existence-of-data is undetermined the surface renders a layout-matched skeleton (never a centered spinner), the empty state is shown only after the request settles with no data, and on settle the skeleton is replaced by the populated, empty, or error state.

**Validates: Requirements 5.4, 5.5, 7.1**

### Property 12: Error states are safe and recoverable

For any failed data request, the rendered error state presents a human-readable Persian cause and a retry affordance, and never exposes a raw stack trace or HTTP status code, even when a prior load had succeeded.

**Validates: Requirements 5.6, 7.3**

### Property 13: Every metric has a non-color-only equivalent

For any analytics metric rendered, a labeled text or table equivalent accompanies the visualization, so no metric is conveyed by color alone.

**Validates: Requirements 5.2**

### Property 14: Numeric display is Persian and tabular

For all user-facing numeric values (prices, dates, counts, timers, calendar cells, analytics figures), digits render as Persian/Eastern-Arabic numerals with tabular (consistent-advance) figures.

**Validates: Requirements 5.1, 8.3**

### Property 15: Digit display/normalization round-trips

For any integer value, rendering it through the display formatter (Persian digits) and normalizing the result back to machine form yields the original value; displayed output contains no ASCII digits while input fields retain Latin entry.

**Validates: Requirements 8.2**

### Property 16: Jalali date conversion round-trips

For any valid date, converting ISO → Jalali for display and back to ISO at the API boundary yields the original date.

**Validates: Requirements 8.5**

### Property 17: Interactive elements define all six states

For any interactive Component_Library element, the default, hover, focus-visible, active/pressed, disabled, and loading states are each defined and styled with signature tokens, regardless of any concurrent or overlapping UI state.

**Validates: Requirements 7.4**

### Property 18: Motion stays within the token band and reserves emphasized easing

For any animation in authored styles, its duration falls within the 150ms–300ms token band, and the emphasized easing token is used only on the booking-success confirmation surface.

**Validates: Requirements 6.4**

### Property 19: The distinctiveness guardrail flags generic regressions

For any authored web source file, the guardrail flags it if and only if it contains a forbidden pattern (an indigo→purple gradient literal, a physical `left`/`right` property used for flow-relative spacing, a raw hex/pixel/millisecond literal in authored styles, or Component_Library usage that omits signature tokens), and passes files that contain none.

**Validates: Requirements 2.1, 2.3, 6.1, 6.2, 9.5, 11.3**

### Property 20: Guardrail violations are reported with file and rule

For any set of guardrail violations, the check reports each violation with its file path and the specific rule it broke, so the regression can be located and corrected.

**Validates: Requirements 11.4**

### Property 21: Marketing routes are indexable with unique metadata

For all Marketing_Surface routes (`/`, `/business`), the route is marked indexable and emits a unique, non-empty title, meta description, canonical URL, and Open Graph metadata.

**Validates: Requirements 3.5**

---

## Testing Strategy

### Dual approach

- **Property-based tests** validate the universal properties above across generated inputs (≥ 100 iterations each), tagged `Feature: signature-ui-system, Property {n}: {text}`. They are the right tool here for the pure, input-varying logic: contrast math (Properties 1, 5), accent resolution totality (7), digit/Jalali round-trips (15, 16), the data-surface lifecycle state machine (11), brand-mark fallback (8), and the guardrail scanner soundness (19, 20).
- **Example / unit tests** cover specific scenarios and interactions: single-primary-CTA hero (R3.1), CTA navigation with no interstitial (R3.6), keyboard RTL navigation (R5.3), success toast via live region (R7.5), reduced-motion behavior (R6.3), bidi isolation (R8.4), and the motif render (R1.3).
- **Integration / build gates** (not PBT) cover infrastructure-shaped criteria: the Lighthouse a11y + Core Web Vitals budgets on prerendered routes (R9.4), the public-route JS bundle budget and code-split boundaries (R9.6), and the CI wiring that fails on serious/critical a11y (R9.2). These run via the existing `web-a11y.yml`, `lighthouserc.json`, and `analyze-bundle.mjs` — unchanged in shape.
- **Smoke / presence checks** cover documentation and governance artifacts: steering edits (R10.1), the new steering file with correct front-matter (R10.2), the two advisory hooks' JSON (R10.3–R10.5), and the distinctiveness checklist doc (R11.1, R11.2).

### Where tests live (all under `packages/web`, run by `vitest run`)

| Suite | Status | Guards |
| --- | --- | --- |
| `src/styles/contrast.test.ts` | existing — keep green | Property 1 (R1.5) |
| `src/styles/contrast.ts` | NEW (extracted WCAG math, imported by tests + `tenantTokens.ts`) | shared dependency |
| `src/styles/tenant-contrast.test.ts` | NEW | Property 5 (R4.3) |
| `src/styles/tokens-complete.test.ts` | NEW | Properties 2, 3 (R1.1/1.6/1.2) |
| `src/styles/distinctiveness.test.ts` | NEW | Properties 19, 20 (R2.1/2.3/6.1/6.2/9.5/11.3/11.4) |
| `src/components/theme/__tests__/TenantTheme.test.tsx` | NEW | Properties 6, 7, 10 (R4.2/4.4/4.7/4.8) |
| `src/components/theme/__tests__/tenantTokens.test.ts` | NEW | Property 5 (R4.3) |
| `src/pwa/__tests__/salonManifest.test.ts` | NEW/extend | Property 9 (R4.6) |
| `src/pages/__tests__/*` (marketing, storefront) | NEW/extend | Properties 8, 21 + R3.1/3.6 |
| `src/pages/admin/{CalendarPage,AnalyticsPage}.test.tsx` | existing — extend | Properties 11–14 (R5.x) |
| component tests for Num/Money/JalaliDate/DirText | existing — extend | Properties 14–16 (R8.x) |

### Constraints honored

- The palette change is the riskiest move: it lands first in `@salon/shared` so `contrast.test.ts` (the AA gate) re-runs against the new values before anything else can ship, then `tokens.css` mirrors it byte-for-byte, then the steering table.
- The Component_Library interfaces do not change, so existing component/page suites stay valid — only the resolved colors change.
- **Known pre-existing failing tests must not be relied upon as a signal.** New work is validated against the new suites above and the previously-green suites it touches; a test that was already red before this work is not treated as a gate (and is not "fixed" by coincidence). The Tasks phase will note which suites are expected green.
- Property tests use mocks for any I/O (the accent persistence round-trip can run against the client store or a mocked salon API) so they stay fast and deterministic.

---

> **Next step:** This is the Design phase. After you review and approve this design — and in particular **decide on the per-tenant persistence approach (additive `Salon.brandAccent` column vs. the no-backend client-side fallback)** — the Tasks phase will produce `tasks.md` (incremental, test-anchored implementation steps mapped to these properties).
