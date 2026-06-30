import { forwardRef } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './cn';
import {
  FieldError,
  FieldHelper,
  FieldLabel,
  useFieldIds,
  type FieldOwnProps,
} from './field';

export interface SelectOption {
  /** Machine value submitted/returned via `onValueChange`. */
  value: string;
  /** Visible label. */
  label: React.ReactNode;
  /** Disable just this option. */
  disabled?: boolean;
}

export interface SelectProps extends FieldOwnProps {
  /** Optional explicit id; one is generated when omitted. */
  id?: string;
  /** Controlled value. */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  /** Fires with the chosen option value. */
  onValueChange?: (value: string) => void;
  /** Options to render. */
  options: SelectOption[];
  /** Placeholder shown when no value is selected. */
  placeholder?: React.ReactNode;
  /** Message shown when `options` is empty (ui-ux §6 empty state). */
  emptyText?: React.ReactNode;
  /** Disable the whole control. */
  disabled?: boolean;
  /** Mark the underlying control required. */
  name?: string;
  /** Wrapper className (the outer field group). */
  containerClassName?: string;
  /** Trigger className. */
  className?: string;
}

/**
 * Accessible select built on Radix Select: native keyboard navigation +
 * type-ahead, RTL-correct (Radix reads document `dir`), and an explicit empty
 * state for an options list with no items (ui-ux §6). Reuses the shared
 * label/helper/error field plumbing (ui-ux §7, R2.1).
 *
 * The chevron is a universal (non-directional) caret so it is *not* mirrored in
 * RTL; placement follows the inline axis automatically via fl/logical layout.
 */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    label,
    helperText,
    error,
    labelHidden,
    required,
    id,
    value,
    defaultValue,
    onValueChange,
    options,
    placeholder,
    emptyText,
    disabled,
    name,
    containerClassName,
    className,
  },
  ref,
) {
  const hasError = Boolean(error);
  const hasHelper = Boolean(helperText);
  const { controlId, helperId, errorId, describedBy } = useFieldIds(
    id,
    hasHelper,
    hasError,
  );

  return (
    <div className={cn('w-full', containerClassName)}>
      <FieldLabel htmlFor={controlId} hidden={labelHidden} required={required}>
        {label}
      </FieldLabel>
      <RadixSelect.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled}
        name={name}
        required={required}
      >
        <RadixSelect.Trigger
          ref={ref}
          id={controlId}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          className={cn(
            'inline-flex w-full items-center justify-between gap-2',
            'min-h-[44px] rounded-md bg-bg px-3 py-2 text-start text-sm text-text',
            'border transition-colors duration-fast ease-standard',
            'outline-none focus-visible:outline focus-visible:outline-2',
            'focus-visible:outline-offset-2 focus-visible:outline-focus',
            'disabled:cursor-not-allowed disabled:opacity-60',
            'data-[placeholder]:text-muted',
            hasError ? 'border-danger' : 'border-border',
            className,
          )}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon aria-hidden="true" className="text-muted">
            <ChevronDown className="h-4 w-4" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            className={cn(
              // z-dialog (not z-overlay) so the dropdown renders ABOVE a Radix
              // Dialog (which sits on z-dialog); on z-overlay it would open
              // behind the dialog and its options would be invisible. Matches
              // the JalaliDatePicker popover, which also uses z-dialog.
              'z-dialog overflow-hidden rounded-md bg-elevated text-text shadow-2',
              'border border-border',
              'min-w-[var(--radix-select-trigger-width)]',
            )}
          >
            <RadixSelect.Viewport className="p-1">
              {options.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted" role="presentation">
                  {emptyText ?? 'موردی موجود نیست'}
                </div>
              ) : (
                options.map((option) => (
                  <RadixSelect.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className={cn(
                      'relative flex cursor-pointer select-none items-center',
                      'gap-2 rounded-sm py-2 pe-8 ps-3 text-sm outline-none',
                      'data-[highlighted]:bg-surface data-[highlighted]:outline-none',
                      'data-[state=checked]:font-medium',
                      'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60',
                    )}
                  >
                    <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                    <RadixSelect.ItemIndicator className="absolute end-2 inline-flex items-center">
                      <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                    </RadixSelect.ItemIndicator>
                  </RadixSelect.Item>
                ))
              )}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>

      {hasError ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : (
        hasHelper && <FieldHelper id={helperId}>{helperText}</FieldHelper>
      )}
    </div>
  );
});
