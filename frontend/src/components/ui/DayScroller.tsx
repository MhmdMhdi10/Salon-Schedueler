import { forwardRef, useId, useRef } from 'react';
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
 * RTL-aware: under `dir="rtl"` the row scrolls start-to-end naturally. The row
 * is a `role="radiogroup"` of `role="radio"` items so the semantics match the
 * single-select intent, with a **roving tab stop**: exactly one chip (the
 * selected day, else the first enabled one) is tabbable, and ArrowLeft /
 * ArrowRight move focus RTL-aware (visual-left advances chronologically under
 * `dir="rtl"`, mirroring SlotGrid), with Home/End jumping to the edges. Each
 * chip carries a composed Persian aria-label («شنبه ۵ مرداد») so screen
 * readers hear the full date, not a bare number.
 */
export const DayScroller = forwardRef<HTMLDivElement, DayScrollerProps>(function DayScroller(
  { days, value, onChange, label = 'انتخاب روز' },
  ref,
) {
  const groupId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // The single roving tab stop: the selected day, else the first enabled chip.
  const firstEnabled = days.findIndex((d) => !d.disabled);
  const selectedIndex = days.findIndex((d) => d.iso === value && !d.disabled);
  const tabStopIndex = selectedIndex !== -1 ? selectedIndex : firstEnabled;

  const focusChip = (index: number) => {
    const buttons = Array.from(
      containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [],
    );
    const target = buttons[index];
    if (!target) return;
    target.focus();
    // Keep the focused chip visible inside the horizontal scroller.
    target.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
  };

  /** Next non-disabled index scanning from `start` in `step` direction. */
  const seekEnabled = (start: number, step: 1 | -1): number => {
    for (let i = start; i >= 0 && i < days.length; i += step) {
      if (!days[i].disabled) return i;
    }
    return -1;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (days.length === 0) return;
    const buttons = Array.from(
      containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [],
    );
    const current = buttons.findIndex((b) => b === document.activeElement);
    if (current === -1) return;

    let next = -1;
    switch (event.key) {
      case 'ArrowLeft': // RTL: visual-left advances chronologically
      case 'ArrowDown':
        next = seekEnabled(current + 1, 1);
        break;
      case 'ArrowRight': // RTL: visual-right goes back
      case 'ArrowUp':
        next = seekEnabled(current - 1, -1);
        break;
      case 'Home':
        next = seekEnabled(0, 1);
        break;
      case 'End':
        next = seekEnabled(days.length - 1, -1);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next !== -1) focusChip(next);
  };

  const setRefs = (node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  return (
    <div
      ref={setRefs}
      role="radiogroup"
      aria-label={label}
      id={groupId}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex gap-2 overflow-x-auto pb-2',
        'snap-x snap-mandatory',
        'scrollbar-thin [-ms-overflow-style:none] [scrollbar-width:none]',
        '[&::-webkit-scrollbar]:hidden',
      )}
    >
      {days.map((d, index) => {
        const selected = d.iso === value;
        const disabled = !!d.disabled;
        const dim = !d.hasSlots && !selected;
        const dayLabel = [d.weekday, toPersianDigits(d.day), d.month].filter(Boolean).join(' ');
        return (
          <button
            key={d.iso}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={dayLabel}
            disabled={disabled}
            tabIndex={index === tabStopIndex ? 0 : -1}
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
