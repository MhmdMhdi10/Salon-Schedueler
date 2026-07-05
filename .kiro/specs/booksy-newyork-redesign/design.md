# Design Document — Booksy + New York Redesign

## 1. Overview

### What This Redesign Changes

This spec repaints the existing Salon Booking PWA with a **Booksy.com-inspired design language** infused with a **New York City aesthetic**. It replaces the salon-luxe plum-wine palette (documented in the "Signature Design Language" workspace rule) with a bold, high-contrast NYC identity centered on hot-magenta (`#D81B60`) over near-black/white foundations.

**Superseded direction:** The existing `ui-ux-skills.md` "Signature Design Language" section describes a plum-wine primary (`#8E2F50`) with terracotta-clay accent over warm bone/sand neutrals. This redesign **replaces** that palette direction entirely. The token names, component architecture, accessibility patterns, RTL-first logic, and layout primitives remain — only the token values, visual energy, animation depth, and page compositions change.

**What stays:**
- Component library architecture (Radix UI primitives, token-driven)
- RTL-first logical CSS, `dir="rtl"` + `lang="fa"` contract
- Vazirmatn variable font (self-hosted, metrics-matched fallback)
- Route structure (`/`, `/s/:slug`, `/city/:city`, `/services/:type`, `/salon/:salonId/book`, `/owner/*`)
- SEO infrastructure (`SeoHead`, `JsonLd`, prerender pipeline)
- PWA configuration (`vite-plugin-pwa`, service worker, manifest)
- Code-splitting strategy (route-level lazy loading, manual chunks)
- `EditorialSplit`, `FeatureMosaic`, `SectionRhythm`, `Motif` components
- `PageTransition`, `Reveal` motion components
- `distinctiveness.test.ts` guardrail (no indigo/purple family)

**What changes:**
- Token values in `tokens.css` (already partially migrated to NYC palette)
- Animation system: upgrade from CSS keyframe-only to Framer Motion `AnimatePresence` + richer micro-interactions
- All page compositions: hero treatments, section layouts, card designs
- Owner dashboard: dark-mode-first NYC SaaS aesthetic
- Booking flow: Booksy-style multi-step with celebration animation
- Photography strategy: NYC editorial feel, AVIF/WebP pipeline

### Relationship to Existing Specs

| Spec | Relationship |
|------|-------------|
| `ui-ux-redesign` | Superseded for visual direction; component architecture preserved |
| `signature-ui-system` | Superseded for palette/motif values; layout primitives preserved |
| Workspace rule: "Signature Design Language" | **Palette direction superseded** by this spec's NYC identity |
| Workspace rule: `distinctiveness.test.ts` | Still enforced — no indigo/purple family allowed |
| Workspace rule: tokens-only + logical properties | Still enforced |
| Workspace rule: tenant accent via runtime CSS vars | Still enforced |

---

## 2. Token System Update

### NYC Palette (Current State in `tokens.css`)

The token file has **already been migrated** to the NYC-inspired palette. These are the shipped values:

#### Light Theme (`:root`)

| Token | Value | Role |
|-------|-------|------|
| `--color-bg` | `#FFFFFF` | Clean white page background |
| `--color-surface` | `#F6F7F9` | Cool-gray cards, sheets |
| `--color-elevated` | `#FFFFFF` | Menus, dialogs, popovers |
| `--color-text` | `#1A1D23` | Near-black primary ink |
| `--color-text-muted` | `#5B6573` | Cool-gray secondary text |
| `--color-border` | `#E6E8EC` | Cool dividers |
| `--color-primary` | `#D81B60` | Hot-magenta brand CTA |
| `--color-primary-contrast` | `#FFFFFF` | White text on magenta |
| `--color-secondary` | `#1F8A70` | Teal secondary action |
| `--color-accent` | `#FF6B35` | Warm-orange highlight |
| `--color-success` | `#1F7A43` | Confirmed states |
| `--color-warning` | `#9A5B12` | Warning states |
| `--color-danger` | `#B3261E` | Error/cancel states |
| `--color-info` | `#1F5FAE` | Neutral notices |
| `--color-focus-ring` | `#D81B60` | Focus outline (magenta) |

#### Dark Theme (`[data-theme="dark"]`) — NYC Noir

| Token | Value | Role |
|-------|-------|------|
| `--color-bg` | `#121212` | True noir page background |
| `--color-surface` | `#181818` | Dark cards |
| `--color-elevated` | `#1F1F1F` | Menus/dialogs on noir |
| `--color-text` | `#FAFAFA` | Luminous white text |
| `--color-text-muted` | `#A8A8A8` | Gray secondary text |
| `--color-border` | `#262626` | Subtle dark dividers |
| `--color-primary` | `#FF6B9D` | Glowing magenta (neon) |
| `--color-primary-contrast` | `#121212` | Dark text on neon |
| `--color-secondary` | `#79C9BB` | Teal glow |
| `--color-accent` | `#ECA486` | Warm peach highlight |
| `--color-success` | `#69D08C` | Green glow |
| `--color-warning` | `#E7B45C` | Amber glow |
| `--color-danger` | `#F2938C` | Red glow |
| `--color-info` | `#86B6F0` | Blue glow |
| `--color-focus-ring` | `#FF6B9D` | Focus (magenta glow) |

### New Typography Tokens — Heroic Scale

Add to `tokens.css` for the NYC bold headline treatment:

```css
:root {
  /* Heroic display scale (Req 2.2, 4.1) */
  --font-3xl: 3rem;      /* 48px — hero headlines */
  --font-4xl: 3.75rem;   /* 60px — landing page hero (desktop) */
  --font-5xl: 4.5rem;    /* 72px — maximum display (wide screens) */

  /* NYC editorial tracking (tighter than body) */
  --tracking-display: -0.02em;  /* UPDATE from -0.01em */
  --tracking-tight: -0.03em;    /* NEW — heroic headlines only */

  /* Display line-heights for heroic scale */
  --line-height-hero: 1.05;     /* Very tight for 3xl+ */
}
```

Add corresponding Tailwind config entries:

```js
// tailwind.config.js → theme.extend.fontSize
'3xl': ['var(--font-3xl)', { lineHeight: 'var(--line-height-hero)' }],
'4xl': ['var(--font-4xl)', { lineHeight: 'var(--line-height-hero)' }],
'5xl': ['var(--font-5xl)', { lineHeight: 'var(--line-height-hero)' }],
```

### Animation Tokens (New)

```css
:root {
  /* Extended duration tokens */
  --dur-enter: 400ms;    /* Page/section entrance */
  --dur-exit: 250ms;     /* Exit transitions (faster than enter) */
  --dur-stagger: 50ms;   /* Delay between staggered children */
  --dur-celebration: 600ms; /* Booking success celebration */

  /* Spring-like easing for celebrations */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-decelerate: cubic-bezier(0, 0, 0.2, 1);
}
```

### Elevation Updates — NYC Noir Shadows

```css
[data-theme='dark'] {
  /* NYC noir: deeper, colored shadows with magenta glow hints */
  --shadow-1: 0 1px 3px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 107, 157, 0.04);
  --shadow-2: 0 4px 12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 107, 157, 0.06);
  --shadow-3: 0 12px 32px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 107, 157, 0.08);
  --shadow-glow: 0 0 24px rgba(255, 107, 157, 0.15); /* NEW — hero glow */
}
```

---

## 3. Animation Architecture

### System Overview

The animation system is built on **Framer Motion** (already chunked as `vendor-motion` in `vite.config.ts`) combined with the existing CSS keyframe animations in `tailwind.config.js`. The architecture layers:

1. **CSS Keyframes** (existing) — lightweight, compositor-only animations for skeletons, toasts, and reduced-motion-safe reveals
2. **Framer Motion** (upgrade) — page transitions via `AnimatePresence`, scroll-triggered orchestrations, gesture-driven micro-interactions, celebration sequences
3. **IntersectionObserver** (existing `Reveal` component) — scroll-triggered CSS class toggling for simple fade-up reveals

### Page Transitions — `AnimatePresence`

**File:** `packages/web/src/components/ui/Motion.tsx` (extend existing)

The existing `PageTransition` uses a CSS keyframe keyed on `pathname`. Upgrade to Framer Motion `AnimatePresence` for directional, interruptible transitions:

```tsx
// Updated PageTransition with AnimatePresence
import { AnimatePresence, motion } from 'framer-motion';

const pageVariants = {
  initial: { opacity: 0, x: -12 },  // RTL: from inline-start (negative x)
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 12 },
};

const pageTransition = {
  type: 'tween',
  duration: 0.3,           // --dur-slow equivalent
  ease: [0.2, 0, 0, 1],   // --ease-standard
};

export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const prefersReduced = useReducedMotion();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        variants={prefersReduced ? {} : pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

### Scroll-Triggered Reveals

Enhance the existing `Reveal` component with Framer Motion `useInView` for richer orchestration:

```tsx
// ScrollReveal — orchestrated version using Framer Motion
import { motion, useInView, useReducedMotion } from 'framer-motion';

const revealVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function ScrollReveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-10% 0px' });
  const prefersReduced = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      variants={prefersReduced ? {} : revealVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      transition={{ duration: 0.4, delay, ease: [0.2, 0, 0, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
```

### Staggered Entrance Pattern (Req 3.8)

For lists and grids, children animate in with 50ms stagger:

```tsx
// StaggerContainer + StaggerItem
const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05, // 50ms = --dur-stagger
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.2, 0, 0, 1] } },
};

