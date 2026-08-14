import { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from './cn';

/**
 * Shared form-field plumbing for `TextField` / `Textarea` (and any future
 * single-control field). Centralizes the accessible label / helper / error
 * wiring required by ui-ux §7 and R2.7:
 *
 *  - visible `<label htmlFor>` tied to the control id
 *  - helper text and error message linked via `aria-describedby`
 *  - `aria-invalid` set when an error is present
 *  - error shown as text **+** icon (never color-only), in a `role="alert"`
 *    live region so assistive tech announces it
 */
export interface FieldOwnProps {
  /** Visible label text (always rendered — never placeholder-as-label). */
  label: React.ReactNode;
  /** Optional helper/hint text shown below the control. */
  helperText?: React.ReactNode;
  /** Error message; when set, marks the control invalid and shows the alert. */
  error?: React.ReactNode;
  /** Hide the label visually while keeping it for assistive tech. */
  labelHidden?: boolean;
  /** Mark the field required (adds an accessible required indicator). */
  required?: boolean;
}

export interface FieldIds {
  controlId: string;
  describedBy: string | undefined;
  hasError: boolean;
}

/**
 * Resolves stable ids and the `aria-describedby` string for a field, given an
 * optional caller-supplied id. Helper and error get distinct ids so both can be
 * announced when present.
 */
export function useFieldIds(
  providedId: string | undefined,
  hasHelper: boolean,
  hasError: boolean,
): FieldIds & { helperId: string; errorId: string } {
  const generatedId = useId();
  const controlId = providedId ?? `field-${generatedId}`;
  const helperId = `${controlId}-helper`;
  const errorId = `${controlId}-error`;
  const describedBy = cn(hasHelper && helperId, hasError && errorId) || undefined;
  return { controlId, helperId, errorId, describedBy, hasError };
}

export function FieldLabel({
  htmlFor,
  hidden,
  required,
  children,
}: {
  htmlFor: string;
  hidden?: boolean;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn('mb-1 block text-xs font-medium text-text', hidden && 'sr-only')}
    >
      {children}
      {required && (
        <span className="text-danger" aria-hidden="true">
          {' '}
          *
        </span>
      )}
    </label>
  );
}

export function FieldHelper({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1 text-2xs text-muted">
      {children}
    </p>
  );
}

export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1 flex items-center gap-1 text-2xs text-danger">
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Shared control border/background classes. The invalid border uses the danger
 * token so the field reads as errored without relying on color alone (the icon
 * + text in `FieldError` carry the meaning too).
 */
export function controlClasses(hasError: boolean, extra?: string): string {
  return cn(
    'block w-full rounded-md bg-bg text-text text-sm',
    'border px-3 py-2',
    'placeholder:text-muted',
    'transition-colors duration-fast ease-standard',
    'outline-none focus-visible:outline focus-visible:outline-2',
    'focus-visible:outline-offset-2 focus-visible:outline-focus',
    'disabled:cursor-not-allowed disabled:opacity-60',
    hasError ? 'border-danger' : 'border-border',
    extra,
  );
}
