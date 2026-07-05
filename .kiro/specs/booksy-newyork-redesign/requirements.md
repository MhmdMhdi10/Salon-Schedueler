# Requirements Document — Booksy + New York Redesign

## Introduction

This spec defines a **complete UI/UX redesign** of the Salon Booking platform's frontend, reimagining every surface with a **Booksy.com-inspired design language** infused with a **New York City aesthetic**. The goal is to produce a premium, urban, energetic booking experience that feels like discovering and booking the best salon in Manhattan — bold typography, high-contrast editorial layouts, dynamic animations, and confident visual storytelling.

The platform is a Persian (Farsi), RTL-first salon appointment-booking product for the Iranian market. The tech stack is React 18 + Vite + TypeScript + react-router-dom v7 + react-i18next + Tailwind CSS + Radix UI + Framer Motion. This redesign covers the full spectrum: marketing landing page, search/discovery, salon profiles, booking flow, and admin/owner dashboard — all rendered with the Booksy + NYC aesthetic while preserving RTL correctness, WCAG 2.2 AA accessibility, Persian typography (Vazirmatn), Jalali dates, and Persian numerals.

### Design Direction

**Booksy.com Inspiration:** Booksy's clean, card-based service browsing; its streamlined booking flow with prominent CTAs; the photography-forward salon profiles; the search/discovery experience with filters and maps; the marketing pages that balance aspiration with utility.

**New York City Vibe:** Think SoHo salon windows, Brooklyn barbershop neon, Midtown editorial glossiness. Bold sans-serif type at heroic scale, high-contrast black/white with a hot-magenta accent, street-photography energy in imagery, grid-breaking editorial layouts, and that confident NYC attitude — direct, no-nonsense, premium.

**Animation Philosophy:** Purposeful motion throughout — page transitions (crossfade + subtle slide), micro-interactions on hover/press, scroll-triggered reveals (staggered cards, parallax hero), and signature moments (booking confirmation celebration). All respecting `prefers-reduced-motion`.

### Goals

- Recreate the Booksy.com booking UX patterns adapted for the Iranian/Persian market
- Infuse every surface with a New York City salon aesthetic — urban, trendy, premium
- Implement modern animations and micro-interactions that feel alive and responsive
- Design a conversion-focused landing page inspired by Booksy's marketing approach
- Cover the full platform: landing, discovery, profiles, booking, admin dashboard
- Maintain RTL-first, Persian-first, WCAG 2.2 AA accessible throughout
- Use Firecrawl to analyze Booksy.com for design reference and imagery inspiration

### Non-Goals / Out of Scope

- No changes to backend domain logic, the Scheduling_Engine, database schema, or any API contract in `packages/backend`
- No changes to the API client's request/response shapes (presentation may adapt them for display)
- No new product features beyond what the redesign requires (this is a visual/UX overhaul)
- Full WCAG 2.2 AA certification (automated checks are in scope; manual assistive-technology testing and expert audit are called out as required follow-ups)
- Mobile React Native app (this spec focuses on the web PWA; mobile can follow later)

### Relationship to Existing Specs

This spec **supersedes** the visual direction of `ui-ux-redesign` and `signature-ui-system` for the web PWA. Those specs established the component library, token system, and accessibility foundation — this spec repaints that foundation with the Booksy + NYC identity. The existing component library, routing structure, and accessibility patterns remain; the token values, visual language, animation system, and page compositions change.

## Glossary

- **Booking_Platform**: the complete salon booking web application
- **Landing_Page**: the public marketing home page at `/` designed for conversion
- **Discovery_Surface**: the search/browse experience for finding salons (city pages, service pages, search)
- **Salon_Profile**: the public per-salon page at `/s/:slug` showcasing the salon
- **Booking_Flow**: the multi-step appointment booking funnel (service → date → time → confirm → success)
- **Owner_Dashboard**: the admin panel under `/owner/*` for salon owners
- **Design_Token_System**: CSS custom properties in `tokens.css` consumed by all components
- **Animation_System**: the Framer Motion-based motion layer for transitions and micro-interactions
- **NYC_Aesthetic**: the New York City-inspired visual language — bold, high-contrast, editorial, urban
- **Booksy_Patterns**: UX patterns inspired by Booksy.com's booking platform
- **Component_Library**: the existing Radix UI-based component library in `components/ui`
- **Firecrawl_Analysis**: using Firecrawl to scrape and analyze Booksy.com for design reference

