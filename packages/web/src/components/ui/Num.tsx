import { forwardRef } from 'react';
// Digit localization is shared across web + native + panel + bot via
// `@salon/shared` (Requirements 6.5, 6.6). Re-exported here so existing
// `../components/ui` consumers keep importing `toPersianDigits` unchanged.
import { toPersianDigits } from '@salon/shared';

export { toPersianDigits };

export interface NumProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The numeric value (or pre-formatted numeric string) to localize. */
  value: string | number;
}

/**
 * Digit localizer for display. Renders its value with Persian numerals inside a
 * `<bdi>` element so a localized number embedded in an RTL Persian sentence (or
 * next to Latin text) keeps its internal digit order and does not let
 * surrounding punctuation jump (ui-ux §11 bidi handling).
 *
 * Usage:
 *   <Num value={3} />            → ۳
 *   <Num value="09:30" />        → ۰۹:۳۰
 *   <Num value={1404} />         → ۱۴۰۴
 */
export const Num = forwardRef<HTMLElement, NumProps>(function Num(
  { value, ...rest },
  ref,
) {
  return (
    <bdi ref={ref} {...rest}>
      {toPersianDigits(value)}
    </bdi>
  );
});
