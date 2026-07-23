# Requirements Document — Booksy-Faithful Frontend Redesign

## Introduction

This spec defines a **fresh, end-to-end frontend redesign** of the Salon Booking platform's web
application (`packages/web`) to a visual identity faithful to the **real booksy.com**: a teal
action color (`#05CFA6` family) over a clean, high-contrast black/white minimal foundation, with
salon photography carrying the color. Unlike a pure re-skin, this redesign permits **deeper
structural changes to components and layouts** where a closer match to booksy's real look
requires it, while preserving all backend API contracts and request/response shapes.

The redesign covers **every surface** of the platform: the marketing home, owner-acquisition
business landing, salon self-registration, discovery pages, salon profile, the customer booking
funnel, the owner dashboard (calendar, analytics, configuration, subscription, transactions,
notifications, QR), authentication, the QR landing page, and the legal/trust pages.

The design source of truth is the existing analysis at
`docs/design-research/booksy-analysis.md`, supplemented by **fresh reference gathering**
(screenshots and imagery of booksy.com) wherever booksy's public surfaces are accessible.

This redesign **supersedes the visual direction** of both prior specs —
`booksy-newyork-redesign` (a NYC-magenta/noir interpretation) and `booksy-ui-redesign` (an
earlier teal re-skin). It replaces those interpretations with a single, cohesive booksy-faithful
direction, while keeping the platform's shared foundation intact (routing, i18n catalog, PWA,
SEO route split, accessibility patterns, and the tokens-only architecture).

The product is a Persian (Farsi), RTL-first salon appointment-booking PWA for the Iranian
market. Stack (unchanged): React 18 + Vite + TypeScript (strict) + react-router-dom v7 +
react-i18next (default `fa`, RTL) + Tailwind CSS + Radix UI + Framer Motion + vite-plugin-pwa.

### Design Direction

**Faithful to real booksy.com** (per `docs/design-research/booksy-analysis.md` and fresh
reference gathering):

- **Teal action color** (`#05CFA6` family) reserved for calls to action and interactive
  highlights.
- **Clean high-contrast black/white minimal foundation** — near-black text on white surfaces,
  minimal mid-tones, photography carrying the color.
- **Photography-forward cards** — large hero imagery, rating badge overlay, compact info
  hierarchy (name → rating → location → starting price).
- **Understated chrome** — minimal header and navigation so content breathes.
- **Search-first discovery** — location and service search is the primary entry point.
- **Calendar-centric owner dashboard** — the calendar is the hub of the owner experience.

### Non-Goals / Out of Scope

- No changes to backend domain logic, the scheduling engine, the database schema, or any API
  contract in `packages/backend`.
- No changes to the API client request and response shapes (presentation may adapt them for
  display only).
- No new product features beyond what the redesign requires.
- No rebuild of the routing structure, i18n catalog, PWA infrastructure, SEO route split, or the
  tokens-only architecture — those are reused.
- No code, dependency, or build-tooling import from the `ai-website-cloner-template` repository
  (inspiration only).
- Full WCAG 2.2 AA certification (automated checks are in scope; manual assistive-technology
  testing and expert audit are required follow-ups, not deliverables of this spec).
- The React Native mobile app (this spec covers the web PWA only).

### Recorded Assumptions

1. The `ai-website-cloner-template` repository is treated as reference and inspiration only. All
   work stays inside the existing `packages/web` codebase and stack; no code, dependency, or
   build tooling is imported from that template.
2. Adopting the Booksy_Identity teal/black-white palette supersedes the previously shipped
   palette values in `packages/web/src/styles/tokens.css` and
   `packages/shared/src/tokens/index.ts`. The tokens-only architecture, the contrast test
   (`contrast.test.ts`), and the distinctiveness guardrail (`distinctiveness.test.ts`) remain in
   force; their expected values are updated to the new palette in lockstep.
3. Because booksy's literal `#05CFA6` teal does not meet WCAG AA (4.5:1) as small text on white,
   the palette uses a two-tier teal: a deep teal for actions, links, small teal text, icons, and
   the focus ring (AA in both directions), and the bright `#05CFA6` reserved for large
   decorative fills with dark ink overlaid. Exact hex values are resolved in design against the
   contrast test.
4. "Fresh redesign" permits deeper structural changes to component internals and page layouts
   for a closer booksy match, provided every backend API contract and the API client
   request/response shapes are preserved.
5. Fresh reference gathering is best-effort: booksy.com blocks automated scraping, so where live
   references are inaccessible, `docs/design-research/booksy-analysis.md` remains the governing
   design source.

