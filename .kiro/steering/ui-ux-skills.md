---
inclusion: fileMatch
fileMatchPattern: '**/*.tsx'
---

# UI/UX Skills — Salon Booking PWA (Persian, RTL)

A senior-level, actionable playbook for redesigning this app's UI/UX. The product is a
Persian (Farsi), **right-to-left** salon appointment-booking platform for the Iranian
market. Web is React 18 + Vite PWA (`react-router-dom` v7, `react-i18next`, default `fa`,
`vite-plugin-pwa`); mobile is React Native (TypeScript). Today the web app has essentially
no visual design — treat every screen as greenfield and apply this guide.

**Real surfaces to design against (from `packages/web/src/App.tsx`):**

| Route | Screen | Audience |
| --- | --- | --- |
| `/qr/:payload` | QR landing → salon intro | Customer (cold entry from a physical QR) |
| `/salon/:salonId/book` | Service + date + slot picker | Customer |
| `/salon/:salonId/book/confirm` | Confirm + pay (Zarinpal/IDPay) | Customer |
| `/booking/success` | Confirmation receipt | Customer |
| `/auth` | Phone + 6-digit OTP login | Customer/Staff |
| `/admin/calendar` | Day/week appointment calendar | Salon staff/owner |
| `/admin/analytics` | KPIs and charts | Owner |
| `/admin/config` | Staff, chairs, services, holidays | Owner |

> The booking funnel (QR → book → confirm → success) is the revenue path. Optimize it
> ruthlessly: fewest taps, zero ambiguity, instant feedback, recoverable errors.

---

## Signature Design Language

> **This is the signature layer that governs every screen.** It elevates the tokenized,
> RTL-first foundation documented below (§1–§14) into a distinctive, premium **salon-luxe**
> identity — a plum-wine primary with a terracotta-clay accent over warm bone/sand neutrals and
> espresso ink — that reads unmistakably as a beauty brand and never as a generic, default
> AI-template UI. It is a *layering*, not a rewrite: every component keeps consuming the same
> semantic token names; only the token **values**, the display-type pairing, the brand motif,
> and the layout rhythm change.

The signature palette has three sources of truth that must stay byte-identical:
`packages/shared/src/tokens/index.ts` (`lightColors`/`darkColors`),
`packages/web/src/styles/tokens.css` (`:root` / `[data-theme="dark"]`), and the color table in
this file. **Where this document and the shipped tokens disagree, this steering file wins — so
keep all three in lockstep.** The palette below is the shipped identity and is the same one
tabulated in §2.

### Salon-luxe palette — light & dark (shipped)

Byte-identical to the semantic color table in §2 and to `tokens.css` / `@salon/shared`;
reproduced here as the signature reference.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--color-bg` | `#FBF7F2` | `#17110F` | Warm porcelain / espresso page bg |
| `--color-surface` | `#F4ECE1` | `#211915` | Warm sand cards, sheets |
| `--color-elevated` | `#FFFFFF` | `#2C2119` | Menus, dialogs, popovers |
| `--color-text` | `#241C18` | `#F6EEE7` | Espresso / bone primary ink |
| `--color-text-muted` | `#6E5C50` | `#BBA99B` | Warm taupe secondary text |
| `--color-border` | `#E4D8CB` | `#3A2D25` | Warm dividers, input borders |
| `--color-primary` | `#8E2F50` | `#E59CB3` | Plum-wine brand action / CTA |
| `--color-primary-contrast` | `#FFFFFF` | `#17110F` | Text/icon on primary |
| `--color-secondary` | `#2E6E63` | `#79C9BB` | Deep-eucalyptus secondary action |
| `--color-accent` | `#A6452A` | `#EB9A7A` | Terracotta-clay highlight / badge |
| `--color-success` | `#1F7A43` | `#69D08C` | Booked, paid, confirmed |
| `--color-warning` | `#9A5B12` | `#E7B45C` | Expiring OTP, low slots |
| `--color-danger` | `#B3261E` | `#F2938C` | Failed pay, cancel, errors |
| `--color-info` | `#1F5FAE` | `#86B6F0` | Neutral notices |
| `--color-focus-ring` | `#8E2F50` | `#E59CB3` | Focus outline |

