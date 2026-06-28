# Requirements Document — Signature UI System

## Introduction

This spec defines a **signature UI system** for the Salon Booking platform: a distinctive, premium, and unmistakably non-generic visual identity that elevates the existing, already-implemented design foundation. The product is a **B2B SaaS** platform — the paying customers are salon owners/businesses, and each salon's consumer booking funnel is effectively that salon's **storefront**. The platform is Persian (Farsi), right-to-left (RTL), default locale `fa`, built as a React 18 + Vite + `react-router-dom` v7 + `react-i18next` + `vite-plugin-pwa` web app under `packages/web`.

The goal is to make the UI **distinctive, premium, and clearly not "generic AI-generated"**, so it impresses and converts any business evaluating the product. This spec encodes well-established techniques for escaping the generic AI-UI look — a signature palette beyond the default indigo/purple gradient cliché, deliberate type pairing, editorial/asymmetric layout, a recurring brand motif, branded motion, bespoke component states, and per-tenant theming — as concrete, testable acceptance criteria.

The current foundation already provides a tokenized, RTL-first design system (`packages/web/src/styles/tokens.css`), an accessible token-driven component library (`packages/web/src/components/ui`), light/dark theming (`components/theme/ThemeProvider.tsx`), the redesigned funnel and public pages (`MarketingHome`, `BusinessLanding`, `SalonProfilePage`, the booking funnel, and the owner panel under `/owner/*`), and a curated brand-accent palette used in the owner QR studio (`ACCENTS` in `pages/owner/marketing-assets.ts`). This spec **builds on and elevates** that foundation — it does not replace it.

### Relationship to Existing Work and Governing Standards

This spec extends the already-implemented `ui-ux-redesign` spec (`.kiro/specs/ui-ux-redesign/`). The following two steering files are **non-negotiable baselines** that this spec must preserve and extend, not weaken:

- `.kiro/steering/ui-ux-skills.md` — tokens-only styling, RTL logical properties, WCAG 2.2 AA, all interactive and data states, purposeful motion, Persian-first typography.
- `.kiro/steering/seo-skills.md` — indexable public pages versus `noindex` app routes, structured data, rendering strategy, Core Web Vitals budgets.

Where this document and a steering file disagree, the steering file wins and this document is updated to match.

### Non-Goals / Out of Scope

- No changes to backend domain logic, the scheduling engine, the database schema, or any API contract in `packages/backend`; presentation code may adapt API responses for display only.
- No removal of the existing token system, component library, theming, or funnel redesign — this spec layers a signature identity on top of them.
- No new product features beyond what is needed to express the signature identity and per-tenant theming.
- Full WCAG 2.2 AA certification: automated checks are in scope as a floor; manual assistive-technology testing and expert audit are required follow-ups, not delivered here.

## Glossary

- **Storefront**: the customer-facing public surface of a single salon — its public profile (`/s/:slug`, `SalonProfilePage`) together with that salon's booking funnel (`/qr/:payload`, `/salon/:salonId/book`, `/salon/:salonId/book/confirm`, `/booking/success`).
- **Design_Token_System**: the CSS custom-property token layer defined in `packages/web/src/styles/tokens.css` (color, typography, spacing, radius, elevation, z-index, and motion tokens for light and dark themes).
- **Signature_Design_Language**: the distinctive visual-identity layer (signature palette, type pairing, brand motif, layout rhythm, anti-generic constraints) expressed on top of the Design_Token_System.
- **Component_Library**: the token-driven UI components in `packages/web/src/components/ui` (Button, Card, Select, Switch, RadioGroup, SlotGrid, JalaliDatePicker, Toast, Badge, EmptyState, ErrorState, Skeleton, and others).
- **Marketing_Surface**: the owner-acquisition public pages `MarketingHome` (`/`) and `BusinessLanding` (`/business`).
- **Owner_Dashboard**: the owner panel pages served under `/owner/*` — calendar (`OwnerCalendarPage`), analytics (`OwnerAnalyticsPage`, `AnalyticsChart`), configuration (`OwnerConfigurationPage`), subscription, and the QR studio.
- **Tenant_Theming_System**: the mechanism that applies a per-salon Brand_Accent and brand identity to that salon's Storefront and its installed PWA instance.
- **Brand_Accent**: a salon's chosen brand color theme, seeded from the curated accent palette (`ACCENTS`, `AccentTheme`, `accentVars` in `packages/web/src/pages/owner/marketing-assets.ts`).
- **Motion_System**: the tokenized animation and micro-interaction layer built on the `--dur-*` and `--ease-*` motion tokens.
- **Typography_System**: the Persian-first type, numeral, and Jalali-date rendering layer (Vazirmatn, display treatment, tabular numerals, bidi isolation).
- **Quality_Gate**: the automated checks under `packages/web` and `.github/workflows` (token-contrast test `styles/contrast.test.ts`, axe accessibility checks, Core Web Vitals / Lighthouse budgets, bundle budgets, the `web-a11y.yml` workflow).
- **Design_Governance**: the steering files in `.kiro/steering/` and the agent hooks in `.kiro/hooks/`.
- **Owner**: the salon business operator — the paying B2B customer.
- **Customer**: the end consumer who books an appointment through a Storefront.

