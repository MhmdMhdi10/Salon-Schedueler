# Implementation Plan — Signature UI System

## Overview

Incremental, test-anchored plan to layer the salon-luxe signature identity onto the existing
tokenized RTL system. Work lands in dependency order: the palette ships first through its three
sources of truth (gated by the existing AA contrast test), the WCAG math is extracted so tenant
theming can reuse it, then foundations (display type, brand motif, layout primitives), then the
**backend-persisted** per-tenant theming path, then the surface redesigns, and finally the
quality gates and governance.

Per-tenant persistence uses the **additive backend `Salon.brandAccent` column** (design §4
recommended path), not the client-only fallback.

### Environment / verification (this repo runs in Docker; `node_modules` are container volumes)

- Web typecheck: `docker compose exec -T -w /app/packages/web web npx tsc -p tsconfig.json --noEmit`
- Web tests: `docker compose exec -T -w /app/packages/web web npx vitest run <files>`
- Shared typecheck: `docker compose exec -T -w /app/packages/shared backend npx tsc -p tsconfig.json --noEmit`
- Shared tests: `docker compose exec -T -w /app/packages/shared backend npx jest`
- Backend typecheck: `docker compose exec -T -w /app/packages/backend backend npx tsc -p tsconfig.json --noEmit`
- Backend tests: `docker compose exec -T -w /app/packages/backend backend npx jest`
- Prisma client regen runs inside the backend container; schema changes to the live dev DB also
  need the idempotent `docker/db/dev-constraints.sql` ALTER; the backend dev container
  auto-recompiles via tsc-watch.

### Known pre-existing failing tests — NOT gates (do not rely on, do not claim to fix)

- web: `SubscriptionPage.test.tsx`, `AuthPage.pbt.test.tsx` (slow/timeout)
- backend: `db-constraints.test.ts` (`::appt_status` cast), `e2e-happy-path.test.ts` (QR base
  mismatch), `booking-race.real-db.property.test.ts` (Postgres deadlock)

---

## Tasks

- [x] 1. Ship the signature palette across the three sources of truth (gated)
  - [x] 1.1 Replace `lightColors` and `darkColors` values in `packages/shared/src/tokens/index.ts`
    - Set every `ColorPalette` role to the salon-luxe hex values from design §1 (light + dark
      tables); keep the existing role keys and `ColorPalette` interface unchanged
    - This file is the AA gate's source of truth — edit it FIRST so `contrast.test.ts` re-runs
      against the new values
    - Verify: shared typecheck passes; then run the web AA gate in 1.2 before mirroring
    - _Requirements: 1.1, 1.5, 1.6, 2.1_
  - [x] 1.2 Re-run the existing AA contrast gate against the new palette
    - Run `web npx vitest run src/styles/contrast.test.ts` — every light + dark pairing must
      clear its threshold (4.5:1 body, 3:1 non-text). If any fails, adjust the hex in 1.1 (the
      values in design §1 are pre-verified) until green
    - **Property 1: Default palette meets AA everywhere it is used**
    - _Requirements: 1.5_
  - [x] 1.3 Mirror the palette byte-identically into `packages/web/src/styles/tokens.css`
    - Update `:root` (light) and `[data-theme="dark"]` (dark) `--color-*` values to the exact
      hex from 1.1; leave shadow, spacing, radius, z-index, and motion tokens untouched
    - Verify: web typecheck passes; spot-check a few components render re-tinted (no JSX churn)
    - _Requirements: 1.1, 1.5, 1.6_
  - [x] 1.4 Update the color table in `.kiro/steering/ui-ux-skills.md` to match the shipped tokens
    - Replace the light/dark color-table hex and the "brand indigo `#6366f1`" seed note so the
      steering file and the tokens agree (steering wins on disagreement)
    - Verify: table values equal `tokens.css` / shared exactly
    - _Requirements: 1.1, 10.1_

