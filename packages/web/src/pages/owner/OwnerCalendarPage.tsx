import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  User,
  Scissors,
  CalendarX2,
} from 'lucide-react';
import { adminApi } from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { gregorianToJalali, getJalaliMonthName } from '@salon/shared';
import {
  Button,
  EmptyState,
  ErrorState,
  Num,
  Skeleton,
  cn,
} from '../../components/ui';
import { easings } from '../../lib/motion-variants';

// ─── Types ───────────────────────────────────────────────────────────────────

type CalendarView = 'day' | 'week';
type LoadStatus = 'loading' | 'success' | 'error';

interface Appointment {
  id: string;
  startAt?: string;
  endAt?: string;
  serviceName?: string;
  customerName?: string;
  staffName?: string;
  status?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Time grid slots: 07:00–22:00, 30-minute intervals */
const TIME_SLOTS: { hour: number; minute: number }[] = [];
for (let h = 7; h < 22; h++) {
  TIME_SLOTS.push({ hour: h, minute: 0 });
  TIME_SLOTS.push({ hour: h, minute: 30 });
}
// Final 22:00 slot as end marker
TIME_SLOTS.push({ hour: 22, minute: 0 });

/** Persian weekday labels — Saturday-first (Iranian week) */
const PERSIAN_WEEKDAYS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
] as const;

/** Service-type color map for appointment blocks (token-driven) */
const SERVICE_COLORS: Record<string, string> = {
  haircut: 'bg-primary/20 border-primary text-primary',
  color: 'bg-accent/20 border-accent text-accent',
  makeup: 'bg-secondary/20 border-secondary text-secondary',
  nail: 'bg-warning/20 border-warning text-warning',
  facial: 'bg-info/20 border-info text-info',
  default: 'bg-primary/15 border-primary/60 text-text',
};

/** Derive a color class from a service name string. */
function serviceColorClass(serviceName?: string): string {
  if (!serviceName) return SERVICE_COLORS.default;
  const lower = serviceName.toLowerCase();
  if (lower.includes('کوتاه') || lower.includes('hair') || lower.includes('cut'))
    return SERVICE_COLORS.haircut;
  if (lower.includes('رنگ') || lower.includes('color'))
    return SERVICE_COLORS.color;
  if (lower.includes('میکاپ') || lower.includes('makeup') || lower.includes('آرایش'))
    return SERVICE_COLORS.makeup;
  if (lower.includes('ناخن') || lower.includes('nail'))
    return SERVICE_COLORS.nail;
  if (lower.includes('پوست') || lower.includes('facial'))
    return SERVICE_COLORS.facial;
  return SERVICE_COLORS.default;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** ISO date `YYYY-MM-DD` offset from base by `days`. */
function isoDate(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Saturday that opens the Iranian week containing `date`. */
function startOfIranianWeek(date: Date): Date {
  const d = new Date(date);
  const daysSinceSaturday = (d.getDay() + 1) % 7;
  d.setDate(d.getDate() - daysSinceSaturday);
  return d;
}

/** Local YYYY-MM-DD for a Date. */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local YYYY-MM-DD from an ISO datetime string. */
function localDateKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return dateKey(d);
}

/** Minutes since midnight from an ISO string. */
function minutesOf(iso: string | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/** Format HH:mm from ISO. */
function clockTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Format a Jalali day display from a Date. */
function jalaliDayDisplay(date: Date): { jd: number; jm: number; jy: number } {
  return gregorianToJalali({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

/** Shape an opaque API record into a display Appointment. */
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

/** Compute fetch range based on view. */
function rangeFor(
  view: CalendarView,
  anchor: Date,
): { from: string; to: string } {
  if (view === 'day') {
    return { from: isoDate(anchor, 0), to: isoDate(anchor, 1) };
  }
  const weekStart = startOfIranianWeek(anchor);
  return { from: isoDate(weekStart, 0), to: isoDate(weekStart, 7) };
}

/** Iranian week column index: Saturday = 0 … Friday = 6. */
function iranianDayIndex(date: Date): number {
  return (date.getDay() + 1) % 7;
}

// ─── Motion Variants ─────────────────────────────────────────────────────────

const viewSwitchVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? -40 : 40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? 40 : -40,
    opacity: 0,
  }),
};

const viewSwitchTransition = {
  type: 'tween' as const,
  duration: 0.25,
  ease: easings.standard,
};

const dateSlideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? -24 : 24,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? 24 : -24,
    opacity: 0,
  }),
};

