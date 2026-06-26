import { forwardRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from './cn';
import { Button } from './Button';

export interface ErrorStateProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /**
   * Short, human title for the failure. e.g. «بارگذاری نوبت‌ها ناموفق بود».
   * Never a raw stack trace or HTTP status code (ui-ux §6).
   */
  title: React.ReactNode;
  /**
   * Friendly cause + what to do next. e.g. «اتصال برقرار نشد — دوباره تلاش
   * کنید». Keep it actionable, not technical.
   */
  description?: React.ReactNode;
  /** Retry handler. When provided, a retry Button is rendered. */
  onRetry?: () => void;
  /** Label for the retry action. Defaults to «تلاش مجدد». */
  retryLabel?: string;
  /** Custom icon override; defaults to a warning triangle (not mirrored in RTL). */
  icon?: React.ReactNode;
}

/**
 * Error-State: cause + **retry** (ui-ux §6 data states, R2.3). Announced via
 * `role="alert"` so assistive tech reads the failure when it appears (ui-ux §10
 * live regions). Surfaces a friendly cause and a retry affordance — never a raw
 * stack/HTTP code.
 */
export const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(
  function ErrorState(
    { title, description, onRetry, retryLabel = 'تلاش مجدد', icon, className, ...rest },
    ref,
  ) {
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          'flex flex-col items-center justify-center gap-3 px-4 py-8 text-center',
          className,
        )}
        {...rest}
      >
        <span className="inline-flex text-danger" aria-hidden="true">
          {icon ?? <AlertTriangle className="h-8 w-8" />}
        </span>
        <p className="text-md font-medium text-text">{title}</p>
        {description && (
          <p className="max-w-[40ch] text-sm text-muted">{description}</p>
        )}
        {onRetry && (
          <Button variant="secondary" onClick={onRetry} className="mt-1">
            {retryLabel}
          </Button>
        )}
      </div>
    );
  },
);