The plum-wine `--color-primary` is deliberately dark and saturated because it is used **both**
as a fill (white text on it) *and* as colored text on near-white surfaces, so it must clear WCAG
AA (4.5:1) in **both** directions; the accent is a warm clay terracotta (not magenta) so it
stays usable as badge text (≥ 4.5:1 on bg/surface). Every shipped pairing is verified in
`packages/web/src/styles/contrast.test.ts` against `@salon/shared`.

### Display ⇄ body type pairing

A deliberate type pairing keeps display/heading text visually distinct from Vazirmatn body text
in every case. Tokens are declared in `tokens.css` and mirrored numerically in `@salon/shared`
(`typography`):

| Token | Value | Role |
| --- | --- | --- |
| `--font-weight-body` | `400` | Body copy weight |
| `--font-weight-display` | `800` | Hero/section title weight (heavier than body) |
| `--line-height-display` | `1.15` | Display line-height (tighter than body 1.75) |
| `--tracking-display` | `-0.01em` | Editorial display letter-spacing (tighter) |

**Invariant (enforced by `styles/tokens-complete.test.ts`): display weight > body weight AND
display line-height < body line-height.** This guarantees headings can never render visually
uniform with body copy — there is no exception. Apply the display treatment (via the
`text-display` utility/helper composed in `tailwind.config.js`) to hero and section titles.
Vazirmatn is a 100–900 variable face, so the heavier display weight costs no extra download.

### Brand motif — the recurring signature device

One reusable brand device: a **token-driven SVG "petal arc"** (an overlapping-arc, salon-
evocative mark) in `packages/web/src/components/brand/Motif.tsx`, exported via
`components/brand/index.ts`. Its fills derive from `var(--color-primary)` / `var(--color-accent)`
(and `currentColor`), so it re-tints automatically per theme **and** per tenant accent. It is
decorative — `aria-hidden` by default — and `className` controls size only, never color.

| Variant | Use | Where it recurs |
| --- | --- | --- |
| `mark` | Logo-scale glyph beside the brand wordmark | `AppShell`, `OwnerShell`, `FunnelShell` headers |
| `band` | Hero divider / flourish | `MarketingHome` & `BusinessLanding` hero divider; `SalonProfilePage` header flourish |
| `watermark` | Faint background motif | Behind owner empty states |

Because the motif reads the accent tokens, on a tenant storefront it automatically adopts that
salon's Brand_Accent.

### Editorial / asymmetric layout primitives

To escape the "stacked equal cards" look, compose primary/brand content with the editorial
layout primitives in `components/layout` (thin grid wrappers, logical-properties only):

- **`EditorialSplit`** — asymmetric two-column (e.g. `1.4fr 1fr`, alternating sides) for heroes
  and feature rows; collapses to one column under `md`.
- **`FeatureMosaic`** — a deliberately uneven grid (one lead tile + supporting tiles) for 3+ peer
  features, so "a single row of equal cards" is never the only option.
- **`SectionRhythm`** — alternates section background between `--color-bg` and `--color-surface`
  and varies vertical density so consecutive sections differ.

### Anti-generic constraints (non-negotiable)

- **No default indigo→purple hero gradient.** Hero backgrounds derive from palette tokens (solid
  `--color-surface`, a token-driven motif `band`, or a warm `--color-primary` / `--color-accent`
  wash) — never a literal `linear-gradient(… #6366f1 … #a855f7 …)` or the indigo/purple hex
  family in authored styles.
- **No sole 3-equal-card row** for three or more peer features — at least one such surface uses
  `FeatureMosaic` or `EditorialSplit`.
- **Vary section rhythm** via `SectionRhythm`; consecutive sections must differ in layout,
  background, or density.
- **A domain-specific visual is present** (salon imagery or the brand `Motif`) — not solely a row
  of generic monochrome icons.
