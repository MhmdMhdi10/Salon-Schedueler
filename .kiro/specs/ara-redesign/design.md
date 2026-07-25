# Design Document — آرا (Ārā) Redesign

## Overview

This design specifies a **presentation-only re-skin and re-composition** of the existing
`packages/web` frontend into the **آرا (Ārā)** brand: a beauty-booking platform whose visual
language is adapted from **boosky.com** (deep interactive teal action color over a clean,
high-contrast black/white foundation, photography-forward cards, understated chrome,
search-first discovery, calendar-centric owner dashboard) while staying **fully Persian, RTL,
Jalali-dated, Rial/Toman-priced, and Iranian-market-first**.

It is deliberately **not** a greenfield build and **not** a backend change. The platform already
ships the full foundation — routing (`App.tsx`), a component library (`components/ui`,
`components/layout`, `components/sections`, `components/brand`, `components/theme`,
`components/seo`), a three-source-of-truth token architecture, an i18n catalog (`i18n/fa.json`),
a PWA (`vite-plugin-pwa`), and the SEO/a11y/RTL patterns. Crucially, the shipped tokens are
**already** a boosky-derived two-tier teal identity (light primary `#0B7A68`, accent `#05CFA6`).
So this work **tunes and re-composes**; it does not re-seed the palette.

This spec's **entry point is Design** (no separate `requirements.md`). The numbered
"Goals, Scope & Locked Decisions" section below is the traceability anchor: tasks and correctness
properties reference those numbered decisions plus the Correctness Properties.

### What changes vs. what is reused

| Layer | Action |
| --- | --- |
| Brand identity (name, wordmark, `Motif`, brand strings) | **Rebrand** «رزرو سالن» → آرا (Ārā) |
| Token **values** (`tokens.css` + `@salon/shared` + `ui-ux-skills.md` table) | **Tune** teal toward boosky within AA + distinctiveness bounds; keep byte-identical |
| `contrast` / `distinctiveness` / `tokens-complete` guardrails | **Keep enforcing**; update expected values only if a token value actually changes |
| Component library (`components/**`) | **Re-skin + re-compose**; keep component APIs |
| Pages (`pages/**`) | **Re-compose** layout/section rhythm; keep routes |
| Reference-clone assets (hero, categories, features, blog, seo, videos) | **Copy** into `packages/web/public/**`; Persian alt; no placeholders |
| `App.tsx` routing, public/authed split | **Reuse unchanged** |
| API client, backend, Prisma schema, worker | **Untouched** |
| i18n catalog (`fa.json`) | Swap the **brand name** token to آرا; **add keys** as needed; keep descriptive Persian body copy |
| PWA manifest / service worker | **Reuse**; only `theme_color` re-derived from the primary + brand strings updated |

---

## Goals, Scope & Locked Decisions

These are the LOCKED decisions for this spec. They are numbered so tasks and properties can cite
them (e.g. `_Design: Goals 4, 7_`). They stand in for a requirements document.

1. **Rebrand to آرا (Ārā).** The product name «رزرو سالن» / «سامانه رزرو سالن» becomes **آرا**
   (Latin lockup **Ārā**) everywhere the *brand name* appears. This is a brand/presentation layer
   change; descriptive Persian body copy is preserved.
2. **Adapt the boosky.com visual language** (per the reference clone at
   `/home/mti/Desktop/ai-website-cloner-template` and `docs/design-research/booksy-analysis.md`)
   while **keeping** RTL, Persian, Vazirmatn, Jalali (Shamsi) dates, Rial/Toman currency, the
   Iranian week (Saturday first), and the Iranian market. The theme is **styling/adornment**,
   extensible to fashion later.
3. **Presentation only.** Preserve all backend, API-client request/response shapes, route
   structure, the public/authenticated split, the i18n catalog structure, and the **semantic
   token names**. No domain-model, endpoint, or routing changes.
4. **Keep the AA-safe two-tier teal token system.** Tune the teal toward boosky **only where**
   `contrast.test.ts` and `distinctiveness.test.ts` stay green. The bright boosky literal
   `#05CFA6` remains `--color-accent` (large fills + dark ink only); the deep teal `#0B7A68`
   remains `--color-primary` (AA both directions).
5. **Three lockstep token sources stay byte-identical** per role:
   `.kiro/steering/ui-ux-skills.md` (the governing table), `packages/shared/src/tokens/index.ts`
   (`lightColors`/`darkColors`), and `packages/web/src/styles/tokens.css`
   (`:root` / `[data-theme="dark"]`). Editing `packages/shared` in Task 1 is **expected**.
6. **Re-derive the PWA `theme_color`** (and the `<meta name="theme-color">` behavior) from the
   light primary after any tuning.
7. **Guardrails stay green after every task:** `contrast.test.ts` (AA both themes),
   `distinctiveness.test.ts` (no indigo/purple family, tokens-only, logical properties),
   `tokens-complete.test.ts` (parity + `display weight > body` AND `display line-height < body`),
   `vitest-axe`, and the CWV/bundle/prerender build gates. Each task ends by running
   contrast/tokens-complete/distinctiveness + `npm run check`.
