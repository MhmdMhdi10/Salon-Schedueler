import { forwardRef } from 'react';
import { Motif } from '../brand/Motif';
import { cn } from './cn';

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Decorative illustrative icon (e.g. a lucide icon). Hidden from AT. */
  icon?: React.ReactNode;
  /** Short, specific title explaining the empty condition. */
  title: React.ReactNode;
  /**
   * Optional supporting copy. Empty states should sell the next action
   * (ui-ux §13), e.g. «هنوز نوبتی ثبت نشده — اولین رزرو را ایجاد کنید».
   */
  description?: React.ReactNode;
  /** Next-step action (typically a primary `Button`). */
  action?: React.ReactNode;
  /**
   * Render the faint oversized brand `Motif` watermark behind the content —
   * the signature-design-language treatment for owner/dashboard empty states.
   * Decorative (`aria-hidden`) and clipped to the component box.
   */
  watermark?: boolean;
}

/**
 * Empty-State: icon + explanation + next-step action (ui-ux §6 data states,
 * R2.3). Not just "no data" — it explains *why* it's empty and offers the
 * obvious next step. Centered within its container; the surrounding region
 * owns the heading level. Opt into the brand `watermark` on owner surfaces.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { icon, title, description, action, watermark = false, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'relative flex flex-col items-center justify-center gap-3 overflow-hidden px-4 py-8 text-center',
        className,
      )}
      {...rest}
    >
      {watermark && (
        <Motif
          variant="watermark"
          aria-hidden
          // Opacity is baked into the watermark variant itself.
          className="pointer-events-none absolute inset-0 m-auto h-full max-h-64 w-auto"
        />
      )}
      {icon && (
        <span className="relative inline-flex text-muted" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="relative text-md font-medium text-text">{title}</p>
      {description && <p className="relative max-w-[40ch] text-sm text-muted">{description}</p>}
      {action && <div className="relative mt-1">{action}</div>}
    </div>
  );
});