- **Tokens-only + logical properties.** No raw hex/px/ms literals in authored styles; no physical
  `left`/`right` for flow-relative spacing (use logical `inline-start`/`inline-end`; see §11).
- **Tenant accent via runtime CSS vars only.** A salon's Brand_Accent is injected as runtime
  custom properties on a scoped storefront wrapper (`TenantTheme`), never as authored color
  literals, so component code stays tokens-only.

These constraints are also captured as an enforceable steering skill
(`.kiro/steering/signature-design-language.md`) and backed by the distinctiveness guardrail
(`packages/web/src/styles/distinctiveness.test.ts`), which reports each violating file + rule.

### Honest scope — automated checks are a floor, not a certificate

The contrast test, the axe/Lighthouse accessibility checks, and the distinctiveness guardrail are
**necessary but not sufficient — they are a floor, not a certificate.** **Full WCAG 2.2 AA
conformance requires manual testing with assistive technologies** (VoiceOver/iOS, TalkBack/
Android, NVDA — all exercised in RTL/Farsi), keyboard-only runs, and **expert accessibility
review**. Treat every automated pass as a floor, never as proof of conformance (see also §10).

---

## 1. Core design principles

- **Clarity first.** One primary action per screen. The funnel's primary CTA (e.g.
  «تایید رزرو», «دریافت کد») is always the most prominent element.
- **Visual hierarchy.** Drive the eye with size → weight → color → spacing, in that order.
  Don't rely on color alone to signal importance.
- **Consistency.** Same concept = same component, label, icon, and position everywhere.
  A "slot chip" looks and behaves identically on every screen.
- **Immediate feedback.** Every tap acknowledges within 100ms (press state), resolves or
  shows progress by 300ms, and never leaves a dead button. OTP send, slot select, and pay
  all show inline loading.
- **Forgiveness & undo.** Destructive/owner actions (cancel appointment, delete service,
  remove staff) require confirmation and, where feasible, an undo window (toast with
  «بازگردانی») instead of a hard modal.
- **Progressive disclosure.** Show the next decision only. Booking is a stepper: service →
  date → time → confirm. Admin config hides advanced options behind «تنظیمات پیشرفته».

---

## 2. Design tokens & theming

Define tokens once as CSS custom properties on `:root`, theme via `[data-theme="dark"]`.
Components consume **only** tokens — never raw hex, px, or ms literals. The signature palette
is a warm **salon-luxe** direction — a plum-wine primary with a terracotta-clay accent over
warm bone/sand neutrals and espresso ink — replacing the original indigo seed. (The PWA
`theme_color` in `manifest.json` is derived from this primary.)

### Color — semantic roles (not literal names)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--color-bg` | `#FBF7F2` | `#17110F` | Page background |
| `--color-surface` | `#F4ECE1` | `#211915` | Cards, sheets |
| `--color-elevated` | `#FFFFFF` | `#2C2119` | Menus, dialogs, popovers |
| `--color-text` | `#241C18` | `#F6EEE7` | Primary text |
| `--color-text-muted` | `#6E5C50` | `#BBA99B` | Secondary/help text |
| `--color-border` | `#E4D8CB` | `#3A2D25` | Dividers, input borders |
| `--color-primary` | `#8E2F50` | `#E59CB3` | Brand actions, CTAs |
| `--color-primary-contrast` | `#FFFFFF` | `#17110F` | Text/icon on primary |
| `--color-secondary` | `#2E6E63` | `#79C9BB` | Secondary actions |
| `--color-accent` | `#A6452A` | `#EB9A7A` | Highlights, badges |
| `--color-success` | `#1F7A43` | `#69D08C` | Booked, paid, confirmed |
| `--color-warning` | `#9A5B12` | `#E7B45C` | Expiring OTP, low slots |
| `--color-danger` | `#B3261E` | `#F2938C` | Failed pay, cancel, errors |
| `--color-info` | `#1F5FAE` | `#86B6F0` | Neutral notices |
| `--color-focus-ring` | `#8E2F50` | `#E59CB3` | Focus outline |