- [x] 2. Extract the WCAG contrast math into a shared module
  - [x] 2.1 Create `packages/web/src/styles/contrast.ts` with the relative-luminance + ratio math
    - Move `channelToLinear` / `relativeLuminance` / `contrastRatio` out of `contrast.test.ts`
      and export them; add `onAccentForeground(fill)` (returns `#FFFFFF` or a supplied ink,
      whichever clears AA) and `ensureAaFill(hex)` (deterministically darkens until white text
      clears 4.5:1)
    - Re-import `contrastRatio` into `contrast.test.ts` so there is a single implementation
    - Verify: `web npx vitest run src/styles/contrast.test.ts` stays green; web typecheck passes
    - _Requirements: 4.3, 9.5_
  - [x] 2.2 Unit-test the contrast helpers
    - Cover known pairs (black/white = 21:1, identical = 1:1) and that `ensureAaFill` output
      always clears 4.5:1 with white text
    - _Requirements: 4.3_

- [x] 3. Add signature display-type tokens and Tailwind utilities
  - [x] 3.1 Add display tokens to `tokens.css` and `packages/shared/src/tokens/index.ts`
    - Add `--font-weight-body` (400), `--font-weight-display` (800), `--line-height-display`
      (1.15), `--tracking-display` (-0.01em) in `tokens.css`; add matching numeric tokens to the
      shared tokens object so the relationship is machine-checkable
    - _Requirements: 1.2, 8.1_
  - [x] 3.2 Surface a `text-display` treatment through `packages/web/tailwind.config.js`
    - Map the display tokens to a composable utility/helper applying weight + line-height +
      tracking; consumed later by hero/section titles
    - Verify: web typecheck + build resolve the utility
    - _Requirements: 1.2, 8.1_

- [x] 4. Add the reusable brand motif
  - [x] 4.1 Create `packages/web/src/components/brand/Motif.tsx` and `components/brand/index.ts`
    - Token-driven SVG "petal arc" with `mark | band | watermark` variants; fills derive from
      `var(--color-primary)`/`var(--color-accent)` (and `currentColor`) so it re-tints per theme
      and per tenant; `aria-hidden` by default; `className` sizes only
    - _Requirements: 1.3, 2.5_
  - [x] 4.2 Unit-test the motif render
    - Assert each variant renders an SVG, is `aria-hidden`, and carries no hard-coded color hex
    - _Requirements: 1.3_

- [x] 5. Add editorial layout primitives
  - [x] 5.1 Create `EditorialSplit`, `FeatureMosaic`, and `SectionRhythm` in `components/layout`
    - Thin grid wrappers using logical properties only: `EditorialSplit` (asymmetric 2-col,
      collapses under `md`), `FeatureMosaic` (uneven lead + supporting tiles), `SectionRhythm`
      (alternates `--color-bg`/`--color-surface` and density); export via `components/layout/index.ts`
    - _Requirements: 1.4, 2.2, 3.4_
  - [x] 5.2 Unit-test the primitives
    - Assert asymmetric columns / uneven mosaic structure and alternating section backgrounds;
      no physical `left`/`right` in authored class output
    - _Requirements: 1.4, 2.2, 3.4_

- [x] 6. Checkpoint — foundations green
  - Ensure all tests pass (`contrast.test.ts`, new unit suites) and web + shared typecheck;
    ask the user if questions arise.

