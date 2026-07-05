# Tasks — Booksy + New York Redesign

## Task 1: Firecrawl Design Research [Req 1, 16]
- [x] 1.1 Run Firecrawl analysis on Booksy.com pages (home, salon profile, booking flow, search/discovery)
- [x] 1.2 Document design patterns as `docs/design-research/booksy-analysis.md` (layouts, colors, typography, CTAs, photography)
- [x] 1.3 Gather photography references and document imagery direction for NYC editorial feel

## Task 2: Token System & Animation Foundation [Req 2, 3]
- [x] 2.1 Add heroic typography tokens to `tokens.css` (`--font-3xl` through `--font-5xl`, `--tracking-tight`, `--line-height-hero`)
- [x] 2.2 Add animation tokens to `tokens.css` (`--dur-enter`, `--dur-exit`, `--dur-stagger`, `--dur-celebration`, `--ease-spring`, `--ease-decelerate`)
- [x] 2.3 Update dark theme shadows with NYC noir glow shadows (`--shadow-glow`)
- [x] 2.4 Extend `tailwind.config.js` with heroic font sizes and animation token utilities
- [x] 2.5 Create `motion-variants.ts` with standardized Framer Motion variant library
- [x] 2.6 Upgrade `PageTransition` in `Motion.tsx` to Framer Motion `AnimatePresence` with RTL-aware directional slide
- [x] 2.7 Add `ScrollReveal` component using Framer Motion `useInView` + reduced-motion handling
- [x] 2.8 Add `StaggerContainer` and `StaggerItem` components for cascading entrance animations
- [x] 2.9 Create `Celebration.tsx` with `CelebrationRing` and `ConfettiParticles` components
- [x] 2.10 Create `ParallaxHero.tsx` component with scroll-driven parallax + reduced-motion fallback
- [x] 2.11 Create `AnimatedCounter.tsx` component for scroll-triggered number counting in Persian numerals
- [x] 2.12 Add micro-interaction props to `Button.tsx` (whileTap scale) and `Card.tsx` (hover-lift variant)
- [x] 2.13 Update contrast tests to validate new NYC palette pairings

## Task 3: Landing Page Redesign [Req 4, 9, 10, 13, 14]
- [x] 3.1 Redesign `MarketingHome.tsx` hero with `ParallaxHero` — full-viewport, AVIF background, heroic Persian headline, magenta CTA
  - depends on: 2.10
- [x] 3.2 Add social proof `MetricsSection` with `AnimatedCounter` components showing platform stats in Persian numerals
  - depends on: 2.11
- [x] 3.3 Enhance salon showcase section with `StaggerContainer`/`StaggerItem` for cascading card reveals
  - depends on: 2.8
- [x] 3.4 Add `OwnerBenefitsSection` with editorial split layouts (alternating image/text) for salon owner features
  - depends on: 2.7
- [x] 3.5 Redesign "How It Works" section with asymmetric editorial layout (not equal cards)
- [x] 3.6 Redesign final CTA section with distinct visual treatment from hero
- [x] 3.7 Add hero image assets (AVIF/WebP/PNG at responsive sizes) for landing page
- [x] 3.8 Verify landing page Core Web Vitals: LCP < 2.5s, CLS < 0.1, responsive at all breakpoints
  - depends on: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7

## Task 4: Discovery Pages Redesign [Req 5, 9, 10, 14]
- [x] 4.1 Create `FilterBar.tsx` component — sticky filter chips for service type, rating, sort with URL sync
- [x] 4.2 Redesign `DiscoveryPages.tsx` (CityPage/ServicePage) with filter bar, staggered card grid, and skeleton loading
  - depends on: 4.1, 2.8
- [x] 4.3 Enhance `SalonCard.tsx` with photography-forward NYC design, hover-lift, and press feedback animations
  - depends on: 2.12
- [x] 4.4 Add empty state for no filter results with reset action in Persian
- [x] 4.5 Add infinite scroll pagination (load next 24 salons on scroll-to-bottom)
  - depends on: 4.2
- [x] 4.6 Verify discovery pages: responsive grid (3/2/1 columns), SEO structured data, skeleton states
  - depends on: 4.2, 4.3, 4.4, 4.5

## Task 5: Salon Profile Redesign [Req 6, 9, 10, 14]
- [x] 5.1 Create `ImageCarousel.tsx` — swipeable gallery with drag gestures, dots, RTL-mirrored arrows
- [x] 5.2 Redesign `SalonProfilePage.tsx` hero with carousel, display type, rating, "Book Now" CTA
  - depends on: 5.1