export function StaggerContainer({ children, className }: Props) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-5%' });
  return (
    <motion.div
      ref={ref}
      variants={containerVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: Props) {
  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  );
}
```

### Micro-Interactions (Req 3.3)

| Element | Interaction | Implementation |
|---------|-------------|----------------|
| Buttons | Scale-on-press 0.97 | `whileTap={{ scale: 0.97 }}` |
| Cards | Hover-lift + shadow increase | `whileHover={{ y: -4, boxShadow: 'var(--shadow-2)' }}` |
| Inputs | Focus-glow | CSS `box-shadow` transition on `:focus-visible` using `--color-focus-ring` |
| Slot chips | Selection pulse | `animate={{ scale: [1, 1.05, 1] }}` on select |
| Checkmarks | Draw-in | SVG path animation with `pathLength` |

### Celebration Animation (Req 3.4)

**File:** `packages/web/src/components/ui/Celebration.tsx` (new)

The booking success celebration uses an expanding ring + particle burst:

```tsx
export function CelebrationRing() {
  const prefersReduced = useReducedMotion();
  if (prefersReduced) return null;

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      initial={{ scale: 0, opacity: 1 }}
      animate={{ scale: 2.5, opacity: 0 }}
      transition={{
        duration: 0.6,  // --dur-celebration
        ease: [0.34, 1.56, 0.64, 1],  // --ease-spring
      }}
    >
      <div className="h-24 w-24 rounded-full border-4 border-primary" />
    </motion.div>
  );
}
```

### Parallax Hero Effect (Req 4.2)

```tsx
export function ParallaxHero({ imageSrc, children }: Props) {
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], [0, -100]);
  const prefersReduced = useReducedMotion();

  return (
    <div className="relative h-[80vh] overflow-hidden">
      <motion.div
        className="absolute inset-0"
        style={{ y: prefersReduced ? 0 : y }}
      >
        <img src={imageSrc} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg/80 to-transparent" />
      </motion.div>
      <div className="relative z-10 flex h-full items-end pb-10">
        {children}
      </div>
    </div>
  );
}
```

### Reduced-Motion Handling (Req 3.5)

- **CSS layer:** Global `@media (prefers-reduced-motion: reduce)` in `tokens.css` already clamps all `animation-duration` / `transition-duration` to `0.01ms`
- **Framer Motion layer:** `useReducedMotion()` hook gates all transform-based animations; only opacity crossfades remain
- **Implementation rule:** Every motion component MUST check `useReducedMotion()` and fall back to static rendering or opacity-only fade
- **Compositor-only rule (Req 3.7):** All Framer Motion animations MUST use only `opacity`, `scale`, `x`, `y`, `rotate` — never `width`, `height`, `top`, `left`

---

## 4. Landing Page Architecture

### Section Structure (Top to Bottom)

| # | Section | Component | Req |
|---|---------|-----------|-----|
| 1 | Parallax Hero | `HeroSection` | 4.1, 4.2 |
| 2 | Category Tiles | `CategoryRow` (existing) | — |
| 3 | How It Works | `HowItWorksSection` | 4.3 |
| 4 | Social Proof Counters | `MetricsSection` | 4.4 |
| 5 | Salon Showcase Grid | `SalonShowcaseSection` | 4.5 |
| 6 | Features/Benefits (Owners) | `OwnerBenefitsSection` | 4.6 |
| 7 | FAQ Accordion | `FaqSection` (existing) | — |
| 8 | Final CTA | `FinalCtaSection` | 4.7 |

### Hero Section (Req 4.1, 4.2)

```
┌─────────────────────────────────────────────────────┐
│  [Full-viewport parallax background image]          │
│  ┌───────────────────────────────────────────────┐  │
│  │ Overlay scrim (from-bg/80 to-transparent)     │  │
│  │                                               │  │
│  │  "بهترین سالن‌های زیبایی را کشف کنید"          │  │
│  │  (3xl+ bold display, Persian)                 │  │
│  │                                               │  │
│  │  Subtitle text (md, muted)                    │  │
│  │                                               │  │
│  │  [█████ Search CTA (magenta) █████]           │  │
│  │                                               │  │
│  │  Trust badges (inline pills)                  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

- Background: high-quality salon photography (AVIF/WebP, `fetchpriority="high"`, preloaded)
- Headline: `text-3xl md:text-4xl lg:text-5xl text-display` with `--tracking-tight`
- Single prominent magenta CTA (search/book)
- Parallax scroll via `useTransform` (disabled under reduced-motion)
- LCP element: the hero image, preloaded as AVIF

### Animated Counter Section (Req 4.4)

```tsx
// AnimatedCounter — counts up from 0 to target using Framer Motion
import { useSpring, motion, useInView } from 'framer-motion';

export function AnimatedCounter({ target, label }: { target: number; label: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const spring = useSpring(0, { duration: 1200 });

  useEffect(() => {
    if (isInView) spring.set(target);
  }, [isInView, target, spring]);

  return (
    <div ref={ref} className="text-center">
      <motion.span className="text-3xl text-display text-primary">
        {/* Renders Persian numerals via toPersianDigits */}
      </motion.span>
      <p className="text-sm text-muted mt-2">{label}</p>
    </div>
  );
}
```

### Salon Showcase Grid (Req 4.5)

- Uses `StaggerContainer` + `StaggerItem` for cascading reveal
- `SalonCard` component (existing) with hover-lift micro-interaction
- 3-column desktop, 2-column tablet, single-column mobile
- Photography-forward: salon hero image takes 60% of card height

---

## 5. Discovery Surface Architecture

### Page Layout (Req 5.1–5.7)

**Files:** `packages/web/src/pages/DiscoveryPages.tsx` (existing — `CityPage`, `ServicePage`)

```
┌─────────────────────────────────────────────────────┐
│  Page Header (h1: city/service name)                │
│  Breadcrumb: خانه › تهران                            │
├─────────────────────────────────────────────────────┤
│  Filter Bar (sticky on scroll)                      │
│  [Service Type ▼] [Rating ▼] [Sort ▼]              │
├─────────────────────────────────────────────────────┤
│  Results Grid                                       │
│  ┌──────┐ ┌──────┐ ┌──────┐                        │
│  │ Card │ │ Card │ │ Card │  (3-col desktop)       │
│  └──────┘ └──────┘ └──────┘                        │
│  ┌──────┐ ┌──────┐ ┌──────┐                        │
│  │ Card │ │ Card │ │ Card │                        │
│  └──────┘ └──────┘ └──────┘                        │
├─────────────────────────────────────────────────────┤
│  Pagination / Load More                             │
└─────────────────────────────────────────────────────┘
```

### Filter Bar Component

```tsx
interface FilterBarProps {
  serviceTypes: string[];
  selectedType: string | null;
  sortBy: 'rating' | 'distance' | 'price';
  onTypeChange: (type: string | null) => void;
  onSortChange: (sort: 'rating' | 'distance' | 'price') => void;
}
```

- Sticky at `--z-sticky` on scroll (below nav)
- Collapsible on mobile (expand/collapse toggle)
- Chips/pills for active filters with clear (x) affordance
- Smooth collapse/expand animation via Framer Motion `AnimatePresence`

### Salon Card (Discovery Variant)