## Requirements

### Requirement 1: Booksy.com Design Research and Reference Gathering

**User Story:** As a designer, I want thorough analysis of Booksy.com's design patterns, so that the redesign faithfully captures their proven UX approach adapted for the Persian market.

#### Acceptance Criteria

1. THE Booking_Platform design process SHALL use Firecrawl to analyze Booksy.com's landing page, booking flow, salon profile pages, and search/discovery experience.
2. THE Firecrawl_Analysis SHALL extract and document Booksy.com's key design patterns: navigation structure, card layouts, booking step flow, CTA placement, color usage, typography hierarchy, and photography treatment.
3. THE Firecrawl_Analysis SHALL gather high-quality salon/beauty imagery references from Booksy.com or similar sources for use in the Landing_Page and marketing surfaces.
4. THE redesign SHALL adapt Booksy.com's booking flow UX (service browsing → provider selection → time selection → confirmation) to the existing platform's data model without changing API contracts.
5. WHERE Booksy.com uses a specific interaction pattern (for example sticky bottom CTAs, swipeable service cards, or expandable salon details), THE redesign SHALL evaluate and implement equivalent patterns adapted for RTL and Persian content.

### Requirement 2: NYC-Inspired Visual Identity and Token System

**User Story:** As a user, I want the platform to feel like a premium New York City salon experience, so that I trust the platform and feel excited about booking.

#### Acceptance Criteria

1. THE Design_Token_System SHALL define a NYC-inspired color palette: high-contrast foundation (near-black `#0A0A0A` and clean white `#FFFFFF`), a signature hot-magenta accent (`#D81B60` or equivalent Booksy-pink), and warm supporting tones, expressed as semantic tokens for both light and dark themes.
2. THE Design_Token_System SHALL define a bold typography scale using Vazirmatn at heroic display sizes (minimum 3rem for hero headlines), with tight letter-spacing for display text (`-0.02em`) and generous body line-height (1.75) for Persian legibility.
3. THE NYC_Aesthetic SHALL employ high-contrast design: bold black headlines on white, magenta CTAs that pop, minimal mid-tones in primary UI, creating the confident editorial look of a NYC fashion magazine.
4. THE Design_Token_System SHALL define a dark theme that inverts to a true noir aesthetic (rich black backgrounds, glowing magenta accents, luminous white text) evoking NYC nightlife and neon signage.
5. WHEN the active theme changes between light and dark, THE Design_Token_System SHALL update all token-driven styling immediately without a full page reload and without layout shift.
6. THE Design_Token_System SHALL define all color pairings such that text on backgrounds meets WCAG 2.1 AA contrast (at least 4.5:1 for normal text, at least 3:1 for large text and non-text UI components).

### Requirement 3: Modern Animation and Motion System

**User Story:** As a user, I want fluid, purposeful animations throughout the app, so that the experience feels alive, responsive, and premium.

#### Acceptance Criteria

1. THE Animation_System SHALL implement page transitions using Framer Motion's `AnimatePresence` with crossfade and directional slide (slide direction respects RTL — entering pages slide from inline-start).
2. THE Animation_System SHALL implement scroll-triggered reveal animations for content sections: staggered card entrances, fade-up text reveals, and parallax depth effects on hero imagery.
3. THE Animation_System SHALL provide micro-interactions for all interactive elements: scale-on-press for buttons (0.97 scale), hover-lift for cards (translateY + shadow increase), and focus-glow for inputs.
4. THE Animation_System SHALL implement a signature booking-confirmation celebration moment (for example a burst of confetti particles or an expanding success ring) using the emphasized easing curve.
5. WHILE the user has `prefers-reduced-motion: reduce` set, THE Animation_System SHALL disable transform-based animations, parallax, and particle effects, retaining only opacity crossfades and essential state feedback.
6. THE Animation_System SHALL express all animation durations and easing curves using design tokens (`--dur-fast: 150ms`, `--dur-base: 200ms`, `--dur-slow: 300ms`, `--ease-standard`, `--ease-emphasized`), and SHALL NOT use raw millisecond or easing literals.
7. THE Animation_System SHALL animate only compositor-friendly properties (`transform`, `opacity`), and SHALL NOT animate properties that trigger layout reflow (`width`, `height`, `top`, `left`).
8. THE Animation_System SHALL implement a staggered entrance pattern for lists and grids where child items animate in sequentially with a 50ms delay between each, creating a cascading reveal effect.