- [x] 7. Backend: additive `Salon.brandAccent` persistence (read + write)
  - [x] 7.1 Add the nullable `brandAccent` column to the Prisma `Salon` model
    - In `packages/backend/prisma/schema.prisma` add `brandAccent String? @map("brand_accent")`
      (no default; null = signature default), mirroring how `autoApprove` was added
    - Verify: backend typecheck passes after Prisma client regen inside the backend container
    - _Requirements: 4.1_
  - [x] 7.2 Create migration `prisma/migrations/00000000000006_brand_accent/migration.sql`
    - `ALTER TABLE "salon" ADD COLUMN IF NOT EXISTS "brand_accent" TEXT;`
    - _Requirements: 4.1_
  - [x] 7.3 Mirror the column into `docker/db/dev-constraints.sql` (idempotent)
    - Add `ALTER TABLE salon ADD COLUMN IF NOT EXISTS brand_accent text;` next to the existing
      `auto_approve` ALTER so a running dev DB picks it up
    - Verify: re-running the script is a no-op on an already-migrated DB
    - _Requirements: 4.1_
  - [x] 7.4 Read the accent on the public salon resolve in `salon.routes.ts`
    - Extend `GET /salons/by-qr/:payload` to include `brandAccent` additively, and/or add
      `GET /salons/:id/brand` returning `{ brandAccent, displayName?, logoUrl? }`; surface the
      value through `packages/backend/src/registration/salon-registration.ts` so anonymous
      visitors receive it
    - Verify: response shape is additive (existing `{ salon: { id, name } }` unchanged)
    - _Requirements: 4.1, 4.2_
  - [x] 7.5 Write the accent via `POST /salons/:id/brand-accent` in `admin.routes.ts`
    - Guard with `requireRole('configure_salon')`, body `{ brandAccent: string | null }`,
      respond `{ ok: true, brandAccent }` — a direct analogue of the `/salons/:id/auto-approve`
      handler; persist through the salon registration/config service
    - Verify: a non-`configure_salon` principal gets 403 with no state change
    - _Requirements: 4.1_
  - [x] 7.6 Property test: Brand_Accent persists across sessions
    - Set then re-read the accent (against the client store or mocked salon service) and assert
      the same key returns
    - **Property 4: Brand_Accent selection persists across sessions**
    - _Requirements: 4.1_
  - [x] 7.7 Unit-test the write-route RBAC guard
    - `configure_salon` succeeds; other roles 403; `null` clears to signature default
    - _Requirements: 4.1_

- [x] 8. Client API surface for the accent
  - [x] 8.1 Add `brandAccentApi` to `packages/web/src/api/client.ts`
    - `get(salonId)` (read) and `set(salonId, key|null)` (write to `POST /salons/:id/brand-accent`),
      modeled on `approvalPolicyApi`; additive types only
    - Verify: web typecheck passes
    - _Requirements: 4.1, 4.7_

- [x] 9. Tenant theming engine (scoped runtime overrides)
  - [x] 9.1 Create `packages/web/src/components/theme/tenantTokens.ts`
    - `deriveTenantTokens(AccentTheme)` returns the `--color-primary` (`ensureAaFill(from)`),
      `--color-primary-contrast` (`onAccentForeground`), `--color-accent` (`to`), and
      `--color-focus-ring` override map; import the WCAG math from `styles/contrast.ts` and the
      `AccentTheme`/`resolveAccent` from `pages/owner/marketing-assets.ts`
    - _Requirements: 4.3, 4.7_
  - [x] 9.2 Create `packages/web/src/components/theme/TenantTheme.tsx`
    - Scoped wrapper writing the override map as inline CSS custom properties on a
      `data-tenant-theme` element; nullish/invalid `accentKey` applies no overrides (inherits the
      signature default via `resolveAccent` fallback); overrides only the four accent variables so
      `--color-bg`/`--color-surface`/`--color-text` still resolve from `:root` vs `[data-theme]`
    - Verify: web typecheck passes
    - _Requirements: 4.2, 4.4, 4.7, 4.8_
  - [x] 9.3 Create `packages/web/src/styles/tenant-contrast.test.ts`
    - For every accent in `ACCENTS`, assert the derived `--color-primary` / `--color-primary-contrast`
      pair clears 4.5:1 (and non-text uses clear 3:1)
    - **Property 5: Derived on-accent foreground meets AA**
    - _Requirements: 4.3_
  - [x] 9.4 Property test: accent override is scoped and leaves the global theme unchanged
    - Render `TenantTheme`; assert overrides live only on the wrapper element, document-root
      tokens are unchanged, and children reference tokens only
    - **Property 6: Accent override is scoped and leaves the global theme unchanged**
    - _Requirements: 4.2, 4.7_
  - [x] 9.5 Property test: accent resolution is total and falls back safely
    - For any key (absent, unknown, malformed), the wrapper resolves to a usable theme (signature
      default when invalid) and never renders unstyled or retries
    - **Property 7: Accent resolution is total and falls back safely**
    - _Requirements: 4.4_
  - [x] 9.6 Property test: active accent preserves theme switching + reduced motion
    - Toggle light/dark under an active accent and assert surface tokens still update and the
      wrapper adds no motion
    - **Property 10: An active accent preserves theme switching and reduced-motion**
    - _Requirements: 4.8_
  - [x] 9.7 Unit-test `deriveTenantTokens`
    - Assert the four-variable override map shape and that derived values match `ensureAaFill` /
      `onAccentForeground`
    - **Property 5: Derived on-accent foreground meets AA**
    - _Requirements: 4.3_

