# Design Document — UI/UX Redesign

## Overview

This document specifies how we turn an unstyled, functionally-wired frontend into a modern, elegant, accessible, RTL-first product for the Iranian salon-booking market. It covers the styling/tooling stack, the visual identity, the token architecture and theming, the component library, the app shell and navigation, a page-by-page redesign intent for every screen, the SEO architecture for new public surfaces, performance and PWA strategy, and the testing approach.

The design is bound by two governing standards, which are authoritative wherever this document is silent or in tension:

- `.kiro/steering/ui-ux-skills.md` — design tokens, components, RTL/i18n, accessibility, and the per-screen QA checklist. **All token values in this document are taken verbatim from this file.**
- `.kiro/steering/seo-skills.md` — route indexability, metadata, structured data, rendering strategy, Core Web Vitals, and local SEO.

The current state, confirmed in code: `packages/web` imports no stylesheet anywhere (`main.tsx` imports only `./i18n`), `src/components/` is empty, every page is bare semantic HTML with `data-testid`s, `App.tsx` wraps routes in a single `<div dir="rtl" lang="fa">` with `BrowserRouter`, the PWA ships a minimal `public/manifest.json` and a hand-written `public/sw.js` (registered in `main.tsx`), and Rial is rendered ad hoc with `priceRial.toLocaleString('fa-IR')`. The mobile app uses default React Native primitives.

### What We Are NOT Changing (scope guard)

To keep the blast radius contained and the existing test suites meaningful:

- **No backend changes.** Nothing in `packages/backend` (the `Scheduling_Engine`, services, Prisma schema, migrations, exclusion constraints) is touched.
- **No API contract changes.** `packages/web/src/api/client.ts` request/response shapes stay as-is. Presentation code may *adapt* responses for display (formatting, grouping) but must not alter the wire contract.
- **No new product flows** beyond the public marketing/profile/discovery surfaces required for SEO. The booking funnel, auth, and admin features keep their current behavior; only their presentation changes.
- **Document contract preserved.** `dir="rtl"` and `lang="fa"` remain on the document and app shell; the PWA manifest keeps its required fields. (The existing smoke tests assert these — see Testing Strategy.)

## Front-End Styling & Tooling Stack

### Recommended stack

| Concern | Choice | Rationale | Trade-offs / alternatives |
| --- | --- | --- | --- |
| Styling engine | **Tailwind CSS v3** with a custom token theme | Utility-first speed, tiny production CSS via purge, first-class **logical-property** utilities (`ms/me`, `ps/pe`, `start/end`, `border-s/e`, `text-start/end`) that flip automatically under `dir="rtl"`. Maps cleanly onto the steering tokens. | Alternative: CSS Modules / vanilla-extract / Panda CSS. Tailwind wins on velocity and on the RTL logical utilities already needed. Additive dep. |
| RTL handling | Tailwind logical utilities + `dir="rtl"`; optional `tailwindcss-logical` for any gap | Logical properties are the steering mandate (§11 ui-ux). No physical `left/right`. | `tailwindcss-rtl` (explicit `rtl:`/`ltr:` variants) as a fallback for one-off mirroring. |
| Headless primitives | **Radix UI** (Dialog, Tabs, Select, Popover, Tooltip, Switch, Checkbox, Radio, Toast) | Accessible-by-default focus trap, ARIA, keyboard, and dismissal semantics — exactly the R2 requirements. Unstyled, so our tokens drive the look. | Alternative: Headless UI / Ark UI. Radix has the broadest primitive set and strongest a11y track record. Additive dep. |
| Persian font | **Vazirmatn** (variable woff2), self-hosted | Covers Persian glyphs, Persian digits, and Latin; the steering-mandated face. Self-hosting + `font-display: swap` + preload avoids FOIT on OTP/booking. | Alternatives: Estedad, Sahel. Stay on Vazirmatn for consistency with steering. |
| Icons | **lucide-react** | Clean, consistent 1.5px stroke set; tree-shakeable; easy to mirror directional icons in RTL. | Alternative: Phosphor. Either works; lucide is light and well-maintained. Additive dep. |
| Animation | **Framer Motion**, reduced-motion aware | Declarative, interruptible transitions for sheets/dialogs/step transitions; honors `prefers-reduced-motion`. | Alternative: CSS transitions only. Keep Motion for the funnel's success moment; never block actions on animation. Additive dep. |
| Head / SEO | **react-helmet-async** | SSR/prerender-safe `<head>` management; the steering-mandated approach for per-route meta + JSON-LD. | Alternative: a custom head manager. helmet-async is the documented choice. Additive dep. |
| Public-route rendering | **Vite prerender step** (SSG) for public routes; app stays SPA | Delivers content + meta + JSON-LD in initial HTML for crawlers while keeping the authed app client-rendered (the whole SEO strategy, §8 seo). | Alternative: React Router v7 framework-mode SSR for fresher profiles (more infra). See Rendering Strategy. Additive dep/build step. |
| a11y testing | **axe-core** via `vitest-axe`/`jest-axe` | Automated WCAG checks in the component/page tests (R10.4). | Manual AT testing still required (honesty note). Additive dev dep. |

