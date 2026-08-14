import { forwardRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { microTransition } from '../../lib/motion-variants';
import { cn } from './cn';
import { Skeleton } from './Skeleton';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * When true the card renders a layout-matched skeleton placeholder instead of
   * its children and exposes a busy state to assistive tech (ui-ux §6 data
   * states). Pair with `loadingLabel` for a meaningful announcement.
   */
  loading?: boolean;
  /** Accessible busy label used while `loading`. e.g. «در حال بارگذاری». */
  loadingLabel?: string;
  /**
   * Visually raise the card to the elevated surface + heavier shadow (menus,
   * popovers). Defaults to the resting surface elevation.
   */
  elevated?: boolean;
  /**
   * Enable hover-lift micro-interaction: card lifts 4px on hover with a shadow
   * increase, and scales down slightly on press. Use for clickable/discovery
   * cards; omit for static info cards.
   */
  hoverLift?: boolean;
  /** Render as a different element (e.g. `article`/`section`) for landmarks. */
  as?: React.ElementType;
}

/**
 * Content container built on the surface tokens. Resting cards use
 * `--color-surface` + `--shadow-1`; `elevated` cards use `--color-elevated` +
 * `--shadow-2` (in dark mode shadows are border-led — handled by the tokens).
 *
 * The `loading` variant swaps in a Skeleton block so the card reserves its
 * space and there is no layout shift when content arrives (ui-ux §12, R2.3).
 *
 * When `hoverLift` is enabled, the card lifts 4px on hover with a shadow
 * increase and scales slightly on press — ideal for discovery grids and
 * clickable card lists. Static info cards should omit this prop.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    loading = false,
    loadingLabel,
    elevated = false,
    hoverLift = false,
    as: Component = 'div',
    className,
    children,
    ...rest
  },
  ref,
) {
  const prefersReduced = useReducedMotion();

  const cardClassName = cn(
    'rounded-lg border border-border p-4 sm:p-5',
    elevated ? 'bg-elevated shadow-2' : 'bg-surface shadow-1',
    // Add will-change hint and cursor for hover-lift cards
    hoverLift && 'cursor-pointer',
    className,
  );

  const cardContent = loading ? (
    <div className="flex flex-col gap-3" role="status" aria-label={loadingLabel}>
      <Skeleton variant="text" className="w-1/2" />
      <Skeleton variant="rect" className="h-24" />
      <Skeleton variant="text" className="w-3/4" />
    </div>
  ) : (
    children
  );

  // When hoverLift is enabled, wrap in a motion component for micro-interactions
  if (hoverLift) {
    // Determine motion behavior based on reduced-motion preference
    const hoverAnimation = !prefersReduced ? { y: -4, boxShadow: 'var(--shadow-2)' } : undefined;
    const tapAnimation = !prefersReduced ? { scale: 0.98 } : undefined;

    // Access motion[element] via bracket notation — Framer Motion's proxy
    // supports all valid HTML element strings (div, article, section, etc.)
    const tag = (typeof Component === 'string' ? Component : 'div') as keyof typeof motion;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MotionComponent = motion[tag] as any;

    return (
      <MotionComponent
        ref={ref}
        aria-busy={loading || undefined}
        whileHover={hoverAnimation}
        whileTap={tapAnimation}
        transition={microTransition}
        className={cardClassName}
        {...rest}
      >
        {cardContent}
      </MotionComponent>
    );
  }

  // Non-hoverable cards: plain element (no motion overhead)
  return (
    <Component ref={ref} aria-busy={loading || undefined} className={cardClassName} {...rest}>
      {cardContent}
    </Component>
  );
});

/** Optional header region for a Card (title + actions row). */
export const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn('mb-3 flex items-start justify-between gap-3', className)}
        {...rest}
      />
    );
  },
);

/** Card title — renders an `<h3>` by default; override via `as` for hierarchy. */
export const CardTitle = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & { as?: React.ElementType }
>(function CardTitle({ as: Component = 'h3', className, ...rest }, ref) {
  return (
    <Component ref={ref} className={cn('text-lg font-medium text-text', className)} {...rest} />
  );
});

/** Card body content region. */
export const CardContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...rest }, ref) {
    return <div ref={ref} className={cn('text-sm text-text', className)} {...rest} />;
  },
);

/** Card footer — actions aligned to the inline-end by default. */
export const CardFooter = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn('mt-4 flex items-center justify-end gap-2', className)}
        {...rest}
      />
    );
  },
);