- [x] 10. Apply tenant theming + brand mark around the storefront
  - [x] 10.1 Add optional `brandAccent?: string` to `SalonProfile` in `packages/web/src/data/salons.ts`
    - Carry the accent on prerendered `/s/:slug` profiles without a DB round-trip; populate the
      seeded `salon-rose` entry
    - _Requirements: 4.1, 4.2_
  - [x] 10.2 Wrap the storefront subtrees in `TenantTheme`
    - Wrap `SalonProfilePage` content with the profile's `brandAccent`; wrap the funnel subtree so
      `FunnelShell`-hosted pages inherit the salon's resolved accent (from `brandAccentApi.get` /
      the resolve response); leave non-storefront routes on the global theme
    - Verify: a tinted storefront and an untinted marketing route render side-by-side correctly
    - _Requirements: 4.2, 4.7, 4.8_
  - [x] 10.3 Render the salon as the primary brand mark
    - In `FunnelShell` (salon-name slot) and `SalonProfilePage` `<h1>`, use `displayName ?? name`
      with the logo via `Avatar` when present, and demote the platform identifier («رزرو سالن»)
      to a subordinate byline; pass `displayName`/`logoUrl` through from the resolve data
    - _Requirements: 4.5_
  - [x] 10.4 Add the owner Brand_Accent picker UI
    - In the owner configuration surface, let the Owner choose a `Brand_Accent` from `ACCENTS`
      with a live `TenantTheme` preview, persisting via `brandAccentApi.set`; reuse existing
      Component_Library inputs (tokens only)
    - Verify: selecting then reloading shows the persisted accent (depends on task 7)
    - _Requirements: 4.1_
  - [x] 10.5 Derive the PWA install identity from the accent in `packages/web/src/pwa/salonManifest.ts`
    - Add `themeColor?: string` to `SalonManifestOptions`; replace the hard-coded
      `theme_color: '#6366f1'` with the accent-derived color when present (else signature
      `--color-primary`); keep `start_url` scoped to the storefront booking path
    - _Requirements: 4.6_
  - [x] 10.6 Property test: brand mark uses the salon's display identity
    - For any salon, assert the brand-mark text equals `displayName ?? name` and the platform
      identifier is subordinate
    - **Property 8: Brand mark uses the salon's display identity**
    - _Requirements: 4.5_
  - [x] 10.7 Property test: PWA install identity derives from the accent and scopes to the storefront
    - For any salon with an accent, assert the applied manifest `theme_color` is accent-derived and
      `start_url` is that salon's storefront path (extend `src/pwa/__tests__/salonManifest.test.ts`)
    - **Property 9: PWA install identity derives from the accent and scopes to the storefront**
    - _Requirements: 4.6_

- [x] 11. Checkpoint — tenant theming green
  - Ensure tenant-theming suites, `contrast.test.ts`, web typecheck, and backend typecheck pass;
    ask the user if questions arise.

