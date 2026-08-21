import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  QrCode,
  Scissors,
  Store,
  Trash2,
} from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  customerApi,
  type CustomerAppointment,
  type CustomerWaitlistEntry,
} from '../api/client';
import { usePagination } from '../hooks/usePagination';
import { SeoHead } from '../components/seo';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  JalaliDate,
  Pagination,
  Skeleton,
  TextField,
  cn,
  toPersianDigits,
} from '../components/ui';
import { getJalaliMonthName, gregorianToJalali, jalaliToGregorian } from '@salon/shared';
import {
  SAVED_SALONS_CHANGED,
  readSavedSalons,
  removeSavedSalon,
  savedSalonBookingPath,
  type SavedSalon,
} from '../utils/savedSalons';
import { writeSalonName } from '../utils/salonName';

const PERSIAN_WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
const PERSIAN_WEEKDAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const DISPLAY_STATUSES = new Set([
  'pending',
  'held',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
  'expired',
]);
const UPCOMING_STATUSES = new Set(['pending', 'held', 'confirmed']);
const MS_PER_DAY = 86_400_000;

type LoadStatus = 'loading' | 'ready' | 'error';

interface JalaliMonth {
  jy: number;
  jm: number;
}

interface SalonSummary {
  id: string;
  name: string;
  staffId?: string;
  staffName?: string;
  lastVisitAt?: string;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateKey(value: string | undefined): string | null {
  const date = parseDate(value);
  return date ? dateKey(date) : null;
}

function jalaliMonthOf(date: Date): JalaliMonth {
  const jalali = gregorianToJalali({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
  return { jy: jalali.jy, jm: jalali.jm };
}

function shiftJalaliMonth({ jy, jm }: JalaliMonth, delta: number): JalaliMonth {
  const index = jy * 12 + jm - 1 + delta;
  const nextYear = Math.floor(index / 12);
  return { jy: nextYear, jm: index - nextYear * 12 + 1 };
}

function jalaliMonthStart(month: JalaliMonth): Date {
  const gregorian = jalaliToGregorian({ jy: month.jy, jm: month.jm, jd: 1 });
  return new Date(gregorian.year, gregorian.month - 1, gregorian.day);
}

function jalaliMonthLength(month: JalaliMonth): number {
  const start = jalaliMonthStart(month);
  const next = jalaliMonthStart(shiftJalaliMonth(month, 1));
  return Math.round((next.getTime() - start.getTime()) / MS_PER_DAY);
}

function buildMonthCells(month: JalaliMonth): Array<{ date: Date; day: number } | null> {
  const start = jalaliMonthStart(month);
  const leading = (start.getDay() + 1) % 7;
  const cells: Array<{ date: Date; day: number } | null> = Array(leading).fill(null);
  for (let day = 1; day <= jalaliMonthLength(month); day += 1) {
    cells.push({
      date: new Date(start.getFullYear(), start.getMonth(), start.getDate() + day - 1),
      day,
    });
  }
  return cells;
}

function clockTime(value: string | undefined): string | null {
  const date = parseDate(value);
  if (!date) return null;
  return toPersianDigits(
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  );
}

function localDateTimeValue(value: string): string {
  const date = parseDate(value);
  if (!date) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function selectedDateLabel(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const jalali = gregorianToJalali({ year, month, day });
  return `${PERSIAN_WEEKDAYS[(date.getDay() + 1) % 7]}، ${toPersianDigits(jalali.jd)} ${getJalaliMonthName(jalali.jm)} ${toPersianDigits(jalali.jy)}`;
}

function statusMeta(status: string): {
  label: string;
  variant: 'success' | 'warning' | 'neutral' | 'danger';
} {
  switch (status) {
    case 'confirmed':
      return { label: 'تأیید شده', variant: 'success' };
    case 'pending':
      return { label: 'در انتظار تأیید', variant: 'warning' };
    case 'held':
      return { label: 'در حال بررسی', variant: 'warning' };
    case 'completed':
      return { label: 'انجام شده', variant: 'neutral' };
    case 'cancelled':
      return { label: 'لغو شده', variant: 'danger' };
    case 'no_show':
      return { label: 'حاضر نشده', variant: 'danger' };
    case 'expired':
      return { label: 'منقضی شده', variant: 'neutral' };
    default:
      return { label: status || 'ثبت شده', variant: 'neutral' };
  }
}

function DashboardSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-6 sm:px-6 sm:py-10"
      aria-busy="true"
    >
      <div className="flex flex-col gap-2">
        <Skeleton variant="text" className="h-4 w-24" />
        <Skeleton variant="text" className="h-9 w-56" />
        <Skeleton variant="text" className="h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.8fr)]">
        <Skeleton variant="rect" className="h-[25rem] rounded-lg" />
        <Skeleton variant="rect" className="h-[25rem] rounded-lg" />
      </div>
      <Skeleton variant="rect" className="h-48 rounded-lg" />
    </div>
  );
}

function AppointmentRow({
  appointment,
  actionBusy,
  rescheduleValue,
  onCancel,
  onStartReschedule,
  onRescheduleValueChange,
  onReschedule,
}: {
  appointment: CustomerAppointment;
  actionBusy?: boolean;
  rescheduleValue?: string;
  onCancel?: (appointment: CustomerAppointment) => void;
  onStartReschedule?: (appointment: CustomerAppointment) => void;
  onRescheduleValueChange?: (value: string) => void;
  onReschedule?: (appointment: CustomerAppointment) => void;
}) {
  const status = statusMeta(appointment.status);
  const start = parseDate(appointment.startAt);
  const canManage =
    UPCOMING_STATUSES.has(appointment.status) &&
    (start?.getTime() ?? 0) > Date.now();

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-bg p-3">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-text">
              {appointment.salonName ?? 'سالن شما'}
            </h3>
            <p className="mt-1 truncate text-xs text-muted">
              {appointment.serviceName ?? 'نوبت خدمات زیبایی'}
              {appointment.staffName ? ` · ${appointment.staffName}` : ''}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-muted md:flex-col md:items-end md:gap-1">
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            {start ? <JalaliDate value={start} variant="numeric" /> : 'تاریخ نامشخص'}
            {clockTime(appointment.startAt) ? ` · ${clockTime(appointment.startAt)}` : ''}
          </span>
          <Badge status={status.variant}>{status.label}</Badge>
          </div>
        </div>
      <p className="flex items-start gap-1.5 text-xs text-muted">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span>
          {appointment.locationType === 'customer'
            ? `مراجعه در محل شما${appointment.locationAddress ? `: ${appointment.locationAddress}` : ''}`
            : 'مراجعه در محل سالن / محل کار'}
        </span>
      </p>
      {canManage && onCancel && onStartReschedule && (
        <div className="flex w-full flex-wrap items-center justify-end gap-2 border-t border-border/50 pt-3">
          {rescheduleValue !== undefined ? (
            <>
              <label className="sr-only" htmlFor={`reschedule-${appointment.id}`}>
                زمان جدید
              </label>
              <input
                id={`reschedule-${appointment.id}`}
                type="datetime-local"
                value={rescheduleValue}
                min={new Date().toISOString().slice(0, 16)}
                onChange={(event) => onRescheduleValueChange?.(event.target.value)}
                className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-bg px-2 text-xs text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              />
              <Button
                type="button"
                size="md"
                loading={actionBusy}
                disabled={actionBusy || !rescheduleValue}
                onClick={() => onReschedule?.(appointment)}
              >
                ذخیره زمان
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={actionBusy}
                onClick={() => onStartReschedule(appointment)}
              >
                تغییر زمان
              </Button>
              <Button
                type="button"
                variant="danger"
                size="md"
                loading={actionBusy}
                disabled={actionBusy}
                onClick={() => onCancel(appointment)}
              >
                لغو نوبت
              </Button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function CalendarMonth({
  month,
  appointments,
  selectedDate,
  onSelect,
}: {
  month: JalaliMonth;
  appointments: CustomerAppointment[];
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const today = dateKey(new Date());
  const byDate = useMemo(() => {
    const grouped = new Map<string, CustomerAppointment[]>();
    for (const appointment of appointments) {
      const key = localDateKey(appointment.startAt);
      if (!key) continue;
      const items = grouped.get(key) ?? [];
      items.push(appointment);
      grouped.set(key, items);
    }
    return grouped;
  }, [appointments]);

  return (
    <div className="flex flex-col gap-2" data-testid="customer-calendar">
      <div className="grid grid-cols-7 gap-1 text-center text-[0.68rem] font-semibold text-muted sm:text-xs">
        {PERSIAN_WEEKDAYS.map((weekday, index) => (
          <span key={weekday} className="py-1" aria-label={weekday}>
            {PERSIAN_WEEKDAY_SHORT[index]}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1" role="group" aria-label="روزهای ماه">
        {buildMonthCells(month).map((cell, index) => {
          if (!cell) {
            return (
              <span
                key={`empty-${index}`}
                className="min-h-14 rounded-lg sm:min-h-20"
                aria-hidden="true"
              />
            );
          }
          const key = dateKey(cell.date);
          const count = byDate.get(key)?.length ?? 0;
          const selected = key === selectedDate;
          const isToday = key === today;
          return (
            <button
              key={key}
              type="button"
              aria-label={`${selectedDateLabel(key)}${count ? `، ${toPersianDigits(count)} نوبت` : ''}`}
              aria-pressed={selected}
              onClick={() => onSelect(key)}
              className={cn(
                'relative flex min-h-14 flex-col items-start justify-between overflow-hidden rounded-lg border p-1.5 text-start transition-colors sm:min-h-20 sm:p-2',
                'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                selected
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-surface hover:bg-elevated',
                isToday && !selected && 'ring-1 ring-primary/50',
              )}
            >
              <span
                className={cn(
                  'text-xs font-bold tabular-nums sm:text-sm',
                  isToday || selected ? 'font-black text-text' : 'text-text',
                )}
              >
                {toPersianDigits(cell.day)}
              </span>
              {count > 0 ? (
                <span className="flex items-center gap-1 text-[0.62rem] font-semibold text-primary sm:text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  {toPersianDigits(count)}
                </span>
              ) : (
                <span className="h-3" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SalonCard({ salon, onRemove }: { salon: SalonSummary; onRemove?: () => void }) {
  const bookingTarget = savedSalonBookingPath(salon);
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:gap-4">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        aria-hidden="true"
      >
        {salon.staffId ? <Scissors className="h-5 w-5" /> : <Store className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-bold text-text">{salon.name}</h3>
        <p className="mt-1 truncate text-xs text-muted">
          {salon.staffName
            ? `با ${salon.staffName}`
            : salon.lastVisitAt
              ? 'سابقه رزرو شما'
              : 'آماده رزرو'}
        </p>
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <Link
          to={bookingTarget}
          onClick={() => writeSalonName(salon.id, salon.name)}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-pill bg-primary px-4 text-sm font-semibold text-primary-contrast no-underline outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:flex-none"
        >
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          رزرو نوبت
        </Link>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`حذف ${salon.name}`}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-danger/10 hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}

/** Customer home at `/account`: upcoming bookings, a Jalali month calendar, and saved salons. */
export function CustomerDashboardPage() {
  const { status: authStatus, isCustomer, isStaff } = useAuth();
  const [appointments, setAppointments] = useState<CustomerAppointment[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<CustomerWaitlistEntry[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [savedSalons, setSavedSalons] = useState<SavedSalon[]>(readSavedSalons);
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [waitlistBusyId, setWaitlistBusyId] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState('');
  const [actionError, setActionError] = useState('');
  const [profileStatus, setProfileStatus] = useState<'idle' | 'loading' | 'needs-name' | 'ready'>('idle');
  const [profileName, setProfileName] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  const loadAppointments = useCallback(async () => {
    setLoadStatus('loading');
    try {
      const response = await customerApi.getAppointments();
      setAppointments(response.appointments ?? []);
      setLoadStatus('ready');
    } catch {
      setLoadStatus('error');
    }
  }, []);

  const loadWaitlist = useCallback(async () => {
    if (typeof customerApi.getWaitlist !== 'function') return;
    try {
      const response = await customerApi.getWaitlist();
      setWaitlistEntries(response.waitlist ?? []);
    } catch {
      // The booking calendar remains usable if this optional account surface
      // is temporarily unavailable.
    }
  }, []);

  const loadProfile = useCallback(async () => {
    if (typeof customerApi.getProfile !== 'function') return;
    setProfileStatus('loading');
    try {
      const response = await customerApi.getProfile();
      const savedName = response.customer.fullName?.trim() ?? '';
      setProfileName(savedName);
      setProfileStatus(savedName ? 'ready' : 'needs-name');
    } catch {
      // A profile read must not block the customer's calendar.
      setProfileStatus('ready');
    }
  }, []);

  const saveProfileName = useCallback(async () => {
    const normalizedName = profileName.trim();
    if (normalizedName.length < 2) {
      setProfileError('نام و نام خانوادگی را وارد کن.');
      return;
    }
    if (typeof customerApi.updateProfile !== 'function') return;
    setProfileSaving(true);
    setProfileError('');
    try {
      const response = await customerApi.updateProfile(normalizedName);
      setProfileName(response.customer.fullName?.trim() ?? normalizedName);
      setProfileStatus('ready');
    } catch {
      setProfileError('ذخیره نام انجام نشد؛ دوباره تلاش کن.');
    } finally {
      setProfileSaving(false);
    }
  }, [profileName]);

  const cancelAppointment = useCallback(
    async (appointment: CustomerAppointment) => {
      if (!window.confirm('این نوبت لغو شود؟')) return;
      setActionBusyId(appointment.id);
      setActionError('');
      try {
        await customerApi.cancelAppointment(appointment.id);
        await loadAppointments();
      } catch {
        setActionError('لغو نوبت انجام نشد؛ دوباره تلاش کن.');
      } finally {
        setActionBusyId(null);
      }
    },
    [loadAppointments],
  );

  const saveReschedule = useCallback(
    async (appointment: CustomerAppointment) => {
      if (!rescheduleValue) return;
      const nextStart = new Date(rescheduleValue);
      if (Number.isNaN(nextStart.getTime()) || nextStart.getTime() <= Date.now()) {
        setActionError('زمان جدید باید معتبر و در آینده باشد.');
        return;
      }
      setActionBusyId(appointment.id);
      setActionError('');
      try {
        await customerApi.rescheduleAppointment(appointment.id, nextStart.toISOString());
        setRescheduleId(null);
        setRescheduleValue('');
        await loadAppointments();
      } catch {
        setActionError('تغییر زمان انجام نشد؛ زمان دیگری را انتخاب کن.');
      } finally {
        setActionBusyId(null);
      }
    },
    [loadAppointments, rescheduleValue],
  );

  const cancelWaitlist = useCallback(
    async (entry: CustomerWaitlistEntry) => {
      if (!window.confirm('از لیست انتظار خارج شوی؟')) return;
      setWaitlistBusyId(entry.id);
      setActionError('');
      try {
        await customerApi.cancelWaitlist(entry.id);
        await loadWaitlist();
      } catch {
        setActionError('خروج از لیست انتظار انجام نشد؛ دوباره تلاش کن.');
      } finally {
        setWaitlistBusyId(null);
      }
    },
    [loadWaitlist],
  );

  useEffect(() => {
    if (isCustomer) {
      void loadAppointments();
      void loadWaitlist();
      void loadProfile();
    }
  }, [isCustomer, loadAppointments, loadProfile, loadWaitlist]);

  useEffect(() => {
    const refreshSaved = () => setSavedSalons(readSavedSalons());
    window.addEventListener('storage', refreshSaved);
    window.addEventListener(SAVED_SALONS_CHANGED, refreshSaved);
    return () => {
      window.removeEventListener('storage', refreshSaved);
      window.removeEventListener(SAVED_SALONS_CHANGED, refreshSaved);
    };
  }, []);

  const displayAppointments = useMemo(
    () => appointments.filter((appointment) => DISPLAY_STATUSES.has(appointment.status)),
    [appointments],
  );

  const upcomingAppointments = useMemo(() => {
    const now = Date.now();
    return displayAppointments
      .filter(
        (appointment) =>
          UPCOMING_STATUSES.has(appointment.status) &&
          (parseDate(appointment.startAt)?.getTime() ?? 0) >= now,
      )
      .sort(
        (a, b) => (parseDate(a.startAt)?.getTime() ?? 0) - (parseDate(b.startAt)?.getTime() ?? 0),
      );
  }, [displayAppointments]);

  const selectedAppointments = useMemo(
    () =>
      displayAppointments
        .filter((appointment) => localDateKey(appointment.startAt) === selectedDate)
        .sort(
          (a, b) => (parseDate(a.startAt)?.getTime() ?? 0) - (parseDate(b.startAt)?.getTime() ?? 0),
        ),
    [displayAppointments, selectedDate],
  );

  const salonSummaries = useMemo(() => {
    const summaries: SalonSummary[] = savedSalons
      .map((saved) => ({
        id: saved.id,
        name: saved.name,
        staffId: saved.staffId,
        staffName: saved.staffName,
      }))
    for (const appointment of appointments) {
      if (!appointment.salonId || !appointment.salonName) continue;
      const visitAt = parseDate(appointment.startAt)?.toISOString();
      const existingIndex = summaries.findIndex((salon) => salon.id === appointment.salonId);
      if (existingIndex >= 0) {
        const existing = summaries[existingIndex];
        if (
          visitAt &&
          (!existing.lastVisitAt || new Date(visitAt).getTime() > new Date(existing.lastVisitAt).getTime())
        ) {
          summaries[existingIndex] = { ...existing, lastVisitAt: visitAt };
        }
        continue;
      }
      summaries.push({ id: appointment.salonId, name: appointment.salonName, lastVisitAt: visitAt });
    }
    return summaries.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  }, [appointments, savedSalons]);

  const selectedPagination = usePagination(selectedAppointments, 6);
  const upcomingPagination = usePagination(upcomingAppointments, 4);
  const historyAppointments = useMemo(
    () =>
      displayAppointments
        .filter((appointment) => !UPCOMING_STATUSES.has(appointment.status))
        .sort(
          (a, b) => (parseDate(b.startAt)?.getTime() ?? 0) - (parseDate(a.startAt)?.getTime() ?? 0),
        ),
    [displayAppointments],
  );
  const historyPagination = usePagination(historyAppointments, 6);
  const salonPagination = usePagination(salonSummaries, 6);

  useEffect(() => {
    selectedPagination.resetPage();
  }, [selectedDate, selectedPagination.resetPage]);

  if (authStatus === 'loading') return <DashboardSkeleton />;
  if (!isCustomer) {
    return (
      <Navigate
        to={isStaff ? '/owner' : '/auth'}
        state={!isStaff ? { returnTo: '/account' } : undefined}
        replace
      />
    );
  }

  const month = jalaliMonthOf(monthAnchor);
  const monthTitle = `${getJalaliMonthName(month.jm)} ${toPersianDigits(month.jy)}`;
  const changeMonth = (delta: number) => {
    const next = jalaliMonthStart(shiftJalaliMonth(month, delta));
    setMonthAnchor(next);
    setSelectedDate(dateKey(next));
  };

  return (
    <div className="min-w-0 overflow-x-hidden bg-bg text-text" data-testid="customer-dashboard-page">
      <SeoHead title="حساب من" description="تقویم نوبت‌ها و سالن‌های ذخیره‌شده شما در آرا" />
      <div className="mx-auto flex min-w-0 w-full max-w-6xl flex-col gap-5 px-3 py-6 sm:gap-6 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-primary">حساب من</p>
          <h1 className="text-display text-2xl font-bold text-text sm:text-3xl">
            برنامه نوبت‌های من
          </h1>
          <p className="max-w-xl text-sm leading-7 text-muted">
            نوبت‌های آینده‌ات را ببین و از سالن‌های موردعلاقه‌ات دوباره رزرو کن.
          </p>
        </header>

        {actionError && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {actionError}
          </p>
        )}

        {profileStatus === 'needs-name' && (
          <Card as="section" data-testid="customer-profile-card" className="border-primary/30">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-text">نامت را ثبت کن</h2>
                <p className="mt-1 text-sm leading-6 text-muted">
                  فقط یک‌بار ذخیره می‌شود تا سالن‌ها رزروهایت را با نامت بشناسند.
                </p>
                <TextField
                  containerClassName="mt-3"
                  label="نام و نام خانوادگی"
                  value={profileName}
                  onChange={(event) => {
                    setProfileName(event.target.value);
                    if (profileError) setProfileError('');
                  }}
                  error={profileError}
                  autoComplete="name"
                  maxLength={120}
                  required
                />
              </div>
              <Button
                type="button"
                loading={profileSaving}
                disabled={profileSaving || profileName.trim().length < 2}
                onClick={() => void saveProfileName()}
              >
                ذخیره نام
              </Button>
            </div>
          </Card>
        )}

        {waitlistEntries.some((entry) => entry.status === 'waiting' || entry.status === 'notified') && (
          <Card as="section" data-testid="customer-waitlist">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-lg font-bold text-text">لیست‌های انتظار من</h2>
                <p className="mt-1 text-xs text-muted">با آزادشدن زمان، پیامک اطلاع‌رسانی می‌فرستیم.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {waitlistEntries
                .filter((entry) => entry.status === 'waiting' || entry.status === 'notified')
                .map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-text">انتظار برای خدمت سالن</p>
                      <p className="mt-1 text-xs text-muted">
                        {new Date(entry.windowStart).toLocaleDateString('fa-IR')}
                        {entry.status === 'notified' ? ' · زمان آزاد شده' : ' · در صف'}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      loading={waitlistBusyId === entry.id}
                      onClick={() => void cancelWaitlist(entry)}
                    >
                      خروج از صف
                    </Button>
                  </div>
                ))}
            </div>
          </Card>
        )}

        {loadStatus === 'error' ? (
          <Card as="section" className="p-0">
            <ErrorState
              title="بارگذاری نوبت‌ها ناموفق بود"
              description="اتصال برقرار نشد؛ دوباره تلاش کن. سالن‌های ذخیره‌شده‌ات همچنان در دسترس هستند."
              onRetry={() => void loadAppointments()}
              retryLabel="تلاش مجدد"
            />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.8fr)]">
            <Card as="section" className="min-w-0" data-testid="customer-calendar-card">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-text">تقویم من</h2>
                  <p className="mt-1 text-xs text-muted">روزهای دارای نوبت با نقطه مشخص شده‌اند.</p>
                </div>
                <div
                  className="flex items-center gap-1 rounded-pill border border-border bg-bg p-1"
                  aria-label="تغییر ماه"
                >
                  {/* RTL: previous/next month arrows use native inline direction. */}
                  <button
                    type="button"
                    onClick={() => changeMonth(-1)}
                    aria-label="ماه قبل"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-elevated hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="min-w-28 text-center text-sm font-bold text-text">
                    {monthTitle}
                  </span>
                  <button
                    type="button"
                    onClick={() => changeMonth(1)}
                    aria-label="ماه بعد"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-elevated hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {loadStatus === 'loading' ? (
                <Skeleton variant="rect" className="h-80 rounded-lg" />
              ) : (
                <CalendarMonth
                  month={month}
                  appointments={displayAppointments}
                  selectedDate={selectedDate}
                  onSelect={setSelectedDate}
                />
              )}
              <div className="mt-4 border-t border-border pt-4" data-testid="customer-selected-day">
                <h3 className="text-sm font-bold text-text">{selectedDateLabel(selectedDate)}</h3>
                {loadStatus === 'loading' ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <Skeleton variant="rect" className="h-14 rounded-xl" />
                  </div>
                ) : selectedAppointments.length > 0 ? (
                  <div className="mt-3 flex flex-col gap-2">
                    {selectedPagination.pageItems.map((appointment) => (
                      <AppointmentRow
                        key={appointment.id}
                        appointment={appointment}
                        actionBusy={actionBusyId === appointment.id}
                        rescheduleValue={
                          rescheduleId === appointment.id ? rescheduleValue : undefined
                        }
                        onCancel={cancelAppointment}
                        onStartReschedule={(item) => {
                          setRescheduleId(item.id);
                          setRescheduleValue(localDateTimeValue(item.startAt));
                        }}
                        onRescheduleValueChange={setRescheduleValue}
                        onReschedule={saveReschedule}
                      />
                    ))}
                    <Pagination
                      page={selectedPagination.page}
                      pageSize={selectedPagination.pageSize}
                      total={selectedPagination.total}
                      onPageChange={selectedPagination.goToPage}
                      testId="customer-selected-day-pagination"
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">برای این روز نوبتی ثبت نشده است.</p>
                )}
              </div>
            </Card>

            <Card as="section" className="min-w-0" data-testid="customer-upcoming">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-text">نوبت‌های پیش‌رو</h2>
                  <p className="mt-1 text-xs text-muted">نزدیک‌ترین برنامه‌هایت اینجا هستند.</p>
                </div>
                <CalendarDays className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              </div>
              {loadStatus === 'loading' ? (
                <div className="flex flex-col gap-2">
                  <Skeleton variant="rect" className="h-20 rounded-xl" />
                  <Skeleton variant="rect" className="h-20 rounded-xl" />
                </div>
              ) : upcomingAppointments.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {upcomingPagination.pageItems.map((appointment) => (
                    <AppointmentRow
                      key={appointment.id}
                      appointment={appointment}
                      actionBusy={actionBusyId === appointment.id}
                      rescheduleValue={
                        rescheduleId === appointment.id ? rescheduleValue : undefined
                      }
                      onCancel={cancelAppointment}
                      onStartReschedule={(item) => {
                        setRescheduleId(item.id);
                        setRescheduleValue(localDateTimeValue(item.startAt));
                      }}
                      onRescheduleValueChange={setRescheduleValue}
                      onReschedule={saveReschedule}
                    />
                  ))}
                  <Pagination
                    page={upcomingPagination.page}
                    pageSize={upcomingPagination.pageSize}
                    total={upcomingPagination.total}
                    onPageChange={upcomingPagination.goToPage}
                    testId="customer-upcoming-pagination"
                  />
                </div>
              ) : (
                <EmptyState
                  className="px-1 py-8"
                  icon={<Clock3 className="h-9 w-9" />}
                  title="هنوز نوبت پیش‌رو نداری"
                  description="از سالن‌های ذخیره‌شده، رزرو بعدی‌ات را شروع کن."
                />
              )}
            </Card>

            <Card as="section" className="min-w-0 lg:col-span-2" data-testid="customer-history">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-text">سوابق نوبت‌ها</h2>
                  <p className="mt-1 text-xs text-muted">نوبت‌های انجام‌شده و لغوشده حذف نمی‌شوند.</p>
                </div>
                <Clock3 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              </div>
              {historyAppointments.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {historyPagination.pageItems.map((appointment) => (
                    <AppointmentRow key={appointment.id} appointment={appointment} />
                  ))}
                  <Pagination
                    page={historyPagination.page}
                    pageSize={historyPagination.pageSize}
                    total={historyPagination.total}
                    onPageChange={historyPagination.goToPage}
                    testId="customer-history-pagination"
                  />
                </div>
              ) : (
                <p className="m-0 text-sm text-muted">هنوز سابقه‌ای ثبت نشده است.</p>
              )}
            </Card>
          </div>
        )}

        <Card as="section" data-testid="customer-salons">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-text">سالن‌های من</h2>
              <p className="mt-1 text-xs leading-6 text-muted">
                سالن‌هایی که با اسکن QR ذخیره کرده‌ای یا قبلاً از آن‌ها نوبت داشته‌ای.
              </p>
            </div>
            <Store className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          </div>
          {salonSummaries.length > 0 ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {salonPagination.pageItems.map((salon) => {
                const saved = savedSalons.some((item) => item.id === salon.id);
                return (
                  <SalonCard
                    key={salon.id}
                    salon={salon}
                    onRemove={
                      saved
                        ? () => setSavedSalons(removeSavedSalon(salon.id, salon.staffId))
                        : undefined
                    }
                  />
                  );
                })}
              </div>
              <Pagination
                page={salonPagination.page}
                pageSize={salonPagination.pageSize}
                total={salonPagination.total}
                onPageChange={salonPagination.goToPage}
                testId="customer-salons-pagination"
              />
            </>
          ) : (
            <EmptyState
              className="px-1 py-8"
              icon={<QrCode className="h-10 w-10" />}
              title="هنوز سالنی به حسابت اضافه نشده"
              description="کد QR سالن موردنظرت را اسکن کن یا اولین نوبتت را ثبت کن تا اینجا نمایش داده شود."
            />
          )}
        </Card>
      </div>
    </div>
  );
}

export default CustomerDashboardPage;
