import { useTranslation } from 'react-i18next';
import { Skeleton } from '../ui/Skeleton';
import { cn } from '../ui/cn';

/** Stable test id for the route-level loading fallback. */
export const ROUTE_LOADER_TESTID = 'route-loader';

export interface RouteLoaderProps {
  /** Optional className applied to the loader wrapper. */
  className?: string;
}

/**
 * Non-blocking route loading indicator shown as the `<Suspense>` fallback while
 * a lazily-loaded route chunk is fetched (R3.7, R9.3; ui-ux §6/§12).
 *
 * It is a **layout-matched skeleton**, not a centered spinner: a title bar plus
 * a stack of content blocks sized with the 8pt spacing scale so the loader
 * occupies roughly the same vertical space the routed page will, reserving
 * layout to protect Cumulative Layout Shift (CLS < 0.1). Animation is the
 * opacity-only `Skeleton` pulse, neutralized under `prefers-reduced-motion`.
 *
 * Accessibility: the region is a polite live region with `aria-busy` and an
 * accessible name, so assistive tech announces the in-flight load once without
 * being spammed by the individual (decorative) skeleton blocks. It does not
 * trap focus or block the rest of the shell — it is purely transient.
 */
export function RouteLoader({ className }: RouteLoaderProps) {
  const { t } = useTranslation();

  return (
    <div
      data-testid={ROUTE_LOADER_TESTID}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={t('app.routeLoading')}
      // Reserve a realistic content height so swapping the loader for the page
      // does not shift surrounding layout (sticky footer, etc.).
      className={cn('flex min-h-[60vh] flex-col gap-5', className)}
    >
      {/* Page-title placeholder. */}
      <Skeleton variant="text" className="h-7 w-1/2 max-w-xs" />

      {/* Primary content blocks. */}
      <div className="flex flex-col gap-3">
        <Skeleton variant="rect" className="h-12" />
        <Skeleton variant="rect" className="h-12" />
        <Skeleton variant="rect" className="h-32" />
      </div>

      {/* Visually-hidden status text for AT (the skeletons are aria-hidden). */}
      <span className="sr-only">{t('app.routeLoading')}</span>
    </div>
  );
}

export default RouteLoader;