## Glossary

- **Booking_Platform**: the complete salon booking web application in `packages/web`.
- **Design_Token_System**: the CSS custom properties defined in
  `packages/web/src/styles/tokens.css` (mirrored in `packages/shared/src/tokens/index.ts`) and
  consumed by all components.
- **Booksy_Identity**: the booksy-faithful visual language — teal action color, clean
  high-contrast black/white minimal foundation, understated chrome, photography-forward layouts.
- **Teal_Action_Color**: the teal-family action and highlight color derived from booksy's
  `#05CFA6`, expressed as semantic tokens.
- **Component_Library**: the reusable components in `packages/web/src/components`.
- **Animation_System**: the Framer Motion-based motion layer present in the Component_Library.
- **Marketing_Home**: the public marketing home page at `/`.
- **Business_Landing**: the owner-acquisition marketing page at `/business`.
- **Salon_Registration**: the salon self-registration onboarding page at `/business/register`.
- **Discovery_Surface**: the public search and browse pages at `/city/:city` and
  `/services/:type`.
- **Salon_Profile**: the public per-salon page at `/s/:slug`.
- **Booking_Flow**: the customer booking funnel at `/salon/:salonId/book`,
  `/salon/:salonId/book/confirm`, and `/booking/success`.
- **Auth_Surface**: the phone-and-OTP authentication page at `/auth`.
- **Qr_Landing**: the QR entry page at `/qr/:payload`.
- **Legal_Surface**: the trust and legal pages at `/about`, `/contact`, `/privacy`, `/terms`.
- **Owner_Dashboard**: the authenticated owner panel under `/owner/*`, including calendar,
  analytics, configuration, subscription, transactions, notifications, and QR pages.
- **Owner_Calendar**: the calendar page at `/owner/calendar`.
- **Brand_Accent**: a salon's configurable accent color, injected as runtime CSS variables on a
  scoped storefront wrapper.
- **Design_Reference**: the documented booksy analysis at
  `docs/design-research/booksy-analysis.md`, supplemented by fresh reference gathering.

## Requirements

### Requirement 1: Booksy-Faithful Design Alignment

**User Story:** As a designer, I want the redesign grounded in the documented booksy.com
analysis and fresh references, so that the result faithfully reflects booksy's real aesthetic.

#### Acceptance Criteria

1. THE Booking_Platform redesign SHALL derive its visual patterns from the Design_Reference at
   `docs/design-research/booksy-analysis.md`, supplemented by fresh reference gathering where
   booksy public surfaces are accessible.
2. THE Booking_Platform redesign SHALL treat the `ai-website-cloner-template` repository as
   reference only, and SHALL implement all changes inside the existing `packages/web` codebase
   using the existing stack.
3. THE Booking_Platform redesign SHALL adapt booksy's documented UX patterns —
   photography-forward cards, per-service book actions, search-first discovery, and a
   calendar-centric owner dashboard — to the existing platform data model without changing any
   API contract.
4. WHERE a fresh reference conflicts with the Design_Reference, THE Booking_Platform redesign
   SHALL follow the direction that most faithfully matches booksy's real look and SHALL record
   the resolved decision in the design document.
5. WHERE the Design_Reference documents a booksy interaction pattern (for example a sticky
   bottom call to action or a filter chip bar), THE Booking_Platform SHALL implement an
   equivalent pattern adapted for RTL and Persian content.

### Requirement 2: Booksy-Faithful Visual Identity and Token Adoption

**User Story:** As a user, I want the platform to look like the clean, minimal, teal-forward
booksy experience, so that the interface feels trustworthy and lets salon photography stand out.

#### Acceptance Criteria

1. THE Design_Token_System SHALL define the Booksy_Identity palette: a clean high-contrast
   black-and-white foundation (near-black primary text on white surfaces), the Teal_Action_Color
   for actions and highlights, and minimal mid-tones, expressed as semantic tokens for both
   light and dark themes.
2. THE Design_Token_System SHALL apply identical Booksy_Identity token values in
   `packages/web/src/styles/tokens.css` and `packages/shared/src/tokens/index.ts`, so both
   sources of truth hold the same values.
3. THE Design_Token_System SHALL define every color pairing so that text on its background meets
   WCAG 2.2 AA contrast: at least 4.5:1 for normal text and at least 3:1 for large text and
   non-text UI components, verified by `packages/web/src/styles/contrast.test.ts`.
