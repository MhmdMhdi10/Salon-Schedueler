# Requirements Document — UI/UX Redesign

## Introduction

The Salon Booking platform is a Persian (Farsi), right-to-left (RTL) appointment‑booking product for the Iranian beauty/salon market. Its backend, domain logic, and data model are well established, and both client surfaces — a React 18 + Vite + TypeScript PWA (`packages/web`) and a React Native app (`packages/mobile`) — are functionally wired to the API. **What they lack is design.** Today the web pages render unstyled HTML (no stylesheet is imported anywhere; `src/components/` is empty; pages are bare `<h1>`, `<form>`, `<select>`, `<ul>` markup), and the mobile screens use default React Native primitives. There is no design system, no component library, no theming, no real layout, no brand identity, and no SEO or installable‑PWA polish beyond a minimal manifest.

This spec defines a **complete UI/UX redesign** of the frontend: a tokenized, RTL‑first design system; an accessible component library; a real application shell; a page‑by‑page redesign of every customer and admin web page and the mobile screens; correct Persian typography, Jalali (Shamsi) dates, Persian numerals, and Iranian Rial formatting; an SEO foundation for new public pages; rendering/performance work; accessibility to WCAG 2.2 AA; and PWA polish — all without changing backend behavior or API contracts.

### Goals

- Establish a single source of truth for visual design (tokens, themes) that is RTL‑first and supports light and dark modes.
- Build a reusable, accessible component library that every screen composes from.
- Redesign **every** existing web page (customer + admin) and the mobile screens to a modern, elegant, consistent salon/beauty brand.
- Get Persian localization details right: typography, Jalali calendar, Persian numerals, Rial currency, and verified RTL correctness.
- Add public, indexable marketing and per‑salon profile pages with full SEO, while keeping the authenticated app private (noindex).
- Meet Core Web Vitals budgets and WCAG 2.2 AA, with automated checks in the test suites.
- Keep all existing web and mobile test suites green and extend them with component and smoke tests.

### Non‑Goals / Out of Scope

- No changes to backend domain logic, the `Scheduling_Engine`, database schema, or any API contract in `packages/backend`.
- No changes to the API client's request/response shapes in `packages/web/src/api/client.ts` (presentation may wrap them, but the contracts stay).
- No new product features or flows beyond the public marketing/profile surfaces required for SEO; this is a redesign of existing functionality plus the public discovery layer.
- Full WCAG conformance certification (automated checks are in scope; manual assistive‑technology testing and expert audit are called out as required follow‑ups, not delivered here).

### Governing Standards

Two steering skill files are the authoritative standards for this work and govern all decisions below:

- `.kiro/steering/ui-ux-skills.md` — UI/UX, design‑system, component, accessibility, and RTL/localization standards.
- `.kiro/steering/seo-skills.md` — SEO, structured‑data, rendering, and Core Web Vitals standards.

Where this document and a steering file disagree, the steering file wins, and this spec should be updated to match.

## Requirements

### Requirement 1: RTL‑First Design System and Tokens

**User Story:** As a designer and developer, I want a single, tokenized design system that is RTL‑first and themeable, so that every surface is visually consistent, accessible, and easy to evolve.

#### Acceptance Criteria

1. THE design system SHALL define **semantic** color tokens (for example: background, surface, surface‑raised, foreground/text, muted‑foreground, primary, on‑primary, accent, on‑accent, border, input, ring/focus, success, warning, danger, info) that components reference instead of raw hex values.
2. THE design system SHALL provide a complete **light** theme and a complete **dark** theme, defining every semantic token in both.
3. WHEN any text or interactive control is rendered, THE design system SHALL use foreground/background token pairs that meet WCAG 2.1 AA contrast (≥ 4.5:1 for normal text, ≥ 3:1 for large text and for UI/graphical components and focus indicators).
4. THE design system SHALL define a modular **type scale** (font sizes, line heights, weights) tuned for Persian script legibility, including taller default line height for body text.
5. THE design system SHALL define named **spacing**, **border‑radius**, **elevation/shadow**, and **z‑index** scales.
6. THE design system SHALL define **motion** tokens (durations and easing curves), and WHILE the user has `prefers-reduced-motion` set, THE UI SHALL reduce or remove non‑essential animation.
7. THE design system SHALL be **RTL‑first**, expressing all direction‑dependent styling with CSS logical properties (inline‑start/inline‑end, margin/padding‑inline) rather than physical left/right.
8. WHEN the active theme changes between light and dark, THE design system SHALL update all token‑driven styling immediately without a full page reload and without layout shift.

### Requirement 2: Accessible, Reusable Component Library