All of the above are **additive dependencies** layered onto the existing React 18 + Vite + TypeScript + `react-i18next` + `vite-plugin-pwa` setup. Nothing in the current runtime is removed; `react-router-dom` v7 stays in library mode (`BrowserRouter`) for the app, with prerendering applied to the public routes only.

### Configuration intent

- `tailwind.config.js`: `darkMode: ['class', '[data-theme="dark"]']` to match the steering theming hook; `content` globs over `src/**/*.{ts,tsx}`; `theme.extend` maps colors/spacing/radius/fontSize/zIndex/boxShadow/transitionTimingFunction to the CSS variables defined below.
- A single global stylesheet (imported once in `main.tsx`) defines the `@tailwind base/components/utilities` layers plus the `:root` and `[data-theme="dark"]` token blocks and the `@font-face` for Vazirmatn.

## Design Language & Visual Identity

**Brand mood:** modern, calm, and premium — an elegant beauty-tech feel that is confident but never loud. The funnel should feel effortless and trustworthy (it handles money); the admin should feel like a capable, quiet tool.

- **Color story:** an **indigo** core (the existing brand `#6366f1`, refined to `#5457e6` for text-bearing surfaces so it clears AA), a **teal** secondary for calm secondary actions, and a **magenta/orchid** accent reserved for highlights and badges. Generous neutrals carry most surfaces; color is used to direct attention, not to decorate.
- **Typography:** Vazirmatn throughout, with a taller Persian line height and a restrained type scale. Headings are weight-driven, not size-shouty.
- **Shape & depth:** soft radii (`10–16px`), low-contrast elevation in light mode and border-led elevation in dark mode (heavy shadows read poorly on dark).
- **Iconography:** lucide line icons at 20/24px; directional icons mirror in RTL, universal icons (clock, check, phone, camera/QR, search) do not.
- **Imagery:** editorial salon photography in warm tones, real people and real work; always with `width`/`height` (or `aspect-ratio`) and meaningful Persian `alt`; scrim behind any text-on-image so contrast holds.

### Palette (verbatim from `ui-ux-skills.md`)

Primary shade guidance: use `#5457e6` (or darker) for **text-bearing** buttons to clear WCAG AA at body sizes; reserve the original `#6366f1` for large fills/decoration only.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--color-bg` | `#ffffff` | `#0b0f1a` | Page background |
| `--color-surface` | `#f7f8fa` | `#121826` | Cards, sheets |
| `--color-elevated` | `#ffffff` | `#1b2233` | Menus, dialogs, popovers |
| `--color-text` | `#16181d` | `#eef1f6` | Primary text |
| `--color-text-muted` | `#5b6472` | `#9aa4b2` | Secondary/help text |
| `--color-border` | `#e3e6eb` | `#2a3344` | Dividers, input borders |
| `--color-primary` | `#5457e6` | `#818cf8` | Brand actions, CTAs |
| `--color-primary-contrast` | `#ffffff` | `#0b0f1a` | Text/icon on primary |
| `--color-secondary` | `#0ea5a4` | `#2dd4bf` | Secondary actions |
| `--color-accent` | `#d946ef` | `#e879f9` | Highlights, badges |
| `--color-success` | `#15803d` | `#4ade80` | Booked, paid, confirmed |
| `--color-warning` | `#b45309` | `#fbbf24` | Expiring OTP, low slots |
| `--color-danger` | `#b91c1c` | `#f87171` | Failed pay, cancel, errors |
| `--color-info` | `#1d4ed8` | `#60a5fa` | Neutral notices |
| `--color-focus-ring` | `#5457e6` | `#a5b4fc` | Focus outline |

### Typography scale (rem, base 16px — verbatim)

