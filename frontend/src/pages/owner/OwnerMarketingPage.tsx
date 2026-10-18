import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
  QrCode,
  Share2,
  Users,
} from 'lucide-react';
import { ApiError, qrApi, type SalonQrResponse } from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { useHashScroll } from '../../hooks/useHashScroll';
import { SeoHead } from '../../components/seo';
import { Button, Card, ErrorState, Select, Skeleton, useToast } from '../../components/ui';
import { copyToClipboard } from '../../utils/copyToClipboard';
import { qrImageDataUri } from './marketing-assets';

const OwnerQrStudio = lazy(() => import('./QrPage').then((module) => ({ default: module.OwnerQrPage })));

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
  useHashScroll();
  const location = useLocation();
  const salonId = useSalonId();
  const { success, error: showError } = useToast();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<SalonQrResponse | null>(null);
  const [error, setError] = useState('');
  const [copiedAction, setCopiedAction] = useState<'booking' | 'campaign' | 'message' | null>(null);
  const [selectedSource, setSelectedSource] = useState<CampaignSource>('instagram_bio');
  const [qrOpen, setQrOpen] = useState(() => location.hash.startsWith('#qr'));

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
    () => data?.payload ? qrImageDataUri(data.payload, `کد QR رزرو ${data.salonName}`) : '',
    [data?.payload, data?.salonName],
  );

  useEffect(() => {
    if (location.hash.startsWith('#qr')) setQrOpen(true);
  }, [location.hash]);

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

  const copyText = async (value: string, title: string, action: 'booking' | 'campaign' | 'message') => {
    if (!value) return;
    setCopiedAction(null);
    const copiedSuccessfully = await copyToClipboard(value);
    if (copiedSuccessfully) {
      setCopiedAction(action);
      success({ title });
      window.setTimeout(() => setCopiedAction((current) => current === action ? null : current), 1800);
    } else {
      showError({ title: 'کپی انجام نشد؛ متن را انتخاب و کپی کن.' });
    }
  };

  const copyLink = async () => copyText(bookingUrl, 'لینک رزرو کپی شد', 'booking');
  const copyCampaignLink = async () => copyText(campaignUrl, 'لینک کمپین کپی شد', 'campaign');
  const copyCampaignMessage = async () => copyText(campaignMessage, 'متن آماده کپی شد', 'message');

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

      <header className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Megaphone className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-display text-2xl text-text sm:text-3xl">بازاریابی</h1>
          <p className="mt-1 text-sm leading-6 text-muted">لینک رزرو، QR سالن و ابزارهای انتشار را یک‌جا مدیریت کن.</p>
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
        <Card
          elevated
          className="overflow-hidden border-primary/25 bg-primary/5"
        >
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-primary">لینک رزرو</p>
                <h2 className="mt-1 text-xl font-black text-text">رزرو آنلاین {data.salonName}</h2>
                <p className="mt-1 text-sm leading-6 text-muted">مشتری‌ها خدمات را می‌بینند و مستقیم وقت می‌گیرند.</p>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface p-3">
              <span className="block break-all text-sm text-text" dir="ltr" title={bookingUrl}>{bookingUrl}</span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void copyLink()}
                  startIcon={copiedAction === 'booking' ? <Check className="size-4" /> : <Copy className="size-4" />}
                  className="min-w-0 basis-32 flex-1"
                >
                  {copiedAction === 'booking' ? 'کپی شد' : 'کپی لینک'}
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
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 flex-1 basis-40 items-center justify-center gap-1 rounded-lg border border-border px-3 text-sm font-medium text-primary no-underline hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  پیش‌نمایش صفحه رزرو <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </Card>
      )}

      {status === 'ready' && data && (
        <details
          id="qr-studio"
          open={qrOpen}
          onToggle={(event) => setQrOpen(event.currentTarget.open)}
          className="group overflow-hidden rounded-2xl border border-border bg-surface shadow-1"
        >
          <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <QrCode className="size-5" aria-hidden="true" />
            </span>
            <img
              data-testid="owner-marketing-qr"
              src={bookingQrUri}
              alt={`کد QR رزرو ${data.salonName}`}
              className="size-12 shrink-0 rounded-lg border border-border bg-white p-0.5"
            />
            <span className="min-w-0 flex-1">
              <strong className="block text-sm text-text">کد QR و ابزارهای چاپ</strong>
              <span className="mt-0.5 block text-xs leading-5 text-muted">قالب، رنگ، دانلود و سفارش کارت را اینجا مدیریت کن.</span>
            </span>
            <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="border-t border-border p-3 sm:p-4">
            <Suspense fallback={<Skeleton variant="rect" className="h-72 rounded-xl" />}>
              <OwnerQrStudio embedded initialData={data} />
            </Suspense>
          </div>
        </details>
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
                startIcon={copiedAction === 'campaign' ? <Check className="size-4" /> : <Copy className="size-4" />}
                className="min-w-0 basis-32 flex-1"
              >
                {copiedAction === 'campaign' ? 'کپی شد' : 'کپی لینک'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void copyCampaignMessage()}
                startIcon={copiedAction === 'message' ? <Check className="size-4" /> : <MessageCircle className="size-4" />}
                className="min-w-0 basis-32 flex-1"
              >
                {copiedAction === 'message' ? 'کپی شد' : 'کپی متن'}
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
