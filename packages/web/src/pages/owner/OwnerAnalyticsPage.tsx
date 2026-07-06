import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Percent,
  Wallet,
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  Clock,
  BarChart3,
} from 'lucide-react';
import { adminApi } from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { SeoHead } from '../../components/seo';
import {
  Card,
  CardContent,
  ErrorState,
  Money,
  Num,
  Skeleton,
} from '../../components/ui';
import { AnimatedCounter } from '../../components/ui/AnimatedCounter';
import { containerVariants, itemVariants } from '../../lib/motion-variants';
import type { ChartDatum } from '../admin/AnalyticsChart';

/**
 * Owner analytics page — redesigned with the NYC dark-mode-first aesthetic,
 * animated counter metrics, and lazy-loaded charts (Req 8.3, 8.6, 8.7, 13.5,
 * 11.4, 11.6).
 *
 * Design direction:
 * - 4 metric cards at the top in a responsive 2x2 → 4-col grid
 * - Each metric card uses AnimatedCounter with Persian numerals
 * - Icons + labels in Persian + trend indicators
 * - Dark surface cards with magenta accent for key data
 * - Chart section: lazy-loaded with React.lazy + Suspense
 * - Skeleton state for loading, error state with retry
 * - All numbers in Persian, Rial formatting
 */

type LoadStatus = 'loading' | 'success' | 'error';

