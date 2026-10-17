import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../ui/cn';
import './RouteLoader.css';

/** Stable test id for the route-level loading fallback. */
export const ROUTE_LOADER_TESTID = 'route-loader';

export interface RouteLoaderProps {
  /** Optional className applied to the loader wrapper. */
  className?: string;
}

/**
 * Full-viewport loading screen shown while a lazily-loaded route chunk or
 * authenticated route is being prepared (R3.7, R9.3; ui-ux §6/§12).
 * The centered brand mark stays consistent across viewport sizes and routes.
 *
 * Accessibility: the region is a polite live region with `aria-busy` and an
 * accessible name, so assistive tech announces the in-flight load once without
 * being spammed by the individual decorative elements. It does not move focus
 * and disappears as soon as route content is ready.
 */
export function RouteLoader({ className }: RouteLoaderProps) {
  const { t } = useTranslation();

  useEffect(() => {
    document.documentElement.classList.add('app-route-loading');
    return () => document.documentElement.classList.remove('app-route-loading');
  }, []);

  return (
    <div
      data-testid={ROUTE_LOADER_TESTID}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={t('app.routeLoading')}
      className={cn(
        'route-loader mx-auto flex min-h-[60vh] w-full max-w-container flex-col gap-5 px-4 py-8',
        className,
      )}
    >
      <div className="route-loader__content" aria-hidden="true">
        <span className="route-loader__mark">
          <img
            src="/icons/icon-192.png"
            width={52}
            height={52}
            alt=""
          />
        </span>
        <span className="route-loader__label">در حال آماده‌سازی صفحه…</span>
        <span className="route-loader__track" />
      </div>

      {/* Visually-hidden status text for AT (the skeletons are aria-hidden). */}
      <span className="sr-only">{t('app.routeLoading')}</span>
    </div>
  );
}

export default RouteLoader;