## Requirements

### Requirement 1: Signature Visual Identity and Design Language

**User Story:** As an Owner evaluating the platform, I want a distinctive, premium visual identity, so that the product feels like a crafted brand rather than a generic template and I trust it with my business.

#### Acceptance Criteria

1. THE Design_Token_System SHALL define a signature brand palette — a signature primary brand hue, a complementary signature accent, and a multi-step neutral ramp — as the default light-theme and dark-theme token values, while preserving the existing semantic token names (for example `--color-primary`, `--color-accent`, `--color-surface`, `--color-text`) so existing Component_Library code consumes the new identity without interface changes.
2. THE Signature_Design_Language SHALL define a deliberate type pairing in which heading/display text uses a treatment visually distinct from the Vazirmatn body text in all cases (for example a heavier display weight and tighter display line height), expressed as typography tokens, with no exception that permits heading/display text to render visually uniform with body text.
3. THE Signature_Design_Language SHALL define one recurring brand motif (a reusable visual device such as a signature shape, pattern, or graphic element) and SHALL make the motif available as a shared component or token-driven style for reuse across surfaces.
4. WHERE a surface presents primary brand or hero content, THE Signature_Design_Language SHALL compose that content using an editorial, asymmetric, or off-grid layout rather than a single centered column of equal blocks.
5. WHEN the signature primary brand color is used behind text, THE Design_Token_System SHALL provide a `--color-primary` / `--color-primary-contrast` pairing whose contrast ratio is at least 4.5:1 for body-size text.
6. THE Signature_Design_Language SHALL define every signature token in both the light theme and the dark theme so the identity is complete in each.

### Requirement 2: Anti-Generic Design Constraints

**User Story:** As an Owner, I want the product to avoid the tell-tale signs of generic auto-generated interfaces, so that it looks bespoke and credible.

#### Acceptance Criteria

1. THE Marketing_Surface and Storefront hero sections SHALL derive their backgrounds from the signature palette tokens, and SHALL NOT use a default indigo-to-purple linear gradient as the primary hero background.
2. WHERE a surface presents three or more peer features, THE Marketing_Surface SHALL compose them using at least one layout treatment other than a single row of equal-width, centered icon-over-title-over-text cards.
3. WHEN a Component_Library element is rendered on a surface, THE Signature_Design_Language SHALL always apply signature tokens (accent, radius, elevation, and type) so the element does not render with unmodified library-default styling, and SHALL NOT provide a graceful-degradation path that renders the element unstyled or with library-default styling.
4. THE user-facing content SHALL use real, domain-specific Persian copy sourced from the `react-i18next` catalog, and SHALL NOT ship placeholder or lorem-style filler text.
5. WHEN a content section relies on visuals, THE Signature_Design_Language SHALL include at least one domain-specific visual (salon imagery or the brand motif) rather than relying solely on a row of generic monochrome icons.

### Requirement 3: B2B First Impression and Conversion

**User Story:** As an Owner deciding whether to adopt the platform, I want marketing surfaces that prove value and credibility, so that I am confident enough to sign up.

#### Acceptance Criteria

