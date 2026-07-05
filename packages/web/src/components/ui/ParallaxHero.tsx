import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface ParallaxHeroProps {
  /** Source URL for the hero background image (the LCP element). */
  imageSrc: string;
  /** Alt text in Persian for accessibility (meaningful description of the image). */
  imageAlt: string;
  /** Content rendered in the bottom portion of the hero (headline + CTA). */
  children: ReactNode;
  /** Optional additional class names for the root container. */
  className?: string;
}

/**
 * Full-viewport parallax hero component for the landing page.
 *
 * The background image moves at a slower rate than the foreground content
 * on scroll, creating a depth/parallax effect. Under `prefers-reduced-motion:
 * reduce`, the parallax transform is disabled — the image stays static.
 *
 * Only animates compositor-friendly `transform` (via Framer Motion's `y`
 * style property which maps to translateY). No layout-triggering properties
 * are animated.
 *
 * The image is marked as the LCP element with `loading="eager"` and
 * `fetchpriority="high"`. Explicit dimensions and `object-cover` prevent CLS.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
export function ParallaxHero({
  imageSrc,
  imageAlt,
  children,
  className,
}: ParallaxHeroProps) {
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], [0, -100]);
  const prefersReduced = useReducedMotion();

  return (
    <div
      className={cn(
        'relative min-h-[80vh] overflow-hidden',
        className,
      )}
    >
      {/* Parallax background layer */}
      <motion.div
        className="absolute inset-0"
        style={{ y: prefersReduced ? 0 : y }}
        aria-hidden="true"
      >
        <img
          src={imageSrc}
          alt={imageAlt}
          loading="eager"
          width={1920}
          height={1080}
          className="h-full w-full object-cover"
          {...{ fetchpriority: 'high' }}
        />
        {/* Gradient overlay for text legibility — uses token color */}
        <div className="absolute inset-0 bg-gradient-to-t from-bg/80 to-transparent" />
      </motion.div>

      {/* Foreground content — positioned at the bottom of the hero */}
      <div className="relative z-10 flex h-full min-h-[80vh] items-end pb-10">
        {children}
      </div>
    </div>
  );
}
