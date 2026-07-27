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

export interface TextFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'>, FieldOwnProps {
  /** Optional explicit id; one is generated when omitted. */
  id?: string;
  /** Wrapper className (the outer field group). */
  containerClassName?: string;
}

/**
 * Single-line text input with a visible label, optional helper text, and an
 * inline error (text + icon). Label/helper/error are wired via `htmlFor`,
 * `aria-describedby`, and `aria-invalid` so assistive tech announces them
 * (ui-ux §7, R2.7).
 *
 * `inputMode` / `autoComplete` / `dir` pass straight through, so callers can
 * set e.g. the LTR-isolated phone field (`type=tel inputMode=tel dir=ltr
 * autoComplete=tel`) or the OTP field without extra plumbing.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, helperText, error, labelHidden, required, id, className, containerClassName, ...rest },
  ref,
) {
  const hasError = Boolean(error);
  const hasHelper = Boolean(helperText);
  const { controlId, helperId, errorId, describedBy } = useFieldIds(id, hasHelper, hasError);

  return (
    <div className={cn('w-full', containerClassName)}>
      <FieldLabel htmlFor={controlId} hidden={labelHidden} required={required}>
        {label}
      </FieldLabel>
      <input
        ref={ref}
        id={controlId}
        required={required}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
        className={controlClasses(hasError, className)}
        {...rest}
      />
      {hasError ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : (
        hasHelper && <FieldHelper id={helperId}>{helperText}</FieldHelper>
      )}
    </div>
  );
});