1. WHEN the Marketing_Surface (`MarketingHome` at `/`, `BusinessLanding` at `/business`) renders, THE Marketing_Surface SHALL present a distinctive hero in which a single primary call-to-action is the most visually prominent element.
2. THE Marketing_Surface SHALL present value- and ROI-oriented messaging directed at salon businesses (for example reduced no-shows, time saved, increased online bookings) using concrete, benefit-led Persian copy.
3. THE Marketing_Surface SHALL present trust signals (for example real metrics, testimonials, or feature proof), and SHALL display only proof content that corresponds to real information shown on the page.
4. THE Marketing_Surface SHALL vary section rhythm so that consecutive sections differ in layout, background, or density rather than repeating one uniform block.
5. WHEN the Marketing_Surface renders, THE web app SHALL mark `/` and `/business` indexable and SHALL provide a unique title, meta description, canonical URL, and Open Graph metadata for each, consistent with `.kiro/steering/seo-skills.md`.
6. WHEN an Owner activates the Marketing_Surface primary call-to-action, THE web app SHALL route the Owner directly to the sign-up/onboarding entry point (the `/auth` or owner onboarding path) with no intermediate UI between activation and arrival — no confirmation dialog, interstitial or landing detour, and no additional navigational step — and SHALL validate routing only when the call-to-action is activated rather than pre-validating before activation.

### Requirement 4: Per-Tenant (Per-Salon) Theming and Light White-Labeling

**User Story:** As an Owner, I want my salon's storefront to carry my own brand, so that customers experience my salon's identity rather than a generic platform shell.

#### Acceptance Criteria

1. THE Owner_Dashboard SHALL let an Owner select a Brand_Accent from the curated accent palette (seeded by `ACCENTS` in `pages/owner/marketing-assets.ts`) and SHALL persist the selected Brand_Accent for the salon across sessions.
2. WHEN a Storefront route renders for a salon that has a configured Brand_Accent, THE Tenant_Theming_System SHALL apply that Brand_Accent to the route's primary actions and brand surfaces through token overrides scoped to that route subtree, leaving the global default theme unchanged for other routes.
3. THE Tenant_Theming_System SHALL derive an on-accent foreground for each Brand_Accent such that text and icons rendered on the accent meet WCAG 2.2 AA contrast (at least 4.5:1 for body text and at least 3:1 for large text and non-text UI).
4. IF a salon has no configured Brand_Accent, THEN THE Tenant_Theming_System SHALL render the Storefront using the signature default palette. IF a configured Brand_Accent fails to apply for technical reasons, THEN THE Tenant_Theming_System SHALL fall back to the signature default palette, and SHALL NOT retry indefinitely or render the Storefront unstyled.
5. THE Storefront SHALL present the salon name as the primary brand mark on the public profile and booking funnel, using the salon's configured display name when one is present and otherwise falling back to the salon's stored name, SHALL show the salon logo as part of the primary brand mark when a logo is available, and SHALL show the platform identifier in a subordinate position.
6. WHEN a Customer installs the PWA from a salon Storefront, THE web app SHALL set the installed instance's `theme-color` to a value derived from that salon's Brand_Accent and SHALL scope the `start_url` to that salon's Storefront.
7. THE Tenant_Theming_System SHALL inject Brand_Accent values as runtime token values (CSS custom properties) rather than as authored color literals, so Component_Library code continues to reference tokens only.
8. WHILE a Brand_Accent is active on a Storefront, THE Tenant_Theming_System SHALL preserve light/dark theme switching and `prefers-reduced-motion` behavior.

### Requirement 5: Owner Dashboard Excellence (B2B Density)

**User Story:** As an Owner managing my salon, I want a premium, data-dense dashboard, so that I can read my calendar and analytics efficiently and act quickly.

#### Acceptance Criteria

1. WHEN the owner calendar (`OwnerCalendarPage`) renders appointment data, THE Owner_Dashboard SHALL present a day view and a week view with a legible time/resource grid, using tabular Persian numerals aligned on a consistent baseline.
2. WHEN the owner analytics (`OwnerAnalyticsPage`, `AnalyticsChart`) renders, THE Owner_Dashboard SHALL present each metric (for example utilization, revenue in Rial, busiest window) with a labeled data visualization and an accessible text or table equivalent, and SHALL NOT convey any metric by color alone.
3. THE Owner_Dashboard SHALL support keyboard operation for switching views, navigating dates, and moving focus across grid cells, with arrow-key direction correct under RTL.
4. WHILE a dashboard data surface is loading or while whether data exists is still being determined, THE Owner_Dashboard SHALL display a skeleton matching the final calendar, table, or chart layout rather than a centered spinner, and once the request resolves THE Owner_Dashboard SHALL replace the skeleton with the populated, empty, or error state.
5. WHEN it is known that a dashboard data surface has no data, THE Owner_Dashboard SHALL display a bespoke empty state that explains the absence and offers a specific next action, and SHALL NOT display the empty state before the absence of data is known.
6. IF a dashboard data request fails, THEN THE Owner_Dashboard SHALL display an error state that states the cause in Persian and offers a retry action, and SHALL NOT display a raw stack trace or HTTP status code; THE Owner_Dashboard MAY display this error state even after data has previously loaded (for example when a refresh request fails).

