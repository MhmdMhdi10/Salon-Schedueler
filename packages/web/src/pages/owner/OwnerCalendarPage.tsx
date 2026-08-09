import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  CheckCircle2,
  CalendarClock,
  CalendarOff,
  Coffee,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Hourglass,
  ListFilter,
  MessageSquare,
  Phone,
  Search,
  User,
  Users,
  Scissors,
  X,
  XCircle,
  TriangleAlert,
} from 'lucide-react';
import {
  adminApi,
  approvalPolicyApi,
  bookingPolicyApi,
  emergencyScheduleApi,
  holidaysApi,
  staffAvailabilityApi,
  workingHoursApi,
  type SalonClosure,
  type SalonStaff,
  type CustomerProfileResponse,
  type WeeklyWorkingHour,
} from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useSalonId } from '../../auth/useSalonId';
import { gregorianToJalali, getJalaliMonthName } from '@salon/shared';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  ErrorState,
  Num,
  Skeleton,
  Select,
  TextField,
  toPersianDigits,
  cn,
} from '../../components/ui';
import { easings } from '../../lib/motion-variants';

// ─── Types ───────────────────────────────────────────────────────────────────

type CalendarView = 'day' | 'week' | 'month' | 'list';
type LoadStatus = 'loading' | 'success' | 'error';
type CalendarStatusFilter = 'all' | 'action' | 'confirmed' | 'completed';

interface Appointment {
  id: string;
  startAt?: string;
  endAt?: string;
  serviceName?: string;
  customerName?: string;
  customerId?: string;
  customerPhone?: string;
  staffMemberId?: string;
  staffName?: string;
  status?: string;
}

interface StaffCalendarBlock extends SalonClosure {
  staffId: string;
  staffName: string;
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
  haircut: 'border-s-primary',
  color: 'border-s-accent',
  makeup: 'border-s-secondary',
  nail: 'border-s-warning',
  facial: 'border-s-info',
  default: 'border-s-primary',
};

/** Derive a color class from a service name string. */
function serviceColorClass(serviceName?: string): string {
  if (!serviceName) return SERVICE_COLORS.default;
  const lower = serviceName.toLowerCase();
  if (lower.includes('کوتاه') || lower.includes('hair') || lower.includes('cut'))
    return SERVICE_COLORS.haircut;
  if (lower.includes('رنگ') || lower.includes('color')) return SERVICE_COLORS.color;
  if (lower.includes('میکاپ') || lower.includes('makeup') || lower.includes('آرایش'))
    return SERVICE_COLORS.makeup;
  if (lower.includes('ناخن') || lower.includes('nail')) return SERVICE_COLORS.nail;
  if (lower.includes('پوست') || lower.includes('facial')) return SERVICE_COLORS.facial;
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

/** Build a browser-local appointment start from calendar date + HH:mm inputs. */
function localDateTime(dateValue: string, timeValue: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue)) {
    return null;
  }
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hour, minute] = timeValue.split(':').map(Number);
  const result = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(result.getTime()) ? null : result;
}

function rescheduleErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'RESCHEDULE_CONFLICT':
      return 'این زمان با نوبت دیگری تداخل دارد. یک ساعت خالی انتخاب کن.';
    case 'RESCHEDULE_OUTSIDE_HOURS':
      return 'این زمان خارج ساعات کاری آرایشگر یا صندلی است.';
    case 'RESCHEDULE_CLOSED':
      return 'این روز یا این بازه زمانی بسته است.';
    case 'APPOINTMENT_NOT_MOVABLE':
      return 'این نوبت دیگر قابل جابه‌جایی نیست؛ تقویم را دوباره بررسی کن.';
    case 'APPOINTMENT_NOT_FOUND':
      return 'نوبت پیدا نشد؛ احتمالاً هم‌زمان از جای دیگری تغییر کرده است.';
    default:
      return 'تغییر زمان انجام نشد. دوباره تلاش کن.';
  }
}

/** Format a Jalali day display from a Date. */
function jalaliDayDisplay(date: Date): { jd: number; jm: number; jy: number } {
  return gregorianToJalali({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

/** Readable Persian date for a calendar appointment/profile history row. */
function jalaliDateLabel(value: string | Date | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const jalali = jalaliDayDisplay(date);
  return `${PERSIAN_WEEKDAYS[iranianDayIndex(date)]} ${jalali.jd} ${getJalaliMonthName(jalali.jm)} ${jalali.jy}`;
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
      customerId: str(rec.customerId),
      customerPhone: str(rec.customerPhone),
      staffMemberId: str(rec.staffMemberId),
      staffName: str(rec.staffName),
      status: str(rec.status),
    };
  }
  return { id: fallbackId };
}

/** Count customers, not appointment rows, for the salon's daily headcount. */
function customerCount(appointments: Appointment[]): number {
  return new Set(appointments.map((item) => item.customerId ?? item.id)).size;
}

function matchesCalendarFilters(
  appointment: Appointment,
  search: string,
  statusFilter: CalendarStatusFilter,
  staffFilter: string,
): boolean {
  const query = search.trim().toLocaleLowerCase('fa-IR');
  if (query) {
    const haystack = [
      appointment.customerName,
      appointment.customerPhone,
      appointment.serviceName,
      appointment.staffName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('fa-IR');
    if (!haystack.includes(query)) return false;
  }

  if (staffFilter !== 'all' && appointment.staffMemberId !== staffFilter) return false;

  if (statusFilter === 'action') {
    return ['pending', 'held'].includes(appointment.status ?? '');
  }
  if (statusFilter === 'confirmed') {
    return ['confirmed', 'approved'].includes(appointment.status ?? '');
  }
  if (statusFilter === 'completed') return appointment.status === 'completed';
  return true;
}

/** Compute fetch range based on view. */
function rangeFor(view: CalendarView, anchor: Date): { from: string; to: string } {
  if (view === 'day') {
    return { from: isoDate(anchor, 0), to: isoDate(anchor, 1) };
  }
  if (view === 'list') {
    // List view: next 30 days from anchor (inclusive)
    return { from: isoDate(anchor, 0), to: isoDate(anchor, 30) };
  }
  if (view === 'month') {
    // Fetch the whole visible month (gregorian) — pad a few days before/after in case
    // the Iranian-week grid extends past the gregorian month borders.
    const d = new Date(anchor);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return { from: dateKey(start), to: dateKey(end) };
  }
  // week
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
  onCancel?: (appointment: Appointment) => void;
  onSelect?: (appointment: Appointment) => void;
  onOpenMove?: (appointment: Appointment) => void;
  onDragStart?: (appointment: Appointment) => void;
  onDragEnd?: () => void;
  moving?: boolean;
  /** Height in pixels (for positioned day-view blocks). */
  height?: number;
  /** Top offset in pixels (for positioned day-view blocks). */
  top?: number;
  /** Render as absolute-positioned within a time cell. */
  positioned?: boolean;
}

/** Status icon + ARIA label for non-color status (Goal 14). */
function statusIndicator(status: string | undefined): {
  icon: React.ReactNode;
  label: string;
  ariaState: string;
} {
  switch (status) {
    case 'pending':
      return {
        icon: <Hourglass className="inline-block h-3 w-3 shrink-0" aria-hidden="true" />,
        label: 'در انتظار',
        ariaState: 'pending',
      };
    case 'cancelled':
    case 'rejected':
      return {
        icon: <XCircle className="inline-block h-3 w-3 shrink-0" aria-hidden="true" />,
        label: 'لغو شده',
        ariaState: 'cancelled',
      };
    case 'confirmed':
    case 'approved':
      return {
        icon: <CheckCircle2 className="inline-block h-3 w-3 shrink-0" aria-hidden="true" />,
        label: 'تأیید شده',
        ariaState: 'confirmed',
      };
    case 'completed':
      return {
        icon: <CheckCircle2 className="inline-block h-3 w-3 shrink-0" aria-hidden="true" />,
        label: 'انجام شده',
        ariaState: 'confirmed',
      };
    case 'no_show':
      return {
        icon: <XCircle className="inline-block h-3 w-3 shrink-0" aria-hidden="true" />,
        label: 'عدم حضور',
        ariaState: 'cancelled',
      };
    case 'expired':
      return {
        icon: <XCircle className="inline-block h-3 w-3 shrink-0" aria-hidden="true" />,
        label: 'منقضی شده',
        ariaState: 'cancelled',
      };
    default:
      return {
        icon: <CheckCircle2 className="inline-block h-3 w-3 shrink-0" aria-hidden="true" />,
        label: 'رزرو شده',
        ariaState: 'booked',
      };
  }
}

function AppointmentBlock({
  appt,
  onCancel,
  onSelect,
  onOpenMove,
  onDragStart,
  onDragEnd,
  moving = false,
  height,
  top,
  positioned = false,
}: AppointmentBlockProps) {
  const isPending = appt.status === 'pending';
  const isCancelled = ['cancelled', 'rejected', 'no_show', 'expired'].includes(appt.status ?? '');
  const colorClass = isPending
    ? 'border-s-warning'
    : isCancelled
      ? 'border-s-danger opacity-70'
      : serviceColorClass(appt.serviceName);
  const start = clockTime(appt.startAt);
  const end = clockTime(appt.endAt);
  const service = appt.serviceName ?? '—';
  const customer = appt.customerName;
  const { icon: statusIcon, label: statusLabel, ariaState } = statusIndicator(appt.status);
  const compact = positioned && (height ?? 0) < 70;
  const canCancel = ['pending', 'held', 'confirmed', 'approved'].includes(appt.status ?? '');
  const canMove = ['pending', 'held', 'confirmed'].includes(appt.status ?? '');
  const statusClass = isPending
    ? 'bg-warning/15 text-warning'
    : isCancelled
      ? 'bg-danger/10 text-danger'
      : 'bg-success/10 text-success';

  const positionStyle = positioned
    ? {
        position: 'absolute' as const,
        top: `${top}px`,
        height: `${height}px`,
        insetInlineStart: '7px',
        insetInlineEnd: '7px',
      }
    : undefined;

  return (
    <div
      className={cn(
        'flex flex-col justify-start gap-1 overflow-hidden rounded-lg border border-border border-s-4 bg-surface px-2.5 py-2 text-text shadow-1',
        'transition-all duration-fast ease-standard',
        'hover:-translate-y-px hover:border-primary/40 hover:shadow-2',
        colorClass,
        positioned ? 'absolute z-20' : '',
        onSelect ? 'cursor-pointer' : '',
        onDragStart && canMove ? 'cursor-grab active:cursor-grabbing' : '',
        moving ? 'opacity-60' : '',
      )}
      style={positionStyle}
      role={onSelect ? 'group' : 'article'}
      tabIndex={onSelect ? 0 : undefined}
      draggable={Boolean(onDragStart && canMove)}
      aria-label={`${service} — ${customer ?? ''} — ${statusLabel}`}
      aria-haspopup={onSelect ? 'dialog' : undefined}
      data-status={ariaState}
      onDragStart={
        onDragStart && canMove
          ? (event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', appt.id);
              onDragStart(appt);
            }
          : undefined
      }
      onDragEnd={onDragEnd}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect(appt);
            }
          : undefined
      }
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onSelect(appt);
              }
            }
          : undefined
      }
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Scissors className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        <strong className="min-w-0 flex-1 truncate text-xs leading-tight">{service}</strong>
        {start && (
          <span className="shrink-0 rounded-full bg-bg px-1.5 py-0.5 text-[0.62rem] tabular-nums text-muted">
            <Clock className="me-0.5 inline-block h-2.5 w-2.5" aria-hidden="true" />
            <Num value={start} />
            {end && !compact && (
              <>
                –<Num value={end} />
              </>
            )}
          </span>
        )}
        {compact && (canCancel || canMove) && (
          <span className="ms-auto flex shrink-0 items-center gap-0.5">
            {canMove && onOpenMove && (
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-md text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                aria-label={`تغییر زمان ${customer ?? service}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenMove(appt);
                }}
              >
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            {canCancel && onCancel && (
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-md text-danger hover:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                aria-label={`لغو نوبت ${customer ?? service}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onCancel(appt);
                }}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </span>
        )}
      </span>
      {customer && !compact && (
        <span className="truncate text-[0.68rem] leading-tight text-muted">
          <User className="inline-block h-2.5 w-2.5 shrink-0 opacity-60" aria-hidden="true" />{' '}
          {customer}
        </span>
      )}
      {/* Status indicator: icon + text label (non-color, Goal 14) */}
      {!compact && (
        <span className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium leading-tight',
              statusClass,
            )}
          >
            {statusIcon} {statusLabel}
          </span>
          <span className="flex items-center gap-1">
            {canMove && onOpenMove && (
              <button
                type="button"
                className="rounded-md px-1.5 py-1 text-[0.62rem] font-bold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                aria-label={`تغییر زمان ${customer ?? service}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenMove(appt);
                }}
              >
                تغییر زمان
              </button>
            )}
            {canCancel && onCancel && (
              <button
                type="button"
                className="rounded-md px-1.5 py-1 text-[0.62rem] font-bold text-danger hover:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                aria-label={`لغو نوبت ${customer ?? service}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onCancel(appt);
                }}
              >
                لغو نوبت
              </button>
            )}
          </span>
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