4. WHERE the Teal_Action_Color renders as small text on a light surface, THE Design_Token_System
   SHALL use a teal-family token value that meets the 4.5:1 contrast threshold.
5. THE Design_Token_System SHALL define a dark theme for the Booksy_Identity that preserves the
   high-contrast minimal character with dark surfaces, luminous text, and teal highlights.
6. WHEN the active theme changes between light and dark, THE Design_Token_System SHALL update all
   token-driven styling without a full page reload and without layout shift.
7. THE Component_Library SHALL consume the Design_Token_System tokens exclusively, using no raw
   hex, pixel, or millisecond literals in authored styles, verified by
   `packages/web/src/styles/distinctiveness.test.ts`.
8. THE Component_Library SHALL use CSS logical properties for flow-relative spacing and layout,
   using no physical `left` or `right` properties for flow-relative positioning.

### Requirement 3: Understated Chrome and Search-First Navigation

**User Story:** As a customer, I want minimal, unobtrusive navigation with search up front, so
that discovering a salon is the primary and obvious action.

#### Acceptance Criteria

1. THE Booking_Platform public surfaces SHALL present understated chrome: a minimal header and
   navigation that keeps visual weight on content and photography.
2. WHEN the Marketing_Home renders at `/`, THE Marketing_Home SHALL present a search-first entry
   point for service and location search above the fold as the primary interactive element.
3. WHILE the Booking_Platform is viewed on a mobile device with viewport width below 768px, THE
   navigation SHALL collapse to contextual patterns: no navigation chrome during the
   Booking_Flow, a bottom tab bar for the Owner_Dashboard, and a minimal menu for public
   discovery pages.
4. WHERE a context warrants expanded navigation (for example the Owner_Dashboard on desktop or a
   public discovery page above the mobile breakpoint), THE Booking_Platform SHALL present the
   expanded navigation appropriate to that context, while preserving the no-navigation-chrome
   rule during the Booking_Flow and the bottom-tab rule for the mobile Owner_Dashboard.
5. IF a navigation action fails to complete, THEN THE Booking_Platform SHALL surface a Persian
   error message describing the failure rather than silently blocking the action.
6. THE Booking_Platform SHALL present exactly one `<h1>` per page, ordered heading levels, and
   the `header`, `nav`, `main`, and `footer` landmarks on every rendered page.

### Requirement 4: Animation and Motion

**User Story:** As a user, I want purposeful, restrained motion consistent with booksy's clean
feel, so that the interface feels responsive without being flashy.

#### Acceptance Criteria

1. THE Animation_System SHALL use the existing Framer Motion motion layer rather than
   introducing a new motion framework.
2. THE Animation_System SHALL express all animation durations and easing using
   Design_Token_System tokens (`--dur-fast`, `--dur-base`, `--dur-slow`, `--ease-standard`,
   `--ease-emphasized`) and SHALL use no raw millisecond or easing literals.
3. THE Animation_System SHALL animate only compositor-friendly properties (`transform` and
   `opacity`) and SHALL NOT animate properties that trigger layout reflow (`width`, `height`,
   `top`, `left`).
4. WHILE the user has `prefers-reduced-motion: reduce` set, THE Animation_System SHALL disable
   transform-based animations, parallax, and particle effects, retaining opacity crossfades and
   essential state feedback.
5. WHEN a booking completes successfully, THE Animation_System SHALL present a celebration
   confirmation moment using the emphasized easing token.

### Requirement 5: Booksy-Faithful Marketing Home

**User Story:** As a visitor, I want a clean, photography-forward home page with search up front,
so that I immediately understand the platform and can start discovering salons.

#### Acceptance Criteria

1. WHEN the Marketing_Home renders at `/`, THE Marketing_Home SHALL present a hero section with a
   Persian headline in the display type treatment, a salon photography background with a scrim
   for text legibility, and the search-first entry point.
2. THE Marketing_Home SHALL present a salon showcase using photography-forward salon cards in a
   responsive grid with staggered scroll-reveal entrances.
3. THE Marketing_Home SHALL present a "How It Works" section using an editorial asymmetric
   layout rather than a single row of equal cards.
4. THE Marketing_Home SHALL present a social-proof section with platform metrics rendered as
   large numbers using Persian numerals.
5. THE Marketing_Home SHALL vary section rhythm so that consecutive sections differ in layout,
   background, or density.
6. WHEN the Marketing_Home is measured on a representative mid-range mobile profile, THE
   Marketing_Home SHALL meet Core Web Vitals: LCP under 2.5 seconds, INP under 200 milliseconds,
   and CLS under 0.1.
