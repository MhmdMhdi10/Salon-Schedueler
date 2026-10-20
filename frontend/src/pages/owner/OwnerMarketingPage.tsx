import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Link2,
  Megaphone,
  MessageCircle,
  QrCode,
  Share2,
} from 'lucide-react';
import { ApiError, qrApi, type SalonQrResponse } from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { useHashScroll } from '../../hooks/useHashScroll';
import { SeoHead } from '../../components/seo';
import {
  Button,
  Card,
  ErrorState,
  Select,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  useToast,
} from '../../components/ui';
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
  const [campaignOpen, setCampaignOpen] = useState(false);

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
      const url = new URL(data.url, window.location.origin);
      if (url.searchParams.get('utm_source') === 'qr') url.searchParams.delete('utm_source');
      return url.toString();
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
    <section
      data-testid="owner-marketing-page"
      className="owner-marketing-page flex flex-col gap-4"
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
        <>
          <Card elevated className="flex flex-col gap-4 border-primary/25 bg-primary/5 p-4 sm:p-5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-primary">آماده برای اشتراک</p>
                <h2 className="mt-1 text-lg font-black text-text">صفحه رزرو {data.salonName}</h2>
                <p className="mt-1 text-sm leading-6 text-muted">این لینک را در بیو، پیام یا سایتت بگذار تا مشتری خودش نوبت بگیرد.</p>
              </div>
              <img
                data-testid="owner-marketing-featured-qr"
                src={bookingQrUri}
                alt={`کد QR رزرو ${data.salonName}`}
                width={72}
                height={72}
                className="size-16 shrink-0 rounded-xl border border-border bg-white p-1 shadow-1"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={() => void copyLink()}
                startIcon={copiedAction === 'booking' ? <Check className="size-4" /> : <Copy className="size-4" />}
              >
                {copiedAction === 'booking' ? 'کپی شد' : 'کپی لینک رزرو'}
              </Button>
              <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => void shareLink()} startIcon={<Share2 className="size-4" />}>
                اشتراک‌گذاری
              </Button>
              <a
                href={bookingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-lg border border-border px-3 text-sm font-medium text-primary no-underline hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus sm:w-auto"
              >
                مشاهده صفحه <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            </div>
          </Card>

          <div>
            <h2 className="text-base font-bold text-text">چطور رزرو بگیرم؟</h2>
            <p className="mt-1 text-sm text-muted">بسته به جایی که مشتری‌هایت هستند، یکی از این راه‌ها را انتخاب کن.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Sheet open={qrOpen} onOpenChange={setQrOpen}>
              <Card className="flex flex-col gap-3 p-4">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><QrCode className="size-5" aria-hidden="true" /></span>
                <div>
                  <h3 className="font-bold text-text">مشتری داخل سالن</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">کد QR را روی میز، آینه یا کارت بگذار تا نوبت بعدی را اسکن کند.</p>
                </div>
                <SheetTrigger asChild>
                  <Button type="button" variant="secondary" startIcon={<QrCode className="size-4" />}>
                    کد QR و ابزار چاپ
                  </Button>
                </SheetTrigger>
              </Card>
              <SheetContent
                side="inline-end"
                data-qr-print-sheet
                className="!p-4 md:!w-[min(54rem,100vw)]"
              >
                <SheetTitle className="pe-10">کد QR و ابزار چاپ</SheetTitle>
                <SheetDescription>طرح، رنگ و خروجی چاپ را از این پنل مدیریت کن.</SheetDescription>
                <div className="mt-4">
                  {qrOpen && (
                    <Suspense fallback={<Skeleton variant="rect" className="h-72 rounded-xl" />}>
                      <OwnerQrStudio embedded initialData={data} />
                    </Suspense>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            <Sheet open={campaignOpen} onOpenChange={setCampaignOpen}>
              <Card className="flex flex-col gap-3 p-4">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Link2 className="size-5" aria-hidden="true" /></span>
                <div>
                  <h3 className="font-bold text-text">مشتری در شبکه‌های اجتماعی</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">برای اینستاگرام، واتساپ یا گوگل لینک مخصوص همان کانال را بردار.</p>
                </div>
                <SheetTrigger asChild>
                  <Button type="button" variant="secondary" startIcon={<Link2 className="size-4" />}>
                    ساخت لینک کمپین
                  </Button>
                </SheetTrigger>
              </Card>
              <SheetContent side="inline-end" className="md:!w-[min(34rem,100vw)]">
                <SheetTitle className="pe-10">لینک کمپین</SheetTitle>
                <SheetDescription>برای هر کانال یک لینک مشخص بساز تا هنگام انتشار، منبع آن معلوم باشد.</SheetDescription>

                <Card data-testid="owner-campaign-kit" className="mt-4 flex flex-col gap-4 border-primary/20 bg-surface">
                  <Select
                    label="کانال انتشار"
                    value={selectedSource}
                    onValueChange={(value) => setSelectedSource(value as CampaignSource)}
                    options={CAMPAIGN_SOURCES.map(({ value, label }) => ({ value, label }))}
                    helperText={activeSource.hint}
                  />

                  <div className="flex flex-col gap-2 rounded-xl border border-border bg-elevated p-3 shadow-1">
                    <span className="text-xs font-bold text-muted">{activeSource.label}</span>
                    <span className="block break-all text-sm text-text" dir="ltr" title={campaignUrl}>{campaignUrl}</span>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        onClick={() => void copyCampaignLink()}
                        startIcon={copiedAction === 'campaign' ? <Check className="size-4" /> : <Copy className="size-4" />}
                      >
                        {copiedAction === 'campaign' ? 'کپی شد' : 'کپی لینک'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void copyCampaignMessage()}
                        startIcon={copiedAction === 'message' ? <Check className="size-4" /> : <MessageCircle className="size-4" />}
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
              </SheetContent>
            </Sheet>
          </div>
        </>
      )}
    </section>
  );
}

export default OwnerMarketingPage;
