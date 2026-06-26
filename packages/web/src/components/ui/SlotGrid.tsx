import { forwardRef, useId, useRef } from 'react';
import {
  Check,
  Clock,
  Hourglass,
  Ban,
  History,
  type LucideIcon,
} from 'lucide-react';
import { cn } from './cn';
import { toPersianDigits } from './Num';

/**
 * The five slot states (ui-ux §3, R2.6). Each is distinguishable **without
 * color** — fill + label + icon — so meaning never depends on hue alone:
 *  - available  → selectable free slot
 *  - selected   → the slot the user picked
 *  - held       → temporarily held / pending payment (someone else, or an
 *                 in-flight hold) — not selectable
 *  - full       → fully booked — not selectable
 *  - past       → in the past — not selectable
 */
export type SlotState = 'available' | 'selected' | 'held' | 'full' | 'past';

/**
 * Logical column count used for vertical arrow navigation. The grid is
 * auto-fill responsive, so this is the navigation step rather than a hard layout
 * constraint — it keeps Up/Down movement predictable on common phone widths.
 */
const COLUMNS = 4;

/** Default lucide icon per state. All are universal/semantic (not mirrored). */
const stateIcon: Record<SlotState, LucideIcon> = {
  available: Clock,
  selected: Check,
  held: Hourglass,
  full: Ban,
  past: History,
};

/** Persian state label, appended for screen readers (and shown on disabled chips). */
const stateLabel: Record<SlotState, string> = {
  available: 'آزاد',
  selected: 'انتخاب‌شده',
  held: 'در انتظار',
  full: 'تکمیل',
  past: 'گذشته',
};

/** Whether a chip in this state can be interacted with. */
const interactive: Record<SlotState, boolean> = {
  available: true,
  selected: true,
  held: false,
  full: false,
  past: false,
};

/**
 * Per-state classes. The selected state uses the primary fill; available uses a
 * bordered surface; the non-selectable states (held/full/past) use distinct
 * fills + reduced emphasis so they read differently from each other and from
 * available even in grayscale.
 */
const stateClasses: Record<SlotState, string> = {
  available: 'border border-border bg-bg text-text hover:bg-surface',
  selected: 'border border-primary bg-primary text-primary-contrast',
  held: 'border border-warning/40 bg-warning/10 text-warning',
  full: 'border border-border bg-surface text-muted',
  past: 'border border-dashed border-border bg-surface text-muted',
};

export interface SlotChipProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Visual + interaction state of the slot. */
  state: SlotState;
  /** Visible slot label, e.g. a start time «۰۹:۳۰». Latin digits are localized. */
  label: string;
  /**
   * Accessible name override. Defaults to the label plus the Persian state word
   * («۰۹:۳۰، آزاد») so the state is announced, not conveyed by color only.
   */
  ariaLabel?: string;
}

/**
 * A single time-slot chip. Keeps a ≥44×44 target and the full interactive-state
 * set (default/hover/focus-visible/active/disabled). Non-selectable states
 * (held/full/past) render as disabled buttons so they are still announced with
 * their state but cannot be activated.
 */
export const SlotChip = forwardRef<HTMLButtonElement, SlotChipProps>(
  function SlotChip(
    { state, label, ariaLabel, className, disabled, ...rest },
    ref,
  ) {
    const Icon = stateIcon[state];
    const canInteract = interactive[state];
    const localizedLabel = toPersianDigits(label);
    const computedLabel = ariaLabel ?? `${localizedLabel}، ${stateLabel[state]}`;
    return (
      <button
        ref={ref}
        type="button"
        role="gridcell"
        aria-selected={state === 'selected'}
        aria-label={computedLabel}
        disabled={disabled ?? !canInteract}
        className={cn(
          'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1',
          'rounded-md px-3 py-2 text-sm tabular-nums',
          'transition-colors duration-fast ease-standard',
          'outline-none focus-visible:outline focus-visible:outline-2',
          'focus-visible:outline-offset-2 focus-visible:outline-focus',
          'active:brightness-95',
          'disabled:cursor-not-allowed',
          stateClasses[state],
          className,
        )}
        {...rest}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span aria-hidden="true">{localizedLabel}</span>
      </button>
    );
  },
);

export interface SlotItem {
  /** Stable key — typically the slot's ISO start time. */
  id: string;
  /** Display label (e.g. start time). */
  label: string;
  /** Current state of this slot. */
  state: SlotState;
}

export interface SlotGridProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** The slots to render. */
  slots: SlotItem[];
  /** Called with a slot id when a selectable slot is activated. */
  onSelect?: (id: string) => void;
  /** Accessible name for the grid (e.g. «زمان‌های موجود»). */
  ariaLabel?: string;
}

/**
 * A keyboard-navigable grid of time-slot chips (ui-ux §6, R2.6). Implements a
 * roving-tabindex `role="grid"` so the whole grid is one tab stop and arrow keys
 * move between chips. Arrow handling is **RTL-aware**: ArrowLeft advances and
 * ArrowRight goes back, matching visual flow under `dir="rtl"` (ui-ux §11).
 *
 * Loading/empty/error states are owned by the page (skeleton chips → empty card
 * → grid, per the design); this renders the populated grid.
 */
export const SlotGrid = forwardRef<HTMLDivElement, SlotGridProps>(
  function SlotGrid(
    { slots, onSelect, ariaLabel, className, ...rest },
    ref,
  ) {
    const gridId = useId();
    const containerRef = useRef<HTMLDivElement | null>(null);

    // First selectable (or selected) chip owns the initial tab stop.
    const initialIndex = (() => {
      const sel = slots.findIndex((s) => s.state === 'selected');
      if (sel !== -1) return sel;
      const free = slots.findIndex((s) => interactive[s.state]);
      return free === -1 ? 0 : free;
    })();

    const focusChip = (index: number) => {
      const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="gridcell"]',
      );
      buttons?.[index]?.focus();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      const count = slots.length;
      if (count === 0) return;
      const buttons = Array.from(
        containerRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="gridcell"]',
        ) ?? [],
      );
      const current = buttons.findIndex((b) => b === document.activeElement);
      if (current === -1) return;

      let next = current;
      switch (event.key) {
        case 'ArrowLeft': // RTL: visual-left advances
          next = Math.min(current + 1, count - 1);
          break;
        case 'ArrowRight': // RTL: visual-right goes back
          next = Math.max(current - 1, 0);
          break;
        case 'ArrowDown':
          next = Math.min(current + COLUMNS, count - 1);
          break;
        case 'ArrowUp':
          next = Math.max(current - COLUMNS, 0);
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = count - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      focusChip(next);
    };

    const setRefs = (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    };

    return (
      <div
        ref={setRefs}
        role="grid"
        aria-label={ariaLabel}
        id={gridId}
        onKeyDown={handleKeyDown}
        className={className}
        {...rest}
      >
        {/* A single logical row carries the responsive chip layout. The
            `role="grid"` → `role="row"` → `role="gridcell"` nesting satisfies
            the ARIA required-parent/children contract (R2.9, R10.4). */}
        <div
          role="row"
          className="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2"
        >
          {slots.map((slot, index) => (
            <SlotChip
              key={slot.id}
              state={slot.state}
              label={slot.label}
              tabIndex={index === initialIndex ? 0 : -1}
              onClick={
                interactive[slot.state] ? () => onSelect?.(slot.id) : undefined
              }
            />
          ))}
        </div>
      </div>
    );
  },
);

