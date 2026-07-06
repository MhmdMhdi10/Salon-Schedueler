import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  JalaliDatePicker,
  type JalaliDatePickerProps,
} from './JalaliDatePicker';

/**
 * Props for `MobileDatePicker`. Passes through all `JalaliDatePickerProps`
 * except `variant`, which is determined automatically by viewport width.
 */
export type MobileDatePickerProps = Omit<JalaliDatePickerProps, 'variant'>;

/**
 * Responsive date picker wrapper that renders `JalaliDatePicker` as a
 * bottom-sheet on mobile (below `md` breakpoint, < 768px) and as an
 * anchored popover on desktop.
 *
 * This encapsulates the mobile detection logic so consumers don't need to
 * manage viewport-based variant switching themselves.
 *
 * Accessibility:
 * - On mobile the Sheet (Radix Dialog) provides focus trap, `Esc` to close,
 *   focus return to trigger, and `aria-modal` + `aria-labelledby`.
 * - On desktop the Radix Popover provides dismiss-on-outside-click, `Esc` to
 *   close, and proper `aria-haspopup` semantics.
 * - Both variants expose a fully keyboard-operable Jalali calendar grid with
 *   RTL-aware arrow key navigation.
 *
 * Styling:
 * - Tokens-only; logical properties for RTL.
 * - The trigger maintains a 44px minimum touch target.
 *
 * @see Req 7.3  — Jalali date picker with Persian month/weekday labels
 * @see Req 10.2 — Bottom-sheet patterns for date/time pickers on mobile
 * @see Req 11.5 — Jalali (Shamsi) calendar with Persian month/weekday labels
 */
export function MobileDatePicker(props: MobileDatePickerProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');

  return (
    <JalaliDatePicker
      {...props}
      variant={isMobile ? 'sheet' : 'popover'}
    />
  );
}