> Pick the **primary** shade so body-size text on it clears WCAG AA **in both directions** —
> the primary is used both as a white-text fill *and* as colored text on near-white surfaces.
> The salon-luxe plum-wine `#8E2F50` clears 4.5:1 both ways (its dark-mode counterpart
> `#E59CB3` carries the dark `--color-primary-contrast` ink). Every shipped pairing is
> verified in `packages/web/src/styles/contrast.test.ts` against `@salon/shared`.

### Typography scale (rem, base 16px)

| Token | Size | Line height | Use |
| --- | --- | --- | --- |
| `--font-2xs` | 0.75 | 1.7 | Captions, legal |
| `--font-xs` | 0.875 | 1.7 | Helper text |
| `--font-sm` | 1.0 | 1.75 | Body (Farsi default) |
| `--font-md` | 1.125 | 1.7 | Lead paragraph |
| `--font-lg` | 1.375 | 1.45 | Section title (h2) |
| `--font-xl` | 1.75 | 1.35 | Page title (h1) |
| `--font-2xl` | 2.25 | 1.25 | Marketing hero |

### Spacing — 8pt grid

`--space-0:0; --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;`
`--space-5:24px; --space-6:32px; --space-8:48px; --space-10:64px;`
Use multiples of 8 (4 only for tight icon/text gaps). Never invent off-grid values.

### Radius / elevation / z-index / motion

- **Radius:** `--radius-sm:6px; --radius-md:10px; --radius-lg:16px; --radius-pill:999px`.
- **Elevation:** `--shadow-1` (cards), `--shadow-2` (menus), `--shadow-3` (dialogs).
  In dark mode prefer border + subtle shadow; heavy shadows read poorly on dark.
- **Z-index ladder:** `--z-base:0; --z-sticky:100; --z-nav:200; --z-overlay:1000;`
  `--z-dialog:1100; --z-toast:1200`. Never hard-code z-index outside this ladder.
- **Motion:** `--dur-fast:150ms; --dur-base:200ms; --dur-slow:300ms;`
  `--ease-standard:cubic-bezier(0.2,0,0,1); --ease-emphasized:cubic-bezier(0.2,0,0,1.2)`.

### Theming rules

- Default to **light**; support **dark** via `[data-theme]` + `prefers-color-scheme`.
- Persist user choice (localStorage) and expose a toggle in the app header/admin.
- Update `<meta name="theme-color">` per theme so the PWA chrome matches.
- Test **every** screen in both themes — dark is not "invert and ship."

---

## 3. Color & contrast (WCAG 2.2 AA)

- Body and UI text ≥ **4.5:1**; large text (≥ 24px, or 18.66px bold) and meaningful
  non-text/UI (icons, input borders, focus ring) ≥ **3:1**.
- **Never color-only.** Pair status color with an icon and/or text: a paid badge is
  green + ✓ + «پرداخت شد»; a failed payment is red + ⚠ + «پرداخت ناموفق».
- Define real **state colors** for slots: available, selected, held/pending, full,
  past — each distinguishable without color (fill + label + icon).
- Don't place text on busy images without a scrim. Check disabled text still ≥ 3:1 so it
  reads as "disabled," not "invisible."

---

## 4. Typography — Persian-first

- **Font:** ship **Vazirmatn** (variable) as the primary UI font; it covers Persian glyphs,
  Persian digits, and Latin. Fallback stack:
  `font-family: 'Vazirmatn', system-ui, 'Segoe UI', Tahoma, sans-serif;`
- **Self-host** the variable woff2, `font-display: swap`, and `<link rel="preload">` the
  weight used above the fold. Avoid FOIT on the OTP/booking screens.
- **Line height** for Farsi runs higher than Latin — body ≈ 1.75 — because Persian letters
  have tall ascenders/descenders and diacritics. Don't crowd lines.
- **Measure:** keep paragraphs **45–75 characters** (`max-inline-size: 70ch`). Salon
  descriptions and policy text must not stretch full-width on desktop.