7. THE Marketing_Home SHALL be marked indexable with a unique title, meta description, canonical
   URL, Open Graph metadata, and JSON-LD `WebSite` and `Organization` structured data.

### Requirement 6: Search-First Discovery Surface

**User Story:** As a customer, I want to browse salons through a clean, filterable grid, so that
I can find the right salon quickly.

#### Acceptance Criteria

1. WHEN a Discovery_Surface renders at `/city/:city` or `/services/:type`, THE Discovery_Surface
   SHALL present a grid of photography-forward salon cards showing hero photography, a rating
   badge overlay, salon name, location, and starting price in Rial with Persian numerals.
2. THE Discovery_Surface SHALL present filter and sort controls in a sticky or collapsible bar.
3. THE Discovery_Surface SHALL render results responsively: three columns on desktop, two on
   tablet, and a single-column stack on mobile, with no horizontal overflow at any breakpoint.
4. WHILE any data surface on the Discovery_Surface is loading, THE Discovery_Surface SHALL
   display skeleton cards matching the final card dimensions rather than a centered spinner;
   WHEN no data surface on the Discovery_Surface is loading, THE Discovery_Surface SHALL render
   its content without an artificial delay.
5. IF no salons match the active filters, THEN THE Discovery_Surface SHALL display a styled empty
   state with a helpful suggestion and a clear next action in Persian.
6. THE Discovery_Surface SHALL be marked indexable with a unique title, meta description,
   canonical URL, and JSON-LD `BreadcrumbList` structured data.

### Requirement 7: Photography-Forward Salon Profile

**User Story:** As a customer, I want a visually rich salon profile, so that I can evaluate the
salon and confidently start a booking.

#### Acceptance Criteria

1. WHEN the Salon_Profile renders at `/s/:slug`, THE Salon_Profile SHALL present a hero header
   with full-width gallery imagery, the salon name in the display type treatment, location,
   rating, and a prominent Teal_Action_Color "Book Now" call to action.
2. THE Salon_Profile SHALL present services in a booksy-style list grouped by category, each
   service showing name, duration, price in Rial with Persian numerals, and a per-service "Book"
   action.
3. THE Salon_Profile SHALL present salon information sections: description, opening hours using
   the Iranian week with Saturday first, address with a lazy-loaded map embed, and a staff
   gallery.
4. WHEN the "Book Now" call to action is activated, THE Salon_Profile SHALL navigate to the
   Booking_Flow entry point for that salon.
5. WHERE a salon has a configured Brand_Accent, THE Salon_Profile SHALL apply the Brand_Accent to
   primary calls to action through scoped runtime token overrides while maintaining WCAG AA
   contrast on the accent foreground.
6. THE Salon_Profile SHALL embed JSON-LD structured data: `BeautySalon` or `HairSalon` with NAP,
   a `Service` list with prices in IRR, `BreadcrumbList`, and `OpeningHoursSpecification` using
   the Iranian week.
7. THE Salon_Profile SHALL be marked indexable with a unique title containing the salon name and
   city, a meta description, a canonical URL, and Open Graph metadata using the salon hero image.

### Requirement 8: Booksy-Faithful Booking Flow

**User Story:** As a customer, I want a streamlined, multi-step booking experience, so that I can
select a service, pick a time, and confirm with minimal friction.

#### Acceptance Criteria

1. THE Booking_Flow SHALL present a multi-step experience — service selection, date and time
   selection, and confirmation — with a visible progress indicator of the current and completed
   steps.
2. WHEN the service selection step renders, THE Booking_Flow SHALL display services as a
   photography-consistent card list showing name, duration, and price in Rial with Persian
   numerals, with a select action that animates to a selected state.
3. WHEN the date and time step renders, THE Booking_Flow SHALL present a Jalali date picker with
   Persian month and weekday labels and a time-slot grid, with available slots as selectable
   chips and unavailable slots visually muted and distinguishable without color alone.
4. WHEN a time slot is selected, THE Booking_Flow SHALL animate the slot chip to a selected state
   using the Teal_Action_Color, providing immediate feedback.
5. WHEN the confirmation step renders, THE Booking_Flow SHALL display a summary card with the
   selected service, Jalali date, time, price in Rial, and salon name.
6. WHEN a booking is confirmed successfully, THE Booking_Flow SHALL present the celebration
   success moment with the booking details.