function DayView({
  appointments,
  anchor,
  closures,
  staffBlocks,
  onSelectSlot,
  onSelectAppointment,
  onCancel,
  onOpenMove,
  onMoveAppointment,
  onDragStart,
  onDragEnd,
  movingAppointmentId,
}: {
  appointments: Appointment[];
  anchor: Date;
  closures: SalonClosure[];
  staffBlocks: StaffCalendarBlock[];
  onSelectSlot: (date: Date, time: string) => void;
  onSelectAppointment: (appointment: Appointment) => void;
  onCancel: (appointment: Appointment) => void;
  onOpenMove: (appointment: Appointment) => void;
  onMoveAppointment: (appointment: Appointment, date: Date, time: string) => void;
  onDragStart: (appointment: Appointment) => void;
  onDragEnd: () => void;
  movingAppointmentId: string | null;
}) {
  const { t } = useTranslation();
  const gridRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
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
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isToday = anchorKey === dateKey(now);
  const nowInGrid = isToday && nowMinutes >= gridStartMin && nowMinutes <= 22 * 60;
  const nowTop = (nowMinutes - gridStartMin) * PX_PER_MIN;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!nowInGrid) return;
    const currentSlot = Math.max(
      0,
      Math.min(TIME_SLOTS.length - 1, Math.floor((nowMinutes - gridStartMin) / 30)),
    );
    rowRefs.current[currentSlot]?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [anchorKey, nowInGrid, nowMinutes, gridStartMin]);

  /** RTL vertical grid nav: ArrowUp/ArrowDown for time rows */
  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const current = focusedRow ?? 0;
      let next = current;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        next = Math.max(current - 1, 0);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        next = Math.min(current + 1, TIME_SLOTS.length - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        next = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        next = TIME_SLOTS.length - 1;
      } else {
        return;
      }

      setFocusedRow(next);
      rowRefs.current[next]?.focus();
    },
    [focusedRow],
  );

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, timeStr: string) => {
    event.preventDefault();
    const appointmentId = event.dataTransfer.getData('text/plain');
    const appointment = appointments.find((item) => item.id === appointmentId);
    setDragOverSlot(null);
    onDragEnd();
    if (appointment) onMoveAppointment(appointment, anchor, timeStr);
  };

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs text-muted">
        <CalendarClock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        نوبت را روی ساعت مقصد رها کن؛ روی موبایل از «تغییر زمان» استفاده کن.
        {nowInGrid && <span className="font-semibold text-primary">خط قرمز = ساعت فعلی</span>}
      </p>
      <div
        ref={gridRef}
        role="grid"
        aria-label={t('owner.calendar.dayGridLabel', { defaultValue: 'نمای روزانه' })}
        data-testid="owner-calendar-day"
        className="relative overflow-x-auto overflow-y-auto rounded-lg border border-border bg-surface"
        onKeyDown={handleGridKeyDown}
      >
      <div className="relative min-w-[20rem]">
        {/* Time rows */}
        {TIME_SLOTS.map((slot, idx) => {
          const timeStr = `${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}`;
          const isHour = slot.minute === 0;
          const isFocused = focusedRow === idx;
          const blocked = closures.some(
            (item) =>
              item.onDate === anchorKey &&
              (item.startTime === null ||
                (item.startTime <= timeStr && (item.endTime ?? '23:59') > timeStr)),
          );
          const absentStaff = staffBlocks.filter(
            (item) =>
              item.onDate === anchorKey &&
              (item.startTime === null ||
                (item.startTime <= timeStr && (item.endTime ?? '23:59') > timeStr)),
          );
          return (
            <div
              key={`slot-${idx}`}
              ref={(el) => {
                rowRefs.current[idx] = el;
              }}
              role="row"
              tabIndex={isFocused || (focusedRow === null && idx === 0) ? 0 : -1}
              aria-label={timeStr}
              onFocus={() => setFocusedRow(idx)}
              onClick={() => onSelectSlot(anchor, timeStr)}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes('text/plain')) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDragOverSlot(timeStr);
              }}
              onDragLeave={() => setDragOverSlot((current) => (current === timeStr ? null : current))}
              onDrop={(event) => handleDrop(event, timeStr)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectSlot(anchor, timeStr);
                }
              }}
              className={cn(
                'relative flex items-start border-b border-border/50',
                'transition-colors duration-fast ease-standard hover:bg-elevated/40',
                'cursor-pointer',
                blocked && 'bg-danger/10 hover:bg-danger/15',
                dragOverSlot === timeStr && 'bg-primary/15 ring-2 ring-inset ring-primary/50',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
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
              {blocked && (
                <span className="pointer-events-none absolute end-3 mt-2 rounded-full bg-danger/15 px-2 py-1 text-[0.65rem] font-bold text-danger">
                  بسته
                </span>
              )}
              {!blocked && absentStaff.length > 0 && (
                <span className="pointer-events-none absolute end-3 mt-2 max-w-[55%] truncate rounded-full bg-warning/15 px-2 py-1 text-[0.65rem] font-bold text-warning">
                  {absentStaff.map((item) => item.staffName).join('، ')} حضور ندارد
                </span>
              )}
            </div>
          );
        })}

        {/* Positioned appointment blocks */}
        <div className="pointer-events-none absolute inset-0" style={{ insetInlineStart: '4rem' }}>
          {dayAppts.map((appt) => {
            const startMin = minutesOf(appt.startAt);
            const endMin = minutesOf(appt.endAt);
            if (startMin === null) return null;
            const topPx = (startMin - gridStartMin) * PX_PER_MIN;
            const duration = endMin !== null ? endMin - startMin : 30;
            const heightPx = Math.max(duration * PX_PER_MIN, 24);
            if (topPx < 0) return null;
            return (
              <div
                key={appt.id}
                className="pointer-events-auto"
                onClick={(event) => event.stopPropagation()}
              >
                <AppointmentBlock
                  appt={appt}
                  positioned
                  top={topPx}
                  height={heightPx}
                  onSelect={onSelectAppointment}
                  onCancel={onCancel}
                  onOpenMove={onOpenMove}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  moving={movingAppointmentId === appt.id}
                />
              </div>
            );
          })}
        </div>
        {nowInGrid && (
          <div
            data-testid="owner-calendar-now-marker"
            aria-label="ساعت فعلی"
            className="pointer-events-none absolute z-30 flex items-center"
            style={{ top: `${nowTop}px`, insetInlineStart: '4rem', insetInlineEnd: '0' }}
          >
            <span className="-ms-1.5 h-3 w-3 rounded-full border-2 border-surface bg-danger shadow-1" />
            <span className="h-px flex-1 bg-danger" />
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// ─── Week View ───────────────────────────────────────────────────────────────

function WeekView({
  appointments,
  anchor,
  closures,
  staffBlocks,
  onSelectDate,
  onSelectAppointment,
  onCancel,
  onOpenMove,
}: {
  appointments: Appointment[];
  anchor: Date;
  closures: SalonClosure[];
  staffBlocks: StaffCalendarBlock[];
  onSelectDate: (date: Date) => void;
  onSelectAppointment: (appointment: Appointment) => void;
  onCancel: (appointment: Appointment) => void;
  onOpenMove: (appointment: Appointment) => void;
}) {
  const { t } = useTranslation();
  const weekStart = useMemo(() => startOfIranianWeek(anchor), [anchor]);
  const cellRefs = useRef<(HTMLElement | null)[]>([]);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

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

  /** RTL grid keyboard navigation: ArrowLeft = forward (next cell), ArrowRight = back */
  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const current = focusedIdx ?? 0;
      let next = current;

      if (e.key === 'ArrowLeft') {
        // RTL: Left = forward in reading order = next day
        e.preventDefault();
        next = Math.min(current + 1, 6);
      } else if (e.key === 'ArrowRight') {
        // RTL: Right = back in reading order = previous day
        e.preventDefault();
        next = Math.max(current - 1, 0);
      } else if (e.key === 'Home') {
        e.preventDefault();
        next = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        next = 6;
      } else {
        return;
      }

      setFocusedIdx(next);
      cellRefs.current[next]?.focus();
    },
    [focusedIdx],
  );

  return (
    <div
      role="grid"
      aria-label={t('owner.calendar.weekGridLabel', { defaultValue: 'نمای هفتگی' })}
      data-testid="owner-calendar-week"
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7"
      onKeyDown={handleGridKeyDown}
    >
      {days.map((day, idx) => {
        const isToday = day.iso === todayKey;
        const isFocused = focusedIdx === idx;
        const dayClosures = closures.filter((item) => item.onDate === day.iso);
        const dayStaffBlocks = staffBlocks.filter((item) => item.onDate === day.iso);
        return (
          <section
            key={day.iso}
            ref={(el) => {
              cellRefs.current[idx] = el;
            }}
            role="gridcell"
            tabIndex={isFocused || (focusedIdx === null && idx === 0) ? 0 : -1}
            aria-label={`${PERSIAN_WEEKDAYS[day.dayIndex]} ${day.jalali.jd}`}
            onFocus={() => setFocusedIdx(idx)}
            onClick={() => onSelectDate(day.date)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectDate(day.date);
              }
            }}
            className={cn(
              'flex min-h-0 flex-col gap-2 rounded-xl border p-2.5 sm:min-h-[10rem] sm:rounded-lg sm:p-3',
              'transition-colors duration-fast ease-standard hover:bg-elevated/30',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              isToday ? 'border-primary/60 bg-primary/5' : 'border-border bg-surface',
              dayClosures.some((item) => item.startTime === null) && 'border-danger/40 bg-danger/5',
            )}
          >
            {/* Day header */}
            <header className="flex items-center gap-2 border-b border-border/50 pb-2 sm:flex-col sm:gap-0.5">
              <span className="text-xs font-medium text-muted">
                {PERSIAN_WEEKDAYS[day.dayIndex]}
              </span>
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                  isToday ? 'bg-primary text-primary-contrast' : 'text-text',
                )}
              >
                <Num value={day.jalali.jd} />
              </span>
              <span className="ms-auto rounded-full bg-primary/10 px-2 py-0.5 text-[0.68rem] font-bold tabular-nums text-primary sm:ms-0">
                <Users className="me-1 inline-block h-3 w-3" aria-hidden="true" />
                <Num value={customerCount(day.items)} /> نفر
                <span className="ms-1 font-medium text-muted">
                  · <Num value={day.items.length} /> رزرو
                </span>
              </span>
            </header>

            {dayClosures.length > 0 && (
              <span className="rounded-md bg-danger/10 px-2 py-1 text-center text-[0.68rem] font-bold text-danger">
                {dayClosures.some((item) => item.startTime === null)
                  ? 'تعطیل کامل'
                  : `${toPersianDigits(String(dayClosures.length))} بازه بسته`}
              </span>
            )}
            {dayStaffBlocks.length > 0 && (
              <span className="rounded-md bg-warning/10 px-2 py-1 text-center text-[0.68rem] font-bold text-warning">
                {toPersianDigits(String(new Set(dayStaffBlocks.map((item) => item.staffId)).size))}{' '}
                آرایشگر محدودیت دارد
              </span>
            )}

            {/* Appointment list */}
            <div className="flex flex-1 flex-col gap-1.5 overflow-y-visible sm:overflow-y-auto">
              {day.items.length === 0 && (
                <p className="hidden py-4 text-center text-xs text-muted/50 sm:block">—</p>
              )}
              {day.items.map((appt) => (
                <div key={appt.id} onClick={(event) => event.stopPropagation()}>
                  <AppointmentBlock
                    appt={appt}
                    onSelect={onSelectAppointment}
                    onCancel={onCancel}
                    onOpenMove={onOpenMove}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ─── Month View ──────────────────────────────────────────────────────────────

/** Days in the gregorian month of `anchor`. */
function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function MonthView({
  appointments,
  anchor,
  closures,
  staffBlocks,
  onSelectDate,
  onSelectAppointment,
  onCancel,
  onOpenMove,
}: {
  appointments: Appointment[];
  anchor: Date;
  closures: SalonClosure[];
  staffBlocks: StaffCalendarBlock[];
  onSelectDate: (date: Date) => void;
  onSelectAppointment: (appointment: Appointment) => void;
  onCancel: (appointment: Appointment) => void;
  onOpenMove: (appointment: Appointment) => void;
}) {
  const { t } = useTranslation();
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const daysCount = daysInMonth(anchor);
  const firstOfMonth = new Date(year, month, 1);
  // Saturday-first Iranian week column for the 1st of the gregorian month
  const leadingOffset = iranianDayIndex(firstOfMonth);

  // Build cells: leading empties + month days
  const cells: (Date | null)[] = [];
  for (let i = 0; i < leadingOffset; i++) cells.push(null);
  for (let d = 1; d <= daysCount; d++) cells.push(new Date(year, month, d));
  // trailing empties to fill the last row
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = dateKey(new Date());

  return (
    <div
      role="grid"
      aria-label={t('owner.calendar.monthGridLabel', { defaultValue: 'نمای ماهانه' })}
      data-testid="owner-calendar-month"
      className="rounded-lg border border-border bg-surface"
    >
      {/* Weekday header row (Persian, Saturday-first) */}
      <div role="row" className="grid grid-cols-7 border-b border-border bg-bg/50">
        {PERSIAN_WEEKDAYS.map((wd) => (
          <div
            key={wd}
            role="columnheader"
            className="px-2 py-2 text-center text-xs font-semibold text-muted"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div role="rowgroup" className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          if (!cell) {
            return (
              <div
                key={`empty-${idx}`}
                role="gridcell"
                aria-hidden="true"
                className="min-h-[5rem] border-b border-e border-border/40 bg-bg/30"
              />
            );
          }
          const iso = dateKey(cell);
          const jalali = jalaliDayDisplay(cell);
          const dayAppts = appointments
            .filter((a) => a.startAt && localDateKey(a.startAt) === iso)
            .sort((a, b) => {
              const ta = a.startAt ? new Date(a.startAt).getTime() : 0;
              const tb = b.startAt ? new Date(b.startAt).getTime() : 0;
              return ta - tb;
            });
          const isToday = iso === todayKey;
          const dayClosures = closures.filter((item) => item.onDate === iso);
          const dayStaffBlocks = staffBlocks.filter((item) => item.onDate === iso);
          const peopleCount = customerCount(dayAppts);
          return (
            <div
              key={iso}
              role="gridcell"
              tabIndex={0}
              aria-label={`${PERSIAN_WEEKDAYS[iranianDayIndex(cell)]} ${jalali.jd}`}
              onClick={() => onSelectDate(cell)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectDate(cell);
                }
              }}
              className={cn(
                'flex min-h-[5rem] flex-col gap-1 border-b border-e border-border/40 p-1.5',
                'transition-colors duration-fast ease-standard hover:bg-elevated/30',
                isToday ? 'bg-primary/5' : 'bg-surface',
                dayClosures.some((item) => item.startTime === null) && 'bg-danger/10',
              )}
            >
              <div className="flex justify-end">
                <span
                  className={cn(
                    'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums',
                    isToday ? 'bg-primary text-primary-contrast' : 'text-text',
                  )}
                >
                  <Num value={jalali.jd} />
                </span>
              </div>
              <span className="flex items-center gap-1 text-[0.62rem] font-bold tabular-nums text-primary">
                <Users className="h-3 w-3" aria-hidden="true" />
                <Num value={peopleCount} /> نفر
              </span>
              {dayClosures.length > 0 && (
                <span className="truncate rounded bg-danger/10 px-1 py-0.5 text-[0.58rem] font-bold text-danger">
                  {dayClosures.some((item) => item.startTime === null) ? 'تعطیل' : 'محدودیت ساعت'}
                </span>
              )}
              {dayStaffBlocks.length > 0 && (
                <span className="truncate rounded bg-warning/10 px-1 py-0.5 text-[0.58rem] font-bold text-warning">
                  {toPersianDigits(
                    String(new Set(dayStaffBlocks.map((item) => item.staffId)).size),
                  )}{' '}
                  عدم حضور
                </span>
              )}
              <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                {dayAppts.slice(0, 3).map((appt) => (
                  <div key={appt.id} onClick={(event) => event.stopPropagation()}>
                    <AppointmentBlock
                      appt={appt}
                      onSelect={onSelectAppointment}
                      onCancel={onCancel}
                      onOpenMove={onOpenMove}
                    />
                  </div>
                ))}
                {dayAppts.length > 3 && (
                  <span className="text-[0.6rem] text-muted">
                    +<Num value={dayAppts.length - 3} />{' '}
                    {t('owner.calendar.more', { defaultValue: 'بیشتر' })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── List View (agenda) ──────────────────────────────────────────────────────

function ListView({
  appointments,
  anchor,
  onSelectAppointment,
  onCancel,
  onOpenMove,
}: {
  appointments: Appointment[];
  anchor: Date;
  onSelectAppointment: (appointment: Appointment) => void;
  onCancel: (appointment: Appointment) => void;
  onOpenMove: (appointment: Appointment) => void;
}) {
  const { t } = useTranslation();

  // Group appointments by their local date, sorted ascending
  const grouped = useMemo(() => {
    const anchorKey = dateKey(anchor);
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      if (!a.startAt) continue;
      const key = localDateKey(a.startAt);
      if (!key) continue;
      // Only show items from anchor onwards
      if (key < anchorKey) continue;
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    // Sort each day's items by time
    for (const list of map.values()) {
      list.sort((a, b) => {
        const ta = a.startAt ? new Date(a.startAt).getTime() : 0;
        const tb = b.startAt ? new Date(b.startAt).getTime() : 0;
        return ta - tb;
      });
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [appointments, anchor]);

  if (grouped.length === 0) {
    return (
      <div
        data-testid="owner-calendar-list-empty"
        className="rounded-lg border border-border bg-surface p-8 text-center"
      >
        <p className="text-sm text-muted">
          {t('owner.calendar.listEmpty', { defaultValue: 'هیچ نوبتی در ۳۰ روز آینده وجود ندارد.' })}
        </p>
      </div>
    );
  }

  return (
    <ol
      role="list"
      aria-label={t('owner.calendar.listGridLabel', { defaultValue: 'نمای فهرستی' })}
      data-testid="owner-calendar-list"
      className="flex flex-col gap-3"
    >
      {grouped.map(([dayKey, items]) => {
        const d = new Date(dayKey + 'T00:00:00');
        const jalali = jalaliDayDisplay(d);
        const dayIdx = iranianDayIndex(d);
        const isToday = dayKey === dateKey(new Date());
        return (
          <li key={dayKey} className="rounded-lg border border-border bg-surface p-3">
            <header className="mb-2 flex items-center gap-2 border-b border-border/50 pb-2">
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                  isToday ? 'bg-primary text-primary-contrast' : 'bg-bg text-text',
                )}
              >
                <Num value={jalali.jd} />
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-text">{PERSIAN_WEEKDAYS[dayIdx]}</span>
                <span className="text-xs text-muted">
                  {getJalaliMonthName(jalali.jm)} <Num value={jalali.jy} />
                </span>
              </div>
            </header>
            <ul className="flex flex-col gap-1.5">
              {items.map((appt) => (
                <li key={appt.id}>
                  <AppointmentBlock
                    appt={appt}
                    onSelect={onSelectAppointment}
                    onCancel={onCancel}
                    onOpenMove={onOpenMove}
                  />
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Direct availability editor ─────────────────────────────────────────────

function addThirtyMinutes(value: string): string {
  const [hour, minute] = value.split(':').map(Number);
  const total = Math.min(hour * 60 + minute + 30, 22 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const IRANIAN_WEEKDAY_NUMBERS = [6, 0, 1, 2, 3, 4, 5] as const;

const TIME_WHEEL_ITEM_HEIGHT = 44;

function setTimeWheelPosition(element: HTMLDivElement | null, index: number, smooth = false) {
  if (!element) return;
  const top = index * TIME_WHEEL_ITEM_HEIGHT;
  if (typeof element.scrollTo === 'function') {
    element.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  } else {
    element.scrollTop = top;
  }
}

function TimeWheelField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(Number(value.split(':')[0] ?? 0));
  const [minute, setMinute] = useState(Number(value.split(':')[1] ?? 0));
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => index), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, index) => index), []);

  useEffect(() => {
    if (!open) return;
    const nextHour = Number(value.split(':')[0] ?? 0);
    const nextMinute = Number(value.split(':')[1] ?? 0);
    setHour(nextHour);
    setMinute(nextMinute);
    requestAnimationFrame(() => {
      setTimeWheelPosition(hourRef.current, nextHour);
      setTimeWheelPosition(minuteRef.current, nextMinute);
    });
  }, [open, value]);

  const wheel = (
    values: number[],
    selected: number,
    setSelected: (value: number) => void,
    ref: React.RefObject<HTMLDivElement>,
    ariaLabel: string,
  ) => (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-bg shadow-inner">
      <div className="pointer-events-none absolute inset-x-2 top-1/2 z-10 h-11 -translate-y-1/2 rounded-xl border border-primary/40 bg-primary/15 shadow-[0_0_24px_rgb(var(--color-primary-rgb)/0.12)]" />
      <div
        ref={ref}
        role="listbox"
        aria-label={ariaLabel}
        className="h-[220px] snap-y snap-mandatory overflow-y-auto overscroll-contain py-[88px] [mask-image:linear-gradient(to_bottom,transparent,black_25%,black_75%,transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          const index = Math.max(
            0,
            Math.min(
              values.length - 1,
              Math.round(event.currentTarget.scrollTop / TIME_WHEEL_ITEM_HEIGHT),
            ),
          );
          setSelected(values[index]);
        }}
      >
        {values.map((item) => (
          <button
            type="button"
            role="option"
            aria-selected={selected === item}
            aria-label={String(item).padStart(2, '0')}
            key={item}
            className={cn(
              'relative z-20 flex h-11 w-full snap-center items-center justify-center text-xl tabular-nums transition-all',
              selected === item ? 'scale-110 font-black text-text' : 'scale-90 text-muted/45',
            )}
            onClick={() => {
              setSelected(item);
              setTimeWheelPosition(ref.current, item, true);
            }}
          >
            <Num value={String(item).padStart(2, '0')} />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted">
        {label}
        <button
          type="button"
          dir="ltr"
          aria-label={`${label} ${value}`}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg px-3 text-base font-black tabular-nums text-text shadow-sm transition hover:border-primary/60 hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          onClick={() => setOpen(true)}
        >
          <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
          <Num value={value} />
        </button>
      </label>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!w-[min(400px,calc(100vw-24px))] !max-w-none overflow-hidden rounded-2xl p-6">
          <DialogTitle className="text-center text-xl">{label}</DialogTitle>
          <DialogDescription className="text-center">
            برای انتخاب، ساعت و دقیقه را بالا یا پایین بکش.
          </DialogDescription>
          <div
            className="relative mx-auto mt-5 grid max-w-[19rem] grid-cols-[1fr_auto_1fr] items-center gap-3"
            dir="ltr"
          >
            {wheel(hours, hour, setHour, hourRef, 'ساعت')}
            <span className="text-2xl font-black text-muted">:</span>
            {wheel(minutes, minute, setMinute, minuteRef, 'دقیقه')}
          </div>
          <div className="mt-5 flex justify-center gap-2">
            <DialogClose asChild>
              <Button variant="ghost">انصراف</Button>
            </DialogClose>
            <Button
              variant="primary"
              onClick={() => {
                onChange(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
                setOpen(false);
              }}
            >
              تأیید ساعت
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ScheduleSwitch({
  checked,
  onChange,
  onLabel = 'باز',
  offLabel = 'تعطیل',
  ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  onLabel?: string;
  offLabel?: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        'group inline-flex min-h-11 min-w-[6.5rem] items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-sm font-black transition-all duration-200',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        checked
          ? 'border-success/35 bg-success/10 text-success shadow-[0_5px_18px_rgba(16,185,129,0.10)]'
          : 'border-border bg-bg text-muted hover:border-danger/30 hover:bg-danger/5',
      )}
    >
      <span>{checked ? onLabel : offLabel}</span>
      <span
        aria-hidden="true"
        className={cn(
          'relative h-6 w-11 shrink-0 overflow-hidden rounded-full border transition-colors duration-200',
          checked ? 'border-success/30 bg-success' : 'border-border bg-border',
        )}
      >
        <span
          className={cn(
            'absolute start-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200',
            checked && '-translate-x-5',
          )}
        />
      </span>
    </button>
  );
}

function WeeklyScheduleDialog({
  salonId,
  staff,
  open,
  onOpenChange,
}: {
  salonId: string;
  staff: SalonStaff[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [target, setTarget] = useState('salon');
  const [hours, setHours] = useState<WeeklyWorkingHour[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [bookingWindowDays, setBookingWindowDays] = useState(14);
  const [breakEnabled, setBreakEnabled] = useState(false);
  const [breakStart, setBreakStart] = useState('13:00');
  const [breakEnd, setBreakEnd] = useState('14:00');

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError('');
    const request =
      target === 'salon'
        ? workingHoursApi.getSalon(salonId)
        : workingHoursApi.getStaff(salonId, target);
    Promise.all([request, bookingPolicyApi.get(salonId).catch(() => ({ bookingWindowDays: 14 }))])
      .then(([res, policy]) => {
        if (!active) return;
        setHours(res.hours);
        setBookingWindowDays(policy.bookingWindowDays);
        const grouped = new Map<number, WeeklyWorkingHour[]>();
        for (const row of res.hours) {
          grouped.set(row.weekday, [...(grouped.get(row.weekday) ?? []), row]);
        }
        const split = [...grouped.values()]
          .map((rows) => [...rows].sort((a, b) => a.startTime.localeCompare(b.startTime)))
          .find((rows) => rows.length > 1);
        setBreakEnabled(Boolean(split));
        if (split) {
          setBreakStart(split[0].endTime);
          setBreakEnd(split[1].startTime);
        }
      })
      .catch(() => {
        if (active) setError('ساعت‌های کاری بارگذاری نشد.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, salonId, target]);

  const rowFor = (weekday: number): WeeklyWorkingHour | undefined => {
    const rows = hours
      .filter((item) => item.weekday === weekday)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (rows.length === 0) return undefined;
    return { weekday, startTime: rows[0].startTime, endTime: rows[rows.length - 1].endTime };
  };
  const setDay = (weekday: number, patch: Partial<WeeklyWorkingHour> | null) => {
    setHours((current) => {
      const rest = current.filter((item) => item.weekday !== weekday);
      if (patch === null) return rest;
      const rows = current
        .filter((item) => item.weekday === weekday)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      const existing = rows.length
        ? { startTime: rows[0].startTime, endTime: rows[rows.length - 1].endTime }
        : undefined;
      return [
        ...rest,
        {
          weekday,
          startTime: patch.startTime ?? existing?.startTime ?? '09:00',
          endTime: patch.endTime ?? existing?.endTime ?? '20:00',
        },
      ];
    });
  };

  const applyThursdayFridayOff = () => {
    setHours((current) => current.filter((item) => item.weekday !== 4 && item.weekday !== 5));
  };

  const copyFirstOpenDay = () => {
    const source = IRANIAN_WEEKDAY_NUMBERS.map(rowFor).find(Boolean);
    if (!source) return;
    setHours(
      IRANIAN_WEEKDAY_NUMBERS.map((weekday) => ({
        weekday,
        startTime: source.startTime,
        endTime: source.endTime,
      })),
    );
  };

  const save = async () => {
    const baseHours = IRANIAN_WEEKDAY_NUMBERS.map(rowFor).filter(
      (item): item is WeeklyWorkingHour => Boolean(item),
    );
    if (baseHours.some((item) => item.startTime >= item.endTime)) {
      setError('ساعت پایان هر روز باید بعد از ساعت شروع باشد.');
      return;
    }
    if (
      breakEnabled &&
      (breakStart >= breakEnd ||
        baseHours.some((item) => breakStart <= item.startTime || breakEnd >= item.endTime))
    ) {
      setError('زمان استراحت باید داخل ساعت کاری همه روزهای باز باشد.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const ordered = baseHours
        .flatMap((item) =>
          breakEnabled
            ? [
                { ...item, endTime: breakStart },
                { ...item, startTime: breakEnd },
              ]
            : [item],
        )
        .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
      if (target === 'salon') await workingHoursApi.setSalon(salonId, ordered);
      else await workingHoursApi.setStaff(salonId, target, ordered);
      await bookingPolicyApi.set(salonId, bookingWindowDays);
      onOpenChange(false);
    } catch {
      setError('ذخیره برنامه کاری انجام نشد. دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="!h-fit !max-h-[94dvh] !w-[min(960px,calc(100vw-24px))] !max-w-none !overflow-hidden rounded-2xl p-0">
        <header className="relative overflow-hidden border-b border-border bg-gradient-to-l from-primary/20 via-primary/10 to-transparent px-6 py-6 pe-14 sm:px-8">
          <div
            className="absolute -start-12 -top-20 h-44 w-44 rounded-full bg-primary/15 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-contrast shadow-2">
              <CalendarClock className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <span className="mb-1 block text-xs font-bold text-primary">تنظیمات تقویم سالن</span>
              <DialogTitle className="text-2xl font-black sm:text-3xl">
                برنامه کاری هفتگی
              </DialogTitle>
              <DialogDescription className="max-w-2xl leading-6">
                روزهای کاری، ساعت فعالیت، استراحت و محدوده رزرو مشتری را از یک‌جا تنظیم کن.
              </DialogDescription>
            </div>
          </div>
        </header>
        <div className="max-h-[calc(94dvh-12rem)] overflow-y-auto p-4 [scrollbar-width:none] sm:p-6 [&::-webkit-scrollbar]:hidden">
          <div className="flex flex-col gap-5">
            <section
              aria-label="تنظیمات اصلی"
              className="grid gap-4 rounded-2xl border border-border bg-surface p-4 shadow-1 min-[520px]:grid-cols-2 sm:p-5"
            >
              <Select
                label="برنامه برای"
                value={target}
                onValueChange={setTarget}
                options={[
                  { value: 'salon', label: 'کل سالن و همه آرایشگرها' },
                  ...staff
                    .filter((item) => item.active && item.role !== 'Admin')
                    .map((item) => ({
                      value: item.id,
                      label: item.fullName || 'آرایشگر بدون نام',
                    })),
                ]}
              />
              <Select
                label="مشتری تا چه زمانی بتواند رزرو کند؟"
                value={String(bookingWindowDays)}
                onValueChange={(value) => setBookingWindowDays(Number(value))}
                options={[
                  { value: '0', label: 'فقط امروز' },
                  { value: '1', label: 'امروز و فردا' },
                  { value: '7', label: 'تا ۷ روز آینده' },
                  { value: '14', label: 'تا ۱۴ روز آینده' },
                  { value: '30', label: 'تا ۳۰ روز آینده' },
                  { value: '60', label: 'تا ۶۰ روز آینده' },
                ]}
                helperText="روزهای دورتر در صفحه رزرو نمایش داده نمی‌شوند."
              />
            </section>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" size="md" variant="secondary" onClick={copyFirstOpenDay}>
                همین ساعت برای همه روزها
              </Button>
              <Button type="button" size="md" variant="secondary" onClick={applyThursdayFridayOff}>
                پنجشنبه و جمعه تعطیل
              </Button>
            </div>
            <section
              className={cn(
                'rounded-2xl border p-4 transition-colors sm:p-5',
                breakEnabled ? 'border-warning/40 bg-warning/5' : 'border-border bg-surface',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/15 text-warning">
                    <Coffee className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <strong className="block text-sm text-text">زمان استراحت تکرارشونده</strong>
                    <p className="mt-1 text-xs text-muted">
                      مثلاً هر روز زمان ناهار رزرو جدید گرفته نشود.
                    </p>
                  </div>
                </div>
                <ScheduleSwitch
                  checked={breakEnabled}
                  onChange={setBreakEnabled}
                  onLabel="فعال"
                  offLabel="خاموش"
                  ariaLabel="زمان استراحت تکرارشونده"
                />
              </div>
              {breakEnabled && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <TimeWheelField
                    label="شروع استراحت"
                    value={breakStart}
                    onChange={setBreakStart}
                  />
                  <TimeWheelField label="پایان استراحت" value={breakEnd} onChange={setBreakEnd} />
                </div>
              )}
            </section>
            {loading ? (
              <Skeleton variant="rect" className="h-72 rounded-lg" />
            ) : (
              <section
                aria-label="روزهای هفته"
                className="overflow-hidden rounded-2xl border border-border bg-surface shadow-1"
              >
                <header className="flex items-center justify-between border-b border-border bg-bg/60 px-4 py-3 sm:px-5">
                  <strong className="text-sm text-text">ساعت فعالیت روزها</strong>
                  <span className="text-xs text-muted">برای تغییر روی ساعت بزن</span>
                </header>
                {IRANIAN_WEEKDAY_NUMBERS.map((weekday, index) => {
                  const row = rowFor(weekday);
                  return (
                    <div
                      key={weekday}
                      className={cn(
                        'grid grid-cols-[minmax(90px,1fr)_auto] items-center gap-3 border-b border-border/70 p-4 transition-colors last:border-b-0 sm:grid-cols-[120px_90px_1fr_1fr] sm:px-5',
                        row ? 'bg-surface' : 'bg-bg/50 opacity-70',
                      )}
                    >
                      <strong className="text-sm text-text">{PERSIAN_WEEKDAYS[index]}</strong>
                      <ScheduleSwitch
                        checked={Boolean(row)}
                        onChange={(checked) => setDay(weekday, checked ? {} : null)}
                        ariaLabel={`${PERSIAN_WEEKDAYS[index]} ${row ? 'باز' : 'تعطیل'}`}
                      />
                      {row && (
                        <>
                          <TimeWheelField
                            label="شروع"
                            value={row.startTime}
                            onChange={(value) => setDay(weekday, { startTime: value })}
                          />
                          <TimeWheelField
                            label="پایان"
                            value={row.endTime}
                            onChange={(value) => setDay(weekday, { endTime: value })}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </section>
            )}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-border bg-elevated/95 px-4 py-4 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur sm:px-6">
          <span className="hidden text-xs text-muted sm:block">
            تغییرات بعد از ذخیره روی رزرو مشتری اعمال می‌شوند.
          </span>
          <div className="ms-auto flex gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={saving}>
                انصراف
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="primary"
              loading={saving}
              disabled={saving || loading}
              onClick={() => void save()}
            >
              ذخیره برنامه هفتگی
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function AvailabilityDialog({
  salonId,
  date,
  initialStart,
  closures,
  staff,
  open,
  onOpenChange,
  onChanged,
}: {
  salonId: string;
  date: Date;
  initialStart?: string;
  closures: SalonClosure[];
  staff: SalonStaff[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'full' | 'range'>(initialStart ? 'range' : 'full');
  const [start, setStart] = useState(initialStart ?? '09:00');
  const [end, setEnd] = useState(initialStart ? addThirtyMinutes(initialStart) : '10:00');
  const [target, setTarget] = useState('salon');
  const [staffBlocks, setStaffBlocks] = useState<SalonClosure[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedKey = dateKey(date);
  const activeBlocks = target === 'salon' ? closures : staffBlocks;
  const dayClosures = activeBlocks.filter((item) => item.onDate === selectedKey);
  const jalali = jalaliDayDisplay(date);

  useEffect(() => {
    if (!open) return;
    setMode(initialStart ? 'range' : 'full');
    setStart(initialStart ?? '09:00');
    setEnd(initialStart ? addThirtyMinutes(initialStart) : '10:00');
    setTarget('salon');
    setError('');
  }, [open, initialStart, selectedKey]);

  useEffect(() => {
    if (!open || target === 'salon') return;
    let active = true;
    setBlocksLoading(true);
    staffAvailabilityApi
      .list(target)
      .then((res) => {
        if (active) setStaffBlocks(res.blocks);
      })
      .catch(() => {
        if (active) setError('برنامه این آرایشگر بارگذاری نشد.');
      })
      .finally(() => {
        if (active) setBlocksLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, target]);

  const addClosure = async () => {
    if (mode === 'range' && (!start || !end || start >= end)) {
      setError('ساعت پایان باید بعد از ساعت شروع باشد.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const input = {
        onDate: selectedKey,
        startTime: mode === 'range' ? start : null,
        endTime: mode === 'range' ? end : null,
      };
      if (target === 'salon') {
        await holidaysApi.add(salonId, input);
        onChanged();
      } else {
        const res = await staffAvailabilityApi.add(target, input);
        setStaffBlocks((current) => [...current, ...(res.blocks ?? [res.block])]);
        onChanged();
      }
      onOpenChange(false);
    } catch {
      setError('ذخیره محدودیت انجام نشد. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  };

  const removeClosure = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      if (target === 'salon') {
        await holidaysApi.remove(salonId, id);
        onChanged();
      } else {
        await staffAvailabilityApi.remove(target, id);
        setStaffBlocks((current) => current.filter((item) => item.id !== id));
        onChanged();
      }
    } catch {
      setError('باز کردن این زمان انجام نشد. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogTitle>برنامه حضور این روز</DialogTitle>
        <DialogDescription>
          {PERSIAN_WEEKDAYS[iranianDayIndex(date)]}، {toPersianDigits(String(jalali.jd))}{' '}
          {getJalaliMonthName(jalali.jm)} — ساعت‌های معمول سالن باز می‌مانند؛ فقط تعطیلی‌ها را مشخص
          کن.
        </DialogDescription>

        <div className="mt-4">
          <Select
            label="این محدودیت برای"
            value={target}
            onValueChange={(value) => {
              setTarget(value);
              setError('');
            }}
            options={[
              { value: 'salon', label: 'کل سالن' },
              ...staff
                .filter((item) => item.active && item.role !== 'Admin')
                .map((item) => ({ value: item.id, label: item.fullName || 'آرایشگر بدون نام' })),
            ]}
            helperText={
              target === 'salon'
                ? 'در این زمان هیچ آرایشگری نوبت نمی‌گیرد.'
                : 'فقط همین آرایشگر از رزرو خارج می‌شود و سالن باز می‌ماند.'
            }
          />
        </div>

        {!blocksLoading && dayClosures.length > 0 && (
          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border bg-bg p-3">
            <strong className="text-sm text-text">محدودیت‌های همین روز</strong>
            {dayClosures.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2"
              >
                <span className="text-sm text-text">
                  {item.startTime === null ? 'تعطیل کامل' : `${item.startTime} تا ${item.endTime}`}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  disabled={busy}
                  onClick={() => void removeClosure(item.id)}
                >
                  باز کردن دوباره
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="نوع محدودیت">
          <button
            type="button"
            aria-pressed={mode === 'full'}
            onClick={() => setMode('full')}
            className={cn(
              'min-h-12 rounded-md border px-3 text-sm font-bold',
              mode === 'full'
                ? 'border-danger bg-danger/10 text-danger'
                : 'border-border bg-surface text-text',
            )}
          >
            {target === 'salon' ? 'کل سالن تعطیل' : 'کل روز حضور ندارد'}
          </button>
          <button
            type="button"
            aria-pressed={mode === 'range'}
            onClick={() => setMode('range')}
            className={cn(
              'min-h-12 rounded-md border px-3 text-sm font-bold',
              mode === 'range'
                ? 'border-warning bg-warning/10 text-warning'
                : 'border-border bg-surface text-text',
            )}
          >
            {target === 'salon' ? 'بستن یک بازه سالن' : 'فقط یک بازه حضور ندارد'}
          </button>
        </div>

        {mode === 'range' && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <TimeWheelField label="از ساعت" value={start} onChange={setStart} />
            <TimeWheelField label="تا ساعت" value={end} onChange={setEnd} />
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={busy}>
              انصراف
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="primary"
            loading={busy}
            disabled={busy}
            onClick={() => void addClosure()}
          >
            اعمال در تقویم
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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

  if (view === 'month') {
    return (
      <div
        data-testid="owner-calendar-loading"
        role="status"
        aria-busy="true"
        aria-label={t('owner.calendar.loading', { defaultValue: 'در حال بارگذاری...' })}
        className="rounded-lg border border-border bg-surface"
      >
        <div className="grid grid-cols-7 border-b border-border bg-bg/50">
          {PERSIAN_WEEKDAYS.map((wd) => (
            <div key={wd} className="px-2 py-2 text-center text-xs font-semibold text-muted">
              {wd}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[5rem] flex-col gap-1 border-b border-e border-border/40 p-1.5"
            >
              <div className="flex justify-end">
                <Skeleton variant="text" className="h-6 w-6 rounded-full" />
              </div>
              {i % 4 === 0 && <Skeleton variant="rect" className="h-5 rounded-md" />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'list') {
    return (
      <div
        data-testid="owner-calendar-loading"
        role="status"
        aria-busy="true"
        aria-label={t('owner.calendar.loading', { defaultValue: 'در حال بارگذاری...' })}
        className="flex flex-col gap-3"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-3">
            <Skeleton variant="text" className="mb-2 h-6 w-32" />
            <Skeleton variant="rect" className="h-12 rounded-md" />
            <Skeleton variant="rect" className="mt-1.5 h-10 rounded-md" />
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
        <div key={i} className="flex h-[60px] border-b border-border/50">
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

  const tabs: { key: CalendarView; label: string; shortcut: string }[] = [
    { key: 'day', label: t('owner.calendar.dayTab', { defaultValue: 'روز' }), shortcut: 'd' },
    { key: 'week', label: t('owner.calendar.weekTab', { defaultValue: 'هفته' }), shortcut: 'w' },
    { key: 'month', label: t('owner.calendar.monthTab', { defaultValue: 'ماه' }), shortcut: 'm' },
    { key: 'list', label: t('owner.calendar.listTab', { defaultValue: 'فهرست' }), shortcut: 'l' },
  ];

  return (
    <div
      role="tablist"
      aria-label={t('owner.calendar.viewToggle', { defaultValue: 'تغییر نما' })}
      className="grid w-full grid-cols-4 rounded-xl border border-border bg-bg p-1 sm:inline-flex sm:w-auto sm:rounded-lg"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={view === tab.key}
          aria-keyshortcuts={tab.shortcut}
          className={cn(
            'relative min-h-10 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors duration-fast ease-standard sm:min-h-0 sm:rounded-md sm:px-4 sm:text-sm',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            view === tab.key
              ? 'bg-primary text-primary-contrast shadow-1'
              : 'text-muted hover:text-text hover:bg-elevated/50',
          )}
          onClick={() => onViewChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
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
    if (view === 'month') {
      // Month: a gregorian month spans parts of two jalali months — show the jalali
      // month the anchor day sits in, plus the gregorian year for clarity.
      return `${getJalaliMonthName(jalali.jm)} ${jalali.jy}`;
    }
    if (view === 'list') {
      return `${getJalaliMonthName(jalali.jm)} ${jalali.jd}`;
    }
    // Week: show month + year
    return `${getJalaliMonthName(jalali.jm)} ${jalali.jy}`;
  }, [view, anchor, jalali]);

  return (
    <nav
      aria-label={t('owner.calendar.dateNav', { defaultValue: 'ناوبری تاریخ' })}
      className="col-span-2 flex w-full items-center justify-between gap-1 rounded-xl border border-border bg-bg p-1 sm:w-auto sm:border-0 sm:bg-transparent sm:p-0"
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

      <span className="min-w-0 flex-1 text-center text-sm font-medium tabular-nums text-text sm:min-w-[8rem] sm:flex-none">
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

      <Button variant="ghost" size="md" onClick={() => onNavigate(0)} className="ms-1">
        {t('owner.calendar.today', { defaultValue: 'امروز' })}
      </Button>
    </nav>
  );
}

// ─── Calendar filters + next action ─────────────────────────────────────────

function CalendarFilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  staffFilter,
  onStaffFilterChange,
  staff,
  totalCount,
  visibleCount,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: CalendarStatusFilter;
  onStatusFilterChange: (value: CalendarStatusFilter) => void;
  staffFilter: string;
  onStaffFilterChange: (value: string) => void;
  staff: SalonStaff[];
  totalCount: number;
  visibleCount: number;
}) {
  const filters: { value: CalendarStatusFilter; label: string }[] = [
    { value: 'all', label: 'همه' },
    { value: 'action', label: 'نیاز به اقدام' },
    { value: 'confirmed', label: 'قطعی' },
    { value: 'completed', label: 'انجام‌شده' },
  ];

  return (
    <section
      aria-label="فیلتر تقویم"
      className="rounded-2xl border border-border bg-surface p-3 shadow-1 sm:p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute end-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <TextField
            label="جست‌وجوی رزرو"
            labelHidden
            type="search"
            value={search}
            placeholder="نام مشتری، خدمت، آرایشگر یا شماره…"
            autoComplete="off"
            onChange={(event) => onSearchChange(event.target.value)}
            className="pe-10"
          />
        </div>

        {staff.length > 0 && (
          <Select
            label="آرایشگر"
            labelHidden
            value={staffFilter}
            onValueChange={onStaffFilterChange}
            options={[
              { value: 'all', label: 'همه آرایشگرها' },
              ...staff
                .filter((item) => item.active && item.role !== 'Admin')
                .map((item) => ({
                  value: item.id,
                  label: item.fullName || 'آرایشگر بدون نام',
                })),
            ]}
            containerClassName="w-full lg:w-52"
          />
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5"
          role="group"
          aria-label="فیلتر وضعیت رزرو"
        >
          <ListFilter className="me-1 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          {filters.map((filter) => {
            const active = statusFilter === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                aria-pressed={active}
                onClick={() => onStatusFilterChange(filter.value)}
                className={cn(
                  'min-h-10 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-bg text-muted hover:border-primary/40 hover:text-text',
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
        <p className="shrink-0 text-xs text-muted">
          {visibleCount === totalCount ? (
            <>
              <Num value={totalCount} /> رزرو در این بازه
            </>
          ) : (
            <>
              نمایش <Num value={visibleCount} /> از <Num value={totalCount} /> رزرو
            </>
          )}
        </p>
      </div>
    </section>
  );
}

function NextAppointmentCard({
  appointments,
  anchor,
  onSelectAppointment,
  onOpenMove,
}: {
  appointments: Appointment[];
  anchor: Date;
  onSelectAppointment: (appointment: Appointment) => void;
  onOpenMove: (appointment: Appointment) => void;
}) {
  const dayKey = dateKey(anchor);
  const todayKey = dateKey(new Date());
  const next = useMemo(() => {
    const now = Date.now();
    return appointments
      .filter((item) => {
        if (!item.startAt || localDateKey(item.startAt) !== dayKey) return false;
        if (['cancelled', 'rejected', 'no_show', 'expired', 'completed'].includes(item.status ?? '')) {
          return false;
        }
        return dayKey === todayKey ? new Date(item.startAt).getTime() >= now : true;
      })
      .sort((a, b) => new Date(a.startAt ?? 0).getTime() - new Date(b.startAt ?? 0).getTime())[0];
  }, [appointments, dayKey, todayKey]);

  if (!next) {
    return (
      <section
        aria-label="نوبت بعدی"
        className="flex min-h-full flex-col justify-center rounded-xl border border-dashed border-border bg-bg/40 p-3"
      >
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <div>
            <strong className="block text-sm text-text">نوبت بعدی ثبت نشده</strong>
            <span className="mt-1 block text-xs leading-6 text-muted">
              برای این روز برنامه باز یا نوبت در پیش رو وجود ندارد.
            </span>
          </div>
        </div>
      </section>
    );
  }

  const phone = next.customerPhone;
  const customerLabel = next.customerName ?? 'مشتری بدون نام';

  return (
    <section
      aria-label="نوبت بعدی"
      className="rounded-xl border border-primary/25 bg-primary/5 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-primary">
          {dayKey === todayKey ? 'نوبت بعدی' : 'اولین نوبت این روز'}
        </p>
        <span className="rounded-full bg-surface px-2 py-1 text-xs font-bold tabular-nums text-text">
          <Clock className="me-1 inline-block h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <Num value={clockTime(next.startAt) ?? '—'} />
        </span>
      </div>
      <button
        type="button"
        className="mt-3 flex w-full items-start gap-2 rounded-lg text-start transition-colors hover:bg-surface/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        onClick={() => onSelectAppointment(next)}
        aria-label={`جزئیات ${customerLabel}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <User className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-sm text-text">{customerLabel}</strong>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {next.serviceName ?? 'خدمت'}
            {next.staffName ? ` · ${next.staffName}` : ''}
          </span>
        </span>
      </button>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-primary/15 pt-3">
        {phone && (
          <a
            href={`tel:${phone}`}
            dir="ltr"
            aria-label={`تماس با ${customerLabel}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-surface px-2.5 text-xs font-bold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            تماس
          </a>
        )}
        {phone && (
          <a
            href={`sms:${phone}`}
            dir="ltr"
            aria-label={`پیامک به ${customerLabel}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-surface px-2.5 text-xs font-bold text-secondary hover:bg-secondary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            پیامک
          </a>
        )}
        <button
          type="button"
          onClick={() => onOpenMove(next)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          aria-label={`تغییر زمان ${customerLabel}`}
        >
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          تغییر زمان
        </button>
      </div>
    </section>
  );
}

// ─── Approval Queue (Pending Bookings) ───────────────────────────────────────

/**
 * Approval queue displayed at the top of the calendar page. Lists salon-wide
 * pending bookings (calls `adminApi.getPending`) with one-tap Approve/Reject
 * buttons. Hooks the salon's `booking.pending` notification flow into an
 * actionable UI surface — the inbox bell link + this card together close the
 * "auto-approve off → I need to confirm" loop.
 */
function ApprovalQueue({ salonId, onResolved }: { salonId: string; onResolved: () => void }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');
    // Some embedded/test hosts expose the calendar API without the optional
    // approval-queue methods. Keep the calendar usable in that capability set.
    if (typeof adminApi.getPending !== 'function') {
      setPending([]);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    adminApi
      .getPending(salonId)
      .then((res) => {
        if (!active) return;
        setPending(res.appointments.map((a, i) => toAppointment(a, `pending-${i}`)));
      })
      .catch(() => {
        if (active) setError('صف تأیید رزرو بارگذاری نشد. دوباره تلاش کنید.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [salonId]);

  useEffect(() => load(), [load]);

  const handleAction = useCallback(
    async (id: string, kind: 'approve' | 'reject') => {
      setBusy(`${id}:${kind}`);
      try {
        if (kind === 'approve') {
          await adminApi.approveAppointment(id);
        } else {
          await adminApi.rejectAppointment(id);
        }
        setPending((list) => list.filter((a) => a.id !== id));
        onResolved();
      } catch (cause) {
        const code =
          cause && typeof cause === 'object' && 'code' in cause
            ? String((cause as { code?: unknown }).code ?? '')
            : '';
        setError(
          code === 'APPOINTMENT_NOT_PENDING'
            ? 'این رزرو قبلاً تعیین تکلیف شده است؛ صف را تازه کنید.'
            : 'تغییر وضعیت رزرو انجام نشد. دوباره تلاش کنید.',
        );
      } finally {
        setBusy(null);
      }
    },
    [onResolved],
  );

  if (loading && pending.length === 0 && !error) return null;
  if (pending.length === 0 && !error) return null;

  return (
    <section
      data-testid="owner-approval-queue"
      aria-label={t('owner.calendar.approvalQueue', { defaultValue: 'نوبت‌های در انتظار تأیید' })}
      className="rounded-lg border border-warning/40 bg-warning/5 p-4"
    >
      <header className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/15 text-warning">
          <Hourglass className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="flex flex-col">
          <h2 className="text-sm font-bold text-text">
            {t('owner.calendar.approvalQueue', { defaultValue: 'نوبت‌های در انتظار تأیید' })}
          </h2>
          <p className="text-xs text-muted">
            {t('owner.calendar.approvalBody', {
              defaultValue: 'این رزروها منتظر تأیید شما هستند',
            })}
          </p>
        </div>
        <span className="ms-auto rounded-full bg-warning/15 px-2 py-0.5 text-xs font-bold text-warning tabular-nums">
          <Num value={pending.length} />
        </span>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-3 flex flex-col gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{error}</span>
          <Button variant="secondary" onClick={() => void load()}>
            تلاش مجدد
          </Button>
        </div>
      )}

      {pending.length > 0 && (
        <ul role="list" className="flex flex-col gap-2">
          {pending.map((appt) => {
            const start = clockTime(appt.startAt);
            const dateKey = appt.startAt ? localDateKey(appt.startAt) : null;
            let dateLabel = '';
            if (dateKey) {
              try {
                const d = new Date(dateKey + 'T00:00:00');
                const jalali = jalaliDayDisplay(d);
                dateLabel = `${getJalaliMonthName(jalali.jm)} ${String(jalali.jd)} ${String(jalali.jy)}`;
              } catch {
                dateLabel = dateKey;
              }
            }
            const isBusy = busy !== null && busy.startsWith(appt.id);
            return (
              <li
                key={appt.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-text">
                    <Scissors className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                    <span className="truncate">{appt.serviceName ?? '—'}</span>
                  </span>
                  {appt.customerName && (
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <User className="h-3 w-3" aria-hidden="true" />
                      {appt.customerName}
                    </span>
                  )}
                  {appt.staffName && (
                    <span className="text-xs text-muted">
                      {t('owner.calendar.withStaff', { defaultValue: 'با' })}: {appt.staffName}
                    </span>
                  )}
                  {start && dateLabel && (
                    <span className="flex items-center gap-1 text-xs tabular-nums text-muted">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      <Num value={dateLabel} /> <span aria-hidden>·</span> <Num value={start} />
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="md"
                    variant="danger"
                    onClick={() => handleAction(appt.id, 'reject')}
                    disabled={isBusy}
                    startIcon={<X className="h-4 w-4" />}
                  >
                    {busy === `${appt.id}:reject`
                      ? t('owner.calendar.rejecting', { defaultValue: 'در حال رد...' })
                      : t('owner.calendar.reject', { defaultValue: 'رد' })}
                  </Button>
                  <Button
                    size="md"
                    variant="primary"
                    onClick={() => handleAction(appt.id, 'approve')}
                    disabled={isBusy}
                    startIcon={<Check className="h-4 w-4" />}
                  >
                    {busy === `${appt.id}:approve`
                      ? t('owner.calendar.approving', { defaultValue: 'در حال تأیید...' })
                      : t('owner.calendar.approve', { defaultValue: 'تأیید' })}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
function QuickApprovalPolicy({ salonId }: { salonId: string }) {
  const [autoApprove, setAutoApprove] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    let active = true;
    setError('');
    approvalPolicyApi
      .get(salonId)
      .then((policy) => {
        if (active) setAutoApprove(policy.autoApprove);
      })
      .catch(() => {
        if (active) setError('تنظیم تأیید رزرو دریافت نشد.');
      });
    return () => {
      active = false;
    };
  }, [salonId]);

  useEffect(() => load(), [load]);

  const select = async (next: boolean) => {
    if (saving || autoApprove === next) return;
    const previous = autoApprove;
    setAutoApprove(next);
    setSaving(true);
    setError('');
    try {
      await approvalPolicyApi.setSalon(salonId, next);
    } catch {
      setAutoApprove(previous);
      setError('ذخیره انجام نشد؛ دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-label="روش تأیید رزرو"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-1 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-text">تأیید رزروهای جدید</h2>
        </div>
        <p className="mt-1 text-xs text-muted">
          {autoApprove === true
            ? 'رزرو مشتری همان لحظه قطعی می‌شود.'
            : autoApprove === false
              ? 'هر رزرو قبل از قطعی‌شدن باید توسط سالن تأیید شود.'
              : 'در حال دریافت تنظیم فعلی…'}
        </p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>

      <div
        className="grid shrink-0 grid-cols-2 rounded-xl border border-border bg-bg p-1"
        role="radiogroup"
        aria-label="انتخاب روش تأیید رزرو"
      >
        {[
          { value: true, label: 'خودکار' },
          { value: false, label: 'تأیید دستی' },
        ].map((option) => {
          const selected = autoApprove === option.value;
          return (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={saving || autoApprove === null}
              onClick={() => void select(option.value)}
              className={cn(
                'min-h-10 rounded-lg px-4 text-sm font-medium transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                selected
                  ? 'bg-primary text-primary-contrast shadow-1'
                  : 'text-muted hover:text-text',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ─── Daily operating summary ────────────────────────────────────────────────

function CalendarSummary({
  appointments,
  anchor,
  view,
  onSelectAppointment,
  onOpenMove,
}: {
  appointments: Appointment[];
  anchor: Date;
  view: CalendarView;
  onSelectAppointment: (appointment: Appointment) => void;
  onOpenMove: (appointment: Appointment) => void;
}) {
  const dayKey = dateKey(anchor);
  const dayAppointments = useMemo(
    () => appointments.filter((item) => item.startAt && localDateKey(item.startAt) === dayKey),
    [appointments, dayKey],
  );
  const peopleCount = customerCount(dayAppointments);
  const pendingCount = dayAppointments.filter((item) => item.status === 'pending').length;
  const confirmedCount = dayAppointments.filter((item) =>
    ['confirmed', 'approved', 'completed'].includes(item.status ?? ''),
  ).length;
  const scheduledMinutes = dayAppointments.reduce((total, item) => {
    if (!item.startAt || !item.endAt) return total;
    const duration = (new Date(item.endAt).getTime() - new Date(item.startAt).getTime()) / 60000;
    return total + (Number.isFinite(duration) ? Math.max(duration, 0) : 0);
  }, 0);

  const title = view === 'day' ? 'خلاصه این روز' : 'خلاصه روز انتخاب‌شده';
  const metrics = [
    { label: 'نفر', value: peopleCount, icon: <Users className="h-4 w-4" /> },
    { label: 'رزرو', value: dayAppointments.length, icon: <CalendarClock className="h-4 w-4" /> },
    { label: 'تأییدشده', value: confirmedCount, icon: <CheckCircle2 className="h-4 w-4" /> },
    { label: 'در انتظار', value: pendingCount, icon: <Hourglass className="h-4 w-4" /> },
  ];

  return (
    <section
      data-testid="owner-calendar-summary"
      aria-label={`${title}؛ ${peopleCount} نفر`}
      className="rounded-2xl border border-border bg-surface p-3 shadow-1 sm:p-4"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)] lg:items-stretch">
        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-muted">{title}</p>
              <p className="mt-0.5 text-sm font-bold text-text">
                <Num value={jalaliDateLabel(anchor)} />
              </p>
            </div>
            <p className="text-xs text-muted">
              <Clock className="me-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
              <Num value={Math.round(scheduledMinutes)} /> دقیقه زمان برنامه‌ریزی‌شده
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="flex items-center gap-2 rounded-xl border border-border/70 bg-bg/50 px-3 py-2"
              >
                <span className="text-primary" aria-hidden="true">
                  {metric.icon}
                </span>
                <span className="min-w-0">
                  <strong className="block text-base font-bold tabular-nums text-text">
                    <Num value={metric.value} />
                  </strong>
                  <span className="block text-[0.68rem] text-muted">{metric.label}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <NextAppointmentCard
          appointments={appointments}
          anchor={anchor}
          onSelectAppointment={onSelectAppointment}
          onOpenMove={onOpenMove}
        />
      </div>
    </section>
  );
}

// ─── Customer context dialog ────────────────────────────────────────────────

type CustomerProfileState = 'idle' | 'loading' | 'success' | 'error';

function CustomerDetailsDialog({
  appointment,
  profile,
  state,
  open,
  onOpenChange,
}: {
  appointment: Appointment | null;
  profile: CustomerProfileResponse | null;
  state: CustomerProfileState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const customer = profile?.customer;
  const phone = customer?.phone ?? appointment?.customerPhone;
  const history = profile?.appointments ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(720px,90vh)] overflow-y-auto">
        <DialogTitle>
          {customer?.fullName ?? appointment?.customerName ?? 'جزئیات مشتری'}
        </DialogTitle>
        <DialogDescription>اطلاعات این مشتری و آخرین نوبت‌های ثبت‌شده در سالن.</DialogDescription>

        <div className="mt-4 grid gap-3 rounded-xl border border-border bg-bg/50 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">خدمت</span>
            <strong className="text-end text-text">{appointment?.serviceName ?? '—'}</strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">زمان</span>
            <strong className="text-end tabular-nums text-text">
              <Num value={jalaliDateLabel(appointment?.startAt)} /> ·{' '}
              <Num value={clockTime(appointment?.startAt) ?? '—'} />
            </strong>
          </div>
          {appointment?.staffName && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">آرایشگر</span>
              <strong className="text-end text-text">{appointment.staffName}</strong>
            </div>
          )}
          {customer?.preferredStaff && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">آرایشگر ترجیحی</span>
              <strong className="text-end text-text">
                {customer.preferredStaff.fullName ?? '—'}
              </strong>
            </div>
          )}
          {phone && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
              <span className="text-muted">شماره تماس</span>
              <span className="flex items-center gap-2" dir="ltr">
                <span className="tabular-nums text-text">{phone}</span>
                <a
                  href={`tel:${phone}`}
                  aria-label={`تماس با ${customer?.fullName ?? appointment?.customerName ?? 'مشتری'}`}
                  className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                </a>
                <a
                  href={`sms:${phone}`}
                  aria-label={`پیامک به ${customer?.fullName ?? appointment?.customerName ?? 'مشتری'}`}
                  className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-secondary/10 text-secondary hover:bg-secondary/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                </a>
              </span>
            </div>
          )}
        </div>

        {state === 'loading' && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-border p-4 text-sm text-muted"
          >
            در حال دریافت سابقه مشتری…
          </div>
        )}
        {state === 'error' && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
          >
            سابقه مشتری بارگذاری نشد؛ اطلاعات همین نوبت همچنان قابل استفاده است.
          </p>
        )}
        {state === 'success' && profile && (
          <section className="mt-4" aria-labelledby="customer-history-title">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3
                id="customer-history-title"
                className="flex items-center gap-2 text-sm font-bold text-text"
              >
                <History className="h-4 w-4 text-primary" aria-hidden="true" />
                سابقه مشتری
              </h3>
              <span className="text-xs text-muted">
                <Num value={profile.customer.noShowCount} /> عدم حضور
              </span>
            </div>
            <ul className="flex max-h-52 flex-col gap-2 overflow-y-auto" role="list">
              {history.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs"
                >
                  <span className="min-w-0">
                    <strong className="block truncate text-text">
                      {item.service?.name ?? 'خدمت'}
                    </strong>
                    <span className="text-muted">
                      <Num value={jalaliDateLabel(item.startAt)} />
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-bg px-2 py-1 text-muted">
                    {statusIndicator(item.status).label}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-5 flex justify-end">
          <DialogClose asChild>
            <Button variant="secondary">بستن</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RescheduleDialog({
  appointment,
  open,
  busy,
  error,
  onOpenChange,
  onSubmit,
}: {
  appointment: Appointment | null;
  open: boolean;
  busy: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (date: string, time: string) => Promise<boolean>;
}) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!appointment || !open) return;
    setDate(appointment.startAt ? localDateKey(appointment.startAt) ?? '' : '');
    setTime(appointment.startAt ? clockTime(appointment.startAt) ?? '' : '');
    setValidationError('');
  }, [appointment, open]);

  const submit = async () => {
    if (!date || !time || !localDateTime(date, time)) {
      setValidationError('روز و ساعت معتبر انتخاب کن.');
      return;
    }
    setValidationError('');
    await onSubmit(date, time);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogTitle>تغییر زمان نوبت</DialogTitle>
        <DialogDescription>
          {appointment?.customerName ?? 'این مشتری'} · {appointment?.serviceName ?? 'خدمت'}
        </DialogDescription>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <TextField
            type="date"
            label="روز جدید"
            value={date}
            dir="ltr"
            onChange={(event) => setDate(event.target.value)}
            disabled={busy}
          />
          <TextField
            type="time"
            label="ساعت شروع"
            value={time}
            dir="ltr"
            step={1800}
            onChange={(event) => setTime(event.target.value)}
            disabled={busy}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          مدت خدمت و آرایشگر/صندلی فعلی حفظ می‌شود؛ سیستم تداخل و ساعات کاری را بررسی می‌کند.
        </p>
        {(validationError || error) && (
          <p role="alert" className="mt-3 rounded-lg bg-danger/10 p-3 text-sm text-danger">
            {validationError || error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>
              انصراف
            </Button>
          </DialogClose>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            ذخیره زمان
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OwnerCalendarPage() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const salonId = useSalonId();

  const [view, setView] = useState<CalendarView>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [closures, setClosures] = useState<SalonClosure[]>([]);
  const [staff, setStaff] = useState<SalonStaff[]>([]);
  const [staffCalendarBlocks, setStaffCalendarBlocks] = useState<StaffCalendarBlock[]>([]);
  const [closureReloadToken, setClosureReloadToken] = useState(0);
  const [weeklyScheduleOpen, setWeeklyScheduleOpen] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [availabilityDate, setAvailabilityDate] = useState<Date>(() => new Date());
  const [availabilityStart, setAvailabilityStart] = useState<string | undefined>();
  const [cancelAppointment, setCancelAppointment] = useState<Appointment | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emergencyCancelAll, setEmergencyCancelAll] = useState(true);
  const [emergencyBusy, setEmergencyBusy] = useState(false);
  const [emergencyError, setEmergencyError] = useState('');
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfileResponse | null>(null);
  const [customerProfileState, setCustomerProfileState] = useState<CustomerProfileState>('idle');
  const customerRequestRef = useRef(0);
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');
  const [calendarActionMessage, setCalendarActionMessage] = useState('');
  const [movingAppointmentId, setMovingAppointmentId] = useState<string | null>(null);
  const [draggingAppointmentId, setDraggingAppointmentId] = useState<string | null>(null);
  const [calendarSearch, setCalendarSearch] = useState('');
  const [calendarStatusFilter, setCalendarStatusFilter] = useState<CalendarStatusFilter>('all');
  const [calendarStaffFilter, setCalendarStaffFilter] = useState('all');

  // Track direction for animations
  const [viewDirection, setViewDirection] = useState(0);
  const [dateDirection, setDateDirection] = useState(0);
  const dateKey_ = `${view}-${dateKey(anchor)}`;
  const filteredAppointments = useMemo(
    () =>
      appointments.filter((appointment) =>
        matchesCalendarFilters(
          appointment,
          calendarSearch,
          calendarStatusFilter,
          calendarStaffFilter,
        ),
      ),
    [appointments, calendarSearch, calendarStatusFilter, calendarStaffFilter],
  );
  const hasCalendarFilters =
    Boolean(calendarSearch.trim()) ||
    calendarStatusFilter !== 'all' ||
    calendarStaffFilter !== 'all';

  const handleViewChange = useCallback(
    (newView: CalendarView) => {
      if (newView === view) return;
      const order: CalendarView[] = ['day', 'week', 'month', 'list'];
      const oldIdx = order.indexOf(view);
      const newIdx = order.indexOf(newView);
      setViewDirection(newIdx > oldIdx ? 1 : -1);
      setView(newView);
    },
    [view],
  );

  const handleNavigate = useCallback(
    (dir: -1 | 0 | 1) => {
      setDateDirection(dir);
      setAnchor((prev) => {
        if (dir === 0) return new Date();
        const next = new Date(prev);
        if (view === 'day') {
          next.setDate(next.getDate() + dir);
        } else if (view === 'week') {
          next.setDate(next.getDate() + dir * 7);
        } else if (view === 'month') {
          next.setMonth(next.getMonth() + dir);
        } else if (view === 'list') {
          // Scroll the 30-day agenda window by a week at a time
          next.setDate(next.getDate() + dir * 7);
        }
        return next;
      });
    },
    [view],
  );

  // ─── Keyboard view switching (D/W/M/L) ────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'd':
          e.preventDefault();
          handleViewChange('day');
          break;
        case 'w':
          e.preventDefault();
          handleViewChange('week');
          break;
        case 'm':
          e.preventDefault();
          handleViewChange('month');
          break;
        case 'l':
          e.preventDefault();
          handleViewChange('list');
          break;
        case 't':
          // "T" for today
          e.preventDefault();
          handleNavigate(0);
          break;
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleViewChange, handleNavigate]);

  // ─── Data Fetch ──────────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    setStatus('loading');

    const { from, to } = rangeFor(view, anchor);

    adminApi
      .getCalendar(salonId, from, to, view)
      .then((res) => {
        if (!active) return;
        setAppointments(res.appointments.map((appt, i) => toAppointment(appt, `appt-${i + 1}`)));
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

  useEffect(() => {
    let active = true;
    if (typeof holidaysApi?.list !== 'function') return;
    holidaysApi
      .list(salonId)
      .then((res) => {
        if (active) setClosures(res.holidays);
      })
      .catch(() => {
        if (active) setClosures([]);
      });
    return () => {
      active = false;
    };
  }, [salonId, closureReloadToken]);

  useEffect(() => {
    let active = true;
    if (typeof adminApi.getStaff !== 'function') return;
    adminApi
      .getStaff(salonId)
      .then((res) => {
        if (active) setStaff(res.staff);
      })
      .catch(() => {
        if (active) setStaff([]);
      });
    return () => {
      active = false;
    };
  }, [salonId]);

  useEffect(() => {
    let active = true;
    if (typeof staffAvailabilityApi?.list !== 'function' || staff.length === 0) {
      setStaffCalendarBlocks([]);
      return;
    }
    const bookable = staff.filter((item) => item.active && item.role !== 'Admin');
    Promise.all(
      bookable.map(async (item) => {
        try {
          const res = await staffAvailabilityApi.list(item.id);
          return res.blocks.map((block) => ({
            ...block,
            staffId: item.id,
            staffName: item.fullName || 'آرایشگر',
          }));
        } catch {
          return [];
        }
      }),
    ).then((groups) => {
      if (active) setStaffCalendarBlocks(groups.flat());
    });
    return () => {
      active = false;
    };
  }, [staff, closureReloadToken]);

  const openAvailability = useCallback((date: Date, start?: string) => {
    setAvailabilityDate(new Date(date));
    setAvailabilityStart(start);
    setAvailabilityOpen(true);
  }, []);

  const openDay = useCallback(
    (date: Date) => {
      setDateDirection(0);
      setAnchor(new Date(date));
      handleViewChange('day');
    },
    [handleViewChange],
  );

  const openCustomerDetails = useCallback(
    async (appointment: Appointment) => {
      const requestId = customerRequestRef.current + 1;
      customerRequestRef.current = requestId;
      setSelectedAppointment(appointment);
      setCustomerProfile(null);
      setCustomerDialogOpen(true);

      if (!appointment.customerId || typeof adminApi.getCustomerProfile !== 'function') {
        setCustomerProfileState('idle');
        return;
      }

      setCustomerProfileState('loading');
      try {
        const profile = await adminApi.getCustomerProfile(salonId, appointment.customerId);
        if (customerRequestRef.current !== requestId) return;
        setCustomerProfile(profile);
        setCustomerProfileState('success');
      } catch {
        if (customerRequestRef.current === requestId) setCustomerProfileState('error');
      }
    },
    [salonId],
  );

  const openReschedule = useCallback((appointment: Appointment) => {
    setCalendarActionMessage('');
    setRescheduleError('');
    setRescheduleTarget(appointment);
  }, []);

  const moveAppointment = useCallback(
    async (appointment: Appointment, targetDate: Date, targetTime: string): Promise<boolean> => {
      if (movingAppointmentId) return false;
      const previous = appointments.find((item) => item.id === appointment.id);
      if (!previous?.startAt || !previous.endAt) return false;

      const nextStart = localDateTime(dateKey(targetDate), targetTime);
      const durationMs = new Date(previous.endAt).getTime() - new Date(previous.startAt).getTime();
      if (!nextStart || !Number.isFinite(durationMs) || durationMs <= 0) {
        setRescheduleError('روز یا ساعت انتخاب‌شده معتبر نیست.');
        return false;
      }
      const nextEnd = new Date(nextStart.getTime() + durationMs);
      const optimistic = {
        ...previous,
        startAt: nextStart.toISOString(),
        endAt: nextEnd.toISOString(),
      };

      setMovingAppointmentId(appointment.id);
      setRescheduleError('');
      setCalendarActionMessage('');
      setAppointments((current) =>
        current.map((item) => (item.id === appointment.id ? optimistic : item)),
      );

      try {
        await adminApi.rescheduleAppointment(appointment.id, nextStart.toISOString());
        setCalendarActionMessage('زمان نوبت با موفقیت تغییر کرد؛ تقویم بدون بارگذاری مجدد به‌روز شد.');
        return true;
      } catch (error) {
        setAppointments((current) =>
          current.map((item) => (item.id === appointment.id ? previous : item)),
        );
        setRescheduleError(rescheduleErrorMessage(error));
        return false;
      } finally {
        setMovingAppointmentId(null);
      }
    },
    [appointments, movingAppointmentId],
  );

  const submitReschedule = useCallback(
    async (date: string, time: string): Promise<boolean> => {
      if (!rescheduleTarget) return false;
      setRescheduleBusy(true);
      const target = new Date(rescheduleTarget.startAt ?? '');
      const success = await moveAppointment(
        rescheduleTarget,
        localDateTime(date, time) ?? target,
        time,
      );
      setRescheduleBusy(false);
      if (success) {
        setRescheduleTarget(null);
        setRescheduleError('');
      }
      return success;
    },
    [moveAppointment, rescheduleTarget],
  );

  const confirmCancelAppointment = async () => {
    if (!cancelAppointment) return;
    setCancelBusy(true);
    setCancelError('');
    try {
      if (cancelAppointment.status === 'pending') {
        await adminApi.rejectAppointment(cancelAppointment.id);
      } else {
        await adminApi.cancelAppointment(cancelAppointment.id);
      }
      setCancelAppointment(null);
      setReloadToken((value) => value + 1);
    } catch {
      setCancelError('لغو نوبت انجام نشد. دوباره تلاش کنید.');
    } finally {
      setCancelBusy(false);
    }
  };

  const confirmEmergencyClose = async () => {
    setEmergencyBusy(true);
    setEmergencyError('');
    try {
      const result = await emergencyScheduleApi.closeDay(
        salonId,
        dateKey(anchor),
        emergencyCancelAll,
      );
      if (result.failedCount > 0) {
        setEmergencyError(
          `${toPersianDigits(String(result.cancelledCount))} نوبت لغو شد؛ لغو ${toPersianDigits(String(result.failedCount))} نوبت ناموفق بود. دوباره بررسی کن.`,
        );
        return;
      }
      setEmergencyOpen(false);
      setClosureReloadToken((value) => value + 1);
      setReloadToken((value) => value + 1);
    } catch {
      setEmergencyError('بستن این روز انجام نشد. دوباره تلاش کنید.');
    } finally {
      setEmergencyBusy(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <section data-testid="owner-calendar-page" className="flex flex-col gap-4 sm:gap-5">
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <ViewToggle view={view} onViewChange={handleViewChange} />
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <Button
            variant="primary"
            size="md"
            startIcon={<Clock className="h-4 w-4" />}
            onClick={() => setWeeklyScheduleOpen(true)}
            className="w-full sm:w-auto"
          >
            <span className="sm:hidden">ساعات کاری</span>
            <span className="hidden sm:inline">ساعات کاری هفتگی</span>
          </Button>
          <Button
            variant="secondary"
            size="md"
            startIcon={<CalendarOff className="h-4 w-4" />}
            onClick={() => openAvailability(anchor)}
            className="w-full sm:w-auto"
          >
            <span className="sm:hidden">تعطیلی‌ها</span>
            <span className="hidden sm:inline">تعطیلی و عدم حضور</span>
          </Button>
          <Button
            variant="danger"
            size="md"
            startIcon={<TriangleAlert className="h-4 w-4" />}
            className="col-span-2 w-full sm:w-auto"
            onClick={() => {
              setEmergencyError('');
              setEmergencyOpen(true);
            }}
          >
            <span className="sm:hidden">بستن فوری امروز</span>
            <span className="hidden sm:inline">اختلال و بستن این روز</span>
          </Button>
          <DateNav view={view} anchor={anchor} onNavigate={handleNavigate} />
        </div>
      </div>

      <p className="-mt-3 text-xs text-muted">
        روی هر روز یا ساعت بزن تا همان‌جا تعطیلی کامل یا محدودیت ساعتی ثبت کنی.
      </p>

      {role === 'Owner' && <QuickApprovalPolicy salonId={salonId} />}

      {/* Pending approval queue — surfaced at top of calendar so owners can
          one-tap Approve/Reject without leaving the calendar view. */}
      <ApprovalQueue salonId={salonId} onResolved={() => setReloadToken((n) => n + 1)} />

      {calendarActionMessage && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{calendarActionMessage}</span>
          <button
            type="button"
            className="min-h-8 min-w-8 rounded-md hover:bg-success/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            aria-label="بستن پیام"
            onClick={() => setCalendarActionMessage('')}
          >
            <X className="mx-auto h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {rescheduleError && !rescheduleTarget && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {rescheduleError}
        </p>
      )}

      {status === 'success' && (
        <CalendarSummary
          appointments={appointments}
          anchor={anchor}
          view={view}
          onSelectAppointment={openCustomerDetails}
          onOpenMove={openReschedule}
        />
      )}

      {status === 'success' && (
        <CalendarFilterBar
          search={calendarSearch}
          onSearchChange={setCalendarSearch}
          statusFilter={calendarStatusFilter}
          onStatusFilterChange={setCalendarStatusFilter}
          staffFilter={calendarStaffFilter}
          onStaffFilterChange={setCalendarStaffFilter}
          staff={staff}
          totalCount={appointments.length}
          visibleCount={filteredAppointments.length}
        />
      )}

      {status === 'success' && hasCalendarFilters && filteredAppointments.length === 0 && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3 py-3 text-sm text-text sm:flex-row sm:items-center sm:justify-between"
        >
          <span>با این فیلتر رزروی پیدا نشد؛ فیلتر را تغییر بده یا پاک کن.</span>
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              setCalendarSearch('');
              setCalendarStatusFilter('all');
              setCalendarStaffFilter('all');
            }}
          >
            پاک کردن فیلتر
          </Button>
        </div>
      )}

      {/* Calendar content with animated transitions */}
      <div className="relative min-h-[20rem]">
        {status === 'loading' && <CalendarSkeleton view={view} />}

        {status === 'error' && (
          <ErrorState
            data-testid="owner-calendar-error"
            title={t('owner.calendar.errorTitle', { defaultValue: 'خطا در بارگذاری تقویم' })}
            description={t('owner.calendar.errorBody', {
              defaultValue: 'امکان نمایش نوبت‌ها وجود ندارد. لطفاً دوباره تلاش کنید.',
            })}
            retryLabel={t('owner.calendar.retry', { defaultValue: 'تلاش مجدد' })}
            onRetry={() => setReloadToken((n) => n + 1)}
          />
        )}

        {status === 'success' && (
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
                  {view === 'day' && (
                    <DayView
                      appointments={filteredAppointments}
                      anchor={anchor}
                      closures={closures}
                      staffBlocks={staffCalendarBlocks}
                      onSelectSlot={(date, time) => openAvailability(date, time)}
                      onSelectAppointment={openCustomerDetails}
                      onCancel={setCancelAppointment}
                      onOpenMove={openReschedule}
                      onMoveAppointment={(appointment, date, time) => {
                        void moveAppointment(appointment, date, time);
                      }}
                      onDragStart={(appointment) => setDraggingAppointmentId(appointment.id)}
                      onDragEnd={() => setDraggingAppointmentId(null)}
                      movingAppointmentId={movingAppointmentId ?? draggingAppointmentId}
                    />
                  )}
                  {view === 'week' && (
                    <WeekView
                      appointments={filteredAppointments}
                      anchor={anchor}
                      closures={closures}
                      staffBlocks={staffCalendarBlocks}
                      onSelectDate={openDay}
                      onSelectAppointment={openCustomerDetails}
                      onCancel={setCancelAppointment}
                      onOpenMove={openReschedule}
                    />
                  )}
                  {view === 'month' && (
                    <MonthView
                      appointments={filteredAppointments}
                      anchor={anchor}
                      closures={closures}
                      staffBlocks={staffCalendarBlocks}
                      onSelectDate={openDay}
                      onSelectAppointment={openCustomerDetails}
                      onCancel={setCancelAppointment}
                      onOpenMove={openReschedule}
                    />
                  )}
                  {view === 'list' && (
                    <ListView
                      appointments={filteredAppointments}
                      anchor={anchor}
                      onSelectAppointment={openCustomerDetails}
                      onCancel={setCancelAppointment}
                      onOpenMove={openReschedule}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <AvailabilityDialog
        salonId={salonId}
        date={availabilityDate}
        initialStart={availabilityStart}
        closures={closures}
        staff={staff}
        open={availabilityOpen}
        onOpenChange={setAvailabilityOpen}
        onChanged={() => setClosureReloadToken((n) => n + 1)}
      />
      <WeeklyScheduleDialog
        salonId={salonId}
        staff={staff}
        open={weeklyScheduleOpen}
        onOpenChange={setWeeklyScheduleOpen}
      />
      <CustomerDetailsDialog
        appointment={selectedAppointment}
        profile={customerProfile}
        state={customerProfileState}
        open={customerDialogOpen}
        onOpenChange={(next) => {
          setCustomerDialogOpen(next);
          if (!next) {
            customerRequestRef.current += 1;
            setSelectedAppointment(null);
            setCustomerProfile(null);
            setCustomerProfileState('idle');
          }
        }}
      />
      <RescheduleDialog
        appointment={rescheduleTarget}
        open={Boolean(rescheduleTarget)}
        busy={rescheduleBusy}
        error={rescheduleError}
        onOpenChange={(next) => {
          if (!next && !rescheduleBusy) {
            setRescheduleTarget(null);
            setRescheduleError('');
          }
        }}
        onSubmit={submitReschedule}
      />
      <Dialog
        open={Boolean(cancelAppointment)}
        onOpenChange={(next) => {
          if (!next && !cancelBusy) {
            setCancelAppointment(null);
            setCancelError('');
          }
        }}
      >
        <DialogContent>
          <DialogTitle>لغو این نوبت؟</DialogTitle>
          <DialogDescription>
            نوبت {cancelAppointment?.customerName ?? 'مشتری'} لغو می‌شود، زمان آزاد خواهد شد و پیام
            اطلاع‌رسانی برای مشتری ارسال می‌شود.
          </DialogDescription>
          {cancelError && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {cancelError}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" disabled={cancelBusy}>
                انصراف
              </Button>
            </DialogClose>
            <Button
              variant="danger"
              loading={cancelBusy}
              onClick={() => void confirmCancelAppointment()}
            >
              بله، لغو شود
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={emergencyOpen}
        onOpenChange={(next) => !emergencyBusy && setEmergencyOpen(next)}
      >
        <DialogContent>
          <DialogTitle>بستن فوری این روز</DialogTitle>
          <DialogDescription>
            رزرو جدید برای {PERSIAN_WEEKDAYS[iranianDayIndex(anchor)]} بسته می‌شود. اگر برنامه سالن
            ناگهانی به‌هم خورد، تکلیف نوبت‌های فعلی را هم همین‌جا مشخص کن.
          </DialogDescription>
          <div className="mt-4 grid gap-2" role="radiogroup" aria-label="نحوه بستن روز">
            <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-sm text-text">
              <input
                type="radio"
                checked={!emergencyCancelAll}
                onChange={() => setEmergencyCancelAll(false)}
              />
              <span>
                <strong className="block">فقط رزرو جدید بسته شود</strong>
                <span className="text-xs text-muted">نوبت‌های فعلی سر جای خود می‌مانند.</span>
              </span>
            </label>
            <label className="flex cursor-pointer gap-3 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-text">
              <input
                type="radio"
                checked={emergencyCancelAll}
                onChange={() => setEmergencyCancelAll(true)}
              />
              <span>
                <strong className="block">بستن روز و لغو همه نوبت‌ها</strong>
                <span className="text-xs text-muted">
                  مشتری‌ها مطلع می‌شوند و روند عادی بازپرداخت اجرا می‌شود.
                </span>
              </span>
            </label>
          </div>
          {emergencyError && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {emergencyError}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" disabled={emergencyBusy}>
                انصراف
              </Button>
            </DialogClose>
            <Button
              variant="danger"
              loading={emergencyBusy}
              onClick={() => void confirmEmergencyClose()}
            >
              اعمال و بستن روز
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default OwnerCalendarPage;