| Token | Size | Line height | Use |
| --- | --- | --- | --- |
| `--font-2xs` | 0.75 | 1.7 | Captions, legal |
| `--font-xs` | 0.875 | 1.7 | Helper text |
| `--font-sm` | 1.0 | 1.75 | Body (Farsi default) |
| `--font-md` | 1.125 | 1.7 | Lead paragraph |
| `--font-lg` | 1.375 | 1.45 | Section title (h2) |
| `--font-xl` | 1.75 | 1.35 | Page title (h1) |
| `--font-2xl` | 2.25 | 1.25 | Marketing hero |

Font stack: `font-family: 'Vazirmatn', system-ui, 'Segoe UI', Tahoma, sans-serif;`. Reading measure capped at `max-inline-size: 70ch`. Tabular numerals (`font-feature-settings`) for aligned price/time columns in admin tables.

### Spacing, radius, elevation, z-index, motion (verbatim)

- **Spacing (8pt grid):** `--space-0:0; --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:24px; --space-6:32px; --space-8:48px; --space-10:64px`. Multiples of 8 (4 only for tight icon/text gaps).
- **Radius:** `--radius-sm:6px; --radius-md:10px; --radius-lg:16px; --radius-pill:999px`.
- **Elevation:** `--shadow-1` (cards), `--shadow-2` (menus), `--shadow-3` (dialogs); dark mode prefers border + subtle shadow.
- **Z-index ladder:** `--z-base:0; --z-sticky:100; --z-nav:200; --z-overlay:1000; --z-dialog:1100; --z-toast:1200`.
- **Motion:** `--dur-fast:150ms; --dur-base:200ms; --dur-slow:300ms; --ease-standard:cubic-bezier(0.2,0,0,1); --ease-emphasized:cubic-bezier(0.2,0,0,1.2)`.

## Token Architecture & Theming

**Source of truth:** CSS custom properties declared once on `:root` (light) and overridden under `[data-theme="dark"]`. Components consume **only** tokens (via Tailwind classes that resolve to the variables, or `var(--token)` directly) — never raw hex/px/ms.

```css
:root {
  --color-bg:#ffffff; --color-surface:#f7f8fa; --color-elevated:#ffffff;
  --color-text:#16181d; --color-text-muted:#5b6472; --color-border:#e3e6eb;
  --color-primary:#5457e6; --color-primary-contrast:#ffffff;
  --color-secondary:#0ea5a4; --color-accent:#d946ef;
  --color-success:#15803d; --color-warning:#b45309; --color-danger:#b91c1c; --color-info:#1d4ed8;
  --color-focus-ring:#5457e6;
  /* type, space, radius, shadow, z, motion tokens as tabulated above */
}
[data-theme="dark"] {
  --color-bg:#0b0f1a; --color-surface:#121826; --color-elevated:#1b2233;
  --color-text:#eef1f6; --color-text-muted:#9aa4b2; --color-border:#2a3344;
  --color-primary:#818cf8; --color-primary-contrast:#0b0f1a;
  --color-secondary:#2dd4bf; --color-accent:#e879f9;
  --color-success:#4ade80; --color-warning:#fbbf24; --color-danger:#f87171; --color-info:#60a5fa;
  --color-focus-ring:#a5b4fc;
}
```

**Tailwind mapping (intent):**

```js
theme: {
  extend: {
    colors: {
      bg:'var(--color-bg)', surface:'var(--color-surface)', elevated:'var(--color-elevated)',
      text:'var(--color-text)', muted:'var(--color-text-muted)', border:'var(--color-border)',
      primary:{ DEFAULT:'var(--color-primary)', contrast:'var(--color-primary-contrast)' },
      secondary:'var(--color-secondary)', accent:'var(--color-accent)',
      success:'var(--color-success)', warning:'var(--color-warning)',
      danger:'var(--color-danger)', info:'var(--color-info)',
    },
    borderRadius:{ sm:'var(--radius-sm)', md:'var(--radius-md)', lg:'var(--radius-lg)', pill:'var(--radius-pill)' },
    zIndex:{ sticky:'100', nav:'200', overlay:'1000', dialog:'1100', toast:'1200' },
    // fontSize, spacing, boxShadow, transitionTimingFunction mapped to the same vars
  }
}
```

**Theming behavior (R1.8, R3.3, R3.4):**

