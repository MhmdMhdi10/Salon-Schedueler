import { forwardRef } from 'react';
import { cn } from './cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Control height/padding. Both sizes keep a ≥44×44 target. Defaults to `md`. */
  size?: ButtonSize;
  /**
   * When true the button shows a spinner, sets `aria-busy`, and blocks
   * interaction (the underlying element is disabled so it never double-fires).
   */
  loading?: boolean;
  /** Optional leading icon (inline-start). Hidden while loading. */
  startIcon?: React.ReactNode;
  /** Optional trailing icon (inline-end). Hidden while loading. */
  endIcon?: React.ReactNode;
  /** Stretch to fill the inline axis. */
  fullWidth?: boolean;
}

/**
 * Shared base: token-driven, ≥44×44 target, logical-property padding (RTL-safe),
 * visible focus-visible ring, and the six interaction states.
 *
 * - default / hover / active / disabled are expressed per variant below.
 * - focus-visible uses the global focus ring (`--color-focus-ring`) via the
 *   `focus` color token.
 * - loading is driven by the `loading` prop (spinner + `aria-busy`).
 *
 * Booksy signature: primary actions render as a full pill (`rounded-pill`),
 * the visual hallmark of the Booksy booking funnel CTA.
 */
const base = cn(
  'relative inline-flex items-center justify-center gap-2',
  'min-h-[44px] min-w-[44px]',
  'font-medium text-sm leading-none',
  'select-none whitespace-nowrap',
  'transition-[background-color,border-color,color,box-shadow] duration-fast ease-standard',
  'outline-none focus-visible:outline focus-visible:outline-2',
  'focus-visible:outline-offset-2 focus-visible:outline-focus',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

const sizeClasses: Record<ButtonSize, string> = {
  md: 'px-5 py-2 rounded-pill',
  lg: 'px-6 py-3 text-md rounded-pill',
};

const variantClasses: Record<ButtonVariant, string> = {
  // Text-bearing fills use the AA-safe primary shade from tokens. Booksy pill.
  primary: cn(
    'bg-primary text-primary-contrast shadow-1',
    'hover:brightness-110 active:brightness-95',
    'disabled:hover:brightness-100',
  ),
  secondary: cn(
    'bg-surface text-text border border-border rounded-md',
    'hover:bg-elevated active:brightness-95',
    'disabled:hover:bg-surface',
  ),
  ghost: cn(
    'bg-transparent text-text rounded-md',
    'hover:bg-surface active:brightness-95',
    'disabled:hover:bg-transparent',
  ),
  danger: cn(
    'bg-danger text-primary-contrast shadow-1',
    'hover:brightness-110 active:brightness-95',
    'disabled:hover:brightness-100',
  ),
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    startIcon,
    endIcon,
    fullWidth,
    type = 'button',
    className,
    children,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      className={cn(
        base,
        sizeClasses[size],
        variantClasses[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && (
        <span className="absolute inset-0 inline-flex items-center justify-center">
          <Spinner size={size === 'lg' ? 'md' : 'sm'} />
        </span>
      )}
      {/* Keep the label in the DOM but visually hidden while loading so the
          button width does not jump (protects layout / CLS). */}
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
        {startIcon && (
          <span className="inline-flex shrink-0" aria-hidden="true">
            {startIcon}
          </span>
        )}
        {children}
        {endIcon && (
          <span className="inline-flex shrink-0" aria-hidden="true">
            {endIcon}
          </span>
        )}
      </span>
    </button>
  );
});