### Requirement 4: Booksy-Inspired Landing Page

**User Story:** As a potential salon owner visiting the platform for the first time, I want a stunning, conversion-focused landing page, so that I immediately understand the value and am motivated to sign up.

#### Acceptance Criteria

1. WHEN the Landing_Page renders at `/`, THE page SHALL present a full-viewport hero section with bold Persian headline text at heroic scale (minimum 3rem), a high-quality salon/beauty background image with an overlay scrim, and a single prominent magenta CTA button.
2. THE Landing_Page hero SHALL implement a parallax scrolling effect on the background image (respecting reduced-motion) creating depth as the user scrolls.
3. THE Landing_Page SHALL present a "How It Works" section using Booksy's pattern of numbered steps with icons, using an editorial asymmetric layout rather than a uniform row of equal cards.
4. THE Landing_Page SHALL present a social proof section with real platform metrics (number of salons, bookings completed, customer satisfaction) displayed as large animated counter numbers with Persian numerals.
5. THE Landing_Page SHALL present a salon showcase section using a Booksy-style card grid (photography-forward, with salon name, rating, and primary service visible) implementing staggered scroll-reveal animations.
6. THE Landing_Page SHALL present a features/benefits section directed at salon owners (reduced no-shows, online bookings, calendar management) using editorial split layouts with alternating image/text sides.
7. THE Landing_Page SHALL present a final conversion section with a clear CTA and urgency messaging, different in visual treatment from the hero.
8. WHEN the Landing_Page loads on a representative mid-range mobile device, THE page SHALL meet Core Web Vitals: LCP under 2.5s, INP under 200ms, CLS under 0.1.
9. THE Landing_Page SHALL be fully responsive, adapting from a dramatic desktop editorial layout to a vertical, thumb-friendly mobile experience without horizontal overflow.
10. THE Landing_Page SHALL be marked indexable with unique title, meta description, canonical URL, Open Graph metadata, and JSON-LD structured data (`WebSite` + `Organization`).

### Requirement 5: Booksy-Inspired Search and Discovery

**User Story:** As a customer, I want to discover salons through a modern search and browsing experience, so that I can find the right salon for my needs quickly and enjoyably.

#### Acceptance Criteria

1. WHEN a Discovery_Surface renders (city pages at `/city/:city`, service pages at `/services/:type`), THE page SHALL present a Booksy-style browsable grid of salon cards featuring: hero photography, salon name, rating badge, location indicator, and starting price in Rial with Persian numerals.
2. THE Discovery_Surface SHALL implement filter/sort controls (by service type, by rating, by distance) using a sticky or collapsible filter bar inspired by Booksy's search interface.
3. THE salon cards on Discovery_Surface SHALL implement hover animations (card lift with shadow increase) and press feedback (scale 0.98), with staggered entrance animations on initial load.
4. THE Discovery_Surface SHALL display results in a responsive grid: 3 columns on desktop, 2 on tablet, single column with horizontal scroll cards on mobile.
5. WHILE the Discovery_Surface is loading results, THE page SHALL display skeleton cards matching the final card dimensions and layout, not a centered spinner.
6. IF no salons match the current filters, THEN THE Discovery_Surface SHALL display a styled empty state with a helpful suggestion and a clear next action in Persian.
7. THE Discovery_Surface SHALL be marked indexable with unique title, meta description, and JSON-LD `BreadcrumbList` structured data.

### Requirement 6: Booksy-Inspired Salon Profile Page

