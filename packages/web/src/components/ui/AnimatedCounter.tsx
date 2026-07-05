import { useEffect, useRef, useState } from 'react';
import { useInView, useMotionValue, useReducedMotion, animate } from 'framer-motion';
import { toPersianDigits } from './Num';
import { cn } from './cn';

/**
 * Arabic thousands separator (U+066C) — consistent with the grouping used in
 * `Money.tsx` for Persian-style thousands display (e.g. ۱٬۲۳۴).
 */
const PERSIAN_GROUP_SEPARATOR = '٬';

/**
 * Formats a number with Persian-style thousands grouping and converts all
 * digits to Persian numerals.
 */
function formatPersianNumber(n: number): string {
  const rounded = Math.round(n);
  const grouped = rounded
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, PERSIAN_GROUP_SEPARATOR);
  return toPersianDigits(grouped);
}

export interface AnimatedCounterProps {
  /** Target number to count up to. */
  target: number;
  /** Descriptive label displayed below the number. */
  label: string;
  /** Optional prefix displayed before the number (e.g. "+"). */
  prefix?: string;
  /** Optional suffix displayed after the number (e.g. "%"). */
  suffix?: string;
  /** Optional additional class names for the root container. */
  className?: string;
}

/**
 * Animated counter component that counts up from 0 to a target number when
 * scrolled into view, displaying the result in Persian numerals with
 * thousands grouping.
 *
 * Uses Framer Motion's `animate` utility for the counting spring. Under
 * `prefers-reduced-motion: reduce`, the final number is shown immediately
 * without animation.
 *
 * The number is rendered in the heroic display style with primary color,
 * and the label is presented below in secondary/muted text.
 *
 * **Validates: Requirements 4.4**
 */
export function AnimatedCounter({
  target,
  label,
  prefix,
  suffix,
  className,
}: AnimatedCounterProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const prefersReduced = useReducedMotion();
  const motionValue = useMotionValue(0);
  const [displayValue, setDisplayValue] = useState(
    prefersReduced ? formatPersianNumber(target) : formatPersianNumber(0),
  );

  useEffect(() => {
    // Under reduced motion, show the final value immediately.
    if (prefersReduced) {
      setDisplayValue(formatPersianNumber(target));
      return;
    }

    if (isInView) {
      const controls = animate(motionValue, target, {
        duration: 1.2,
        ease: [0, 0, 0.2, 1], // --ease-decelerate
        onUpdate(latest) {
          setDisplayValue(formatPersianNumber(latest));
        },
      });

      return () => controls.stop();
    }
  }, [isInView, target, prefersReduced, motionValue]);

  return (
    <div ref={ref} className={cn('text-center', className)}>
      <bdi className="text-3xl text-display text-primary tabular-nums [font-feature-settings:'tnum']">
        {prefix && <span>{toPersianDigits(prefix)}</span>}
        {displayValue}
        {suffix && <span>{toPersianDigits(suffix)}</span>}
      </bdi>
      <p className="text-sm text-muted mt-2">{label}</p>
    </div>
  );
}
