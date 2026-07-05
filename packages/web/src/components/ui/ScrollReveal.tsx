import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { revealVariants, revealTransition } from '../../lib/motion-variants';

export interface ScrollRevealProps {
  children: ReactNode;
  /** Delay in seconds for stagger-like usage (e.g. 0, 0.05, 0.1…) */
  delay?: number;
  className?: string;
}

/**
 * Scroll-triggered reveal wrapper using Framer Motion `useInView`.
 *
 * Children fade up from 20px below when 10% into the viewport. The animation
 * triggers only once (`once: true`). Under `prefers-reduced-motion: reduce`,
 * transform-based animations are disabled — content renders immediately with
 * no motion (empty variants passed to the motion.div).
 *
 * This is the Framer Motion-based counterpart to the CSS-class `Reveal`
 * component (which uses IntersectionObserver + CSS keyframes). Both coexist;
 * use `ScrollReveal` when richer orchestration (stagger delays, variant
 * composition) is needed.
 */
export function ScrollReveal({
  children,
  delay = 0,
  className,
}: ScrollRevealProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-10% 0px' });
  const prefersReduced = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      variants={prefersReduced ? {} : revealVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      transition={{ ...revealTransition, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
