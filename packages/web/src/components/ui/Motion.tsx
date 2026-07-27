import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { pageVariants, pageTransition } from '../../lib/motion-variants';

/**
 * Route-transition wrapper. (The old CSS `Reveal` scroll-entrance duplicate of
 * `ScrollReveal` was removed — `ScrollReveal` is the single scroll-reveal
 * primitive; see `components/ui/ScrollReveal.tsx`.)
 */

export interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Route-transition wrapper: a soft, enter-only crossfade/slide keyed on the
 * current pathname, so each routed page arrives with a purposeful entrance.
 *
 * Deliberately **enter-only** (no `AnimatePresence mode="wait"` exit phase):
 * an exit-then-enter cycle would add ~300ms of dead time to every navigation
 * and interacts badly with `Suspense` chunk loading. The restraint doctrine
 * (Booksy directive §i) caps chrome motion at short opacity-led moves — this
 * is a 300ms token-eased fade with a 12px inline slide.
 *
 * Under `prefers-reduced-motion: reduce` the transform is dropped and only the
 * opacity crossfade remains (steering §9).
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  const { pathname } = useLocation();
  const prefersReduced = useReducedMotion();

  return (
    <motion.div
      key={pathname}
      variants={
        prefersReduced ? { initial: { opacity: 0 }, animate: { opacity: 1 } } : pageVariants
      }
      initial="initial"
      animate="animate"
      transition={pageTransition}
      className={className}
    >
      {children}
    </motion.div>
  );
}