- A `ThemeProvider` resolves the active theme in this order: stored user choice (`localStorage`) → OS `prefers-color-scheme` → light default. It sets `data-theme` on `<html>` and keeps `<meta name="theme-color">` in sync per theme (light vs dark chrome).
- A header **theme toggle** flips and persists the choice; switching updates all token-driven styling with no reload and no layout shift.
- RTL is the default: `dir="rtl"` + `lang="fa"` stay on the document; all spacing/positioning uses logical properties so the same classes are correct in both directions.

**React Native parity (R6.1):** the same token *values* are exported as a typed TS theme object (a small `tokens.ts` shared shape) consumed by an RN `ThemeProvider`, so color/space/radius/type are identical across web and mobile. (Pure values only; no web CSS leaks into RN.)

## Component Inventory & States

All interactive components implement the six interaction states; all data surfaces implement the data states (R2.2, R2.3, ui-ux §6). Built on Radix where a primitive exists; styled purely with tokens.

| Component | Built on | Required states / notes |
| --- | --- | --- |
| Button / IconButton | native `<button>` | default, hover, focus-visible, active, disabled, **loading** (spinner + `aria-busy`); variants: primary, secondary, ghost, danger; min target 44×44 |
| TextField / Textarea | native + label | visible label, helper, error (text+icon, `aria-describedby`, `aria-invalid`); `inputMode`/`autoComplete`/`dir` per field |
| Select | Radix Select | keyboard + type-ahead, RTL-correct, options list with empty state |
| Checkbox / Radio / Switch | Radix | focus-visible, disabled, indeterminate (checkbox) |
| Dialog / Modal | Radix Dialog | focus trap, Esc + overlay close, focus restore, `role=dialog` + `aria-modal`, labelled |
| Sheet / Drawer | Radix Dialog | bottom sheet on mobile (slot/date pickers); safe-area aware |
| Tabs | Radix Tabs | arrow-key nav (RTL-aware), used for calendar day/week toggle |
| Card | — | content container; loading skeleton variant |
| Badge / Chip | — | status badge (color **+ icon + text**); slot chip with states: available, selected, held/pending, full, past |
| Toast | Radix Toast | live region announce; success/info/error; optional undo action («بازگردانی») |
| Skeleton | — | layout-matched placeholders (not a centered spinner) |
| Spinner | — | short in-button waits only |
| Empty-State | — | icon + explanation + next-step action |
| Error-State | — | cause + **retry**; never a raw stack/HTTP code |
| Avatar | — | image with initials fallback; decorative vs labelled |
| Tooltip | Radix Tooltip | keyboard-focus reachable; not the only source of critical info |
| JalaliDatePicker | Radix Popover + custom grid | Persian months/weekdays, Persian digits, Iranian week (Saturday first); converts to ISO at the API boundary only |
| TimePicker / SlotGrid | — | slot chips with the five slot states; keyboard grid nav (arrow keys swap meaning in RTL) |

Cross-cutting: a `<Money>` formatter (Rial, Persian digits, grouping), a `<JalaliDate>` formatter, a `<Num>` digit-localizer, and a `<DirText>`/`<bdi>` helper for bidi-isolating mixed Latin/Persian/number runs.

## App Shell, Navigation & Layout

### Shells

1. **Public shell** (marketing/profile/discovery/legal): semantic `header > nav` with brand wordmark, primary links, language indicator and theme toggle; `main`; `footer` with NAP/legal links. Crawlable, prerendered.
2. **Customer funnel shell**: minimal top bar (salon name + back affordance), a **stepper** progress indicator (۱ خدمت · ۲ تاریخ · ۳ زمان · ۴ تایید), centered content card (max ≈ 480px), and a **sticky bottom CTA bar** in the thumb zone, clearing `env(safe-area-inset-bottom)`.
3. **Admin shell**: side/top navigation on desktop (Configuration / Calendar / Analytics) with breadcrumbs; a **bottom tab bar** on mobile (تقویم · آمار · تنظیمات). Distinct from the customer flow per R3.6.

All shells: skip-to-content link, single `<main>`, correct landmarks, theme toggle, RTL logical layout, route-loading indicator that reserves layout (no CLS).

### Responsive breakpoints & grids (verbatim from ui-ux §5)

- Breakpoints: `sm 480 / md 768 / lg 1024 / xl 1280`. Mobile-first (QR traffic dominates the funnel).
- Container max ≈ **1200px**; reading column ≈ **70ch**; booking funnel card max ≈ **480px** centered.
- Admin calendar/analytics are the desktop-rich screens; everything must still degrade to a usable single column at 360px with no horizontal scroll.

### Routing & code splitting