/** Lazy chart — its own chunk, kept off first paint. */
const AnalyticsChart = lazy(() =>
  import('../admin/AnalyticsChart').then((m) => ({ default: m.AnalyticsChart })),
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
      ratio: typeof raw.utilization === 'number' ? raw.utilization : num(u.utilization),
      bookedMinutes: num(u.bookedMinutes),
      availableMinutes: num(u.availableMinutes),
    },
    revenue: {
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

/** Default analytics window: last 30 days up to today (ISO dates). */
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

/** Localized «HH:mm – HH:mm» label for a window, or a dash. */
function windowLabel(w: BusiestWindow): string {
  const start = clockTime(w.startAt);
  const end = clockTime(w.endAt);
  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? '—';
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

interface MetricCardProps {
  testId: string;
  icon: React.ReactNode;
  label: string;
  value: number | null;
  suffix?: string;
  prefix?: string;
  /** Optional trend: positive = up, negative = down */
  trend?: number | null;
  /** If true, format value as Rial (handled via Money component) */
  isRial?: boolean;
  /** Detail line below the counter. */
  detail?: React.ReactNode;
}

/**
 * A single metrics card with AnimatedCounter, icon, trend indicator.
 * NYC aesthetic: dark surface card, magenta accent, bold numbers.
 */
function MetricCard({
  testId,
  icon,
  label,
  value,
  suffix,
  prefix,
  trend,
  isRial,
  detail,
}: MetricCardProps) {
  const { t } = useTranslation();

  return (
    <motion.div variants={itemVariants}>
      <Card
        as="section"
        data-testid={testId}
        className="flex flex-col gap-3 p-5 border border-border"
      >
        {/* Header: icon + label */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 text-primary"
              aria-hidden="true"
            >
              {icon}
            </span>
            <span className="text-sm font-medium text-muted">{label}</span>
          </div>

          {/* Trend indicator */}
          {trend != null && trend !== 0 && (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                trend > 0 ? 'text-success' : 'text-danger'
              }`}
              aria-label={
                trend > 0
                  ? t('owner.analytics.trendUp')
                  : t('owner.analytics.trendDown')
              }
            >
              {trend > 0 ? (
                <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <Num value={Math.abs(trend)} />٪
            </span>
          )}
        </div>

        {/* Big number with counter animation */}
        <CardContent className="flex flex-col gap-1">
          {value == null ? (
            <p className="text-xl font-bold text-muted">
              {t('admin.analyticsPage.noData')}
            </p>
          ) : isRial ? (
            <div className="text-2xl font-bold tabular-nums [font-feature-settings:'tnum'] text-text text-display">
              <Money amountRial={value} />
            </div>
          ) : (
            <AnimatedCounter
              target={value}
              label=""
              prefix={prefix}
              suffix={suffix}
              className="text-start"
            />
          )}

          {detail && (
            <p className="text-xs text-muted mt-1">{detail}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

/** Layout-matched skeleton shown while analytics loads. */
function OwnerAnalyticsSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      data-testid="analytics-loading"
      role="status"
      aria-busy="true"
      aria-label={t('admin.analyticsPage.loadingLabel')}
      className="flex flex-col gap-6"
    >
      {/* Metric cards skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rect" className="h-32 rounded-md" />
        ))}
      </div>
      {/* Chart skeleton */}
      <Skeleton variant="rect" className="h-56 rounded-md" />
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function OwnerAnalyticsPageContent({ salonId: salonIdProp }: { salonId?: string }) {
  const { t } = useTranslation();
  const params = useParams<{ salonId?: string }>();
  const sessionSalonId = useSalonId();
  const salonId = salonIdProp ?? params.salonId ?? sessionSalonId;

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [model, setModel] = useState<AnalyticsModel | null>(null);
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
      .catch((_err: unknown) => {
        if (!active) return;
        setError(t('admin.analyticsPage.errorBody'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [salonId, reloadToken, t]);

  /** Peak window for the busiest-window metric card. */
  const peakWindow = useMemo<BusiestWindow | null>(() => {
    if (!model || model.busiestWindows.length === 0) return null;
    return model.busiestWindows.reduce((peak, w) =>
      w.concurrentCount > peak.concurrentCount ? w : peak,
    );
  }, [model]);

  /** Chart data for the lazy-loaded chart. */
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

      {/* Page header */}
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-text text-display">
          {t('admin.analytics')}
        </h1>
        <p className="max-w-[60ch] text-sm text-muted">
          {t('admin.analyticsPage.subtitle')}
        </p>
      </header>

      {status === 'loading' && <OwnerAnalyticsSkeleton />}

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
          {/* ── Metrics Cards ─────────────────────────────────────────── */}
          <motion.section
            aria-label={t('owner.analytics.metricsLabel')}
            className="grid grid-cols-2 gap-4 lg:grid-cols-4"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Utilization % */}
            <MetricCard
              testId="analytics-utilization"
              icon={<Percent className="h-4 w-4" />}
              label={t('admin.analyticsPage.kpi.utilizationTitle')}
              value={
                model.utilization.ratio != null
                  ? Math.round(model.utilization.ratio * 100)
                  : null
              }
              suffix="٪"
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

            {/* Revenue (Rial) */}
            <MetricCard
              testId="analytics-revenue"
              icon={<Wallet className="h-4 w-4" />}
              label={t('admin.analyticsPage.kpi.revenueTitle')}
              value={model.revenue.totalRial}
              isRial
              detail={
                model.revenue.appointmentCount != null
                  ? t('admin.analyticsPage.kpi.revenueDetail', {
                      count: model.revenue.appointmentCount,
                    })
                  : undefined
              }
            />

            {/* Bookings count */}
            <MetricCard
              testId="analytics-bookings"
              icon={<CalendarCheck className="h-4 w-4" />}
              label={t('owner.analytics.bookingsTitle')}
              value={model.revenue.appointmentCount}
              detail={t('owner.analytics.bookingsDetail')}
            />

            {/* Busiest window */}
            <MetricCard
              testId="analytics-busiest"
              icon={<Clock className="h-4 w-4" />}
              label={t('admin.analyticsPage.kpi.busiestTitle')}
              value={peakWindow?.concurrentCount ?? null}
              detail={
                peakWindow ? (
                  <span className="tabular-nums">
                    <Num value={windowLabel(peakWindow)} />
                  </span>
                ) : undefined
              }
            />
          </motion.section>

          {/* ── Chart Section (lazy-loaded) ────────────────────────────── */}
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="visible"
          >
            <Card
              as="section"
              className="flex flex-col gap-4 p-5 border border-border"
            >
              <div className="flex items-center gap-2">
                <BarChart3
                  className="h-5 w-5 text-primary"
                  aria-hidden="true"
                />
                <h2 className="text-lg font-bold text-text text-display">
                  {t('admin.analyticsPage.chart.title')}
                </h2>
              </div>

              {model.busiestWindows.length === 0 ? (
                <p className="text-sm text-muted py-8 text-center">
                  {t('admin.analyticsPage.table.emptyBody')}
                </p>
              ) : (
                <>
                  {/* Accessible table equivalent for AT users */}
                  <table
                    id="owner-analytics-busiest-table"
                    data-testid="analytics-table"
                    className="w-full border-collapse text-sm"
                    aria-label={t('admin.analyticsPage.table.title')}
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

                  {/* Lazy-loaded chart */}
                  <Suspense
                    fallback={
                      <Skeleton
                        variant="rect"
                        className="h-44"
                        aria-label={t('admin.analyticsPage.chart.loadingLabel')}
                      />
                    }
                  >
                    <AnalyticsChart
                      data={chartData}
                      tableId="owner-analytics-busiest-table"
                    />
                  </Suspense>
                </>
              )}
            </Card>
          </motion.div>
        </>
      )}
    </div>
  );
}