- [x] 5.3 Redesign services section as expandable categories with per-service "Book" button, stagger animations
  - depends on: 2.8
- [x] 5.4 Add salon info sections: about (show more toggle), hours (Iranian week), staff gallery, map embed (lazy)
- [x] 5.5 Add scroll-triggered animations to profile sections (fade-up headers, parallax gallery)
  - depends on: 2.7
- [x] 5.6 Ensure brand accent scoping works with `TenantTheme` + WCAG AA fallback
- [x] 5.7 Add/verify JSON-LD structured data (BeautySalon, Service, BreadcrumbList, OpeningHoursSpecification)
- [x] 5.8 Verify profile page: responsive, RTL, SEO indexable, accessible carousel navigation
  - depends on: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7

## Task 6: Booking Flow Redesign [Req 7, 10, 12]
- [x] 6.1 Create `BookingStepper.tsx` — horizontal progress indicator with Persian step labels, RTL flow
- [ ] 6.2 Add AnimatePresence step transitions to booking flow (directional slide, RTL-aware)
  - depends on: 2.6
- [ ] 6.3 Enhance service selection with card-based Booksy layout, selection animation (highlight + checkmark)
  - depends on: 6.1
- [ ] 6.4 Create `MobileDatePicker.tsx` — bottom-sheet wrapper for `JalaliDatePicker` on mobile
- [ ] 6.5 Add slot chip selection animation (magenta fill, scale pulse) to `SlotGrid.tsx`
  - depends on: 2.12
- [ ] 6.6 Redesign `BookingConfirmPage.tsx` as premium receipt-like summary card
- [ ] 6.7 Enhance `BookingSuccessPage.tsx` with celebration animation (CelebrationRing + ConfettiParticles)
  - depends on: 2.9
- [ ] 6.8 Ensure booking flow is fully keyboard-operable with RTL focus order and maintains state on back-navigation
  - depends on: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
- [ ] 6.9 Verify booking steps are noindex, thumb-zone CTAs on mobile, error/skeleton states complete
  - depends on: 6.8

## Task 7: Owner Dashboard Redesign [Req 8, 10, 12]
- [ ] 7.1 Create `OwnerSidebar.tsx` — collapsible sidebar nav with icons-only mode, role-filtered, RTL
- [ ] 7.2 Create `OwnerBottomTabs.tsx` — mobile bottom tab bar with active indicator animation
- [ ] 7.3 Rework `OwnerShell.tsx` to use sidebar (desktop) + bottom tabs (mobile) with responsive switching
  - depends on: 7.1, 7.2
- [ ] 7.4 Redesign `OwnerCalendarPage.tsx` — day/week views, time grid, appointment blocks, view-switch animation
  - depends on: 7.3
- [ ] 7.5 Redesign `OwnerAnalyticsPage.tsx` — metrics cards with counter animation, charts with NYC styling, lazy-loaded chart lib
  - depends on: 7.3, 2.11
- [ ] 7.6 Redesign `OwnerConfigurationPage.tsx` — card sections with expand/collapse, inline edit, add/remove animations
  - depends on: 7.3
- [ ] 7.7 Apply dark-mode-first styling to all owner surfaces (default dark, overridable)
  - depends on: 7.4, 7.5, 7.6
- [ ] 7.8 Verify dashboard: keyboard nav (RTL arrows), skeleton/error states, Jalali dates, Persian numerals, responsive
  - depends on: 7.7

## Task 8: Photography & Assets [Req 9]
- [ ] 8.1 Create `SalonPlaceholder.tsx` — branded placeholder using Motif + signature palette
- [ ] 8.2 Generate/source NYC editorial salon photography for landing and discovery placeholders
  - depends on: 1.3
- [ ] 8.3 Process images through AVIF/WebP pipeline with responsive srcset (640w, 960w, 1280w)
  - depends on: 8.2
- [ ] 8.4 Ensure all images have Persian alt text, explicit width/height, correct loading/fetchpriority attributes
  - depends on: 8.3

## Task 9: PWA & SEO Polish [Req 14, 15]
- [ ] 9.1 Update `manifest.json` with NYC magenta theme_color, Persian metadata, maskable icon
- [ ] 9.2 Verify service worker caching strategy (no auth data leakage, offline shell works)
- [ ] 9.3 Verify all public pages are prerendered with correct meta, canonical, OG, hreflang, JSON-LD in initial HTML
  - depends on: 3.8, 4.6, 5.8
- [ ] 9.4 Generate branded OG images (1200x630, RTL-correct Persian text, magenta brand)
- [ ] 9.5 Verify robots.txt + sitemap.xml list only indexable URLs