**User Story:** As a developer, I want an accessible component library covering every primitive I need, so that I can compose all screens consistently without re‑inventing UI or accessibility.

#### Acceptance Criteria

1. THE component library SHALL provide at least: Button, Icon Button, Text Field/Input, Textarea, Select, Checkbox, Radio, Switch, Dialog/Modal, Sheet/Drawer, Tabs, Card, Badge/Chip, Toast/Notification, Skeleton, Spinner, Empty‑State, Error‑State, Avatar, Tooltip, Jalali Date Picker, and Time Picker.
2. WHEN an interactive component renders, THE component SHALL implement the applicable interaction states: default, hover, focus‑visible, active/pressed, disabled, and loading.
3. WHEN a data‑driven component renders, THE component SHALL support the applicable data states: loading (skeleton/spinner), empty, error, and populated.
4. THE interactive components SHALL be fully operable by keyboard (Tab/Shift+Tab to move, Enter/Space to activate, Esc to dismiss, arrow keys for composite widgets such as tabs, select, and pickers).
5. WHEN a Dialog or Sheet opens, THE component SHALL trap focus within it, restore focus to the triggering element on close, and close on Esc and on overlay activation.
6. THE components SHALL expose correct ARIA roles, names, states, and relationships, and SHALL not rely on color alone to convey meaning.
7. THE form‑field components SHALL associate label, helper text, and error message programmatically (`label`/`for`, `aria-describedby`, `aria-invalid`) so assistive technology announces them.
8. THE Jalali Date Picker and Time Picker SHALL present and accept Jalali (Shamsi) dates and times with Persian numerals and Persian month/weekday labels.
9. WHEN rendered in RTL, THE components SHALL mirror layout and directional iconography (chevrons, back/forward, progress) correctly.
10. WHEN a Toast is shown, THE component SHALL announce it through an appropriate ARIA live region (`status` or `alert`) so it is perceivable without sight.

### Requirement 3: Application Shell, Layout, Navigation, and Theming

**User Story:** As a user, I want a coherent app shell with clear navigation, theming, and language handling, so that I can orient myself and move between sections easily on any device.

#### Acceptance Criteria

1. THE web app SHALL render a consistent application shell (header, main content region, and contextual navigation) around the routed pages, replacing the current bare `<div dir="rtl">` wrapper in `src/App.tsx`.
2. THE app shell SHALL be responsive across mobile, tablet, and desktop breakpoints with no horizontal overflow or broken layout.
3. THE header SHALL provide a theme toggle that switches between light and dark and SHALL persist the user's choice across sessions.
4. WHEN the user has expressed no explicit theme choice, THE web app SHALL follow the operating‑system color‑scheme preference.
5. THE app shell SHALL set document direction to RTL and language to Persian by default, preserving the existing `dir="rtl"` and `lang="fa"` document contract.
6. THE admin area SHALL present navigation appropriate to admin tasks (Configuration, Calendar, Analytics) that is visually and structurally distinct from the customer flow.
7. WHEN a route is loading because of code splitting, THE app shell SHALL show a non‑blocking loading indicator and SHALL reserve layout so there is no cumulative layout shift.
8. THE app shell SHALL provide a skip‑to‑content link and a correct landmark structure (`header`, `nav`, `main`, `footer`) with a single `main` per page.

### Requirement 4: Redesign of Every Customer Web Page

**User Story:** As a customer, I want polished, clear booking screens with obvious next steps and honest feedback, so that I can authenticate and book an appointment with confidence.

#### Acceptance Criteria

1. WHEN the auth page (`AuthPage.tsx`) renders, THE redesigned UI SHALL present a phone‑entry step and an OTP‑entry step in Persian, with direction‑isolated LTR numeric inputs, inline validation, and visible loading and error states.
2. WHEN an OTP request or verification is in flight, THE auth UI SHALL disable submission and show a loading state; IF the request fails, THEN the UI SHALL show an inline, friendly error without discarding the data the user entered.
3. WHEN the QR landing page (`QrLandingPage.tsx`) resolves a salon, THE UI SHALL present the salon identity and a prominent primary call‑to‑action to begin booking; WHILE resolving, it SHALL show a loading state; IF the payload is malformed or unregistered, THEN it SHALL show **distinct** error states with appropriate Persian copy.
4. WHEN the availability page (`AvailabilityPage.tsx`) renders, THE UI SHALL present service selection, a Jalali date picker, and a time‑slot grid, with explicit loading, empty ("no slots"), and error states, and SHALL display service price in Rial.
5. WHEN the booking confirm page (`BookingConfirmPage.tsx`) renders, THE UI SHALL summarize the selected service, the date and time (Jalali), and the price (Rial), and SHALL provide a confirm action with loading, error, and an explicit payment‑redirect state.
6. WHEN a booking succeeds (`BookingSuccessPage.tsx`), THE UI SHALL confirm the booking with its details and offer a clear next action.
7. THE customer pages SHALL be fully responsive and comfortably operable one‑handed on a mobile viewport.