```
┌───────────────────────────┐
│  [Hero Photography]       │  ← 16:9 aspect-ratio
│  ⭐ 4.8 (۱۲۳ نظر)         │  ← Rating badge overlay
├───────────────────────────┤
│  سالن زیبایی رز            │  ← Salon name (bold)
│  📍 ولنجک، تهران           │  ← Location
│  از ۲۵۰٬۰۰۰ ریال          │  ← Starting price
└───────────────────────────┘
```

- Hover: `whileHover={{ y: -4 }}` + shadow-2 transition
- Press: `whileTap={{ scale: 0.98 }}`
- Staggered entrance on initial load via `StaggerContainer`
- Link wraps entire card for accessibility

### Skeleton Loading (Req 5.5)

```tsx
// DiscoverySkeleton — matches exact card dimensions
function DiscoverySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border overflow-hidden">
          <Skeleton variant="rectangular" className="aspect-video w-full" />
          <div className="p-4 space-y-2">
            <Skeleton variant="text" className="w-3/4" />
            <Skeleton variant="text" className="w-1/2" />
            <Skeleton variant="text" className="w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Responsive Grid (Req 5.4)

```
Desktop (lg+):  grid-cols-3, gap-4
Tablet (md):    grid-cols-2, gap-4
Mobile (<md):   grid-cols-1, horizontal scroll cards option
```

### Empty State (Req 5.6)

```tsx
<EmptyState
  icon={<SearchX />}
  title={t('discovery.empty.title')}     // «سالنی یافت نشد»
  body={t('discovery.empty.body')}       // «فیلترها را تغییر دهید...»
  action={{ label: t('discovery.empty.clearFilters'), onClick: clearFilters }}
/>
```

---

## 6. Salon Profile Architecture

### Page Structure (Req 6.1–6.8)

**File:** `packages/web/src/pages/SalonProfilePage.tsx` (existing — major rework)

```
┌─────────────────────────────────────────────────────┐
│  Hero Header                                        │
│  [Full-width gallery / carousel image]              │
│  ┌─────────────────────────────────────────┐        │
│  │  سالن زیبایی رز (display, bold)         │        │
│  │  ⭐ 4.8 · آرایشگاه زنانه · ولنجک        │        │
│  │  [██ رزرو نوبت ██] (primary CTA)        │        │
│  └─────────────────────────────────────────┘        │
├─────────────────────────────────────────────────────┤
│  Services List (expandable categories)              │
│  ┌─────────────────────────────────────────┐        │
│  │  💇 کوتاهی مو     ۴۵ دقیقه   ۲۵۰٬۰۰۰  [رزرو] │
│  │  🎨 رنگ مو        ۹۰ دقیقه   ۸۰۰٬۰۰۰  [رزرو] │
│  └─────────────────────────────────────────┘        │
├─────────────────────────────────────────────────────┤
│  About / Description                                │
├─────────────────────────────────────────────────────┤
│  Opening Hours (Iranian week, Saturday first)       │
├─────────────────────────────────────────────────────┤
│  Staff Gallery                                      │
├─────────────────────────────────────────────────────┤
│  Address + Map embed (lazy-loaded)                  │
└─────────────────────────────────────────────────────┘
```

### Hero Gallery/Carousel

- Image carousel using `motion.div` with drag gestures (swipe on mobile)
- Navigation dots + prev/next arrows (mirrored for RTL)
- First image eager-loaded as LCP; subsequent images lazy
- Scrim overlay for text legibility on imagery

### Brand Accent Scoping (Req 6.6)

The existing `TenantTheme` component already scopes `--color-primary` overrides:

```tsx
// Already implemented in components/theme/TenantTheme.tsx
// The salon's brand_accent is injected as runtime CSS custom properties
// on the scoped wrapper, overriding --color-primary for the subtree.
<TenantTheme salonId={salon.id}>
  {/* All CTAs within render with salon's brand accent */}
</TenantTheme>
```

### Scroll Animations (Req 6.4)

- Services cards: stagger-in on scroll via `StaggerContainer`
- Gallery images: subtle parallax effect (10% translateY offset)
- Section headers: `ScrollReveal` with fade-up

---

## 7. Booking Flow Architecture

### Multi-Step Flow (Req 7.1–7.10)

**Routes:**
- `/salon/:salonId/book` — service + date/time selection (existing `AvailabilityPage`)
- `/salon/:salonId/book/confirm` — confirmation (existing `BookingConfirmPage`)
- `/booking/success` — celebration (existing `BookingSuccessPage`)

### Progress Stepper Component

```tsx
interface BookingStepperProps {
  currentStep: 1 | 2 | 3;  // service → date/time → confirm
  steps: Array<{ label: string; completed: boolean }>;
}
```

```
  ● ─────── ○ ─────── ○
  خدمت      تاریخ      تایید
  (active)  (pending)  (pending)
```

- Horizontal stepper with magenta fill for completed/active
- Numbers in Persian: ۱ ۲ ۳
- RTL: flows right-to-left
- Animated progress line between steps

### Step Transitions (Req 7.7)

```tsx
const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? -30 : 30,  // RTL: reversed direction
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? 30 : -30,
    opacity: 0,
  }),
};

// Inside BookingFlow:
<AnimatePresence mode="wait" custom={direction}>
  <motion.div
    key={currentStep}
    custom={direction}
    variants={stepVariants}
    initial="enter"
    animate="center"
    exit="exit"
    transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
  >
    {stepContent}
  </motion.div>