### Requirement 6: Signature Motion and Micro-Interactions

**User Story:** As a user, I want motion that feels branded and purposeful, so that the experience feels crafted without slowing me down or causing discomfort.

#### Acceptance Criteria

1. THE Motion_System SHALL express all animation durations and easing curves using the existing motion tokens (`--dur-fast`, `--dur-base`, `--dur-slow`, `--ease-standard`, `--ease-emphasized`), and SHALL NOT use raw millisecond or easing literals in authored styles.
2. WHEN an element animates, THE Motion_System SHALL animate only compositor-friendly properties (`transform`, `opacity`), and SHALL NOT animate properties that trigger layout reflow (for example `width`, `height`, `top`); this compositor-friendly-property constraint applies independently of, and in addition to, the duration/easing token requirement in 6.1, so both constraints hold for every animation.
3. WHILE the user has `prefers-reduced-motion: reduce` set, THE Motion_System SHALL remove non-essential transform and parallax motion, retain only essential opacity feedback, and SHALL NOT block completion of any action on an animation.
4. WHEN the Motion_System provides interactive feedback, THE feedback duration SHALL fall within the 150ms–300ms band defined by the duration tokens, and THE emphasized easing token SHALL be reserved for the booking-success confirmation moment.
5. THE Motion_System SHALL apply its signature micro-interactions through shared tokens and components (the primary call-to-action and the brand motif) so motion reads as consistent and branded across surfaces.

### Requirement 7: Bespoke Component States with Personality

**User Story:** As a user, I want empty, loading, error, and success states that feel designed and helpful, so that the product feels polished even when there is no data or something goes wrong.

#### Acceptance Criteria

1. WHEN a Component_Library data surface (for example `SlotGrid`, card lists, tables, charts) is loading, THE Component_Library SHALL render a skeleton whose shape matches the populated layout rather than a centered spinner.
2. WHEN a data surface is empty, THE Component_Library SHALL render an empty state (via `EmptyState` or an equivalent) that states the reason and presents a specific, action-oriented next step in Persian from the i18n catalog.
3. IF a data surface fails to load, THEN THE Component_Library SHALL render an error state (via `ErrorState` or an equivalent) that states the cause and presents a retry action, and SHALL NOT expose a raw stack trace or HTTP status code.
4. WHEN an interactive Component_Library element renders, THE element SHALL provide default, hover, focus-visible, active/pressed, disabled, and loading states, each styled with the Signature_Design_Language tokens so the element does not appear library-default, regardless of any overlapping or concurrent UI state (including when the element is partially obscured or rendered inside an error context).
5. WHEN an action succeeds, THE Component_Library SHALL provide an explicit success confirmation (for example a toast announced through an ARIA live region, or a success screen) rather than resolving silently.

### Requirement 8: Persian-First Distinctive Typography and Numerics

**User Story:** As an Iranian user, I want correct, distinctive Persian typography, numerals, and dates, so that the product feels native and premium and is never ambiguous.

#### Acceptance Criteria

1. THE Typography_System SHALL render text using the self-hosted Vazirmatn face and SHALL apply a distinct display treatment (heavier display weight and tighter display line height) for hero and section titles, differentiated from body text.
2. THE Typography_System SHALL render all user-facing displayed digits — including prices, dates, counts, timers, and technical identifiers such as order and reference numbers — as Persian/Eastern-Arabic numerals. WHERE an input field requires Latin entry (for example a phone field using `type=tel` or the OTP field), THE Typography_System SHALL keep Latin entry within that input field and normalize the entered value on submit, distinguishing displayed output from entered input, consistent with `.kiro/steering/ui-ux-skills.md`.
3. THE Typography_System SHALL use tabular numerals consistently for user-facing numeric values (for example prices, times, counts, and analytics figures), not only within aligned columns, so digits render with a consistent advance width everywhere.
4. WHERE text mixes Persian with Latin or numeric runs (for example URLs, phone numbers), THE Typography_System SHALL isolate the embedded run (using `<bdi>` or `unicode-bidi: isolate`) so ordering and punctuation remain correct.
5. THE Typography_System SHALL display user-facing dates using the Jalali (Shamsi) calendar with Persian month and weekday labels, converting to and from ISO only at the API boundary.
6. WHEN long Persian body text is rendered, THE Typography_System SHALL constrain the reading measure to approximately 70 characters (`max-inline-size: 70ch`) so text does not stretch full width on wide viewports.

