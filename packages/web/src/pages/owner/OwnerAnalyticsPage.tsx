import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  CreditCard,
  Percent,
  RefreshCw,
  Scissors,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { adminApi } from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { SeoHead } from '../../components/seo';
import {
  Button,
  Card,
  CardContent,
  CardTitle,
  EmptyState,
  ErrorState,
  Money,
  Num,
  Pagination,
  Skeleton,
} from '../../components/ui';
import { AnimatedCounter } from '../../components/ui/AnimatedCounter';
import { usePagination } from '../../hooks/usePagination';
import { containerVariants, itemVariants } from '../../lib/motion-variants';
import type { ChartDatum } from '../admin/AnalyticsChart';

type LoadStatus = 'loading' | 'success' | 'error';
type RangeDays = 7 | 30 | 90;

const AnalyticsChart = lazy(() =>
  import('../admin/AnalyticsChart').then((m) => ({ default: m.AnalyticsChart })),
);

interface Utilization {
  ratio: number | null;
  bookedMinutes: number | null;
  availableMinutes: number | null;
}

interface Revenue {
  totalRial: number | null;
  appointmentCount: number | null;
}

interface BusiestWindow {
  startAt?: string;
  endAt?: string;
  concurrentCount: number;
}

interface Summary {
  totalAppointments: number;
  pendingAppointments: number;
  heldAppointments: number;
  confirmedAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  expiredAppointments: number;
  uniqueCustomers: number;
  repeatCustomers: number;
  bookedMinutes: number;
  averageDurationMinutes: number;
  averageTicketRial: number;
  serviceValueRial: number;
  paidRial: number;
  retainedRial: number;
  collectedRial: number;
  refundedRial: number;
  pendingPaymentRial: number;
  failedPaymentRial: number;
  cancellationRate: number;
  noShowRate: number;
}

interface Comparison {
  totalAppointments: number;
  completedAppointments: number;
  serviceValueRial: number;
  collectedRial: number;
}

interface DailyPoint {
  date: string;
  bookings: number;
  completed: number;
  cancelled: number;
  noShow: number;
  revenueRial: number;
  bookedMinutes: number;
}

interface HourlyPoint {
  hour: number;
  bookings: number;
  completed: number;
  bookedMinutes: number;
}

interface ServiceRow {
  id: string;
  name: string;
  bookings: number;
  completed: number;
  revenueRial: number;
  averageDurationMinutes: number;
}

interface StaffRow {
  id: string;
  name: string;
  bookings: number;
  completed: number;
  revenueRial: number;
  bookedMinutes: number;
}

interface SourceRow {
  source: string;
  bookings: number;
  revenueRial: number;
}

interface CustomerRow {
  id: string;
  name: string | null;
  phone: string;
  reservations: number;
  visits: number;
  noShow: number;
  cancelled: number;
  revenueRial: number;
  lastVisitAt: string | null;
}