- [x] 12. Redesign the marketing surfaces
  - [x] 12.1 Rebuild the `MarketingHome` (`/`) hero and value sections
    - In `packages/web/src/pages/MarketingHome.tsx`: hero via `EditorialSplit` with a token
      background (no indigo→purple gradient) + `Motif variant="band"` + a single most-prominent
      primary CTA; value props via `FeatureMosaic` (not equal cards); wrap sections in
      `SectionRhythm`; apply display tokens to titles; preserve the existing `Picture` LCP image,
      `SeoHead index`, and `JsonLd` exactly; keep CTA → `/s/salon-rose` firing on activation with
      no interstitial; trust block shows only real on-page proof; copy from `i18n/fa.json` `home.*`
    - _Requirements: 1.4, 2.1, 2.2, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.1, 8.6_
  - [x] 12.2 Rebuild the `BusinessLanding` (`/business`) hero and value sections
    - Same treatment in `packages/web/src/pages/BusinessLanding.tsx` (EditorialSplit/FeatureMosaic/
      SectionRhythm + motif + display titles); business CTA → `/owner` with no interstitial;
      preserve `SeoHead`/`JsonLd`/`Picture`; copy from `business.*`
    - _Requirements: 1.4, 2.1, 2.2, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.1, 8.6_
  - [x] 12.3 Add `home.*` / `business.*` Persian copy keys to `packages/web/src/i18n/fa.json`
    - Real, benefit-led, ROI-oriented Persian copy (no lorem); keys grouped by domain
    - _Requirements: 2.4, 3.2, 3.3_
  - [x] 12.4 Property test: marketing routes are indexable with unique metadata
    - For `/` and `/business`, assert indexable + unique non-empty title, meta description,
      canonical, and Open Graph tags (extend `src/pages/__tests__/*`)
    - **Property 21: Marketing routes are indexable with unique metadata**
    - _Requirements: 3.5_
  - [x] 12.5 Unit-test hero CTA prominence and routing
    - Single most-prominent primary CTA; activating it routes to the sign-up/onboarding entry with
      no interstitial
    - _Requirements: 3.1, 3.6_

- [x] 13. Elevate the owner dashboard (calendar + analytics)
  - [x] 13.1 Calendar day/week grid in `packages/web/src/pages/admin/CalendarPage.tsx`
    - Legible time/resource grid with day + week views; numbers via `<Num>` with `tabular-nums`
      on a consistent baseline; keyboard view-switch, date-nav, and cell focus with RTL-correct
      arrow keys (ArrowRight = inline-start); skeleton matching the grid while loading
    - _Requirements: 5.1, 5.3, 5.4_
  - [x] 13.2 Analytics non-color-only encoding in `AnalyticsPage.tsx` + `AnalyticsChart.tsx`
    - Pair every bar/metric with a text value + label; keep the accessible busiest-windows table
      equivalent and KPI text labels; bar fill inherits the signature primary
    - _Requirements: 5.2_
  - [x] 13.3 Standardize the owner data-state lifecycle across calendar + analytics
    - `Skeleton` (layout-matched) while `loading`/`idle` → `EmptyState` only when settled with no
      data → `ErrorState` (Persian cause + retry, no stack/HTTP) on error, including after a prior
      successful load; reuse existing primitives
    - _Requirements: 5.4, 5.5, 5.6_
  - [x] 13.4 Property test: data-surface lifecycle shows skeleton then the resolved state
    - For any async lifecycle, assert skeleton while pending/undetermined, empty only after settle
      with no data, and skeleton replaced by populated/empty/error (extend `CalendarPage.test.tsx`/
      `AnalyticsPage.test.tsx`)
    - **Property 11: Data-surface lifecycle shows skeleton then the resolved state**
    - _Requirements: 5.4, 5.5, 7.1_
  - [x] 13.5 Property test: error states are safe and recoverable
    - For any failed request, assert a Persian cause + retry and no raw stack/HTTP code, even after
      a prior load
    - **Property 12: Error states are safe and recoverable**
    - _Requirements: 5.6, 7.3_
  - [x] 13.6 Property test: every metric has a non-color-only equivalent
    - For any rendered metric, assert a labeled text/table equivalent accompanies the visualization
    - **Property 13: Every metric has a non-color-only equivalent**
    - _Requirements: 5.2_
  - [x] 13.7 Unit-test RTL keyboard navigation
    - Arrow-key direction correct under RTL for view-switch/date-nav/cell focus
    - _Requirements: 5.3_

