import {
  forwardRef,
  useId,
  useMemo,
  useRef,
  useState,
  useEffect,
} from 'react';
import * as RadixPopover from '@radix-ui/react-popover';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  gregorianToJalali,
  jalaliToGregorian,
  getJalaliMonthName,
} from '@salon/shared';
import { cn } from './cn';
import { IconButton } from './IconButton';
import { toPersianDigits } from './Num';
import { formatJalaliDisplay } from './JalaliDate';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from './Sheet';
import { FieldLabel, FieldHelper, FieldError } from './field';

/**
 * Persian weekday short labels in **Iranian week order** (Saturday first), used
 * for the calendar column headers (ui-ux §11, R7.8).
 */
const WEEKDAY_HEADERS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const;
const WEEKDAY_FULL = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
] as const;

const MS_PER_DAY = 86_400_000;

interface JalaliYM {
  jy: number;
  jm: number;
}

/** Strips a Date to local midnight so day comparisons ignore the time part. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Converts a Date to a date-only ISO string (`YYYY-MM-DD`) for the API boundary. */
function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses an ISO/date value into a local-midnight Date, or null when invalid. */
function parseValue(value: Date | string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
}

/** Days in a Jalali month, derived via the shared converter (no new kernel). */
function jalaliMonthLength({ jy, jm }: JalaliYM): number {
  const first = jalaliToGregorian({ jy, jm, jd: 1 });
  const next: JalaliYM = jm === 12 ? { jy: jy + 1, jm: 1 } : { jy, jm: jm + 1 };
  const nextFirst = jalaliToGregorian({ jy: next.jy, jm: next.jm, jd: 1 });
  const firstDate = new Date(first.year, first.month - 1, first.day);
  const nextDate = new Date(nextFirst.year, nextFirst.month - 1, nextFirst.day);
  return Math.round((nextDate.getTime() - firstDate.getTime()) / MS_PER_DAY);
}

/**
 * Iranian-week column index (Saturday = 0 … Friday = 6) for a JS day-of-week
 * (`Date.getDay()`, 0 = Sunday … 6 = Saturday).
 */
function iranianColumn(jsDay: number): number {
  return (jsDay + 1) % 7;
}

interface DayCell {
  date: Date;
  jd: number;
}

/** Builds the ordered day cells (with leading-blank padding) for a Jalali month. */
function buildMonthCells({ jy, jm }: JalaliYM): (DayCell | null)[] {
  const length = jalaliMonthLength({ jy, jm });
  const firstG = jalaliToGregorian({ jy, jm, jd: 1 });
  const firstDate = new Date(firstG.year, firstG.month - 1, firstG.day);
  const lead = iranianColumn(firstDate.getDay());

  const cells: (DayCell | null)[] = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let jd = 1; jd <= length; jd += 1) {
    cells.push({ date: new Date(firstG.year, firstG.month - 1, firstG.day + jd - 1), jd });
  }
  return cells;
}

function addJalaliMonths({ jy, jm }: JalaliYM, delta: number): JalaliYM {
  const zero = jy * 12 + (jm - 1) + delta;
  return { jy: Math.floor(zero / 12), jm: (zero % 12) + 1 };
}

