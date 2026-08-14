import { forwardRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';
import { Button } from './Button';

export interface ErrorStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
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
  /** Heading level when the error is the page's primary heading. */
  headingLevel?: 'h1' | 'h2';
}

/**
 * Error-State: cause + **retry** (ui-ux §6 data states, R2.3). Announced via
 * `role="alert"` so assistive tech reads the failure when it appears (ui-ux §10
 * live regions). Surfaces a friendly cause and a retry affordance — never a raw
 * stack/HTTP code.
 */
export const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(function ErrorState(
  { title, description, onRetry, retryLabel, icon, headingLevel = 'h2', className, ...rest },
  ref,
) {
  const { t } = useTranslation();
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
      {headingLevel === 'h1' ? (
        <h1 className="text-md font-medium text-text">{title}</h1>
      ) : (
        <h2 className="text-md font-medium text-text">{title}</h2>
      )}
      {description && <p className="max-w-[40ch] text-sm text-muted">{description}</p>}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-1">
          {retryLabel ?? t('common.retry', 'تلاش مجدد')}
        </Button>
      )}
    </div>
  );
});