`BrowserRouter` stays. Routes are lazy-loaded with `React.lazy` + `Suspense` so `/admin/*`, the Jalali picker, and any chart library never load on the customer funnel or public pages (R9.3, seo §9 budget). Public routes are additionally prerendered (below).

## Page-by-Page Redesign Intent

Wireframe-level intent; every screen must pass the per-screen QA checklist (ui-ux §14) and carry all relevant states. All copy comes from the `react-i18next` `fa.json` catalog (grouped `auth.* / booking.* / salon.* / admin.* / common.*`) — no hard-coded Farsi in JSX; new keys are added rather than inlined.

### Customer — Auth (`AuthPage.tsx`) — R4.1, R4.2, R7.6

Centered card on a calm background. **Step 1 (phone):** visible label «شماره موبایل», `type=tel` `inputMode=tel` `dir=ltr` `autoComplete=tel`, pattern `^09\d{9}$` (normalize pasted `+98`/Persian digits before validation), primary CTA «دریافت کد» with in-button loading; failure shows an inline error (text + icon) without clearing the field; a toast «کد ارسال شد» confirms send. **Step 2 (OTP):** six single-digit boxes (grouped field) `inputMode=numeric` `autoComplete=one-time-code` `dir=ltr`, auto-advance, full-paste support, backspace-to-previous, and a **resend timer** («ارسال مجدد تا ۰:۴۵») in Persian digits that disables resend until it elapses. Errors via `role="alert"` (preserve the existing alert pattern). 

### Customer — QR Landing (`QrLandingPage.tsx`) — R4.3

While resolving: a **skeleton** of the salon header (not a bare "loading" line). On success: salon name/identity, a short reassurance line, and one prominent primary CTA «انتخاب خدمت» → funnel. Two **distinct** error states: malformed payload («کد QR نامعتبر است») vs unregistered salon («سالن یافت نشد»), each with a sensible next step. Note: this route stays `noindex` (per-visit payload).

### Customer — Availability (`AvailabilityPage.tsx`) — R4.4, R7.2, R7.8

The funnel core. Service selector (cards or Select) showing name, duration, and **Rial price** via `<Money>`. Date selection uses the **Jalali date picker** (bottom sheet on mobile) replacing the native `<input type="date">`; Persian month names and digits, Iranian week order. Slots render as a **chip grid**: skeleton chips while loading → empty card («این روز نوبت خالی ندارد، روز دیگری انتخاب کنید») → populated chips. Each chip carries the full interactive-state set and slot states (available/selected/held/full/past), distinguishable without color. Selecting a slot advances to confirm, preserving state on back.

### Customer — Booking Confirm (`BookingConfirmPage.tsx`) — R4.5

A summary card: service, **Jalali** date/time, and **Rial** price, plus any deposit notice. Sticky bottom CTA «تایید رزرو». States: idle → loading (in-button) → explicit **payment-redirect** state («در حال انتقال به درگاه پرداخت...») before `window.location` hands off to the gateway → error with retry. Never fake success; the server confirms money. Warn before abandoning a partially completed/paid booking.

### Customer — Booking Success (`BookingSuccessPage.tsx`) — R4.6

A confident success moment (the one place emphasized motion is allowed, reduced-motion aware): success icon + «رزرو شما با موفقیت ثبت شد», a what/when/where summary, and a clear next action («بازگشت»). Per-user receipt → `noindex`.

### Admin — Configuration (`admin/ConfigurationPage.tsx`) — R5.1

Sectioned layout (Staff / Chairs / Services / Holidays) with in-page anchor nav and breadcrumbs. Each section is a card with a scannable list and an inline add form (reusing TextField + Button), advanced options behind «تنظیمات پیشرفته». Services list shows name · duration · Rial price with tabular numerals. Page-level loading (skeleton sections), empty (per-section empty-state with a create CTA), and error (retry) states; destructive actions confirm and offer an undo toast.

### Admin — Calendar (`admin/CalendarPage.tsx`) — R5.2

Radix **Tabs** for day/week (preserve the existing `role=tab`/`aria-selected` semantics). Day view: vertical time rail with appointment blocks; week view: 7-column grid (Saturday-first, RTL). Appointment blocks show time (Jalali/Persian digits), service, customer, staff, and a status badge (color + icon + label). Loading = skeleton grid; empty = «نوبتی در این بازه نیست»; error = retry. Bottom tab bar on mobile.

### Admin — Analytics (`admin/AnalyticsPage.tsx`) — R5.3

