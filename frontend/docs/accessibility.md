# Accessibility — Salon Booking PWA (web)

This document records how accessibility is verified for the web package and,
just as importantly, **what the automated checks do _not_ cover**. It is the
authoritative reference for Requirement 10 (WCAG 2.2 AA) of the UI/UX redesign
and follows the honesty note in `.kiro/steering/ui-ux-skills.md` §10 and the CI
validation guidance in `.kiro/steering/seo-skills.md` §12.

## Target

The UI targets **WCAG 2.2 Level AA** across the redesigned screens and
components (R10.1): semantic HTML and landmarks, a single ordered heading
outline per page, full keyboard operability with a logical RTL focus order, a
visible focus indicator, ≥ 44×44px touch targets, programmatic form labels and
error identification, text alternatives for images/icons, and meaning that is
never carried by color alone.

## Automated gates (the floor)

Two automated gates run in CI and **fail the build** on a regression. Either one
failing blocks the merge.

### 1. axe in the component and page suites

The Vitest component tests and page smoke tests render each primitive and page
in an RTL (`dir="rtl"`) context and assert — via `vitest-axe`
(`toHaveNoViolations`) through the shared `expectNoSeriousA11yViolations`
helper in `src/test/a11y.tsx` — that there are **no serious or critical axe
violations** (R10.4). This runs as part of the normal suite:

```bash
npm run test --workspace @salon/web
```

The same helper also enforces the **single-`<h1>` + ordered-headings** outline
(`expectSingleH1AndOrderedHeadings`).

> **jsdom limitation (intentional):** axe-core cannot compute `color-contrast`
> under jsdom (there is no layout/computed-color engine), so that rule is not a
> reliable signal in the unit suite. Token-pair contrast is instead proven
> numerically in `src/styles/contrast.test.ts`, and the Lighthouse gate below
> re-checks contrast against the real rendered pages.

### 2. Lighthouse accessibility against the prerendered public URLs

`@lhci/cli` audits the **prerendered public pages** (the indexable set produced
by `scripts/prerender.mjs` and listed in `sitemap.xml`: home, `/s/:slug` salon
profiles, `/city/:slug` + `/services/:slug` discovery, and the legal/trust
pages) and fails on an accessibility-category regression. Configuration lives in
`frontend/lighthouserc.json`; it runs against the built `./dist` so the
audit sees real rendered HTML in a headless browser (contrast, names/roles, and
landmark checks that jsdom cannot perform).

```bash
# CI runs this after `npm run build --workspace @salon/web`:
npx @lhci/cli autorun --config=frontend/lighthouserc.json
```

Both gates are wired together in `.github/workflows/web-a11y.yml`.

## What automated checks do NOT cover (the honesty note)

> **Automated checks (axe, Lighthouse, `eslint-plugin-jsx-a11y`) are necessary
> but _not sufficient_. Passing them is a _floor_, not a certificate of WCAG 2.2
> AA conformance.** (R10.7)

Automated tooling reliably catches only a fraction of WCAG success criteria
(missing names/roles, some contrast issues, obvious structure problems). It
**cannot** judge whether alternative text is _meaningful_, whether the reading
and focus order make _sense_ in Farsi/RTL, whether announcements are _useful_,
or whether an interaction is actually operable with a real screen reader.

**Full WCAG 2.2 AA conformance for this product requires the following manual
work, which is explicitly out of scope for the automated CI gate and must be
scheduled as follow-up:**

- **Manual testing with assistive technologies, in RTL/Farsi:**
  - **VoiceOver** on iOS/Safari (the primary mobile customer surface),
  - **TalkBack** on Android/Chrome,
  - **NVDA** on Windows (with Firefox/Chrome),
  - exercised against the real Persian content and right-to-left layout — not an
    English/LTR proxy. Verify names, roles, states, reading order, live-region
    announcements (OTP sent, payment result, slot-load errors), and that
    directional cues make sense when mirrored.
- **Keyboard-only runs:** complete every flow (auth/OTP, the full booking
  funnel, admin calendar/config/analytics) using only the keyboard — logical RTL
  tab order, a visible focus ring at every stop, no keyboard traps, dialogs/
  sheets that trap focus and restore it to the trigger on close, and Esc to
  dismiss.
- **Expert accessibility review:** a manual audit by someone with accessibility
  expertise against the WCAG 2.2 AA success criteria, including the judgement
  calls (alt-text quality, content order, error-recovery guidance, motion and
  `prefers-reduced-motion`, target spacing) that no tool can make.

Treat a green CI run as evidence that the **floor** is intact, then perform the
manual passes above before making any external claim of AA conformance.

## Running the checks locally

```bash
# axe-backed component/page suites:
npm run test --workspace @salon/web

# Lighthouse accessibility gate against the prerendered public pages:
npm run build --workspace @salon/web
npx @lhci/cli autorun --config=frontend/lighthouserc.json
```
