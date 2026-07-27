import { forwardRef } from 'react';
import { cn } from './cn';

export interface DirTextProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * Explicit direction for the isolated run. `auto` (default) lets the UA pick
   * the run's base direction from its first strong character — the right choice
   * for mixed Latin/Persian/number content (URLs, emails, phone fragments).
   */
  dir?: 'auto' | 'ltr' | 'rtl';
}

/**
 * Bidi isolation helper. Wraps a run of mixed-direction text (Farsi + Latin,
 * numbers, URLs, emails) in a `<bdi>` element so the surrounding RTL layout
 * cannot reorder it and adjacent punctuation/parentheses don't jump
 * (ui-ux §11). `<bdi>` carries `unicode-bidi: isolate` natively; we also set the
 * `dir` attribute so callers can force a direction when the heuristic is wrong.
 *
 * Usage:
 *   درگاه پرداخت <DirText>zarinpal.com</DirText> را باز می‌کند
 *   <DirText dir="ltr">+98 912 000 0000</DirText>
 */
export const DirText = forwardRef<HTMLElement, DirTextProps>(function DirText(
  { dir = 'auto', className, children, ...rest },
  ref,
) {
  return (
    <bdi ref={ref} dir={dir} className={cn('inline-block', className)} {...rest}>
      {children}
    </bdi>
  );
});