KPI cards on top (utilization %, revenue in Rial, busiest window) then legible tables/charts. Charts are lazy-loaded and never block first paint; tables use tabular numerals and logical `end` alignment for numeric columns. Revenue formatted as Rial. Loading skeletons, empty, and error states throughout.

### Public — Marketing Home (`/`) — R8.1, R8.2, indexable

Hero with value proposition and primary CTA, sections explaining the platform, and trust/legal links in the footer. Prerendered with full `<head>` (title «رزرو آنلاین نوبت سالن‌های زیبایی | رزرو سالن», description, canonical, OG/Twitter) and `WebSite` + `Organization` JSON-LD. LCP-optimized hero (preloaded image + above-the-fold font weight, `fetchpriority="high"`). 

> Note: the current `/` route renders `AuthPage`. The redesign introduces a public marketing home at `/` and moves the login surface to `/auth` (already routed), keeping `/auth` `noindex`.

### Public — Salon Profile (`/s/:slug`) — R8.1, R8.3, R8.4, indexable

The primary search surface. Single `<h1>` (e.g. «سالن رز — آرایشگاه زنانه در تهران، ولنجک»), `article`/`section` blocks for services, hours (Iranian week), gallery (sized, lazy, Persian `alt`), and a lazy-loaded **Neshan/Balad** map embed. NAP block consistent with JSON-LD. Clear CTA → booking funnel. JSON-LD: `BeautySalon`/`HairSalon` + `Service` (per offering, `priceCurrency:"IRR"`) + `BreadcrumbList`. ASCII/transliterated slug (`/s/salon-rose`), self-referencing canonical.

(Optional discovery pages `/city/:city`, `/services/:type`, and legal `/about|/contact|/privacy|/terms` follow the same public-page recipe; see SEO Architecture.)

### Mobile — AuthScreen (`screens/AuthScreen.tsx`) — R6.2

Re-skin the existing phone/OTP flow with the RN theme: themed `TextInput`s, a primary button with loading, OTP boxes with resend timer, error text via the existing `auth-error` testID, Persian typography and digits, RTL layout. Logic (`AuthScreen.logic.ts`) is untouched.

### Mobile — QrScanScreen (`screens/QrScanScreen.tsx`) — R6.3

Themed scan frame and status surfaces for idle/scanning, resolving (activity indicator), resolved, and error — keeping the distinct malformed-vs-unregistered messaging and the existing testIDs (`qr-loading`/`qr-error`/`qr-success`). Camera abstraction (`onScan`) unchanged.

### Mobile — Availability/Booking screen — R6.4

Currently a stub (`AvailabilityScreen.ts` exports a constant). The redesign delivers the screen UI shell — service/date/slot selection and booking with loading/empty/error/success states — consistent with the web funnel, using the RN theme, a Jalali date picker, Persian digits, and RTL. (Booking logic continues to use the shared API client; no contract change.)

## SEO Architecture

### Indexability map (from `seo-skills.md`)

| Route | Index? | Handling |
| --- | --- | --- |
| `/` marketing home | **index** | Prerendered, full head + `WebSite`/`Organization` JSON-LD, in sitemap |
| `/s/:slug` salon profile | **index** | Prerendered/SSR, `BeautySalon`+`Service`+`BreadcrumbList`, in sitemap |
| `/city/:city`, `/services/:type` (optional) | **index** | Real differentiated content, in sitemap |
| `/about`, `/contact`, `/privacy`, `/terms` | **index** | Prerendered, in sitemap |
| `/auth`, `/` (old login) | **noindex** | `noindex,follow`, excluded from sitemap |
| `/qr/:payload` | **noindex** | Per-visit payload |
| `/salon/:salonId/book`, `/.../confirm` | **noindex** | Funnel steps |
| `/booking/success` | **noindex** | Per-user receipt |
| `/admin/*` | **noindex** | Private |

### Head / meta strategy

`HelmetProvider` wraps the app; a small **`<SeoHead>`** wrapper centralizes title template («{صفحه} | رزرو سالن», ≤ ~60 chars), unique meta description (~120–155 chars, natural Persian), absolute canonical (single host; tracking params stripped), robots directive, OG/Twitter tags (`og:locale=fa_IR`, `og:image` 1200×630 RTL-correct), and `hreflang` self-reference (`fa`, `fa-IR`) + `x-default` → home. A **`<JsonLd>`** component injects validated structured data. App/admin/auth routes render `<SeoHead noindex>` so private surfaces emit `noindex,follow`. The `<SeoHead>` default is **noindex** — pages must opt **in** to indexing, so a new private route can never leak by omission.

