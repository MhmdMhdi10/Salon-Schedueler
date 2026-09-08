import { useEffect, useMemo, useState } from 'react';
import { Copy, LifeBuoy, Paperclip, RefreshCw, Send } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { supportApi, type SupportTicket } from '../api/client';
import { SeoHead } from '../components/seo';
import { Button, Card, ErrorState, Textarea, useToast } from '../components/ui';

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
  const [sentTicket, setSentTicket] = useState<SupportTicket | null>(null);

  const loadTickets = () => {
    setLoading(true);
    supportApi
      .listMine()
      .then((result) => setTickets(result.tickets))
      .catch(() => setError('دریافت درخواست‌های پشتیبانی انجام نشد.'))
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-6 sm:px-6 sm:py-10">
      <SeoHead title="پشتیبانی آرا" />
      <header>
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <LifeBuoy className="h-4 w-4" aria-hidden="true" /> پشتیبانی آرا
        </p>
        <h1 className="mt-2 text-2xl font-bold text-text">مشکل را سریع گزارش کن</h1>
        <p className="mt-2 text-sm leading-7 text-muted">
          متن خطا، صفحه و اقدام انجام‌شده همراه درخواست ثبت می‌شود تا تیم پشتیبانی بتواند آن را پیدا و پیگیری کند.
        </p>
      </header>

      <Card as="section" className="p-4 sm:p-6">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <Textarea
            label="شرح مشکل"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setError('');
            }}
            placeholder="چه کاری انجام دادی و چه اتفاقی افتاد؟"
            rows={6}
            maxLength={4000}
            required
            helperText={`${message.length.toLocaleString('fa-IR')} / ۴۰۰۰`}
          />
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-sm text-text">
            <Paperclip className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>{screenshot ? screenshot.name : 'تصویر خطا (اختیاری)'}</span>
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
                setScreenshot(file);
                setError('');
              }}
            />
          </label>
          {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
          {sentTicket && (
            <p role="status" className="m-0 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
              کد پیگیری شما: <bdi dir="ltr">{sentTicket.ticketNumber}</bdi>
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            loading={submitting}
            disabled={submitting || message.trim().length < 5}
            startIcon={<Send className="h-4 w-4" aria-hidden="true" />}
          >
            ثبت درخواست پشتیبانی
          </Button>
        </form>
      </Card>

      <section aria-labelledby="support-history-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="support-history-title" className="text-lg font-bold text-text">درخواست‌های قبلی</h2>
          <Button type="button" variant="ghost" size="md" onClick={loadTickets} startIcon={<RefreshCw className="h-4 w-4" />}>
            بازخوانی
          </Button>
        </div>
        {loading ? (
          <p className="mt-3 rounded-lg border border-border bg-surface p-4 text-sm text-muted">در حال دریافت…</p>
        ) : tickets.length === 0 ? (
          <p className="mt-3 rounded-lg border border-border bg-surface p-4 text-sm text-muted">هنوز درخواستی ثبت نکرده‌ای.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2" role="list">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-1 font-bold text-primary"
                    onClick={() => void navigator.clipboard?.writeText(ticket.ticketNumber)}
                    title="کپی کد پیگیری"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <bdi dir="ltr">{ticket.ticketNumber}</bdi>
                  </button>
                  <span>{ticketStatus(ticket.status)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-text">{ticket.message}</p>
                {ticket.resolution && <p className="mt-2 rounded-md bg-bg p-2 text-xs leading-6 text-muted">پاسخ: {ticket.resolution}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default SupportPage;