7. WHILE any data surface on a Booking_Flow step is loading, THE Booking_Flow SHALL display a
   skeleton matching the expected layout; WHEN no data surface on the step is loading, THE
   Booking_Flow SHALL render step content without an artificial delay; IF loading fails, THEN
   THE Booking_Flow SHALL display a Persian error message with a retry action.
8. THE Booking_Flow SHALL be operable by keyboard with a logical focus order under RTL, and SHALL
   retain step state WHEN the user navigates backward.
9. THE Booking_Flow routes SHALL be marked `noindex` and excluded from the sitemap.

### Requirement 9: Calendar-Centric Owner Dashboard

**User Story:** As a salon owner, I want a calendar-centric dashboard with a clean, minimal
aesthetic, so that I can manage appointments efficiently.

#### Acceptance Criteria

1. WHEN the Owner_Dashboard renders under `/owner/*`, THE Owner_Dashboard SHALL apply the
   Booksy_Identity with the calendar as the central hub of the experience.
2. WHEN the Owner_Calendar renders at `/owner/calendar`, THE Owner_Calendar SHALL present day and
   week views with a time grid, appointments shown as color-coded blocks with service and
   customer information, and transitions when switching views.
3. WHEN the analytics page renders at `/owner/analytics`, THE Owner_Dashboard SHALL present
   metrics (utilization, revenue in Rial with Persian numerals, busiest windows) using chart
   components with minimal chrome and Teal_Action_Color highlights for key data.
4. WHEN the configuration page renders at `/owner/config`, THE Owner_Dashboard SHALL present
   staff, services, chairs, and holidays in card-based sections with inline edit affordances.
5. WHEN the subscription, transactions, notifications, and QR pages render under `/owner/*`, THE
   Owner_Dashboard SHALL apply the Booksy_Identity with consistent card-based sections and the
   same navigation chrome as the other owner pages.
6. THE Owner_Dashboard SHALL use the owner sidebar on desktop and a bottom tab bar on mobile as a
   required navigation component (fail-closed): the required navigation component for the active
   breakpoint SHALL be present; IF the required navigation component fails to render, THEN THE
   Owner_Dashboard SHALL render a Persian error state rather than a navigation-less or broken
   dashboard state.
7. WHILE any data surface on an Owner_Dashboard page is loading, THE Owner_Dashboard SHALL display
   a skeleton matching the final layout; WHEN no data surface on the page is loading, THE
   Owner_Dashboard SHALL render content without an artificial delay; IF loading fails, THEN THE
   Owner_Dashboard SHALL display a Persian error state with the cause and a retry action.
8. THE Owner_Dashboard SHALL support keyboard operation for view switching, date navigation, and
   grid-cell focus with correct RTL arrow-key direction.
9. THE Owner_Dashboard routes SHALL be marked `noindex`.

### Requirement 10: Authentication, QR Landing, and Legal Surfaces

**User Story:** As a user entering through login, a QR scan, or a trust page, I want those
surfaces to match the booksy-faithful identity, so that the experience feels cohesive
end-to-end.

#### Acceptance Criteria

1. WHEN the Auth_Surface renders at `/auth`, THE Auth_Surface SHALL apply the Booksy_Identity with
   a phone field and a six-digit OTP entry, visible labels, an OTP resend timer, and inline
   Persian error messages tied to their fields.
2. THE Auth_Surface SHALL keep the phone and OTP fields in Latin entry internally with
   `dir="ltr"`, normalize digits on submit, and display all countdown and helper digits as
   Persian numerals.
3. WHEN the Qr_Landing renders at `/qr/:payload`, THE Qr_Landing SHALL apply the Booksy_Identity
   with a salon introduction and a clear call to action into the Booking_Flow.
4. WHEN a Legal_Surface renders at `/about`, `/contact`, `/privacy`, or `/terms`, THE
   Legal_Surface SHALL apply the Booksy_Identity with readable content columns bounded to a
   comfortable measure and consistent typography.
5. THE Legal_Surface SHALL be marked indexable with a unique title, meta description, and
   canonical URL; THE Auth_Surface and Qr_Landing SHALL be marked `noindex` and excluded from the
   sitemap.
6. WHEN the Salon_Registration renders at `/business/register`, THE Salon_Registration SHALL apply
   the Booksy_Identity with a card-based onboarding flow, visible labels, inline Persian
   validation errors, and SHALL be marked `noindex`.

### Requirement 11: Business Landing Surface

**User Story:** As a salon owner evaluating the platform, I want a compelling business landing
page, so that I understand the value and can start onboarding.

