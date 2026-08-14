import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { containerVariants, itemVariants } from '../../lib/motion-variants';

export interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Orchestrates cascading entrance animations for child `StaggerItem` elements.
 *
 * Triggers when the container scrolls into view (once, with a small negative
 * margin so it fires slightly before the user reaches it). Children stagger in
 * at 50ms intervals (`--dur-stagger`). Under `prefers-reduced-motion: reduce`,
 * all transform-based animations are disabled — children render immediately.
 *
 * Must wrap one or more `StaggerItem` components to produce the cascade effect.
 */
export function StaggerContainer({ children, className }: StaggerContainerProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-5%' });
  const prefersReduced = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      variants={prefersReduced ? {} : containerVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

/**
 * Individual item within a `StaggerContainer` that animates in with a fade-up
 * entrance, staggered relative to its siblings.
 *
 * Inherits stagger timing from the parent container's `staggerChildren`
 * orchestration. Under `prefers-reduced-motion: reduce`, renders without
 * transform animations (content visible immediately).
 *
 * Must be a direct child of `StaggerContainer` for the cascade to work.
 */
export function StaggerItem({ children, className }: StaggerItemProps) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div variants={prefersReduced ? {} : itemVariants} className={className}>
      {children}
    </motion.div>
  );
}