- **Numerals:** display Persian/Eastern-Arabic digits (۰۱۲۳۴۵۶۷۸۹) for prices, dates,
  counts, and the OTP countdown. Keep **input** values in the form the field expects (the
  phone/OTP fields use `dir="ltr"` and Latin entry); normalize digits on submit.
- Use `font-feature-settings`/tabular numerals for aligned price/time columns in the admin
  calendar and analytics tables.

---

## 5. Layout, grid & responsive

- **Mobile-first.** The customer funnel is overwhelmingly phone traffic (QR scans). Design
  the 360–414px width first, enhance up.
- **Breakpoints:** `sm 480 / md 768 / lg 1024 / xl 1280`. Admin calendar/analytics are the
  main desktop-rich screens.
- **Container widths:** content max ≈ 1200px; reading columns ≈ 70ch; booking funnel card
  max ≈ 480px centered.
- **Safe areas:** respect `env(safe-area-inset-*)` for notches/home indicators; sticky pay
  bar must clear the bottom inset.
- **Thumb reach:** primary CTA sits in the bottom third on mobile; avoid top-corner primary
  actions. Bottom sheets beat top dropdowns for slot/date pickers on phones.

---

## 6. Component states — non-negotiable checklist

Every **interactive** element defines all of:

- [ ] default · [ ] hover · [ ] focus-visible · [ ] active/pressed · [ ] disabled ·
  [ ] loading (with accessible busy state)

Every **data surface** (list, card, table, chart, slot grid) defines all of:

- [ ] loading — **skeleton** matching final layout (not a centered spinner)
- [ ] empty — explains why + a next step (e.g. «این روز نوبت خالی ندارد، روز دیگری انتخاب کنید»)
- [ ] error — cause + retry action, never a raw stack/HTTP code
- [ ] success/populated — the normal state
- [ ] partial — some loaded, more paging (skeleton rows at the tail)

> Apply directly: the slot list in `AvailabilityPage` currently jumps between
> "loading text", "no slots", and a raw list. Replace with skeleton chips → empty card →
> chip grid, and give each slot chip the full interactive-state set.

---

## 7. Forms & validation

- **Labels always visible** (never placeholder-as-label). The OTP/phone fields must keep
  their `<label htmlFor>`; placeholders are examples only (`09xxxxxxxxx`).
- **Inline errors** next to the field, text **+** icon, tied via `aria-describedby`, and set
  `aria-invalid`. Summarize multiple errors at the top of long admin forms with in-page
  anchor links.
- **Phone field:** `type="tel"`, `inputMode="tel"`, `dir="ltr"`, `autoComplete="tel"`,
  `maxLength` for `09` + 9 digits; validate the Iranian mobile pattern (`^09\d{9}$`) and
  accept pasted `+98`/`۰۹…` by normalizing digits before validation.
- **OTP input:** 6 single boxes or one grouped field with `inputMode="numeric"`,
  `autoComplete="one-time-code"`, `dir="ltr"`; auto-advance on entry, support full **paste**
  of the 6 digits, backspace moves to the previous box, and show a **resend timer**
  («ارسال مجدد تا ۰:۴۵») that disables resend until it elapses.
- **Numbers/prices:** `inputMode="numeric"`; show Rial formatting on blur, keep raw value
  internally.
- **Autofill:** set correct `autoComplete` tokens so iOS/Android fill OTP and phone.
- **Success confirmation:** explicit, not silent — toast «کد ارسال شد» on OTP send,
  full success screen at `/booking/success` with what/when/where and next steps.

---

## 8. Navigation & information architecture

- **Customer funnel:** linear stepper with a visible progress indicator (۱ خدمت · ۲ تاریخ ·
  ۳ زمان · ۴ تایید). Back returns to the previous step **without losing state**.
- **Wayfinding:** every screen has a clear title (single `<h1>`) and an obvious way back.
  In RTL the back affordance and its chevron point **right** (see §11).
