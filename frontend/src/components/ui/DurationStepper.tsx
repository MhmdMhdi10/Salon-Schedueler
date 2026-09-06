import type { ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { normalizeDigits } from '@salon/shared';
import { cn } from './cn';
import { IconButton } from './IconButton';
import { toPersianDigits } from './Num';

export interface DurationStepperProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  /** Accessible name used for the control group when label is not plain text. */
  ariaLabel?: string;
  min?: number;
  max?: number;
  step?: number;
  /** When true, decreasing the minimum duration clears the optional value. */
  allowEmpty?: boolean;
  helperText?: ReactNode;
  className?: string;
  disabled?: boolean;
}

function parseMinutes(value: string): number {
  const parsed = Number.parseInt(normalizeDigits(value).replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Accessible duration control with fixed increments. It intentionally has no
 * text input: owners choose a duration in 30-minute steps using large touch
 * targets, while optional durations can be cleared with the minus button.
 */
export function DurationStepper({
  label,
  value,
  onChange,
  ariaLabel,
  min = 30,
  max = 480,
  step = 30,
  allowEmpty = false,
  helperText,
  className,
  disabled = false,
}: DurationStepperProps) {
  const current = parseMinutes(value);
  const increment = Math.max(1, step);
  const minimum = Math.max(1, min);
  const maximum = Math.max(minimum, max);
  const stepLabel = toPersianDigits(String(increment));
  const canDecrease = current > 0 && (allowEmpty || current > minimum);
  const accessibleLabel = ariaLabel ?? (typeof label === 'string' ? label : 'مدت خدمت');

  const increase = () => {
    if (disabled || current >= maximum) return;
    const next = current > 0 ? current + increment : minimum;
    onChange(String(Math.min(maximum, next)));
  };

  const decrease = () => {
    if (disabled || !canDecrease) return;
    const next = current - increment;
    onChange(allowEmpty && next < minimum ? '' : String(Math.max(minimum, next)));
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <span className="text-xs font-medium text-text">{label}</span>
      <div
        role="group"
        aria-label={accessibleLabel}
        className="flex min-h-14 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-border bg-bg p-1.5"
        dir="ltr"
      >
        <IconButton
          type="button"
          variant="secondary"
          aria-label={`کاهش ${stepLabel} دقیقه`}
          title={`کاهش ${stepLabel} دقیقه`}
          disabled={disabled || !canDecrease}
          onClick={decrease}
          className="shrink-0"
        >
          <Minus className="h-4 w-4" />
        </IconButton>
        <output
          aria-live="polite"
          aria-label={current > 0 ? `${toPersianDigits(String(current))} دقیقه` : 'مدت انتخاب نشده'}
          className="min-w-0 flex-1 overflow-hidden text-center text-sm font-semibold text-text"
          dir="rtl"
        >
          {current > 0 ? toPersianDigits(String(current)) : '—'}
        </output>
        <IconButton
          type="button"
          variant="secondary"
          aria-label={`افزایش ${stepLabel} دقیقه`}
          title={`افزایش ${stepLabel} دقیقه`}
          disabled={disabled || current >= maximum}
          onClick={increase}
          className="shrink-0"
        >
          <Plus className="h-4 w-4" />
        </IconButton>
      </div>
      {helperText ? <p className="m-0 text-xs leading-5 text-muted">{helperText}</p> : null}
    </div>
  );
}