</AnimatePresence>
```

### Service Selection Step (Req 7.2)

- Service cards in a vertical list (grouped by category)
- Selection animation: card border transitions to primary, checkmark enters with scale-in
- `whileTap={{ scale: 0.97 }}` on each card

### Date/Time Step (Req 7.3, 7.4)

- `JalaliDatePicker` (existing component) — Persian months, Persian weekdays
- On mobile: renders as bottom-sheet (via `Sheet` component) triggered by a date chip
- Time slot grid using existing `SlotGrid` + `SlotChip` components
- Selected chip: magenta fill + scale pulse animation

```tsx
// Slot selection animation
<motion.button
  animate={selected ? { scale: [1, 1.05, 1], backgroundColor: 'var(--color-primary)' } : {}}
  transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
>
  {time}
</motion.button>
```

### Confirmation Card (Req 7.5)

```
┌─────────────────────────────────────┐
│  رزرو شما                            │
│  ─────────────────────────────────── │
│  خدمت:    کوتاهی مو                  │
│  تاریخ:   چهارشنبه ۱۷ اردیبهشت ۱۴۰۴  │
│  ساعت:    ۱۴:۳۰                      │
│  قیمت:    ۲۵۰٬۰۰۰ ریال              │
│  سالن:    سالن زیبایی رز              │
│  ─────────────────────────────────── │
│  [████ تایید رزرو ████]              │
└─────────────────────────────────────┘
```

- Premium receipt-like card with shadow-2 elevation
- Dotted divider lines (token-driven border)
- CTA in thumb zone (bottom third of viewport on mobile)

### Celebration Screen (Req 7.6)

**File:** `packages/web/src/pages/BookingSuccessPage.tsx` (existing — enhance)

- `CelebrationRing` expanding ring animation on mount
- Confetti particles (8–12 magenta/accent dots that burst outward and fade)
- Success icon (checkmark) with `success-pop` keyframe
- Booking details card below the celebration
- "Add to Calendar" + "Back to Home" secondary CTAs

---

## 8. Owner Dashboard Architecture

### Design Direction (Req 8.1)

Dark-mode-first NYC SaaS aesthetic. The owner panel defaults to dark theme regardless of system preference (overridable via toggle). High-contrast data on `#121212` backgrounds with magenta accent for key metrics.

### Navigation (Req 8.5)

**Desktop (lg+):** Collapsible sidebar
```
┌────┬────────────────────────────────┐
│ ☰  │  Content Area                  │
│    │                                │
│ 📅 │  (Calendar / Analytics / etc)  │
│ 📊 │                                │
│ ⚙️ │                                │
│    │                                │
│    │                                │
│[◁] │                                │
└────┴────────────────────────────────┘
```

**Mobile (<md):** Bottom tab bar
```
┌────────────────────────────────────┐
│  Content Area                      │
│                                    │
├────────────────────────────────────┤
│  📅       📊       ⚙️              │
│  تقویم    آمار     تنظیمات         │
└────────────────────────────────────┘
```

### Sidebar Component

```tsx
interface OwnerSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeRoute: string;
  role: 'owner' | 'admin' | 'stylist';
}
```

- Icons-only when collapsed (44x44px touch targets)
- Smooth width transition via `motion.aside` with `layout` prop
- Active indicator: magenta bar on inline-start edge
- Role-filtered: Stylist sees only calendar

### Calendar View (Req 8.2)

**File:** `packages/web/src/pages/owner/OwnerCalendarPage.tsx` (new/rework from `index.tsx`)

- Day view: vertical time grid (07:00–22:00), appointments as colored blocks
- Week view: 7-column grid (Saturday–Friday, Iranian week)
- Appointments: rounded blocks colored by service type, showing service name + customer
- View switching: animated slide transition between day/week
- Smooth transition when navigating dates (slide left/right, RTL-aware)

### Analytics Page (Req 8.3)

- Metrics cards at top: utilization %, revenue (Rial/Persian), bookings count
- Numbers animate up on view (counter animation)
- Chart area: utilization over time, busiest hours heatmap
- Chart styling: minimal chrome, magenta for key data lines, dark surface cards
- Lazy-loaded chart library (not in public bundle)

### Configuration Page (Req 8.4)

- Card-based sections: Staff, Services, Chairs/Resources, Holidays
- Expand/collapse with `AnimatePresence` and height animation via `motion.div` with `layout`
- Inline edit affordances: click field to edit, save indicator
- Add/remove animations: items slide in/out

### Micro-Interactions (Req 8.6)

- Data cells: subtle hover highlight (`bg-elevated` transition)
- Metrics: smooth number counting on data load
- Navigation: active tab indicator slides between items
- Loading: shimmer skeletons matching final layout

---

## 9. Photography & Image Strategy

### Image Pipeline (Req 9.1–9.6)

```
Source (JPEG/PNG) → Build Pipeline → AVIF + WebP + JPEG fallback
                                      ↓
                              Responsive srcset (640w, 960w, 1280w, 1920w)
```

### Implementation Pattern

```tsx
<Picture
  sources={[
    { type: 'image/avif', srcSet: `${base}-640.avif 640w, ${base}-1280.avif 1280w` },
    { type: 'image/webp', srcSet: `${base}-640.webp 640w, ${base}-1280.webp 1280w` },
  ]}
  src={`${base}-1280.jpg`}
  fallbackSrcSet={`${base}-640.jpg 640w, ${base}-1280.jpg 1280w`}
  sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
  width={1280}
  height={720}
  alt={t('salon.hero.alt', { name: salon.name })}
  loading="lazy"
/>
```

### Loading Strategy

| Position | Loading | Priority |
|----------|---------|----------|
| Hero/LCP image | `loading="eager"` | `fetchpriority="high"` + `<link rel="preload">` |
| Above-fold cards | `loading="eager"` | Default |
| Below-fold content | `loading="lazy"` | Default |
| Gallery carousel items | `loading="lazy"` | Default |

### Placeholder System (Req 9.6)

When salon-specific imagery is unavailable:

```tsx
function SalonPlaceholder({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center bg-surface', className)}>
      <Motif variant="watermark" className="h-16 w-16 text-border opacity-50" />
    </div>
  );
}
```

### Firecrawl Research Artifacts (Req 9.1, 16.1–16.5)

Design reference gathered from Booksy.com via Firecrawl integration:
- **Location:** `packages/web/src/assets/firecrawl-research/` (gitignored image refs)
- **Documentation:** `docs/design-research/booksy-analysis.md` (committed)
- Analysis covers: card layouts, CTA placement, photography treatment, color usage, typography hierarchy

---

## 10. Responsive Strategy

### Breakpoint System

| Name | Width | Use |
|------|-------|-----|
| `xs` | 360px | Minimum supported (phones) |
| `sm` | 480px | Large phones |
| `md` | 768px | Tablets, small laptops |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Wide desktop |

### Mobile-First Patterns

All components designed at 360px first, enhanced upward:

```css
/* Example: Discovery grid */
.discovery-grid {
  display: grid;
  grid-template-columns: 1fr;          /* mobile */
  gap: var(--space-4);
}
@media (min-width: 768px) {
  .discovery-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 1024px) {
  .discovery-grid { grid-template-columns: repeat(3, 1fr); }
}
```

### Bottom-Sheet Date Picker (Req 10.2)

On mobile (`< md`), the `JalaliDatePicker` renders inside a `Sheet` (bottom-sheet) component:

```tsx
function MobileDatePicker({ value, onChange }: Props) {
  const isMobile = useMediaQuery('(max-width: 767px)');

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <button className="...">
            <JalaliDate date={value} />
          </button>
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetTitle>{t('booking.selectDate')}</SheetTitle>
          <JalaliDatePicker value={value} onChange={onChange} variant="full" />
        </SheetContent>
      </Sheet>
    );
  }

  return <JalaliDatePicker value={value} onChange={onChange} variant="inline" />;
}
```

### Thumb-Zone CTAs (Req 10.2)

- Primary booking CTA: fixed to bottom of viewport on mobile (`position: sticky; bottom: 0`)
- Clear safe-area respect: `padding-bottom: env(safe-area-inset-bottom)`
- 48px min-height, full-width on mobile
- Elevated shadow to separate from content

---

## 11. SEO Architecture

### Prerender Strategy (Req 13.3, 14.1–14.7)

Public routes are prerendered at build time using `scripts/prerender.mjs`:

| Route Pattern | Prerendered | Index |
|---------------|-------------|-------|
| `/` | Yes | Yes |
| `/s/:slug` (all salons) | Yes | Yes |
| `/city/:city` | Yes | Yes |
| `/services/:type` | Yes | Yes |
| `/about`, `/contact`, `/privacy`, `/terms` | Yes | Yes |
| `/business` | Yes | Yes |
| `/auth`, `/qr/*`, `/salon/*/book*`, `/booking/*` | No | No |
| `/owner/*` | No | No |

### Structured Data Patterns

**Landing Page (`/`):**
```json
[
  { "@type": "WebSite", "name": "...", "url": "...", "inLanguage": "fa-IR" },
  { "@type": "Organization", "name": "...", "url": "...", "logo": "..." }
]
```

**Salon Profile (`/s/:slug`):**
```json
[
  {
    "@type": "BeautySalon",
    "name": "سالن رز",
    "address": { "@type": "PostalAddress", "addressLocality": "تهران", ... },
    "geo": { "@type": "GeoCoordinates", "latitude": ..., "longitude": ... },
    "openingHoursSpecification": [{ "dayOfWeek": ["Saturday", ...], ... }],
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "itemListElement": [
        { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "..." }, "price": "...", "priceCurrency": "IRR" }
      ]
    }
  },
  { "@type": "BreadcrumbList", "itemListElement": [...] }
]
```

**Discovery Pages:**
```json
{ "@type": "BreadcrumbList", "itemListElement": [
  { "@type": "ListItem", "position": 1, "name": "خانه", "item": "https://..." },
  { "@type": "ListItem", "position": 2, "name": "تهران", "item": "https://..." }
]}
```

### robots.txt (existing in `public/`)

```
User-agent: *
Allow: /
Disallow: /auth
Disallow: /owner/
Disallow: /admin/
Disallow: /salon/*/book
Disallow: /booking/
Disallow: /qr/
Disallow: /api/
Sitemap: https://example.ir/sitemap.xml
```

### Sitemap Generation

Build-time generation from salon list + static routes. Only indexable URLs with `<lastmod>`.

### OG Images

- Default branded OG image (1200x630): magenta gradient + logo + Persian text
- Per-salon OG: salon hero photo with brand overlay (generated at build or on-demand)
- RTL-correct text rendering
- Declared via `<SeoHead>` per-route

---

## 12. PWA Architecture

### Manifest (`public/manifest.json`)

```json
{
  "name": "رزرو آنلاین سالن زیبایی",
  "short_name": "رزرو سالن",
  "description": "رزرو آنلاین نوبت سالن‌های زیبایی",
  "start_url": "/",
  "display": "standalone",
  "dir": "rtl",
  "lang": "fa",
  "theme_color": "#D81B60",
  "background_color": "#FFFFFF",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### Service Worker Caching Strategy

**File:** `public/sw.js` (existing — `injectManifest` strategy)

| Resource | Strategy | TTL |
|----------|----------|-----|
| App shell (HTML, JS, CSS) | Precache (build-time manifest) | Until next build |
| Fonts (woff2) | CacheFirst | 1 year |
| Salon images | CacheFirst | 30 days, max 100 entries |
| API GET (public) | StaleWhileRevalidate | 5 minutes |
| API GET (auth) | NetworkOnly | Never cached |

### Offline Shell

When offline, the service worker serves the precached app shell. The app detects offline state and shows:
- A styled offline indicator (banner at top)
- Cached content where available
- Friendly "no connection" message for uncached routes

### Theme-Color Sync (Req 15.5)

The existing `ThemeProvider` already updates `<meta name="theme-color">`:

```tsx
// In ThemeProvider — sync meta theme-color with active palette
useEffect(() => {
  const color = theme === 'dark' ? '#FF6B9D' : '#D81B60';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}, [theme]);