### JSON-LD entities (examples)

`WebSite` (home):

```json
{ "@context":"https://schema.org","@type":"WebSite","name":"رزرو سالن",
  "url":"https://example.ir","inLanguage":"fa-IR",
  "potentialAction":{"@type":"SearchAction","target":"https://example.ir/search?q={query}","query-input":"required name=query"} }
```

`BeautySalon` + `Service` + `BreadcrumbList` (`/s/:slug`):

```json
[
 { "@context":"https://schema.org","@type":"BeautySalon","name":"سالن رز",
   "image":"https://example.ir/og/salon-rose.jpg","telephone":"+98-21-1234-5678","priceRange":"$$",
   "address":{"@type":"PostalAddress","addressLocality":"تهران","addressRegion":"تهران","streetAddress":"ولنجک، خیابان نمونه، پلاک ۱۰","addressCountry":"IR"},
   "geo":{"@type":"GeoCoordinates","latitude":35.80,"longitude":51.40},
   "openingHoursSpecification":[{"@type":"OpeningHoursSpecification","dayOfWeek":["Saturday","Sunday","Monday","Tuesday","Wednesday"],"opens":"10:00","closes":"20:00"}],
   "url":"https://example.ir/s/salon-rose" },
 { "@context":"https://schema.org","@type":"Service","name":"کوتاهی مو","provider":{"@type":"BeautySalon","name":"سالن رز"},
   "offers":{"@type":"Offer","price":"2500000","priceCurrency":"IRR"} },
 { "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
   {"@type":"ListItem","position":1,"name":"خانه","item":"https://example.ir"},
   {"@type":"ListItem","position":2,"name":"تهران","item":"https://example.ir/city/tehran"},
   {"@type":"ListItem","position":3,"name":"سالن رز","item":"https://example.ir/s/salon-rose"} ] }
]
```

Mark up only **visible** content; never fabricate reviews/ratings (`AggregateRating`/`Review` only when real and on-page). Keep NAP identical across page, JSON-LD, and off-site listings. Validate with the Rich Results Test + Schema validator in CI.

### robots.txt & sitemap.xml

`public/robots.txt` (verbatim recipe from seo §7): allow `/`, disallow `/auth`, `/admin/`, `/salon/*/book`, `/booking/`, `/qr/`, `/api/`, and point to the sitemap. `sitemap.xml` lists **only** indexable URLs (home, salon profiles, discovery, legal) with `<lastmod>`, generated at build time from the salon list; never includes a `noindex` URL. A canonical always points to an indexable 200 URL.

### Rendering strategy (the crux) + honest SPA caveat

Per seo §8, the strategy is a split: **keep the authenticated app client-rendered (pure SPA)** and **prerender/SSR only the public routes**, injecting per-page `<head>` and JSON-LD into the initial HTML.

- **Recommended:** a **build-time prerender (SSG)** step for `/`, `/about|contact|privacy|terms`, and `/s/:slug` (enumerating salon slugs from the API/build data). Verify with **View Source** (not just DevTools) that content + meta + JSON-LD exist without running app JS.
- **Honest caveats:**
  - Prerendering needs a **build-time list of salon slugs**; new salons aren't indexable until a rebuild. Mitigate with scheduled rebuilds or incremental regeneration, or graduate `/s/:slug` to **SSR** (React Router v7 framework mode) when profiles change frequently — at the cost of running a Node server.
  - **Deep links require a server rewrite/host fallback** so public URLs return the right prerendered HTML, not the SPA 404.
  - **Client-only meta is not reliable for SEO** — setting tags via helmet after hydration is not a substitute for having them in the initial HTML. That's exactly why public routes are prerendered and app routes (which don't need indexing) are not.
  - **Dynamic rendering (bot-only HTML) is explicitly avoided** as a long-term approach.

## Performance Budgets & Tactics

Targets (field, p75): **LCP < 2.5s · INP < 200ms · CLS < 0.1** (R9.4).

