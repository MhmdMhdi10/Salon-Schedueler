import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarX2, Clock, User, Scissors } from 'lucide-react';
import { adminApi, ApiError } from '../../api/client';
import { SeoHead } from '../../components/seo';
import {
  Badge,
  EmptyState,
  ErrorState,
  JalaliDate,
  Num,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  type BadgeStatus,
} from '../../components/ui';

/**
 * Admin calendar screen at `/admin/calendar` (R5.2, R5.5, R7.2, R2.3; ui-ux
 * Admin Calendar recipe, §6 states, §11 RTL/Jalali).
 *
 * The redesign turns the bare list into a legible time-structured view built
 * from the design-system primitives:
 *
 *  - **Day / week toggle** — Radix `Tabs` (`role="tab"` / `aria-selected`
 *    preserved, RTL-aware arrow-key nav). Switching the view refetches the
 *    calendar for the matching range via `adminApi.getCalendar` (wire contract
 *    unchanged).
 *  - **Day view** — a vertical **time rail**: appointment blocks ordered by
 *    start time, each showing the Jalali/Persian time, service, customer,
 *    staff, and a **status `Badge`** (color **+ icon + text**, R2.6).
 *  - **Week view** — a **7-column grid, Saturday-first** (the Iranian week),
 *    RTL by layout. Each column is a day (weekday + Jalali date) holding that
 *    day's appointment blocks.
 *  - **Data states** — loading shows a **skeleton grid** (not a spinner), empty
 *    shows «نوبتی در این بازه نیست», error surfaces a friendly cause + retry
 *    (ui-ux §6).
 *
 * Times are display-localized only (Persian digits, Jalali dates); the ISO
 * instants from the API are converted at the boundary via `<JalaliDate>` /
 * `<Num>` (R7.2–R7.4). All copy comes from `fa.json` (`admin.calendarPage.*`).
 *
 * Preserved test hooks (kept green): the `admin-calendar` root testID, the
 * `calendar-day` / `calendar-week` view containers, the `calendar-loading` /
 * `calendar-error` / `calendar-appointments` / `calendar-empty` state testIDs,
 * the day/week tab labels, and the `role="tab"` / `aria-selected` semantics.
 *
 * An admin route is private and must never be indexed; `<SeoHead>` (noindex
 * default) emits `noindex,follow` (seo §1, R8.7).
 */

const DEFAULT_SALON_ID = 'salon-1';

type CalendarView = 'day' | 'week';
type LoadStatus = 'loading' | 'success' | 'error';

/** A normalized appointment shaped from an opaque API record (display only). */
interface Appointment {
  id: string;
  startAt?: string;
  endAt?: string;
  serviceName?: string;
  customerName?: string;
  staffName?: string;
  status?: string;
}