```

---

## 13. Component Inventory

### New Components

| Component | File | Domain | Req |
|-----------|------|--------|-----|
| `ScrollReveal` | `components/ui/Motion.tsx` | Animation | 3.2 |
| `StaggerContainer` | `components/ui/Motion.tsx` | Animation | 3.8 |
| `StaggerItem` | `components/ui/Motion.tsx` | Animation | 3.8 |
| `CelebrationRing` | `components/ui/Celebration.tsx` | Animation | 3.4 |
| `ConfettiParticles` | `components/ui/Celebration.tsx` | Animation | 3.4 |
| `ParallaxHero` | `components/ui/ParallaxHero.tsx` | Layout | 4.2 |
| `AnimatedCounter` | `components/ui/AnimatedCounter.tsx` | Display | 4.4 |
| `FilterBar` | `components/ui/FilterBar.tsx` | Discovery | 5.2 |
| `BookingStepper` | `components/ui/BookingStepper.tsx` | Booking | 7.1 |
| `OwnerSidebar` | `components/layout/OwnerSidebar.tsx` | Owner | 8.5 |
| `OwnerBottomTabs` | `components/layout/OwnerBottomTabs.tsx` | Owner | 8.5 |
| `ImageCarousel` | `components/ui/ImageCarousel.tsx` | Salon | 6.1 |
| `SalonPlaceholder` | `components/ui/SalonPlaceholder.tsx` | Images | 9.6 |
| `MobileDatePicker` | `components/ui/MobileDatePicker.tsx` | Booking | 10.2 |

### Modified Components

| Component | File | Changes | Req |
|-----------|------|---------|-----|
| `PageTransition` | `components/ui/Motion.tsx` | Upgrade to Framer Motion `AnimatePresence` | 3.1 |
| `Reveal` | `components/ui/Motion.tsx` | Add `useReducedMotion` from Framer Motion | 3.5 |
| `Button` | `components/ui/Button.tsx` | Add `whileTap` micro-interaction | 3.3 |
| `Card` | `components/ui/Card.tsx` | Add hover-lift animation variant | 3.3 |
| `SalonCard` | `components/ui/SalonCard.tsx` | NYC photography-forward redesign | 5.1 |
| `SlotChip` | `components/ui/SlotGrid.tsx` | Selection pulse animation | 7.4 |
| `Skeleton` | `components/ui/Skeleton.tsx` | Match new card layouts | 5.5 |
| `EmptyState` | `components/ui/EmptyState.tsx` | NYC styling update | 5.6 |
| `OwnerShell` | `components/layout/OwnerShell.tsx` | Sidebar + bottom-tab nav | 8.5 |
| `BookingSuccessPage` | `pages/BookingSuccessPage.tsx` | Celebration animation | 7.6 |
| `MarketingHome` | `pages/MarketingHome.tsx` | NYC parallax hero + counters | 4.1–4.9 |
| `DiscoveryPages` | `pages/DiscoveryPages.tsx` | Filter bar + stagger animations | 5.1–5.7 |
| `SalonProfilePage` | `pages/SalonProfilePage.tsx` | Carousel hero + scroll animations | 6.1–6.8 |
| `AvailabilityPage` | `pages/AvailabilityPage.tsx` | Stepper + mobile date sheet | 7.2–7.4 |

### Existing Components (Unchanged)

- `EditorialSplit`, `FeatureMosaic`, `SectionRhythm` — layout primitives preserved
- `Motif` — brand device, unchanged (consumes token colors automatically)
- `SeoHead`, `JsonLd` — SEO infrastructure unchanged
- `ThemeProvider`, `ThemeToggle` — theme system unchanged
- `TenantTheme`, `FunnelTenantTheme` — accent scoping unchanged
- `JalaliDatePicker`, `DayScroller` — date components unchanged
- `Money`, `Num`, `JalaliDate`, `DirText` — Persian formatting unchanged
- `TextField`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch` — form primitives unchanged
- `Dialog`, `Sheet`, `Toast`, `Tooltip` — overlay primitives unchanged

---

## 14. File Structure

### New Files

```
packages/web/src/
├── components/
│   ├── ui/
│   │   ├── AnimatedCounter.tsx      # Counter with spring animation
│   │   ├── Celebration.tsx          # CelebrationRing + ConfettiParticles
│   │   ├── FilterBar.tsx            # Discovery filter/sort controls
│   │   ├── ImageCarousel.tsx        # Swipeable image gallery
│   │   ├── BookingStepper.tsx       # Multi-step progress indicator
│   │   ├── MobileDatePicker.tsx     # Bottom-sheet date picker wrapper
│   │   ├── ParallaxHero.tsx         # Parallax scrolling hero section
│   │   └── SalonPlaceholder.tsx     # Branded image placeholder
│   └── layout/
│       ├── OwnerSidebar.tsx         # Collapsible sidebar nav
│       └── OwnerBottomTabs.tsx      # Mobile bottom tab bar
├── hooks/
│   ├── useReducedMotion.ts          # Re-export from framer-motion (convenience)
│   └── useMediaQuery.ts             # Responsive breakpoint hook
├── styles/
│   └── tokens.css                   # Updated with heroic scale + animation tokens
└── pages/
    └── owner/
        ├── OwnerCalendarPage.tsx     # Redesigned calendar (day/week views)
        ├── OwnerAnalyticsPage.tsx    # Redesigned analytics with charts
        └── OwnerConfigurationPage.tsx # Redesigned config cards

docs/
└── design-research/
    └── booksy-analysis.md           # Firecrawl research documentation
```