**User Story:** As a customer, I want a visually rich salon profile page, so that I can evaluate the salon and feel confident booking an appointment.

#### Acceptance Criteria

1. WHEN the Salon_Profile renders at `/s/:slug`, THE page SHALL present a Booksy-style hero header with: a full-width gallery image (or image carousel), the salon name in bold display type, location, rating, and a prominent "Book Now" CTA.
2. THE Salon_Profile SHALL present services in a Booksy-style list/card format: service name, duration, price in Rial (Persian numerals), and a per-service "Book" button, grouped by category with expandable sections.
3. THE Salon_Profile SHALL present salon information sections: about/description, opening hours (Iranian week — Saturday first), address with map embed, and staff/team gallery.
4. THE Salon_Profile SHALL implement scroll-triggered animations: services cards stagger in on scroll, gallery images have a subtle parallax effect, and section headers reveal with a fade-up.
5. WHEN the "Book Now" CTA is activated, THE page SHALL navigate to the Booking_Flow entry point for that salon with a smooth page transition.
6. THE Salon_Profile SHALL apply the salon's Brand_Accent (if configured) to primary CTAs and brand surfaces through scoped token overrides, maintaining WCAG AA contrast.
7. THE Salon_Profile SHALL embed JSON-LD structured data: `BeautySalon`/`HairSalon`, `Service` list with prices in IRR, `BreadcrumbList`, and `OpeningHoursSpecification` using the Iranian week.
8. THE Salon_Profile SHALL be marked indexable with unique title containing the salon name and city, meta description, canonical URL, and Open Graph metadata with the salon's hero image.

### Requirement 7: Booksy-Inspired Booking Flow

**User Story:** As a customer, I want a streamlined, visually polished booking experience, so that I can select a service, pick a time, and confirm my appointment with minimal friction.

#### Acceptance Criteria

1. THE Booking_Flow SHALL present a multi-step experience inspired by Booksy: service selection → date/time selection → confirmation, with a visible progress stepper showing the current step and completed steps.
2. WHEN the service selection step renders, THE Booking_Flow SHALL display services in a Booksy-style card list with service name, duration, price (Rial, Persian numerals), and a select action, with smooth selection animation (highlight + checkmark entrance).
3. WHEN the date/time step renders, THE Booking_Flow SHALL present a Jalali date picker with Persian month/weekday labels and a time-slot grid below, with available slots styled as selectable chips and unavailable slots visually muted.
4. WHEN a time slot is selected, THE slot chip SHALL animate to a selected state (magenta fill, scale pulse) providing immediate tactile feedback.
5. WHEN the confirmation step renders, THE Booking_Flow SHALL display a summary card with: selected service, date (Jalali), time, price (Rial), and the salon name, styled as a premium receipt-like card.
6. WHEN the booking is confirmed successfully, THE Booking_Flow SHALL present a celebratory success screen with the signature confirmation animation (expanding ring or confetti) and booking details.
7. THE Booking_Flow SHALL implement smooth step-to-step page transitions (directional slide respecting RTL) using `AnimatePresence`.
8. WHILE any Booking_Flow step is loading data, THE step SHALL display a skeleton matching the expected content layout; IF an error occurs, THEN THE step SHALL display a friendly error with a retry action in Persian.
9. THE Booking_Flow SHALL be fully operable by keyboard with logical focus order in RTL, and SHALL maintain state when navigating backward between steps.
10. THE Booking_Flow steps SHALL NOT be indexed by search engines (meta `noindex`).

### Requirement 8: NYC-Styled Owner Dashboard

**User Story:** As a salon owner, I want a sleek, data-dense dashboard that feels modern and professional, so that I can manage my salon efficiently and enjoy using the platform.

#### Acceptance Criteria