- [x] 14. Motion, component states, and typography/numerics polish
  - [x] 14.1 Apply signature micro-interactions through motion tokens
    - Drive durations/easings from `--dur-*`/`--ease-*` (Tailwind `duration-*`/`ease-*`); animate
      `transform`/`opacity` only; reserve `--ease-emphasized` for the booking-success moment in
      `packages/web/src/pages/BookingSuccessPage.tsx`; keep the `prefers-reduced-motion` block in
      `tokens.css` authoritative (opacity-only fallbacks, never gate action completion)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 14.2 Ensure all six interactive states render with signature tokens
    - Verify `Button`/`Card`/`Skeleton`/`EmptyState`/`ErrorState`/`Toast` re-tint via the new
      palette; extend the skeleton→empty/error→populated discipline to any surface missing it;
      keep `Toast` (ARIA live region) as the explicit success confirmation
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 14.3 Apply display + tabular typography and reading measure
    - Display tokens on hero/section titles; `tabular-nums` wherever `<Num>`/`<Money>` render;
      `max-inline-size: 70ch` on long body copy; keep Latin entry + submit-time normalization for
      phone/OTP inputs; keep `<bdi>`/`DirText` bidi isolation and `<JalaliDate>` usage
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
  - [x] 14.4 Property test: interactive elements define all six states
    - For any interactive Component_Library element, assert default/hover/focus-visible/active/
      disabled/loading are each defined and signature-tokened (extend Button tests)
    - **Property 17: Interactive elements define all six states**
    - _Requirements: 7.4_
  - [x] 14.5 Property test: numeric display is Persian and tabular
    - For all user-facing numerics, assert Persian digits + tabular figures (extend Num/Money tests)
    - **Property 14: Numeric display is Persian and tabular**
    - _Requirements: 5.1, 8.3_
  - [x] 14.6 Property test: digit display/normalization round-trips
    - For any integer, assert `normalize(format(x)) === x`, output has no ASCII digits, inputs keep
      Latin entry
    - **Property 15: Digit display/normalization round-trips**
    - _Requirements: 8.2_
  - [x] 14.7 Property test: Jalali date conversion round-trips
    - For any valid date, assert ISO → Jalali → ISO is identity (extend JalaliDate tests)
    - **Property 16: Jalali date conversion round-trips**
    - _Requirements: 8.5_
  - [x] 14.8 Property test: motion stays within the token band and reserves emphasized easing
    - For any authored animation, assert duration ∈ 150–300ms band and emphasized easing only on
      the booking-success surface
    - **Property 18: Motion stays within the token band and reserves emphasized easing**
    - _Requirements: 6.4_
  - [x] 14.9 Unit-test success + reduced-motion + bidi
    - Success toast via live region (R7.5); reduced-motion drops transforms/keeps opacity (R6.3);
      `<bdi>` isolates mixed runs (R8.4)
    - _Requirements: 6.3, 7.5, 8.4_

- [x] 15. Checkpoint — surfaces green
  - Ensure marketing, owner-dashboard, motion/state/typography suites, `contrast.test.ts`, and web
    typecheck pass; ask the user if questions arise.

- [x] 16. Quality gates: token completeness + distinctiveness guardrail
  - [x] 16.1 Create `packages/web/src/styles/tokens-complete.test.ts`
    - Assert both `lightColors` and `darkColors` define a non-empty value for every `ColorPalette`
      role, and that display weight > body weight AND display line-height < body line-height
    - **Property 2: Token completeness across both themes**
    - **Property 3: Display type is always distinct from body type**
    - _Requirements: 1.1, 1.2, 1.6, 8.1_
  - [x] 16.2 Create `packages/web/src/styles/distinctiveness.test.ts`
    - Scan authored `src/**/*.{ts,tsx,css}` (exclude `*.test.*`, `tokens.css`, `components/three`,
      `pages/owner/marketing-assets.ts`, generated assets; allow `// distinctiveness-ok:` opt-out
      and `rtl:`/logical utilities); flag indigo→purple gradient literals, physical `left`/`right`
      flow spacing, raw hex/px/ms in authored styles, and Component_Library usage that omits
      signature tokens; report each violation with file path + rule
    - **Property 19: The distinctiveness guardrail flags generic regressions**
    - **Property 20: Guardrail violations are reported with file and rule**
    - _Requirements: 2.1, 2.3, 6.1, 6.2, 9.5, 11.3, 11.4_
  - [x] 16.3 Resolve any real violations surfaced by 16.1 / 16.2
    - Fix legitimate flags (replace literals with tokens, physical with logical properties) or add a
      justified `// distinctiveness-ok:` opt-out; do not weaken the rules to pass
    - Verify: `web npx vitest run src/styles/tokens-complete.test.ts src/styles/distinctiveness.test.ts`
      is green; confirm public routes keep code-split boundaries (no admin/chart/Jalali on `/`,
      `/business`, `/s/:slug`) via `scripts/analyze-bundle.mjs`
    - _Requirements: 9.2, 9.5, 9.6, 11.3_

