import { forwardRef, useId } from 'react';
import * as RadixSwitch from '@radix-ui/react-switch';
import { cn } from './cn';

export interface SwitchProps
  extends Omit<
    React.ComponentPropsWithoutRef<typeof RadixSwitch.Root>,
    'children'
  > {
  /** Visible label rendered inline-start of the control. */
  label?: React.ReactNode;
  /** Optional helper text below the label. */
  helperText?: React.ReactNode;
  /** Wrapper className. */
  containerClassName?: string;
}

/**
 * Toggle switch built on Radix Switch. The thumb translates along the inline
 * axis, mirrored automatically in RTL via the document `dir` (ui-ux §6/§11,
 * R2.4). Includes focus-visible ring and disabled styling.
 */
export const Switch = forwardRef<
  React.ElementRef<typeof RadixSwitch.Root>,
  SwitchProps
>(function Switch(
  { label, helperText, id, className, containerClassName, ...rest },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? `switch-${generatedId}`;
  const helperId = `${controlId}-helper`;

  const control = (
    <RadixSwitch.Root
      ref={ref}
      id={controlId}
      aria-describedby={helperText ? helperId : undefined}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center',
        'rounded-pill border border-border bg-surface',
        'transition-colors duration-fast ease-standard',
        'outline-none focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-offset-2 focus-visible:outline-focus',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...rest}
    >
      <RadixSwitch.Thumb
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-pill bg-bg shadow-1',
          'transition-transform duration-fast ease-standard',
          // Inline-start by default; nudge toward inline-end when checked.
          // translateX is sign-flipped under RTL via the rtl: modifier.
          'translate-x-0.5 rtl:-translate-x-0.5',
          'data-[state=checked]:translate-x-[1.375rem] rtl:data-[state=checked]:-translate-x-[1.375rem]',
        )}
      />
    </RadixSwitch.Root>
  );

  if (!label) return control;

  return (
    <div className={cn('flex items-start gap-3', containerClassName)}>
      {control}
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
    </div>
  );
});
