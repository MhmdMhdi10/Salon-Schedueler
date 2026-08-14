import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { stepVariants, stepTransition } from '../../lib/motion-variants';

/**
 * Map of known booking-flow pathnames to ordered step indices. A higher index
 * means a later step in the funnel — which determines slide direction.
 *
 * The mapping uses `endsWith` matching so it works regardless of the salon id
 * segment preceding `book`.
 */
function stepIndexFromPath(pathname: string): number {
  if (pathname.includes('/booking/success')) return 2;
  if (pathname.endsWith('/confirm')) return 1;
  return 0;
}

export interface BookingFlowTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Directional slide transition wrapper for the multi-step booking flow.
 *
 * Animates content between booking steps (service selection → date/time →
 * confirmation → success) using Framer Motion's `AnimatePresence` with
 * RTL-aware directional slide variants.
 *
 * **Direction logic:**
 * - Forward (step index increases): content enters from inline-end (left in RTL,
 *   negative x) and exits to inline-start (right in RTL, positive x).
 * - Backward (step index decreases): reversed direction.
 *
 * **Reduced motion:** When `prefers-reduced-motion: reduce` is active, all
 * transform-based animation is suppressed — only an instant swap occurs (via
 * empty variants). Content is never hidden or delayed by animation.
 *
 * **Transition timing:** 250ms with the standard decelerate easing
 * `[0.2, 0, 0, 1]`, matching the design spec for step-to-step slides
 * (faster than the general 300ms page transition for a snappier feel).
 *
 * **Compositor-friendly:** Only animates `transform` (x) and `opacity` —
 * no layout-triggering properties (Req 3.7).
 *
 * @example
 * ```tsx
 * <BookingFlowTransition>
 *   <Outlet />
 * </BookingFlowTransition>
 * ```
 */
export function BookingFlowTransition({ children, className }: BookingFlowTransitionProps) {
  const { pathname } = useLocation();
  const prefersReduced = useReducedMotion();

  const currentStepIndex = stepIndexFromPath(pathname);
  const prevStepIndexRef = useRef(currentStepIndex);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    const prev = prevStepIndexRef.current;
    if (currentStepIndex !== prev) {
      setDirection(currentStepIndex > prev ? 1 : -1);
      prevStepIndexRef.current = currentStepIndex;
    }
  }, [currentStepIndex]);

  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={currentStepIndex}
        custom={direction}
        variants={prefersReduced ? {} : stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={stepTransition}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