interface AnalyticsModel {
  utilization: Utilization;
  staffUtilization: Utilization;
  revenue: Revenue;
  busiestWindows: BusiestWindow[];
  summary: Summary;
  comparison: Comparison;
  daily: DailyPoint[];
  hourly: HourlyPoint[];
  services: ServiceRow[];
  staff: StaffRow[];
  sources: SourceRow[];
  customers: CustomerRow[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function array(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function toModel(raw: {
  utilization: unknown;
  revenue: unknown;
  busiestWindows: unknown;
  [key: string]: unknown;
}): AnalyticsModel {
  const utilization = record(raw.utilization);
  const revenue = record(raw.revenue);
  const staffUtilization = record(raw.staffUtilization);
  const summary = record(raw.summary);
  const comparison = record(raw.comparison);
  const revenueTotal =
    typeof raw.revenue === 'number' ? raw.revenue : num(revenue.totalRial);
  const legacyCount = num(revenue.appointmentCount) ?? 0;

  const normalizedSummary: Summary = {
    totalAppointments: num(summary.totalAppointments) ?? legacyCount,
    pendingAppointments: num(summary.pendingAppointments) ?? 0,
    heldAppointments: num(summary.heldAppointments) ?? 0,
    confirmedAppointments: num(summary.confirmedAppointments) ?? 0,
    completedAppointments: num(summary.completedAppointments) ?? legacyCount,
    cancelledAppointments: num(summary.cancelledAppointments) ?? 0,
    noShowAppointments: num(summary.noShowAppointments) ?? 0,
    expiredAppointments: num(summary.expiredAppointments) ?? 0,
    uniqueCustomers: num(summary.uniqueCustomers) ?? 0,
    repeatCustomers: num(summary.repeatCustomers) ?? 0,
    bookedMinutes: num(summary.bookedMinutes) ?? num(staffUtilization.bookedMinutes) ?? 0,
    averageDurationMinutes: num(summary.averageDurationMinutes) ?? 0,
    averageTicketRial: num(summary.averageTicketRial) ?? revenueTotal ?? 0,
    serviceValueRial: num(summary.serviceValueRial) ?? revenueTotal ?? 0,
    paidRial: num(summary.paidRial) ?? revenueTotal ?? 0,
    retainedRial: num(summary.retainedRial) ?? 0,
    collectedRial: num(summary.collectedRial) ?? revenueTotal ?? 0,
    refundedRial: num(summary.refundedRial) ?? 0,
    pendingPaymentRial: num(summary.pendingPaymentRial) ?? 0,
    failedPaymentRial: num(summary.failedPaymentRial) ?? 0,
    cancellationRate: num(summary.cancellationRate) ?? 0,
    noShowRate: num(summary.noShowRate) ?? 0,
  };

  return {
    utilization: {
      ratio: typeof raw.utilization === 'number' ? raw.utilization : num(utilization.utilization),
      bookedMinutes: num(utilization.bookedMinutes),
      availableMinutes: num(utilization.availableMinutes),
    },
    staffUtilization: {
      ratio: num(staffUtilization.utilization),
      bookedMinutes: num(staffUtilization.bookedMinutes),
      availableMinutes: num(staffUtilization.availableMinutes),
    },
    revenue: {
      totalRial: revenueTotal,
      appointmentCount: num(revenue.appointmentCount),
    },
    busiestWindows: Array.isArray(raw.busiestWindows)
      ? raw.busiestWindows.map((value) => {
          const window = record(value);
          return {
            startAt: str(window.startAt),
            endAt: str(window.endAt),
            concurrentCount: num(window.concurrentCount) ?? 0,
          };
        })
      : [],
    summary: normalizedSummary,
    comparison: {
      totalAppointments: num(comparison.totalAppointments) ?? 0,
      completedAppointments: num(comparison.completedAppointments) ?? 0,
      serviceValueRial: num(comparison.serviceValueRial) ?? 0,
      collectedRial: num(comparison.collectedRial) ?? 0,
    },
    daily: array(raw.daily).map((row) => ({
      date: str(row.date) ?? '',
      bookings: num(row.bookings) ?? 0,
      completed: num(row.completed) ?? 0,
      cancelled: num(row.cancelled) ?? 0,
      noShow: num(row.noShow) ?? 0,
      revenueRial: num(row.revenueRial) ?? 0,
      bookedMinutes: num(row.bookedMinutes) ?? 0,
    })),
    hourly: array(raw.hourly).map((row) => ({
      hour: num(row.hour) ?? 0,
      bookings: num(row.bookings) ?? 0,
      completed: num(row.completed) ?? 0,
      bookedMinutes: num(row.bookedMinutes) ?? 0,
    })),
    services: array(raw.services).map((row, index) => ({
      id: str(row.id) ?? 'service-' + index,
      name: str(row.name) ?? '—',
      bookings: num(row.bookings) ?? 0,
      completed: num(row.completed) ?? 0,
      revenueRial: num(row.revenueRial) ?? 0,
      averageDurationMinutes: num(row.averageDurationMinutes) ?? 0,
    })),
    staff: array(raw.staff).map((row, index) => ({
      id: str(row.id) ?? 'staff-' + index,
      name: str(row.name) ?? '—',
      bookings: num(row.bookings) ?? 0,
      completed: num(row.completed) ?? 0,
      revenueRial: num(row.revenueRial) ?? 0,
      bookedMinutes: num(row.bookedMinutes) ?? 0,
    })),
    sources: array(raw.sources).map((row) => ({
      source: str(row.source) ?? 'unknown',
      bookings: num(row.bookings) ?? 0,
      revenueRial: num(row.revenueRial) ?? 0,
    })),
    customers: array(raw.customers).map((row, index) => ({
      id: str(row.id) ?? 'customer-' + index,
      name: str(row.name) ?? null,
      phone: str(row.phone) ?? '—',
      reservations: num(row.reservations) ?? num(row.bookings) ?? 0,
      visits: num(row.visits) ?? num(row.completed) ?? 0,
      noShow: num(row.noShow) ?? 0,
      cancelled: num(row.cancelled) ?? 0,
      revenueRial: num(row.revenueRial) ?? 0,
      lastVisitAt: str(row.lastVisitAt) ?? null,
    })),
  };
}

function isoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function defaultRange(today: Date, days: RangeDays): { from: string; to: string } {
  const from = new Date(today);
  from.setDate(from.getDate() - days + 1);
  const to = new Date(today);
  to.setDate(to.getDate() + 1);
  return { from: isoDate(from), to: isoDate(to) };
}

function formatDateLabel(value: string): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(value + 'T12:00:00'));
  } catch {
    return value;
  }
}

