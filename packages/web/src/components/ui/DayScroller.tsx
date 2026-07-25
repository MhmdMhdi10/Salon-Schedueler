import { forwardRef, useId } from 'react';
import { cn } from './cn';
import { toPersianDigits } from './Num';

export interface DayScrollerItem {
  /** ISO date string (YYYY-MM-DD) — opaque to this component. */
  iso: string;
  /** Persian weekday short label, e.g. «شنبه», «یک». */
  weekday: string;
  /** Day-of-month number (Persian calendar). */
  day: number;
  /** Month short label, e.g. «اردی». */
  month?: string;
  /** Whether the day has any open slots (drives the dim styling when false). */
  hasSlots?: boolean;
  /** Whether this day is in the past / not selectable. */
  disabled?: boolean;
}

export interface DayScrollerProps {
  /** The list of upcoming days to render (chronological). */
  days: DayScrollerItem[];
  /** Currently selected ISO date. */
  value?: string | null;
  /** Called when a non-disabled day is tapped. */
  onChange: (iso: string) => void;
  /** Accessible group label. */
  label?: string;
}

/**
 * Horizontal day scroller — the Booksy booking-funnel date selector.
 *
 * Renders a horizontally scrollable row of compact day chips (weekday label
 * above the day number) so a customer can swipe through the next ~14 days and
 * tap to select. The selected day takes the primary teal fill; days with no
 * open slots are dimmed but still focusable so the empty-state copy can fire.
 *
 * RTL-aware: under `dir="rtl"` the row scrolls start-to-end naturally. Keyboard
 * users move with Left/Right; the row is a `role="radiogroup"` of
 * `role="radio"` items so the semantics match the single-select intent.
 */
export const DayScroller = forwardRef<HTMLDivElement, DayScrollerProps>(function DayScroller(
  { days, value, onChange, label = 'انتخاب روز' },
  ref,
) {
  const groupId = useId();
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      id={groupId}
      className={cn(
        'flex gap-2 overflow-x-auto pb-2',
        'snap-x snap-mandatory',
        'scrollbar-thin [-ms-overflow-style:none] [scrollbar-width:none]',
        '[&::-webkit-scrollbar]:hidden',
      )}
    >
      {days.map((d) => {
        const selected = d.iso === value;
        const disabled = !!d.disabled;
        const dim = !d.hasSlots && !selected;
        return (
          <button
            key={d.iso}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            tabIndex={selected || (!value && d === days[0]) ? 0 : -1}
            onClick={() => !disabled && onChange(d.iso)}
            className={cn(
              'snap-start shrink-0',
              'flex w-16 flex-col items-center justify-center gap-0.5',
              'rounded-lg border py-2',
              'transition-colors duration-fast ease-standard',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              selected
                ? 'border-primary bg-primary text-primary-contrast shadow-1'
                : 'border-border bg-elevated text-text hover:border-primary/40 hover:bg-surface',
              disabled && 'cursor-not-allowed opacity-40',
              dim && !selected && 'opacity-60',
            )}
          >
            <span className={cn('text-2xs', selected ? 'text-primary-contrast' : 'text-muted')}>
              {d.weekday}
            </span>
            <span className="text-md font-semibold tabular-nums">{toPersianDigits(d.day)}</span>
            {d.month && (
              <span className={cn('text-2xs', selected ? 'text-primary-contrast' : 'text-muted')}>
                {d.month}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});
