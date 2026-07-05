import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { pageVariants, pageTransition } from '../../lib/motion-variants';
import { cn } from './cn';

export interface RevealProps {
  children: ReactNode;
  /** Delay step (1–8) for staggering list items; resolves to 40ms × n. */
  stagger?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Entrance variant. Defaults to `fade-up`. */
  variant?: 'fade-up' | 'fade-in' | 'scale-in';
  /** Render as a different element (default `div`). */
  as?: React.ElementType;
  className?: string;
  /** Reveal once (`once`) or every time it re-enters the viewport (`always`). */
  mode?: 'once' | 'always';
}

/**
 * Scroll-into-view entrance wrapper — the signature "page comes alive" motion.
 *
 * Children animate in with a soft `fade-up` (or `fade-in` / `scale-in`) the
 * first time they intersect the viewport, so long sections feel like they're
 * arriving rather than already there. Pair with `stagger` on a list so items
 * cascade in 40ms apart instead of all at once.
 *
 * Uses `IntersectionObserver` (no scroll handler) and is `motion-safe:` gated
 * so the entire effect is neutralized under `prefers-reduced-motion: reduce`
 * (the keyframe never plays; content is fully visible from the start). SSR /
 * no-IO environments render children plainly (no invisible stuck state).
 */
export function Reveal({
  children,
  stagger,
  variant = 'fade-up',
  as: Component = 'div',
  className,
  mode = 'once',
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            if (mode === 'once') io.disconnect();
          } else if (mode === 'always') {
            setVisible(false);
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [mode]);

  const variantClass: Record<NonNullable<RevealProps['variant']>, string> = {
    'fade-up': 'motion-safe:animate-fade-up',
    'fade-in': 'motion-safe:animate-fade-in',
    'scale-in': 'motion-safe:animate-scale-in',
  };
  const style = stagger ? { animationDelay: `${stagger * 40}ms` } : undefined;

  return (
    <Component
      ref={ref}
      style={style}
      className={cn(visible ? variantClass[variant] : 'motion-safe:opacity-0', className)}
    >
      {children}
    </Component>
  );
}

export interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Route-transition wrapper using Framer Motion `AnimatePresence` for richer,
 * interruptible, directional page transitions.
 *
 * Keyed on the current pathname so the exit/enter cycle fires on each route
 * change. The slide direction is RTL-aware: pages enter from inline-start
 * (negative x in RTL layout). Under `prefers-reduced-motion: reduce` all
 * transform-based animations are disabled — only an opacity crossfade remains
 * (handled by passing empty variants).
 */
export function PageTransition({ children, className }: PageTransitionProps) {
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
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
