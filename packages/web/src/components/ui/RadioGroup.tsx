import { forwardRef, useId } from 'react';
import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import { cn } from './cn';

export interface RadioOption {
  value: string;
  label: React.ReactNode;
  helperText?: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps
  extends Omit<
    React.ComponentPropsWithoutRef<typeof RadixRadioGroup.Root>,
    'children'
  > {
  /** Accessible group label (rendered as a legend). */
  label?: React.ReactNode;
  /** Hide the group label visually but keep it for assistive tech. */
  labelHidden?: boolean;
  /** The radio options. */
  options: RadioOption[];
  /** Wrapper className. */
  containerClassName?: string;
}

/**
 * Radio group built on Radix RadioGroup. Roving-tabindex keyboard navigation
 * (arrow keys) is handled by Radix and is RTL-aware via the document `dir`
 * (ui-ux §6, R2.4). Each item gets a focus-visible ring and disabled styling.
 */
export const RadioGroup = forwardRef<
  React.ElementRef<typeof RadixRadioGroup.Root>,
  RadioGroupProps
>(function RadioGroup(
  { label, labelHidden, options, className, containerClassName, ...rest },
  ref,
) {
  const generatedId = useId();
  const labelId = `radiogroup-${generatedId}-label`;

  return (
    <div
      className={cn('w-full', containerClassName)}
      role="group"
      aria-labelledby={label ? labelId : undefined}
    >
      {label && (
        <p
          id={labelId}
          className={cn(
            'mb-1 block text-xs font-medium text-text',
            labelHidden && 'sr-only',
          )}
        >
          {label}
        </p>
      )}
      <RadixRadioGroup.Root
        ref={ref}
        aria-labelledby={label ? labelId : undefined}
        className={cn('flex flex-col gap-2', className)}
        {...rest}
      >
        {options.map((option) => {
          const itemId = `${generatedId}-${option.value}`;
          const helperId = `${itemId}-helper`;
          return (
            <div key={option.value} className="flex items-start gap-2">
              <RadixRadioGroup.Item
                id={itemId}
                value={option.value}
                disabled={option.disabled}
                aria-describedby={option.helperText ? helperId : undefined}
                className={cn(
                  'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center',
                  'rounded-pill border border-border bg-bg',
                  'transition-colors duration-fast ease-standard',
                  'outline-none focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-offset-2 focus-visible:outline-focus',
                  'data-[state=checked]:border-primary',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                <RadixRadioGroup.Indicator className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-pill bg-primary" />
              </RadixRadioGroup.Item>
              <div className="min-w-0">
                <label
                  htmlFor={itemId}
                  className="block cursor-pointer text-sm text-text"
                >
                  {option.label}
                </label>
                {option.helperText && (
                  <p id={helperId} className="mt-0.5 text-2xs text-muted">
                    {option.helperText}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </RadixRadioGroup.Root>
    </div>
  );
});
