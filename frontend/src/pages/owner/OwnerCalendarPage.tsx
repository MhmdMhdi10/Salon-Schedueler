import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  draggable,
  dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import {
  Check,
  CheckCircle2,
  CalendarClock,
  CalendarOff,
  Coffee,
  ContactRound,
  CreditCard,
  ChevronLeft,
  ListChecks,
  MessageCircle,
  Phone,
  SlidersHorizontal,
  ChevronRight,
  Clock,
  Hourglass,
  Settings2,
  User,
  Scissors,
  X,
  GripVertical,
  XCircle,
  TriangleAlert,
} from 'lucide-react';
import {
  ApiError,
  adminApi,
  approvalPolicyApi,
  bookingPolicyApi,
  clientBookApi,
  emergencyScheduleApi,
  holidaysApi,
  salonApi,
  staffAvailabilityApi,
  workingHoursApi,
  type SalonClosure,
  type SalonClient,
  type SalonStaff,
  type OwnerWaitlistEntry,
  type WeeklyWorkingHour,
} from '../../api/client';
import {
  AppointmentDetailsSheet,
  getRescheduleErrorMessage,
  MoveAppointmentDialog,
  type CalendarAppointmentLike,
} from './OwnerAppointmentPanels';
import { useAuth } from '../../auth/AuthContext';
import { useSalonId } from '../../auth/useSalonId';
import { usePagination } from '../../hooks/usePagination';
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
  Money,
  Pagination,
  Skeleton,
  Select,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  TextField,
  toPersianDigits,
  cn,
} from '../../components/ui';
import { easings } from '../../lib/motion-variants';

import './owner-calendar.css';

// ─── Types ───────────────────────────────────────────────────────────────────

type CalendarView = 'day' | 'week' | 'month' | 'list';
type LoadStatus = 'loading' | 'success' | 'error';

const CALENDAR_APPOINTMENT_DRAG_TYPE = 'salon-calendar-appointment';
const CALENDAR_SLOT_DROP_TYPE = 'salon-calendar-slot';

function getCalendarAppointmentId(data: Record<string | symbol, unknown>): string | null {
  return data.type === CALENDAR_APPOINTMENT_DRAG_TYPE && typeof data.appointmentId === 'string'
    ? data.appointmentId
    : null;
}

/** Booksy-style mobile default: show today's actionable schedule first. */
function initialCalendarView(): CalendarView {
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 47.9375rem)').matches
  ) {
    return 'day';
  }
  return 'week';
}

interface Appointment {
  id: string;
  startAt?: string;
  endAt?: string;
  serviceId?: string;
  serviceName?: string;
  customerName?: string;
  staffName?: string;
  status?: string;
  customerPhone?: string;
  customerId?: string;
  staffMemberId?: string;
  locationType?: 'salon' | 'customer';
  locationAddress?: string;
  depositReceiptStatus?: string | null;
  depositPaymentStatus?: string | null;
  depositAmountRial?: number | null;
  depositReceiptUploadedAt?: string | null;
  depositReceiptId?: string | null;
}

type SalonWorkMode =
  | 'fixed_salon'
  | 'rented_chair'
  | 'home'
  | 'mobile'
  | 'hybrid'
  | 'not_decided';

type ManualCustomerPrefill = {
  phone?: string;
  fullName?: string;
  serviceId?: string;
};

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
  // Calendar ranges represent local salon dates. Converting through UTC here
  // shifts Tehran dates back by one day shortly after local midnight.
  return dateKey(d);
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

type ContactPickerContact = {
  name?: string[];
  tel?: string[];
};

type ContactPicker = {
  select: (
    properties: string[],
    options?: { multiple?: boolean },
  ) => Promise<ContactPickerContact[]>;
};

/** Normalize Persian/Arabic digits before validating an Iranian mobile number. */
function normalizeContactDigits(value: string): string {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return value
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)));
}

/** Convert common local/international formats to the backend's 09xxxxxxxxx shape. */
function normalizeIranianMobile(value: string): string | null {
  let digits = normalizeContactDigits(value.trim()).replace(/[^0-9+]/g, '');
  if (digits.startsWith('+98')) digits = '0' + digits.slice(3);
  else if (digits.startsWith('0098')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('98') && digits.length === 12) digits = '0' + digits.slice(2);
  else if (digits.startsWith('9') && digits.length === 10) digits = '0' + digits;
  return /^09\d{9}$/.test(digits) ? digits : null;
}

function getContactPicker(): ContactPicker | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  if (!window.isSecureContext) return null;
  const candidate = (navigator as Navigator & { contacts?: ContactPicker }).contacts;
  return candidate && typeof candidate.select === 'function' ? candidate : null;
}

/** Read common FN/TEL fields from a vCard exported by a phone contact app. */
function parseVCard(text: string): { name?: string; phones: string[] } {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  let name: string | undefined;
  const phones: string[] = [];
  const decode = (value: string) =>
    value
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .trim();

  for (const line of lines) {
    const nameMatch = /^(?:item\d+\.)?FN(?:;[^:]*)?:(.*)$/i.exec(line);
    if (nameMatch && !name) name = decode(nameMatch[1]);
    const phoneMatch = /^(?:item\d+\.)?TEL(?:;[^:]*)?:(.*)$/i.exec(line);
    if (phoneMatch) phones.push(decode(phoneMatch[1]));
  }
  return { name, phones };
}

