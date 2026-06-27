import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Percent, Wallet, Clock, BarChart3 } from 'lucide-react';
import { adminApi, ApiError } from '../../api/client';
import { SeoHead } from '../../components/seo';
import {
  Card,
  CardContent,
  CardTitle,
  EmptyState,
  ErrorState,
  Money,
  Num,
  Skeleton,
} from '../../components/ui';
import type { ChartDatum } from './AnalyticsChart';

/**
 * Admin analytics screen at `/admin/analytics` (R5.3, R5.4, R7.5, R2.3; ui-ux
 * Admin Analytics recipe, §4 tabular numerals, §6 states, §12 lazy-load charts).
 *
 * The redesign turns the bare key/value tables into a scannable, legible
 * dashboard built from the design-system primitives:
 *
 *  - **KPI cards** on top: chair **utilization %**, **revenue in Rial** (via
 *    `<Money>`), and the **busiest window**. Each card pairs a big figure with
 *    an icon and a supporting detail line, using tabular numerals so figures
 *    stay aligned (§4).
 *  - **A legible busiest-windows table** with a numeric "concurrent count"
 *    column that uses tabular numerals and logical `end` alignment (§4, §11),
 *    plus its own empty state.
 *  - **A lazy-loaded chart** (`AnalyticsChart`, loaded with `React.lazy` +
 *    `Suspense`) that never blocks first paint — the KPI cards and table render
 *    immediately while the chart chunk downloads behind a skeleton fallback
 *    (§12, R9.3).
 *  - **Data states** throughout: a skeleton dashboard while loading (not a
 *    spinner), a friendly error + retry, and per-surface empty states.
 *
 * All figures are display-localized only — Persian digits via `<Num>`, Rial via
 * `<Money>`, Jalali/clock times for windows — while the wire contract from
 * `adminApi.getAnalytics` is untouched (R7.4, R7.5, scope guard). Copy comes
 * from `fa.json` (`admin.analyticsPage.*`).
 *
 * Preserved test hooks (kept green): the `admin-analytics` root testID and the
 * `analytics-loading` / `analytics-error` / `analytics-utilization` /
 * `analytics-revenue` / `analytics-busiest` state/figure testIDs.
 *
 * An admin route is private and must never be indexed; `<SeoHead>` (noindex
 * default) emits `noindex,follow` (seo §1, R8.7).
 */

const DEFAULT_SALON_ID = '11111111-1111-1111-1111-111111111111';

type LoadStatus = 'loading' | 'success' | 'error';

/** Lazy chart — its own chunk, kept off first paint and off other bundles. */
const AnalyticsChart = lazy(() =>
  import('./AnalyticsChart').then((m) => ({ default: m.AnalyticsChart })),
);

/** Normalized utilization figures (display only). */
interface Utilization {
  ratio: number | null;
  bookedMinutes: number | null;
  availableMinutes: number | null;
}

/** Normalized revenue figures (display only). */
interface Revenue {
  totalRial: number | null;
  appointmentCount: number | null;
}

/** Normalized busiest window (display only). */
interface BusiestWindow {
  startAt?: string;
  endAt?: string;
  concurrentCount: number;
}

interface AnalyticsModel {
  utilization: Utilization;
  revenue: Revenue;
  busiestWindows: BusiestWindow[];
}

/** Read a finite number from an opaque record field, else null. */
function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/** Read a string from an opaque record field, else undefined. */
function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Shape the opaque API payload into the display model (no contract change). */
function toModel(raw: {
  utilization: unknown;
  revenue: unknown;
  busiestWindows: unknown;
}): AnalyticsModel {
  const u = (raw.utilization ?? {}) as Record<string, unknown>;
  const r = (raw.revenue ?? {}) as Record<string, unknown>;
  const windows = Array.isArray(raw.busiestWindows) ? raw.busiestWindows : [];

  return {
    utilization: {
      // Accept either a `{ utilization }` report or a bare ratio number.
      ratio: typeof raw.utilization === 'number' ? raw.utilization : num(u.utilization),
      bookedMinutes: num(u.bookedMinutes),
      availableMinutes: num(u.availableMinutes),
    },
    revenue: {
      // Accept either a `{ totalRial }` report or a bare amount number.
      totalRial: typeof raw.revenue === 'number' ? raw.revenue : num(r.totalRial),
      appointmentCount: num(r.appointmentCount),
    },
    busiestWindows: windows.map((w) => {
      const rec = (w ?? {}) as Record<string, unknown>;
      return {
        startAt: str(rec.startAt),
        endAt: str(rec.endAt),
        concurrentCount: num(rec.concurrentCount) ?? 0,
      };
    }),
  };
}