8. **Category taxonomy = the app's own taxonomy** (`fa.json` `home.services.items`):
   haircut/color/makeup/nails/skin/brows, plus a men's **barbershop**. It is mapped to the
   reference-clone category SVGs, rendered as a boosky-style horizontal category browser,
   token-driven fill, RTL-aware, with Persian accessibility labels. **No placeholders.**
9. **Reuse actual boosky assets.** Copy the reusable reference-clone assets (hero, categories,
   features, app, blog, seo, videos) into `packages/web/public/**`; Persian `alt`, explicit
   `width`/`height`, AVIF/WebP where the `Picture` pipeline exists. **No placeholders.**
10. **Rebrand touch-points (exact):** header/footer wordmark (`AppShell` renders
    `t('app.title')`), `SeoHead` title template + `og:site_name` (`seo/config.ts` `SITE_NAME`),
    `manifest.json` `name`/`short_name`/`description`, JSON-LD `Organization`/`WebSite` `name`,
    the `Motif`, and brand-name occurrences in `fa.json` (`app.title`, `app.footer`, and the
    embedded «رزرو سالن» product-name mentions such as `auth.agreeSuffix`, `legal.*`,
    `business.*`). Body copy stays descriptive Persian.
11. **Re-theme the `Motif`** from the current crossed-razors (barbershop) device to an آرا
    **adornment** device (a token-driven "petal/bloom arc"), still `aria-hidden`, still
    token-driven so it re-tints per theme **and** per tenant accent; sized by `className` only.