const dateSlideTransition = {
  type: 'tween' as const,
  duration: 0.2,
  ease: easings.decelerate,
};

// ─── Appointment Block Component ─────────────────────────────────────────────

interface AppointmentBlockProps {
  appt: Appointment;
  /** Height in pixels (for positioned day-view blocks). */
  height?: number;
  /** Top offset in pixels (for positioned day-view blocks). */
  top?: number;
  /** Render as absolute-positioned within a time cell. */
  positioned?: boolean;
}

function AppointmentBlock({
  appt,
  height,
  top,
  positioned = false,
}: AppointmentBlockProps) {
  const colorClass = serviceColorClass(appt.serviceName);
  const start = clockTime(appt.startAt);
  const end = clockTime(appt.endAt);
  const service = appt.serviceName ?? '—';
  const customer = appt.customerName;

  const positionStyle = positioned
    ? { position: 'absolute' as const, top: `${top}px`, height: `${height}px`, insetInlineStart: '4px', insetInlineEnd: '4px' }
    : undefined;

  return (
    <div
      className={cn(
        'flex flex-col justify-center gap-0.5 overflow-hidden rounded-md border px-2 py-1',
        'transition-all duration-fast ease-standard',
        'hover:shadow-1 hover:scale-[1.01]',
        colorClass,
        positioned ? 'absolute z-base' : '',
      )}
      style={positionStyle}
      title={`${service} — ${customer ?? ''}`}
    >
      <span className="truncate text-xs font-medium leading-tight">
        <Scissors className="inline-block h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />{' '}
        {service}
      </span>
      {customer && (
        <span className="truncate text-[0.65rem] leading-tight opacity-80">
          <User className="inline-block h-2.5 w-2.5 shrink-0 opacity-60" aria-hidden="true" />{' '}
          {customer}
        </span>
      )}
      {start && !positioned && (
        <span className="text-[0.6rem] tabular-nums opacity-60">
          <Num value={start} />
          {end && <> – <Num value={end} /></>}
        </span>
      )}
    </div>
  );
}

// ─── Day View ────────────────────────────────────────────────────────────────

/** Pixels per minute in the time grid. */
const PX_PER_MIN = 2;
/** Height of each 30-min slot row. */
const SLOT_HEIGHT = 30 * PX_PER_MIN; // 60px

