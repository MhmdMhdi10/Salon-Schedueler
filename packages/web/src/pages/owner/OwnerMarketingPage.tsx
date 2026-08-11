import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Megaphone,
  MessageCircle,
  QrCode,
  Share2,
  Users,
} from 'lucide-react';
import { ApiError, qrApi, referralApi, type SalonQrResponse, type SalonReferral } from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { SeoHead } from '../../components/seo';
import { Badge, Button, Card, ErrorState, Skeleton, useToast } from '../../components/ui';

type CampaignSource = 'instagram_bio' | 'instagram_story' | 'whatsapp' | 'qr' | 'google';

const CAMPAIGN_SOURCES: Array<{ value: CampaignSource; label: string; hint: string }> = [
  { value: 'instagram_bio', label: 'بیو اینستاگرام', hint: 'لینک ثابت پروفایل' },
  { value: 'instagram_story', label: 'استوری اینستاگرام', hint: 'لینک کوتاه‌مدت' },
  { value: 'whatsapp', label: 'واتساپ', hint: 'دایرکت و لیست پخش' },
  { value: 'qr', label: 'QR سالن', hint: 'آینه، میز و کارت' },
  { value: 'google', label: 'گوگل/پروفایل', hint: 'جست‌وجوی محلی' },
];

function referralStatusMeta(referral: SalonReferral): {
  label: string;
  status: 'success' | 'warning' | 'danger' | 'neutral';
} {
  if (referral.rewardStatus === 'available') {
    return { label: 'اعتبار آماده استفاده', status: 'success' };
  }
  if (referral.rewardStatus === 'redeemed') {
    return { label: 'اعتبار ثبت شد', status: 'neutral' };
  }
  if (referral.rewardStatus === 'expired') {
    return { label: 'اعتبار منقضی شد', status: 'danger' };
  }
  return {
    label: referral.salonId ? 'در حال تکمیل شرط سه رزرو' : 'منتظر ورود سالن',
    status: 'warning',
  };
}

/** Owner activation surface: share, measure, and repeat the booking campaign. */
export function OwnerMarketingPage() {
  const salonId = useSalonId();
  const { success, error: showError } = useToast();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<SalonQrResponse | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedSource, setSelectedSource] = useState<CampaignSource>('instagram_bio');
  const [referrals, setReferrals] = useState<SalonReferral[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(true);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

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
  const loadReferrals = useCallback(async () => {
    setReferralsLoading(true);
    try {
      const result = await referralApi.listSalon(salonId);
      setReferrals(result.referrals);
    } catch (reason) {
      showError({
        title: reason instanceof ApiError ? reason.message : 'دریافت معرفی‌ها انجام نشد.',
      });
    } finally {
      setReferralsLoading(false);
    }
  }, [salonId, showError]);

  useEffect(() => {
    void loadReferrals();
  }, [loadReferrals]);

  const redeemReferral = async (referralId: string) => {
    setRedeemingId(referralId);
    try {
      const result = await referralApi.redeem(referralId);
      setReferrals((items) =>
        items.map((item) => (item.id === referralId ? result.referral : item)),
      );
      success({ title: 'مصرف اعتبار ثبت شد' });
    } catch (reason) {
      showError({
        title: reason instanceof ApiError ? reason.message : 'ثبت مصرف اعتبار انجام نشد.',
      });
    } finally {
      setRedeemingId(null);
    }
  };


  const bookingUrl = useMemo(() => {
    if (!data?.url) return '';
    try {
      return new URL(data.url, window.location.origin).toString();
    } catch {
      return data.url;
    }
  }, [data?.url]);

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

      {status === 'ready' && data && (
        <Card data-testid="owner-campaign-kit" className="flex flex-col gap-5 border-primary/20 bg-surface">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Link2 className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-text">لینک‌های قابل‌اندازه‌گیری</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                برای هر کانال لینک جدا بساز؛ بعد در آنالیتیکس می‌بینی کدام کانال واقعاً اسکن و رزرو می‌سازد.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="انتخاب کانال کمپین">
            {CAMPAIGN_SOURCES.map((source) => (
              <button
                key={source.value}
                type="button"
                aria-pressed={selectedSource === source.value}
                onClick={() => setSelectedSource(source.value)}
                className={`min-h-10 rounded-md border px-3 py-2 text-sm transition-colors ${
                  selectedSource === source.value
                    ? 'border-primary bg-primary text-primary-contrast'
                    : 'border-border bg-surface text-text hover:bg-elevated'
                }`}
              >
                <span className="font-bold">{source.label}</span>
                <span className="mr-1 text-xs opacity-75">{source.hint}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-border bg-elevated/40 p-3">
            <span className="text-xs font-bold text-muted">لینک {CAMPAIGN_SOURCES.find((item) => item.value === selectedSource)?.label}</span>
            <span className="break-all text-sm text-text" dir="ltr">{campaignUrl}</span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={() => void copyCampaignLink()} startIcon={<Copy className="size-4" />} className="flex-1">
                کپی لینک کمپین
              </Button>
              <Button type="button" variant="secondary" onClick={() => void copyCampaignMessage()} startIcon={<MessageCircle className="size-4" />} className="flex-1">
                کپی متن واتساپ
              </Button>
            </div>
          </div>

          <p className="whitespace-pre-line rounded-lg border border-border bg-surface p-3 text-sm leading-7 text-muted">
            {campaignMessage}
          </p>
        </Card>
      )}

      <Card as="section" data-testid="owner-referrals" className="border-success/20">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
            <Users className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-bold text-text">معرفی‌های مشتریان</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              سالن‌هایی که با معرفی مشتری وارد شده‌اند و اعتبار قابل مصرف آن‌ها.
            </p>
          </div>
        </div>

        {referralsLoading ? (
          <div className="mt-5 flex flex-col gap-3">
            <Skeleton variant="rect" className="h-16" />
            <Skeleton variant="rect" className="h-16" />
          </div>
        ) : referrals.length === 0 ? (
          <p className="mt-5 rounded-lg bg-surface p-4 text-sm leading-7 text-muted">
            هنوز معرفی‌ای برای این سالن ثبت نشده است.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {referrals.map((referral) => {
              const meta = referralStatusMeta(referral);
              const maxBookings = Math.max(1, referral.requiredBookings);
              const progress = Math.min(100, Math.round((referral.qualifyingBookings / maxBookings) * 100));
              return (
                <div key={referral.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-text">{referral.referrerName || referral.referrerPhone || 'مشتری آرا'}</p>
                      <p className="mt-1 text-sm text-muted">
                        معرفی سالن {referral.salonName} · {referral.qualifyingBookings} از {referral.requiredBookings} رزرو تکمیل‌شده
                      </p>
                    </div>
                    <Badge status={meta.status}>{meta.label}</Badge>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={referral.requiredBookings} aria-valuenow={referral.qualifyingBookings}>
                    <div className="h-full rounded-full bg-success transition-all" style={{ width: progress + '%' }} />
                  </div>
                  {referral.rewardStatus === 'available' ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-success/10 p-3">
                      <span className="text-sm font-medium text-success">اعتبار خدماتی مشتری آماده استفاده است.</span>
                      <Button
                        type="button"
                        size="md"
                        loading={redeemingId === referral.id}
                        onClick={() => void redeemReferral(referral.id)}
                      >
                        ثبت مصرف اعتبار
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

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