#### Acceptance Criteria

1. WHEN the Business_Landing renders at `/business`, THE Business_Landing SHALL present a hero
   section with a Persian headline in the display type treatment, a value proposition, and a
   primary call to action toward salon registration.
2. THE Business_Landing SHALL present owner-facing benefits using an editorial asymmetric layout
   rather than a single row of equal cards.
3. THE Business_Landing SHALL vary section rhythm so that consecutive sections differ in layout,
   background, or density.
4. THE Business_Landing SHALL be marked indexable with a unique title, meta description,
   canonical URL, and Open Graph metadata.

### Requirement 12: Photography and Visual Content

**User Story:** As a user, I want high-quality salon imagery throughout, so that the experience
feels aspirational and trustworthy while the interface stays clean.

#### Acceptance Criteria

1. THE Marketing_Home, Discovery_Surface, and Salon_Profile SHALL incorporate
   photography-forward layouts where salon imagery carries the visual color and the interface
   stays high-contrast and minimal.
2. THE images SHALL be served in modern formats (AVIF or WebP with a fallback) using responsive
   `srcset` and explicit `width` and `height` attributes to prevent layout shift.
3. THE below-the-fold images SHALL be lazy-loaded; THE hero and LCP image SHALL be eagerly loaded
   with `fetchpriority="high"` and preloaded via `<link rel="preload">`.
4. THE images SHALL carry meaningful Persian `alt` text describing the content; decorative images
   SHALL use empty `alt=""`.
5. WHERE salon-specific imagery is unavailable, THE Booking_Platform SHALL display a styled
   placeholder using the brand motif and Booksy_Identity tokens rather than a generic gray box.

### Requirement 13: Responsive and Mobile-First Layout

**User Story:** As a mobile user arriving from a QR scan, I want the experience optimized for
one-handed phone use, so that I can book quickly and comfortably.

#### Acceptance Criteria

1. THE Booking_Platform SHALL be responsive across breakpoints — mobile (360–480px), tablet
   (768px), desktop (1024px), and wide (1280px and above) — with no horizontal overflow at any
   breakpoint.
2. THE Booking_Flow SHALL be optimized for mobile-first use with primary calls to action in the
   bottom third of the viewport, full-width action buttons, and bottom-sheet patterns for date
   and time pickers.
3. THE touch targets SHALL be at least 44 by 44 pixels with adequate spacing, and THE interactive
   elements SHALL provide visible press feedback on touch devices.

### Requirement 14: RTL, Persian Typography, Jalali Dates, and Localization

**User Story:** As an Iranian user, I want correct RTL rendering, Persian typography, and
localized dates and numbers, so that the booksy-faithful design still feels authentically
Persian.

#### Acceptance Criteria

1. THE Booking_Platform SHALL render in RTL using CSS logical properties exclusively, with
   `dir="rtl"` and `lang="fa"` on the document root.
2. THE typography SHALL use self-hosted Vazirmatn (variable woff2) with a metrics-matched
   fallback, preloaded for above-the-fold content, with `font-display: swap`.
3. THE display and heading text SHALL use the display type treatment (weight heavier than body,
   line-height tighter than body) so headings never render visually uniform with body copy.
4. THE Booking_Platform SHALL render all user-facing digits as Persian numerals for prices,
   dates, counts, and metrics; WHERE an input field requires Latin entry such as phone or OTP,
   THE field SHALL keep Latin entry internally with `dir="ltr"` and normalize on submit.
5. THE Booking_Platform SHALL display all dates using the Jalali calendar with Persian month and
   weekday labels, converting to and from ISO only at the API boundary.
6. THE Booking_Platform SHALL format monetary amounts as Iranian Rial with Persian digits,
   thousands grouping, and a localized currency label.
7. THE directional icons (chevrons, arrows, progress carets) SHALL mirror in RTL; WHERE an icon
   is not a member of the explicit universal-icon set (search, clock, checkmark), THE
   Booking_Platform SHALL treat the icon as directional by default and mirror it under RTL; only
   the explicit universal-icon set SHALL NOT mirror.
8. WHERE text mixes Persian with Latin or numeric runs, THE Booking_Platform SHALL isolate the
   embedded run using `<bdi>` or `unicode-bidi: isolate` so ordering remains correct.
9. WHEN the automated test suite runs, THE suite SHALL verify as non-regression checks that
   self-hosted Vazirmatn is preloaded for above-the-fold content and declared with
   `font-display: swap`, and that mixed Persian/Latin/numeric runs are wrapped with `<bdi>` or
   `unicode-bidi: isolate`, and SHALL fail the build if either check fails.