### Requirement 9: Non-Negotiable Quality Gates

**User Story:** As the team, I want enforceable quality gates, so that the signature identity ships without regressing accessibility, performance, RTL correctness, or token discipline.

#### Acceptance Criteria

1. THE web UI SHALL target WCAG 2.2 Level AA across the redesigned signature surfaces and components.
2. WHEN the automated test suite runs, THE Quality_Gate SHALL execute an accessibility checker (axe) and the token-contrast check (`styles/contrast.test.ts`) against key components and pages, and SHALL fail the build on serious or critical violations detected during that suite execution; the build-failure scope is the automated suite run and does not extend to policing violations outside the suite.
3. THE documentation SHALL state explicitly that automated checks are a floor and that full WCAG 2.2 AA conformance requires manual testing with assistive technologies and expert accessibility review.
4. WHEN the public marketing and salon-profile routes are measured on a representative mid-range mobile profile, THE Quality_Gate SHALL hold these Core Web Vitals budgets: Largest Contentful Paint under 2.5s, Interaction to Next Paint under 200ms, and Cumulative Layout Shift under 0.1.
5. THE authored web component and style code SHALL express direction-dependent styling using CSS logical properties only (no physical `left`/`right` for flow-relative spacing) and SHALL reference Design_Token_System tokens for color, spacing, radius, elevation, z-index, and motion, with no raw hex, pixel, or millisecond literals, except for tenant-provided Brand_Accent color values injected as runtime data.
6. WHEN a public marketing or salon-profile route loads, THE Quality_Gate SHALL keep that route's initial JavaScript within the public-page budget (approximately 150KB gzip) and SHALL NOT load the owner/admin or heavy chart/Jalali bundles on that route.

### Requirement 10: Governance, Steering, and Design-Guardrail Hooks

**User Story:** As a developer on the team, I want the signature design language captured in steering and enforced by automation, so that future changes stay on-brand and do not regress to generic patterns.

#### Acceptance Criteria

1. THE steering file `.kiro/steering/ui-ux-skills.md` SHALL be updated to add a distinctive-design-language section that documents the signature palette, type pairing, brand motif, layout rhythm, and anti-generic constraints.
2. THE project SHALL add a new steering skill file under `.kiro/steering/` that captures the anti-generic design language as enforceable rules, with inclusion front-matter scoping it to the relevant web files.
3. WHEN a web component or style file matching `packages/web/**/*.{ts,tsx,css}` is saved, THE Design_Governance PostFileSave hook SHALL run the web contrast and accessibility tests against the changed surface.
4. WHEN a tool is about to write a web component or style file matching `packages/web/**/*.{ts,tsx,css}`, THE Design_Governance PreToolUse advisory hook SHALL surface the distinctive-design-language rules as a reminder before the write proceeds.
5. THE Design_Governance hooks SHALL be purely advisory in nature: THE hooks MAY run tests and surface reminders, and SHALL NOT block a save, and SHALL NOT delete or rewrite the developer's file contents.

### Requirement 11: Anti-Generic Distinctiveness Checklist and Automated Guardrails

**User Story:** As a reviewer, I want a per-screen distinctiveness checklist and automatable checks, so that every screen is verified against the signature standard and cannot quietly regress to generic patterns.

#### Acceptance Criteria

1. THE project SHALL define a per-screen distinctiveness review checklist that verifies, at minimum: signature palette in use, a non-default (editorial/asymmetric) layout, branded motion, bespoke empty/loading/error states, presence of the brand motif, and Persian display typography.
2. THE distinctiveness checklist SHALL be documented so a reviewer can apply it to each screen before that screen is considered done.
3. WHERE an automatable check exists, THE Quality_Gate SHALL flag regressions toward generic patterns, including raw indigo-to-purple gradient literals, physical `left`/`right` properties used for flow-relative spacing, raw hex/pixel/millisecond literals in authored styles, and Component_Library usage that omits signature tokens.
4. WHEN the distinctiveness guardrail check runs in the automated suite, THE Quality_Gate SHALL report each violating file and rule so the regression can be located and corrected.

---

> **Next steps:** This is the requirements phase. After review and approval of these requirements, the Design phase will produce `design.md` (architecture, the signature token/identity model, the tenant-theming mechanism, and correctness properties), followed by the Tasks phase (`tasks.md`).