- **Breadcrumbs:** use in the **admin** area (e.g. تنظیمات ‹ خدمات ‹ ویرایش خدمت) where
  hierarchy is real; skip them in the short customer funnel.
- **Mobile nav:** customer app needs almost none (funnel is self-contained). Admin uses a
  **bottom tab bar** on mobile (تقویم · آمار · تنظیمات) and a side/top nav on desktop.
- **Back behavior:** browser back must work as users expect (router history), and hardware
  back on PWA/mobile must not drop them out of the funnel unexpectedly. Warn before
  abandoning a partially completed/paid booking.

---

## 9. Motion

- **Purposeful only** — motion clarifies cause/effect or spatial relationship. No decorative
  looping animation.
- **Duration 150–300ms**; enters slightly slower than exits. Use the standard easing tokens;
  reserve emphasized easing for the primary success moment.
- **Respect `prefers-reduced-motion: reduce`** — drop transforms/parallax, keep opacity
  crossfades, and never block completion of an action on an animation.
- **No layout-shift animation.** Animate `transform`/`opacity`, never `width`/`height`/`top`
  that reflow. Reserve space for async content to protect CLS (see Performance).

---

## 10. Accessibility (WCAG 2.2 AA)

- **Semantic HTML + landmarks:** `header/nav/main/footer`, one `<h1>` per page, headings in
  order (no skipping levels). Use real `<button>`/`<a>`, not clickable `<div>`s.
