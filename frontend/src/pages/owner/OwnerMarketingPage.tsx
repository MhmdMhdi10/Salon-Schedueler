import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Link2,
  Megaphone,
  MessageCircle,
  Share2,
  Users,
} from 'lucide-react';
import { ApiError, qrApi, type SalonQrResponse } from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { SeoHead } from '../../components/seo';
import { Button, Card, ErrorState, Select, Skeleton, useToast } from '../../components/ui';
import { qrImageDataUri } from './marketing-assets';

type CampaignSource = 'instagram_bio' | 'instagram_story' | 'whatsapp' | 'qr' | 'google';

const CAMPAIGN_SOURCES: Array<{ value: CampaignSource; label: string; hint: string }> = [
  { value: 'instagram_bio', label: 'بیو اینستاگرام', hint: 'لینک ثابت پروفایل' },
  { value: 'instagram_story', label: 'استوری اینستاگرام', hint: 'لینک کوتاه‌مدت' },
  { value: 'whatsapp', label: 'واتساپ', hint: 'دایرکت و لیست پخش' },
  { value: 'qr', label: 'QR سالن', hint: 'آینه، میز و کارت' },
  { value: 'google', label: 'گوگل/پروفایل', hint: 'جست‌وجوی محلی' },
];

/** Owner activation surface: share, measure, and repeat the booking campaign. */
export function OwnerMarketingPage() {
  const salonId = useSalonId();
  const { success, error: showError } = useToast();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<SalonQrResponse | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedSource, setSelectedSource] = useState<CampaignSource>('instagram_bio');

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

  const bookingQrUri = useMemo(
    () =>
      data?.payload
        ? qrImageDataUri(data.payload, `کد QR رزرو ${data.salonName}`)
        : '',
    [data?.payload, data?.salonName],
  );

  const campaignUrl = useMemo(() => {
    if (!bookingUrl) return '';
    try {
      const url = new URL(bookingUrl);
      url.searchParams.set('utm_source', selectedSource);
      return url.toString();
    } catch {
      return bookingUrl;
    }
  }, [bookingUrl, selectedSource]);

  const campaignMessage = useMemo(
    () =>
      `برای دیدن خدمات و رزرو نوبت ${data?.salonName ?? 'سالن'} از این لینک استفاده کن:\n${campaignUrl}`,
    [campaignUrl, data?.salonName],
  );
  const activeSource =
    CAMPAIGN_SOURCES.find((source) => source.value === selectedSource) ?? CAMPAIGN_SOURCES[0];

  const copyText = async (value: string, title: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      success({ title });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const copyLink = async () => copyText(bookingUrl, 'لینک رزرو کپی شد');
  const copyCampaignLink = async () => copyText(campaignUrl, 'لینک کمپین کپی شد');
  const copyCampaignMessage = async () => copyText(campaignMessage, 'متن آماده کپی شد');

  const shareLink = async () => {
    if (!bookingUrl) return;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: data?.salonName ? `رزرو نوبت ${data.salonName}` : 'رزرو نوبت',
          text: 'برای دیدن خدمات و رزرو نوبت از این لینک استفاده کن.',
          url: campaignUrl,
        });
        return;
      }
      await copyLink();
    } catch {
      // Share cancellation is a normal mobile interaction; keep page state intact.
    }
  };

  return (
    <section
      data-testid="owner-marketing-page"
      className="flex flex-col gap-4"
    >
      <SeoHead title="بازاریابی" />

      {status !== 'ready' && (
        <header className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Megaphone className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-display text-2xl text-text sm:text-3xl">بازاریابی</h1>
            <p className="mt-1 text-sm leading-6 text-muted">لینک رزرو را با مشتری‌ها به اشتراک بگذار.</p>
          </div>
        </header>
      )}

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
        <Card
          elevated
          className="overflow-hidden border-primary/25 bg-primary/5"
        >
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center">
            <aside className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-primary/20 bg-surface p-3">
              <img
                data-testid="owner-marketing-qr"
                src={bookingQrUri}
                alt={`کد QR رزرو ${data.salonName}`}
                className="size-56 shrink-0 rounded-lg bg-white p-2 sm:size-64"
              />
              <p className="text-sm font-bold text-text">اسکن برای رزرو سریع</p>
              <a href="/owner/qr" className="inline-flex min-h-10 items-center gap-1 font-bold text-primary no-underline hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">
                تنظیم و دانلود QR <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
              </a>
            </aside>
            <div className="flex min-w-0 flex-col gap-3">
              <header className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Megaphone className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h1 className="text-display text-2xl text-text sm:text-3xl">بازاریابی</h1>
                  <p className="mt-1 text-sm leading-6 text-muted">لینک رزرو را با مشتری‌ها به اشتراک بگذار.</p>
                </div>
              </header>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-primary">لینک رزرو</p>
                  <h2 className="mt-1 text-xl font-black text-text">رزرو آنلاین سالن</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">مشتری‌ها از این لینک خدمات را می‌بینند و وقت می‌گیرند.</p>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3">
                <span className="block truncate text-sm text-text" dir="ltr" title={bookingUrl}>{bookingUrl}</span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => void copyLink()}
                    startIcon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    className="min-w-0 basis-32 flex-1"
                  >
                    {copied ? 'کپی شد' : 'کپی لینک'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void shareLink()}
                    startIcon={<Share2 className="size-4" />}
                    className="min-w-0 basis-32 flex-1"
                  >
                    اشتراک
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center gap-1 rounded-md px-1 font-medium text-primary no-underline hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  پیش‌نمایش صفحه رزرو <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </Card>
      )}

      {status === 'ready' && data && (
        <Card
          data-testid="owner-campaign-kit"
          className="flex flex-col gap-4 border-primary/20 bg-surface"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Link2 className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-text">لینک کمپین</h2>
              <p className="mt-1 text-sm leading-6 text-muted">کانال انتشار را انتخاب کن تا لینک مخصوص همان کانال ساخته شود.</p>
            </div>
          </div>

          <Select
            label="کانال انتشار"
            value={selectedSource}
            onValueChange={(value) => setSelectedSource(value as CampaignSource)}
            options={CAMPAIGN_SOURCES.map(({ value, label }) => ({ value, label }))}
            helperText={activeSource.hint}
          />

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-elevated p-3 shadow-1">
            <span className="text-xs font-bold text-muted">{activeSource.label}</span>
            <span className="block truncate text-sm text-text" dir="ltr" title={campaignUrl}>{campaignUrl}</span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void copyCampaignLink()}
                startIcon={<Copy className="size-4" />}
                className="min-w-0 basis-32 flex-1"
              >
                کپی لینک
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void copyCampaignMessage()}
                startIcon={<MessageCircle className="size-4" />}
                className="min-w-0 basis-32 flex-1"
              >
                کپی متن
              </Button>
            </div>
          </div>

          <details className="group rounded-lg border border-border bg-surface">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-bold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
              پیش‌نمایش پیام آماده
              <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <p className="whitespace-pre-line break-words border-t border-border px-3 py-2 text-sm leading-6 text-muted" dir="auto">
              {campaignMessage}
            </p>
          </details>
        </Card>
      )}

      <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
        <h2 className="mb-2 text-sm font-bold text-text">برای شروع</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <ActionLink
            icon={<Users className="size-4" aria-hidden="true" />}
            title="دعوت از مشتری‌ها"
            href="/owner/clients"
          />
          <ActionLink
            icon={<CalendarClock className="size-4" aria-hidden="true" />}
            title="تنظیم خدمات و ساعت کاری"
            href="/owner/config"
          />
        </div>
      </div>
    </section>
  );
}

function ActionLink({
  icon,
  title,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border bg-elevated px-3 py-2 text-sm font-medium text-text no-underline transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <span>{title}</span>
      </span>
      <ArrowLeft className="size-4 shrink-0 text-muted rtl:-scale-x-100" aria-hidden="true" />
    </a>
  );
}

export default OwnerMarketingPage;