- **JS budget:** initial public-page JS ≤ ~150KB gzip; route-split so the funnel, admin charts, and Jalali picker never load on a public profile (R9.3, seo §9).
- **LCP:** prerender hero text/image; preload the LCP image and the above-the-fold Vazirmatn weight; `fetchpriority="high"` on the hero.
- **CLS:** explicit `width`/`height` or `aspect-ratio` on all images; reserve space for async slot grids, banners, and the sticky pay bar; `font-display: swap` with a metrics-matched fallback (R9.6).
- **INP:** keep main-thread work small on public pages; minimal/no JS for purely informational sections; skeletons over spinners for first paint.
- **Fonts:** self-hosted Vazirmatn woff2, subset to the Arabic/Latin ranges in use, preloaded above the fold.
- **Images:** responsive `srcset` + AVIF/WebP, lazy below the fold.

### PWA strategy (R11)

- **Manifest:** keep existing fields (`name`, `short_name`, `description`, `lang:"fa"`, `dir:"rtl"`, `theme_color`, `background_color`, `display`, `start_url`, 192/512 icons); **add a 512×512 `purpose:"maskable"` icon** and optional screenshots for richer install UI.
- **Service worker:** author via `vite-plugin-pwa` using the **`injectManifest`** strategy with a hand-written source SW that keeps `install`/`activate`/`fetch` handlers and emits to **`/sw.js`**, so `main.tsx` continues to register `/sw.js` (preserving the existing PWA tests). Workbox: **precache the app shell**, runtime-cache salon images **CacheFirst** (with expiration), and public API GETs **StaleWhileRevalidate**.
- **Safety:** never cache authenticated API responses or `noindex`/auth HTML in a way that could serve one user's data to another or feed stale private HTML to crawlers (R11.6).
- **theme-color** updated per active theme.

## Testing Strategy

Goal: extend coverage and keep **all existing suites green** (R12.2, R12.3, R12.5).

- **Web unit/component:** Vitest + `@testing-library/react` (both already present). Each new component gets tests for its states and an **axe** check (`vitest-axe`/`axe-core`) that fails on serious/critical violations (R10.4).
- **Page smoke tests:** render each redesigned page, assert key states (loading/empty/error/populated), RTL direction, and that copy comes from i18n.
- **Mobile:** existing Jest + Testing Library RN tests for `AuthScreen`/`QrScanScreen` must stay green; extend with theme/RTL assertions.
- **SEO/perf in CI:** Lighthouse (SEO + a11y + perf) and a structured-data validation run against the **prerendered public URLs** as a build gate (seo §12); `web-vitals` reporting wired for field data.
- **Existing-test touchpoints (must be preserved or carefully updated, intent intact):**
  - `src/__tests__/i18n-rtl.test.ts` reads `index.html` and `App.tsx` and asserts `dir="rtl"`/`lang="fa"` and the `fa.json` section keys → keep those attributes and the catalog sections.
  - `src/__tests__/pwa.test.ts` asserts `manifest.json` fields, that `public/sw.js` has `install`/`activate`/`fetch` handlers, and that `main.tsx` registers `/sw.js` → the `injectManifest` → `/sw.js` decision above keeps this valid; if the SW source path moves, update the test path while preserving its assertions.
  - `admin/*.test.tsx` (Configuration/Calendar/Analytics) and `src/__tests__/integration-flow.test.ts` rely on `data-testid`s and roles (e.g. `role="tab"`, `aria-selected`, `data-testid="config-loading"`) → **preserve these hooks** through the redesign so behavior tests keep passing.
- **Per-screen design QA checklist** (ui-ux §14) is applied to every screen before it's considered done: structure/hierarchy, tokens in light+dark, all states, forms, RTL/i18n, accessibility (incl. a screen-reader spot-check in Farsi/RTL), performance, and content.

### Honest accessibility scope

Automated axe/Lighthouse checks are a **floor, not a certificate**. Full WCAG 2.2 AA conformance requires **manual testing with assistive technologies** (VoiceOver/iOS, TalkBack/Android, NVDA — in RTL/Farsi), keyboard-only runs, and **expert accessibility review**. This is called out in R10.7 and must be scheduled as follow-up work outside automated CI.

## Open Questions / Decisions to Confirm

- **Currency unit display:** the codebase currently shows **ریال** (`toLocaleString('fa-IR')`). The steering allows ریال or تومان if the product uses Toman. Decision for this spec: **display Rial (ریال)** for consistency with existing code, and keep machine-readable structured data in **IRR**. Confirm with product before launch.
- **Public host & slugs:** confirm canonical host (apex vs www) and the salon slug scheme (ASCII transliteration recommended) before generating canonicals/sitemap.
- **Profile freshness:** SSG vs SSR for `/s/:slug` depends on how often profiles change — start with SSG + scheduled rebuilds; revisit SSR if needed.