### Requirement 15: Accessibility (WCAG 2.2 AA)

**User Story:** As a user with a disability, I want the redesigned platform to meet accessibility
standards, so that I can use it with assistive technology regardless of the visual treatment.

#### Acceptance Criteria

1. THE Booking_Platform SHALL target WCAG 2.2 Level AA across all redesigned surfaces and
   components.
2. THE interactive elements SHALL show a visible focus indicator using the focus-ring token that
   satisfies WCAG 2.2 focus-appearance requirements.
3. THE Booking_Platform SHALL be operable by keyboard with a logical focus order correct under
   RTL, and animations SHALL NOT block keyboard operation or prevent completing an action.
4. THE forms SHALL provide visible labels, inline error messages with icon and text tied via
   `aria-describedby`, and correct `aria-invalid` states.
5. WHEN a dialog, sheet, or modal opens, THE component SHALL trap focus, restore focus to the
   trigger on close, close on Escape, and be labeled with `aria-labelledby`.
6. THE Booking_Platform SHALL convey status through icon and text in addition to color, so
   meaning never depends on color alone.
7. WHEN the automated test suite runs, THE suite SHALL execute axe accessibility checks against
   key components and pages and SHALL fail the build on serious or critical violations; these
   axe checks are REQUIRED and gating. IF the accessibility test run fails OR does not execute,
   THEN the acceptance criterion SHALL be treated as not met.
8. WHEN the automated test suite runs, THE suite SHALL verify as a non-regression check that each
   dialog, sheet, or modal traps focus while open, closes on Escape, and restores focus to the
   trigger on close, and SHALL fail the build if the check fails.
9. THE spec SHALL state explicitly that automated accessibility checks are necessary but not
   sufficient, and that full WCAG 2.2 AA conformance requires manual testing with assistive
   technologies and expert accessibility review.

### Requirement 16: Performance and Core Web Vitals

**User Story:** As a visitor, I want fast pages and instant-feeling interactions, so that the
polish never costs performance.

#### Acceptance Criteria

1. WHEN a public page (Marketing_Home, Business_Landing, Discovery_Surface, Salon_Profile, or a
   Legal_Surface) is measured on a representative mid-range mobile profile, THE page SHALL meet
   Core Web Vitals: LCP under 2.5 seconds, INP under 200 milliseconds, and CLS under 0.1.
2. THE Booking_Platform SHALL apply route-level code splitting so the Owner_Dashboard bundles do
   NOT load on public or Booking_Flow routes.
3. THE public routes SHALL deliver meaningful HTML without requiring client JavaScript to paint
   primary content (prerender or SSR), while the authenticated routes remain client-rendered.
4. THE Booking_Platform SHALL lazy-load non-critical assets — below-the-fold images, chart
   libraries, and the Jalali date picker — reserving space to prevent layout shift.
5. THE public routes' initial JavaScript SHALL stay within approximately 150 kilobytes gzip,
   excluding the owner and heavy-library bundles.
6. WHEN continuous integration runs, THE Booking_Platform SHALL execute a Lighthouse CI run
   against the public pages and SHALL fail the build if measured LCP, INP (or its lab proxy), or
   CLS exceed the criterion-1 thresholds. This Core Web Vitals gate is REQUIRED and
   non-negotiable.
7. WHEN the build runs, THE Booking_Platform SHALL enforce a public-route JavaScript budget check
   that fails the build if the initial JavaScript for public routes exceeds approximately 150
   kilobytes gzip.
8. WHEN the build runs, THE Booking_Platform SHALL enforce a code-split isolation check that
   fails the build if any Owner_Dashboard bundle is loaded on public or Booking_Flow routes.
9. WHEN continuous integration runs, THE Booking_Platform SHALL verify that each public route
   serves meaningful HTML content for its primary content without requiring client JavaScript to
   paint, and SHALL fail the build if the prerendered or server-rendered HTML lacks that primary
   content.
10. IF any Core Web Vitals, JavaScript-budget, code-split-isolation, or prerender/SSR content
    check fails OR does not execute, THEN the relevant acceptance criterion SHALL be treated as
    not met.

### Requirement 17: SEO and Structured Data

**User Story:** As the business, I want public pages discoverable with rich results while the
authenticated app stays private.

#### Acceptance Criteria

