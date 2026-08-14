# Per-screen Distinctiveness Checklist — Signature UI System

A reviewer applies this checklist to **every screen before that screen is
considered "done."** It is the gate that keeps the salon-luxe signature identity
from quietly regressing to a generic, "AI-default" look (signature-ui-system
**R11.1, R11.2**).

It complements — it does not replace — the broader **Design QA** checklist
(`.kiro/steering/ui-ux-skills.md` §14), the **SEO QA** checklist
(`.kiro/steering/seo-skills.md` §14, indexable public pages only), and the WCAG
floor note in [`accessibility.md`](./accessibility.md). The full narrative behind
each rule (palette tables, type pairing, motif recurrence, layout primitives)
lives in `.kiro/steering/ui-ux-skills.md` → "Signature Design Language", and the
enforceable short form is `.kiro/steering/signature-design-language.md`.

## How to use this checklist

1. Run it **per screen / route**, not once for the whole app. Copy the
   [per-screen sign-off block](#per-screen-sign-off-template) for each screen and
   fill it in.
2. A screen is **not "done"** until all six required checks below pass (or are a
   justified, recorded n/a) **and** the backing automated suites are green.
3. **Passing this checklist plus the automated checks is a _floor_, not a
   certificate.** It proves the signature identity is present and the obvious
   generic regressions are absent. It does **not** prove full WCAG 2.2 AA
   conformance — that still requires manual assistive-technology testing in
   Farsi/RTL and an expert accessibility review (see the
   [floor note](#the-floor-not-a-certificate) at the end, and `accessibility.md`).

Legend for the sign-off block: **[x] pass** · **[ ] not yet** · write **n/a —
<reason>** when a criterion genuinely does not apply (for example "brand motif"
on an internal admin utility surface with no hero/brand region).

---

## The six required checks (R11.1)

Each item lists **what to verify**, **how to verify it**, and **which automated
check(s) back it** (if any). Where an item is marked *manual / visual*, no
automated check can prove it — a human reviewer must confirm it by eye.

### 1. Signature palette in use

- [ ] The screen styles through the semantic salon-luxe **tokens** only —
      `--color-primary` (plum-wine), `--color-accent` (terracotta clay), and the
      warm neutrals (`--color-bg`, `--color-surface`, `--color-text`, …) via the
      Tailwind token utilities (`bg-primary`, `text-text`, `border-border`, …).
- [ ] **No** indigo/purple family anywhere — neither the hex literals
      (`#6366f1`, `#818cf8`, `#a855f7`, `#8b5cf6`, `#d946ef`, `#e879f9`) nor the
      `indigo`/`purple`/`violet`/`fuchsia` utility colors.
- [ ] **No** raw hex / `px` / `ms` literals in authored styles; the only color
      literals allowed are tenant Brand_Accent values injected as **runtime CSS
      custom properties** on the `TenantTheme` wrapper.
- [ ] Text on the primary/accent surfaces is legible in **both light and dark**
      themes (toggle and look).

**How to verify:** read the screen's JSX/CSS for token utilities; grep the diff
for stray hex/px/ms and for the indigo/purple family; toggle the theme switch.

**Backed by:** `src/styles/contrast.test.ts` (default palette AA matrix),
`src/styles/tokens-complete.test.ts` (every role defined in both themes),
`src/styles/distinctiveness.test.ts` (flags indigo/purple + raw style literals).
For storefront screens that apply a tenant accent, also
`src/styles/tenant-contrast.test.ts` (on-accent foreground clears AA for every
accent).

### 2. Non-default (editorial / asymmetric) layout

- [ ] Hero / primary-brand content uses an **editorial, asymmetric, or off-grid**
      composition — `EditorialSplit` (`components/layout/EditorialSplit.tsx`) —
      rather than one centered column of equal blocks.
- [ ] Three or more **peer features** are composed with `FeatureMosaic`
      (`components/layout/FeatureMosaic.tsx`) or `EditorialSplit` — **never** a
      single row of equal-width, centered icon-over-title-over-text cards.
- [ ] Consecutive sections **vary in rhythm** (background / density) via
      `SectionRhythm` (`components/layout/SectionRhythm.tsx`) instead of repeating
      one uniform block.

**How to verify:** *manual / visual* — confirm the layout primitives are used and
the screen does not read as stacked equal cards. (The guardrail enforces logical
properties on these layouts but cannot judge "editorial" by itself.)

**Backed by:** *manual / visual* (no automated distinctiveness assertion);
`src/styles/distinctiveness.test.ts` only enforces logical-property discipline on
the markup.

### 3. Branded motion

- [ ] All durations and easings come from motion **tokens** (`--dur-fast`,
      `--dur-base`, `--dur-slow`, `--ease-standard`, `--ease-emphasized`, via the
      `duration-*` / `ease-*` utilities) — **no** raw `ms` or easing literals.
- [ ] Animations move **`transform` / `opacity` only** (never `width`, `height`,
      `top`, or other layout-reflowing properties).
- [ ] Interactive feedback sits in the **150ms–300ms** band, and the
      **emphasized** easing is reserved for the **booking-success** confirmation
      moment (`pages/BookingSuccessPage.tsx`) — not used elsewhere.
- [ ] `prefers-reduced-motion: reduce` is respected: non-essential
      transform/parallax motion is removed, essential opacity feedback is kept,
      and motion never blocks completing an action.

**How to verify:** read animated styles for token usage and reflow-safe
properties; set the OS "reduce motion" preference and confirm the screen still
works with motion stripped.

**Backed by:** `src/styles/motion.property.test.ts` (duration band + emphasized
easing reserved for booking-success), `src/styles/distinctiveness.test.ts` (flags
raw `ms` literals); reduced-motion behaviour is *manual / visual*.

### 4. Bespoke empty / loading / error states

- [ ] **Loading:** a layout-matched `Skeleton` (`components/ui/Skeleton.tsx`)
      shaped like the final content — **not** a centered spinner — shown while the
      request is pending or existence-of-data is undetermined.
- [ ] **Empty:** an `EmptyState` (`components/ui/EmptyState.tsx`) that states the
      cause and offers a **specific, action-oriented** next step in Persian — and
      only **after** the request settles with no data (never before).
- [ ] **Error:** an `ErrorState` (`components/ui/ErrorState.tsx`) with a
      human-readable **Persian cause + retry** action — and **no** raw stack trace
      or HTTP status code (may appear even after a prior successful load, e.g. a
      failed refresh).
- [ ] **Success** (where the screen completes an action) is confirmed explicitly
      (e.g. a `Toast` announced via an ARIA live region), never silently.

**How to verify:** drive the screen through loading → populated, loading → empty,
and loading → error; confirm each state renders the right primitive and the
copy is real Persian from the i18n catalog.

**Backed by:** the page/component suites assert the lifecycle (Properties 11 &
12 — e.g. `pages/admin/CalendarPage.test.tsx`, `AnalyticsPage.test.tsx`); the
exact per-screen wiring is *manual / visual*.

### 5. Brand motif present

- [ ] The recurring `Motif` (`components/brand/Motif.tsx`) appears on the
      screen's **hero / brand surface** (e.g. `variant="band"` as a hero divider,
      `variant="mark"` beside the wordmark, or `variant="watermark"` behind an
      empty state).
- [ ] The motif is **decorative** (`aria-hidden` by default) and **sized via
      `className` only** — its fills derive from `--color-primary` /
      `--color-accent`, so it re-tints per theme and per tenant automatically (no
      hard-coded color).

**How to verify:** *manual / visual* — confirm the motif is rendered on
hero/brand regions. (Internal utility surfaces with no brand region may record
this as a justified n/a.)

**Backed by:** `src/components/brand/__tests__` covers the motif's own render
(SVG, `aria-hidden`, no hard-coded hex); on-screen **presence** is *manual /
visual*.

### 6. Persian display typography

- [ ] Hero / section titles use the **display treatment** — `text-display`
      utility / display tokens (`--font-weight-display` heavier than body,
      `--line-height-display` tighter than body, `--tracking-display`) — so
      headings never render visually uniform with body text.
- [ ] All user-facing **digits** (prices, dates, counts, timers, identifiers)
      render as **Persian / Eastern-Arabic numerals** via `<Num>`
      (`components/ui/Num.tsx`) / `<Money>` (`components/ui/Money.tsx`), with
      **`tabular-nums`** for consistent advance width. (Latin entry is allowed
      *inside* input fields like phone/OTP, normalized on submit.)
- [ ] Dates are shown on the **Jalali (Shamsi)** calendar via `<JalaliDate>`
      (`components/ui/JalaliDate.tsx`), converting to/from ISO only at the API
      boundary.
- [ ] Mixed Persian + Latin/numeric runs (URLs, phone numbers) are **bidi
      isolated** with `<bdi>` / `DirText` (`components/ui/DirText.tsx`).
- [ ] Long Persian body copy is constrained to a ~**70ch** reading measure
      (`max-inline-size: 70ch` / `max-w-prose`).

**How to verify:** confirm titles use `text-display`; confirm every displayed
number/date/price goes through `<Num>`/`<Money>`/`<JalaliDate>`; check mixed runs
are wrapped; check long paragraphs are width-constrained.

**Backed by:** `src/styles/tokens-complete.test.ts` (display weight > body AND
display line-height < body); the `Num` / `Money` / `JalaliDate` / `DirText`
component suites (Persian + tabular digits, Jalali round-trip, bidi isolation —
Properties 14–16). The per-screen *application* of these is *manual / visual*.

---

## Which automated check backs which item

These suites run under `web` via `vitest run`; they are the **floor**
that backs (parts of) the checklist. A screen is not "done" while any are red.

| Automated check | Item(s) it backs | What it proves |
| --- | --- | --- |
| `src/styles/contrast.test.ts` | 1 | Default palette pairings clear WCAG AA (4.5:1 body / 3:1 non-text) in both themes |
| `src/styles/tenant-contrast.test.ts` | 1 (storefront accent) | Derived on-accent foreground clears AA for every curated accent |
| `src/styles/tokens-complete.test.ts` | 1, 6 | Every color role is defined in both themes; display type is strictly distinct from body |
| `src/styles/distinctiveness.test.ts` | 1, 2, 3 | Flags indigo→purple gradients, physical `left`/`right`, raw hex/px/ms, and library usage that omits tokens — with file + rule for each |
| `src/styles/motion.property.test.ts` | 3 | Authored motion stays in the 150–300ms band and reserves emphasized easing for booking-success |
| page/component suites (`CalendarPage`, `AnalyticsPage`, `Num`, `Money`, `JalaliDate`, `DirText`, `Motif`, …) | 4, 5, 6 | Data-state lifecycle, safe/recoverable errors, Persian/tabular numerals, Jalali round-trip, bidi isolation, motif render |

> Items **2** (editorial layout), **4** (per-screen state wiring), **5** (motif
> *presence* on the screen), and the title-treatment part of **6** are
> ultimately **manual / visual** — the suites above enforce the supporting
> discipline (logical properties, motion band, token completeness, component
> contracts) but cannot certify the look of a specific screen.

---

## Per-screen sign-off template

Copy this block once per screen/route into the review record and fill it in.

```md
### Screen: <route or component name> (e.g. /s/:slug — SalonProfilePage)

Reviewer: <name>        Date: <YYYY-MM-DD>        Theme(s) checked: light / dark

- [ ] 1. Signature palette in use (salon-luxe tokens; no indigo/purple; no raw hex/px/ms)
- [ ] 2. Non-default (editorial/asymmetric) layout (EditorialSplit / FeatureMosaic / SectionRhythm)
- [ ] 3. Branded motion (token durations/easings; transform/opacity only; reduced-motion respected)
- [ ] 4. Bespoke empty/loading/error states (layout-matched Skeleton; EmptyState; safe ErrorState)
- [ ] 5. Brand motif present on hero/brand surface (Motif, aria-hidden, token-driven)
- [ ] 6. Persian display typography (display titles; Persian tabular numerals; Jalali; bidi; ~70ch)

Backing suites green:
- [ ] contrast.test.ts   - [ ] tenant-contrast.test.ts (if storefront)
- [ ] tokens-complete.test.ts   - [ ] distinctiveness.test.ts   - [ ] motion.property.test.ts
- [ ] relevant page/component suites

Notes / justified n/a:
- <e.g. "Item 5 n/a — internal admin utility surface, no hero/brand region.">

Verdict: [ ] DONE  /  [ ] NOT YET
```

---

## The floor, not a certificate

> **Passing this checklist and the automated suites is a _floor_, not a
> certificate of WCAG 2.2 AA conformance.**

The checklist proves the signature identity is present and the obvious generic
regressions are absent. It does **not** prove the screen is fully accessible.
Full **WCAG 2.2 Level AA** conformance for this product still requires the
manual work that no automated tool can perform — and which is out of scope for
the CI gate (see `accessibility.md` for the full note):

- **Manual assistive-technology testing in Farsi / RTL** — VoiceOver (iOS),
  TalkBack (Android), and NVDA (Windows) against the real Persian, right-to-left
  content: names, roles, states, reading and focus order, and live-region
  announcements.
- **Keyboard-only runs** of every flow — logical RTL tab order, a visible focus
  ring at every stop, no traps, dialogs/sheets that trap and restore focus.
- **Expert accessibility review** against the WCAG 2.2 AA success criteria,
  including the judgement calls (alt-text quality, content order, motion,
  target spacing) a tool cannot make.

Treat a fully ticked checklist and a green suite as evidence the floor is intact,
then schedule the manual passes above before making any external claim of AA
conformance.