1. WHEN the Owner_Dashboard renders, THE UI SHALL present a dark-mode-first aesthetic inspired by premium NYC SaaS dashboards: high-contrast data on dark surfaces, magenta accent for key metrics and actions, and clean data density.
2. WHEN the calendar page (`/owner/calendar`) renders, THE Owner_Dashboard SHALL present day and week views with a modern time grid, appointments shown as colored blocks with service and customer info, and smooth transitions when switching between views.
3. WHEN the analytics page (`/owner/analytics`) renders, THE Owner_Dashboard SHALL present metrics (utilization, revenue in Rial with Persian numerals, busiest windows) using modern chart components with the NYC aesthetic (bold numbers, minimal chrome, magenta highlights for key data).
4. WHEN the configuration page (`/owner/config`) renders, THE Owner_Dashboard SHALL present staff, services, chairs, and holidays in organized card-based sections with inline edit affordances and smooth expand/collapse animations.
5. THE Owner_Dashboard navigation SHALL use a sidebar pattern on desktop (collapsible with icons-only mode) and a bottom tab bar on mobile, with smooth transition animations between nav states.
6. THE Owner_Dashboard SHALL implement micro-interactions: hover effects on data cells, smooth number counting animations for metrics, and subtle transitions when data updates.
7. WHILE any Owner_Dashboard surface is loading, THE surface SHALL display a skeleton matching the final layout; IF loading fails, THEN THE surface SHALL display an error state with cause and retry action in Persian.
8. THE Owner_Dashboard SHALL support keyboard operation for view switching, date navigation, and grid cell focus, with correct RTL arrow-key direction.

### Requirement 9: Photography and Visual Content Strategy

**User Story:** As a user, I want high-quality salon imagery throughout the platform, so that the experience feels aspirational and trustworthy.

#### Acceptance Criteria

1. THE redesign SHALL use Firecrawl to gather salon/beauty photography references from Booksy.com and similar platforms for use as placeholder/sample imagery during development.
2. THE Landing_Page and Discovery_Surface SHALL incorporate high-quality salon photography: stylish interiors, beauty treatments in progress, styled results — with a NYC editorial photography feel (high contrast, dramatic lighting, confident subjects).
3. THE images SHALL be served in modern formats (AVIF/WebP with JPEG fallback) using responsive `srcset` and explicit `width`/`height` attributes to prevent CLS.
4. THE images below the fold SHALL be lazy-loaded; THE hero/LCP image SHALL be eagerly loaded with `fetchpriority="high"` and preloaded via `<link rel="preload">`.
5. THE images SHALL carry meaningful Persian `alt` text describing the content (for example «نمونه کار رنگ مو در سالن زیبایی»); decorative images SHALL use empty `alt=""`.
6. WHERE salon-specific imagery is not available, THE platform SHALL display a styled placeholder using the brand motif and signature palette rather than a generic gray box.

### Requirement 10: Responsive Design and Mobile-First Booking

**User Story:** As a mobile user scanning a QR code, I want the booking experience to be optimized for one-handed phone use, so that I can book quickly and comfortably.

#### Acceptance Criteria

1. THE entire Booking_Platform SHALL be responsive across breakpoints: mobile (360–480px), tablet (768px), desktop (1024px), and wide (1280px+) with no horizontal overflow at any breakpoint.
2. THE Booking_Flow SHALL be optimized for mobile-first use: primary CTAs in the bottom third of the viewport (thumb zone), full-width action buttons, and bottom-sheet patterns for date/time pickers.
3. THE Landing_Page SHALL adapt from a dramatic multi-column desktop layout to a vertical, scroll-friendly mobile layout with full-bleed imagery and stacked content sections.
4. THE Owner_Dashboard SHALL present a data-dense multi-panel layout on desktop and a single-column, tab-switched layout on mobile with appropriate information density at each breakpoint.
5. WHEN viewed on mobile, THE navigation SHALL collapse to contextual patterns: no navigation during the booking funnel (it is self-contained), bottom tab bar for the owner dashboard, and a minimal hamburger or slide-in for discovery pages.
6. THE touch targets SHALL be at least 44x44px with adequate spacing, and THE interactive elements SHALL provide visible press feedback on touch devices.

### Requirement 11: RTL, Persian Typography, Jalali Dates, and Localization

**User Story:** As an Iranian user, I want perfect RTL rendering, Persian typography, and localized dates/numbers, so that the NYC-inspired design feels authentically Persian.

#### Acceptance Criteria

