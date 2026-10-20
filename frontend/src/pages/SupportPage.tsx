import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, LifeBuoy, Paperclip, RefreshCw, Send, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { supportApi, type SupportTicket } from '../api/client';
import { SeoHead } from '../components/seo';
import { Button, Card, Textarea, useToast } from '../components/ui';

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const SCREENSHOT_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function browserName(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const userAgent = navigator.userAgent;
  if (/edg/i.test(userAgent)) return 'Edge';
  if (/chrome|crios/i.test(userAgent)) return 'Chrome';
  if (/firefox|fxios/i.test(userAgent)) return 'Firefox';
  if (/safari/i.test(userAgent)) return 'Safari';
  return 'Other';
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result.split(',')[1] : '';
      value ? resolve(value) : reject(new Error('Invalid file'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

function ticketStatus(status: string): string {
  return {
    open: 'باز',
    triaged: 'در حال بررسی',
    in_progress: 'در حال پیگیری',
    resolved: 'حل‌شده',
    closed: 'بسته‌شده',
  }[status] ?? status;
}

export function SupportPage() {
  const location = useLocation();
  const { success } = useToast();
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [sentTicket, setSentTicket] = useState<SupportTicket | null>(null);

  const loadTickets = () => {
    setLoading(true);
    setHistoryError('');
    supportApi
      .listMine()
      .then((result) => setTickets(result.tickets))
      .catch(() => setHistoryError('دریافت درخواست‌های قبلی انجام نشد. دوباره تلاش کنید.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const pageContext = useMemo(
    () => `${location.pathname}${location.search}`,
    [location.pathname, location.search],
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = message.trim();
    if (normalized.length < 5 || submitting) return;
    if (screenshot && !SCREENSHOT_MIMES.has(screenshot.type)) {
      setError('فرمت تصویر باید JPG، PNG یا WebP باشد.');
      return;
    }
    if (screenshot && screenshot.size > MAX_SCREENSHOT_BYTES) {
      setError('حجم تصویر باید کمتر از ۵ مگابایت باشد.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const screenshotPayload = screenshot
        ? {
            name: screenshot.name,
            mime: screenshot.type as 'image/jpeg' | 'image/png' | 'image/webp',
            dataBase64: await readFileAsBase64(screenshot),
          }
        : undefined;
      const result = await supportApi.create({
        message: normalized,
        page: pageContext,
        action: 'user_reported_issue',
        browser: browserName(),
        device: typeof navigator === 'undefined' ? 'unknown' : navigator.platform,
        ...(screenshotPayload ? { screenshot: screenshotPayload } : {}),
      });
      setSentTicket(result.ticket);
      setTickets((current) => [result.ticket, ...current]);
      setMessage('');
      setScreenshot(null);
      success({ title: `درخواست شما ثبت شد: ${result.ticket.ticketNumber}` });
    } catch {
      setError('ثبت درخواست پشتیبانی انجام نشد؛ دوباره تلاش کنید.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-testid="support-page" className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8">
      <SeoHead title="پشتیبانی آرا" />
      <header className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-surface to-surface p-5 shadow-1 sm:p-7">
        <div className="flex items-start gap-3 sm:gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-contrast sm:size-12">
            <LifeBuoy className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="m-0 text-sm font-bold text-primary">پشتیبانی آرا</p>
            <h1 className="m-0 mt-1 text-2xl font-bold text-text">چطور می‌توانیم کمک کنیم؟</h1>
            <p className="m-0 mt-2 max-w-2xl text-sm leading-7 text-muted">
              مشکل یا پیشنهادت را بنویس. درخواست و پاسخ آن را همین‌جا می‌بینی.
            </p>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-6">
        <Card as="section" aria-labelledby="support-form-title" className="p-4 sm:p-6">
          <div className="mb-5">
            <h2 id="support-form-title" className="m-0 text-lg font-bold text-text">درخواست جدید</h2>
            <p className="m-0 mt-1 text-sm leading-6 text-muted">بگو چه کاری انجام دادی، چه اتفاقی افتاد و چه انتظاری داشتی.</p>
          </div>
          {sentTicket && (
            <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>درخواست ثبت شد. کد پیگیری: <bdi dir="ltr" className="font-bold">{sentTicket.ticketNumber}</bdi></span>
            </div>
          )}
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
            <Textarea
              label="شرح درخواست"
              value={message}
              onChange={(event) => { setMessage(event.target.value); setError(''); }}
              placeholder="مثلاً هنگام ثبت نوبت، پس از انتخاب زمان پیام خطا دیدم…"
              rows={6}
              maxLength={4000}
              required
              helperText={`حداقل ۵ نویسه · ${message.length.toLocaleString('fa-IR')} از ۴۰۰۰`}
            />
            <div>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-bg px-4 py-3 text-sm text-text transition-colors hover:border-primary/50">
                <Paperclip className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 break-all">{screenshot ? screenshot.name : 'افزودن تصویر خطا (اختیاری)'}</span>
                <input
                  type="file"
                  className="sr-only"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (file && !SCREENSHOT_MIMES.has(file.type)) {
                      setScreenshot(null);
                      event.currentTarget.value = '';
                      setError('فرمت تصویر باید JPG، PNG یا WebP باشد.');
                      return;
                    }
                    if (file && file.size > MAX_SCREENSHOT_BYTES) {
                      setScreenshot(null);
                      event.currentTarget.value = '';
                      setError('حجم تصویر باید کمتر از ۵ مگابایت باشد.');
                      return;
                    }
                    setScreenshot(file);
                    setError('');
                  }}
                />
              </label>
              {screenshot ? (
                <button type="button" className="mt-1 inline-flex min-h-10 items-center gap-1 text-xs text-muted hover:text-danger" onClick={() => setScreenshot(null)}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" /> حذف تصویر
                </button>
              ) : (
                <p className="m-0 mt-1 text-xs text-muted">JPG، PNG یا WebP تا ۵ مگابایت</p>
              )}
            </div>
            {error && <p role="alert" className="m-0 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}
            <Button type="submit" size="lg" loading={submitting} disabled={submitting || message.trim().length < 5} startIcon={<Send className="h-4 w-4" aria-hidden="true" />}>
              ارسال درخواست
            </Button>
          </form>
        </Card>

        <section aria-labelledby="support-history-title" className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="support-history-title" className="m-0 text-lg font-bold text-text">پیگیری درخواست‌ها</h2>
              <p className="m-0 mt-1 text-xs text-muted">{tickets.length.toLocaleString('fa-IR')} درخواست ثبت‌شده</p>
            </div>
            <Button type="button" variant="ghost" size="md" onClick={loadTickets} disabled={loading} startIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}>
              بازخوانی
            </Button>
          </div>
          {historyError && <p role="alert" className="mt-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{historyError}</p>}
          {loading ? (
            <p className="mt-3 rounded-xl border border-border bg-surface p-5 text-sm text-muted">در حال دریافت درخواست‌ها…</p>
          ) : tickets.length === 0 && !historyError ? (
            <div className="mt-3 rounded-xl border border-dashed border-border bg-surface p-6 text-center">
              <LifeBuoy className="mx-auto h-6 w-6 text-muted" aria-hidden="true" />
              <p className="m-0 mt-2 text-sm text-muted">هنوز درخواستی ثبت نکرده‌ای.</p>
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-3" role="list">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="rounded-xl border border-border bg-surface p-4 shadow-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ticket.status === 'resolved' || ticket.status === 'closed' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                      {ticketStatus(ticket.status)}
                    </span>
                    <time dateTime={ticket.createdAt} className="text-xs text-muted">{new Date(ticket.createdAt).toLocaleDateString('fa-IR')}</time>
                  </div>
                  <p className="mb-3 mt-3 whitespace-pre-wrap text-sm leading-7 text-text">{ticket.message}</p>
                  {ticket.resolution && <p className="mb-3 rounded-lg bg-bg p-3 text-sm leading-6 text-text"><span className="font-semibold">پاسخ پشتیبانی: </span>{ticket.resolution}</p>}
                  <button type="button" className="inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-muted hover:text-primary" onClick={() => void navigator.clipboard?.writeText(ticket.ticketNumber)} title="کپی کد پیگیری">
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    کد پیگیری: <bdi dir="ltr">{ticket.ticketNumber}</bdi>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default SupportPage;
