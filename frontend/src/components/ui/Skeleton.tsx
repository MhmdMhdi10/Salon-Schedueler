import { cn } from './cn';

export type SkeletonVariant = 'text' | 'rect' | 'circle';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Shape of the placeholder. `text` is a short rounded line, `rect` a block
   * (cards/images), `circle` an avatar/icon placeholder. Defaults to `rect`.
   */
  variant?: SkeletonVariant;
}

const variantClasses: Record<SkeletonVariant, string> = {
  // `text` defaults to a single line height; callers size width via className.
  text: 'h-4 w-full rounded-sm',
  rect: 'w-full rounded-md',
  circle: 'rounded-pill',
};

/**
 * Layout-matched placeholder shown while a data surface loads (ui-ux §6/§12:
 * skeletons over spinners for first paint). It is **not** a centered spinner —
 * size each Skeleton to mirror the final content so there is no layout shift
 * when real data arrives.
 *
 * Motion: a diagonal gloss sweeps across the placeholder (`animate-shimmer` on
 * top of the resting `bg-border` fill via the `.shimmer-bg` utility) so
 * loading surfaces read as "alive" rather than static gray blocks — the
 * Booksy/Instagram loading feel. The shimmer animates only `background-position`
 * (a compositor-friendly property) and is neutralized globally under
 * `prefers-reduced-motion` (tokens.css), so it is reduced-motion safe.
 *
 * Decorative by default (`aria-hidden`): the surrounding region should expose
 * its own busy state (e.g. `aria-busy`/`role="status"`) so assistive tech is
 * not spammed with empty placeholders.
 */
export function Skeleton({ variant = 'rect', className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden bg-border',
        'animate-shimmer shimmer-bg',
        variantClasses[variant],
        className,
      )}
      {...rest}
    />
  );
}