1. THE entire Booking_Platform SHALL render in RTL using CSS logical properties exclusively (no physical `left`/`right` for flow-relative spacing), with `dir="rtl"` and `lang="fa"` on the document root.
2. THE typography SHALL use Vazirmatn (self-hosted variable woff2) with the metrics-matched fallback, preloaded for above-the-fold content, with `font-display: swap`.
3. THE display/heading text SHALL use the bold display treatment (weight 800, line-height 1.15, tracking -0.01em) to maintain the NYC editorial bold type aesthetic in Persian script.
4. THE UI SHALL render all user-facing digits as Persian/Eastern-Arabic numerals (۰۱۲۳۴۵۶۷۸۹) for prices, dates, counts, and metrics; WHERE an input field requires Latin entry (phone, OTP), THE field SHALL keep Latin entry internally with `dir="ltr"` and normalize on submit.
5. THE UI SHALL display all dates using the Jalali (Shamsi) calendar with Persian month/weekday labels, converting to/from ISO at the API boundary only.
6. THE UI SHALL format monetary amounts as Iranian Rial with Persian digits, thousands grouping, and a localized currency label.
7. THE directional icons (chevrons, arrows, progress indicators) SHALL mirror correctly in RTL; universal icons (search, clock, checkmark) SHALL NOT mirror.
8. WHERE text mixes Persian with Latin or numeric runs, THE UI SHALL isolate the embedded run using `<bdi>` or `unicode-bidi: isolate` so ordering remains correct.

### Requirement 12: Accessibility (WCAG 2.2 AA)

**User Story:** As a user with a disability, I want the redesigned platform to meet accessibility standards, so that I can use it with assistive technology regardless of the premium visual treatment.

#### Acceptance Criteria

1. THE Booking_Platform SHALL target WCAG 2.2 Level AA across all redesigned surfaces and components.
2. THE interactive elements SHALL show a visible focus indicator (2px solid magenta ring, 2px offset) that satisfies WCAG 2.2 focus-appearance requirements.
3. THE Booking_Platform SHALL be fully operable by keyboard with a logical focus order correct under RTL, including all animations and transitions being non-blocking.
4. WHEN an animation or transition is playing, THE Animation_System SHALL NOT block keyboard operation or prevent the user from completing an action.
5. THE forms SHALL provide visible labels (never placeholder-as-label), inline error messages with icon and text tied via `aria-describedby`, and correct `aria-invalid` states.
6. WHEN dialogs, sheets, or modals open, THE component SHALL trap focus, restore focus to the trigger on close, close on Esc, and be labeled with `aria-labelledby`.
7. THE images and icons SHALL provide text alternatives in Persian, or SHALL be marked decorative (`alt=""`, `aria-hidden="true"`) when they convey no information.
8. WHEN the automated test suite runs, THE suite SHALL execute axe accessibility checks against key components and pages, and SHALL fail the build on serious or critical violations.
9. THE spec SHALL state explicitly that automated accessibility checks are necessary but not sufficient, and that full WCAG 2.2 AA compliance requires manual testing with assistive technologies and expert accessibility review.

### Requirement 13: Performance and Core Web Vitals

**User Story:** As a visitor, I want pages that load fast and interactions that feel instant, so that the premium animations never come at the cost of performance.

#### Acceptance Criteria

1. WHEN the public Landing_Page is measured on a representative mid-range mobile profile, THE page SHALL meet Core Web Vitals: LCP under 2.5s, INP under 200ms, CLS under 0.1.
2. THE Booking_Platform SHALL apply route-level code splitting so each route's initial bundle loads only what that route needs; the owner/admin bundles SHALL NOT load on public or booking routes.
3. THE public routes (Landing_Page, Discovery_Surface, Salon_Profile) SHALL be prerendered or statically generated so meaningful HTML is delivered without requiring client JavaScript to paint primary content.
4. THE authenticated routes (Booking_Flow, Owner_Dashboard) SHALL remain client-rendered.
5. THE Booking_Platform SHALL lazy-load non-critical assets: below-the-fold images, heavy chart libraries, and the Jalali date picker, reserving space to prevent CLS.
6. THE Animation_System SHALL not degrade INP: animations SHALL run on the compositor thread (transform/opacity only) and SHALL NOT block the main thread.
7. THE public pages' initial JavaScript SHALL stay within approximately 150KB gzip, excluding the owner/admin and heavy library bundles.
8. THE Vazirmatn font SHALL be self-hosted and subset to Arabic/Latin ranges in use, with the above-the-fold weight preloaded.

