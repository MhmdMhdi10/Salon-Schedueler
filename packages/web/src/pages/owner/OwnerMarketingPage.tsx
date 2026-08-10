import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarClock, Check, Copy, ExternalLink, Megaphone, QrCode, Share2, Users } from 'lucide-react';
import { ApiError, qrApi, type SalonQrResponse } from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { SeoHead } from '../../components/seo';
import { Button, Card, ErrorState, Skeleton, useToast } from '../../components/ui';

/** Simple owner marketing surface: share one booking link, then finish setup. */
export function OwnerMarketingPage() {
  const salonId = useSalonId();
  const { success } = useToast();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<SalonQrResponse | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      setData(await qrApi.getSalonQr(salonId));
      setStatus('ready');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'بارگذاری لینک رزرو ناموفق بود.');
      setStatus('error');
    }
  }, [salonId]);

  useEffect(() => {
    void load();
  }, [load]);

  const bookingUrl = useMemo(() => {
    if (!data?.url) return '';
    try {
      return new URL(data.url, window.location.origin).toString();
    } catch {
      return data.url;
    }
  }, [data?.url]);

  const copyLink = async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      success({ title: 'لینک رزرو کپی شد' });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const shareLink = async () => {
    if (!bookingUrl) return;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: data?.salonName ? `رزرو نوبت ${data.salonName}` : 'رزرو نوبت',
          text: 'برای دیدن خدمات و رزرو نوبت از این لینک استفاده کن.',
          url: bookingUrl,
        });
        return;
      }
      await copyLink();
    } catch {
      // Share cancellation is a normal mobile interaction; keep page state intact.
    }
  };

  return (
    <section data-testid="owner-marketing-page" className="flex flex-col gap-5">
      <SeoHead title="بازاریابی" />

      <header className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Megaphone className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-display text-2xl text-text sm:text-3xl">بازاریابی</h1>
          <p className="mt-1 text-sm leading-6 text-muted">یک لینک، یک QR، و مشتری‌هایی که خودشان وقت می‌گیرند.</p>
        </div>
      </header>

      {status === 'loading' && (
        <Card data-testid="owner-marketing-loading" className="flex flex-col gap-4">
          <Skeleton variant="text" className="w-2/5" />
          <Skeleton variant="rect" className="h-16" />
          <Skeleton variant="rect" className="h-11" />
        </Card>
      )}

      {status === 'error' && (
        <ErrorState
          title="لینک رزرو آماده نشد"
          description={error}
          retryLabel="تلاش مجدد"
          onRetry={() => void load()}
        />
      )}

      {status === 'ready' && data && (
        <Card elevated className="overflow-hidden border-primary/25 bg-primary/5">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-primary">لینک رزرو {data.salonName}</p>
                <h2 className="mt-1 text-xl font-black text-text">همین را در بیو بگذار</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
                  مشتری خدمات و وقت‌های خالی را می‌بیند و بدون تماس رزرو می‌کند.
                </p>
              </div>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-contrast">
                <QrCode className="size-5" aria-hidden="true" />
              </span>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
              <span className="break-all text-sm text-text" dir="ltr">{bookingUrl}</span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => void copyLink()}
                  startIcon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  className="flex-1"
                >
                  {copied ? 'کپی شد' : 'کپی لینک'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void shareLink()}
                  startIcon={<Share2 className="size-4" />}
                  className="flex-1"
                >
                  اشتراک‌گذاری
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <a
                href={bookingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary no-underline hover:underline"
              >
                دیدن صفحه رزرو <ExternalLink className="size-4" aria-hidden="true" />
              </a>
              <a href="/owner/qr" className="inline-flex items-center gap-1 font-medium text-muted no-underline hover:text-primary">
                ساخت QR و استند <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
              </a>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <ActionCard
          icon={<Users className="size-5" aria-hidden="true" />}
          title="مشتری‌ها را دعوت کن"
          body="مشتری‌های قدیمی را به دفترچه اضافه کن و لینک رزرو را برایشان بفرست."
          href="/owner/clients"
          cta="رفتن به مشتری‌ها"
        />
        <ActionCard
          icon={<CalendarClock className="size-5" aria-hidden="true" />}
          title="وقت‌های خالی را کامل کن"
          body="خدمت‌ها و ساعت کاری درست، صفحه رزرو را قابل استفاده می‌کند."
          href="/owner/config"
          cta="تکمیل تنظیمات"
        />
        <ActionCard
          icon={<QrCode className="size-5" aria-hidden="true" />}
          title="QR روی آینه"
          body="یک QR برای ویترین، آینه یا رسید چاپ کن تا رزرو همیشه جلوی چشم باشد."
          href="/owner/qr"
          cta="باز کردن QR"
        />
      </div>
    </section>
  );
}

function ActionCard({
  icon,
  title,
  body,
  href,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <Card as="article" className="flex flex-col gap-3">
      <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <h2 className="font-bold text-text">{title}</h2>
      <p className="flex-1 text-sm leading-6 text-muted">{body}</p>
      <a href={href} className="inline-flex min-h-10 items-center gap-1 text-sm font-bold text-primary no-underline hover:underline">
        {cta} <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </a>
    </Card>
  );
}

export default OwnerMarketingPage;
