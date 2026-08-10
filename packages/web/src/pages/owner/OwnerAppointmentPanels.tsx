import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  History,
  MessageCircle,
  Move,
  Phone,
  Send,
  UserRound,
} from 'lucide-react';
import {
  adminApi,
  type AppointmentCustomerOverview,
} from '../../api/client';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  TextField,
  cn,
  Num,
} from '../../components/ui';

export interface CalendarAppointmentLike {
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
}

function timeLabel(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}

function dateLabel(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fa-IR', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function statusLabel(status?: string): string {
  switch (status) {
    case 'pending':
      return 'در انتظار تأیید';
    case 'confirmed':
    case 'approved':
      return 'تأیید شده';
    case 'completed':
      return 'انجام شده';
    case 'no_show':
      return 'عدم حضور';
    case 'cancelled':
    case 'rejected':
      return 'لغو شده';
    default:
      return 'رزرو شده';
  }
}

function localDateTimeValue(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    String(safeDate.getFullYear()) +
    '-' +
    pad(safeDate.getMonth() + 1) +
    '-' +
    pad(safeDate.getDate()) +
    'T' +
    pad(safeDate.getHours()) +
    ':' +
    pad(safeDate.getMinutes())
  );
}

const actionLinkClass =
  'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:pointer-events-none';