/** Minutes since midnight from an ISO string. */
function minutesOf(iso: string | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/** Preserve appointment duration while moving its start time locally. */
function movedEndAt(
  appointment: CalendarAppointmentLike,
  nextStart: Date,
): string | undefined {
  if (!appointment.startAt || !appointment.endAt) return undefined;
  const previousStart = new Date(appointment.startAt);
  const previousEnd = new Date(appointment.endAt);
  const duration = previousEnd.getTime() - previousStart.getTime();
  if (
    Number.isNaN(previousStart.getTime()) ||
    Number.isNaN(previousEnd.getTime()) ||
    duration <= 0
  ) {
    return undefined;
  }
  return new Date(nextStart.getTime() + duration).toISOString();
}

interface PositionedAppointment {
  appt: Appointment;
  lane: number;
  laneCount: number;
  startMin: number;
  endMin: number;
}

/** Assign overlapping appointments to lanes so dense days never stack cards on top of each other. */
function layoutAppointmentLanes(appointments: Appointment[]): PositionedAppointment[] {
  const scheduled = appointments
    .map((appt, index) => {
      const startMin = minutesOf(appt.startAt);
      if (startMin === null) return null;
      const rawEnd = minutesOf(appt.endAt);
      return {
        appt,
        index,
        startMin,
        endMin: Math.max(rawEnd ?? startMin + 30, startMin + 15),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.startMin - b.startMin || a.index - b.index);

  const groups: (typeof scheduled)[] = [];
  let group: (typeof scheduled) = [];
  let groupEnd = -1;

  for (const item of scheduled) {
    if (group.length > 0 && item.startMin >= groupEnd) {
      groups.push(group);
      group = [];
    }
    group.push(item);
    groupEnd = Math.max(groupEnd, item.endMin);
  }
  if (group.length > 0) groups.push(group);

  return groups.flatMap((items) => {
    const active: Array<{ endMin: number; lane: number }> = [];
    const placed: Array<PositionedAppointment> = [];
    let laneCount = 1;

    for (const item of items) {
      for (let index = active.length - 1; index >= 0; index -= 1) {
        if (active[index].endMin <= item.startMin) active.splice(index, 1);
      }

      let lane = 0;
      while (active.some((entry) => entry.lane === lane)) lane += 1;
      active.push({ endMin: item.endMin, lane });
      laneCount = Math.max(laneCount, lane + 1);
      placed.push({ ...item, lane, laneCount: 1 });
    }

    return placed.map((item) => ({ ...item, laneCount }));
  });
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
      serviceId: str(rec.serviceId),
      serviceName: str(rec.serviceName),
      customerName: str(rec.customerName),
      staffName: str(rec.staffName),
      status: str(rec.status),
      customerPhone: str(rec.customerPhone),
      customerId: str(rec.customerId),
      staffMemberId: str(rec.staffMemberId),
      locationType:
        rec.locationType === 'customer' || rec.locationType === 'salon'
          ? rec.locationType
          : undefined,
      locationAddress: str(rec.locationAddress),
      depositReceiptStatus: str(rec.depositReceiptStatus) ?? null,
      depositPaymentStatus: str(rec.depositPaymentStatus) ?? null,
      depositAmountRial: typeof rec.amountRial === 'number'
        ? rec.amountRial
        : typeof rec.depositAmountRial === 'number'
          ? rec.depositAmountRial
          : null,
      depositReceiptUploadedAt: str(rec.uploadedAt) ?? str(rec.depositReceiptUploadedAt) ?? null,
      depositReceiptId: str(rec.receiptId) ?? str(rec.depositReceiptId) ?? null,
    };
  }
  return { id: fallbackId };
}

function uniqueCustomerCount(appointments: Appointment[]): number {
  const keys = appointments.map(
    (item) => item.customerId || item.customerPhone || item.customerName || item.id,
  );
  return new Set(keys).size;
}

function asCalendarAppointment(appt: Appointment): CalendarAppointmentLike {
  return appt;
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
  onOpen?: (appointment: Appointment) => void;
  draggableId?: string;
  onDragEnd?: () => void;
  appt: Appointment;
  onCancel?: (appointment: Appointment) => void;
  onNoShow?: (appointment: Appointment) => void;
  compactView?: boolean;
  /** Height in pixels (for positioned day-view blocks). */
  height?: number;
  /** Top offset in pixels (for positioned day-view blocks). */
  top?: number;
  /** Horizontal lane for overlapping day-view appointments. */
  lane?: number;
  laneCount?: number;
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
  onOpen,
  draggableId,
  onDragEnd,
  onCancel,
  onNoShow,
  compactView = false,
  height,
  top,
  lane = 0,
  laneCount = 1,
  positioned = false,
}: AppointmentBlockProps) {
  const draggableRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLSpanElement>(null);
  const isPending = appt.status === 'pending';
  const isCancelled = appt.status === 'cancelled' || appt.status === 'rejected';
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
  const compact = compactView || (positioned && (height ?? 0) < 70);
  const canDragAppointment = Boolean(draggableId);
  const canCancel = ['pending', 'held', 'confirmed', 'approved'].includes(appt.status ?? '');
  const canNoShow = appt.status === 'confirmed' && Boolean(onNoShow);
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
        insetInlineStart: `calc(${(lane / laneCount) * 100}% + 7px)`,
        insetInlineEnd: `calc(${((laneCount - lane - 1) / laneCount) * 100}% + 7px)`,
      }
    : undefined;

  useEffect(() => {
    const element = draggableRef.current;
    if (!element || !draggableId) return;

    return draggable({
      element,
      dragHandle: dragHandleRef.current ?? undefined,
      getInitialData: () => ({
        type: CALENDAR_APPOINTMENT_DRAG_TYPE,
        appointmentId: draggableId,
      }),
      onDrop: () => onDragEnd?.(),
    });
  }, [draggableId, onDragEnd]);

  return (
    <div
      ref={draggableRef}
      className={cn(
        'flex flex-col justify-start gap-1 overflow-hidden rounded-lg border border-border border-s-4 bg-surface px-2.5 py-2 text-text shadow-1',
        compact && 'gap-0.5 px-2 py-1.5',
        'transition-all duration-fast ease-standard',
        'hover:-translate-y-px hover:border-primary/40 hover:shadow-2',
        colorClass,
        positioned ? 'absolute z-20' : '',
        onOpen && 'cursor-pointer',
        canDragAppointment && 'cursor-grab active:cursor-grabbing',
      )}
      style={positionStyle}
      onClick={() => onOpen?.(appt)}
      role="article"
      aria-label={`${service} — ${customer ?? ''} — ${statusLabel}`}
      data-status={ariaState}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Scissors className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        {canDragAppointment && (
          <span
            ref={dragHandleRef}
            className="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center touch-none text-muted/60"
            aria-label="دسته جابه‌جایی نوبت"
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
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
        {compact && canCancel && onCancel && (
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-danger hover:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
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
            {appt.depositReceiptStatus && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium leading-tight',
                  appt.depositReceiptStatus === 'pending'
                    ? 'bg-warning/15 text-warning'
                    : appt.depositReceiptStatus === 'approved'
                      ? 'bg-success/10 text-success'
                      : 'bg-danger/10 text-danger',
                )}
                title="وضعیت رسید بیعانه"
              >
                <CreditCard className="h-3 w-3" aria-hidden="true" />
                {appt.depositReceiptStatus === 'pending'
                  ? 'رسید بیعانه'
                  : appt.depositReceiptStatus === 'approved'
                    ? 'بیعانه تأیید شد'
                    : 'رسید نیازمند بررسی'}
              </span>
            )}
            {canNoShow && onNoShow && (
              <button
                type="button"
                className="inline-flex min-h-10 items-center rounded-md px-2 text-sm font-bold text-warning hover:bg-warning/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                aria-label={`ثبت عدم حضور ${customer ?? service}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onNoShow(appt);
                }}
              >
                عدم حضور
              </button>
            )}
            {canCancel && onCancel && (
              <button
                type="button"
                className="inline-flex min-h-10 items-center rounded-md px-2 text-sm font-bold text-danger hover:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
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
  onViewAppointments,
  onCancel,
  onNoShow,
  onOpenAppointment,
  onMove,
}: {
  appointments: Appointment[];
  anchor: Date;
  closures: SalonClosure[];
  staffBlocks: StaffCalendarBlock[];
  onSelectSlot: (date: Date, time: string) => void;
  onViewAppointments: (date: Date) => void;
  onCancel: (appointment: Appointment) => void;
  onNoShow?: (appointment: Appointment) => void;
  onOpenAppointment: (appointment: Appointment) => void;
  onMove: (appointment: Appointment, date: Date, time: string) => void;
}) {
  const { t } = useTranslation();
  const gridRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const [dropTargetTime, setDropTargetTime] = useState<string | null>(null);
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
  const positionedAppointments = useMemo(() => layoutAppointmentLanes(dayAppts), [dayAppts]);
  const nextAppointment = useMemo(() => {
    const now = Date.now();
    const isCurrentDay = anchorKey === dateKey(new Date());
    return dayAppts.find((item) => {
      if (['cancelled', 'rejected', 'no_show', 'completed'].includes(item.status ?? '')) {
        return false;
      }
      if (!isCurrentDay) return true;
      return item.startAt ? new Date(item.startAt).getTime() >= now : false;
    });
  }, [anchorKey, dayAppts]);

  /** Grid starts at 07:00 = minute 420 */
  const gridStartMin = 7 * 60;

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

  const finishDrag = useCallback(() => {
    setDropTargetTime(null);
  }, []);

  useEffect(() => {
    const cleanups = TIME_SLOTS.flatMap((slot, index) => {
      const element = rowRefs.current[index];
      if (!element) return [];

      const timeStr = `${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}`;
      return [
        dropTargetForElements({
          element,
          canDrop: ({ source }) => getCalendarAppointmentId(source.data) !== null,
          getData: () => ({ type: CALENDAR_SLOT_DROP_TYPE, time: timeStr }),
          onDragEnter: ({ source }) => {
            if (getCalendarAppointmentId(source.data)) setDropTargetTime(timeStr);
          },
          onDragLeave: () => {
            setDropTargetTime((current) => (current === timeStr ? null : current));
          },
          onDrop: ({ source }) => {
            const appointmentId = getCalendarAppointmentId(source.data);
            const appointment = appointmentId
              ? dayAppts.find((item) => item.id === appointmentId)
              : undefined;
            if (appointment) onMove(appointment, anchor, timeStr);
            setDropTargetTime(null);
          },
        }),
      ];
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [anchor, dayAppts, onMove]);

  return (
    <div className="owner-calendar-day-view flex flex-col">
      <div className="owner-calendar-day-summary mb-3 flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <span className="block text-xs font-bold text-primary">خلاصه امروز</span>
          <div className="mt-1 flex items-baseline gap-2">
            <strong className="text-2xl font-black tabular-nums text-text">
              <Num value={uniqueCustomerCount(dayAppts)} />
            </strong>
            <span className="text-sm font-bold text-text">مشتری</span>
            <span className="text-xs text-muted">· <Num value={dayAppts.length} /> نوبت</span>
          </div>
        </div>
        <div className="min-w-0 border-t border-primary/20 pt-2 sm:border-s sm:border-t-0 sm:ps-4 sm:pt-0">
          <span className="block text-xs font-bold text-muted">نوبت بعدی</span>
          {nextAppointment ? (
            <button
              type="button"
              className="mt-1 flex max-w-full items-center gap-1.5 truncate text-sm font-bold text-text hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              onClick={(event) => {
                event.stopPropagation();
                onOpenAppointment(nextAppointment);
              }}
              aria-label="مشاهده نوبت بعدی"
            >
              <Clock className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <Num value={clockTime(nextAppointment.startAt) ?? '—'} />
              <span className="truncate text-muted">
                · {nextAppointment.customerName || nextAppointment.serviceName || 'مشتری'}
              </span>
            </button>
          ) : (
            <span className="mt-1 block text-xs text-muted">برای این روز نوبت بعدی ثبت نشده</span>
          )}
        </div>
        <span className="text-xs text-muted sm:ms-auto">برای جابه‌جایی، نوبت را بکش و روی ساعت جدید رها کن.</span>
      </div>
      {dayAppts.length > 12 && (
        <div className="owner-calendar-day-overflow mb-2 flex flex-col gap-2 rounded-lg border border-primary/25 bg-primary/5 p-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 text-xs text-muted">
            این روز <Num value={dayAppts.length} /> نوبت دارد؛ برای بررسی سریع، فهرست کامل را باز کن.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="w-full shrink-0 text-xs sm:w-auto"
            onClick={() => onViewAppointments(anchor)}
          >
            مشاهده فهرست کامل
          </Button>
        </div>
      )}
      <div
        ref={gridRef}
        role="grid"
        aria-label={t('owner.calendar.dayGridLabel', { defaultValue: 'نمای روزانه' })}
        data-testid="owner-calendar-day"
        className="owner-calendar-day-grid relative overflow-x-auto overflow-y-auto rounded-lg border border-border bg-surface"
        onKeyDown={handleGridKeyDown}
      >
      <div className="relative min-w-full sm:min-w-[20rem]">
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
                dropTargetTime === timeStr && 'bg-primary/15 ring-2 ring-inset ring-primary/40',
                blocked && 'bg-danger/10 hover:bg-danger/15',
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
          {positionedAppointments.map(({ appt, lane, laneCount, startMin, endMin }) => {
            const topPx = (startMin - gridStartMin) * PX_PER_MIN;
            const duration = endMin - startMin;
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
                  lane={lane}
                  laneCount={laneCount}
                  onCancel={onCancel}
                  onNoShow={onNoShow}
                  onOpen={onOpenAppointment}
                  draggableId={appt.id}
                  onDragEnd={finishDrag}
                />
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
}

// ─── Week View ───────────────────────────────────────────────────────────────

function WeekView({
  appointments,
  anchor,
  onOpenAppointment,
  closures,
  staffBlocks,
  onSelectDate,
  onViewAppointments,
  onCancel,
  onNoShow,
}: {
  appointments: Appointment[];
  anchor: Date;
  closures: SalonClosure[];
  staffBlocks: StaffCalendarBlock[];
  onSelectDate: (date: Date) => void;
  onOpenAppointment: (appointment: Appointment) => void;
  onViewAppointments: (date: Date) => void;
  onCancel: (appointment: Appointment) => void;
  onNoShow?: (appointment: Appointment) => void;
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
      <div role="row" className="contents">
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
              <span className="ms-auto rounded-full bg-primary/10 px-2 py-1 text-[0.68rem] font-bold text-primary sm:ms-0">
                <Num value={uniqueCustomerCount(day.items)} /> مشتری
              </span>
              <span className="ms-auto text-[0.68rem] text-muted sm:hidden">
                {day.items.length > 0
                  ? `${toPersianDigits(String(day.items.length))} نوبت`
                  : 'بدون نوبت'}
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
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
              {day.items.length === 0 && (
                <p className="hidden py-4 text-center text-xs text-muted/50 sm:block">—</p>
              )}
              {day.items.slice(0, 3).map((appt) => (
                <div key={appt.id} onClick={(event) => event.stopPropagation()}>
                  <AppointmentBlock
                    appt={appt}
                    compactView
                    onCancel={onCancel}
                    onNoShow={onNoShow}
                    onOpen={onOpenAppointment}
                  />
                </div>
              ))}
              {day.items.length > 3 && (
                <button
                  type="button"
                  className="min-h-10 rounded-md px-2 text-start text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                  onClick={(event) => {
                    event.stopPropagation();
                    onViewAppointments(day.date);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  aria-label={`مشاهده همه ${day.items.length} نوبت ${PERSIAN_WEEKDAYS[day.dayIndex]}`}
                >
                  +<Num value={day.items.length - 3} /> نوبت دیگر · مشاهده همه
                </button>
              )}
            </div>
            </section>
          );
        })}
      </div>
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
  onOpenAppointment,
  onViewAppointments,
  onCancel,
  onNoShow,
}: {
  appointments: Appointment[];
  anchor: Date;
  closures: SalonClosure[];
  staffBlocks: StaffCalendarBlock[];
  onSelectDate: (date: Date) => void;
  onViewAppointments: (date: Date) => void;
  onOpenAppointment: (appointment: Appointment) => void;
  onCancel: (appointment: Appointment) => void;
  onNoShow?: (appointment: Appointment) => void;
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
  const rows: (Date | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    rows.push(cells.slice(index, index + 7));
  }

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
        {rows.map((row, rowIndex) => (
          <div role="row" className="contents" key={`month-row-${rowIndex}`}>
            {row.map((cell, columnIndex) => {
              const idx = rowIndex * 7 + columnIndex;
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
              return (
                <button
                  type="button"
                  key={iso}
                  role="gridcell"
                  aria-label={`${PERSIAN_WEEKDAYS[iranianDayIndex(cell)]} ${jalali.jd}${dayAppts.length > 3 ? `، ${dayAppts.length} نوبت` : ''}`}
                  onClick={() => onSelectDate(cell)}
                  className={cn(
                    'flex min-h-[5rem] flex-col gap-1 border-b border-e border-border/40 p-1.5',
                    'transition-colors duration-fast ease-standard hover:bg-elevated/30',
                    isToday ? 'bg-primary/5' : 'bg-surface',
                    dayClosures.some((item) => item.startTime === null) && 'bg-danger/10',
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.58rem] font-bold text-primary">
                      <Num value={uniqueCustomerCount(dayAppts)} /> نفر
                    </span>
                    <span
                      className={cn(
                        'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums',
                        isToday ? 'bg-primary text-primary-contrast' : 'text-text',
                      )}
                    >
                      <Num value={jalali.jd} />
                    </span>
                  </div>
                  {dayClosures.length > 0 && (
                    <span className="truncate rounded bg-danger/10 px-1 py-0.5 text-[0.58rem] font-bold text-danger">
                      {dayClosures.some((item) => item.startTime === null) ? 'تعطیل' : 'محدودیت ساعت'}
                    </span>
                  )}
                  {dayStaffBlocks.length > 0 && (
                    <span className="truncate rounded bg-warning/10 px-1 py-0.5 text-[0.58rem] font-bold text-warning">
                      {toPersianDigits(String(new Set(dayStaffBlocks.map((item) => item.staffId)).size))}{' '}
                      عدم حضور
                    </span>
                  )}
                  <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                    {dayAppts.slice(0, 3).map((appt) => (
                      <div key={appt.id} onClick={(event) => event.stopPropagation()}>
                        <AppointmentBlock
                          appt={appt}
                          compactView
                          onCancel={onCancel}
                          onOpen={onOpenAppointment}
                          onNoShow={onNoShow}
                        />
                      </div>
                    ))}
                    {dayAppts.length > 3 && (
                      <span className="rounded px-1 text-[0.6rem] font-semibold text-primary">
                        +<Num value={dayAppts.length - 3} />{' '}نوبت دیگر · مشاهده همه
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── List View (agenda) ──────────────────────────────────────────────────────

function AppointmentListDialog({
  open,
  date,
  appointments,
  onOpenChange,
  onCancel,
  onNoShow,
}: {
  open: boolean;
  date: Date | null;
  appointments: Appointment[];
  onOpenChange: (open: boolean) => void;
  onCancel: (appointment: Appointment) => void;
  onNoShow?: (appointment: Appointment) => void;
}) {
  const { t } = useTranslation();
  const pagination = usePagination(appointments, 5);
  const selectedDateKey = date ? dateKey(date) : null;
  const displayDate = date ?? new Date();
  const jalali = jalaliDayDisplay(displayDate);

  useEffect(() => {
    pagination.resetPage();
  }, [pagination.resetPage, selectedDateKey]);

  return (
    <Dialog open={open && Boolean(date)} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-xl !p-3 sm:!p-5">
        <div className="pe-10">
          <DialogTitle className="text-base sm:text-lg">
            نوبت‌های {PERSIAN_WEEKDAYS[iranianDayIndex(displayDate)]}
            <span className="ms-1">
              {getJalaliMonthName(jalali.jm)} <Num value={jalali.jd} />
            </span>
            <span className="ms-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary tabular-nums">
              <Num value={appointments.length} />
            </span>
          </DialogTitle>
          <DialogDescription>
            فهرست کامل نوبت‌های این روز؛ هر صفحه پنج نوبت نمایش می‌دهد.
          </DialogDescription>
        </div>

        {appointments.length === 0 ? (
          <p className="mt-5 rounded-lg border border-border bg-bg p-4 text-center text-sm text-muted">
            نوبتی برای نمایش باقی نمانده است.
          </p>
        ) : (
          <>
            <ul role="list" className="mt-4 flex flex-col gap-1.5">
              {pagination.pageItems.map((appt) => (
                <li key={appt.id}>
                  <AppointmentBlock appt={appt} onCancel={onCancel} onNoShow={onNoShow} />
                </li>
              ))}
            </ul>
            <Pagination
              page={pagination.page}
              pageSize={pagination.pageSize}
              total={pagination.total}
              onPageChange={pagination.goToPage}
              ariaLabel={t('owner.calendar.dayPagination', { defaultValue: 'صفحه‌بندی نوبت‌های روز' })}
              testId="owner-calendar-appointments-dialog-pagination"
              compact
              className="mt-3"
            />
          </>
        )}

        <div className="mt-3 flex justify-end border-t border-border pt-3">
          <DialogClose asChild>
            <Button variant="ghost" className="w-full sm:w-auto">بستن</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AgendaDay({
  dayKey,
  items,
  onCancel,
  onNoShow,
}: {
  dayKey: string;
  items: Appointment[];
  onCancel: (appointment: Appointment) => void;
  onNoShow?: (appointment: Appointment) => void;
}) {
  const { t } = useTranslation();
  const pagination = usePagination(items, 8);
  const d = new Date(dayKey + 'T00:00:00');
  const jalali = jalaliDayDisplay(d);
  const dayIdx = iranianDayIndex(d);
  const isToday = dayKey === dateKey(new Date());

  return (
    <li className="rounded-lg border border-border bg-surface p-3">
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
        {pagination.pageItems.map((appt) => (
          <li key={appt.id}>
            <AppointmentBlock appt={appt} onCancel={onCancel} onNoShow={onNoShow} />
          </li>
        ))}
      </ul>
      <Pagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        onPageChange={pagination.goToPage}
        ariaLabel={t('owner.calendar.dayPagination', { defaultValue: 'صفحه‌بندی نوبت‌های روز' })}
        testId={`owner-calendar-day-pagination-${dayKey}`}
        compact
        className="mt-3"
      />
    </li>
  );
}

function ListView({ appointments, anchor, onCancel, onNoShow }: { appointments: Appointment[]; anchor: Date; onCancel: (appointment: Appointment) => void; onNoShow?: (appointment: Appointment) => void }) {
  const { t } = useTranslation();

  // Group appointments by their local date, sorted ascending.
  const grouped = useMemo(() => {
    const anchorKey = dateKey(anchor);
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      if (!a.startAt) continue;
      const key = localDateKey(a.startAt);
      if (!key || key < anchorKey) continue;
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const ta = a.startAt ? new Date(a.startAt).getTime() : 0;
        const tb = b.startAt ? new Date(b.startAt).getTime() : 0;
        return ta - tb;
      });
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [appointments, anchor]);
  const pagination = usePagination(grouped, 7);

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
    <>
      <ol
        role="list"
        aria-label={t('owner.calendar.listGridLabel', { defaultValue: 'نمای فهرستی' })}
        data-testid="owner-calendar-list"
        className="flex flex-col gap-3"
      >
        {pagination.pageItems.map(([dayKey, items]) => (
          <AgendaDay key={dayKey} dayKey={dayKey} items={items} onCancel={onCancel} onNoShow={onNoShow} />
        ))}
      </ol>
      <Pagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        onPageChange={pagination.goToPage}
        ariaLabel={t('owner.calendar.listPagination', { defaultValue: 'صفحه‌بندی تقویم' })}
        testId="owner-calendar-list-pagination"
        compact
      />
    </>
  );
}

// ─── Calendar filters ────────────────────────────────────────────────────────

type CalendarStatusFilter = 'all' | 'pending' | 'active' | 'completed' | 'cancelled' | 'no_show';

function matchesCalendarStatus(appointment: Appointment, filter: CalendarStatusFilter): boolean {
  if (filter === 'all') return true;
  const status = appointment.status ?? '';
  if (filter === 'active') return ['held', 'confirmed', 'approved'].includes(status);
  if (filter === 'cancelled') return ['cancelled', 'rejected'].includes(status);
  return status === filter;
}

function CalendarFilters({
  appointments,
  staff,
  query,
  staffId,
  statusFilter,
  onQueryChange,
  onStaffChange,
  onStatusChange,
  onClear,
}: {
  appointments: Appointment[];
  staff: SalonStaff[];
  query: string;
  staffId: string;
  statusFilter: CalendarStatusFilter;
  onQueryChange: (value: string) => void;
  onStaffChange: (value: string) => void;
  onStatusChange: (value: CalendarStatusFilter) => void;
  onClear: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const normalizedQuery = normalizeContactDigits(query.trim()).toLocaleLowerCase();
  const visibleCount = appointments.filter((appointment) => {
    if (staffId !== 'all' && appointment.staffMemberId !== staffId) return false;
    if (!matchesCalendarStatus(appointment, statusFilter)) return false;
    if (!normalizedQuery) return true;
    const searchable = normalizeContactDigits(
      [
        appointment.customerName,
        appointment.customerPhone,
        appointment.serviceName,
        appointment.staffName,
      ]
        .filter(Boolean)
        .join(' '),
    ).toLocaleLowerCase();
    return searchable.includes(normalizedQuery);
  }).length;
  const activeCount =
    (query.trim() ? 1 : 0) +
    (staffId !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0);

  return (
    <section
      aria-label="فیلتر نوبت‌ها"
      data-testid="owner-calendar-filters"
      className="owner-calendar-filters rounded-xl border border-border bg-surface p-3 shadow-1"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="m-0 text-sm font-bold text-text">
            <span className="hidden sm:inline">پیدا کردن نوبت</span>
            <span className="sm:hidden">فیلتر نوبت‌ها</span>
          </h2>
          {activeCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              <Num value={String(activeCount)} /> فیلتر
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <Button type="button" variant="ghost" size="md" onClick={onClear} className="!px-2 text-xs">
            پاک کردن فیلترها
          </Button>
        )}
        <button
          type="button"
          className="min-h-10 rounded-lg px-2 text-xs font-bold text-primary sm:hidden"
          aria-controls="owner-calendar-filter-fields"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {filtersOpen ? 'بستن' : 'نمایش'}
        </button>
      </div>
      <div
        id="owner-calendar-filter-fields"
        className={cn(
          'mt-3 grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(10rem,1fr)_minmax(9rem,1fr)]',
          !filtersOpen && 'hidden sm:grid',
        )}
      >
        <TextField
          label="جست‌وجوی مشتری، شماره یا خدمت"
          labelHidden
          placeholder="نام، شماره یا خدمت را جست‌وجو کن"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <Select
          label="آرایشگر"
          labelHidden
          value={staffId}
          onValueChange={onStaffChange}
          options={[
            { value: 'all', label: 'همه آرایشگرها' },
            ...staff
              .filter((member) => member.active)
              .map((member) => ({
                value: member.id,
                label: member.fullName || 'آرایشگر بدون نام',
              })),
          ]}
          placeholder="آرایشگر"
          emptyText="آرایشگری ثبت نشده است"
        />
        <Select
          label="وضعیت"
          labelHidden
          value={statusFilter}
          onValueChange={(value) => onStatusChange(value as CalendarStatusFilter)}
          options={[
            { value: 'all', label: 'همه وضعیت‌ها' },
            { value: 'active', label: 'فعال' },
            { value: 'pending', label: 'در انتظار تأیید' },
            { value: 'completed', label: 'انجام شده' },
            { value: 'cancelled', label: 'لغو شده' },
            { value: 'no_show', label: 'عدم حضور' },
          ]}
          placeholder="وضعیت"
        />
      </div>
      <p className="m-0 mt-2 text-xs text-muted" aria-live="polite">
        <Num value={String(visibleCount)} /> نوبت در این بازه نمایش داده می‌شود.
      </p>
    </section>
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
  const selectedHourRef = useRef(hour);
  const selectedMinuteRef = useRef(minute);
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => index), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, index) => index), []);

  useLayoutEffect(() => {
    if (!open) return;
    const nextHour = Number(value.split(':')[0] ?? 0);
    const nextMinute = Number(value.split(':')[1] ?? 0);
    selectedHourRef.current = nextHour;
    selectedMinuteRef.current = nextMinute;
    setHour(nextHour);
    setMinute(nextMinute);
    setTimeWheelPosition(hourRef.current, nextHour);
    setTimeWheelPosition(minuteRef.current, nextMinute);
  }, [open, value]);

  const wheel = (
    values: number[],
    selected: number,
    setSelected: (value: number) => void,
    ref: React.RefObject<HTMLDivElement>,
    selectedRef: React.MutableRefObject<number>,
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
            Math.min(values.length - 1, Math.round(event.currentTarget.scrollTop / TIME_WHEEL_ITEM_HEIGHT)),
          );
          const nextValue = values[index];
          selectedRef.current = nextValue;
          setSelected(nextValue);
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
              selectedRef.current = item;
              setSelected(item);
              // Do not animate this correction: an in-flight smooth scroll can
              // emit intermediate scroll events and overwrite the value just
              // selected before the user confirms the dialog.
              setTimeWheelPosition(ref.current, item);
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
          <DialogDescription className="text-center">برای انتخاب، ساعت و دقیقه را بالا یا پایین بکش.</DialogDescription>
          <div className="relative mx-auto mt-5 grid max-w-[19rem] grid-cols-[1fr_auto_1fr] items-center gap-3" dir="ltr">
            {wheel(hours, hour, setHour, hourRef, selectedHourRef, 'ساعت')}
            <span className="text-2xl font-black text-muted">:</span>
            {wheel(minutes, minute, setMinute, minuteRef, selectedMinuteRef, 'دقیقه')}
          </div>
          <div className="mt-5 flex justify-center gap-2">
            <DialogClose asChild><Button variant="ghost">انصراف</Button></DialogClose>
            <Button
              variant="primary"
              onClick={() => {
                onChange(
                  `${String(selectedHourRef.current).padStart(2, '0')}:${String(selectedMinuteRef.current).padStart(2, '0')}`,
                );
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

export function WeeklySchedulePage({
  salonId,
  staff,
  onCancel,
  onSaved,
}: {
  salonId: string;
  staff: SalonStaff[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [target, setTarget] = useState('salon');
  const [hours, setHours] = useState<WeeklyWorkingHour[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [bookingWindowDays, setBookingWindowDays] = useState(14);
  const [workMode, setWorkMode] = useState<SalonWorkMode | ''>('');
  const [breakEnabled, setBreakEnabled] = useState(false);
  const [breakStart, setBreakStart] = useState('13:00');
  const [breakEnd, setBreakEnd] = useState('14:00');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const request =
      target === 'salon'
        ? workingHoursApi.getSalon(salonId)
        : workingHoursApi.getStaff(salonId, target);
    Promise.all([
      request,
      bookingPolicyApi.get(salonId).catch(() => ({ bookingWindowDays: 14, workMode: undefined })),
    ])
      .then(([res, policy]) => {
        if (!active) return;
        setHours(res.hours);
        setBookingWindowDays(policy.bookingWindowDays);
        if (policy.workMode) setWorkMode(policy.workMode);
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
  }, [salonId, target]);

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
      if (workMode) await bookingPolicyApi.set(salonId, bookingWindowDays, workMode);
      else await bookingPolicyApi.set(salonId, bookingWindowDays);
      onSaved();
    } catch {
      setError('ذخیره برنامه کاری انجام نشد. دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      data-testid="owner-weekly-schedule"
      className="overflow-hidden rounded-2xl border border-border bg-elevated shadow-1"
    >
        <header className="relative overflow-hidden border-b border-border bg-gradient-to-l from-primary/20 via-primary/10 to-transparent px-4 py-4 sm:px-8 sm:py-6">
          <div className="absolute -start-12 -top-20 h-44 w-44 rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
          <div className="relative flex items-start gap-3 sm:gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-contrast shadow-2 sm:h-12 sm:w-12 sm:rounded-2xl">
              <CalendarClock className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <span className="mb-0.5 block text-[0.7rem] font-bold text-primary sm:mb-1 sm:text-xs">تنظیمات تقویم سالن</span>
              <h1 className="text-xl font-black text-text sm:text-3xl">برنامه کاری هفتگی</h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted sm:text-sm sm:leading-6">
                روزهای کاری و ساعت رزرو مشتری را تنظیم کن.
              </p>
            </div>
          </div>
        </header>
        <div className="p-3 sm:p-6">
          <div className="flex flex-col gap-5">
          <section aria-label="تنظیمات اصلی" className="grid gap-4 rounded-2xl border border-border bg-surface p-4 shadow-1 min-[520px]:grid-cols-2 sm:p-5">
            <Select
              label="برنامه برای"
              value={target}
              onValueChange={setTarget}
              options={[
                { value: 'salon', label: 'کل سالن و همه آرایشگرها' },
                ...staff
                  .filter((item) => item.active && item.role !== 'Admin')
                  .map((item) => ({ value: item.id, label: item.fullName || 'آرایشگر بدون نام' })),
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
            <Select
              label="مدل فعالیت"
              value={workMode || 'not_decided'}
              onValueChange={(value) => setWorkMode(value as SalonWorkMode)}
              options={[
                { value: 'fixed_salon', label: 'سالن یا محل ثابت' },
                { value: 'rented_chair', label: 'صندلی یا اتاق اجاره‌ای' },
                { value: 'home', label: 'خدمات در محل کار خودم' },
                { value: 'mobile', label: 'خدمات در محل مشتری' },
                { value: 'hybrid', label: 'هم سالن، هم محل مشتری' },
                { value: 'not_decided', label: 'هنوز تصمیم نگرفته‌ام' },
              ]}
              helperText="در حالت سیار، رزروها روی مسیر اختصاصی همان آرایشگر ثبت می‌شوند."
            />
          </section>
          <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-2">
            <Button type="button" size="md" variant="secondary" onClick={copyFirstOpenDay} className="w-full">
              همین ساعت برای همه روزها
            </Button>
            <Button type="button" size="md" variant="secondary" onClick={applyThursdayFridayOff} className="w-full">
              پنجشنبه و جمعه تعطیل
            </Button>
          </div>
          <section className={cn('rounded-2xl border p-4 transition-colors sm:p-5', breakEnabled ? 'border-warning/40 bg-warning/5' : 'border-border bg-surface')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/15 text-warning"><Coffee className="h-5 w-5" aria-hidden="true" /></span>
                <div>
                  <strong className="block text-sm text-text">زمان استراحت تکرارشونده</strong>
                  <p className="mt-1 text-xs text-muted">مثلاً هر روز زمان ناهار رزرو جدید گرفته نشود.</p>
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
                <TimeWheelField label="شروع استراحت" value={breakStart} onChange={setBreakStart} />
                <TimeWheelField label="پایان استراحت" value={breakEnd} onChange={setBreakEnd} />
              </div>
            )}
          </section>
          {loading ? (
            <Skeleton variant="rect" className="h-72 rounded-lg" />
          ) : (
            <section aria-label="روزهای هفته" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-1">
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
                        <TimeWheelField label="شروع" value={row.startTime} onChange={(value) => setDay(weekday, { startTime: value })} />
                        <TimeWheelField label="پایان" value={row.endTime} onChange={(value) => setDay(weekday, { endTime: value })} />
                      </>
                    )}
                  </div>
                );
              })}
            </section>
          )}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          </div>
        </div>
          <footer className="flex items-center justify-between gap-3 border-t border-border bg-elevated/95 px-3 py-3 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur sm:px-6 sm:py-4">
            <span className="hidden text-xs text-muted sm:block">تغییرات بعد از ذخیره روی رزرو مشتری اعمال می‌شوند.</span>
            <div className="ms-auto grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button type="button" variant="ghost" disabled={saving} onClick={onCancel} className="w-full sm:w-auto">
              انصراف
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={saving}
              disabled={saving || loading}
              onClick={() => void save()}
              className="w-full sm:w-auto"
            >
              ذخیره برنامه هفتگی
            </Button>
            </div>
          </footer>
    </section>
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
          {getJalaliMonthName(jalali.jm)} — ساعت‌های معمول سالن باز می‌مانند؛ فقط تعطیلی‌ها را مشخص کن.
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
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2">
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
              mode === 'full' ? 'border-danger bg-danger/10 text-danger' : 'border-border bg-surface text-text',
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
              mode === 'range' ? 'border-warning bg-warning/10 text-warning' : 'border-border bg-surface text-text',
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
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={busy}>انصراف</Button>
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
      className="grid w-full grid-cols-2 rounded-xl border border-border bg-bg p-1 sm:inline-flex sm:w-auto sm:rounded-lg"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={view === tab.key}
          aria-keyshortcuts={tab.shortcut}
          className={cn(
            'relative min-h-10 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors duration-fast ease-standard sm:min-h-0 sm:rounded-md sm:px-4 sm:text-sm',
            (tab.key === 'month' || tab.key === 'list') && 'hidden sm:inline-flex',
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
  onManage,
}: {
  view: CalendarView;
  anchor: Date;
  onNavigate: (dir: -1 | 0 | 1) => void;
  onManage: () => void;
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

      <Button
        variant="ghost"
        size="md"
        aria-label="مدیریت روز"
        onClick={onManage}
        className="owner-calendar-manage-inline sm:hidden"
      >
        <Settings2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </nav>
  );
}

function ManualBookingDialog({
  salonId,
  date,
  initialStart,
  initialPhone,
  initialFullName,
  initialServiceId,
  open,
  onOpenChange,
  onChanged,
}: {
  salonId: string;
  date: Date;
  initialStart?: string;
  initialPhone?: string;
  initialFullName?: string;
  initialServiceId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [services, setServices] = useState<
    Array<{ id: string; name: string; durationMinutes: number }>
  >([]);
  const [serviceId, setServiceId] = useState('');
  const [startAt, setStartAt] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedClient, setSelectedClient] = useState<SalonClient | null>(null);
  const [locationTypes, setLocationTypes] = useState<Array<'salon' | 'customer'>>(['salon']);
  const [locationType, setLocationType] = useState<'salon' | 'customer'>('salon');
  const [locationAddress, setLocationAddress] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<SalonClient[]>([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactStatus, setContactStatus] = useState<
    'idle' | 'success' | 'unsupported' | 'empty' | 'error'
  >('idle');
  const [error, setError] = useState('');

  const toInputValue = useCallback(() => {
    const value = new Date(date);
    if (initialStart) {
      const match = /^(\d{2}):(\d{2})$/.exec(initialStart);
      if (match) value.setHours(Number(match[1]), Number(match[2]), 0, 0);
    }
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }, [date, initialStart]);

  useEffect(() => {
    if (!open) return;
    setStartAt(toInputValue());
    setPhone(initialPhone ?? '');
    setFullName(initialFullName ?? '');
    setSelectedClient(null);
    setLocationTypes(['salon']);
    setLocationType('salon');
    setLocationAddress('');
    setClientSearch('');
    setClientResults([]);
    setClientSearchLoading(false);
    setContactStatus('idle');
    setError('');
    setLoading(true);
    salonApi
      .getServices(salonId)
      .then((response) => {
        const next = response.services.map((service) => ({
          id: service.id,
          name: service.name,
          durationMinutes: service.durationMinutes,
        }));
        setServices(next);
        setServiceId(
          initialServiceId && next.some((service) => service.id === initialServiceId)
            ? initialServiceId
            : next[0]?.id || '',
        );
      })
      .catch(() => {
        setServices([]);
        setError('دریافت فهرست خدمات انجام نشد.');
      })
      .finally(() => setLoading(false));
  }, [
    open,
    salonId,
    toInputValue,
    initialPhone,
    initialFullName,
    initialServiceId,
  ]);

  useEffect(() => {
    if (!open || typeof salonApi.getBookingPolicy !== 'function') return;
    let active = true;
    salonApi
      .getBookingPolicy(salonId)
      .then((policy) => {
        if (!active) return;
        const supported = (policy.locationTypes ?? []).filter(
          (value): value is 'salon' | 'customer' => value === 'salon' || value === 'customer',
        );
        const nextTypes: Array<'salon' | 'customer'> =
          supported.length > 0 ? supported : ['salon'];
        setLocationTypes(nextTypes);
        setLocationType((current) =>
          nextTypes.includes(current) ? current : nextTypes[0] ?? 'salon',
        );
      })
      .catch(() => {
        if (active) {
          setLocationTypes(['salon']);
          setLocationType('salon');
        }
      });
    return () => {
      active = false;
    };
  }, [open, salonId]);

  // Booksy/Fresha-style client lookup: search only after two characters so the
  // dialog stays fast on a phone and does not load the whole client book.
  useEffect(() => {
    const term = clientSearch.trim();
    const searchTerm = normalizeContactDigits(term);
    if (!open || selectedClient || term.length < 2) {
      setClientResults([]);
      setClientSearchLoading(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      setClientSearchLoading(true);
      clientBookApi
        .list(salonId, searchTerm)
        .then((response) => {
          if (active) setClientResults(response.clients.slice(0, 6));
        })
        .catch(() => {
          if (active) setClientResults([]);
        })
        .finally(() => {
          if (active) setClientSearchLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [clientSearch, open, salonId, selectedClient]);

  const handleClientSelect = (client: SalonClient) => {
    setSelectedClient(client);
    setClientSearch('');
    setClientResults([]);
    setPhone(normalizeIranianMobile(client.phone) ?? client.phone);
    setFullName(client.fullName?.trim() ?? '');
    setError('');
  };

  const handleNewClient = () => {
    setSelectedClient(null);
    setClientSearch('');
    setClientResults([]);
    setPhone('');
    setFullName('');
    setError('');
  };

  const handleContactPick = async () => {
    const picker = getContactPicker();
    if (!picker) {
      setContactStatus('unsupported');
      return;
    }

    setContactLoading(true);
    setContactStatus('idle');
    try {
      const contacts = await picker.select(['name', 'tel'], { multiple: false });
      const contact = contacts[0];
      const selectedPhone = (contact?.tel ?? [])
        .map((value) => normalizeIranianMobile(value))
        .find((value): value is string => Boolean(value));
      if (!selectedPhone) {
        setContactStatus('empty');
        return;
      }
      setPhone(selectedPhone);
      setFullName(contact?.name?.find((value) => value.trim())?.trim() ?? '');
      setContactStatus('success');
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') {
        setContactStatus('error');
      }
    } finally {
      setContactLoading(false);
    }
  };

  const handleVCardImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setContactLoading(true);
    setContactStatus('idle');
    try {
      const parsed = parseVCard(await file.text());
      const selectedPhone = parsed.phones
        .map((value) => normalizeIranianMobile(value))
        .find((value): value is string => Boolean(value));
      if (!selectedPhone) {
        setContactStatus('empty');
        return;
      }
      setPhone(selectedPhone);
      setFullName(parsed.name ?? '');
      setContactStatus('success');
    } catch {
      setContactStatus('error');
    } finally {
      setContactLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedPhone = normalizeIranianMobile(phone);
    if (!serviceId || !startAt || !normalizedPhone) {
      setError('خدمت، زمان و شماره موبایل معتبر وارد کنید.');
      return;
    }
    const normalizedAddress = locationAddress.trim();
    if (locationType === 'customer' && normalizedAddress.length < 5) {
      setError('آدرس مراجعه مشتری را کامل وارد کنید.');
      return;
    }
    if (locationType === 'customer' && normalizedAddress.length > 300) {
      setError('آدرس مراجعه نمی‌تواند بیشتر از ۳۰۰ نویسه باشد.');
      return;
    }
    const start = new Date(startAt);
    if (Number.isNaN(start.getTime())) {
      setError('زمان انتخاب‌شده معتبر نیست.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adminApi.createManualAppointment(salonId, {
        serviceId,
        startAt: start.toISOString(),
        phone: normalizedPhone,
        ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
        ...(locationType === 'customer'
          ? { locationType: 'customer' as const, locationAddress: normalizedAddress }
          : {}),
      });
      onChanged();
      onOpenChange(false);
    } catch {
      setError('ثبت نوبت انجام نشد؛ این زمان احتمالاً پر شده است.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="manual-booking-dialog !w-[calc(100%-1rem)] !max-w-lg !max-h-[calc(100dvh-1rem)] !rounded-2xl !p-4 sm:!p-5">
        <DialogTitle className="!text-xl !font-bold tracking-tight">ثبت نوبت حضوری</DialogTitle>
        <DialogDescription className="!mt-2 max-w-xl leading-6">
          نوبت حضوری هم از همان ظرفیت آرایشگر و صندلی استفاده می‌کند؛ بنابراین رزرو هم‌زمان ثبت نمی‌شود.
        </DialogDescription>
        <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <User className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="m-0 text-sm font-bold text-text">مشتری</h3>
                <p className="m-0 mt-1 text-xs leading-5 text-muted">
                  مشتری قبلی را پیدا کن یا اطلاعات مشتری جدید را وارد کن.
                </p>
              </div>
            </div>
            {selectedClient && (
              <Button type="button" variant="ghost" size="md" onClick={handleNewClient} disabled={saving}>
                تغییر
              </Button>
            )}
          </div>

          {selectedClient ? (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-primary/20 bg-bg p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <strong className="block truncate text-sm text-text">
                  {selectedClient.fullName?.trim() || 'مشتری بدون نام'}
                </strong>
                <span className="mt-0.5 block text-xs text-muted" dir="ltr">
                  {toPersianDigits(normalizeIranianMobile(selectedClient.phone) ?? selectedClient.phone)}
                </span>
              </div>
            </div>
          ) : (
            <>
              <TextField
                label="جست‌وجوی مشتری قبلی"
                placeholder="نام یا شماره موبایل"
                value={clientSearch}
                onChange={(event) => setClientSearch(event.target.value)}
                disabled={saving || loading}
                autoComplete="off"
              />
              {clientSearch.trim().length >= 2 && (
                <div className="mt-2">
                  {clientSearchLoading && (
                    <p className="m-0 px-1 text-xs text-muted" role="status">
                      در حال جست‌وجو…
                    </p>
                  )}
                  {!clientSearchLoading && clientResults.length > 0 && (
                    <ul className="max-h-44 overflow-y-auto rounded-lg border border-border bg-bg">
                      {clientResults.map((client) => (
                        <li key={client.id} className="border-b border-border last:border-b-0">
                          <button
                            type="button"
                            className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-start transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                            onClick={() => handleClientSelect(client)}
                          >
                            <User className="size-4 shrink-0 text-primary" aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-text">
                                {client.fullName?.trim() || 'مشتری بدون نام'}
                              </span>
                              <span className="block text-xs text-muted" dir="ltr">
                                {toPersianDigits(normalizeIranianMobile(client.phone) ?? client.phone)}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!clientSearchLoading && clientResults.length === 0 && (
                    <p className="m-0 px-1 text-xs text-muted">
                      مشتری پیدا نشد؛ اطلاعات را دستی وارد کن.
                    </p>
                  )}
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button type="button" variant="secondary" size="md" className="w-full" onClick={handleNewClient} disabled={saving || loading}>
                  مشتری جدید / ورود دستی
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  className="w-full"
                  startIcon={<ContactRound className="h-4 w-4" />}
                  onClick={() => void handleContactPick()}
                  loading={contactLoading}
                  disabled={saving || loading || contactLoading}
                >
                  از مخاطبین تلفن
                </Button>
                <label className="col-span-2 inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-bg px-3 py-2 text-xs font-bold text-muted transition-colors hover:bg-elevated hover:text-text focus-within:outline focus-within:outline-2 focus-within:outline-focus">
                  <input
                    type="file"
                    accept=".vcf,text/vcard"
                    className="sr-only"
                    onChange={(event) => void handleVCardImport(event)}
                    disabled={saving || loading || contactLoading}
                  />
                  <ContactRound className="h-3.5 w-3.5" aria-hidden="true" />
                  فایل مخاطب
                </label>
              </div>
            </>
          )}
          {contactStatus === 'success' && (
            <p role="status" className="m-0 mt-2 text-xs text-success">
              اطلاعات مخاطب وارد شد؛ قبل از ثبت بررسی کن.
            </p>
          )}
          {contactStatus === 'unsupported' && (
            <p role="status" className="m-0 mt-2 text-xs text-muted">
              انتخاب مستقیم مخاطبین فعال نیست؛ فایل .vcf مخاطب را انتخاب کن یا شماره را دستی وارد کن.
            </p>
          )}
          {contactStatus === 'empty' && (
            <p role="status" className="m-0 mt-2 text-xs text-warning">
              این مخاطب شماره موبایل معتبر ندارد؛ شماره را دستی وارد کن.
            </p>
          )}
          {contactStatus === 'error' && (
            <p role="alert" className="m-0 mt-2 text-xs text-danger">
              دریافت مخاطب انجام نشد؛ شماره را دستی وارد کن.
            </p>
          )}
        </div>
        <form onSubmit={(event) => void submit(event)} className="mt-5 flex flex-col gap-4">
          <Select
            label="خدمت"
            value={serviceId}
            onValueChange={setServiceId}
            options={services.map((service) => ({
              value: service.id,
              label: `${service.name} · ${toPersianDigits(String(service.durationMinutes))} دقیقه`,
            }))}
            placeholder={loading ? 'در حال دریافت خدمات…' : 'انتخاب خدمت'}
            disabled={loading || saving}
            emptyText="خدمتی ثبت نشده است"
          />
          <TextField
            label="زمان شروع"
            type="datetime-local"
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
            disabled={saving}
            dir="ltr"
          />
          {locationTypes.length > 1 && (
            <Select
              label="محل ارائه خدمت"
              value={locationType}
              onValueChange={(value) => setLocationType(value as 'salon' | 'customer')}
              options={[
                { value: 'salon', label: 'در سالن / محل کار' },
                { value: 'customer', label: 'در محل مشتری' },
              ].filter((option) => locationTypes.includes(option.value as 'salon' | 'customer'))}
              disabled={saving}
            />
          )}
          {locationType === 'customer' && (
            <TextField
              label="آدرس مراجعه مشتری"
              placeholder="شهر، خیابان، کوچه، پلاک…"
              value={locationAddress}
              onChange={(event) => setLocationAddress(event.target.value)}
              disabled={saving}
              helperText="برای جلوگیری از ثبت اشتباه، آدرس را کامل بنویسید."
            />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <TextField
                label="موبایل مشتری"
                placeholder="09xxxxxxxxx"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                disabled={saving}
                inputMode="tel"
                dir="ltr"
              />
            </div>
            <TextField
              label="نام مشتری (اختیاری)"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              disabled={saving}
            />
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="mt-2 flex items-center justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="min-w-20" disabled={saving}>انصراف</Button>
            </DialogClose>
            <Button type="submit" className="min-w-28" loading={saving} disabled={saving || loading || !serviceId}>
              ثبت نوبت
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
function ApprovalQueue({
  salonId,
  onResolved,
  refreshKey,
  className,
}: {
  salonId: string;
  refreshKey?: number;
  onResolved: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Appointment[]>([]);
  const [canApproveOwnAppointments, setCanApproveOwnAppointments] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const pendingPagination = usePagination(pending, 3);
  const previewPending = pending.slice(0, 1);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
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
        setCanApproveOwnAppointments(res.canApproveOwnAppointments !== false);
        setPending(res.appointments.map((a, i) => toAppointment(a, `pending-${i}`)));
      })
      .catch(() => {
        if (active) setPending([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [salonId]);

  useEffect(() => load(), [load, refreshKey]);

  const handleAction = useCallback(
    async (id: string, kind: 'approve' | 'reject') => {
      if (!canApproveOwnAppointments) return;
      setBusy(`${id}:${kind}`);
      setActionError('');
      try {
        if (kind === 'approve') {
          await adminApi.approveAppointment(id);
        } else {
          await adminApi.rejectAppointment(id);
        }
        setPending((list) => list.filter((a) => a.id !== id));
        onResolved();
      } catch (error) {
        const errorCode =
          error instanceof ApiError
            ? error.code
            : typeof error === 'object' && error !== null && 'code' in error
              ? (error as { code?: unknown }).code
              : undefined;
        if (errorCode === 'APPOINTMENT_NOT_PENDING') {
          setPending((list) => list.filter((a) => a.id !== id));
          setActionError('این رزرو قبلاً تعیین تکلیف شده است؛ صف به‌روزرسانی شد.');
          void load();
        } else {
          setActionError('تغییر وضعیت رزرو انجام نشد. دوباره تلاش کنید.');
        }
      } finally {
        setBusy(null);
      }
    },
    [canApproveOwnAppointments, load, onResolved],
  );

  if (loading && pending.length === 0 && !actionError) return null;
  if (pending.length === 0 && !actionError) return null;

  const renderPendingRow = (appt: Appointment) => {
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
        className="grid gap-2 rounded-lg border border-border bg-surface p-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      >
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-text">
              <Scissors className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              <span className="truncate">{appt.serviceName ?? '—'}</span>
            </span>
            {appt.customerName && (
              <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted">
                <User className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{appt.customerName}</span>
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums text-muted">
            {start && dateLabel && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                <Num value={dateLabel} /> <span aria-hidden>·</span> <Num value={start} />
              </span>
            )}
            {appt.staffName && (
              <span>
                {t('owner.calendar.withStaff', { defaultValue: 'با' })}: {appt.staffName}
              </span>
            )}
            {appt.locationType === 'customer' && appt.locationAddress && (
              <span className="max-w-full truncate" title={appt.locationAddress}>
                آدرس مراجعه: {appt.locationAddress}
              </span>
            )}
          </div>
        </div>
        {canApproveOwnAppointments ? (
          <div className="flex shrink-0 items-center gap-2 border-t border-border/50 pt-1.5 sm:border-t-0 sm:pt-0">
            <Button
              size="md"
              variant="danger"
              onClick={() => handleAction(appt.id, 'reject')}
              disabled={isBusy}
              startIcon={<X className="h-4 w-4" />}
              className="min-h-10 flex-1 px-3 text-xs sm:flex-none"
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
              className="min-h-10 flex-1 px-3 text-xs sm:flex-none"
            >
              {busy === `${appt.id}:approve`
                ? t('owner.calendar.approving', { defaultValue: 'در حال تأیید...' })
                : t('owner.calendar.approve', { defaultValue: 'تأیید' })}
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted">منتظر تأیید مالک یا مدیر</span>
        )}
      </li>
    );
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {actionError && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {actionError}
        </p>
      )}
      {pending.length > 0 && (
        <section
          data-testid="owner-approval-queue"
          id="owner-approval-queue"
          aria-label={t('owner.calendar.approvalQueue', {
            defaultValue: 'نوبت‌های در انتظار تأیید',
          })}
          className="rounded-xl border border-warning/40 bg-warning/5 p-3 sm:p-4"
        >
      <header className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
          <Hourglass className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-text">
              {t('owner.calendar.approvalQueue', { defaultValue: 'نوبت‌های در انتظار تأیید' })}
            </h2>
            <span
              aria-live="polite"
              className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-bold text-warning tabular-nums"
            >
              <Num value={pending.length} />
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {canApproveOwnAppointments
              ? t('owner.calendar.approvalBody', {
                  defaultValue: 'این رزروها منتظر تأیید شما هستند',
                })
              : t('owner.calendar.approvalOwnerOnly', {
                  defaultValue: 'این رزروها برای تأیید مالک یا مدیر ارسال شده‌اند.',
                })}
          </p>
        </div>
      </header>

        <div id="owner-approval-queue-list" className="mt-3">
        <ul role="list" className="flex flex-col gap-1.5">
          {previewPending.map(renderPendingRow)}
        </ul>
        {pending.length > 1 && canApproveOwnAppointments && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border/70 bg-bg/40 p-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 text-xs text-muted">
              و <Num value={pending.length - 1} /> نوبت دیگر هم منتظر تأیید هستند.
            </p>
            <Button
              variant="ghost"
              size="md"
              className="w-full shrink-0 text-xs sm:w-auto"
              onClick={() => {
                pendingPagination.resetPage();
                setApprovalDialogOpen(true);
              }}
              aria-haspopup="dialog"
              aria-expanded={approvalDialogOpen}
              data-testid="owner-approval-queue-toggle"
            >
              مشاهده و مدیریت همه
            </Button>
          </div>
        )}
      </div>

      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent className="!max-w-xl !p-3 sm:!p-5">
          <div className="pe-10">
            <DialogTitle className="text-base sm:text-lg">
              مدیریت نوبت‌های در انتظار تأیید
              <span className="ms-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-bold text-warning tabular-nums">
                <Num value={pending.length} />
              </span>
            </DialogTitle>
            <DialogDescription>
              هر نوبت را بررسی کن و تأیید یا ردش کن.
            </DialogDescription>
          </div>
          <div className="mt-4">
            <ul role="list" className="flex flex-col gap-1.5">
              {pendingPagination.pageItems.map(renderPendingRow)}
            </ul>
            <Pagination
              page={pendingPagination.page}
              pageSize={pendingPagination.pageSize}
              total={pendingPagination.total}
              onPageChange={pendingPagination.goToPage}
              ariaLabel="صفحه‌بندی نوبت‌های در انتظار تأیید"
              testId="owner-approval-queue-pagination"
              compact
              className="mt-3"
            />
          </div>
          <div className="mt-3 flex justify-end border-t border-border pt-3">
            <DialogClose asChild>
              <Button variant="ghost" className="w-full sm:w-auto">بستن</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
        </section>
      )}
    </div>
  );
}

// ─── Deposit Receipt Queue ───────────────────────────────────────────────────

/**
 * Card-transfer bookings stay `held` until their receipt is reviewed. They
 * therefore cannot use the regular pending-booking queue; this queue keeps
 * every uploaded receipt visible from the salon landing surface.
 */
function PendingDepositReceiptQueue({
  salonId,
  refreshKey,
  onOpen,
  className,
}: {
  salonId: string;
  refreshKey?: number;
  onOpen: (appointment: Appointment) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [receipts, setReceipts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const pagination = usePagination(receipts, 4);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    // Keep embedded/test hosts that predate the receipt queue compatible.
    if (typeof adminApi.getPendingDepositReceipts !== 'function') {
      setReceipts([]);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    adminApi
      .getPendingDepositReceipts(salonId)
      .then((response) => {
        if (!active) return;
        setReceipts((response.receipts ?? []).map((receipt, index) =>
          toAppointment(receipt, receipt.appointmentId || receipt.receiptId || `receipt-${index}`),
        ));
      })
      .catch(() => {
        if (!active) return;
        setReceipts([]);
        setLoadError('صف رسیدهای بیعانه بارگذاری نشد.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [salonId, refreshKey]);

  if (loading && receipts.length === 0 && !loadError) return null;
  if (receipts.length === 0 && !loadError) return null;

  const renderReceiptRow = (appointment: Appointment) => {
    const start = clockTime(appointment.startAt);
    const dateKey = appointment.startAt ? localDateKey(appointment.startAt) : null;
    const dateText = dateKey
      ? (() => {
          const date = new Date(dateKey + 'T00:00:00');
          const jalali = jalaliDayDisplay(date);
          return `${getJalaliMonthName(jalali.jm)} ${jalali.jd} ${jalali.jy}`;
        })()
      : 'زمان نامشخص';
    return (
      <li
        key={appointment.id}
        className="grid gap-2 rounded-lg border border-border bg-surface p-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      >
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-text">
              <CreditCard className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span className="truncate">{appointment.serviceName ?? 'خدمت'}</span>
            </span>
            {appointment.customerName && (
              <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted">
                <User className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{appointment.customerName}</span>
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span><Num value={dateText} /> · <Num value={start ?? '—'} /></span>
            {appointment.staffName && <span>با {appointment.staffName}</span>}
            {appointment.depositAmountRial != null && (
              <Money amountRial={appointment.depositAmountRial} className="font-semibold text-primary" />
            )}
          </div>
        </div>
        <Button
          type="button"
          size="md"
          variant="primary"
          startIcon={<CreditCard className="h-4 w-4" />}
          onClick={() => onOpen(appointment)}
          className="min-h-10 w-full text-xs sm:w-auto"
        >
          بررسی رسید
        </Button>
      </li>
    );
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {loadError && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {loadError}
        </p>
      )}
      {receipts.length > 0 && (
        <section
          data-testid="owner-deposit-receipt-queue"
          aria-label="رسیدهای بیعانه در انتظار بررسی"
          className="rounded-xl border border-primary/40 bg-primary/5 p-3 sm:p-4"
        >
          <header className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <CreditCard className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-text">رسیدهای بیعانه در انتظار بررسی</h2>
                <span aria-live="polite" className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary tabular-nums">
                  <Num value={receipts.length} />
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">رسید را ببین و بعد نوبت را تأیید یا رد کن.</p>
            </div>
          </header>
          <ul role="list" className="mt-3 flex flex-col gap-1.5">
            {receipts.slice(0, 2).map(renderReceiptRow)}
          </ul>
          {receipts.length > 2 && (
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => {
                pagination.resetPage();
                setDialogOpen(true);
              }}
              className="mt-3 w-full text-xs"
            >
              مشاهده همه رسیدها (<Num value={receipts.length} />)
            </Button>
          )}
        </section>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="!max-w-xl !p-3 sm:!p-5">
          <div className="pe-10">
            <DialogTitle className="text-base sm:text-lg">رسیدهای بیعانه</DialogTitle>
            <DialogDescription>رسید هر مشتری را بررسی و نتیجه را ثبت کن.</DialogDescription>
          </div>
          <ul role="list" className="mt-4 flex flex-col gap-1.5">
            {pagination.pageItems.map(renderReceiptRow)}
          </ul>
          <Pagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onPageChange={pagination.goToPage}
            ariaLabel={t('owner.calendar.depositReceiptPagination', { defaultValue: 'صفحه‌بندی رسیدهای بیعانه' })}
            testId="owner-deposit-receipt-pagination"
            compact
            className="mt-3"
          />
          <div className="mt-3 flex justify-end border-t border-border pt-3">
            <DialogClose asChild>
              <Button variant="ghost" className="w-full sm:w-auto">بستن</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
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
function waitlistDateLabel(iso?: string): string {
  if (!iso) return 'زمان نامشخص';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'زمان نامشخص';
  const jalali = jalaliDayDisplay(date);
  return (
    PERSIAN_WEEKDAYS[iranianDayIndex(date)] +
    ' ' +
    toPersianDigits(String(jalali.jd)) +
    ' ' +
    getJalaliMonthName(jalali.jm)
  );
}

function OwnerWaitlistCard({
  salonId,
  refreshKey,
  onBook,
}: {
  salonId: string;
  refreshKey: number;
  onBook: (entry: OwnerWaitlistEntry) => void;
}) {
  const [entries, setEntries] = useState<OwnerWaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    if (typeof adminApi.getWaitlist !== 'function') {
      setEntries([]);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const from = new Date();
    const to = new Date(from);
    to.setDate(to.getDate() + 31);
    setLoading(true);
    setLoadError('');
    adminApi
      .getWaitlist(salonId, from.toISOString(), to.toISOString())
      .then((response) => {
        if (active) setEntries(response.waitlist ?? []);
      })
      .catch(() => {
        if (active) {
          setEntries([]);
          setLoadError('صف انتظار بارگذاری نشد.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [salonId, refreshKey]);

  if (loading && entries.length === 0) {
    return null;
  }
  if (!loading && entries.length === 0 && !loadError) {
    return null;
  }

  return (
    <section
      data-testid="owner-waitlist"
      aria-label="صف انتظار"
      className="owner-calendar-approval rounded-2xl border border-warning/30 bg-warning/5 p-3 shadow-1 sm:p-4"
    >
      <header className="flex items-start gap-2">
        <ListChecks className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-sm font-bold text-text">صف انتظار</h2>
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-bold text-warning">
              <Num value={String(entries.length)} />
            </span>
          </div>
          <p className="m-0 mt-1 text-xs text-muted">
            اگر زمانی خالی شد، مشتری مناسب را سریع به نوبت تبدیل کن.
          </p>
        </div>
      </header>

      {loadError ? (
        <p role="alert" className="m-0 mt-3 text-xs text-danger">{loadError}</p>
      ) : (
        <ul role="list" className="mt-3 flex flex-col gap-2">
          {entries.slice(0, 5).map((entry) => {
            const phone = entry.customerPhone
              ? normalizeIranianMobile(entry.customerPhone) ?? entry.customerPhone
              : '';
            return (
              <li
                key={entry.id}
                className="flex flex-col gap-2 rounded-xl border border-warning/20 bg-surface p-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <strong className="block truncate text-sm text-text">
                    {entry.customerName || 'مشتری بدون نام'}
                  </strong>
                  <span className="mt-1 block truncate text-xs text-muted">
                    {entry.serviceName || 'خدمت انتخاب نشده'} · {waitlistDateLabel(entry.windowStart)} ·{' '}
                    <Num value={clockTime(entry.windowStart) ?? '—'} /> تا <Num value={clockTime(entry.windowEnd) ?? '—'} />
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {phone && (
                    <>
                      <a
                        href={'tel:' + phone}
                        aria-label={'تماس با ' + (entry.customerName || 'مشتری')}
                        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-success/30 bg-success/10 text-success hover:bg-success/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        <Phone className="h-4 w-4" aria-hidden="true" />
                      </a>
                      <a
                        href={'sms:' + phone}
                        aria-label={'پیامک به ' + (entry.customerName || 'مشتری')}
                        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </>
                  )}
                  <Button
                    type="button"
                    size="md"
                    variant="primary"
                    onClick={() => onBook(entry)}
                    disabled={!phone}
                  >
                    ثبت نوبت
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {entries.length > 5 && (
        <p className="m-0 mt-2 text-xs text-muted">
          <Num value={String(entries.length - 5)} /> مشتری دیگر در صف هستند.
        </p>
      )}
    </section>
  );
}

function QuickApprovalPolicy({ salonId, className }: { salonId: string; className?: string }) {
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
      data-testid="owner-approval-policy"
      id="owner-approval-policy"
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-1 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
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
                selected ? 'bg-primary text-primary-contrast shadow-1' : 'text-muted hover:text-text',
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

function CalendarActionsSheet({
  salonId,
  open,
  onOpenChange,
  onWorkingHours,
  onAvailability,
  onEmergencyClose,
  showApprovalPolicy,
}: {
  salonId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWorkingHours: () => void;
  onAvailability: () => void;
  onEmergencyClose: () => void;
  showApprovalPolicy: boolean;
}) {
  const [approvalOpen, setApprovalOpen] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) setApprovalOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        data-testid="owner-calendar-action-sheet"
        className="owner-calendar-action-sheet !p-4 sm:!p-5"
      >
        {approvalOpen ? (
          <>
            <div className="flex items-center gap-2 pe-10">
              <Button
                variant="ghost"
                size="md"
                startIcon={<ChevronRight className="h-4 w-4 rtl:-scale-x-100" />}
                onClick={() => setApprovalOpen(false)}
                className="!px-2"
              >
                بازگشت
              </Button>
              <SheetTitle className="text-xl font-bold">تأیید رزروهای جدید</SheetTitle>
            </div>
            <SheetDescription>
              انتخاب کن رزروهای جدید خودکار قطعی شوند یا قبل از ثبت نهایی تأییدشان کنی.
            </SheetDescription>
            <QuickApprovalPolicy
              salonId={salonId}
              className="mt-4 !rounded-xl !border-border/70 !bg-surface !p-3 !shadow-none sm:!p-3.5"
            />
          </>
        ) : (
          <>
            <div className="pe-10">
              <SheetTitle className="text-xl font-bold">مدیریت روز</SheetTitle>
              <SheetDescription>
                اقدام‌های روزانه را از اینجا انتخاب کن؛ تقویم همیشه خلوت و قابل‌خواندن می‌ماند.
              </SheetDescription>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button
                variant="primary"
                size="md"
                startIcon={<Clock className="h-4 w-4" />}
                onClick={onWorkingHours}
                className="min-h-12 w-full justify-start"
              >
                ساعات کاری
              </Button>
              <Button
                variant="secondary"
                size="md"
                startIcon={<CalendarOff className="h-4 w-4" />}
                onClick={onAvailability}
                className="min-h-12 w-full justify-start"
              >
                تعطیلی‌ها و محدودیت‌ها
              </Button>
              {showApprovalPolicy && (
                <Button
                  variant="secondary"
                  size="md"
                  startIcon={<CheckCircle2 className="h-4 w-4" />}
                  onClick={() => setApprovalOpen(true)}
                  data-testid="owner-calendar-approval-policy-trigger"
                  className="min-h-12 w-full justify-start sm:col-span-2"
                >
                  تأیید رزروهای جدید
                </Button>
              )}
              <Button
                variant="danger"
                size="md"
                startIcon={<TriangleAlert className="h-4 w-4" />}
                onClick={onEmergencyClose}
                className="min-h-12 w-full justify-start sm:col-span-2"
              >
                بستن فوری امروز
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function OwnerCalendarPage() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const salonId = useSalonId();
  const navigate = useNavigate();

  const [view, setView] = useState<CalendarView>(() => initialCalendarView());
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [approvalReloadToken, setApprovalReloadToken] = useState(0);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [closures, setClosures] = useState<SalonClosure[]>([]);
  const [staff, setStaff] = useState<SalonStaff[]>([]);
  const [staffCalendarBlocks, setStaffCalendarBlocks] = useState<StaffCalendarBlock[]>([]);
  const [closureReloadToken, setClosureReloadToken] = useState(0);
  const [manageActionsOpen, setManageActionsOpen] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [availabilityDate, setAvailabilityDate] = useState<Date>(() => new Date());
  const [availabilityStart, setAvailabilityStart] = useState<string | undefined>();
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDate, setManualDate] = useState<Date>(() => new Date());
  const [manualStart, setManualStart] = useState<string | undefined>();
  const [manualCustomer, setManualCustomer] = useState<ManualCustomerPrefill>({});
  const [cancelAppointment, setCancelAppointment] = useState<Appointment | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [noShowAppointment, setNoShowAppointment] = useState<Appointment | null>(null);
  const [noShowBusy, setNoShowBusy] = useState(false);
  const [noShowError, setNoShowError] = useState('');
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emergencyCancelAll, setEmergencyCancelAll] = useState(true);
  const [emergencyBusy, setEmergencyBusy] = useState(false);
  const [emergencyError, setEmergencyError] = useState('');
  const [appointmentListDate, setAppointmentListDate] = useState<Date | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [moveAppointment, setMoveAppointment] = useState<CalendarAppointmentLike | null>(null);
  const [moveError, setMoveError] = useState('');
  const [calendarQuery, setCalendarQuery] = useState('');
  const [calendarStaffId, setCalendarStaffId] = useState('all');
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatusFilter>('all');


  // Track direction for animations
  const [viewDirection, setViewDirection] = useState(0);
  const [dateDirection, setDateDirection] = useState(0);
  const dateKey_ = `${view}-${dateKey(anchor)}`;
  const openDay = useCallback(
    (date: Date) => {
      if (view !== 'day') {
        const order: CalendarView[] = ['day', 'week', 'month', 'list'];
        const oldIdx = order.indexOf(view);
        setViewDirection(order.indexOf('day') > oldIdx ? 1 : -1);
      }
      setDateDirection(0);
      setAppointmentListDate(null);
      setAnchor(new Date(date));
      setView('day');
    },
    [view],
  );

  const openAppointment = useCallback((appointment: Appointment) => {
    setSelectedAppointment(appointment);
  }, []);

  const openRebookAppointment = useCallback((appointment: CalendarAppointmentLike) => {
    setManualCustomer({
      phone: appointment.customerPhone
        ? normalizeIranianMobile(appointment.customerPhone) ?? appointment.customerPhone
        : undefined,
      fullName: appointment.customerName,
      serviceId: appointment.serviceId,
    });
    setManualDate(new Date());
    setManualStart(undefined);
    setSelectedAppointment(null);
    setManualOpen(true);
  }, []);

  const openMoveDialog = useCallback((appointment: CalendarAppointmentLike) => {
    setSelectedAppointment(null);
    setMoveError('');
    setMoveAppointment(appointment);
  }, []);

  const applyMove = useCallback(
    async (appointment: CalendarAppointmentLike, startAt: string) => {
      const nextStart = new Date(startAt);
      if (Number.isNaN(nextStart.getTime())) throw new Error('Invalid appointment time');
      if (
        appointment.startAt &&
        new Date(appointment.startAt).getTime() === nextStart.getTime()
      ) {
        return;
      }

      const nextStartAt = nextStart.toISOString();
      const nextEndAt = movedEndAt(appointment, nextStart);
      const previousStartAt = appointment.startAt;
      const previousEndAt = appointment.endAt;
      const updateLocalAppointment = (
        appointmentId: string,
        updatedStartAt?: string,
        updatedEndAt?: string,
      ) => {
        setAppointments((current) =>
          current.map((item) =>
            item.id === appointment.id
              ? { ...item, id: appointmentId, startAt: updatedStartAt, endAt: updatedEndAt }
              : item,
          ),
        );
      };

      setMoveError('');
      updateLocalAppointment(appointment.id, nextStartAt, nextEndAt);
      try {
        const result = await adminApi.rescheduleAppointment(
          appointment.id,
          nextStartAt,
          appointment.staffMemberId,
        );
        const replacement = result.appointment;
        updateLocalAppointment(
          replacement?.id ?? appointment.id,
          replacement?.startAt ?? nextStartAt,
          replacement?.endAt ?? nextEndAt,
        );
        setApprovalReloadToken((value) => value + 1);
      } catch (error) {
        updateLocalAppointment(appointment.id, previousStartAt, previousEndAt);
        throw error;
      }

      setSelectedAppointment(null);
      setMoveAppointment(null);
      if (
        view === 'day' &&
        appointment.startAt &&
        localDateKey(appointment.startAt) === dateKey(nextStart)
      ) {
        return;
      }
      setAnchor(nextStart);
      setViewDirection(0);
      setView('day');
    },
    [view],
  );

  const handleGridMove = useCallback(
    (appointment: Appointment, date: Date, time: string) => {
      const nextStart = new Date(date);
      const [hour, minute] = time.split(':').map(Number);
      nextStart.setHours(hour, minute, 0, 0);
      void applyMove(appointment, nextStart.toISOString()).catch((error) => {
        setMoveError(getRescheduleErrorMessage(error));
        setMoveAppointment(appointment);
      });
    },
    [applyMove],
  );


  const filteredAppointments = useMemo(() => {
    const normalizedQuery = normalizeContactDigits(calendarQuery.trim()).toLocaleLowerCase();
    return appointments.filter((appointment) => {
      if (calendarStaffId !== 'all' && appointment.staffMemberId !== calendarStaffId) {
        return false;
      }
      if (!matchesCalendarStatus(appointment, calendarStatus)) return false;
      if (!normalizedQuery) return true;
      const searchable = normalizeContactDigits(
        [
          appointment.customerName,
          appointment.customerPhone,
          appointment.serviceName,
          appointment.staffName,
        ]
          .filter(Boolean)
          .join(' '),
      ).toLocaleLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [appointments, calendarQuery, calendarStaffId, calendarStatus]);

  const openWaitlistBooking = useCallback((entry: OwnerWaitlistEntry) => {
    const start = new Date(entry.windowStart);
    setManualCustomer({
      phone: entry.customerPhone
        ? normalizeIranianMobile(entry.customerPhone) ?? entry.customerPhone
        : undefined,
      fullName: entry.customerName ?? undefined,
      serviceId: entry.serviceId,
    });
    setManualDate(Number.isNaN(start.getTime()) ? new Date() : start);
    setManualStart(Number.isNaN(start.getTime()) ? undefined : clockTime(entry.windowStart) ?? undefined);
    setManualOpen(true);
  }, []);

  const openAppointmentList = useCallback((date: Date) => {
    setAppointmentListDate(new Date(date));
  }, []);

  const appointmentListItems = useMemo(() => {
    if (!appointmentListDate) return [];
    const selectedKey = dateKey(appointmentListDate);
    return filteredAppointments
      .filter((item) => item.startAt && localDateKey(item.startAt) === selectedKey)
      .sort((a, b) => {
        const ta = a.startAt ? new Date(a.startAt).getTime() : 0;
        const tb = b.startAt ? new Date(b.startAt).getTime() : 0;
        return ta - tb;
      });
  }, [filteredAppointments, appointmentListDate]);

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

  const openManualBooking = useCallback((date: Date, start?: string) => {
    setManualCustomer({});
    setManualDate(new Date(date));
    setManualStart(start);
    setManualOpen(true);
  }, []);

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

  const confirmNoShow = async () => {
    if (!noShowAppointment) return;
    setNoShowBusy(true);
    setNoShowError('');
    try {
      await adminApi.noShowAppointment(noShowAppointment.id);
      setNoShowAppointment(null);
      setReloadToken((value) => value + 1);
    } catch {
      setNoShowError('ثبت عدم حضور انجام نشد. دوباره تلاش کنید.');
    } finally {
      setNoShowBusy(false);
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

  const openEmergencyClose = () => {
    setEmergencyError('');
    setEmergencyOpen(true);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <section
      data-testid="owner-calendar-page"
      className="owner-calendar-page flex flex-col gap-4 sm:gap-5"
    >
      {/* Header */}
      <header className="owner-calendar-header flex flex-col gap-1">
        <h1 className="text-xl text-display text-text">
          {t('owner.calendar.title', { defaultValue: 'تقویم' })}
        </h1>
        <p className="hidden text-sm text-muted sm:block">
          {t('owner.calendar.subtitle', { defaultValue: 'مدیریت نوبت‌ها و برنامه‌ریزی روزانه' })}
        </p>
      </header>

      {/* Toolbar: view toggle + date nav */}
      <div className="owner-calendar-toolbar flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="owner-calendar-view-toggle">
          <ViewToggle view={view} onViewChange={handleViewChange} />
        </div>
        <div className="owner-calendar-nav-actions flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <div className="owner-calendar-date-nav">
            <DateNav
              view={view}
              anchor={anchor}
              onNavigate={handleNavigate}
              onManage={() => setManageActionsOpen(true)}
            />
          </div>
          <div className="owner-calendar-actions">
            <Button
              variant="primary"
              size="md"
              startIcon={<CalendarClock className="h-4 w-4" />}
              onClick={() => openManualBooking(anchor)}
              aria-label="ثبت نوبت حضوری"
              title="ثبت نوبت حضوری"
              className="owner-calendar-booking-action"
            >
              <span className="owner-calendar-booking-label">ثبت نوبت حضوری</span>
            </Button>
            <div className="owner-calendar-desktop-actions">
              <Button
                variant="primary"
                size="md"
                startIcon={<Clock className="h-4 w-4" />}
                onClick={() => navigate('/owner/calendar/working-hours')}
                aria-label="ساعات کاری هفتگی"
              >
                ساعات کاری هفتگی
              </Button>
              <Button
                variant="secondary"
                size="md"
                startIcon={<CalendarOff className="h-4 w-4" />}
                onClick={() => openAvailability(anchor)}
                aria-label="تعطیلی و عدم حضور"
              >
                تعطیلی و عدم حضور
              </Button>
              <Button
                variant="danger"
                size="md"
                startIcon={<TriangleAlert className="h-4 w-4" />}
                aria-label="اختلال و بستن این روز"
                onClick={openEmergencyClose}
              >
                اختلال و بستن این روز
              </Button>
            </div>
            <Button
              variant="secondary"
              size="md"
              startIcon={<Settings2 className="h-4 w-4" />}
              aria-label="مدیریت روز"
              data-testid="owner-calendar-manage-trigger"
              className="owner-calendar-manage-trigger"
              onClick={() => setManageActionsOpen(true)}
            >
              مدیریت روز
            </Button>
          </div>
        </div>
      </div>

      <p className="owner-calendar-hint -mt-3 hidden text-xs text-muted sm:block">
        روی هر روز یا ساعت بزن تا همان‌جا تعطیلی کامل یا محدودیت ساعتی ثبت کنی.
      </p>

      <CalendarFilters
        appointments={appointments}
        staff={staff}
        query={calendarQuery}
        staffId={calendarStaffId}
        statusFilter={calendarStatus}
        onQueryChange={setCalendarQuery}
        onStaffChange={setCalendarStaffId}
        onStatusChange={setCalendarStatus}
        onClear={() => {
          setCalendarQuery('');
          setCalendarStaffId('all');
          setCalendarStatus('all');
        }}
      />

      {/* Pending approval queue — surfaced at top of calendar so owners can
          one-tap Approve/Reject without leaving the calendar view. */}
      <ApprovalQueue
        refreshKey={approvalReloadToken}
        salonId={salonId}
        onResolved={() => setReloadToken((n) => n + 1)}
        className="owner-calendar-approval"
      />

      {role !== 'Stylist' && (
        <PendingDepositReceiptQueue
          salonId={salonId}
          refreshKey={reloadToken}
          onOpen={openAppointment}
          className="owner-calendar-approval"
        />
      )}

      {role !== 'Stylist' && (
        <OwnerWaitlistCard
          salonId={salonId}
          refreshKey={reloadToken}
          onBook={openWaitlistBooking}
        />
      )}

      <CalendarActionsSheet
        salonId={salonId}
        open={manageActionsOpen}
        onOpenChange={setManageActionsOpen}
        onWorkingHours={() => {
          setManageActionsOpen(false);
          navigate('/owner/calendar/working-hours');
        }}
        onAvailability={() => {
          setManageActionsOpen(false);
          openAvailability(anchor);
        }}
        onEmergencyClose={() => {
          setManageActionsOpen(false);
          openEmergencyClose();
        }}
        showApprovalPolicy={role === 'Owner'}
      />

      {/* Calendar content with animated transitions */}
      <div className="owner-calendar-content relative min-h-[20rem]">
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
                      onViewAppointments={openAppointmentList}
                      onCancel={setCancelAppointment}
                      onNoShow={setNoShowAppointment}
                      onOpenAppointment={openAppointment}
                      onMove={handleGridMove}
                    />
                  )}
                  {view === 'week' && (
                    <WeekView
                      appointments={filteredAppointments}
                      anchor={anchor}
                      closures={closures}
                      staffBlocks={staffCalendarBlocks}
                      onSelectDate={openDay}
                      onViewAppointments={openDay}
                      onCancel={setCancelAppointment}
                      onNoShow={setNoShowAppointment}
                      onOpenAppointment={openAppointment}
                    />
                  )}
                  {view === 'month' && (
                    <MonthView
                      appointments={filteredAppointments}
                      anchor={anchor}
                      closures={closures}
                      staffBlocks={staffCalendarBlocks}
                      onSelectDate={openDay}
                      onViewAppointments={openDay}
                      onCancel={setCancelAppointment}
                      onNoShow={setNoShowAppointment}
                      onOpenAppointment={openAppointment}
                    />
                  )}
                  {view === 'list' && <ListView appointments={filteredAppointments} anchor={anchor} onCancel={setCancelAppointment} onNoShow={setNoShowAppointment} />}
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
      <ManualBookingDialog
        salonId={salonId}
        date={manualDate}
        initialStart={manualStart}
        initialPhone={manualCustomer.phone}
        initialFullName={manualCustomer.fullName}
        initialServiceId={manualCustomer.serviceId}
        open={manualOpen}
        onOpenChange={setManualOpen}
        onChanged={() => setReloadToken((n) => n + 1)}
      />
      <AppointmentListDialog
        open={Boolean(appointmentListDate)}
        date={appointmentListDate}
        appointments={appointmentListItems}
        onOpenChange={(next) => {
          if (!next) setAppointmentListDate(null);
        }}
        onCancel={setCancelAppointment}
        onNoShow={setNoShowAppointment}
      />
      <AppointmentDetailsSheet
        open={Boolean(selectedAppointment)}
        appointment={selectedAppointment ? asCalendarAppointment(selectedAppointment) : null}
        onOpenChange={(next) => {
          if (!next) setSelectedAppointment(null);
        }}
        onMove={openMoveDialog}
        onRebook={openRebookAppointment}
        onDepositReviewed={(status) => {
          if (status === 'approved' || status === 'rejected' || status === 'expired') {
            setSelectedAppointment(null);
            setReloadToken((value) => value + 1);
          }
        }}
      />
      <MoveAppointmentDialog
        open={Boolean(moveAppointment)}
        appointment={moveAppointment}
        onOpenChange={(next) => {
          if (!next) {
            setMoveAppointment(null);
            setMoveError('');
          }
        }}
        onMoved={applyMove}
        initialError={moveError}
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
            نوبت {cancelAppointment?.customerName ?? 'مشتری'} لغو می‌شود، زمان آزاد خواهد شد و پیام اطلاع‌رسانی برای مشتری ارسال می‌شود.
          </DialogDescription>
          {cancelError && <p role="alert" className="mt-3 text-sm text-danger">{cancelError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost" disabled={cancelBusy}>انصراف</Button></DialogClose>
            <Button variant="danger" loading={cancelBusy} onClick={() => void confirmCancelAppointment()}>
              بله، لغو شود
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(noShowAppointment)}
        onOpenChange={(next) => {
          if (!next && !noShowBusy) {
            setNoShowAppointment(null);
            setNoShowError('');
          }
        }}
      >
        <DialogContent>
          <DialogTitle>ثبت عدم حضور؟</DialogTitle>
          <DialogDescription>
            این نوبت به‌عنوان عدم حضور ثبت می‌شود و در سابقه مشتری اثر می‌گذارد.
          </DialogDescription>
          {noShowError && <p role="alert" className="mt-3 text-sm text-danger">{noShowError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost" disabled={noShowBusy}>انصراف</Button></DialogClose>
            <Button variant="danger" loading={noShowBusy} onClick={() => void confirmNoShow()}>
              ثبت عدم حضور
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={emergencyOpen} onOpenChange={(next) => !emergencyBusy && setEmergencyOpen(next)}>
        <DialogContent>
          <DialogTitle>بستن فوری این روز</DialogTitle>
          <DialogDescription>
            رزرو جدید برای {PERSIAN_WEEKDAYS[iranianDayIndex(anchor)]} بسته می‌شود. اگر برنامه سالن ناگهانی به‌هم خورد، تکلیف نوبت‌های فعلی را هم همین‌جا مشخص کن.
          </DialogDescription>
          <div className="mt-4 grid gap-2" role="radiogroup" aria-label="نحوه بستن روز">
            <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-sm text-text">
              <input type="radio" checked={!emergencyCancelAll} onChange={() => setEmergencyCancelAll(false)} />
              <span><strong className="block">فقط رزرو جدید بسته شود</strong><span className="text-xs text-muted">نوبت‌های فعلی سر جای خود می‌مانند.</span></span>
            </label>
            <label className="flex cursor-pointer gap-3 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-text">
              <input type="radio" checked={emergencyCancelAll} onChange={() => setEmergencyCancelAll(true)} />
              <span><strong className="block">بستن روز و لغو همه نوبت‌ها</strong><span className="text-xs text-muted">مشتری‌ها مطلع می‌شوند و روند عادی بازپرداخت اجرا می‌شود.</span></span>
            </label>
          </div>
          {emergencyError && <p role="alert" className="mt-3 text-sm text-danger">{emergencyError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost" disabled={emergencyBusy}>انصراف</Button></DialogClose>
            <Button variant="danger" loading={emergencyBusy} onClick={() => void confirmEmergencyClose()}>
              اعمال و بستن روز
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default OwnerCalendarPage;