function ymOf(date: Date): JalaliYM {
  const j = gregorianToJalali({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
  return { jy: j.jy, jm: j.jm };
}

function sameDay(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

interface JalaliCalendarProps {
  /** Currently selected day (local-midnight Date) or null. */
  selected: Date | null;
  /** Lower bound (inclusive) — earlier days are disabled. */
  min?: Date | null;
  /** Upper bound (inclusive) — later days are disabled. */
  max?: Date | null;
  /** Called with the chosen day when the user selects a date. */
  onSelect: (date: Date) => void;
  /** Stable id used to label the grid for assistive tech. */
  labelId: string;
}

/**
 * The month grid itself: navigable header, Iranian-week weekday row, and a
 * keyboard-operable day grid. Reused by both the popover and the bottom-sheet
 * presentations so behaviour is identical everywhere (ui-ux §1 consistency).
 *
 * Keyboard model (RTL-aware, R7.8 / ui-ux §11):
 *  - Arrow Left → next day, Arrow Right → previous day (visual flow in RTL).
 *  - Arrow Up/Down → previous/next week.
 *  - Home/End → first/last day of the week row; PageUp/PageDown → prev/next month.
 *  - Enter/Space → select the focused day.
 * A roving tabindex keeps a single tab stop; the focused day owns the grid focus.
 */
function JalaliCalendar({
  selected,
  min,
  max,
  onSelect,
  labelId,
}: JalaliCalendarProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const initial = selected ?? today;
  const [view, setView] = useState<JalaliYM>(() => ymOf(initial));
  const [focusDate, setFocusDate] = useState<Date>(initial);
  const gridRef = useRef<HTMLDivElement>(null);
  const shouldFocusRef = useRef(false);

  const cells = useMemo(() => buildMonthCells(view), [view]);

  // Keep the focused day inside the visible month.
  useEffect(() => {
    const focusYM = ymOf(focusDate);
    if (focusYM.jy !== view.jy || focusYM.jm !== view.jm) {
      setView(focusYM);
    }
  }, [focusDate, view.jy, view.jm]);

  // Move DOM focus onto the focused day only after a keyboard move (not on open).
  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    const el = gridRef.current?.querySelector<HTMLButtonElement>(
      '[data-focused="true"]',
    );
    el?.focus();
  });

  const isDisabled = (date: Date): boolean => {
    if (min && date.getTime() < min.getTime()) return true;
    if (max && date.getTime() > max.getTime()) return true;
    return false;
  };

  const moveFocus = (next: Date) => {
    shouldFocusRef.current = true;
    setFocusDate(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const days: Record<string, number> = {
      ArrowLeft: 1, // RTL: visual-left advances
      ArrowRight: -1, // RTL: visual-right goes back
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key in days) {
      event.preventDefault();
      moveFocus(new Date(focusDate.getTime() + days[event.key] * MS_PER_DAY));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      const col = iranianColumn(focusDate.getDay());
      moveFocus(new Date(focusDate.getTime() - col * MS_PER_DAY));
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      const col = iranianColumn(focusDate.getDay());
      moveFocus(new Date(focusDate.getTime() + (6 - col) * MS_PER_DAY));
      return;
    }
    if (event.key === 'PageUp') {
      event.preventDefault();
      const ym = addJalaliMonths(ymOf(focusDate), -1);
      const g = jalaliToGregorian({ jy: ym.jy, jm: ym.jm, jd: 1 });
      moveFocus(new Date(g.year, g.month - 1, g.day));
      return;
    }
    if (event.key === 'PageDown') {
      event.preventDefault();
      const ym = addJalaliMonths(ymOf(focusDate), 1);
      const g = jalaliToGregorian({ jy: ym.jy, jm: ym.jm, jd: 1 });
      moveFocus(new Date(g.year, g.month - 1, g.day));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!isDisabled(focusDate)) onSelect(focusDate);
    }
  };

  const goMonth = (delta: number) => {
    // Move the focus target into the target month as well. The "keep focus in
    // view" effect forces `view` to follow `focusDate`, so changing `view`
    // alone would be reverted — advancing the focus day keeps month browsing
    // via the chevrons working (and lands keyboard focus in the shown month).
    const target = addJalaliMonths(view, delta);
    const g = jalaliToGregorian({ jy: target.jy, jm: target.jm, jd: 1 });
    setView(target);
    setFocusDate(new Date(g.year, g.month - 1, g.day));
  };

  return (
    <div className="w-[17rem] max-w-full">
      {/* Month navigation header. Chevrons are directional → they flip with RTL
          automatically because the row is laid out with logical order. */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <IconButton
          aria-label="ماه قبل"
          variant="ghost"
          className="h-9 min-h-0 w-9 min-w-0"
          onClick={() => goMonth(-1)}
        >
          <ChevronRight className="h-5 w-5" />
        </IconButton>
        <span className="text-sm font-medium text-text" aria-live="polite">
          {getJalaliMonthName(view.jm)} {toPersianDigits(view.jy)}
        </span>
        <IconButton
          aria-label="ماه بعد"
          variant="ghost"
          className="h-9 min-h-0 w-9 min-w-0"
          onClick={() => goMonth(1)}
        >
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
      </div>

      {/* Weekday header row — Iranian order, Saturday first. */}
      <div
        className="mb-1 grid grid-cols-7 gap-1 text-center text-2xs text-muted"
        aria-hidden="true"
      >
        {WEEKDAY_HEADERS.map((label, i) => (
          <span key={WEEKDAY_FULL[i]} className="py-1">
            {label}
          </span>
        ))}
      </div>

      {/* Day grid. role="grid" + roving tabindex for keyboard operation. */}
      <div
        ref={gridRef}
        role="grid"
        aria-labelledby={labelId}
        className="grid grid-cols-7 gap-1"
        onKeyDown={handleKeyDown}
      >
        {cells.map((cell, index) => {
          if (!cell) {
            return <span key={`blank-${index}`} aria-hidden="true" />;
          }
          const disabled = isDisabled(cell.date);
          const isSelected = selected != null && sameDay(cell.date, selected);
          const isFocusTarget = sameDay(cell.date, focusDate);
          const isToday = sameDay(cell.date, today);
          return (
            <button
              key={cell.date.getTime()}
              type="button"
              role="gridcell"
              data-focused={isFocusTarget || undefined}
              aria-selected={isSelected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={formatJalaliDisplay(cell.date, 'long', true)}
              tabIndex={isFocusTarget ? 0 : -1}
              disabled={disabled}
              onClick={() => onSelect(cell.date)}
              onFocus={() => setFocusDate(cell.date)}
              className={cn(
                'flex h-10 min-h-0 w-full min-w-0 items-center justify-center',
                'rounded-md text-sm tabular-nums',
                'outline-none focus-visible:outline focus-visible:outline-2',
                'focus-visible:outline-offset-2 focus-visible:outline-focus',
                'transition-colors duration-fast ease-standard',
                'disabled:cursor-not-allowed disabled:opacity-40',
                isSelected
                  ? 'bg-primary text-primary-contrast'
                  : 'text-text hover:bg-surface',
                !isSelected && isToday && 'ring-1 ring-inset ring-border',
              )}
            >
              {toPersianDigits(cell.jd)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type JalaliDatePickerVariant = 'popover' | 'sheet';

export interface JalaliDatePickerProps {
  /** Selected date as an ISO/date string (API-boundary form), or null. */
  value: string | null;
  /** Emits the picked date as a `YYYY-MM-DD` ISO string. */
  onChange: (isoDate: string) => void;
  /** Visible field label (always rendered — never placeholder-as-label). */
  label: React.ReactNode;
  /** Placeholder shown on the trigger when no date is selected. */
  placeholder?: string;
  /** Inclusive lower bound as an ISO/date string. */
  min?: string | null;
  /** Inclusive upper bound as an ISO/date string. */
  max?: string | null;
  /** Disable the whole control. */
  disabled?: boolean;
  /** Optional helper text under the trigger. */
  helperText?: React.ReactNode;
  /** Error message; marks the trigger invalid and shows the alert. */
  error?: React.ReactNode;
  /** Caller-supplied id for the trigger (label association). */
  id?: string;
  /**
   * Presentation: `popover` (default) anchors a popover to the trigger;
   * `sheet` opens the calendar in a bottom sheet (better for phones, ui-ux §5).
   */
  variant?: JalaliDatePickerVariant;
}

/**
 * Jalali (Shamsi) date picker. Replaces the native `<input type="date">` with a
 * Persian calendar: Persian month names, Persian digits, and Iranian-week order
 * (Saturday first). The value crosses the component boundary as an **ISO date
 * string** and is converted to Jalali for display only (ui-ux §11, R7.2/R7.3/
 * R7.8 — reusing the shared converter, never a new one).
 *
 * Built on Radix Popover (default) so it inherits dismiss-on-outside-click,
 * `Esc` to close, and focus return to the trigger. On `variant="sheet"` it uses
 * the shared bottom Sheet for thumb-friendly mobile selection.
 */
export const JalaliDatePicker = forwardRef<HTMLButtonElement, JalaliDatePickerProps>(
  function JalaliDatePicker(
    {
      value,
      onChange,
      label,
      placeholder = 'انتخاب تاریخ',
      min,
      max,
      disabled = false,
      helperText,
      error,
      id,
      variant = 'popover',
    },
    ref,
  ) {
    const generatedId = useId();
    const triggerId = id ?? `jalali-${generatedId}`;
    const labelId = `${triggerId}-label`;
    const helperId = `${triggerId}-helper`;
    const errorId = `${triggerId}-error`;
    const [open, setOpen] = useState(false);

    const selected = parseValue(value);
    const minDate = parseValue(min);
    const maxDate = parseValue(max);
    const hasError = Boolean(error);

    const describedBy =
      cn(helperText && helperId, hasError && errorId) || undefined;

    const handleSelect = (date: Date) => {
      onChange(toISODate(date));
      setOpen(false);
    };

    const triggerClasses = cn(
      'flex w-full items-center justify-between gap-2',
      'min-h-[44px] rounded-md border bg-bg px-3 py-2',
      'text-start text-sm text-text',
      'transition-colors duration-fast ease-standard',
      'outline-none focus-visible:outline focus-visible:outline-2',
      'focus-visible:outline-offset-2 focus-visible:outline-focus',
      'disabled:cursor-not-allowed disabled:opacity-60',
      hasError ? 'border-danger' : 'border-border',
    );

    const triggerInner = (
      <>
        <span className={cn(!selected && 'text-muted')}>
          {selected
            ? formatJalaliDisplay(selected, 'long', true)
            : placeholder}
        </span>
        <Calendar className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
      </>
    );

    const calendar = (
      <JalaliCalendar
        selected={selected}
        min={minDate}
        max={maxDate}
        onSelect={handleSelect}
        labelId={labelId}
      />
    );

    return (
      <div>
        <span id={labelId}>
          <FieldLabel htmlFor={triggerId}>{label}</FieldLabel>
        </span>

        {variant === 'sheet' ? (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                ref={ref}
                id={triggerId}
                type="button"
                disabled={disabled}
                aria-haspopup="dialog"
                aria-invalid={hasError || undefined}
                aria-describedby={describedBy}
                className={triggerClasses}
              >
                {triggerInner}
              </button>
            </SheetTrigger>
            <SheetContent side="bottom">
              <SheetTitle className="mb-3">{label}</SheetTitle>
              {calendar}
            </SheetContent>
          </Sheet>
        ) : (
          <RadixPopover.Root open={open} onOpenChange={setOpen}>
            <RadixPopover.Trigger asChild>
              <button
                ref={ref}
                id={triggerId}
                type="button"
                disabled={disabled}
                aria-haspopup="dialog"
                aria-invalid={hasError || undefined}
                aria-describedby={describedBy}
                className={triggerClasses}
              >
                {triggerInner}
              </button>
            </RadixPopover.Trigger>
            <RadixPopover.Portal>
              <RadixPopover.Content
                role="dialog"
                aria-label={typeof label === 'string' ? label : undefined}
                align="start"
                sideOffset={8}
                className={cn(
                  'z-dialog rounded-lg border border-border bg-elevated p-4',
                  'text-text shadow-3 outline-none',
                )}
              >
                {calendar}
              </RadixPopover.Content>
            </RadixPopover.Portal>
          </RadixPopover.Root>
        )}

        {helperText && !hasError && (
          <FieldHelper id={helperId}>{helperText}</FieldHelper>
        )}
        {hasError && <FieldError id={errorId}>{error}</FieldError>}
      </div>
    );
  },
);