/** Default analytics window: the last 30 days up to today (ISO dates). */
function defaultRange(today: Date): { from: string; to: string } {
  const from = new Date(today);
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
}

/** `HH:mm` for an ISO instant, or null when not a valid date. */
function clockTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Localized «HH:mm – HH:mm» label for a window, or a dash when unscheduled. */
function windowLabel(w: BusiestWindow): string {
  const start = clockTime(w.startAt);
  const end = clockTime(w.endAt);
  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? '—';
}

interface KpiCardProps {
  testId: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
  figure: React.ReactNode;
  detail?: React.ReactNode;
}

/** A single KPI card: icon + title + big figure + supporting detail. */
function KpiCard({ testId, icon, title, hint, figure, detail }: KpiCardProps) {
  return (
    <Card as="section" data-testid={testId} className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-muted">
        <span className="inline-flex" aria-hidden="true">
          {icon}
        </span>
        <CardTitle as="h2" className="text-sm font-medium text-muted">
          {title}
        </CardTitle>
      </div>
      <CardContent className="flex flex-col gap-1">
        <p className="text-xl font-bold tabular-nums [font-feature-settings:'tnum'] text-text">
          {figure}
        </p>
        {detail && <p className="text-xs text-muted">{detail}</p>}
        <p className="sr-only">{hint}</p>
      </CardContent>
    </Card>
  );
}

/** Layout-matched skeleton dashboard shown while analytics loads (§6/§12). */
function AnalyticsSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      data-testid="analytics-loading"
      role="status"
      aria-busy="true"
      aria-label={t('admin.analyticsPage.loadingLabel')}
      className="flex flex-col gap-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={i} variant="rect" className="h-28" />
        ))}
      </div>
      <Skeleton variant="rect" className="h-48" />
    </div>
  );
}