- [x] 17. Governance and documentation
  - [x] 17.1 Add the "Signature Design Language" section to `.kiro/steering/ui-ux-skills.md`
    - Document the salon-luxe palette (light + dark), display/body type pairing, the `Motif`
      device and its recurrence, the editorial layout primitives, and the anti-generic constraints;
      state explicitly that automated checks are a floor and full WCAG 2.2 AA needs manual AT
      testing + expert review
    - _Requirements: 9.3, 10.1_
  - [x] 17.2 Add `.kiro/steering/signature-design-language.md`
    - `inclusion: fileMatch`, `fileMatchPattern: 'packages/web/src/**/*.{ts,tsx,css}'`; capture the
      enforceable rules (salon-luxe tokens only; no indigo→purple hero gradient; FeatureMosaic/
      EditorialSplit for 3+ peer features; display tokens for titles; motif on brand surfaces;
      tokens-only + logical properties; tenant accent via runtime vars)
    - _Requirements: 10.2_
  - [x] 17.3 Add the two advisory hooks under `.kiro/hooks/`
    - `post-file-save-web-a11y.kiro.hook` (PostFileSave, matcher `packages/web/.*\.(ts|tsx|css)$`,
      runs contrast + tenant-contrast + distinctiveness suites, `blocking: false`) and
      `pre-tool-use-design-reminder.kiro.hook` (PreToolUse on `fs_write|str_replace`, advisory
      reminder, `blocking: false`); neither blocks a save nor mutates file contents
    - _Requirements: 10.3, 10.4, 10.5_
  - [x] 17.4 Add `packages/web/docs/distinctiveness-checklist.md`
    - Per-screen review checklist verifying at minimum: signature palette in use, non-default
      (editorial/asymmetric) layout, branded motion, bespoke empty/loading/error states, brand
      motif present, and Persian display typography; documented so a reviewer applies it before a
      screen is "done"
    - _Requirements: 11.1, 11.2_

- [x] 18. Final checkpoint — full gate
  - Run the web suite (excluding the known pre-existing failures), web + shared + backend typecheck,
    and confirm `contrast.test.ts`, `tenant-contrast.test.ts`, `tokens-complete.test.ts`, and
    `distinctiveness.test.ts` are green; ask the user if questions arise.

## Notes

- Sub-tasks marked `*` are optional (property/unit tests) and may be skipped for a faster MVP; all
  non-`*` sub-tasks are core implementation.
- Ordering is dependency-driven: palette (three sources of truth, gated by `contrast.test.ts`) →
  shared WCAG math → foundations → backend `Salon.brandAccent` persistence → theming engine →
  storefront application → surface redesigns → quality gates → governance.
- Requirements coverage: R1 (1, 3, 16.1), R2 (5, 12, 16.2), R3 (12), R4 (7–10), R5 (13), R6 (14.1),
  R7 (14.2), R8 (3, 14.3), R9 (16, plus preserved Lighthouse/bundle gates), R10 (17.1–17.3),
  R11 (16.2, 17.4).
- Property coverage: Properties 1–21 are each validated by a sub-task (1.2, 16.1, 16.1, 7.6, 9.3/9.7,
  9.4, 9.5, 10.6, 10.7, 9.6, 13.4, 13.5, 13.6, 14.5, 14.6, 14.7, 14.4, 14.8, 16.2, 16.2, 12.4).
- Verification uses the Docker commands above; known pre-existing failing tests are not treated as
  gates.

---

This plan is ready for review. Once approved, execution can begin by opening `tasks.md` and
clicking "Start task" next to the first item (task 1) — tasks are ordered to build incrementally,
each independently buildable and verifiable.