1. THE public routes (`/`, `/business`, `/city/:city`, `/services/:type`, `/s/:slug`, and the
   Legal_Surface routes) SHALL be marked indexable with unique titles, meta descriptions, and
   canonical URLs.
2. THE authenticated and transactional routes (Booking_Flow, Owner_Dashboard, `/auth`,
   `/qr/:payload`, and `/business/register`) SHALL be marked `noindex` and excluded from the
   sitemap.
3. THE Salon_Profile SHALL embed JSON-LD `BeautySalon` or `HairSalon` with NAP, `Service` with
   prices in IRR, `BreadcrumbList`, and `OpeningHoursSpecification` using the Iranian week.
4. THE Marketing_Home SHALL embed JSON-LD `WebSite` and `Organization` structured data.
5. THE Booking_Platform SHALL serve a `robots.txt` allowing public pages and disallowing app,
   admin, and API paths, and a `sitemap.xml` listing only indexable URLs.
6. THE public pages SHALL declare Open Graph and Twitter Card metadata with `og:locale = fa_IR`
   and a branded OG image (1200 by 630, RTL-correct Persian text).
7. THE public pages SHALL declare `hreflang` self-reference (`fa-IR`) plus `x-default`.

### Requirement 18: PWA Preservation

**User Story:** As a returning user, I want to install the app and have it feel native, so that I
can access it quickly and reliably.

#### Acceptance Criteria

1. THE Booking_Platform SHALL ship a web app manifest with name, short_name (Persian),
   description, icons (192x192, 512x512, and maskable variants), theme_color derived from the
   Booksy_Identity primary, background_color, `display: "standalone"`, `dir: "rtl"`, `lang: "fa"`,
   and `start_url`.
2. WHEN the app is offline, THE service worker SHALL serve a cached application shell so the app
   still loads with a meaningful offline state.
3. THE service worker and caching strategy SHALL NOT cache authenticated API responses in a way
   that could leak one user's data to another.
4. WHEN the theme switches between light and dark, THE `<meta name="theme-color">` SHALL update to
   match the active theme's primary color.
5. WHEN the automated test suite runs, THE suite SHALL verify as a non-regression check that the
   service worker serves a cached application shell while offline, and SHALL fail the build if
   the offline app-shell check fails.
6. WHEN the automated test suite runs, THE suite SHALL verify as a security-sensitive
   non-regression check that the caching strategy does not cache authenticated API responses in
   a way that could leak one user's data to another, and SHALL fail the build if the check fails.

### Requirement 19: Foundation Reuse and Non-Regression

**User Story:** As a maintainer, I want the redesign to reuse and preserve the existing
foundation, so that infrastructure, contracts, and behavior remain intact.

#### Acceptance Criteria

1. THE Booking_Platform redesign SHALL reuse the existing routing structure in
   `packages/web/src/App.tsx` without changing route paths or the public/authenticated route
   split.
2. THE Booking_Platform redesign SHALL preserve all backend API contracts and the API client
   request and response shapes.
3. WHERE a closer booksy match requires deeper structural changes to component internals or page
   layouts, THE Booking_Platform redesign SHALL make those changes while keeping the semantic
   token names, route paths, and API client shapes unchanged.
4. THE Booking_Platform redesign SHALL completely supersede the visual direction of the prior
   `booksy-newyork-redesign` and `booksy-ui-redesign` specs, so that no superseded visual
   treatment from those prior directions remains on any redesigned surface, while keeping the
   shared foundation intact.
5. WHEN the existing automated test suite runs after the redesign, THE Booking_Platform SHALL
   pass the token, contrast, distinctiveness, and accessibility tests with values updated to the
   Booksy_Identity; IF any of these tests fail OR do not execute, THEN this acceptance criterion
   SHALL be treated as not met. The accessibility (axe) tests are REQUIRED and gating.

---

> **Automated checks are necessary but not sufficient.** Full WCAG 2.2 AA conformance requires
> manual testing with assistive technologies (VoiceOver/iOS, TalkBack/Android, NVDA — all in
> RTL/Farsi), keyboard-only walkthroughs, and expert accessibility review. Treat every automated
> pass as a floor, not a certificate.

> **Non-negotiable gates.** WCAG 2.2 AA axe checks, Core Web Vitals budgets, and a required
> loading strategy are REQUIRED and gating per the authoritative steering (`ui-ux-skills.md`,
> `seo-skills.md`). They SHALL NOT be relaxed or made optional. A failed run and a non-executed
> run both count as failures: an acceptance criterion tied to a check is met only when that
> check actually runs and passes.
