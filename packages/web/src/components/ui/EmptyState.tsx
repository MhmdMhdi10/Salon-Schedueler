import { forwardRef } from 'react';
import { cn } from './cn';

export interface EmptyStateProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
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
}

/**
 * Empty-State: icon + explanation + next-step action (ui-ux §6 data states,
 * R2.3). Not just "no data" — it explains *why* it's empty and offers the
 * obvious next step. Centered within its container; the surrounding region
 * owns the heading level.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  function EmptyState({ icon, title, description, action, className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center gap-3 px-4 py-8 text-center',
          className,
        )}
        {...rest}
      >
        {icon && (
          <span className="inline-flex text-muted" aria-hidden="true">
            {icon}
          </span>
        )}
        <p className="text-md font-medium text-text">{title}</p>
        {description && (
          <p className="max-w-[40ch] text-sm text-muted">{description}</p>
        )}
        {action && <div className="mt-1">{action}</div>}
      </div>
    );
  },
);
