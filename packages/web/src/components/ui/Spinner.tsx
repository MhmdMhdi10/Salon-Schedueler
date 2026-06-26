import { cn } from './cn';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  /** Visual size of the spinner. Defaults to `md`. */
  size?: SpinnerSize;
  /**
   * Accessible label announced to assistive tech. When omitted the spinner is
   * marked decorative (`aria-hidden`) — appropriate when it sits inside an
   * element that already conveys the busy state (e.g. a `Button` with
   * `aria-busy`).
   */
  label?: string;
}

const sizeClass: Record<SpinnerSize, string> = {
  // Token-driven sizing via the 8pt spacing scale (no raw px).
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

/**
 * Indeterminate loading spinner. Animation is `transform`-only and respects
 * `prefers-reduced-motion` (handled globally in tokens.css), so it never blocks
 * an action or causes layout shift.
 */
export function Spinner({ size = 'md', label, className, ...rest }: SpinnerProps) {
  const decorative = !label;
  return (
    <svg
      className={cn('animate-spin', sizeClass[size], className)}
      viewBox="0 0 24 24"
      fill="none"
      role={decorative ? undefined : 'status'}
      aria-hidden={decorative ? true : undefined}
      aria-label={label}
      {...rest}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z"
      />
    </svg>
  );
}