### Requirement 5: Redesign of Every Admin Web Page

**User Story:** As a salon owner or admin, I want clear, data‑dense admin screens, so that I can configure resources, read the calendar, and review analytics efficiently.

#### Acceptance Criteria

1. WHEN the configuration page (`admin/ConfigurationPage.tsx`) renders, THE UI SHALL present staff, chairs, services, and holidays as organized, scannable sections with clear add/edit affordances and loading, empty, and error states.
2. WHEN the calendar page (`admin/CalendarPage.tsx`) renders, THE UI SHALL present a day view and a week view (toggle) of appointments with a legible time/resource structure and loading, empty, and error states.
3. WHEN the analytics page (`admin/AnalyticsPage.tsx`) renders, THE UI SHALL present utilization, revenue (in Rial), and busiest‑window figures in clearly labeled, legible tables and/or charts with loading, empty, and error states.
4. THE admin pages SHALL be optimized for tablet and desktop and SHALL degrade gracefully to a usable single‑column layout on small screens.
5. THE admin lists, tables, and view toggles SHALL be keyboard operable and screen‑reader friendly (correct roles for tabs, tables, and lists).

### Requirement 6: Redesign of the Mobile React Native Screens

**User Story:** As a mobile customer, I want the native screens to match the brand and feel, so that the experience is consistent with the web app.

#### Acceptance Criteria

1. THE mobile app SHALL apply the shared design language (color, typography, spacing, radius) through a React Native theme derived from the same token definitions as the web.
2. WHEN the AuthScreen (`screens/AuthScreen.tsx`) renders, THE mobile UI SHALL present the phone and OTP steps with loading, error, and success states consistent with the web auth design.
3. WHEN the QrScanScreen (`screens/QrScanScreen.tsx`) renders, THE mobile UI SHALL present idle/scanning, resolving, resolved, and error states, with distinct messaging for malformed versus unregistered payloads.
4. WHEN the availability/booking screen renders, THE mobile UI SHALL present service, date, and slot selection and booking with loading, empty, error, and success states.
5. THE mobile screens SHALL render correctly in RTL with Persian typography and Persian numerals.

### Requirement 7: Persian Typography, Jalali Dates, Numerals, Rial, and RTL Correctness

**User Story:** As an Iranian user, I want correct Persian typography, dates, numerals, and currency throughout, so that the app feels native and is never ambiguous.

#### Acceptance Criteria

1. THE UI SHALL render Persian text using a Persian‑optimized webfont (Vazirmatn or a comparable face), self‑hosted with appropriate fallbacks.
2. THE UI SHALL display all user‑facing dates using the Jalali (Shamsi) calendar.
3. WHEN a Gregorian date is converted to Jalali for display and converted back, THE conversion SHALL reproduce the original Gregorian date exactly, reusing the shared Jalali utilities rather than a new converter.
4. THE UI SHALL render digits in user‑facing text using Persian/Eastern‑Arabic numerals.
5. THE UI SHALL format monetary amounts as Iranian Rial with Persian digits, grouping, and a localized currency label.
6. WHERE a numeric input must remain LTR (phone number, OTP), THE UI SHALL isolate its direction so caret position and digit order behave correctly within the RTL layout.
7. THE UI SHALL mirror directional icons and use logical properties so spacing, alignment, and iconography are correct in RTL.
8. THE date and time pickers SHALL operate on Jalali months and weekdays with Persian labels.

### Requirement 8: SEO Foundation for Public Pages

**User Story:** As the business, I want our public pages to be discoverable and richly presented in search and social, so that we attract customers, while the authenticated app stays private and unindexed.

#### Acceptance Criteria

1. THE redesign SHALL add public, indexable surfaces: a marketing/landing page and a public per‑salon profile page.
2. WHERE a route is public, THE web app SHALL render a unique, descriptive `<title>` and meta description for that route.
3. THE public pages SHALL declare a canonical URL and Open Graph and Twitter Card metadata for social sharing.
4. THE per‑salon profile page SHALL embed JSON‑LD structured data using schema.org types: `LocalBusiness`/`HairSalon`, `Service`, and `BreadcrumbList`.
5. THE web app SHALL serve a `robots.txt` and a `sitemap.xml` that list only public, indexable routes.
6. WHERE the app serves a locale/region, THE public pages SHALL declare `hreflang` alternates (at minimum a self‑referential `fa-IR`).
7. WHILE a route is an authenticated app, admin, or auth route, THE web app SHALL mark it `noindex` (robots meta) and SHALL exclude it from the sitemap, so private surfaces are never indexed.
8. THE public pages SHALL use semantic heading hierarchy and meaningful link text for crawlability and accessibility.