export function AnalyticsPage({ salonId: salonIdProp }: { salonId?: string }) {
  const { t } = useTranslation();
  const params = useParams<{ salonId?: string }>();
  const salonId = salonIdProp ?? params.salonId ?? DEFAULT_SALON_ID;

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [model, setModel] = useState<AnalyticsModel | null>(null);
  // Bumped by the retry action to re-run the load effect.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError('');

    const { from, to } = defaultRange(new Date());
    adminApi
      .getAnalytics(salonId, from, to)
      .then((res) => {
        if (!active) return;
        setModel(toModel(res));
        setStatus('success');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : t('booking.failed'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [salonId, reloadToken, t]);

  /** The peak window (highest concurrency) for the busiest-window KPI. */
  const peakWindow = useMemo<BusiestWindow | null>(() => {
    if (!model || model.busiestWindows.length === 0) return null;
    return model.busiestWindows.reduce((peak, w) =>
      w.concurrentCount > peak.concurrentCount ? w : peak,
    );
  }, [model]);

  /** Display data for the lazy chart. */
  const chartData = useMemo<ChartDatum[]>(() => {
    if (!model) return [];
    return model.busiestWindows.map((w) => ({
      label: windowLabel(w),
      value: w.concurrentCount,
    }));
  }, [model]);

  return (
    <div data-testid="admin-analytics" className="flex flex-col gap-6">
      <SeoHead title={t('seo.titles.adminAnalytics')} />

      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-bold text-text">{t('admin.analytics')}</h1>
        <p className="max-w-[60ch] text-sm text-muted">
          {t('admin.analyticsPage.subtitle')}
        </p>
      </header>

      {status === 'loading' && <AnalyticsSkeleton />}

      {status === 'error' && (
        <ErrorState
          data-testid="analytics-error"
          title={t('admin.analyticsPage.errorTitle')}
          description={error}
          retryLabel={t('admin.analyticsPage.retry')}
          onRetry={() => setReloadToken((n) => n + 1)}
        />
      )}

      {status === 'success' && model && (
        <>
          {/* KPI cards (R5.3): utilization %, revenue (Rial), busiest window. */}
          <section
            aria-label={t('admin.analytics')}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <KpiCard
              testId="analytics-utilization"
              icon={<Percent className="h-5 w-5" />}
              title={t('admin.analyticsPage.kpi.utilizationTitle')}
              hint={t('admin.analyticsPage.kpi.utilizationHint')}
              figure={
                model.utilization.ratio == null ? (
                  t('admin.analyticsPage.noData')
                ) : (
                  <>
                    <Num value={Math.round(model.utilization.ratio * 100)} />٪
                  </>
                )
              }
              detail={
                model.utilization.bookedMinutes != null &&
                model.utilization.availableMinutes != null
                  ? t('admin.analyticsPage.kpi.utilizationDetail', {
                      booked: model.utilization.bookedMinutes,
                      available: model.utilization.availableMinutes,
                    })
                  : undefined
              }
            />

            <KpiCard
              testId="analytics-revenue"
              icon={<Wallet className="h-5 w-5" />}
              title={t('admin.analyticsPage.kpi.revenueTitle')}
              hint={t('admin.analyticsPage.kpi.revenueHint')}
              figure={
                model.revenue.totalRial == null ? (
                  t('admin.analyticsPage.noData')
                ) : (
                  <Money amountRial={model.revenue.totalRial} />
                )
              }
              detail={
                model.revenue.appointmentCount != null
                  ? t('admin.analyticsPage.kpi.revenueDetail', {
                      count: model.revenue.appointmentCount,
                    })
                  : undefined
              }
            />

            <KpiCard
              testId="analytics-busiest"
              icon={<Clock className="h-5 w-5" />}
              title={t('admin.analyticsPage.kpi.busiestTitle')}
              hint={t('admin.analyticsPage.kpi.busiestHint')}
              figure={
                peakWindow ? (
                  <Num value={windowLabel(peakWindow)} />
                ) : (
                  t('admin.analyticsPage.noData')
                )
              }
              detail={
                peakWindow
                  ? t('admin.analyticsPage.kpi.busiestCount', {
                      count: peakWindow.concurrentCount,
                    })
                  : undefined
              }
            />
          </section>

          {/* Busiest-windows table: numeric column uses tabular nums + `end`. */}
          <Card as="section" className="flex flex-col gap-4">
            <CardTitle as="h2" className="text-lg font-medium text-text">
              {t('admin.analyticsPage.table.title')}
            </CardTitle>
            {model.busiestWindows.length === 0 ? (
              <EmptyState
                data-testid="analytics-table-empty"
                icon={<Clock className="h-8 w-8" />}
                title={t('admin.analyticsPage.table.emptyTitle')}
                description={t('admin.analyticsPage.table.emptyBody')}
              />
            ) : (
              <>
                <table
                  data-testid="analytics-table"
                  className="w-full border-collapse text-sm"
                >
                  <thead>
                    <tr className="border-b border-border text-muted">
                      <th scope="col" className="py-2 text-start font-medium">
                        {t('admin.analyticsPage.table.windowCol')}
                      </th>
                      <th scope="col" className="py-2 text-end font-medium">
                        {t('admin.analyticsPage.table.countCol')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.busiestWindows.map((w, index) => (
                      <tr
                        // eslint-disable-next-line react/no-array-index-key
                        key={`${w.startAt ?? 'w'}-${index}`}
                        className="border-b border-border last:border-0"
                      >
                        <td className="py-2 text-start text-text">
                          <Num value={windowLabel(w)} />
                        </td>
                        <td className="py-2 text-end tabular-nums [font-feature-settings:'tnum'] text-text">
                          <Num value={w.concurrentCount} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Lazy chart — loads behind Suspense, never blocks first paint. */}
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium text-muted">
                    {t('admin.analyticsPage.chart.title')}
                  </h3>
                  <Suspense
                    fallback={
                      <Skeleton
                        variant="rect"
                        className="h-40"
                        aria-label={t('admin.analyticsPage.chart.loadingLabel')}
                      />
                    }
                  >
                    <AnalyticsChart data={chartData} />
                  </Suspense>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
