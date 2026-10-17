import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { normalizeDigits as normalizeContactDigits } from '@salon/shared';
import { Clock, ContactRound, User } from 'lucide-react';
import { adminApi, clientBookApi, salonApi, getApiErrorMessage, type SalonClient } from '../../api/client';
import {
  Button, MobileDatePicker, Select, Sheet, SheetClose, SheetContent,
  SheetDescription, SheetTitle, TextField, TimeWheelField, toPersianDigits,
} from '../../components/ui';
import './owner-sheets.css';

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

/** Convert common local/international formats to the backend's 09xxxxxxxxx shape. */
export function normalizeIranianMobile(value: string): string | null {
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

export function ManualBookingSheet({
  salonId,
  date,
  initialStart,
  initialPhone,
  initialFullName,
  initialServiceId,
  client,
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
  client?: SalonClient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const formId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [services, setServices] = useState<
    Array<{
      id: string;
      name: string;
      durationMinutes: number;
      durationMode?: 'fixed' | 'variable';
      minDurationMinutes?: number | null;
      maxDurationMinutes?: number | null;
    }>
  >([]);
  const [serviceId, setServiceId] = useState('');
  const [startAt, setStartAt] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedClient, setSelectedClient] = useState<SalonClient | null>(null);
  const [locationTypes, setLocationTypes] = useState<Array<'salon' | 'customer'>>(['salon']);
  const [locationType, setLocationType] = useState<'salon' | 'customer'>('salon');
  const [locationAddress, setLocationAddress] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [durationOverride, setDurationOverride] = useState('');
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
    value.setMinutes(initialStart ? Math.floor(value.getMinutes() / 15) * 15 : Math.ceil((value.getMinutes() + 1) / 15) * 15, 0, 0);
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }, [date, initialStart]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setStartAt(toInputValue());
    setPhone(client?.phone ?? initialPhone ?? '');
    setFullName(client?.fullName ?? initialFullName ?? '');
    setSelectedClient(client ?? null);
    setServiceId('');
    setLocationTypes(['salon']);
    setLocationType('salon');
    setLocationAddress('');
    setCustomerNote('');
    setDurationOverride('');
    setClientSearch(client ? '' : initialPhone ?? '');
    setClientResults([]);
    setClientSearchLoading(false);
    setContactStatus('idle');
    setError('');
    setLoading(true);
    salonApi
      .getServices(salonId)
      .then((response) => {
        if (!active) return;
        const next = response.services.map((service) => ({
          id: service.id,
          name: service.name,
          durationMinutes: service.durationMinutes,
          durationMode: service.durationMode,
          minDurationMinutes: service.minDurationMinutes,
          maxDurationMinutes: service.maxDurationMinutes,
        }));
        setServices(next);
        setServiceId(
          initialServiceId && next.some((service) => service.id === initialServiceId)
            ? initialServiceId
            : next[0]?.id || '',
        );
        const selected = next.find((service) => service.id === (initialServiceId ?? next[0]?.id));
        setDurationOverride(
          selected?.durationMode === 'variable' && selected.minDurationMinutes
            ? String(selected.minDurationMinutes)
            : '',
        );
      })
      .catch(() => {
        if (!active) return;
        setServices([]);
        setError('دریافت فهرست خدمات انجام نشد.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [
    open,
    salonId,
    toInputValue,
    initialPhone,
    initialFullName,
    initialServiceId,
    client,
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
      setClientSearch(selectedPhone);
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
      setClientSearch(selectedPhone);
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
    if (saving || loading) return;
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
    const selectedService = services.find((service) => service.id === serviceId);
    const parsedDuration = durationOverride.trim() ? Number(durationOverride) : undefined;
    if (selectedService?.durationMode === 'variable') {
      if (
        parsedDuration === undefined ||
        !Number.isInteger(parsedDuration) ||
        parsedDuration < (selectedService.minDurationMinutes ?? 5) ||
        parsedDuration > (selectedService.maxDurationMinutes ?? 480)
      ) {
        setError(
          `مدت خدمت باید بین ${toPersianDigits(String(selectedService.minDurationMinutes ?? 5))} تا ${toPersianDigits(String(selectedService.maxDurationMinutes ?? 480))} دقیقه باشد.`,
        );
        return;
      }
    }
    if (customerNote.trim().length > 1000) {
      setError('یادداشت مشتری نمی‌تواند بیشتر از ۱۰۰۰ نویسه باشد.');
      return;
    }
    const start = new Date(startAt);
    if (Number.isNaN(start.getTime())) {
      setError('زمان انتخاب‌شده معتبر نیست.');
      return;
    }
    if (start.getTime() <= Date.now()) {
      setError('تاریخ و ساعت نوبت باید در آینده باشد.');
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
        ...(customerNote.trim() ? { customerNote: customerNote.trim() } : {}),
        ...(parsedDuration !== undefined ? { durationMinutes: parsedDuration } : {}),
      });
      onChanged();
      onOpenChange(false);
    } catch (reason) {
      setError(getApiErrorMessage(reason, 'ثبت نوبت انجام نشد؛ این زمان احتمالاً پر شده است.'));
    } finally {
      setSaving(false);
    }
  };

  const [startDate, startTime] = startAt.split('T');

  return (
    <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <SheetContent
        side="bottom"
        className="owner-form-sheet !mx-auto !w-[min(100%,34rem)] !max-w-none !overflow-hidden !rounded-t-2xl !p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus({ preventScroll: true });
        }}
      >
        <div className="owner-sheet-header">
          <SheetTitle ref={titleRef} tabIndex={-1} className="pe-10 !text-xl !font-bold">ثبت نوبت</SheetTitle>
          <SheetDescription className="!mt-1 text-xs leading-6">خدمت، تاریخ و ساعت نوبت را انتخاب کن.</SheetDescription>
        </div>
        <form id={formId} onSubmit={(event) => void submit(event)} className="owner-sheet-scroll" dir="ltr">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <User className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="m-0 text-sm font-bold text-text">مشتری</h3>
                <p className="m-0 mt-1 text-xs leading-5 text-muted">
                  {client ? 'اطلاعات مشتری از دفترچه انتخاب شده است.' : 'شماره را وارد کن یا یکی از مشتری‌های قبلی را انتخاب کن.'}
                </p>
              </div>
            </div>
            {selectedClient && !client && (
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
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <TextField
                    label="شماره موبایل مشتری"
                    placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                    value={clientSearch}
                    onChange={(event) => {
                      setClientSearch(event.target.value);
                      setPhone(event.target.value);
                      setSelectedClient(null);
                      setError('');
                    }}
                    disabled={saving || loading}
                    autoComplete="tel"
                    inputMode="tel"
                    dir="ltr"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  className="w-full shrink-0 sm:w-auto"
                  startIcon={<ContactRound className="h-4 w-4" />}
                  onClick={() => void handleContactPick()}
                  loading={contactLoading}
                  disabled={saving || loading || contactLoading}
                >
                  از مخاطبین تلفن
                </Button>
              </div>
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
                    <p className="m-0 rounded-lg bg-bg px-3 py-2 text-xs leading-5 text-muted">
                      مشتری با این شماره پیدا نشد؛ با ثبت نوبت به مشتری‌های این سالن اضافه می‌شود.
                    </p>
                  )}
                </div>
              )}
              {!selectedClient && (
                <TextField
                  label="نام مشتری (اختیاری)"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  disabled={saving || loading}
                  autoComplete="name"
                />
              )}
              <div className="mt-2">
                <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-bg px-3 py-2 text-xs font-bold text-muted transition-colors hover:bg-elevated hover:text-text focus-within:outline focus-within:outline-2 focus-within:outline-focus">
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
        <div className="mt-4 flex flex-col gap-4">
          <Select
            label="خدمت"
            value={serviceId}
            onValueChange={(nextServiceId) => {
              if (!nextServiceId) return;
              setServiceId(nextServiceId);
              const nextService = services.find((service) => service.id === nextServiceId);
              setDurationOverride(
                nextService?.durationMode === 'variable' && nextService.minDurationMinutes
                  ? String(nextService.minDurationMinutes)
                  : '',
              );
            }}
            options={services.map((service) => ({
              value: service.id,
              label: `${service.name} · ${toPersianDigits(String(service.durationMinutes))} دقیقه`,
            }))}
            placeholder={loading ? 'در حال دریافت خدمات…' : 'انتخاب خدمت'}
            disabled={loading || saving}
            emptyText="خدمتی ثبت نشده است"
          />
          {services.find((service) => service.id === serviceId)?.durationMode === 'variable' && (
            <TextField
              label="مدت این نوبت (دقیقه)"
              type="number"
              min={services.find((service) => service.id === serviceId)?.minDurationMinutes ?? 5}
              max={services.find((service) => service.id === serviceId)?.maxDurationMinutes ?? 480}
              step={5}
              value={durationOverride}
              onChange={(event) => setDurationOverride(event.target.value)}
              disabled={saving}
              helperText={`بین ${toPersianDigits(String(services.find((service) => service.id === serviceId)?.minDurationMinutes ?? 5))} تا ${toPersianDigits(String(services.find((service) => service.id === serviceId)?.maxDurationMinutes ?? 480))} دقیقه`}
              dir="ltr"
            />
          )}
          <section
            aria-labelledby="manual-booking-start-title"
            className="rounded-2xl border border-border bg-elevated/60 p-3 sm:p-4"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Clock className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 id="manual-booking-start-title" className="m-0 text-sm font-bold text-text">
                  زمان شروع نوبت
                </h3>
                <p className="m-0 mt-1 text-xs leading-5 text-muted">
                  تاریخ و ساعت را از انتخاب‌گر فارسی مشخص کن.
                </p>
              </div>
            </div>
            <div className="owner-calendar-time-fields mt-3 grid gap-3 sm:grid-cols-2">
              <MobileDatePicker
                label="تاریخ نوبت"
                value={startDate || null}
                onChange={(nextDate) => setStartAt(`${nextDate}T${startTime || '09:00'}`)}
                disabled={saving}
              />
              <TimeWheelField
                label="ساعت شروع"
                value={startTime || '09:00'}
                onChange={(nextTime) => setStartAt(`${startDate}T${nextTime}`)}
                disabled={saving}
                minuteStep={15}
              />
            </div>
          </section>
          <details className="rounded-xl border border-border bg-surface p-3">
            <summary className="cursor-pointer text-sm font-medium text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">افزودن یادداشت (اختیاری)</summary>
          <label className="mt-3 flex flex-col gap-1.5 text-xs font-medium text-muted">
            <span>یادداشت مشتری (اختیاری)</span>
            <textarea
              value={customerNote}
              onChange={(event) => setCustomerNote(event.target.value)}
              maxLength={1000}
              rows={3}
              disabled={saving}
              aria-label="یادداشت مشتری (اختیاری)"
              className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <span className="text-[0.68rem] font-normal text-muted">
              {toPersianDigits(String(customerNote.length))} / ۱۰۰۰
            </span>
          </label>
          </details>
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
          </div>
        </form>
        <div className="owner-sheet-footer">
          {error && <p role="alert" className="mb-3 rounded-lg bg-danger/5 p-2.5 text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            <Button form={formId} type="submit" className="flex-1" loading={saving} disabled={saving || loading || !serviceId}>
              ثبت نوبت
            </Button>
            <SheetClose asChild>
              <Button type="button" variant="ghost" disabled={saving}>انصراف</Button>
            </SheetClose>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