function DayView({ appointments, anchor }: { appointments: Appointment[]; anchor: Date }) {
  const { t } = useTranslation();
  const gridRef = useRef<HTMLDivElement>(null);
  const anchorKey = dateKey(anchor);

  const dayAppts = useMemo(
    () =>
      appointments
        .filter((a) => a.startAt && localDateKey(a.startAt) === anchorKey)
        .sort((a, b) => {
          const ta = a.startAt ? new Date(a.startAt).getTime() : 0;
          const tb = b.startAt ? new Date(b.startAt).getTime() : 0;
          return ta - tb;
        }),
    [appointments, anchorKey],
  );

  /** Grid starts at 07:00 = minute 420 */
  const gridStartMin = 7 * 60;

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={t('owner.calendar.dayGridLabel', { defaultValue: 'نمای روزانه' })}
      data-testid="owner-calendar-day"
      className="relative overflow-x-auto rounded-lg border border-border bg-surface"
    >
      <div className="relative min-w-[20rem]">
        {/* Time rows */}
        {TIME_SLOTS.map((slot, idx) => {
          const timeStr = `${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}`;
          const isHour = slot.minute === 0;
          return (
            <div
              key={`slot-${idx}`}
              role="row"
              className={cn(
                'flex items-start border-b border-border/50',
                'transition-colors duration-fast ease-standard hover:bg-elevated/40',
              )}
              style={{ height: `${SLOT_HEIGHT}px` }}
            >
              {/* Time label */}
              <div
                role="rowheader"
                className={cn(
                  'sticky start-0 z-sticky flex w-16 shrink-0 items-start justify-end',
                  'border-e border-border/30 bg-surface pe-2 pt-1',
                  'text-xs tabular-nums',
                  isHour ? 'font-medium text-text' : 'text-muted/60',
                )}
                style={{ height: `${SLOT_HEIGHT}px` }}
              >
                <Num value={timeStr} />
              </div>
              {/* Empty cell area — appointments overlay on top */}
              <div className="relative flex-1" style={{ height: `${SLOT_HEIGHT}px` }} />
            </div>
          );
        })}

        {/* Positioned appointment blocks */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ insetInlineStart: '4rem' }}
        >
          {dayAppts.map((appt) => {
            const startMin = minutesOf(appt.startAt);
            const endMin = minutesOf(appt.endAt);
            if (startMin === null) return null;
            const topPx = (startMin - gridStartMin) * PX_PER_MIN;
            const duration = endMin !== null ? endMin - startMin : 30;
            const heightPx = Math.max(duration * PX_PER_MIN, 24);
            if (topPx < 0) return null;
            return (
              <div key={appt.id} className="pointer-events-auto">
                <AppointmentBlock
                  appt={appt}
                  positioned
                  top={topPx}
                  height={heightPx}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Week View ───────────────────────────────────────────────────────────────

function WeekView({ appointments, anchor }: { appointments: Appointment[]; anchor: Date }) {
  const { t } = useTranslation();
  const weekStart = useMemo(() => startOfIranianWeek(anchor), [anchor]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const iso = dateKey(date);
      const jalali = jalaliDayDisplay(date);
      const items = appointments
        .filter((a) => a.startAt && localDateKey(a.startAt) === iso)
        .sort((a, b) => {
          const ta = a.startAt ? new Date(a.startAt).getTime() : 0;
          const tb = b.startAt ? new Date(b.startAt).getTime() : 0;
          return ta - tb;
        });
      return { date, iso, jalali, items, dayIndex: i };
    });
  }, [appointments, weekStart]);

  const todayKey = dateKey(new Date());

  return (
    <div
      role="grid"
      aria-label={t('owner.calendar.weekGridLabel', { defaultValue: 'نمای هفتگی' })}
      data-testid="owner-calendar-week"
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7"
    >
      {days.map((day) => {
        const isToday = day.iso === todayKey;
        return (
          <section
            key={day.iso}
            role="gridcell"
            aria-label={`${PERSIAN_WEEKDAYS[day.dayIndex]} ${day.jalali.jd}`}
            className={cn(
              'flex min-h-[10rem] flex-col gap-2 rounded-lg border p-3',
              'transition-colors duration-fast ease-standard hover:bg-elevated/30',
              isToday
                ? 'border-primary/60 bg-primary/5'
                : 'border-border bg-surface',
            )}
          >
            {/* Day header */}
            <header className="flex flex-col items-center gap-0.5 border-b border-border/50 pb-2">
              <span className="text-xs font-medium text-muted">
                {PERSIAN_WEEKDAYS[day.dayIndex]}
              </span>
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                  isToday
                    ? 'bg-primary text-primary-contrast'
                    : 'text-text',
                )}
              >
                <Num value={day.jalali.jd} />
              </span>
            </header>

            {/* Appointment list */}
            <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
              {day.items.length === 0 && (
                <p className="py-4 text-center text-xs text-muted/50">—</p>
              )}
              {day.items.map((appt) => (
                <AppointmentBlock key={appt.id} appt={appt} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function CalendarSkeleton({ view }: { view: CalendarView }) {
  const { t } = useTranslation();

  if (view === 'week') {
    return (
      <div
        data-testid="owner-calendar-loading"
        role="status"
        aria-busy="true"
        aria-label={t('owner.calendar.loading', { defaultValue: 'در حال بارگذاری...' })}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7"
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[10rem] flex-col gap-2 rounded-lg border border-border p-3"
          >
            <Skeleton variant="text" className="mx-auto h-4 w-12" />
            <Skeleton variant="text" className="mx-auto h-7 w-7 rounded-full" />
            <Skeleton variant="rect" className="h-10 rounded-md" />
            <Skeleton variant="rect" className="h-8 rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  // Day view skeleton
  return (
    <div
      data-testid="owner-calendar-loading"
      role="status"
      aria-busy="true"
      aria-label={t('owner.calendar.loading', { defaultValue: 'در حال بارگذاری...' })}
      className="flex flex-col rounded-lg border border-border"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex border-b border-border/50" style={{ height: '60px' }}>
          <Skeleton variant="text" className="h-4 w-14 shrink-0 self-start ms-2 mt-2" />
          <div className="flex-1 p-2">
            {i % 3 === 0 && <Skeleton variant="rect" className="h-10 rounded-md" />}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── View Toggle ─────────────────────────────────────────────────────────────

function ViewToggle({
  view,
  onViewChange,
}: {
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="tablist"
      aria-label={t('owner.calendar.viewToggle', { defaultValue: 'تغییر نما' })}
      className="inline-flex rounded-lg border border-border bg-bg p-1"
    >
      <button
        role="tab"
        aria-selected={view === 'day'}
        className={cn(
          'relative rounded-md px-4 py-1.5 text-sm font-medium transition-colors duration-fast ease-standard',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          view === 'day'
            ? 'bg-primary text-primary-contrast shadow-1'
            : 'text-muted hover:text-text hover:bg-elevated/50',
        )}
        onClick={() => onViewChange('day')}
      >
        {t('owner.calendar.dayTab', { defaultValue: 'روز' })}
      </button>
      <button
        role="tab"
        aria-selected={view === 'week'}
        className={cn(
          'relative rounded-md px-4 py-1.5 text-sm font-medium transition-colors duration-fast ease-standard',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          view === 'week'
            ? 'bg-primary text-primary-contrast shadow-1'
            : 'text-muted hover:text-text hover:bg-elevated/50',
        )}
        onClick={() => onViewChange('week')}
      >
        {t('owner.calendar.weekTab', { defaultValue: 'هفته' })}
      </button>
    </div>
  );
}

// ─── Date Navigation ─────────────────────────────────────────────────────────

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
  const jalali = jalaliDayDisplay(anchor);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // RTL-aware: ArrowRight = inline-start = go back
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNavigate(-1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onNavigate(1);
      }
    },
    [onNavigate],
  );

  const title = useMemo(() => {
    if (view === 'day') {
      const dayIdx = iranianDayIndex(anchor);
      return `${PERSIAN_WEEKDAYS[dayIdx]} ${jalali.jd} ${getJalaliMonthName(jalali.jm)}`;
    }
    // Week: show month + year
    return `${getJalaliMonthName(jalali.jm)} ${jalali.jy}`;
  }, [view, anchor, jalali]);

  return (
    <nav
      aria-label={t('owner.calendar.dateNav', { defaultValue: 'ناوبری تاریخ' })}
      className="flex items-center gap-1"
      onKeyDown={handleKeyDown}
    >
      {/* In RTL: ChevronRight = back (inline-start) */}
      <Button
        variant="ghost"
        size="md"
        aria-label={t('owner.calendar.prev', { defaultValue: 'قبلی' })}
        onClick={() => onNavigate(-1)}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>

      <span className="min-w-[8rem] text-center text-sm font-medium tabular-nums text-text">
        <Num value={title} />
      </span>

      <Button
        variant="ghost"
        size="md"
        aria-label={t('owner.calendar.next', { defaultValue: 'بعدی' })}
        onClick={() => onNavigate(1)}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>

      <Button
        variant="ghost"
        size="md"
        onClick={() => onNavigate(0)}
        className="ms-1"
      >
        {t('owner.calendar.today', { defaultValue: 'امروز' })}
      </Button>
    </nav>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Redesigned Owner Calendar Page (Task 7.4; Req 8.2, 8.6, 8.7, 8.8, 11.5).
 *
 * NYC dark-mode-first calendar with:
 * - Day view: vertical time grid (07:00–22:00) with positioned appointment blocks
 * - Week view: 7-column grid (Saturday-first, Iranian week) with Persian labels
 * - Framer Motion view-switch animation (slide between day↔week)
 * - Smooth date navigation transitions (RTL-aware slide)
 * - All dates in Jalali with Persian numerals
 * - Skeleton state while loading, error state with retry
 * - Hover highlights on time cells
 * - Keyboard operable date navigation (RTL arrows)
 */
export function OwnerCalendarPage() {
  const { t } = useTranslation();
  const salonId = useSalonId();

  const [view, setView] = useState<CalendarView>('day');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  // Track direction for animations
  const [viewDirection, setViewDirection] = useState(0);
  const [dateDirection, setDateDirection] = useState(0);
  const dateKey_ = `${view}-${dateKey(anchor)}`;

  const handleViewChange = useCallback(
    (newView: CalendarView) => {
      if (newView === view) return;
      setViewDirection(newView === 'week' ? 1 : -1);
      setView(newView);
    },
    [view],
  );

  const handleNavigate = useCallback(
    (dir: -1 | 0 | 1) => {
      setDateDirection(dir);
      setAnchor((prev) => {
        if (dir === 0) return new Date();
        const step = view === 'day' ? 1 : 7;
        const next = new Date(prev);
        next.setDate(next.getDate() + dir * step);
        return next;
      });
    },
    [view],
  );

  // ─── Data Fetch ──────────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    setStatus('loading');

    const { from, to } = rangeFor(view, anchor);

    adminApi
      .getCalendar(salonId, from, to, view)
      .then((res) => {
        if (!active) return;
        setAppointments(
          res.appointments.map((appt, i) => toAppointment(appt, `appt-${i + 1}`)),
        );
        setStatus('success');
      })
      .catch(() => {
        if (!active) return;
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [salonId, view, anchor, reloadToken]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <section data-testid="owner-calendar-page" className="flex flex-col gap-5">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <h1 className="text-xl text-display text-text">
          {t('owner.calendar.title', { defaultValue: 'تقویم' })}
        </h1>
        <p className="text-sm text-muted">
          {t('owner.calendar.subtitle', { defaultValue: 'مدیریت نوبت‌ها و برنامه‌ریزی روزانه' })}
        </p>
      </header>

      {/* Toolbar: view toggle + date nav */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewToggle view={view} onViewChange={handleViewChange} />
        <DateNav view={view} anchor={anchor} onNavigate={handleNavigate} />
      </div>

      {/* Calendar content with animated transitions */}
      <div className="relative min-h-[20rem]">
        {status === 'loading' && <CalendarSkeleton view={view} />}

        {status === 'error' && (
          <ErrorState
            data-testid="owner-calendar-error"
            title={t('owner.calendar.errorTitle', { defaultValue: 'خطا در بارگذاری تقویم' })}
            description={t('owner.calendar.errorBody', { defaultValue: 'امکان نمایش نوبت‌ها وجود ندارد. لطفاً دوباره تلاش کنید.' })}
            retryLabel={t('owner.calendar.retry', { defaultValue: 'تلاش مجدد' })}
            onRetry={() => setReloadToken((n) => n + 1)}
          />
        )}

        {status === 'success' && appointments.length === 0 && (
          <EmptyState
            data-testid="owner-calendar-empty"
            icon={<CalendarX2 className="h-8 w-8" />}
            title={t('owner.calendar.emptyTitle', { defaultValue: 'نوبتی ثبت نشده' })}
            description={t('owner.calendar.emptyBody', { defaultValue: 'در این بازه زمانی نوبتی وجود ندارد.' })}
          />
        )}

        {status === 'success' && appointments.length > 0 && (
          <AnimatePresence mode="wait" custom={viewDirection}>
            <motion.div
              key={`${view}-container`}
              custom={viewDirection}
              variants={viewSwitchVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={viewSwitchTransition}
            >
              <AnimatePresence mode="wait" custom={dateDirection}>
                <motion.div
                  key={dateKey_}
                  custom={dateDirection}
                  variants={dateSlideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={dateSlideTransition}
                >
                  {view === 'day' ? (
                    <DayView appointments={appointments} anchor={anchor} />
                  ) : (
                    <WeekView appointments={appointments} anchor={anchor} />
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}

export default OwnerCalendarPage;
