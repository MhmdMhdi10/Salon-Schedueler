import { forwardRef } from 'react';
import { cn } from './cn';
import { Spinner } from './Spinner';
import type { ButtonVariant } from './Button';

export interface IconButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label'
> {
  /** Visual style. Defaults to `ghost` (icon-only controls are usually subtle). */
  variant?: ButtonVariant;
  /**
   * Required accessible name — icon-only buttons have no text, so screen readers
   * rely on this (ui-ux §10). e.g. «بستن», «حذف نوبت».
   */
  'aria-label': string;
  /** When true shows a spinner, sets `aria-busy`, and blocks interaction. */
  loading?: boolean;
  /** The icon to render (e.g. a lucide-react icon element). */
  children: React.ReactNode;
}

const base = cn(
  'relative inline-flex items-center justify-center',
  'min-h-[44px] min-w-[44px]',
  'rounded-md',
  'transition-colors duration-fast ease-standard',
  'outline-none focus-visible:outline focus-visible:outline-2',
  'focus-visible:outline-offset-2 focus-visible:outline-focus',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

const variantClasses: Record<ButtonVariant, string> = {
  primary: cn(
    'bg-primary text-primary-contrast shadow-1',
    'hover:brightness-110 active:brightness-95',
    'disabled:hover:brightness-100',
  ),
  secondary: cn(
    'bg-surface text-text border border-border',
    'hover:bg-elevated active:brightness-95',
    'disabled:hover:bg-surface',
  ),
  ghost: cn(
    'bg-transparent text-text',
    'hover:bg-surface active:brightness-95',
    'disabled:hover:bg-transparent',
  ),
  danger: cn(
    'bg-transparent text-danger',
    'hover:bg-surface active:brightness-95',
    'disabled:hover:bg-transparent',
  ),
};

/**
 * Icon-only button. Same variants/states as `Button` but requires `aria-label`
 * since there is no visible text. Keeps the ≥44×44 minimum target.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', loading = false, disabled, type = 'button', className, children, ...rest },
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
      className={cn(base, variantClasses[variant], className)}
      {...rest}
    >
      {loading ? (
        <Spinner size="sm" />
      ) : (
        <span className="inline-flex" aria-hidden="true">
          {children}
        </span>
      )}
    </button>
  );
});
