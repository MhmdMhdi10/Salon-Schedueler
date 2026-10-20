import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  Clock3,
  Phone,
  Plus,
  Search,
  UserRound,
  Users,
} from 'lucide-react';
import { normalizeDigits } from '@salon/shared';
import {
  adminApi,
  ApiError,
  clientBookApi,
  type SalonClient,
  type SalonCustomerProfile,
} from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { SeoHead } from '../../components/seo';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  TextField,
  useToast,
  toPersianDigits,
} from '../../components/ui';

import { ManualBookingSheet } from './ManualBookingSheet';

const PHONE_PATTERN = /^09\d{9}$/;

function normalizePhone(raw: string): string {
  let value = normalizeDigits(raw).replace(/[\s()-]/g, '');
  if (value.startsWith('+98')) value = `0${value.slice(3)}`;
  else if (value.startsWith('0098')) value = `0${value.slice(4)}`;
  else if (value.startsWith('98') && value.length === 12) value = `0${value.slice(2)}`;
  return value;
}

function displayName(client: SalonClient): string {
  return client.fullName?.trim() || 'مشتری بدون نام';
}

function formatLastVisit(value: string | null): string {
  if (!value) return 'هنوز مراجعه‌ای ثبت نشده';
  return new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' }).format(
    new Date(value),
  );
}

function formatAppointmentDate(value: string, timeZone?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'زمان نامشخص';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(
      date,
    );
  }
}

function appointmentStatus(status: string): { label: string; className: string } {
  switch (status) {
    case 'confirmed':
    case 'approved':
      return { label: 'تأیید شده', className: 'bg-success/10 text-success' };
    case 'completed':
      return { label: 'انجام شده', className: 'bg-primary/10 text-primary' };
    case 'pending':
      return { label: 'در انتظار تأیید', className: 'bg-warning/15 text-text' };
    case 'held':
      return { label: 'در انتظار پرداخت', className: 'bg-warning/15 text-text' };
    case 'no_show':
      return { label: 'عدم حضور', className: 'bg-danger/10 text-danger' };
    case 'cancelled':
    case 'rejected':
      return { label: 'لغو شده', className: 'bg-danger/10 text-danger' };
    case 'expired':
      return { label: 'منقضی شده', className: 'bg-bg text-muted' };
    default:
      return { label: 'رزرو شده', className: 'bg-bg text-muted' };
  }
}

