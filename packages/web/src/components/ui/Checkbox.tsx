import { forwardRef, useId } from 'react';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from './cn';

export interface CheckboxProps
  extends Omit<
    React.ComponentPropsWithoutRef<typeof RadixCheckbox.Root>,
    'children'
  > {
  /** Visible label rendered inline-end of the control. */
  label?: React.ReactNode;
  /** Optional helper text below the label. */
  helperText?: React.ReactNode;
  /** Wrapper className. */
  containerClassName?: string;
}

/**
 * Checkbox built on Radix Checkbox. Supports the indeterminate state
 * (`checked="indeterminate"`), focus-visible ring, and disabled styling
 * (ui-ux §6, R2.4). The hit target stays ≥44px tall via the row padding.
 */
export const Checkbox = forwardRef<
  React.ElementRef<typeof RadixCheckbox.Root>,
  CheckboxProps
>(function Checkbox(
  { label, helperText, id, className, containerClassName, ...rest },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? `checkbox-${generatedId}`;
  const helperId = `${controlId}-helper`;

  return (
    <div className={cn('flex items-start gap-2', containerClassName)}>
      <RadixCheckbox.Root
        ref={ref}
        id={controlId}
        aria-describedby={helperText ? helperId : undefined}
        className={cn(
          'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center',
          'rounded-sm border border-border bg-bg text-primary-contrast',
          'transition-colors duration-fast ease-standard',
          'outline-none focus-visible:outline focus-visible:outline-2',
          'focus-visible:outline-offset-2 focus-visible:outline-focus',
          'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
          'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...rest}
      >
        <RadixCheckbox.Indicator className="inline-flex items-center justify-center">
          {rest.checked === 'indeterminate' ? (
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      {label && (
        <div className="min-w-0">
          <label
            htmlFor={controlId}
            className="block cursor-pointer text-sm text-text"
          >
            {label}
          </label>
          {helperText && (
            <p id={helperId} className="mt-0.5 text-2xs text-muted">
              {helperText}
            </p>
          )}
        </div>
      )}
    </div>
  );
});