12. **Preserve the route index/noindex + sitemap policy** (verified in `App.tsx`, enforced by
    `SeoHead`'s noindex-by-default): indexable = `/`, `/s/:slug`, `/city/:city`,
    `/services/:type`, `/business`, and legal (`/about`, `/contact`, `/privacy`, `/terms`);
    **noindex** = `/auth`, `/qr/:payload`, `/salon/:salonId/book`, `/book/confirm`,
    `/booking/success`, `/business/register`, and `/owner/*`.
13. **Tokens-only + logical-properties-only** authored styles; no indigo/purple family; RTL
    sign-flips via `rtl:`/`ltr:` variants. (This includes tokenizing the one raw literal
    `bg-[#f5f5f6]` currently in `AppShell`.)
14. **Status is never color-only** — every status-bearing surface carries fill + text label +
    icon/ARIA state.
15. **Localized display:** Persian numerals for prices/dates/counts, Rial/Toman formatting with a
    unit, Jalali dates, and bidi isolation for the phone/OTP fields (LTR-isolated, normalized on
    submit).
16. **Tenant Brand_Accent via runtime CSS vars only** (`TenantTheme` / `FunnelTenantTheme` /
    `deriveTenantTokens`); the on-accent foreground clears AA (≥ 4.5:1 body, ≥ 3:1 large/non-text).
17. **Structure & keyboard:** exactly one `<h1>` + `header`/`nav`/`main`/`footer` landmarks per
    page, a skip link, keyboard-operable RTL focus order, and ≥ 44×44px targets.
18. **Images** declare intrinsic dimensions (no CLS) and missing salon imagery yields the branded
    `SalonPlaceholder` (never a gray box).
19. **The booking funnel preserves step state on back navigation**, and form fields signal errors
    accessibly (`aria-invalid` + `aria-describedby`, text + icon).
20. **Honesty note:** automated checks are a **floor, not a certificate.** Full WCAG 2.2 AA
    conformance requires manual assistive-technology testing (VoiceOver/iOS, TalkBack/Android,
    NVDA — all in RTL/Farsi), keyboard-only runs, and expert review.

---

## Brand Identity — آرا (Ārā)

### Meaning

**آرا** derives from the Persian root **آراستن** — *to adorn, to arrange, to embellish*. It reads
immediately as beauty, grooming, and adornment, which is exactly the salon domain, and it is
short, memorable, and **extensible to fashion/styling** later. The Latin lockup is **Ārā** (with
macrons) so the mark travels internationally without losing the Persian phonetics.

### Wordmark

- Persian wordmark «**آرا**» set in **Vazirmatn** at the display treatment
  (`--font-weight-display` 800, `--line-height-display`, `--tracking-display`) via the
  `text-display` utility — so the wordmark never renders visually uniform with body text.
- Optional Latin sub-lockup **Ārā** at a smaller weight for bilingual surfaces.
- The wordmark sits beside the `Motif` `mark` in the `AppShell`, `OwnerShell`, and `FunnelShell`
  headers and in the footer. It is **token-colored** (`--color-ink` / `--color-ink-contrast`
  depending on band), never a hard-coded hex.

### Motif (adornment device)

The current `components/brand/Motif.tsx` is a **crossed-razors** (barbershop) glyph — off-brand
for آرا. It is re-themed to a token-driven **petal/bloom arc** adornment device (overlapping arcs
that read as a stylized bloom / mirror flourish, evoking beauty and adornment rather than a
barbershop). It keeps the exact same contract:

- Fills come **only** from `var(--color-primary)` / `var(--color-accent)` / `currentColor`, so it
  re-tints per theme **and** per tenant accent automatically.
- `aria-hidden` by default; `className` controls **size only**, never color.
- Three variants preserved: `mark` (logo-scale, beside the wordmark), `band` (hero/section
  divider flourish), `watermark` (faint backdrop behind owner empty states).

### Voice

Warm, concise, action-oriented Persian (verbs on buttons: «شروع رزرو»، «دریافت کد»،
«انتخاب زمان»). Reuse the established i18n tone; only the brand-name token changes.

### Exact rebrand touch-points

| Surface | Current | آرا target |
| --- | --- | --- |
| `AppShell` header/footer wordmark | `t('app.title')` → «سامانه رزرو سالن» | «آرا» wordmark + `Motif` |
| `seo/config.ts` `SITE_NAME` | «رزرو سالن» | «آرا» (drives title template + `og:site_name`) |
| `manifest.json` `name`/`short_name`/`description` | «رزرو آنلاین سالن زیبایی» / «رزرو سالن» / … | «آرا …» |
| JSON-LD `Organization`/`WebSite` `name` | «رزرو سالن» | «آرا» |
| `Motif` device | crossed razors | آرا petal/bloom arc |
| `fa.json` brand-name mentions | «رزرو سالن» in `app.*`, `auth.agreeSuffix`, `legal.*`, `business.*` | «آرا» (descriptive copy unchanged) |

---

## boosky Design-Language Adaptation

The reference is boosky.com (via the clone + `booksy-analysis.md`). We adopt boosky's *patterns*
and adapt anything English/LTR/US-market to Persian/RTL/Iran.

| boosky pattern | آرا / Iranian adaptation | Explicitly NOT copied |
| --- | --- | --- |
| Search-first hero (service + location) | Same, but Persian labels, RTL layout, photography + scrim + `Motif` band | English placeholder copy |
| Photography-forward salon cards + rating badge overlay | Same; Persian `alt`, Rial/Toman starting price in Persian numerals, RTL hierarchy | USD `$$` price band |
| Teal action color over black/white | Reuse the two-tier teal already shipped (deep `#0B7A68` action, bright `#05CFA6` large-fill) | boosky's raw `#05CFA6` as small text |
| Horizontal category browser | Same; app taxonomy + reference SVGs + Persian a11y labels (Goal 8) | English category names |
| Minimal / understated chrome | Same understated header/footer + calendar-centric owner nav | — |
| Alternating dark/light section rhythm | `SectionRhythm` alternating `--color-bg`/`--color-surface` | — |
| 3-step booking (service → date/time → confirm) | Same `BookingStepper`, plus Jalali picker + `SlotGrid` | Gregorian calendar |
| Bottom-sheet date/time on mobile, sticky CTA | Same; sticky CTA in the bottom third for thumb reach | — |
| Poppins / Proxima Nova type | **Vazirmatn** display⇄body pairing (variable, self-hosted) | Poppins/Proxima Nova |
| Multi-market language switch | **Single-locale Persian** (`lang="fa"`, `dir="rtl"`, `og:locale=fa_IR`) | Language switcher |
| Sunday-first week / US hours | **Iranian week** (Saturday first) in `OpeningHoursSpecification` | Sun-first week |

---

## Token Strategy

### Three lockstep sources (byte-identical per role)

```
.kiro/steering/ui-ux-skills.md (governing palette table)
        │  (same values)
        ▼
packages/shared/src/tokens/index.ts   ← lightColors / darkColors (pure values; RN + web)
        │  (byte-identical values)
        ▼
packages/web/src/styles/tokens.css    ← :root (light) + [data-theme="dark"] custom properties
        │
        ├── contrast.test.ts        ← imports @salon/shared, asserts every pairing ≥ AA
        ├── tokens-complete.test.ts ← asserts parity of roles + display/body invariant
        └── distinctiveness.test.ts ← scans authored source for generic/raw-literal regressions
```

Where the steering table and the shipped tokens disagree, **the steering file wins** — so all
three move together. Editing `packages/shared` in Task 1 is expected (Goal 5).

### Two-tier teal (the boosky contrast resolution — retained)

boosky's literal teal `#05CFA6` is only **2.0:1** on white and fails AA as small text. The shipped
identity already resolves this and آرا keeps it:

- `--color-primary = #0B7A68` (deep teal) — clears 4.5:1 **both** directions (as colored text on
  white *and* as a fill under white text). CTAs, links, small teal text, icons, focus ring.
- `--color-accent = #05CFA6` (bright boosky teal) — **large decorative fills only, dark ink
  overlaid** (dark ink 9.88:1 on accent). Never small text / standalone non-text on light.
- `--color-secondary = #116E60` — supporting emphasis, completed-step badge; text-safe (6.13:1).

### Light theme — AA-verified (unchanged shipped values)

| Token | Hex | Role | Key contrast |
| --- | --- | --- | --- |
| `--color-bg` | `#FFFFFF` | Page background | — |
| `--color-surface` | `#F5F6F7` | Cards, sheets, alt sections | text ~17:1 |
| `--color-elevated` | `#FFFFFF` | Menus, dialogs, popovers | — |
| `--color-text` | `#111417` | Near-black primary text | 18.48:1 on bg |
| `--color-text-muted` | `#586170` | Secondary/help text | 6.25:1 on bg |
| `--color-border` | `#E4E7EA` | Dividers, input borders | decorative (exempt) |
| `--color-primary` | `#0B7A68` | Deep teal action / CTA / links / focus | 5.25:1 both directions |
| `--color-primary-contrast` | `#FFFFFF` | On primary & danger fills | 5.25:1 on primary |
| `--color-secondary` | `#116E60` | Secondary emphasis, completed step | 6.13:1 on white |
| `--color-accent` | `#05CFA6` | Bright signature teal — large fills only, dark ink | dark ink 9.88:1 |
| `--color-success` | `#1F7A43` | Booked, paid, confirmed | ≥ 4.5:1 |
| `--color-warning` | `#9A5B12` | Expiring OTP, low slots | ≥ 4.5:1 |
| `--color-danger` | `#B3261E` | Failed pay, cancel, errors | white-on ≥ 4.5:1 |
| `--color-info` | `#1F5FAE` | Neutral notices | ≥ 4.5:1 |
| `--color-focus-ring` | `#0B7A68` | Focus outline | ≥ 3:1 |

Presentation surfaces `--color-ink` `#111417` / `--color-ink-contrast` `#FFFFFF` /
`--color-ink-muted` `#9AA3AE` (hero/footer bands) and the boosky app-card surfaces
`--color-app-mint` `#E8F5E9` / `--color-app-gray` `#F5F5F6` are retained.

### Dark theme — AA-verified (unchanged shipped values)

| Token | Hex | Role | Key contrast |
| --- | --- | --- | --- |
| `--color-bg` | `#0F1111` | Near-black page background | — |
| `--color-surface` | `#181B1B` | Cards, sheets, alt sections | text ~16:1 |
| `--color-elevated` | `#222626` | Menus, dialogs, popovers | — |
| `--color-text` | `#F4F6F6` | Luminous primary text | 17.46:1 on bg |
| `--color-text-muted` | `#A6ADAD` | Secondary/help text | 8.3:1 on bg |
| `--color-border` | `#2A2F2F` | Dividers, input borders | decorative (exempt) |
| `--color-primary` | `#2DE0BE` | Luminous teal action / CTA / links / focus | 11.29:1 on bg |
| `--color-primary-contrast` | `#0F1111` | Dark ink on primary & danger fills | 11.29:1 on primary |
| `--color-secondary` | `#4FE3C8` | Secondary emphasis, completed step | ≥ 3:1 |
| `--color-accent` | `#38E0C0` | Bright signature teal highlight (dark ink) | dark ink 11.36:1 |
| `--color-success` | `#69D08C` | Booked, paid, confirmed | ≥ 4.5:1 |
| `--color-warning` | `#E7B45C` | Expiring OTP, low slots | ≥ 4.5:1 |
| `--color-danger` | `#F2938C` | Failed pay, cancel, errors | ink-on ≥ 4.5:1 |
| `--color-info` | `#86B6F0` | Neutral notices | ≥ 4.5:1 |
| `--color-focus-ring` | `#2DE0BE` | Focus outline | ≥ 3:1 |

Dark `--color-ink` `#05080A` / `--color-ink-contrast` `#F4F6F6` retained.

### Tuning boundaries (Goal 4)

Any teal nudge toward the boosky look must satisfy **all** of:

- `--color-primary` stays a **deep teal** clearing **4.5:1 in both directions** (as text on
  `bg`/`surface` and as a fill carrying `--color-primary-contrast`).
- `--color-secondary` stays **text-safe** (≥ 4.5:1 on `bg`/`surface`).
- `--color-accent` stays a **large-fill-only** bright teal with **dark ink** (≥ 4.5:1 ink-on-accent).
- `--color-focus-ring` ≥ **3:1** on `bg`/`surface`/`elevated`.
- **No hue drift into the indigo/purple family** (`#6366f1`,`#818cf8`,`#a855f7`,`#8b5cf6`,
  `#d946ef`,`#e879f9`) — that trips `distinctiveness.test.ts`.
- Dark counterparts stay **luminous** and carry the dark ink contrast.
- Any changed value is written to **all three** sources byte-identical, and `contrast.test.ts`
  expected pairings are updated in lockstep (test **logic** unchanged).

Because the shipped values already satisfy these, "tuning" is bounded to small nudges at most; the
default is to keep values and re-derive only `theme_color` + brand strings.

### Non-color tokens (unchanged)

Typography scale, the heroic display scale (`--font-3xl…5xl`), the display pairing tokens, spacing
(8pt grid), radius, elevation, z-index ladder, and motion tokens are reused unchanged. The
`display weight > body weight` AND `display line-height < body line-height` invariant continues to
hold. Shadows stay understated (neutral low-contrast light; border + subtle shadow in dark; faint
teal `--shadow-glow`).

### PWA `theme_color` (Goal 6)

`manifest.json` `theme_color` is re-derived from the light primary (already `#0B7A68`; re-confirm
if tuned). `<meta name="theme-color">` continues to switch with the active theme via
`ThemeProvider`. The manifest value is **data**, not an authored style, so it is exempt from the
distinctiveness scan.

---

## Category Taxonomy & Icons (Goal 8)

The category set is the app's own taxonomy from `fa.json` `home.services.items`, plus a men's
barbershop. Each maps to an **actual** reference-clone SVG in
`/home/mti/Desktop/ai-website-cloner-template/public/images/categories/`.

| App taxonomy key | Persian label (fa.json) | Reference SVG |
| --- | --- | --- |
| `haircut` | کوتاهی و حالت‌دهی مو | `hair-salons.svg` |
| `color` | رنگ و مش | `hair-salons.svg` (hair family) |
| `makeup` | میکاپ و گریم | `make-up.svg` |
| `nails` | ناخن و مانیکور | `nail-salons.svg` |
| `skin` | پوست و پاکسازی | `skin-care.svg` |
| `brows` | ابرو و مژه | `brows-and-lashes.svg` |
| `barber` (men's) | آرایشگاه مردانه | `barbers.svg` |
| optional: spa/massage | اسپا و ماساژ | `day-spa.svg` / `massage.svg` |
| optional: hair-removal | اپیلاسیون | `hair-removal.svg` |

**Implementation:** copy the used SVGs into `packages/web/public/images/categories/` **or**
extract them into a `components/icons.tsx` set. Fills are **token-driven** (`currentColor` /
`var(--color-primary)`), RTL-aware, with Persian `aria-label`s. Rendered as a **boosky-style
horizontal category browser** (scroll row) wired into the `AppShell` category nav and the
`MarketingHome` hero region. **No placeholders** — reuse the real SVGs.

---

## Asset Reuse Plan (Goal 9)

Copy the reusable reference-clone assets into `packages/web/public/**` (create dirs as needed):

| Source (`ai-website-cloner-template/public`) | Destination (`packages/web/public`) | Notes |
| --- | --- | --- |
| `images/hero/home-gradient.jpg`, `hero/poster-us.webp` | `images/hero/` | Hero background/poster; scrim + `Motif` over it |
| `videos/hero.webm` | `videos/` | Optional hero video (poster fallback) |
| `images/categories/*.svg` | `images/categories/` | Category browser (Goal 8) |
| `images/features/section-1..3.webp` | `images/features/` | Editorial "How It Works" rows |
| `images/blog/*.{jpg,gif}` | `images/blog/` | Already referenced by `fa.json` `home.recommended`/`home.appPromo` |
| `images/app/customer-app-en.webp`, `app/biz-app-en.webp` | `images/app/` | App-promo illustrations — **caveat:** these depict the boosky app in English; use as decorative device shots with Persian `alt`, or swap for Persian captures later (not a placeholder, a known follow-up) |
| `seo/favicon.ico`, `apple-touch-icon*.png` | `seo/` (or public root, matching `index.html`) | Favicons / touch icons |

All content images run through `Picture` (AVIF/WebP + `srcset` + explicit `width`/`height`), carry
Persian `alt`, and lazy-load below the fold. Decorative images use `alt=""`.

---

## Component Adaptation Inventory

All components already consume tokens, so re-skin is largely automatic. **No component API (props)
changes.** The table lists composition/behavior work.

### `components/ui`

| Component | Adaptation |
| --- | --- |
| `Button` | Primary = deep-teal fill + white text; ghost/outline understated black-on-white; all states preserved |
| `Card` | Cleaner surface, `--radius-lg`, low neutral shadow; photography-forward variant for `SalonCard` |
| `Badge` | Rating-overlay style (star + Persian numeral); status-as-text-on-tint |
| `SalonCard` | Photography-forward: large hero image, rating badge overlay, compact hierarchy (name → rating → location → starting price Rial/Persian numerals) |
| `ServiceCardList` | Category-grouped list; per-service "Book" pinned to logical `end` |
| `SlotGrid` | available/selected/held/full/past distinguishable by fill + label + icon (not color alone); selected chip teal |
| `BookingStepper` | Visible progress (۱ خدمت · ۲ تاریخ · ۳ زمان · ۴ تایید); current step teal, completed secondary-teal check |
| `FilterBar` | Sticky/collapsible filter + sort chips |
| `Rating` / `RatingStars` | Amber stars (universal, not mirrored); Persian-numeral review count |
| `ParallaxHero` | Hero = photography + scrim (no gradient), optional `Motif` band |
| `JalaliDatePicker` / `JalaliDate` / `MobileDatePicker` | Bottom-sheet on mobile; Persian month/weekday labels + digits |
| `Picture` | AVIF/WebP + `srcset` + explicit `width`/`height`; `fetchpriority` for LCP |
| `SalonPlaceholder` | Branded fallback using the آرا `Motif` + tokens (never a gray box) |
| `Num` / `Money` / `DirText` | Persian numerals, Rial/Toman formatting, bidi isolation |
| `ScrollReveal` / `StaggerContainer` / `Celebration` / `Motion` / `BookingFlowTransition` | Reused; token-driven durations/easing |
| `Skeleton` / `EmptyState` / `ErrorState` | Every data surface uses skeleton (not spinner); Persian empty/error copy + retry |
| `Dialog` / `Sheet` / `Tabs` / `Tooltip` / `Toast` / `field`/`TextField`/`Textarea`/`Select`/`Checkbox`/`RadioGroup`/`Switch` | Reused; focus trap, labels, `aria-invalid`/`aria-describedby` |
| `three/*` (`Salon3D*`) | Out of scope for the clean boosky look; excluded from distinctiveness scan; not added to public bundles |

### `components/layout`, `sections`, `brand`, `theme`, `seo`

| Component | Adaptation |
| --- | --- |
| `AppShell` | Understated chrome (minimal header/nav, single `<main>`, skip link, footer, `Motif` `mark` beside آرا wordmark); **tokenize the raw `bg-[#f5f5f6]` literal** |
| `FunnelShell` | No chrome during funnel; sticky bottom CTA on mobile |
| `OwnerShell` / `OwnerBottomTabs` / `AdminShell` | Calendar-centric owner nav; sidebar desktop, bottom tabs mobile |
| `EditorialSplit` / `FeatureMosaic` / `SectionRhythm` | Avoid "single row of equal cards"; vary section rhythm |
| `Motif` | Re-themed to آرا adornment device (Goal 11); token-driven, re-tints per theme + tenant |
| `MetricsSection` / `OwnerBenefitsSection` | Social-proof metrics as large Persian numerals |
| `HeaderAuthNav` | Minimal auth affordance |
| `ThemeProvider` / `ThemeToggle` / `OwnerThemeToggle` | Reused; toggle causes no reload and no layout shift |
| `TenantTheme` / `FunnelTenantTheme` / `tenantTokens.deriveTenantTokens` | Reused unchanged; on-accent foreground AA via `styles/contrast` |
| `SeoHead` / `JsonLd` / `seo/config.ts` | Reused; `SITE_NAME` → آرا; noindex-by-default preserved |

---

## Per-Surface Composition (mapped to the 13 tasks)

- **Global chrome (Task 2):** `AppShell` header/nav/footer with آرا wordmark + `Motif`; understated
  boosky chrome; skip link; single-h1; `FunnelShell` no-chrome + sticky mobile CTA;
  `OwnerShell`/bottom tabs; `ThemeToggle` no reload / no layout shift.
- **Category icons (Task 3):** reference-clone SVGs → app taxonomy; horizontal browser;
  token-driven, RTL, Persian a11y labels.
- **MarketingHome `/` (Task 4):** search-first hero over photography + scrim + `Motif`; category
  browser; photography-forward `SalonCard` grid + stagger; editorial How-It-Works; `MetricsSection`
  Persian numerals; `SectionRhythm`; `WebSite` + `Organization` JSON-LD (آرا); indexable.
- **`/business` (+ `/business/register`) (Task 5):** Persian display hero + value prop + CTA
  (indexable); card onboarding wizard with visible labels + inline Persian errors; register
  `noindex`.
- **`/s/:slug` salon profile (Task 6):** hero gallery; display name; location/rating; teal Book Now
  → funnel; `ServiceCardList` grouped + per-service Book; description / Iranian-week hours / lazy
  map / staff gallery; tenant accent AA via runtime vars; JSON-LD
  `BeautySalon`/`Service`(IRR)/`BreadcrumbList`/`OpeningHoursSpecification`; indexable.
- **Discovery `/city/:city` + `/services/:type` (Task 7):** `SalonCard` grid 3/2/1 no overflow;
  sticky `FilterBar`; skeleton; Persian empty state; `BreadcrumbList`; indexable.
- **Legal + trust (Task 8):** `/about`, `/contact`, `/privacy`, `/terms` — ~70ch columns; آرا
  brand; indexable + in sitemap.
- **Auth `/auth` + QR `/qr/:payload` (Task 9):** phone + 6-digit OTP, visible labels, resend timer,
  inline Persian errors; phone/OTP LTR-isolated + normalized on submit; Persian display digits; QR
  intro + CTA into funnel; both `noindex`.
- **Booking funnel (Task 10):** `/salon/:salonId/book`, `/book/confirm`, `/booking/success` —
  `BookingStepper` + back-state retention; service cards w/ select animation; `JalaliDatePicker` +
  `SlotGrid` (unavailable distinguishable without color, selected → teal, bottom-sheet mobile);
  confirm summary card; success `Celebration`; `FunnelShell` + sticky mobile CTA; keyboard RTL;
  `noindex`.
- **Owner/admin `/owner/*` (Task 11):** Calendar day/week grid + color-coded blocks + animated
  view-switch + RTL arrow nav; Analytics minimal-chrome teal charts + Rial/Persian metrics, lazy
  chart lib; Configuration card sections + inline edit; sidebar desktop / bottom tabs mobile;
  skeleton/empty/error+retry; `noindex` + code-split off public/funnel.
- **Responsive/RTL/theme QA (Task 12)** and **final asset/parity audit (Task 13)** as described in
  the task plan.

---

## Motion Approach

- **Reuse** the existing Framer-Motion layer (`ScrollReveal`, `StaggerContainer`, `ParallaxHero`,
  `Celebration`, `Motion`, `PageTransition`, `BookingFlowTransition`) — no new motion framework.
- **Token-driven only:** durations/easing from `--dur-*` / `--ease-*`; no raw ms/easing literals
  (enforced by `motion.property.test.ts` + the distinctiveness scan).
- **Compositor-friendly only:** animate `transform`/`opacity`, never `width`/`height`/`top`/`left`
  (protects CLS).
- **Restraint:** boosky's clean feel = purposeful transitions only (reveal-on-scroll,
  press/selection feedback, step transitions, the single success celebration). No decorative loops.
- **`prefers-reduced-motion: reduce`:** drop transforms/parallax/particles, keep opacity crossfades,
  never block action completion (already honored globally in `tokens.css`).
- **Emphasized easing** reserved for the booking-success `Celebration` (Goal — funnel success).

---

## SEO & Structured Data

- **Brand:** `seo/config.ts` `SITE_NAME` → آرا drives the title template «{صفحه} | آرا» and
  `og:site_name`; JSON-LD `Organization`/`WebSite` `name` → آرا (Goal 10). `og:locale=fa_IR`,
  `inLanguage=fa-IR`, single-locale `hreflang` (`fa` / `fa-IR` + `x-default`).
- **Index/noindex split (Goal 12; verified in `App.tsx`, enforced by `SeoHead` noindex-default):**
  - **Indexable:** `/` (`WebSite`+`Organization`), `/s/:slug`
    (`BeautySalon`/`HairSalon` NAP, `Service` list in **IRR**, `BreadcrumbList`,
    `OpeningHoursSpecification` on the **Iranian week**), `/city/:city` + `/services/:type`
    (`BreadcrumbList`), `/business`, and legal (`/about`, `/contact`, `/privacy`, `/terms`).
  - **noindex, out of sitemap:** `/auth`, `/qr/:payload`, `/salon/:salonId/book`, `/book/confirm`,
    `/booking/success`, `/business/register`, `/owner/*`.
- **Sitemap** lists only indexable URLs; a `noindex` route never appears; every canonical points to
  a 200 indexable URL.
- **CWV:** prerender/SSR the public hero; preload the LCP image + above-the-fold Vazirmatn weight;
  `fetchpriority="high"` on the hero; keep the owner/funnel bundles off public pages
  (route-level code splitting already in `App.tsx`).

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of
the system — a formal statement about what the system should do. These 16 properties are carried
over from the boosky-derived redesign and re-anchored to آرا's numbered Goals. Because this feature
is a re-skin + re-composition, the properties target the pure, universally-quantifiable slices
(contrast math, color/number formatting, calendar conversion, token parity, source scanning,
routing policy); visual composition and CWV/bundle budgets are validated by example-based render
tests and Lighthouse/build gates in the Testing Strategy, not as properties.*

Each property test is tagged `Feature: ara-redesign, Property {n}: {property text}`.

### Property 1: Every shipped color pairing clears WCAG AA (both themes)

*For any* theme in {light, dark} and *for any* foreground/background pairing the UI composes, the
WCAG contrast ratio is ≥ 4.5:1 for text pairings and ≥ 3:1 for large-text/non-text pairings (focus
ring, secondary decorative fills).

**Validates: Goals 4, 7**

### Property 2: The three token sources are byte-identical

*For any* semantic color role, the value in `tokens.css` equals the value in `@salon/shared`
(`lightColors`/`darkColors`) for the same theme, and both match the `ui-ux-skills.md` governing
table.

**Validates: Goals 5, 7**

### Property 3: Authored source contains no generic/raw-literal regressions

*For any* authored source line (`src/**/*.{ts,tsx,css}`, minus the scoped exemptions), the
distinctiveness scan reports a violation *if and only if* the line contains a forbidden pattern
(indigo→purple gradient, physical left/right for flow spacing, raw hex/px/ms in a style context, or
a Component_Library element with an inline color/style literal).

**Validates: Goals 13, 7**

### Property 4: The display/body type pairing invariant holds

*For any* valid token set, display font-weight is strictly greater than body font-weight AND display
line-height is strictly less than body line-height, so headings never render visually uniform with
body copy.

**Validates: Goals 5, 7**

### Property 5: Route robots/sitemap policy is consistent

*For any* route in the application route table, an indexable route emits `index` with a unique
title, meta description, and canonical URL and appears in `sitemap.xml`, while a
transactional/authenticated route (booking funnel, owner, `/auth`, `/qr/:payload`,
`/business/register`) emits `noindex` and is absent from `sitemap.xml`; every URL in `sitemap.xml`
is an indexable route.

**Validates: Goal 12**

### Property 6: Status is never conveyed by color alone

*For any* status-bearing surface (badge, slot chip in any of available/selected/held/full/past,
toast), the rendered output carries a non-color distinguisher — a text label and/or an icon and/or
an ARIA state — in addition to its color.

**Validates: Goal 14**

### Property 7: Cards render all required fields with localized values

*For any* generated salon record, the rendered `SalonCard` contains the salon name, rating,
location, and starting price; and *for any* generated service, the rendered service card contains
name, duration, and price — with every monetary/count value in Persian numerals.

**Validates: Goals 8, 15**

### Property 8: Number and currency formatting is localized

*For any* non-negative amount, the money formatter output contains only Persian digits, applies
thousands grouping, and includes the currency label; and *for any* numeric display value, the number
formatter output contains only Persian digits.

**Validates: Goal 15**

### Property 9: Jalali date conversion round-trips

*For any* valid calendar date, converting ISO → Jalali → ISO yields the original date (and the
Jalali representation uses Persian month/weekday labels and Persian digits for display).

**Validates: Goal 15**

### Property 10: Icon mirroring matches directionality class

*For any* icon, it is mirrored under RTL *if and only if* it belongs to the directional set
(chevrons, arrows, progress carets, breadcrumb separators); universal icons (search, clock,
checkmark, phone, camera/QR, logos, media play) are never mirrored.

**Validates: Goals 8, 13**

### Property 11: Tenant accent always yields an AA-legible foreground

*For any* accent fill color, the derived on-accent foreground/fill pair produced by
`deriveTenantTokens` (`onAccentForeground` / `ensureAaFill`) clears WCAG AA — ≥ 4.5:1 for body text
and ≥ 3:1 for large/non-text — on the scoped storefront wrapper.

**Validates: Goal 16**

### Property 12: Every page has exactly one h1 and the required landmarks

*For any* rendered page (public, customer, or owner), the document contains exactly one `<h1>`,
headings in non-skipping order, and the `header`, `nav`, `main`, and `footer` landmarks.

**Validates: Goal 17**

### Property 13: Images declare intrinsic dimensions to prevent layout shift

*For any* rendered content image, the output declares explicit `width` and `height` (or an
`aspect-ratio`) and emits modern-format (`AVIF`/`WebP`) sources with a fallback.

**Validates: Goals 9, 18**

### Property 14: Missing salon imagery yields the branded placeholder

*For any* salon lacking imagery, the render produces the branded `SalonPlaceholder` (آرا `Motif` +
tokens) rather than a generic gray box or a broken image.

**Validates: Goal 18**

### Property 15: The booking funnel preserves step state on back navigation

*For any* partially completed booking state, navigating backward and then forward through the
`BookingStepper` returns the funnel to the same entered state (selected service, date, time).

**Validates: Goal 19**

### Property 16: Form fields signal errors accessibly

*For any* form field in an error state, the field sets `aria-invalid` and is tied to its inline
error message (text + icon) via `aria-describedby`.

**Validates: Goal 19**

---

## Testing Strategy

### Dual approach

- **Property tests** (fast-check, ≥ 100 iterations each) validate the universal properties above.
  Each carries the tag `Feature: ara-redesign, Property {n}: {property text}` and references its
  design property.
- **Example / render tests** (Vitest + Testing Library + `vitest-axe`) validate composition,
  presence, states (skeleton / empty / error+retry / populated), theme toggling, SEO head tags,
  JSON-LD validity, focus management, and reduced-motion behavior.
- **Integration / build gates** (Lighthouse CI, bundle-size + chunk-graph checks, prerender HTML
  checks) validate CWV, the ≤ ~150KB public JS budget, code-split isolation, prerendered content,
  and PWA offline behavior — the criteria classified INTEGRATION rather than as properties.

### Property → test home

| Property | Test home | Kind |
| --- | --- | --- |
| 1 Contrast (both themes) | `styles/contrast.test.ts` | Existing gate, expected values re-confirmed |
| 2 Token parity | `styles/tokens-complete.test.ts` (+ parity assertions) | Property over role set |
| 3 Distinctiveness scan | `styles/distinctiveness.test.ts` | Existing property gate |
| 4 Display/body invariant | `styles/tokens-complete.test.ts` | Existing invariant |
| 5 Robots/sitemap policy | `components/seo` route-policy test | Property over route table |
| 6 Non-color status | `SlotGrid` / `Badge` / `Toast` tests | Property over states |
| 7 Card content | `SalonCard` / `ServiceCardList` tests | Property over generated records |
| 8 Number/currency | `Num` / `Money` tests | Property over amounts |
| 9 Jalali round-trip | Jalali util test | Round-trip property |
| 10 Icon mirroring | icon-direction util test | Classification property |
| 11 Tenant-accent AA | `theme/tenantTokens` test | Property over arbitrary fills |
| 12 Page structure | per-page render + axe | Property over route table |
| 13 Image dimensions | `Picture` test | Render property |
| 14 Branded placeholder | `SalonPlaceholder` render | Property over no-image input |
| 15 Funnel state | booking-flow test | Round-trip over partial states |
| 16 Form-error wiring | `field` / form tests | Render property |

### Configuration and honesty note

- Property tests run a minimum of 100 iterations (fast-check default or explicit `numRuns`).
- The serializer/parser slices here are the Jalali↔ISO converter and the number formatters — each
  gets a round-trip property (Properties 8, 9).
- `contrast.test.ts`, `distinctiveness.test.ts`, and `tokens-complete.test.ts` are the regression
  tripwire: since the shipped values already pass, they stay green as long as any tuning respects
  the tuning boundaries and is mirrored across all three sources.
- **Automated checks are necessary but not sufficient.** Full WCAG 2.2 AA conformance requires
  manual testing with assistive technologies (VoiceOver/iOS, TalkBack/Android, NVDA — all in
  RTL/Farsi), keyboard-only walkthroughs, and expert accessibility review. Every automated pass is
  a floor, not a certificate (Goal 20).