/** Booksy-style client book: search first, add a client in one short form. */
export function OwnerClientsPage() {
  const salonId = useSalonId();
  const { success, error: toastError } = useToast();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [clients, setClients] = useState<SalonClient[]>([]);
  const [search, setSearch] = useState('');
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedClient, setSelectedClient] = useState<SalonClient | null>(null);
  const [clientProfile, setClientProfile] = useState<SalonCustomerProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [profileReload, setProfileReload] = useState(0);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [bookingClient, setBookingClient] = useState<SalonClient | null>(null);
  const [bookingDate, setBookingDate] = useState(() => new Date());

  const load = useCallback(async () => {
    setStatus('loading');
    setLoadError('');
    try {
      const result = await clientBookApi.list(salonId, search.trim() || undefined);
      setClients(result.clients);
      setStatus('ready');
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'بارگذاری مشتری‌ها ناموفق بود.');
      setStatus('error');
    }
  }, [salonId, search]);

  useEffect(() => {
    if (!selectedClient) return;
    let active = true;
    setProfileStatus('loading');
    setClientProfile(null);
    adminApi
      .getSalonCustomerProfile(salonId, selectedClient.id)
      .then((profile) => {
        if (active) {
          setClientProfile(profile);
          setProfileStatus('ready');
        }
      })
      .catch(() => {
        if (active) setProfileStatus('error');
      });
    return () => {
      active = false;
    };
  }, [salonId, selectedClient, profileReload]);

  const openClientDetails = (client: SalonClient) => {
    setClientProfile(null);
    setProfileStatus('loading');
    setShowAllHistory(false);
    setSelectedClient(client);
  };

  const registerAppointment = (client: SalonClient) => {
    setSelectedClient(null);
    setBookingDate(new Date());
    setBookingClient(client);
  };

  const history = clientProfile?.appointments ?? [];
  const visibleHistory = showAllHistory ? history : history.slice(0, 5);
  const nextAppointment = history
    .filter(
      (item) =>
        ['pending', 'held', 'confirmed', 'approved'].includes(item.status) &&
        new Date(item.startAt).getTime() > Date.now(),
    )
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0];

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, reload, search]);

  const resetForm = () => {
    setName('');
    setPhone('');
    setFormError('');
  };

  const addClient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fullName = name.trim();
    const normalizedPhone = normalizePhone(phone);
    if (fullName.length < 2) {
      setFormError('نام مشتری را وارد کنید.');
      return;
    }
    if (!PHONE_PATTERN.test(normalizedPhone)) {
      setFormError('شماره موبایل نامعتبر است.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await clientBookApi.add(salonId, { fullName, phone: normalizedPhone });
      setAddOpen(false);
      resetForm();
      setReload((value) => value + 1);
      success({ title: 'مشتری به دفترچه اضافه شد' });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'افزودن مشتری ناموفق بود.';
      setFormError(message);
      toastError({ title: 'افزودن مشتری انجام نشد' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section data-testid="owner-clients-page" className="flex flex-col gap-5">
      <SeoHead title="مشتری‌ها" />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-display text-2xl text-text sm:text-3xl">مشتری‌ها</h1>
            <p className="mt-1 text-sm leading-6 text-muted">
              مشتری‌ها، سابقه مراجعه و شماره تماس را یک‌جا نگه دار.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="lg"
          startIcon={<Plus className="size-4" aria-hidden="true" />}
          onClick={() => setAddOpen(true)}
          className="w-full sm:w-auto"
        >
          مشتری جدید
        </Button>
      </header>

      <Card
        as="section"
        aria-labelledby="owner-client-search-title"
        className="flex flex-col gap-4"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Search className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id="owner-client-search-title" className="font-bold text-text">
              جست‌وجو در دفترچه مشتری‌ها
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              با نام یا شماره موبایل، مشتری را پیدا کن.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField
            id="owner-client-search"
            label="نام یا شماره موبایل"
            placeholder="نام یا شماره موبایل"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            containerClassName="w-full sm:flex-1"
          />
          <span
            className="inline-flex min-h-11 shrink-0 items-center self-start rounded-lg border border-border bg-elevated px-3 text-sm font-semibold text-text sm:self-end"
            aria-live="polite"
          >
            {status === 'ready' ? `${toPersianDigits(clients.length)} مشتری` : 'در حال بررسی…'}
          </span>
        </div>
      </Card>

      {status === 'loading' && (
        <div
          data-testid="owner-clients-loading"
          role="status"
          aria-label="در حال بارگذاری مشتری‌ها"
          className="flex flex-col gap-3"
        >
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-elevated p-4 shadow-1"
            >
              <div className="flex items-center gap-3">
                <Skeleton variant="circle" className="size-11 shrink-0" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton variant="text" className="w-2/5" />
                  <Skeleton variant="text" className="w-1/3" />
                </div>
              </div>
              <Skeleton variant="rect" className="h-14 rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <ErrorState
          title="بارگذاری مشتری‌ها ناموفق بود"
          description={loadError}
          retryLabel="تلاش مجدد"
          onRetry={() => void load()}
        />
      )}

      {status === 'ready' && clients.length === 0 && (
        <EmptyState
          icon={<UserRound className="size-8" />}
          title={search ? 'مشتری پیدا نشد' : 'دفترچه مشتری‌ها خالی است'}
          description={
            search
              ? 'نام یا شماره دیگری را امتحان کن.'
              : 'مشتری‌های حضوری یا قدیمی را اضافه کن تا نوبت بعدی سریع‌تر ثبت شود.'
          }
          action={
            !search ? (
              <Button
                type="button"
                onClick={() => setAddOpen(true)}
                startIcon={<Plus className="size-4" />}
              >
                افزودن اولین مشتری
              </Button>
            ) : undefined
          }
        />
      )}

      {status === 'ready' && clients.length > 0 && (
        <section aria-labelledby="owner-client-list-title" className="flex flex-col gap-3">
          <header className="flex items-center justify-between gap-3">
            <div>
              <h2 id="owner-client-list-title" className="text-base font-bold text-text">
                دفترچه مشتری‌ها
              </h2>
              <p className="mt-1 text-sm text-muted">
                اطلاعات هر مشتری و سابقه مراجعه در کارت خودش قرار دارد.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
              {toPersianDigits(clients.length)} نفر
            </span>
          </header>
          <ul data-testid="owner-client-list" className="flex flex-col gap-3">
            {clients.map((client) => (
              <Card
                as="li"
                elevated
                key={client.id}
                className="owner-client-record flex flex-col gap-4 rounded-2xl p-3 sm:p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => openClientDetails(client)}
                    aria-label={'مشاهده جزئیات ' + displayName(client)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                  >
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
                      aria-hidden="true"
                    >
                      {displayName(client).slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-bold text-text">{displayName(client)}</span>
                        {client.visits >= 3 && (
                          <span className="rounded-full bg-success/10 px-2 py-0.5 text-[0.65rem] font-bold text-success">
                            مشتری وفادار
                          </span>
                        )}
                      </span>
                      <span dir="ltr" className="mt-1 block w-fit text-sm text-muted">
                        {toPersianDigits(client.phone)}
                      </span>
                    </span>
                    <ChevronLeft className="size-4 shrink-0 text-muted" aria-hidden="true" />
                  </button>
                  <Button
                    type="button"
                    variant="secondary"
                    startIcon={<CalendarPlus className="size-4" aria-hidden="true" />}
                    className="w-full shrink-0 sm:w-auto"
                    onClick={() => registerAppointment(client)}
                  >
                    ثبت نوبت
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-3 py-2.5">
                    <span className="text-xs text-muted">تعداد مراجعه</span>
                    <span className="text-sm font-bold text-text">
                      {toPersianDigits(client.visits)} مراجعه
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-3 py-2.5">
                    <span className="text-xs text-muted">آخرین مراجعه</span>
                    <span className="text-sm font-bold text-text">
                      {formatLastVisit(client.lastVisitAt)}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </ul>
        </section>
      )}

      <Sheet
        open={addOpen}
        onOpenChange={(next) => {
          if (!saving) {
            setAddOpen(next);
            if (!next) resetForm();
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="!mx-auto !w-[min(100%,34rem)] !max-w-none !rounded-t-2xl"
        >
          <SheetTitle>مشتری جدید</SheetTitle>
          <SheetDescription>
            فقط نام و شماره را وارد کن؛ جزئیات نوبت را بعداً اضافه می‌کنی.
          </SheetDescription>
          <form className="mt-4 flex flex-col gap-4" onSubmit={addClient}>
            <TextField
              id="new-client-name"
              label="نام و نام خانوادگی"
              placeholder="مثلاً سارا محمدی"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
            <TextField
              id="new-client-phone"
              label="شماره موبایل"
              placeholder="۰۹۱۲۳۴۵۶۷۸۹"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              dir="ltr"
              autoComplete="tel"
              required
            />
            {formError && (
              <p className="text-sm text-danger" role="alert">
                {formError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <SheetClose asChild>
                <Button type="button" variant="ghost" disabled={saving}>
                  انصراف
                </Button>
              </SheetClose>
              <Button type="submit" loading={saving}>
                افزودن مشتری
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(selectedClient)}
        onOpenChange={(next) => !next && setSelectedClient(null)}
      >
        <SheetContent
          side="bottom"
          className="owner-form-sheet !mx-auto !w-[min(100%,34rem)] !max-w-none !overflow-hidden !rounded-t-2xl !p-0"
          onCloseAutoFocus={(event) => {
            if (bookingClient) event.preventDefault();
          }}
        >
          <div className="owner-sheet-header pe-12" dir="rtl">
            <SheetTitle>{selectedClient ? displayName(selectedClient) : 'جزئیات مشتری'}</SheetTitle>
            <SheetDescription className="text-xs">پروندهٔ مشتری و سابقهٔ نوبت‌ها</SheetDescription>
          </div>
          <div className="owner-sheet-scroll" dir="ltr">
            {selectedClient && (
              <div dir="rtl">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
                  <span className="text-xs text-muted">شماره موبایل</span>
                  <a
                    href={'tel:' + selectedClient.phone}
                    dir="ltr"
                    className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-primary no-underline"
                  >
                    <Phone className="size-4" aria-hidden="true" />
                    {toPersianDigits(selectedClient.phone)}
                  </a>
                </div>
                <dl className="mt-3 grid grid-cols-3 divide-x divide-x-reverse divide-border rounded-xl border border-border bg-surface py-3 text-center">
                  <div>
                    <dt className="text-xs text-muted">مراجعه</dt>
                    <dd className="m-0 mt-1 text-lg font-bold text-text">
                      {toPersianDigits(selectedClient.visits)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">عدم حضور</dt>
                    <dd className="m-0 mt-1 text-lg font-bold text-text">
                      {toPersianDigits(selectedClient.noShowCount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">آخرین مراجعه</dt>
                    <dd className="m-0 mt-2 text-xs font-bold text-text">
                      {selectedClient.lastVisitAt
                        ? formatLastVisit(selectedClient.lastVisitAt)
                        : '—'}
                    </dd>
                  </div>
                </dl>
                {nextAppointment && (
                  <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <span className="text-xs font-bold text-primary">نوبت پیش رو</span>
                    <strong className="mt-1 block text-sm text-text">
                      {nextAppointment.serviceName || 'خدمت'}
                    </strong>
                    <p className="m-0 mt-1 text-xs text-muted">
                      {formatAppointmentDate(nextAppointment.startAt, nextAppointment.timezone)}
                    </p>
                  </div>
                )}
                {clientProfile?.customer.preferredStaff && (
                  <p className="mb-0 mt-3 text-xs text-muted">
                    عضو تیم مورد علاقه: {clientProfile.customer.preferredStaff.fullName}
                  </p>
                )}
                <h3 className="mb-3 mt-5 flex items-center gap-2 text-sm font-bold text-text">
                  <CalendarDays className="size-4 text-primary" aria-hidden="true" /> سابقهٔ نوبت‌ها
                </h3>
                {profileStatus === 'loading' && (
                  <div
                    role="status"
                    aria-label="در حال دریافت سابقه"
                    className="flex flex-col gap-2"
                  >
                    {[0, 1, 2].map((item) => (
                      <Skeleton key={item} className="h-20 rounded-xl" variant="rect" />
                    ))}
                  </div>
                )}
                {profileStatus === 'error' && (
                  <div
                    role="alert"
                    className="rounded-xl border border-danger/20 bg-danger/5 p-3 text-sm text-text"
                  >
                    <p className="m-0">سابقه دریافت نشد؛ اطلاعات تماس در دسترس است.</p>
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-2"
                      onClick={() => setProfileReload((value) => value + 1)}
                    >
                      تلاش دوباره
                    </Button>
                  </div>
                )}
                {profileStatus === 'ready' && history.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                    <CalendarPlus className="mx-auto mb-2 size-6 text-muted" aria-hidden="true" />
                    <strong className="block text-sm text-text">هنوز نوبتی ثبت نشده</strong>
                    <p className="mb-0 mt-1 text-xs text-muted">
                      اولین نوبت را با دکمهٔ پایین ثبت کن.
                    </p>
                  </div>
                )}
                {profileStatus === 'ready' && history.length > 0 && (
                  <>
                    <ul className="flex flex-col gap-2">
                      {visibleHistory.map((appointment) => {
                        const status = appointmentStatus(appointment.status);
                        return (
                          <li
                            key={appointment.id}
                            className="rounded-xl border border-border bg-surface p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <strong className="min-w-0 text-sm text-text">
                                {appointment.serviceName || 'خدمت'}
                              </strong>
                              <span
                                className={
                                  'shrink-0 rounded-full px-2 py-1 text-[0.65rem] font-bold ' +
                                  status.className
                                }
                              >
                                {status.label}
                              </span>
                            </div>
                            <span className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                              <Clock3 className="size-3 shrink-0" aria-hidden="true" />
                              {formatAppointmentDate(appointment.startAt, appointment.timezone)}
                            </span>
                            {appointment.staffName && (
                              <span className="mt-1 block text-xs text-muted">
                                عضو تیم: {appointment.staffName}
                              </span>
                            )}
                            {appointment.customerNote && (
                              <p className="mb-0 mt-2 line-clamp-2 text-xs leading-5 text-muted">
                                {appointment.customerNote}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {history.length > 5 && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-2 w-full"
                        onClick={() => setShowAllHistory((current) => !current)}
                      >
                        {showAllHistory
                          ? 'نمایش کمتر'
                          : 'مشاهدهٔ ' + toPersianDigits(history.length - 5) + ' نوبت دیگر'}
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          {selectedClient && (
            <div className="owner-sheet-footer">
              <Button
                type="button"
                className="w-full"
                startIcon={<CalendarPlus className="size-4" />}
                onClick={() => registerAppointment(selectedClient)}
              >
                ثبت نوبت برای این مشتری
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ManualBookingSheet
        salonId={salonId}
        date={bookingDate}
        client={bookingClient ?? undefined}
        open={Boolean(bookingClient)}
        onOpenChange={(next) => {
          if (!next) setBookingClient(null);
        }}
        onChanged={() => {
          setReload((value) => value + 1);
          success({ title: 'نوبت مشتری ثبت شد' });
        }}
      />
    </section>
  );
}

export default OwnerClientsPage;
