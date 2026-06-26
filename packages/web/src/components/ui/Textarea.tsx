import { forwardRef } from 'react';
import { cn } from './cn';
import {
  FieldError,
  FieldHelper,
  FieldLabel,
  controlClasses,
  useFieldIds,
  type FieldOwnProps,
} from './field';

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>,
    FieldOwnProps {
  /** Optional explicit id; one is generated when omitted. */
  id?: string;
  /** Wrapper className (the outer field group). */
  containerClassName?: string;
}

/**
 * Multi-line text input following the same label/helper/error pattern as
 * `TextField`: visible `<label htmlFor>`, helper text, inline error (text +
 * icon), wired via `aria-describedby` and `aria-invalid` (ui-ux §7, R2.7).
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      label,
      helperText,
      error,
      labelHidden,
      required,
      id,
      rows = 4,
      className,
      containerClassName,
      ...rest
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
        <textarea
          ref={ref}
          id={controlId}
          rows={rows}
          required={required}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          className={controlClasses(hasError, cn('resize-y', className))}
          {...rest}
        />
        {hasError ? (
          <FieldError id={errorId}>{error}</FieldError>
        ) : (
          hasHelper && <FieldHelper id={helperId}>{helperText}</FieldHelper>
        )}
      </div>
    );
  },
);
