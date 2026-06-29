import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Scissors,
} from 'lucide-react';
import { adminApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { gregorianToJalali, jalaliToGregorian, getJalaliMonthName } from '@salon/shared';
import { SeoHead } from '../../components/seo';
import {
  Badge,
  Button,
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
 * Admin calendar screen at `/admin/calendar` (R5.1, R5.3, R5.4).
 *
 * A legible time/resource grid with:
 *  - **Day + week views** toggled via Radix Tabs (keyboard RTL-aware).
 *  - **Time-slot grid**: time on vertical axis, staff/resources on horizontal.
 *  - **Numbers via `<Num>`** with `tabular-nums` for alignment.
 *  - **Keyboard navigation**: view-switch (Tabs), date-nav (arrows on nav bar),
 *    and cell focus with RTL-correct arrow keys (ArrowRight = inline-start).
 *  - **Skeleton** matching the grid layout while loading.
 *
 * All copy from `fa.json` (`admin.calendarPage.*`). Noindex admin route.
 */

const DEFAULT_SALON_ID = '11111111-1111-1111-1111-111111111111';

type CalendarView = 'month' | 'week' | 'day';
type LoadStatus = 'loading' | 'success' | 'error';

/** Time slots for the grid (business hours 8:00–20:00, 1h intervals). */
const HOUR_SLOTS = Array.from({ length: 13 }, (_, i) => i + 8);

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

/** Extract the hour (0–23) from an ISO instant. */
function hourOf(iso: string | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours();
}

/** `HH:mm` for an ISO instant, or `null` when the value is not a valid date. */
function clockTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Jalali (Shamsi) month helpers ──────────────────────────────────────────
// The salon's primary calendar is the Iranian Jalali month. These mirror the
// JalaliDatePicker's month math via the shared converter (no new date kernel).
const MS_PER_DAY = 86_400_000;

interface JalaliYM {
  jy: number;
  jm: number;
}

/** The Jalali (year, month) containing a Gregorian date. */
function jalaliYM(date: Date): JalaliYM {
  const j = gregorianToJalali({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
  return { jy: j.jy, jm: j.jm };
}

/** Shift a Jalali (year, month) by `delta` months (handles year wrap). */
function addJalaliMonths({ jy, jm }: JalaliYM, delta: number): JalaliYM {
  const zero = jy * 12 + (jm - 1) + delta;
  return { jy: Math.floor(zero / 12), jm: (zero % 12) + 1 };
}

/** Local Gregorian Date of day 1 of a Jalali month. */
function jalaliMonthStart({ jy, jm }: JalaliYM): Date {
  const g = jalaliToGregorian({ jy, jm, jd: 1 });
  return new Date(g.year, g.month - 1, g.day);
}

/** Number of days in a Jalali month (derived from the converter). */
function jalaliMonthLength(ym: JalaliYM): number {
  const start = jalaliMonthStart(ym);
  const next = jalaliMonthStart(addJalaliMonths(ym, 1));
  return Math.round((next.getTime() - start.getTime()) / MS_PER_DAY);
}

/** Iranian-week column (Saturday = 0 … Friday = 6) for a JS day-of-week. */
function iranianColumn(jsDay: number): number {
  return (jsDay + 1) % 7;
}

/** Local `YYYY-MM-DD` for a Date (matches localDateKey's local bucketing). */
function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface MonthDayCell {
  date: Date;
  jd: number;
}

/** Ordered day cells (Saturday-first) with leading-blank padding for a month. */
function buildMonthCells(ym: JalaliYM): (MonthDayCell | null)[] {
  const start = jalaliMonthStart(ym);
  const length = jalaliMonthLength(ym);
  const lead = iranianColumn(start.getDay());
  const cells: (MonthDayCell | null)[] = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let jd = 1; jd <= length; jd += 1) {
    cells.push({
      date: new Date(start.getFullYear(), start.getMonth(), start.getDate() + jd - 1),
      jd,
    });
  }
  return cells;
}

/** Compute the [from, to] range for a view. Day = today; week = Sat→Sat+7;
 *  month = the whole Jalali month containing `anchor`. */
function rangeFor(view: CalendarView, anchor: Date): { from: string; to: string } {
  if (view === 'day') {
    return { from: isoDate(anchor, 0), to: isoDate(anchor, 1) };
  }
  if (view === 'month') {
    const ym = jalaliYM(anchor);
    return {
      from: dateKey(jalaliMonthStart(ym)),
      to: dateKey(jalaliMonthStart(addJalaliMonths(ym, 1))),
    };
  }
  const weekStart = startOfIranianWeek(anchor);
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

/** Derive unique staff names from appointments for grid columns. */
function deriveStaff(appointments: Appointment[]): string[] {
  const set = new Set<string>();
  for (const a of appointments) {
    if (a.staffName) set.add(a.staffName);
  }
  const list = [...set].sort();
  return list.length > 0 ? list : ['—'];
}

/** A single appointment block within a grid cell. */
function AppointmentBlock({
  appt,
  canManage = false,
  onChanged,
  showDate = false,
}: {
  appt: Appointment;
  /** When true (Owner/Admin), a pending appointment exposes approve/reject. */
  canManage?: boolean;
  /** Called after a successful approve/reject so the calendar can refetch. */
  onChanged?: () => void;
  /** Show the Jalali date above the time (used by the cross-day pending queue). */
  showDate?: boolean;
}) {
  const { t } = useTranslation();
  const [actionStatus, setActionStatus] = useState<'idle' | 'approving' | 'rejecting' | 'error'>(
    'idle',
  );
  const start = clockTime(appt.startAt);
  const end = clockTime(appt.endAt);
  const service = appt.serviceName ?? t('admin.calendarPage.untitledService');

  // Managers may act, but only on a still-pending appointment.
  const normalizedStatus = (appt.status ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const showActions = canManage && normalizedStatus === 'pending';
  const busy = actionStatus === 'approving' || actionStatus === 'rejecting';

  const runAction = async (kind: 'approve' | 'reject') => {
    setActionStatus(kind === 'approve' ? 'approving' : 'rejecting');
    try {
      if (kind === 'approve') {
        await adminApi.approveAppointment(appt.id);
      } else {
        await adminApi.rejectAppointment(appt.id);
      }
      setActionStatus('idle');
      onChanged?.();
    } catch {
      // R5.6: surface a friendly inline message, never a raw HTTP/stack code.
      setActionStatus('error');
    }
  };

  let statusNode: React.ReactNode = null;
  if (appt.status) {
    const { variant, key } = statusMeta(appt.status);
    const label = t(`admin.calendarPage.status.${key}`, { defaultValue: appt.status });
    statusNode = <Badge status={variant}>{label}</Badge>;
  }

  return (
    <article className="flex flex-col gap-1 rounded-sm border border-border bg-elevated p-2 text-xs shadow-1">
      {showDate && appt.startAt && (
        <p className="flex items-center gap-1 font-medium tabular-nums text-muted">
          <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
          <JalaliDate value={appt.startAt} withWeekday variant="numeric" />
        </p>
      )}
      <div className="flex items-center justify-between gap-1">
        <span className="inline-flex items-center gap-1 font-medium tabular-nums text-text">
          <Clock className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
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
      <p className="flex items-center gap-1 break-words font-medium text-text">
        <Scissors className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
        {service}
      </p>
      {appt.customerName && (
        <p className="flex items-center gap-1 text-muted">
          <User className="h-3 w-3 shrink-0" aria-hidden="true" />
          {appt.customerName}
        </p>
      )}

      {showActions && (
        <div className="mt-1 flex flex-col gap-1">
          <div className="flex flex-wrap gap-2">
            <Button
              size="md"
              variant="primary"
              loading={actionStatus === 'approving'}
              disabled={busy}
              onClick={() => void runAction('approve')}
            >
              {t('admin.calendarPage.approve')}
            </Button>
            <Button
              size="md"
              variant="ghost"
              loading={actionStatus === 'rejecting'}
              disabled={busy}
              onClick={() => void runAction('reject')}
            >
              {t('admin.calendarPage.reject')}
            </Button>
          </div>
          {actionStatus === 'error' && (
            <p role="alert" className="text-danger">
              {t('admin.calendarPage.actionError')}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * Day view: a time/resource grid. Vertical axis = time slots (hourly),
 * horizontal axis = staff members. Keyboard-navigable cells with RTL-correct
 * arrow keys (ArrowRight = inline-start = previous column in RTL).
 */
function DayGrid({
  appointments,
  canManage,
  onChanged,
}: {
  appointments: Appointment[];
  canManage?: boolean;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const staff = useMemo(() => deriveStaff(appointments), [appointments]);
  const gridRef = useRef<HTMLDivElement>(null);
  const [focusRow, setFocusRow] = useState(0);
  const [focusCol, setFocusCol] = useState(0);

  /** Map appointments into a [hour][staffIndex] structure. */
  const cellMap = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const appt of appointments) {
      const h = hourOf(appt.startAt);
      if (h === null) continue;
      const col = appt.staffName ? staff.indexOf(appt.staffName) : 0;
      const key = `${h}-${col}`;
      if (!map[key]) map[key] = [];
      map[key].push(appt);
    }
    return map;
  }, [appointments, staff]);

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // RTL-correct: ArrowRight = inline-start (= move backward / toward
      // previous column in RTL), ArrowLeft = inline-end (= move forward).
      let nextRow = focusRow;
      let nextCol = focusCol;

      switch (e.key) {
        case 'ArrowRight':
          // inline-start in RTL = previous column
          nextCol = Math.max(0, focusCol - 1);
          break;
        case 'ArrowLeft':
          // inline-end in RTL = next column
          nextCol = Math.min(staff.length - 1, focusCol + 1);
          break;
        case 'ArrowUp':
          nextRow = Math.max(0, focusRow - 1);
          break;
        case 'ArrowDown':
          nextRow = Math.min(HOUR_SLOTS.length - 1, focusRow + 1);
          break;
        case 'Home':
          nextCol = 0;
          nextRow = 0;
          break;
        case 'End':
          nextCol = staff.length - 1;
          nextRow = HOUR_SLOTS.length - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      setFocusRow(nextRow);
      setFocusCol(nextCol);

      // Move DOM focus to the target cell
      const cell = gridRef.current?.querySelector(
        `[data-row="${nextRow}"][data-col="${nextCol}"]`,
      ) as HTMLElement | null;
      cell?.focus();
    },
    [focusRow, focusCol, staff.length],
  );

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={t('admin.calendarPage.dayGridLabel')}
      data-testid="calendar-day"
      className="overflow-x-auto"
      onKeyDown={handleGridKeyDown}
    >
      <div
        className="grid min-w-[28rem]"
        style={{
          gridTemplateColumns: `auto repeat(${staff.length}, 1fr)`,
        }}
      >
        {/* Column header row: time label + staff names */}
        <div
          role="columnheader"
          className="sticky top-0 z-sticky border-b border-border bg-surface p-2 text-xs font-medium text-muted"
        >
          {t('admin.calendarPage.timeColumn')}
        </div>
        {staff.map((name) => (
          <div
            key={name}
            role="columnheader"
            className="sticky top-0 z-sticky border-b border-border bg-surface p-2 text-center text-xs font-medium text-text"
          >
            {name}
          </div>
        ))}

        {/* Time slot rows */}
        {HOUR_SLOTS.map((hour, rowIdx) => (
          <div key={`row-${hour}`} role="row" className="contents">
            {/* Row header: time label */}
            <div
              role="rowheader"
              className="border-b border-border bg-bg p-2 text-end text-xs tabular-nums text-muted"
            >
              <Num value={`${String(hour).padStart(2, '0')}:00`} />
            </div>
            {/* Grid cells: one per staff member */}
            {staff.map((_, colIdx) => {
              const cellAppts = cellMap[`${hour}-${colIdx}`] ?? [];
              const isFocused = rowIdx === focusRow && colIdx === focusCol;
              return (
                <div
                  key={`${hour}-${colIdx}`}
                  role="gridcell"
                  tabIndex={isFocused ? 0 : -1}
                  data-row={rowIdx}
                  data-col={colIdx}
                  aria-label={`${String(hour).padStart(2, '0')}:00, ${staff[colIdx]}`}
                  className={cn(
                    'min-h-[3.5rem] border-b border-border p-1',
                    'outline-none focus-visible:outline focus-visible:outline-2',
                    'focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
                    'transition-colors duration-fast ease-standard',
                    colIdx < staff.length - 1 && 'border-e border-border',
                  )}
                >
                  {cellAppts.map((appt) => (
                    <AppointmentBlock
                      key={appt.id}
                      appt={appt}
                      canManage={canManage}
                      onChanged={onChanged}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Week view: a 7-column, Saturday-first grid of day columns (RTL by layout).
 * Each column is a day (weekday + Jalali date) holding that day's appointment
 * blocks. Keyboard navigable cells with RTL-correct arrows.
 */
function WeekGrid({
  appointments,
  weekStart,
  canManage,
  onChanged,
}: {
  appointments: Appointment[];
  weekStart: Date;
  canManage?: boolean;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const gridRef = useRef<HTMLDivElement>(null);
  const [focusCol, setFocusCol] = useState(0);

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

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let next = focusCol;
      switch (e.key) {
        case 'ArrowRight':
          // inline-start in RTL = previous day
          next = Math.max(0, focusCol - 1);
          break;
        case 'ArrowLeft':
          // inline-end in RTL = next day
          next = Math.min(6, focusCol + 1);
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = 6;
          break;
        default:
          return;
      }
      e.preventDefault();
      setFocusCol(next);
      const cell = gridRef.current?.querySelector(`[data-col="${next}"]`) as HTMLElement | null;
      cell?.focus();
    },
    [focusCol],
  );

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={t('admin.calendarPage.weekGridLabel')}
      data-testid="calendar-week"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7"
      onKeyDown={handleGridKeyDown}
    >
      {days.map((day, colIdx) => {
        const isFocused = colIdx === focusCol;
        return (
          <section
            key={day.iso}
            role="gridcell"
            tabIndex={isFocused ? 0 : -1}
            data-col={colIdx}
            aria-label={day.iso}
            className={cn(
              'flex min-h-[8rem] flex-col gap-2 rounded-md border border-border bg-surface p-2',
              'outline-none focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-offset-2 focus-visible:outline-focus',
            )}
          >
            <header className="border-b border-border pb-1 text-center text-xs font-medium tabular-nums text-muted">
              <JalaliDate value={day.iso} withWeekday variant="numeric" />
            </header>
            <div className="flex flex-col gap-2">
              {day.items.map((appt) => (
                <AppointmentBlock
                  key={appt.id}
                  appt={appt}
                  canManage={canManage}
                  onChanged={onChanged}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Persian weekday short headers in Iranian week order (Saturday first). */
const MONTH_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const;

/**
 * Month view: a Jalali (Shamsi) month grid, Saturday-first. Each day cell shows
 * the Persian day number and a compact summary of that day's appointments
 * (time + service, pending highlighted) with a "+N" overflow. Clicking a day
 * drills into the day view for that date. It is a read-only overview — approvals
 * happen in the pending panel or the day view.
 */
function MonthGrid({
  appointments,
  monthAnchor,
  onSelectDay,
}: {
  appointments: Appointment[];
  monthAnchor: Date;
  onSelectDay: (date: Date) => void;
}) {
  const { t } = useTranslation();
  const todayKey = dateKey(new Date());

  const cells = useMemo(() => {
    const ym = jalaliYM(monthAnchor);
    const byDate = new Map<string, Appointment[]>();
    for (const a of appointments) {
      if (!a.startAt) continue;
      const key = localDateKey(a.startAt);
      if (!key) continue;
      const arr = byDate.get(key) ?? [];
      arr.push(a);
      byDate.set(key, arr);
    }
    return buildMonthCells(ym).map((c) => {
      if (!c) return null;
      const key = dateKey(c.date);
      const items = (byDate.get(key) ?? []).sort((a, b) => {
        const ta = a.startAt ? new Date(a.startAt).getTime() : 0;
        const tb = b.startAt ? new Date(b.startAt).getTime() : 0;
        return ta - tb;
      });
      return { date: c.date, jd: c.jd, key, items };
    });
  }, [appointments, monthAnchor]);

  return (
    <div data-testid="calendar-month" className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted">
        {MONTH_WEEKDAYS.map((w, i) => (
          <div key={i} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1" aria-label={t('admin.calendarPage.month.gridLabel')}>
        {cells.map((cell, idx) => {
          if (!cell) {
            return (
              <div
                key={`blank-${idx}`}
                aria-hidden="true"
                className="min-h-[4.5rem] rounded-md sm:min-h-[6rem]"
              />
            );
          }
          const isToday = cell.key === todayKey;
          const shown = cell.items.slice(0, 2);
          const overflow = cell.items.length - shown.length;
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onSelectDay(cell.date)}
              aria-label={t('admin.calendarPage.month.dayLabel', {
                count: cell.items.length,
              })}
              className={cn(
                'flex min-h-[4.5rem] flex-col gap-1 rounded-md border p-1 text-start sm:min-h-[6rem]',
                'transition-colors duration-fast ease-standard hover:bg-elevated',
                'outline-none focus-visible:outline focus-visible:outline-2',
                'focus-visible:outline-offset-2 focus-visible:outline-focus',
                isToday ? 'border-primary bg-surface' : 'border-border',
              )}
            >
              <span
                className={cn(
                  'text-xs font-medium tabular-nums',
                  isToday ? 'text-primary' : 'text-text',
                )}
              >
                <Num value={cell.jd} />
              </span>
              <span className="flex flex-col gap-0.5">
                {shown.map((appt) => {
                  const norm = (appt.status ?? '').toLowerCase().replace(/[^a-z]/g, '');
                  const isPending = norm === 'pending' || norm === 'held';
                  return (
                    <span
                      key={appt.id}
                      className={cn(
                        'truncate rounded-sm px-1 py-0.5 text-[0.65rem] leading-tight',
                        isPending ? 'border border-warning text-warning' : 'bg-elevated text-muted',
                      )}
                    >
                      {clockTime(appt.startAt) && (
                        <span className="tabular-nums">{clockTime(appt.startAt)} </span>
                      )}
                      {appt.serviceName ?? t('admin.calendarPage.untitledService')}
                    </span>
                  );
                })}
                {overflow > 0 && (
                  <span className="text-[0.65rem] text-muted">
                    {t('admin.calendarPage.month.more', { count: overflow })}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Skeleton placeholder grid shown while the calendar loads (R5.4). */
function CalendarSkeleton({ view }: { view: CalendarView }) {
  const { t } = useTranslation();

  if (view === 'month') {
    return (
      <div
        data-testid="calendar-loading"
        role="status"
        aria-busy="true"
        aria-label={t('admin.calendarPage.loadingLabel')}
        className="flex flex-col gap-2"
      >
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={`h-${i}`} variant="text" className="mx-auto h-3 w-4" />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} variant="rect" className="min-h-[4.5rem] sm:min-h-[6rem]" />
          ))}
        </div>
      </div>
    );
  }

  if (view === 'week') {
    return (
      <div
        data-testid="calendar-loading"
        role="status"
        aria-busy="true"
        aria-label={t('admin.calendarPage.loadingLabel')}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7"
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[8rem] flex-col gap-2 rounded-md border border-border p-2"
          >
            <Skeleton variant="text" className="mx-auto h-4 w-3/4" />
            <Skeleton variant="rect" className="h-10" />
            <Skeleton variant="rect" className="h-10" />
          </div>
        ))}
      </div>
    );
  }

  // Day view skeleton: matches the time/resource grid layout
  return (
    <div
      data-testid="calendar-loading"
      role="status"
      aria-busy="true"
      aria-label={t('admin.calendarPage.loadingLabel')}
      className="flex flex-col gap-0"
    >
      {/* Header row skeleton */}
      <div className="grid grid-cols-[auto_1fr_1fr] gap-0">
        <Skeleton variant="rect" className="h-8 w-16" />
        <Skeleton variant="rect" className="h-8" />
        <Skeleton variant="rect" className="h-8" />
      </div>
      {/* Time slot row skeletons */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="grid grid-cols-[auto_1fr_1fr] gap-0">
          <Skeleton variant="text" className="h-14 w-16" />
          <Skeleton variant="rect" className="h-14" />
          <Skeleton variant="rect" className="h-14" />
        </div>
      ))}
    </div>
  );
}

/**
 * Date navigation bar with prev/next buttons. Keyboard-accessible with
 * RTL-correct arrow keys for date stepping.
 */
function DateNav({
  view,
  anchor,
  onNavigate,
}: {
  view: CalendarView;
  anchor: Date;
  onNavigate: (dir: -1 | 0 | 1) => void;
}) {
  const { t } = useTranslation();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
          // inline-start in RTL = go back
          e.preventDefault();
          onNavigate(-1);
          break;
        case 'ArrowLeft':
          // inline-end in RTL = go forward
          e.preventDefault();
          onNavigate(1);
          break;
        default:
          break;
      }
    },
    [onNavigate],
  );

  const prevLabel =
    view === 'day'
      ? t('admin.calendarPage.prevDay')
      : view === 'month'
        ? t('admin.calendarPage.prevMonth')
        : t('admin.calendarPage.prevWeek');
  const nextLabel =
    view === 'day'
      ? t('admin.calendarPage.nextDay')
      : view === 'month'
        ? t('admin.calendarPage.nextMonth')
        : t('admin.calendarPage.nextWeek');

  // Month view reads as "تیر ۱۴۰۵"; day/week show the anchor's full Jalali date.
  const ym = jalaliYM(anchor);
  const title =
    view === 'month' ? (
      <>
        {getJalaliMonthName(ym.jm)} <Num value={ym.jy} />
      </>
    ) : (
      <JalaliDate value={anchor.toISOString()} variant="long" />
    );

  return (
    <nav
      aria-label={t('admin.calendarPage.dateNavLabel')}
      className="flex items-center gap-2"
      onKeyDown={handleKeyDown}
    >
      <Button variant="ghost" aria-label={prevLabel} onClick={() => onNavigate(-1)}>
        {/* In RTL ChevronRight points inline-start (= back) */}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>

      <span className="min-w-[6rem] text-center text-sm font-medium tabular-nums text-text">
        {title}
      </span>

      <Button variant="ghost" aria-label={nextLabel} onClick={() => onNavigate(1)}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>

      <Button variant="ghost" onClick={() => onNavigate(0)}>
        {t('admin.calendarPage.today')}
      </Button>
    </nav>
  );
}

/**
 * Discoverable approvals queue for Owner/Admin: every booking awaiting approval
 * (status 'pending'), regardless of which day it falls on — so a manager never
 * has to hunt the calendar for the inline approve/reject affordance. Backed by
 * `GET /salons/:id/pending`; each row reuses {@link AppointmentBlock} so approve/
 * reject behave identically to the grid. Self-contained loading / empty / error
 * states (ui-ux §6).
 *
 * It refetches whenever the parent calendar reloads (`reloadToken`), and an
 * approve/reject here calls `onChanged` so both this panel and the grid refresh.
 */
function PendingApprovalsPanel({
  salonId,
  reloadToken,
  onChanged,
}: {
  salonId: string;
  reloadToken: number;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<Appointment[]>([]);
  // Local token so the error-state retry can refetch without a parent reload.
  const [localToken, setLocalToken] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    adminApi
      .getPending(salonId)
      .then((res) => {
        if (!active) return;
        setItems(res.appointments.map((a, i) => toAppointment(a, `pending-${i + 1}`)));
        setStatus('success');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [salonId, reloadToken, localToken]);

  // While loading the very first time, keep the panel quiet (a slim skeleton).
  return (
    <section
      aria-labelledby="pending-approvals-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2
            id="pending-approvals-title"
            className="flex items-center gap-2 text-lg text-display text-text"
          >
            {t('admin.calendarPage.pending.title')}
            {status === 'success' && items.length > 0 && (
              <Badge status="warning">
                <Num value={items.length} />
              </Badge>
            )}
          </h2>
          <p className="text-xs text-muted">{t('admin.calendarPage.pending.subtitle')}</p>
        </div>
      </header>

      {status === 'loading' && (
        <div
          role="status"
          aria-busy="true"
          aria-label={t('admin.calendarPage.pending.loadingLabel')}
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Skeleton variant="rect" className="h-24" />
          <Skeleton variant="rect" className="h-24" />
        </div>
      )}

      {status === 'error' && (
        <ErrorState
          title={t('admin.calendarPage.pending.errorTitle')}
          retryLabel={t('admin.calendarPage.retry')}
          onRetry={() => setLocalToken((n) => n + 1)}
        />
      )}

      {status === 'success' &&
        (items.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-8 w-8" />}
            title={t('admin.calendarPage.pending.emptyTitle')}
            description={t('admin.calendarPage.pending.emptyBody')}
          />
        ) : (
          <div
            data-testid="pending-approvals-list"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
          >
            {items.map((appt) => (
              <AppointmentBlock
                key={appt.id}
                appt={appt}
                canManage
                onChanged={onChanged}
                showDate
              />
            ))}
          </div>
        ))}
    </section>
  );
}

export function CalendarPage({ salonId: salonIdProp }: { salonId?: string }) {
  const { t } = useTranslation();
  const params = useParams<{ salonId?: string }>();
  const salonId = salonIdProp ?? params.salonId ?? DEFAULT_SALON_ID;

  // Any staff member may act on the appointments they can see: Owner/Admin on the
  // whole salon, a Stylist on their own (the calendar grid + pending queue are
  // already scoped to the stylist server-side, and the backend re-checks
  // ownership on approve/reject). Customers/anonymous (no role) get no
  // management affordances.
  const { isStaff } = useAuth();
  const canManage = isStaff;

  const [view, setView] = useState<CalendarView>('month');
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  // Captured once per load so the week grid columns align with the fetched range.
  const [weekStart, setWeekStart] = useState<Date>(() => startOfIranianWeek(new Date()));
  // Bumped by the retry action to re-run the load effect.
  const [reloadToken, setReloadToken] = useState(0);

  /** Refetch after an approve/reject so the grid reflects the new status. */
  const onChanged = useCallback(() => setReloadToken((n) => n + 1), []);

  /** Navigate the date anchor. dir: -1 = back, +1 = forward, 0 = today. */
  const handleNavigate = useCallback(
    (dir: -1 | 0 | 1) => {
      setAnchor((prev) => {
        if (dir === 0) return new Date();
        if (view === 'month') {
          // Step a whole Jalali month (land on day 1 of the target month).
          return jalaliMonthStart(addJalaliMonths(jalaliYM(prev), dir));
        }
        const step = view === 'day' ? 1 : 7;
        const next = new Date(prev);
        next.setDate(next.getDate() + dir * step);
        return next;
      });
    },
    [view],
  );

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError('');

    setWeekStart(startOfIranianWeek(anchor));
    const { from, to } = rangeFor(view, anchor);

    adminApi
      .getCalendar(salonId, from, to, view)
      .then((res) => {
        if (!active) return;
        setAppointments(res.appointments.map((appt, i) => toAppointment(appt, `appt-${i + 1}`)));
        setStatus('success');
      })
      .catch((_err: unknown) => {
        if (!active) return;
        // R5.6: Show a user-friendly Persian cause — never raw stack/HTTP codes.
        setError(t('admin.calendarPage.errorBody'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [salonId, view, anchor, reloadToken, t]);

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
        <div
          data-testid="calendar-appointments"
          aria-label={t('admin.calendarPage.appointmentsLabel')}
        >
          {appointments.length === 0 ? (
            <EmptyState
              data-testid="calendar-empty"
              icon={<CalendarX2 className="h-8 w-8" />}
              title={t('admin.calendarPage.emptyTitle')}
              description={t('admin.calendarPage.emptyBody')}
            />
          ) : view === 'month' ? (
            <MonthGrid
              appointments={appointments}
              monthAnchor={anchor}
              onSelectDay={(d) => {
                setAnchor(d);
                setView('day');
              }}
            />
          ) : view === 'day' ? (
            <DayGrid appointments={appointments} canManage={canManage} onChanged={onChanged} />
          ) : (
            <WeekGrid
              appointments={appointments}
              weekStart={weekStart}
              canManage={canManage}
              onChanged={onChanged}
            />
          )}
        </div>
      )}
    </>
  );

  return (
    <div data-testid="admin-calendar" className="flex flex-col gap-6">
      <SeoHead title={t('seo.titles.adminCalendar')} />

      <header className="flex flex-col gap-2">
        <h1 className="text-xl text-display text-text">{t('admin.calendar')}</h1>
        <p className="max-w-prose text-sm text-muted">{t('admin.calendarPage.subtitle')}</p>
      </header>

      {/* Owner/Admin: a prominent approvals queue so pending requests are never
          buried in the grid. Hidden for stylists (no manage_appointments). */}
      {canManage && (
        <PendingApprovalsPanel salonId={salonId} reloadToken={reloadToken} onChanged={onChanged} />
      )}

      <Tabs
        value={view}
        onValueChange={(value) => setView(value as CalendarView)}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList aria-label={t('admin.calendarPage.viewToggleLabel')} className="self-start">
            <TabsTrigger value="month">{t('admin.calendarPage.monthTab')}</TabsTrigger>
            <TabsTrigger value="week">{t('admin.calendarPage.weekTab')}</TabsTrigger>
            <TabsTrigger value="day">{t('admin.calendarPage.dayTab')}</TabsTrigger>
          </TabsList>

          <DateNav view={view} anchor={anchor} onNavigate={handleNavigate} />
        </div>

        <TabsContent value="month">{body}</TabsContent>
        <TabsContent value="week">{body}</TabsContent>
        <TabsContent value="day">{body}</TabsContent>
      </Tabs>
    </div>
  );
}