/** ISO date (YYYY-MM-DD) `days` from `base`. */
function isoDate(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Saturday that opens the Iranian week containing `today`. `Date.getDay()`
 * returns 0=Sun…6=Sat, so the offset back to Saturday is `(getDay()+1) % 7`.
 */
function startOfIranianWeek(today: Date): Date {
  const d = new Date(today);
  const daysSinceSaturday = (d.getDay() + 1) % 7;
  d.setDate(d.getDate() - daysSinceSaturday);
  return d;
}

/** Local `YYYY-MM-DD` for an ISO instant (used to bucket week appointments). */
function localDateKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** `HH:mm` for an ISO instant, or `null` when the value is not a valid date. */
function clockTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Compute the [from, to] range for a view. Day = today; week = Sat→Sat+7. */
function rangeFor(view: CalendarView, today: Date): { from: string; to: string } {
  if (view === 'day') {
    return { from: isoDate(today, 0), to: isoDate(today, 1) };
  }
  const weekStart = startOfIranianWeek(today);
  return { from: isoDate(weekStart, 0), to: isoDate(weekStart, 7) };
}

/** Shape an opaque API record into a display `Appointment`. */
function toAppointment(appt: unknown, fallbackId: string): Appointment {
  if (appt && typeof appt === 'object') {
    const rec = appt as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    return {
      id: str(rec.id) ?? fallbackId,
      startAt: str(rec.startAt),
      endAt: str(rec.endAt),
      serviceName: str(rec.serviceName),
      customerName: str(rec.customerName),
      staffName: str(rec.staffName),
      status: str(rec.status),
    };
  }
  return { id: fallbackId };
}

/** Map a raw status string to a Badge color role + i18n label key. */
function statusMeta(status: string | undefined): { variant: BadgeStatus; key: string } {
  const normalized = (status ?? '').toLowerCase().replace(/[^a-z]/g, '');
  switch (normalized) {
    case 'confirmed':
    case 'booked':
    case 'paid':
    case 'completed':
      return { variant: 'success', key: normalized };
    case 'pending':
    case 'held':
      return { variant: 'warning', key: normalized };
    case 'cancelled':
    case 'canceled':
    case 'noshow':
      return { variant: 'danger', key: normalized };
    default:
      return { variant: 'neutral', key: normalized };
  }
}

/** A single appointment block: time + status badge, service, customer, staff. */
function AppointmentBlock({ appt }: { appt: Appointment }) {
  const { t } = useTranslation();
  const start = clockTime(appt.startAt);
  const end = clockTime(appt.endAt);
  const service = appt.serviceName ?? t('admin.calendarPage.untitledService');

  let statusNode: React.ReactNode = null;
  if (appt.status) {
    const { variant, key } = statusMeta(appt.status);
    const label = t(`admin.calendarPage.status.${key}`, { defaultValue: appt.status });
    statusNode = <Badge status={variant}>{label}</Badge>;
  }

  return (
    <article className="flex flex-col gap-1 rounded-md border border-border bg-elevated p-3 shadow-1">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-sm font-medium tabular-nums text-text">
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
          {start ? (
            <span>
              <Num value={start} />
              {end ? (
                <>
                  {' – '}
                  <Num value={end} />
                </>
              ) : null}
            </span>
          ) : (
            <span className="text-muted">{t('admin.calendarPage.unscheduled')}</span>
          )}
        </span>
        {statusNode}
      </div>

      <p className="flex items-center gap-1 break-words text-sm font-medium text-text">
        <Scissors className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
        {service}
      </p>

      {(appt.customerName || appt.staffName) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          {appt.customerName && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {appt.customerName}
            </span>
          )}
          {appt.staffName && (
            <span className="inline-flex items-center gap-1">
              {t('admin.calendarPage.staffLabel')}: {appt.staffName}
            </span>
          )}
        </p>
      )}
    </article>
  );
}

/** Day view: a vertical time rail of appointment blocks, ordered by start. */
function DayRail({ appointments }: { appointments: Appointment[] }) {
  const { t } = useTranslation();
  const sorted = useMemo(
    () =>
      [...appointments].sort((a, b) => {
        const ta = a.startAt ? new Date(a.startAt).getTime() : Number.POSITIVE_INFINITY;
        const tb = b.startAt ? new Date(b.startAt).getTime() : Number.POSITIVE_INFINITY;
        return ta - tb;
      }),
    [appointments],
  );

  return (
    <ol
      aria-label={t('admin.calendarPage.dayRailLabel')}
      className="relative flex flex-col gap-3 border-s-2 border-border ps-4"
    >
      {sorted.map((appt) => (
        <li key={appt.id}>
          <AppointmentBlock appt={appt} />
        </li>
      ))}
    </ol>
  );
}

