import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Phone, Plus, Search, UserRound, Users } from 'lucide-react';
import { normalizeDigits } from '@salon/shared';
import { ApiError, clientBookApi, type SalonClient } from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { SeoHead } from '../../components/seo';
import {
  Button,
  Card,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  EmptyState,
  ErrorState,
  Skeleton,
  TextField,
  useToast,
  toPersianDigits,
} from '../../components/ui';

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
    <section
      data-testid="owner-clients-page"
      className="flex flex-col gap-5"
    >
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
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-sm font-bold text-primary">
                      {displayName(client).slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="truncate font-bold text-text">{displayName(client)}</h3>
                        {client.visits >= 3 && (
                          <span className="inline-flex shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-[0.65rem] font-bold text-success">
                            مشتری وفادار
                          </span>
                        )}
                      </div>
                      <a
                        href={`tel:${client.phone}`}
                        dir="ltr"
                        className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted no-underline hover:text-primary"
                      >
                        <Phone className="size-3.5" aria-hidden="true" />
                        {toPersianDigits(client.phone)}
                      </a>
                    </div>
                  </div>
                  <Link
                    to="/owner/calendar"
                    className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 text-sm font-bold text-primary no-underline transition-colors hover:bg-primary/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-auto"
                  >
                    <CalendarPlus className="size-4" aria-hidden="true" />
                    ثبت نوبت
                  </Link>
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

      <Dialog
        open={addOpen}
        onOpenChange={(next) => {
          if (!saving) {
            setAddOpen(next);
            if (!next) resetForm();
          }
        }}
      >
        <DialogContent>
          <DialogTitle>مشتری جدید</DialogTitle>
          <DialogDescription>فقط نام و شماره را وارد کن؛ جزئیات نوبت را بعداً اضافه می‌کنی.</DialogDescription>
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
            {formError && <p className="text-sm text-danger" role="alert">{formError}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={saving}>انصراف</Button>
              </DialogClose>
              <Button type="submit" loading={saving}>افزودن مشتری</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default OwnerClientsPage;