### Requirement 14: SEO and Structured Data

**User Story:** As the business, I want public pages to be discoverable in search engines with rich results, while keeping the authenticated app private.

#### Acceptance Criteria

1. THE public routes (Landing_Page at `/`, Discovery_Surface at `/city/:city` and `/services/:type`, Salon_Profile at `/s/:slug`, legal pages) SHALL be marked indexable with unique titles, meta descriptions, and canonical URLs.
2. THE authenticated routes (Booking_Flow, Owner_Dashboard, auth, QR landing) SHALL be marked `noindex` and excluded from the sitemap.
3. THE Salon_Profile SHALL embed JSON-LD structured data: `BeautySalon`/`HairSalon` with NAP, `Service` with prices in IRR, `BreadcrumbList`, and `OpeningHoursSpecification` respecting the Iranian week.
4. THE Landing_Page SHALL embed JSON-LD `WebSite` + `Organization` structured data.
5. THE Booking_Platform SHALL serve a `robots.txt` allowing public pages and disallowing app/admin/API paths, and a `sitemap.xml` listing only indexable URLs.
6. THE public pages SHALL declare Open Graph and Twitter Card metadata with `og:locale = fa_IR` and a branded OG image (1200x630, RTL-correct Persian text).
7. THE public pages SHALL declare `hreflang` self-reference (`fa-IR`) plus `x-default`.

### Requirement 15: PWA Polish and Installability

**User Story:** As a returning user, I want to install the app and have it feel like a native experience, so that I can access it quickly and reliably.

#### Acceptance Criteria

1. THE web app SHALL ship a complete web app manifest with: name, short_name (Persian), description, icons (192x192, 512x512, plus maskable variants), theme_color derived from the NYC magenta accent, background_color, `display: "standalone"`, `dir: "rtl"`, `lang: "fa"`, and `start_url`.
2. WHEN the app is offline, THE service worker SHALL serve a cached application shell so the app still loads with a meaningful offline state.
3. THE PWA SHALL satisfy installability criteria and display correctly when added to the home screen.
4. THE service worker and caching strategy SHALL NOT cache authenticated API responses in any way that could leak one user's data to another.
5. WHEN the theme switches between light and dark, THE `<meta name="theme-color">` SHALL update to match the active theme's primary color.

### Requirement 16: Firecrawl Integration for Design Research

**User Story:** As the design team, I want to use Firecrawl to systematically analyze Booksy.com, so that the redesign is informed by real competitor patterns rather than assumptions.

#### Acceptance Criteria

1. THE design process SHALL use the existing Firecrawl integration (configured in `.env.firecrawl` and `docker/firecrawl-compose.yml`) to crawl Booksy.com's public pages.
2. THE Firecrawl_Analysis SHALL target at minimum: Booksy.com home page, a sample salon profile, the booking flow entry, and the provider/search discovery page.
3. THE Firecrawl_Analysis results SHALL be documented as a design reference artifact capturing: layout patterns, color usage, typography treatment, CTA placement, card structures, and UX flow sequences.
4. WHERE Booksy.com uses specific imagery or visual patterns that cannot be directly reused (copyright), THE redesign SHALL create equivalent assets using original photography or generated imagery that captures the same aesthetic quality and NYC vibe.
5. THE Firecrawl_Analysis SHALL inform the final token values, layout compositions, and animation choices in the implementation, with documented rationale linking design decisions to the analyzed reference.

---

> **Automated checks are necessary but not sufficient.** Full WCAG 2.2 AA conformance requires manual testing with assistive technologies (VoiceOver/iOS, TalkBack/Android, NVDA — all in RTL/Farsi), keyboard-only walkthroughs, and expert accessibility review. Treat every automated pass as a floor, not a certificate.