/** Week view: a 7-column, Saturday-first grid of day columns (RTL by layout). */
function WeekGrid({
  appointments,
  weekStart,
}: {
  appointments: Appointment[];
  weekStart: Date;
}) {
  const { t } = useTranslation();

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const iso = isoDate(weekStart, i);
      const items = appointments
        .filter((appt) => appt.startAt && localDateKey(appt.startAt) === iso)
        .sort((a, b) => {
          const ta = a.startAt ? new Date(a.startAt).getTime() : 0;
          const tb = b.startAt ? new Date(b.startAt).getTime() : 0;
          return ta - tb;
        });
      return { iso, items };
    });
  }, [appointments, weekStart]);

  return (
    <div
      role="grid"
      aria-label={t('admin.calendarPage.weekGridLabel')}
      className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7"
    >
      {days.map((day) => (
        <section
          key={day.iso}
          role="gridcell"
          aria-label={day.iso}
          className="flex min-h-[8rem] flex-col gap-2 rounded-md border border-border bg-surface p-2"
        >
          <header className="border-b border-border pb-1 text-center text-xs font-medium text-muted">
            <JalaliDate value={day.iso} withWeekday variant="numeric" />
          </header>
          <div className="flex flex-col gap-2">
            {day.items.map((appt) => (
              <AppointmentBlock key={appt.id} appt={appt} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Skeleton placeholder grid shown while the calendar loads (ui-ux §6/§12). */
function CalendarSkeleton({ view }: { view: CalendarView }) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="calendar-loading"
      role="status"
      aria-busy="true"
      aria-label={t('admin.calendarPage.loadingLabel')}
      className={cn(
        'grid gap-3',
        view === 'week' ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-7' : 'grid-cols-1',
      )}
    >
      {Array.from({ length: view === 'week' ? 7 : 4 }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <Skeleton key={i} variant="rect" className="h-20" />
      ))}
    </div>
  );
}

export function CalendarPage({ salonId: salonIdProp }: { salonId?: string }) {
  const { t } = useTranslation();
  const params = useParams<{ salonId?: string }>();
  const salonId = salonIdProp ?? params.salonId ?? DEFAULT_SALON_ID;

  const [view, setView] = useState<CalendarView>('day');
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  // Captured once per load so the week grid columns align with the fetched range.
  const [weekStart, setWeekStart] = useState<Date>(() => startOfIranianWeek(new Date()));
  // Bumped by the retry action to re-run the load effect.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError('');

    const today = new Date();
    setWeekStart(startOfIranianWeek(today));
    const { from, to } = rangeFor(view, today);

    adminApi
      .getCalendar(salonId, from, to, view)
      .then((res) => {
        if (!active) return;
        setAppointments(
          res.appointments.map((appt, i) => toAppointment(appt, `appt-${i + 1}`)),
        );
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
  }, [salonId, view, reloadToken, t]);

  /** Shared body for the active view: loading / error / empty / populated. */
  const body = (
    <>
      {status === 'loading' && <CalendarSkeleton view={view} />}

      {status === 'error' && (
        <ErrorState
          data-testid="calendar-error"
          title={t('admin.calendarPage.errorTitle')}
          description={error}
          retryLabel={t('admin.calendarPage.retry')}
          onRetry={() => setReloadToken((n) => n + 1)}
        />
      )}

      {status === 'success' && (
        <div data-testid="calendar-appointments" aria-label={t('admin.calendarPage.appointmentsLabel')}>
          {appointments.length === 0 ? (
            <EmptyState
              data-testid="calendar-empty"
              icon={<CalendarX2 className="h-8 w-8" />}
              title={t('admin.calendarPage.emptyTitle')}
              description={t('admin.calendarPage.emptyBody')}
            />
          ) : view === 'day' ? (
            <DayRail appointments={appointments} />
          ) : (
            <WeekGrid appointments={appointments} weekStart={weekStart} />
          )}
        </div>
      )}
    </>
  );

  return (
    <div data-testid="admin-calendar" className="flex flex-col gap-6">
      <SeoHead title={t('seo.titles.adminCalendar')} />

      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-bold text-text">{t('admin.calendar')}</h1>
        <p className="max-w-[60ch] text-sm text-muted">
          {t('admin.calendarPage.subtitle')}
        </p>
      </header>

      <Tabs
        value={view}
        onValueChange={(value) => setView(value as CalendarView)}
        className="flex flex-col gap-4"
      >
        <TabsList aria-label={t('admin.calendarPage.viewToggleLabel')} className="self-start">
          <TabsTrigger value="day">{t('admin.calendarPage.dayTab')}</TabsTrigger>
          <TabsTrigger value="week">{t('admin.calendarPage.weekTab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="day" data-testid="calendar-day">
          {body}
        </TabsContent>
        <TabsContent value="week" data-testid="calendar-week">
          {body}
        </TabsContent>
      </Tabs>
    </div>
  );
}
