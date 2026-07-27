import { forwardRef } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, Circle, type LucideIcon } from 'lucide-react';
import { cn } from './cn';

export type BadgeStatus = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * Status that drives both the color **and** the default icon. Per ui-ux §3,
   * meaning is never color-only: every badge pairs a tinted surface with an
   * icon and its text label. Defaults to `neutral`.
   */
  status?: BadgeStatus;
  /**
   * Override the default status icon. Pass `null` to hide the icon entirely
   * (only do this when the text alone is unambiguous and meaning is not carried
   * by color).
   */
  icon?: React.ReactNode | null;
}

/**
 * Default lucide icon per status. These are universal/semantic icons (check,
 * warning triangle, ✕, info, dot) and are **not** mirrored in RTL (ui-ux §11).
 */
const statusIcon: Record<BadgeStatus, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  neutral: Circle,
};

/**
 * Tinted surface + readable foreground per status. The text/icon use the solid
 * status token (which clears AA on the soft tint), and a matching border gives
 * a non-color edge cue. Tints use opacity over the status token so they track
 * the active theme automatically.
 */
const statusClasses: Record<BadgeStatus, string> = {
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
  info: 'bg-info/10 text-info border-info/30',
  neutral: 'bg-surface text-muted border-border',
};

/**
 * Status Badge / Chip. Pairs **color + icon + text** so it is distinguishable
 * without color (ui-ux §3, R2.6). Use for booking/payment status, slot states,
 * and inline labels.
 *
 * Usage:
 *   <Badge status="success">پرداخت شد</Badge>
 *   <Badge status="danger">پرداخت ناموفق</Badge>
 *   <Badge status="neutral" icon={null}>پیش‌نویس</Badge>
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { status = 'neutral', icon, className, children, ...rest },
  ref,
) {
  const DefaultIcon = statusIcon[status];
  const showDefaultIcon = icon === undefined;
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 align-middle',
        'rounded-pill border px-2 py-0.5',
        'text-2xs font-medium leading-none whitespace-nowrap',
        statusClasses[status],
        className,
      )}
      {...rest}
    >
      {showDefaultIcon ? (
        <DefaultIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : icon ? (
        <span className="inline-flex shrink-0" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span>{children}</span>
    </span>
  );
});