function formatRangeLabel(range: { from: string; to: string }): string {
  const end = new Date(range.to + 'T12:00:00');
  end.setDate(end.getDate() - 1);
  return formatDateLabel(range.from) + ' تا ' + formatDateLabel(isoDate(end));
}

function clockTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

function windowLabel(window: BusiestWindow): string {
  const start = clockTime(window.startAt);
  const end = clockTime(window.endAt);
  if (start && end) return start + ' – ' + end;
  return start ?? end ?? '—';
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    web: 'وب‌سایت',
    mobile: 'موبایل',
    walkin: 'حضوری',
    bot: 'ربات',
  };
  return labels[source] ?? source;
}

interface MetricCardProps {
  testId: string;
  icon: React.ReactNode;
  label: string;
  value: number | null;
  suffix?: string;
  prefix?: string;
  trend?: number | null;
  isRial?: boolean;
  detail?: React.ReactNode;
}

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
    <motion.div variants={itemVariants} className="h-full min-w-0">
      <Card
        as="section"
        data-testid={testId}
        className="flex h-full min-w-0 flex-col gap-3 border border-border p-4 sm:p-5"
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
              aria-hidden="true"
            >
              {icon}
            </span>
            <span className="min-w-0 truncate text-sm font-medium text-muted">{label}</span>
          </div>
          {trend != null && trend !== 0 && (
            <span
              className={'inline-flex shrink-0 items-center gap-0.5 text-xs font-medium ' + (trend > 0 ? 'text-success' : 'text-danger')}
              aria-label={trend > 0 ? t('owner.analytics.trendUp') : t('owner.analytics.trendDown')}
            >
              {trend > 0 ? (
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <Num value={Math.abs(trend)} />٪
            </span>
          )}
        </div>
        <CardContent className="flex min-w-0 flex-col gap-1">
          {value == null ? (
            <p className="text-xl font-bold text-muted">{t('admin.analyticsPage.noData')}</p>
          ) : isRial ? (
            <div className="max-w-full break-words text-[clamp(1.15rem,2vw,1.75rem)] font-bold tabular-nums [font-feature-settings:'tnum'] text-text">
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
          {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function CompactStat({
  testId,
  icon,
  label,
  value,
  detail,
  isRial = false,
}: {
  testId: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  detail?: React.ReactNode;
  isRial?: boolean;
}) {
  return (
    <Card data-testid={testId} className="flex min-w-0 items-start gap-3 p-4">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted">{label}</p>
        <p className="mt-1 break-words text-lg font-bold text-text">
          {isRial ? <Money amountRial={value} /> : <Num value={value} />}
        </p>
        {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
      </div>
    </Card>
  );
}

function MiniBarChart({
  data,
  title,
  emptyTitle,
  emptyBody,
  testId,
}: {
  data: { label: string; value: number }[];
  title: string;
  emptyTitle: string;
  emptyBody: string;
  testId: string;
}) {
  const hasData = data.some((item) => item.value > 0);
  const max = Math.max(1, ...data.map((item) => item.value));
  if (!hasData) {
    return (
      <EmptyState
        data-testid={testId + '-empty'}
        icon={<BarChart3 className="h-8 w-8" />}
        title={emptyTitle}
        description={emptyBody}
        className="py-8"
      />
    );
  }

  return (
    <div data-testid={testId} className="min-w-0" role="img" aria-label={title}>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max items-end gap-2 px-1 pt-2">
          {data.map((item, index) => (
            <div
              key={item.label + '-' + index}
              className="flex w-9 shrink-0 flex-col items-center gap-1"
              aria-label={item.label + ': ' + item.value}
            >
              <span className="text-[10px] font-medium text-text">
                <Num value={item.value} />
              </span>
              <div className="flex h-32 w-full items-end rounded-t-md bg-elevated/60">
                <div
                  className="w-full rounded-t-md bg-primary transition-[height] duration-300"
                  style={{ height: Math.max(6, (item.value / max) * 100) + '%' }}
                />
              </div>
              <span className="max-w-full truncate text-[10px] text-muted">
                <Num value={item.label} />
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">برای دیدن همه بازه‌ها، نمودار را افقی بکشید.</p>
    </div>
  );
}

function StatusDistribution({ summary }: { summary: Summary }) {
  const { t } = useTranslation();
  const items = [
    {
      key: 'completed',
      label: t('owner.analytics.status.completed', { defaultValue: 'انجام‌شده' }),
      value: summary.completedAppointments,
      icon: <CheckCircle2 className="h-4 w-4" />,
      className: 'text-success',
    },
    {
      key: 'confirmed',
      label: t('owner.analytics.status.confirmed', { defaultValue: 'تأییدشده' }),
      value: summary.confirmedAppointments,
      icon: <CalendarCheck className="h-4 w-4" />,
      className: 'text-primary',
    },
    {
      key: 'pending',
      label: t('owner.analytics.status.pending', { defaultValue: 'در انتظار' }),
      value: summary.pendingAppointments + summary.heldAppointments,
      icon: <Clock3 className="h-4 w-4" />,
      className: 'text-warning',
    },
    {
      key: 'cancelled',
      label: t('owner.analytics.status.cancelled', { defaultValue: 'لغوشده' }),
      value: summary.cancelledAppointments,
      icon: <XCircle className="h-4 w-4" />,
      className: 'text-danger',
    },
    {
      key: 'noShow',
      label: t('owner.analytics.status.noShow', { defaultValue: 'عدم حضور' }),
      value: summary.noShowAppointments,
      icon: <AlertCircle className="h-4 w-4" />,
      className: 'text-danger',
    },
  ];

  return (
    <div data-testid="analytics-status" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.key} className="rounded-md border border-border bg-elevated/40 p-3">
          <div className={'flex items-center gap-2 text-xs ' + item.className}>
            {item.icon}
            <span className="truncate text-muted">{item.label}</span>
          </div>
          <p className="mt-2 text-lg font-bold text-text">
            <Num value={item.value} />
          </p>
        </div>
      ))}
    </div>
  );
}

function ServicePerformance({ rows }: { rows: ServiceRow[] }) {
  const { t } = useTranslation();
  const pagination = usePagination(rows, 5);

  useEffect(() => {
    pagination.resetPage();
  }, [rows, pagination.resetPage]);

  return (
    <Card as="section" data-testid="analytics-services" className="min-w-0">
      <div className="mb-4 flex items-center gap-2">
        <Scissors className="h-5 w-5 text-primary" aria-hidden="true" />
        <CardTitle as="h2" className="text-base font-bold">
          {t('owner.analytics.servicesTitle', { defaultValue: 'عملکرد خدمات' })}
        </CardTitle>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          data-testid="analytics-services-empty"
          icon={<Scissors className="h-8 w-8" />}
          title={t('admin.analyticsPage.noData')}
          description={t('owner.analytics.servicesEmpty', { defaultValue: 'هنوز رزروی برای گزارش خدمات ثبت نشده است.' })}
          className="py-6"
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          {pagination.pageItems.map((row) => (
            <div key={row.id} className="min-w-0 rounded-md border border-border bg-elevated/30 p-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <p className="min-w-0 break-words text-sm font-medium text-text">{row.name}</p>
                <span className="shrink-0 text-xs text-muted">
                  <Num value={row.bookings} /> رزرو
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted">انجام‌شده</p>
                  <p className="mt-1 font-bold text-text"><Num value={row.completed} /></p>
                </div>
                <div>
                  <p className="text-muted">درآمد</p>
                  <p className="mt-1 font-bold text-text"><Money amountRial={row.revenueRial} /></p>
                </div>
                <div>
                  <p className="text-muted">مدت میانگین</p>
                  <p className="mt-1 font-bold text-text"><Num value={row.averageDurationMinutes} /> دقیقه</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        onPageChange={pagination.goToPage}
        compact
        className="mt-3"
        testId="analytics-services-pagination"
        ariaLabel={t('owner.analytics.servicesPagination', { defaultValue: 'صفحه‌بندی خدمات' })}
      />
    </Card>
  );
}

function StaffPerformance({ rows }: { rows: StaffRow[] }) {
  const { t } = useTranslation();
  const pagination = usePagination(rows, 5);

  useEffect(() => {
    pagination.resetPage();
  }, [rows, pagination.resetPage]);

  return (
    <Card as="section" data-testid="analytics-staff" className="min-w-0">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" aria-hidden="true" />
        <CardTitle as="h2" className="text-base font-bold">
          {t('owner.analytics.staffTitle', { defaultValue: 'عملکرد آرایشگرها' })}
        </CardTitle>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          data-testid="analytics-staff-empty"
          icon={<Users className="h-8 w-8" />}
          title={t('admin.analyticsPage.noData')}
          description={t('owner.analytics.staffEmpty', { defaultValue: 'برای آرایشگرها هنوز داده‌ای وجود ندارد.' })}
          className="py-6"
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          {pagination.pageItems.map((row) => (
            <div key={row.id} className="min-w-0 rounded-md border border-border bg-elevated/30 p-3">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <p className="min-w-0 break-words text-sm font-medium text-text">{row.name}</p>
                <span className="shrink-0 text-xs text-muted"><Num value={row.bookings} /> رزرو</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted">انجام‌شده</p>
                  <p className="mt-1 font-bold text-text"><Num value={row.completed} /></p>
                </div>
                <div>
                  <p className="text-muted">درآمد</p>
                  <p className="mt-1 font-bold text-text"><Money amountRial={row.revenueRial} /></p>
                </div>
                <div>
                  <p className="text-muted">زمان رزروشده</p>
                  <p className="mt-1 font-bold text-text"><Num value={row.bookedMinutes} /> دقیقه</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        onPageChange={pagination.goToPage}
        compact
        className="mt-3"
        testId="analytics-staff-pagination"
        ariaLabel={t('owner.analytics.staffPagination', { defaultValue: 'صفحه‌بندی آرایشگرها' })}
      />
    </Card>
  );
}

function CustomerPerformance({
  rows,
  uniqueCustomers,
  repeatCustomers,
}: {
  rows: CustomerRow[];
  uniqueCustomers: number;
  repeatCustomers: number;
}) {
  const { t } = useTranslation();
  const pagination = usePagination(rows, 5);

  useEffect(() => {
    pagination.resetPage();
  }, [rows, pagination.resetPage]);

  return (
    <Card as="section" data-testid="analytics-customers" className="min-w-0">
      <div className="mb-4 flex min-w-0 items-center gap-2">
        <UserRound className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <CardTitle as="h2" className="min-w-0 text-base font-bold">
          {t('owner.analytics.customersTitle', { defaultValue: 'مشتری‌ها' })}
        </CardTitle>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-elevated/30 p-3">
          <p className="text-xs text-muted">{t('owner.analytics.uniqueCustomers', { defaultValue: 'مشتری یکتا' })}</p>
          <p className="mt-2 text-xl font-bold text-text"><Num value={uniqueCustomers} /></p>
        </div>
        <div className="rounded-md border border-border bg-elevated/30 p-3">
          <p className="text-xs text-muted">{t('owner.analytics.repeatCustomers', { defaultValue: 'مشتری تکراری' })}</p>
          <p className="mt-2 text-xl font-bold text-text">
            <Num value={repeatCustomers} />
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          data-testid="analytics-customers-empty"
          icon={<UserRound className="h-8 w-8" />}
          title={t('owner.analytics.customersEmpty', { defaultValue: 'مشتری‌ای در این بازه ثبت نشده است.' })}
          description={t('owner.analytics.customersEmptyBody', { defaultValue: 'بعد از ثبت رزرو، آمار هر مشتری اینجا نمایش داده می‌شود.' })}
          className="py-6"
        />
      ) : (
        <div data-testid="analytics-customer-list" className="mt-4 space-y-2">
          {pagination.pageItems.map((row) => (
            <article key={row.id} className="min-w-0 rounded-md border border-border bg-elevated/30 p-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-text">
                    {row.name || t('owner.analytics.customerNameFallback', { defaultValue: 'مشتری بدون نام' })}
                  </h3>
                  <p className="mt-1 truncate text-xs text-muted" dir="ltr">{row.phone}</p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  <Num value={row.visits} /> {t('owner.analytics.customerVisits', { defaultValue: 'مراجعه' })}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-muted">{t('owner.analytics.customerReservations', { defaultValue: 'کل رزرو' })}</p>
                  <p className="mt-1 font-bold text-text"><Num value={row.reservations} /></p>
                </div>
                <div>
                  <p className="text-muted">{t('owner.analytics.customerNoShow', { defaultValue: 'عدم حضور' })}</p>
                  <p className="mt-1 font-bold text-text"><Num value={row.noShow} /></p>
                </div>
                <div>
                  <p className="text-muted">{t('owner.analytics.customerCancelled', { defaultValue: 'لغوشده' })}</p>
                  <p className="mt-1 font-bold text-text"><Num value={row.cancelled} /></p>
                </div>
                <div className="min-w-0">
                  <p className="text-muted">{t('owner.analytics.customerRevenue', { defaultValue: 'پرداختی' })}</p>
                  <p className="mt-1 break-words font-bold text-text"><Money amountRial={row.revenueRial} /></p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">
                {t('owner.analytics.customerLastVisit', { defaultValue: 'آخرین مراجعه' })}:{' '}
                {row.lastVisitAt ? formatDateLabel(row.lastVisitAt.slice(0, 10)) : '—'}
              </p>
            </article>
          ))}
        </div>
      )}
      <Pagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        onPageChange={pagination.goToPage}
        compact
        className="mt-3"
        testId="analytics-customers-pagination"
        ariaLabel={t('owner.analytics.customersPagination', { defaultValue: 'صفحه‌بندی مشتری‌ها' })}
      />
    </Card>
  );
}

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} variant="rect" className="h-32 rounded-md" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} variant="rect" className="h-20 rounded-md" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton variant="rect" className="h-64 rounded-md" />
        <Skeleton variant="rect" className="h-64 rounded-md" />
      </div>
    </div>
  );
}

export function OwnerAnalyticsPageContent({ salonId: salonIdProp }: { salonId?: string }) {
  const { t } = useTranslation();
  const params = useParams<{ salonId?: string }>();
  const sessionSalonId = useSalonId();
  const salonId = salonIdProp ?? params.salonId ?? sessionSalonId;
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [model, setModel] = useState<AnalyticsModel | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const range = useMemo(() => defaultRange(new Date(), rangeDays), [rangeDays]);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError('');
    adminApi
      .getAnalytics(salonId, range.from, range.to)
      .then((response) => {
        if (!active) return;
        setModel(toModel(response));
        setStatus('success');
      })
      .catch(() => {
        if (!active) return;
        setError(t('admin.analyticsPage.errorBody'));
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [salonId, range.from, range.to, reloadToken, t]);

  const peakWindow = useMemo<BusiestWindow | null>(() => {
    if (!model || model.busiestWindows.length === 0) return null;
    return model.busiestWindows.reduce((peak, window) =>
      window.concurrentCount > peak.concurrentCount ? window : peak,
    );
  }, [model]);

  const busiestChartData = useMemo<ChartDatum[]>(() => {
    if (!model) return [];
    return model.busiestWindows.map((window) => ({
      label: windowLabel(window),
      value: window.concurrentCount,
    }));
  }, [model]);

  const dailyChartData = useMemo(() => {
    if (!model || !model.daily.some((day) => day.bookings > 0)) return [];
    return model.daily.slice(-14).map((day) => ({
      label: formatDateLabel(day.date),
      value: day.bookings,
    }));
  }, [model]);

  const hourlyChartData = useMemo(() => {
    if (!model) return [];
    return model.hourly
      .filter((hour) => hour.bookings > 0)
      .map((hour) => ({
        label: String(hour.hour).padStart(2, '0') + ':۰۰',
        value: hour.bookings,
      }));
  }, [model]);

  const busiestPagination = usePagination(model?.busiestWindows ?? [], 6);
  useEffect(() => {
    busiestPagination.resetPage();
  }, [model?.busiestWindows, busiestPagination.resetPage]);

  const rangeOptions: { value: RangeDays; label: string }[] = [
    { value: 7, label: t('owner.analytics.range.seven', { defaultValue: '۷ روز' }) },
    { value: 30, label: t('owner.analytics.range.thirty', { defaultValue: '۳۰ روز' }) },
    { value: 90, label: t('owner.analytics.range.ninety', { defaultValue: '۹۰ روز' }) },
  ];

  return (
    <div data-testid="admin-analytics" className="flex min-w-0 flex-col gap-5 pb-4">
      <SeoHead title={t('seo.titles.adminAnalytics')} />

      <header className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-bold text-text text-display">{t('admin.analytics')}</h1>
        <p className="max-w-[65ch] text-sm text-muted">
          {t('admin.analyticsPage.subtitle', {
            defaultValue: 'گزارش کامل رزروها، درآمد، مشتری‌ها و عملکرد سالن.',
          })}
        </p>
      </header>

      <Card as="section" data-testid="analytics-range" className="min-w-0 p-3 sm:p-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted">
              {t('owner.analytics.rangeTitle', { defaultValue: 'بازه گزارش' })}
            </p>
            <p className="mt-1 truncate text-sm font-medium text-text">{formatRangeLabel(range)}</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 rounded-md border border-border bg-elevated/40 p-1 sm:flex-none">
              {rangeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={rangeDays === option.value}
                  onClick={() => setRangeDays(option.value)}
                  className={
                    'min-h-10 flex-1 rounded px-3 text-xs font-medium transition-colors sm:flex-none ' +
                    (rangeDays === option.value
                      ? 'bg-primary text-primary-contrast'
                      : 'text-muted hover:bg-surface hover:text-text')
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="md"
              className="shrink-0"
              aria-label={t('owner.analytics.refresh', { defaultValue: 'به‌روزرسانی گزارش' })}
              onClick={() => setReloadToken((value) => value + 1)}
              startIcon={<RefreshCw className="h-4 w-4" />}
            >
              <span className="hidden sm:inline">
                {t('owner.analytics.refresh', { defaultValue: 'به‌روزرسانی' })}
              </span>
            </Button>
          </div>
        </div>
      </Card>

      {status === 'loading' && <OwnerAnalyticsSkeleton />}

      {status === 'error' && (
        <ErrorState
          data-testid="analytics-error"
          title={t('admin.analyticsPage.errorTitle')}
          description={error}
          retryLabel={t('admin.analyticsPage.retry')}
          onRetry={() => setReloadToken((value) => value + 1)}
        />
      )}

      {status === 'success' && model && (
        <>
          <section aria-labelledby="analytics-metrics-title" className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <h2 id="analytics-metrics-title" className="text-base font-bold text-text">
                {t('owner.analytics.metricsLabel')}
              </h2>
              <span className="shrink-0 text-xs text-muted">{formatRangeLabel(range)}</span>
            </div>
            <motion.div
              aria-label={t('owner.analytics.metricsLabel')}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <MetricCard
                testId="analytics-revenue"
                icon={<Wallet className="h-4 w-4" />}
                label={t('admin.analyticsPage.kpi.revenueTitle')}
                value={model.summary.collectedRial}
                isRial
                trend={percentChange(model.summary.collectedRial, model.comparison.collectedRial)}
                detail={
                  <span>
                    ارزش خدمات: <Money amountRial={model.summary.serviceValueRial} />
                  </span>
                }
              />
              <MetricCard
                testId="analytics-bookings"
                icon={<CalendarCheck className="h-4 w-4" />}
                label={t('owner.analytics.bookingsTitle')}
                value={model.summary.totalAppointments}
                trend={percentChange(model.summary.totalAppointments, model.comparison.totalAppointments)}
                detail={
                  <span>
                    <Num value={model.summary.completedAppointments} /> انجام‌شده،{' '}
                    <Num value={model.summary.pendingAppointments} /> در انتظار
                  </span>
                }
              />
              <MetricCard
                testId="analytics-utilization"
                icon={<Percent className="h-4 w-4" />}
                label={t('admin.analyticsPage.kpi.utilizationTitle')}
                value={model.utilization.ratio != null ? Math.round(model.utilization.ratio * 100) : null}
                suffix="٪"
                detail={
                  model.utilization.bookedMinutes != null && model.utilization.availableMinutes != null
                    ? t('admin.analyticsPage.kpi.utilizationDetail', {
                        booked: model.utilization.bookedMinutes,
                        available: model.utilization.availableMinutes,
                      })
                    : undefined
                }
              />
              <MetricCard
                testId="analytics-busiest"
                icon={<Clock3 className="h-4 w-4" />}
                label={t('admin.analyticsPage.kpi.busiestTitle')}
                value={peakWindow?.concurrentCount ?? null}
                detail={peakWindow ? <Num value={windowLabel(peakWindow)} /> : undefined}
              />
            </motion.div>
          </section>

          <section data-testid="analytics-summary" className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
            <CompactStat
              testId="analytics-completed"
              icon={<CheckCircle2 className="h-4 w-4" />}
              label={t('owner.analytics.completedTitle', { defaultValue: 'نوبت انجام‌شده' })}
              value={model.summary.completedAppointments}
              detail={
                <span>
                  <Num value={Math.round(model.summary.noShowRate * 100)} />٪ عدم حضور
                </span>
              }
            />
            <CompactStat
              testId="analytics-pending"
              icon={<Clock3 className="h-4 w-4" />}
              label={t('owner.analytics.pendingTitle', { defaultValue: 'در انتظار اقدام' })}
              value={model.summary.pendingAppointments + model.summary.heldAppointments}
              detail={t('owner.analytics.pendingDetail', { defaultValue: 'نیازمند بررسی سالن' })}
            />
            <CompactStat
              testId="analytics-cancelled"
              icon={<XCircle className="h-4 w-4" />}
              label={t('owner.analytics.cancelledTitle', { defaultValue: 'لغو و عدم حضور' })}
              value={model.summary.cancelledAppointments + model.summary.noShowAppointments}
              detail={
                <span>
                  <Num value={Math.round(model.summary.cancellationRate * 100)} />٪ لغو
                </span>
              }
            />
            <CompactStat
              testId="analytics-average-ticket"
              icon={<CreditCard className="h-4 w-4" />}
              label={t('owner.analytics.averageTicketTitle', { defaultValue: 'میانگین فاکتور' })}
              value={model.summary.averageTicketRial}
              isRial
              detail={<span><Num value={model.summary.averageDurationMinutes} /> دقیقه میانگین</span>}
            />
          </section>

          <Card as="section" data-testid="analytics-status-section" className="min-w-0">
            <div className="mb-4 flex min-w-0 items-center gap-2">
              <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
              <CardTitle as="h2" className="text-base font-bold">
                {t('owner.analytics.statusTitle', { defaultValue: 'وضعیت نوبت‌ها' })}
              </CardTitle>
            </div>
            <StatusDistribution summary={model.summary} />
          </Card>

          <section className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <Card as="section" data-testid="analytics-daily-section" className="min-w-0">
              <div className="mb-3 flex min-w-0 items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
                <CardTitle as="h2" className="text-base font-bold">
                  {t('owner.analytics.dailyTitle', { defaultValue: 'روند روزانه رزروها' })}
                </CardTitle>
              </div>
              <MiniBarChart
                data={dailyChartData}
                title={t('owner.analytics.dailyChartLabel', { defaultValue: 'نمودار رزروهای روزانه' })}
                emptyTitle={t('owner.analytics.emptyTitle', { defaultValue: 'داده‌ای برای نمایش نیست' })}
                emptyBody={t('owner.analytics.dailyEmpty', { defaultValue: 'در این بازه رزروی ثبت نشده است.' })}
                testId="analytics-daily"
              />
            </Card>
            <Card as="section" data-testid="analytics-hourly-section" className="min-w-0">
              <div className="mb-3 flex min-w-0 items-center gap-2">
                <Clock3 className="h-5 w-5 text-primary" aria-hidden="true" />
                <CardTitle as="h2" className="text-base font-bold">
                  {t('owner.analytics.hourlyTitle', { defaultValue: 'ساعات شلوغ سالن' })}
                </CardTitle>
              </div>
              <MiniBarChart
                data={hourlyChartData}
                title={t('owner.analytics.hourlyChartLabel', { defaultValue: 'نمودار ساعات شروع رزروها' })}
                emptyTitle={t('owner.analytics.emptyTitle', { defaultValue: 'داده‌ای برای نمایش نیست' })}
                emptyBody={t('owner.analytics.hourlyEmpty', { defaultValue: 'ساعت شلوغی مشخصی در این بازه وجود ندارد.' })}
                testId="analytics-hourly"
              />
            </Card>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <ServicePerformance rows={model.services} />
            <StaffPerformance rows={model.staff} />
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <CustomerPerformance
              rows={model.customers}
              uniqueCustomers={model.summary.uniqueCustomers}
              repeatCustomers={model.summary.repeatCustomers}
            />
            <Card as="section" data-testid="analytics-payments" className="min-w-0">
              <div className="mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
                <CardTitle as="h2" className="text-base font-bold">
                  {t('owner.analytics.paymentsTitle', { defaultValue: 'وضعیت مالی' })}
                </CardTitle>
              </div>
              <div className="flex min-w-0 flex-col gap-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">{t('owner.analytics.collectedLabel', { defaultValue: 'دریافت خالص' })}</span>
                  <Money amountRial={model.summary.collectedRial} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">{t('owner.analytics.refundedLabel', { defaultValue: 'برگشتی' })}</span>
                  <Money amountRial={model.summary.refundedRial} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">{t('owner.analytics.pendingPaymentLabel', { defaultValue: 'در انتظار پرداخت' })}</span>
                  <Money amountRial={model.summary.pendingPaymentRial} />
                </div>
              </div>
            </Card>
          </section>

          {model.sources.length > 0 && (
            <Card as="section" data-testid="analytics-sources" className="min-w-0">
              <div className="mb-4 flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
                <CardTitle as="h2" className="text-base font-bold">
                  {t('owner.analytics.sourcesTitle', { defaultValue: 'منبع رزروها' })}
                </CardTitle>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {model.sources.map((row) => (
                  <div key={row.source} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-elevated/30 p-3">
                    <span className="truncate text-sm text-text">{sourceLabel(row.source)}</span>
                    <span className="shrink-0 text-sm font-bold text-text"><Num value={row.bookings} /></span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <motion.div variants={itemVariants} initial="hidden" animate="visible">
            <Card as="section" data-testid="analytics-busiest-section" className="min-w-0">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
                <CardTitle as="h2" className="text-base font-bold">
                  {t('admin.analyticsPage.chart.title')}
                </CardTitle>
              </div>
              {model.busiestWindows.length === 0 ? (
                <EmptyState
                  data-testid="analytics-table-empty"
                  icon={<Clock3 className="h-8 w-8" />}
                  title={t('admin.analyticsPage.table.emptyTitle')}
                  description={t('admin.analyticsPage.table.emptyBody')}
                  className="py-8"
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table
                      id="owner-analytics-busiest-table"
                      data-testid="analytics-table"
                      className="w-full min-w-[18rem] border-collapse text-sm"
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
                        {busiestPagination.pageItems.map((window, index) => (
                          <tr
                            key={(window.startAt ?? 'window') + '-' + index}
                            className="border-b border-border last:border-0"
                          >
                            <td className="py-2 text-start text-text"><Num value={windowLabel(window)} /></td>
                            <td className="py-2 text-end text-text"><Num value={window.concurrentCount} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={busiestPagination.page}
                    pageSize={busiestPagination.pageSize}
                    total={busiestPagination.total}
                    onPageChange={busiestPagination.goToPage}
                    compact
                    className="mt-3"
                    testId="analytics-busiest-pagination"
                    ariaLabel={t('owner.analytics.busiestPagination', { defaultValue: 'صفحه‌بندی ساعات شلوغ' })}
                  />
                  <Suspense
                    fallback={
                      <Skeleton
                        variant="rect"
                        className="mt-4 h-44"
                        aria-label={t('admin.analyticsPage.chart.loadingLabel')}
                      />
                    }
                  >
                    <AnalyticsChart data={busiestChartData} tableId="owner-analytics-busiest-table" />
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