### Requirement 9: Rendering Strategy and Performance

**User Story:** As a visitor, I want public pages that load fast and an app that feels snappy, so that I never wait or see layout jank.

#### Acceptance Criteria

1. THE public routes SHALL be prerendered/statically generated (or server‑rendered) so meaningful HTML and SEO metadata are delivered without requiring client JavaScript to paint the primary content.
2. THE authenticated app and admin routes SHALL remain client‑rendered.
3. THE web app SHALL apply route‑level code splitting so each route's initial bundle loads only what that route needs.
4. WHEN measured on a representative mid‑range mobile profile, THE public landing page SHALL meet Core Web Vitals budgets: LCP < 2.5s, INP < 200ms, CLS < 0.1.
5. THE web app SHALL lazy‑load non‑critical assets (below‑the‑fold imagery, heavy admin views) and SHALL self‑host and subset the Persian font to limit its transfer weight.
6. THE web app SHALL prevent layout shift by reserving space for media and by configuring font fallback metrics (for example `size-adjust`).

### Requirement 10: Accessibility to WCAG 2.2 AA

**User Story:** As a user with a disability, I want the product to meet recognized accessibility standards, so that I can use it with assistive technology.

#### Acceptance Criteria

1. THE UI SHALL target WCAG 2.2 Level AA across redesigned screens and components.
2. THE interactive elements SHALL show a visible focus indicator that satisfies the WCAG 2.2 focus‑appearance and non‑text‑contrast expectations.
3. THE UI SHALL be fully operable by keyboard with a logical focus order that is correct under RTL.
4. WHEN the automated test suite runs, THE suite SHALL execute an accessibility checker (axe) against key components and pages and SHALL fail the build on serious or critical violations.
5. THE images and icons SHALL provide text alternatives, or SHALL be marked decorative when they convey no information.
6. THE forms SHALL provide programmatic labels, clear error identification, and correction guidance.
7. THE spec and its documentation SHALL state explicitly that automated checks are necessary but not sufficient, and that full WCAG 2.2 AA compliance requires manual testing with assistive technologies and expert accessibility review.

### Requirement 11: PWA Polish

**User Story:** As a returning user, I want to install the app and have it load offline, so that I get an app‑like, resilient experience.

#### Acceptance Criteria

1. THE web app SHALL ship a complete web app manifest: name, short_name, description, icons (including maskable), theme_color, background_color, display, `dir: "rtl"`, `lang: "fa"`, and start_url.
2. THE web app SHALL provide the icon sizes required for installability, including 192×192 and 512×512 plus maskable variants.
3. WHEN the app is offline, THE service worker SHALL serve a cached application shell so the app still loads.
4. THE web app SHALL set a `theme-color` consistent with the brand, appropriate to the active light or dark theme.
5. THE PWA SHALL satisfy installability criteria so it can be added to the home screen.
6. THE service worker and caching strategy SHALL NOT cache authenticated API responses in any way that could leak one user's data to another.

### Requirement 12: Quality, Consistency, and Test Continuity

**User Story:** As the team, I want a per‑screen QA checklist and continuously green tests, so that the redesign is consistent and does not regress existing functionality.

#### Acceptance Criteria

1. THE redesign SHALL define a per‑screen design QA checklist (all states, responsive breakpoints, RTL correctness, contrast, keyboard operability, empty/error handling) and SHALL apply it to every redesigned screen.
2. WHEN the web test suite runs, THE existing tests SHALL pass — including the RTL/i18n smoke tests, the PWA manifest/service‑worker tests, and the admin page tests — updated only as needed to reflect new structure while preserving their original intent (notably the `dir="rtl"`/`lang="fa"` and manifest assertions).
3. WHEN the mobile test suite runs, THE existing screen tests SHALL pass.
4. THE redesign SHALL add component tests (Testing Library) with axe accessibility checks for new components, and smoke tests for the redesigned pages.
5. WHEN the full build runs across the workspaces, THE build SHALL succeed with no TypeScript errors.
6. THE redesign SHALL NOT change backend domain logic or any API contract; presentation code MAY adapt API responses for display only.