export function AppointmentDetailsSheet({
  open,
  appointment,
  onOpenChange,
  onMove,
  onRebook,
}: {
  open: boolean;
  appointment: CalendarAppointmentLike | null;
  onOpenChange: (open: boolean) => void;
  onMove: (appointment: CalendarAppointmentLike) => void;
  onRebook: (appointment: CalendarAppointmentLike) => void;
}) {
  const [overview, setOverview] = useState<AppointmentCustomerOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [messageState, setMessageState] = useState<'idle' | 'sent' | 'error'>('idle');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !appointment) return;
    let active = true;
    setOverview(null);
    setLoadError('');
    setMessage('');
    setMessageState('idle');
    setLoading(true);
    adminApi
      .getAppointmentCustomer(appointment.id)
      .then((result) => {
        if (active) setOverview(result);
      })
      .catch(() => {
        if (active) setLoadError('اطلاعات مشتری بارگذاری نشد.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, appointment]);

  const customer = overview?.customer;
  const phone = customer?.phone || appointment?.customerPhone || '';
  const history = useMemo(
    () => (overview?.appointments ?? []).slice(0, 5),
    [overview?.appointments],
  );

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (!appointment || !text || sending) return;
    setSending(true);
    setMessageState('idle');
    try {
      await adminApi.sendCustomerMessage(appointment.id, text);
      setMessage('');
      setMessageState('sent');
    } catch {
      setMessageState('error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open && Boolean(appointment)} onOpenChange={onOpenChange}>
      <SheetContent side="inline-end" className="sm:w-[min(27rem,100vw)]">
        <div className="pe-8">
          <SheetTitle className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-primary" aria-hidden="true" />
            {customer?.fullName || appointment?.customerName || 'جزئیات مشتری'}
          </SheetTitle>
          <SheetDescription>
            اطلاعات مشتری و سابقه نوبت‌های او
          </SheetDescription>
        </div>

        {appointment && (
          <section className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <strong className="block truncate text-sm text-text">
                  {appointment.serviceName || 'خدمت'}
                </strong>
                <span className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  {dateLabel(appointment.startAt)} · <Num value={timeLabel(appointment.startAt)} />
                </span>
              </div>
              <span className="shrink-0 rounded-full bg-success/10 px-2 py-1 text-[0.68rem] font-bold text-success">
                {statusLabel(appointment.status)}
              </span>
            </div>
            {appointment.staffName && (
              <p className="m-0 mt-2 text-xs text-muted">آرایشگر: {appointment.staffName}</p>
            )}
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="mt-3 w-full"
              startIcon={<Move className="h-4 w-4" />}
              onClick={() => onMove(appointment)}
              disabled={['cancelled', 'rejected', 'no_show', 'completed'].includes(appointment.status ?? '')}
            >
              انتقال به زمان دیگر
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="mt-2 w-full"
              startIcon={<CalendarPlus className="h-4 w-4" />}
              onClick={() => onRebook(appointment)}
              disabled={!phone || ['cancelled', 'rejected', 'no_show'].includes(appointment.status || '')}
            >
              رزرو مجدد
            </Button>
          </section>
        )}

        <section className="mt-4 rounded-xl border border-border bg-surface p-3">
          <h3 className="m-0 text-sm font-bold text-text">راه ارتباطی</h3>
          <p className="mt-1 text-sm tabular-nums text-muted" dir="ltr">
            {phone || 'شماره ثبت نشده'}
          </p>
          <div className="mt-3 flex gap-2">
            <a
              href={phone ? 'tel:' + phone : undefined}
              aria-disabled={!phone}
              className={cn(
                actionLinkClass,
                phone
                  ? 'border-success/30 bg-success/10 text-success hover:bg-success/15'
                  : 'cursor-not-allowed border-border bg-bg text-muted/50',
              )}
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              تماس
            </a>
            <a
              href={phone ? 'sms:' + phone : undefined}
              aria-disabled={!phone}
              className={cn(
                actionLinkClass,
                phone
                  ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
                  : 'cursor-not-allowed border-border bg-bg text-muted/50',
              )}
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              پیامک
            </a>
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="m-0 text-sm font-bold text-text">پیام مستقیم</h3>
            <span className="text-xs text-muted">حداکثر ۵۰۰ کاراکتر</span>
          </div>
          <form onSubmit={(event) => void sendMessage(event)} className="mt-3">
            <textarea
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                setMessageState('idle');
              }}
              maxLength={500}
              rows={3}
              disabled={!phone || sending}
              aria-label="متن پیامک"
              placeholder="مثلاً: سلام، برای تأیید نوبت فردا با شما تماس می‌گیریم."
              className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="mt-2 w-full"
              startIcon={<Send className="h-4 w-4" />}
              loading={sending}
              disabled={!phone || !message.trim() || sending}
            >
              ارسال پیامک
            </Button>
          </form>
          {messageState === 'sent' && (
            <p role="status" className="m-0 mt-2 text-xs text-success">پیامک ارسال شد.</p>
          )}
          {messageState === 'error' && (
            <p role="alert" className="m-0 mt-2 text-xs text-danger">ارسال پیامک انجام نشد.</p>
          )}
        </section>

        {loading && (
          <p className="mt-4 rounded-lg border border-border bg-bg p-3 text-sm text-muted">
            در حال دریافت سابقه مشتری…
          </p>
        )}
        {loadError && <p role="alert" className="mt-4 text-sm text-danger">{loadError}</p>}
        {overview && (
          <>
            <section className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border bg-surface p-3">
                <span className="block text-xs text-muted">عدم حضور</span>
                <strong className="mt-1 block text-xl text-text tabular-nums">
                  <Num value={String(customer?.noShowCount ?? 0)} />
                </strong>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3">
                <span className="block text-xs text-muted">سابقه نوبت</span>
                <strong className="mt-1 block text-xl text-text tabular-nums">
                  <Num value={String(overview.appointments.length)} />
                </strong>
              </div>
            </section>

            <section className="mt-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-text">
                <History className="h-4 w-4 text-primary" aria-hidden="true" />
                آخرین نوبت‌ها
              </h3>
              {history.length === 0 ? (
                <p className="mt-2 rounded-lg border border-border bg-bg p-3 text-xs text-muted">
                  سابقه‌ای ثبت نشده است.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5" role="list">
                  {history.map((item) => (
                    <li key={item.id} className="rounded-lg border border-border bg-surface p-2.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <strong className="truncate text-text">{item.serviceName || 'خدمت'}</strong>
                        <span className="shrink-0 text-muted">{statusLabel(item.status)}</span>
                      </div>
                      <p className="m-0 mt-1 text-[0.68rem] text-muted">
                        {dateLabel(item.startAt)} · <Num value={timeLabel(item.startAt)} />
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-4">
              <h3 className="text-sm font-bold text-text">یادداشت‌ها</h3>
              {overview.notes.length === 0 ? (
                <p className="mt-2 rounded-lg border border-border bg-bg p-3 text-xs text-muted">
                  یادداشتی برای این مشتری ثبت نشده است.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5" role="list">
                  {overview.notes.slice(0, 4).map((note) => (
                    <li key={note.id} className="rounded-lg border border-border bg-bg p-2.5 text-xs text-text">
                      {note.body}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function MoveAppointmentDialog({
  open,
  appointment,
  onOpenChange,
  onMoved,
}: {
  open: boolean;
  appointment: CalendarAppointmentLike | null;
  onOpenChange: (open: boolean) => void;
  onMoved: (appointment: CalendarAppointmentLike, startAt: string) => Promise<void>;
}) {
  const [startAt, setStartAt] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !appointment) return;
    setStartAt(localDateTimeValue(appointment.startAt));
    setError('');
  }, [open, appointment]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!appointment || !startAt || saving) return;
    const nextStart = new Date(startAt);
    if (Number.isNaN(nextStart.getTime())) {
      setError('زمان انتخاب‌شده معتبر نیست.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onMoved(appointment, nextStart.toISOString());
      onOpenChange(false);
    } catch {
      setError('این زمان قابل رزرو نیست یا تغییر انجام نشد.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open && Boolean(appointment)} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <DialogTitle className="flex items-center gap-2">
          <Move className="h-5 w-5 text-primary" aria-hidden="true" />
          انتقال نوبت
        </DialogTitle>
        <DialogDescription>
          زمان جدید انتخاب کن؛ ظرفیت آرایشگر و صندلی دوباره بررسی می‌شود.
        </DialogDescription>
        <form onSubmit={(event) => void submit(event)} className="mt-4 flex flex-col gap-3">
          <TextField
            label="زمان شروع جدید"
            type="datetime-local"
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
            disabled={saving}
            dir="ltr"
            step={900}
          />
          {appointment?.staffName && (
            <p className="m-0 rounded-lg bg-bg p-2.5 text-xs text-muted">
              آرایشگر فعلی: {appointment.staffName}
            </p>
          )}
          {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={saving}>انصراف</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={saving} disabled={saving || !startAt}>
              ذخیره زمان جدید
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
