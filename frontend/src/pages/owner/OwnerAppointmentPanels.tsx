import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  CreditCard,
  History,
  MessageCircle,
  Move,
  Phone,
  Send,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import {
  ApiError,
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
  Money,
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
  depositReceiptStatus?: string | null;
  depositPaymentStatus?: string | null;
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

export function getRescheduleErrorMessage(error: unknown): string {
  const code =
    error instanceof ApiError
      ? error.code
      : error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined;

  switch (code) {
    case 'BOOKING_SLOT_UNAVAILABLE':
    case 'RESCHEDULE_CONFLICT':
      return 'علت: برای این بازه ظرفیت قابل رزرو پیدا نشد؛ ممکن است با نوبت فعال تداخل داشته باشد یا آرایشگر/صندلی آزاد نباشد.';
    case 'RESCHEDULE_OUTSIDE_HOURS':
      return 'علت: زمان انتخاب‌شده خارج از ساعت کاری آرایشگر یا صندلی است.';
    case 'RESCHEDULE_CLOSED':
      return 'علت: زمان انتخاب‌شده در تعطیلی سالن یا بازه بسته‌شده قرار دارد.';
    case 'RESCHEDULE_INVALID_START':
      return 'علت: زمان انتخاب‌شده معتبر نیست.';
    case 'APPOINTMENT_NOT_MOVABLE':
      return 'علت: این نوبت دیگر قابل جابجایی نیست.';
    case 'APPOINTMENT_NOT_FOUND':
      return 'علت: این نوبت پیدا نشد؛ تقویم را تازه‌سازی کن.';
    default:
      return 'علت: تغییر زمان انجام نشد؛ نوبت قبلی بدون تغییر باقی ماند.';
  }
}

const actionLinkClass =
  'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:pointer-events-none';

export function AppointmentDetailsSheet({
  open,
  appointment,
  onOpenChange,
  onMove,
  onRebook,
  onDepositReviewed,
}: {
  open: boolean;
  appointment: CalendarAppointmentLike | null;
  onOpenChange: (open: boolean) => void;
  onMove: (appointment: CalendarAppointmentLike) => void;
  onRebook: (appointment: CalendarAppointmentLike) => void;
  onDepositReviewed?: (status: string) => void;
}) {
  const [overview, setOverview] = useState<AppointmentCustomerOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [messageState, setMessageState] = useState<'idle' | 'sent' | 'error'>('idle');
  const [sending, setSending] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [receipt, setReceipt] = useState<{
    mimeType: string;
    dataBase64: string;
    fileName: string;
    status: string;
  } | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const [receiptReviewing, setReceiptReviewing] = useState(false);
  const [reviewNote, setReviewNote] = useState('');

  useEffect(() => {
    if (!open || !appointment) return;
    let active = true;
    setOverview(null);
    setLoadError('');
    setMessage('');
    setMessageState('idle');
    setNoteDraft('');
    setNoteError('');
    setReceipt(null);
    setReceiptError('');
    setReviewNote('');
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

  useEffect(() => {
    if (!open || !appointment || !overview?.deposit?.receiptId) return;
    let active = true;
    setReceiptLoading(true);
    setReceiptError('');
    adminApi
      .getDepositReceipt(appointment.id)
      .then((response) => {
        if (active) setReceipt(response.receipt);
      })
      .catch(() => {
        if (active) setReceiptError('تصویر رسید بارگذاری نشد.');
      })
      .finally(() => {
        if (active) setReceiptLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, appointment, overview?.deposit?.receiptId]);

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

  const addNote = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = noteDraft.trim();
    if (!appointment || !body || noteSaving) return;
    if (typeof adminApi.addCustomerNote !== 'function') {
      setNoteError('ثبت یادداشت در این نسخه فعال نیست.');
      return;
    }
    setNoteSaving(true);
    setNoteError('');
    try {
      const result = await adminApi.addCustomerNote(appointment.id, body);
      setOverview((current) =>
        current
          ? { ...current, notes: [result.note, ...current.notes] }
          : current,
      );
      setNoteDraft('');
    } catch {
      setNoteError('ثبت یادداشت انجام نشد؛ دوباره تلاش کن.');
    } finally {
      setNoteSaving(false);
    }
  };

  const reviewReceipt = async (decision: 'approved' | 'rejected') => {
    if (!appointment || receiptReviewing) return;
    setReceiptReviewing(true);
    setReceiptError('');
    try {
      const result = await adminApi.reviewDepositReceipt(
        appointment.id,
        decision,
        reviewNote.trim() || undefined,
      );
      setOverview((current) =>
        current?.deposit
          ? {
              ...current,
              deposit: {
                ...current.deposit,
                receiptStatus: result.receiptStatus,
                paymentStatus: decision === 'approved' ? 'paid' : 'failed',
                appointmentStatus: result.appointmentStatus,
              },
            }
          : current,
      );
      setReceipt((current) => (current ? { ...current, status: result.receiptStatus } : current));
      onDepositReviewed?.(result.receiptStatus);
    } catch {
      setReceiptError('ثبت نتیجه رسید انجام نشد؛ دوباره تلاش کن.');
    } finally {
      setReceiptReviewing(false);
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
            {overview.deposit?.required && (
              <section className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="m-0 flex items-center gap-2 text-sm font-bold text-text">
                      <CreditCard className="h-4 w-4 text-primary" aria-hidden="true" />
                      بیعانه رزرو
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      مبلغ: <Money amountRial={overview.deposit.amountRial ?? 0} />
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2 py-1 text-[0.68rem] font-bold',
                      overview.deposit.receiptStatus === 'approved'
                        ? 'bg-success/10 text-success'
                        : overview.deposit.receiptStatus === 'rejected' || overview.deposit.receiptStatus === 'expired'
                          ? 'bg-danger/10 text-danger'
                          : 'bg-warning/15 text-warning',
                    )}
                  >
                    {overview.deposit.receiptStatus === 'approved'
                      ? 'تأیید شده'
                      : overview.deposit.receiptStatus === 'rejected'
                        ? 'رد شده'
                        : overview.deposit.receiptStatus === 'expired'
                          ? 'منقضی شده'
                          : overview.deposit.receiptStatus === 'pending'
                            ? 'در انتظار بررسی'
                            : overview.deposit.method === 'gateway'
                              ? 'پرداخت درگاه'
                              : 'رسید ارسال نشده'}
                  </span>
                </div>

                {overview.deposit.method === 'card_transfer' && (
                  <p className="m-0 mt-2 text-xs text-muted">روش: کارت‌به‌کارت</p>
                )}
                {receiptLoading && <p className="m-0 mt-3 text-xs text-muted">در حال دریافت تصویر رسید…</p>}
                {receipt && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-border bg-bg">
                    <img
                      src={`data:${receipt.mimeType};base64,${receipt.dataBase64}`}
                      alt="رسید واریز بیعانه مشتری"
                      className="max-h-72 w-full object-contain"
                    />
                    <p className="m-0 border-t border-border px-2.5 py-2 text-xs text-muted">{receipt.fileName}</p>
                  </div>
                )}
                {overview.deposit.receiptStatus === 'pending' && (
                  <>
                    <TextField
                      label="یادداشت بررسی (اختیاری)"
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                      maxLength={500}
                      containerClassName="mt-3"
                    />
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        size="md"
                        loading={receiptReviewing}
                        disabled={receiptReviewing}
                        startIcon={<CheckCircle2 className="h-4 w-4" />}
                        onClick={() => void reviewReceipt('approved')}
                        className="flex-1"
                      >
                        تأیید رسید
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="md"
                        loading={receiptReviewing}
                        disabled={receiptReviewing}
                        onClick={() => void reviewReceipt('rejected')}
                        className="flex-1"
                      >
                        رد رسید
                      </Button>
                    </div>
                  </>
                )}
                {receiptError && <p role="alert" className="m-0 mt-2 text-xs text-danger">{receiptError}</p>}
              </section>
            )}
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
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-text">یادداشت‌ها</h3>
                <span className="text-xs text-muted"><Num value={String(overview.notes.length)} /> یادداشت</span>
              </div>
              <form onSubmit={(event) => void addNote(event)} className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                <textarea
                  value={noteDraft}
                  onChange={(event) => {
                    setNoteDraft(event.target.value);
                    setNoteError('');
                  }}
                  maxLength={1000}
                  rows={2}
                  disabled={noteSaving}
                  aria-label="یادداشت جدید مشتری"
                  placeholder="مثلاً: رنگ مورد علاقه یا حساسیت مشتری…"
                  className="w-full resize-none rounded-md border border-border bg-bg px-2.5 py-2 text-xs text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[0.68rem] text-muted"><Num value={String(noteDraft.length)} /> / <Num value="1000" /></span>
                  <Button
                    type="submit"
                    size="md"
                    variant="secondary"
                    loading={noteSaving}
                    disabled={noteSaving || !noteDraft.trim()}
                  >
                    ثبت یادداشت
                  </Button>
                </div>
              </form>
              {noteError && <p role="alert" className="mt-2 text-xs text-danger">{noteError}</p>}
              {overview.notes.length === 0 ? (
                <p className="mt-2 rounded-lg border border-border bg-bg p-3 text-xs text-muted">
                  هنوز یادداشتی ثبت نشده است.
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
  initialError = '',
}: {
  open: boolean;
  appointment: CalendarAppointmentLike | null;
  onOpenChange: (open: boolean) => void;
  onMoved: (appointment: CalendarAppointmentLike, startAt: string) => Promise<void>;
  initialError?: string;
}) {
  const [startAt, setStartAt] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !appointment) return;
    setStartAt(localDateTimeValue(appointment.startAt));
  }, [open, appointment]);

  useEffect(() => {
    if (!open || !appointment) return;
    setError(initialError);
  }, [open, appointment, initialError]);

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
    } catch (caught) {
      setError(getRescheduleErrorMessage(caught));
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
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <strong className="font-semibold">انتقال انجام نشد</strong>
                <span>{error}</span>
                <span className="text-xs">نوبت قبلی بدون تغییر باقی ماند.</span>
              </div>
            </div>
          )}
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
