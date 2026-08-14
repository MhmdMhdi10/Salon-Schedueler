import type { Variants, Transition } from 'framer-motion';

// ─── Easing Curves ──────────────────────────────────────────────────────────
// Named easings corresponding to the CSS token equivalents in tokens.css.
// Framer Motion uses numeric arrays (cubic-bezier control points) instead of
// CSS var() references.

/** Standard easing — matches `--ease-standard` */
const EASE_STANDARD: [number, number, number, number] = [0.2, 0, 0, 1];

/** Emphasized easing — slightly overshoots for emphasis */
const EASE_EMPHASIZED: [number, number, number, number] = [0.2, 0, 0, 1.2];

/** Spring-like easing — matches `--ease-spring`, used for celebrations */
const EASE_SPRING: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

/** Decelerate easing — matches `--ease-decelerate`, smooth settle */
const EASE_DECELERATE: [number, number, number, number] = [0, 0, 0.2, 1];

// ─── Page Transitions ────────────────────────────────────────────────────────

/**
 * Page-level entry/exit variants for route transitions.
 *
 * Uses a subtle inline-start slide (negative x in RTL = from inline-start)
 * combined with an opacity crossfade. Designed for use with
 * `AnimatePresence mode="wait"` keyed on the current pathname.
 */
export const pageVariants: Variants = {
  initial: { opacity: 0, x: -12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 12 },
};

// ─── Scroll Reveals ──────────────────────────────────────────────────────────

/**
 * Scroll-triggered reveal variants for content sections.
 *
 * Children start hidden (shifted down 20px, transparent) and animate
 * to their natural position when entering the viewport. Pair with
 * `useInView` and a `once: true` trigger.
 */
export const revealVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

// ─── Stagger Container ───────────────────────────────────────────────────────

/**
 * Container variant that orchestrates staggered child entrances.
 *
 * Apply to a parent `motion.div` wrapping children that each use
 * `itemVariants`. The 50ms stagger matches `--dur-stagger`.
 */
export const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

// ─── Stagger Item ────────────────────────────────────────────────────────────

/**
 * Individual item variant for staggered list/grid entrances.
 *
 * Each item fades up from 16px below with a 300ms standard-eased
 * transition. Must be a child of a `containerVariants` parent.
 */
export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: EASE_STANDARD },
  },
};

// ─── Step Transitions (Booking Flow) ─────────────────────────────────────────

/**
 * Directional step variants for the multi-step booking flow.
 *
 * Uses a `custom` prop (direction: number) to determine slide direction.
 * Positive direction = forward (next step), negative = backward (previous).
 * The x-offset is RTL-aware: entering from inline-start for forward navigation.
 *
 * Usage:
 * ```tsx
 * <AnimatePresence mode="wait" custom={direction}>
 *   <motion.div
 *     key={currentStep}
 *     custom={direction}
 *     variants={stepVariants}
 *     initial="enter"
 *     animate="center"
 *     exit="exit"
 *   />
 * </AnimatePresence>
 * ```
 */
export const stepVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? -30 : 30,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? 30 : -30,
    opacity: 0,
  }),
};

// ─── Celebration ─────────────────────────────────────────────────────────────

/**
 * Expanding ring animation for booking success celebration.
 *
 * Scales from 0 to 2.5x while fading out, creating a burst-ring effect.
 * Pair with `celebrationTransition` for the spring-like timing.
 */
export const celebrationVariants: Variants = {
  initial: { scale: 0, opacity: 1 },
  animate: { scale: 2.5, opacity: 0 },
};

// ─── Standard Transition Configs ─────────────────────────────────────────────

/**
 * Page transition timing — 300ms standard ease.
 * Matches `--dur-slow` + `--ease-standard` tokens.
 */
export const pageTransition: Transition = {
  type: 'tween',
  duration: 0.3,
  ease: EASE_STANDARD,
};

/**
 * Booking-flow step transition timing — 250ms standard ease.
 * Slightly faster than the general page transition for a snappier
 * multi-step feel. Matches the design spec for step-to-step slides.
 */
export const stepTransition: Transition = {
  type: 'tween',
  duration: 0.25,
  ease: EASE_STANDARD,
};

/**
 * Scroll-reveal transition timing — 400ms standard ease.
 * Matches `--dur-enter` + `--ease-standard` tokens.
 */
export const revealTransition: Transition = {
  duration: 0.4,
  ease: EASE_STANDARD,
};

/**
 * Celebration timing — 600ms spring-like ease with overshoot.
 * Matches `--dur-celebration` + `--ease-spring` tokens.
 */
export const celebrationTransition: Transition = {
  duration: 0.6,
  ease: EASE_SPRING,
};

/**
 * Micro-interaction timing — 200ms standard ease. The JS mirror of
 * `--dur-base` + `--ease-standard` for hover-lift / tap feedback on cards,
 * chips, and list rows. Import this instead of inlining
 * `{ duration: 0.2, ease: [0.2, 0, 0, 1] }` so a token retune happens in one
 * place.
 */
export const microTransition: Transition = {
  duration: 0.2,
  ease: EASE_STANDARD,
};

/**
 * Animated-counter timing — a 1.2s decelerating settle (`--ease-decelerate`).
 * Used by `AnimatedCounter` for stat count-ups.
 */
export const counterTransition: Transition = {
  duration: 1.2,
  ease: EASE_DECELERATE,
};

// ─── Exported Easing Constants ───────────────────────────────────────────────

export const easings = {
  standard: EASE_STANDARD,
  emphasized: EASE_EMPHASIZED,
  spring: EASE_SPRING,
  decelerate: EASE_DECELERATE,
} as const;

/**
 * JS mirror of the CSS duration tokens (seconds, framer-motion units). Keep in
 * sync with `--dur-*` in `tokens.css`.
 */
export const durations = {
  fast: 0.15,
  base: 0.2,
  slow: 0.3,
  enter: 0.4,
  exit: 0.25,
  stagger: 0.05,
  celebration: 0.6,
} as const;