### Modified Files

```
packages/web/src/
├── styles/tokens.css                 # Add heroic scale + animation tokens
├── components/ui/Motion.tsx          # Add ScrollReveal, StaggerContainer, upgrade PageTransition
├── components/ui/Button.tsx          # Add motion props
├── components/ui/Card.tsx            # Add hover-lift variant
├── components/ui/SalonCard.tsx       # Photography-forward NYC redesign
├── components/ui/SlotGrid.tsx        # Selection animation
├── components/layout/OwnerShell.tsx  # Sidebar + bottom-tabs architecture
├── pages/MarketingHome.tsx           # NYC parallax hero + counters + sections
├── pages/DiscoveryPages.tsx          # Filter bar + stagger + skeleton
├── pages/SalonProfilePage.tsx        # Carousel hero + scroll animations
├── pages/AvailabilityPage.tsx        # Stepper + mobile date sheet
├── pages/BookingConfirmPage.tsx      # Receipt card styling
├── pages/BookingSuccessPage.tsx      # Celebration animation
├── pages/owner/index.tsx             # Export new owner pages
└── tailwind.config.js                # Heroic scale + animation extensions
```

---

## 15. Migration Strategy

### Phased Approach

The migration from the old salon-luxe tokens to the NYC palette proceeds in phases to avoid breaking existing pages:

**Phase 0: Token Foundation (Already Complete)**
- `tokens.css` already contains the NYC palette values
- Tailwind config already maps to CSS variables
- All components already consume tokens (not raw values)
- Result: the palette change is already live in the token layer

**Phase 1: Animation System**
1. Add new animation tokens to `tokens.css` (heroic scale, durations)
2. Extend `tailwind.config.js` with new font sizes + animation utilities
3. Upgrade `Motion.tsx` — add `ScrollReveal`, `StaggerContainer`, Framer Motion `PageTransition`
4. Add `Celebration.tsx`, `ParallaxHero.tsx`, `AnimatedCounter.tsx`
5. Verify: existing pages render correctly (token colors + new animations)

**Phase 2: Landing Page**
1. Rework `MarketingHome.tsx` — parallax hero, counters, salon showcase
2. Add `FilterBar` component
3. Test: CWV metrics, SEO validation, a11y checks

**Phase 3: Discovery + Profile**
1. Rework `DiscoveryPages.tsx` — filter bar, stagger animations, skeletons
2. Rework `SalonProfilePage.tsx` — carousel hero, scroll animations
3. Test: responsive behavior, RTL, SEO structured data

**Phase 4: Booking Flow**
1. Add `BookingStepper` to booking pages
2. Add step transitions with `AnimatePresence`
3. Enhance `BookingSuccessPage` with celebration
4. Add mobile date-picker bottom-sheet
5. Test: keyboard operability, state preservation, RTL

**Phase 5: Owner Dashboard**
1. Rework `OwnerShell` with sidebar/bottom-tabs
2. Redesign calendar, analytics, config pages
3. Apply dark-mode-first styling
4. Test: data density, responsive, keyboard nav

### Breaking Change Avoidance

- **No component API changes** — existing props and interfaces preserved
- **Token names unchanged** — only values differ (already migrated)
- **Route structure unchanged** — all existing URLs work
- **Backend untouched** — no API contract changes
- **Styling via tokens only** — since all components consume `var(--token)`, the palette change is instantaneous once `tokens.css` updates (already done)
- **`distinctiveness.test.ts` guardrail** remains enforced throughout — no indigo/purple family, no raw hex in authored styles

### Testing Throughout

Each phase validates:
- [ ] `contrast.test.ts` passes (WCAG AA)
- [ ] `distinctiveness.test.ts` passes (no indigo/purple, tokens-only)
- [ ] axe accessibility checks pass
- [ ] Responsive at 360px, 768px, 1024px, 1280px
- [ ] RTL layout correct (no physical properties)
- [ ] Reduced-motion: animations disabled, content visible
- [ ] Persian numerals, Jalali dates, Rial formatting correct
- [ ] SEO: structured data validates, meta tags present in prerendered HTML
- [ ] CWV: LCP < 2.5s, INP < 200ms, CLS < 0.1 on public pages

---

## Appendix: Framer Motion Variant Library

Standard variants used across the system (defined once, imported where needed):

```tsx
// packages/web/src/components/ui/motion-variants.ts

export const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
};

export const slideFromStart = {
  hidden: { opacity: 0, x: -20 },  // RTL: inline-start is negative
  visible: { opacity: 1, x: 0 },
};

export const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

export const cardHover = {
  rest: { y: 0, boxShadow: 'var(--shadow-1)' },
  hover: { y: -4, boxShadow: 'var(--shadow-2)' },
};

export const tapScale = { scale: 0.97 };

export const celebrationRing = {
  initial: { scale: 0, opacity: 1 },
  animate: { scale: 2.5, opacity: 0 },
};

export const standardTransition = {
  duration: 0.3,
  ease: [0.2, 0, 0, 1],
};

export const emphasizedTransition = {
  duration: 0.4,
  ease: [0.2, 0, 0, 1.2],
};

export const springTransition = {
  type: 'spring',
  stiffness: 300,
  damping: 20,
};
```