- **Keyboard:** everything operable without a pointer; logical tab order (mind RTL); visible
  **focus-visible** ring using `--color-focus-ring` (don't remove outlines).
- **Dialogs/sheets:** trap focus, restore focus to the trigger on close, `Esc` closes,
  label with `aria-labelledby`, `role="dialog"` + `aria-modal="true"`.
- **ARIA only when needed** — prefer native elements. Don't add redundant roles to semantic
  tags. Icon-only buttons get `aria-label` (e.g. «بستن», «حذف نوبت»).
- **Touch targets ≥ 44×44px** with adequate spacing; slot chips and calendar cells included.
- **Live regions:** announce async results — OTP sent, payment result, slot-load errors —
  via `aria-live="polite"` (or `role="alert"` for errors, as `AuthPage` already does).
- **Color-independent meaning** everywhere (see §3); test forms with the screen reader's
  forms mode.

> **Honest scope:** automated checks (axe, Lighthouse, eslint-plugin-jsx-a11y) are
> **necessary but not sufficient**. Full WCAG 2.2 AA conformance requires **manual testing
> with assistive technologies** (VoiceOver/iOS, TalkBack/Android, NVDA — all in RTL/Farsi),
> keyboard-only runs, and **expert accessibility review**. Treat automated passes as a floor,
> not a certificate.

---

## 11. RTL & i18n correctness

- **Logical CSS, always.** Use `margin-inline`, `padding-inline`, `inset-inline-start/end`,
  `border-inline-*`, `text-align: start/end`. **Never** `left`/`right`/`margin-left` etc.
  for flow-relative spacing. Flexbox/grid honor direction automatically — design in logical
  start/end terms.
- **Mirror directional icons:** chevrons, back/forward arrows, progress carets, breadcrumb
  separators flip in RTL. **Do not mirror** universal/semantic icons: clock, checkmark,
  search/magnifier, phone, camera/QR, logos, media play.
- **Bidi handling:** Farsi text mixed with Latin (URLs, emails) or numbers needs isolation.
  Wrap inline LTR runs with `<bdi>` or `unicode-bidi: isolate` so punctuation/parentheses
  don't jump. Phone/OTP fields stay `dir="ltr"` while their labels stay RTL.
- **Dates — Jalali (Shamsi):** display all customer/admin dates in the Persian calendar
  (e.g. «چهارشنبه ۱۷ اردیبهشت ۱۴۰۴»). Replace the native `<input type="date">` in
  `AvailabilityPage` with a **Jalali date picker** (RTL, Persian month names, Persian
  digits). Convert to/from ISO at the API boundary only.
- **Numerals & currency:** render Persian digits for display; format **Iranian Rial** with
  thousands grouping and a clear unit («۲٬۵۰۰٬۰۰۰ ریال» or «تومان» if the product uses
  Toman — confirm and be consistent). Right-align numeric columns by logical `end`.
- **No hard-coded LTR assumptions:** no `float: left`, no left-anchored absolute positioning,
  no `transform: translateX` that assumes direction without a sign flip, no
  ltr-only keyboard handlers (Arrow keys swap meaning in RTL grids).

---

## 12. Performance & perceived performance

- **Skeletons over spinners** for first paint of lists/cards/charts; spinners only for short
  in-button waits (OTP verify, pay redirect).
- **Optimistic UI** where safe: reflect a slot selection / form edit immediately, reconcile
  on server response, roll back with a clear message on failure. Do **not** fake payment
  success — money flows are confirmed by the server only.
- **Code-split routes:** lazy-load `/admin/*` (calendar/analytics/config are heavy) and the
  Jalali picker / chart libs; keep the customer funnel bundle lean.
- **Images:** salon photos as responsive `srcset` + AVIF/WebP, lazy-loaded below the fold,
  with explicit `width`/`height` (or aspect-ratio) to prevent CLS.
- **Fonts:** self-hosted Vazirmatn woff2, `font-display: swap`, preload the above-the-fold
  weight, subset to Arabic/Latin ranges in use.
- **Avoid CLS:** reserve space for async slot grids, banners, and the sticky pay bar; never
  inject content that shoves the primary CTA.

---

## 13. Microcopy & content

- **Tone:** Persian, warm but concise, action-oriented. Prefer verbs on buttons
  («تایید رزرو», «دریافت کد», «انتخاب زمان»), not nouns.
- **Be specific.** Errors say what happened **and** the next step: «کد منقضی شده است —
  دوباره درخواست دهید» beats a bare «خطا».
- **Empty states sell the next action:** «هنوز نوبتی ثبت نشده — اولین رزرو را ایجاد کنید».
- **Numbers/time in words where friendly:** «۳ نوبت امروز», «۴۵ ثانیه تا ارسال مجدد».
- **Consistency with the i18n catalog:** all strings come from `react-i18next` (`fa.json`);
  no hard-coded Farsi in JSX. Add keys rather than inlining text. Keep keys grouped by
  domain (`auth.*`, `booking.*`, `salon.*`, `admin.*`, `common.*`) as already established.

---

## 14. Per-screen Design QA checklist

Run this before calling any screen "done":

**Structure & hierarchy**
- [ ] Exactly one `<h1>`; headings in logical order; landmarks present
- [ ] One clear primary action; secondary actions visually subordinate

**Tokens & theming**
- [ ] No raw hex/px/ms — tokens only; verified in **light and dark**
- [ ] `theme-color` and surfaces correct per theme

**States**
- [ ] All interactive states (default→loading) present and visible
- [ ] All data states present: skeleton / empty / error+retry / success

**Forms (if any)**
- [ ] Visible labels; inline errors (text+icon, `aria-describedby`, `aria-invalid`)
- [ ] Correct `inputMode`/`autoComplete`/`dir`; OTP paste + resend timer; phone pattern

**RTL & i18n**
- [ ] Logical CSS only; layout correct in RTL; directional icons mirrored, universal not
- [ ] Persian digits for display; Rial formatted; Jalali dates; bidi-isolated mixed text
- [ ] All copy from i18n catalog, none hard-coded

**Accessibility**
- [ ] Keyboard-operable; visible focus ring; targets ≥ 44×44px
- [ ] Icon-only controls labeled; async results in live regions; meaning not color-only
- [ ] Spot-checked with a screen reader in Farsi/RTL (automated check is not enough)

**Performance**
- [ ] Skeletons for first load; route/heavy-lib code-split; images sized (no CLS)
- [ ] Fonts preloaded with `swap`; bundle impact reviewed

**Content**
- [ ] Action-oriented labels; errors/empties give a next step; tone consistent
