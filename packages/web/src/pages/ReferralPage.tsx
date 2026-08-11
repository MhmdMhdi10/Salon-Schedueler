import { useCallback, useEffect, useState } from 'react';
import { Copy, Gift, Link2, Share2, Store, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError, referralApi, type SalonReferral } from '../api/client';
import { SeoHead } from '../components/seo';
import { Badge, Button, Card, TextField, useToast } from '../components/ui';

const money = new Intl.NumberFormat('fa-IR');

function rewardText(amountRial: number): string {
  return money.format(Math.round(amountRial / 10)) + ' تومان اعتبار خدماتی';
}

function referralStatus(referral: SalonReferral): {
  label: string;
  status: 'success' | 'warning' | 'danger' | 'neutral';
} {
  if (referral.rewardStatus === 'available') {
    return { label: 'اعتبار آماده استفاده', status: 'success' };
  }
  if (referral.rewardStatus === 'redeemed') {
    return { label: 'اعتبار استفاده شد', status: 'neutral' };
  }
  if (referral.rewardStatus === 'expired') {
    return { label: 'اعتبار منقضی شد', status: 'danger' };
  }
  if (!referral.salonId) {
    return { label: 'منتظر ورود سالن', status: 'warning' };
  }
  return { label: 'در حال تکمیل شرط رزرو', status: 'warning' };
}

export function ReferralPage() {
  const { success, error: showError } = useToast();
  const [salonName, setSalonName] = useState('');
  const [city, setCity] = useState('');
  const [salonPhone, setSalonPhone] = useState('');
  const [salonInstagram, setSalonInstagram] = useState('');
  const [referrals, setReferrals] = useState<SalonReferral[]>([]);
  const [created, setCreated] = useState<SalonReferral | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadReferrals = useCallback(async () => {
    try {
      const result = await referralApi.listMine();
      setReferrals(result.referrals);
    } catch {
      showError({ title: 'دریافت معرفی‌ها انجام نشد', description: 'لطفاً دوباره تلاش کنید.' });
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void loadReferrals();
  }, [loadReferrals]);

  const inviteUrl = created?.claimUrl || '';
  const copyInvite = useCallback(
    async (url: string) => {
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        success({ title: 'لینک دعوت کپی شد' });
      } catch {
        showError({ title: 'کپی لینک انجام نشد', description: 'لینک را دستی انتخاب کنید.' });
      }
    },
    [showError, success],
  );

  const shareInvite = useCallback(
    async (referral: SalonReferral) => {
      const url = referral.claimUrl || '';
      if (!url) return;
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'آرایشگاهت را آنلاین کن',
            text: 'با این لینک آرایشگاهت را به آرا وصل کن.',
            url,
          });
          return;
        } catch {
          return;
        }
      }
      await copyInvite(url);
    },
    [copyInvite],
  );

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = salonName.trim();
    const cleanCity = city.trim();
    const cleanPhone = salonPhone.trim();
    const cleanInstagram = salonInstagram.trim().replace(/^@/, '');

    if (cleanName.length < 2 || cleanCity.length < 2) {
      setFormError('نام سالن و شهر را وارد کنید.');
      return;
    }
    if (!cleanPhone && !cleanInstagram) {
      setFormError('حداقل شماره تماس یا آیدی اینستاگرام سالن لازم است.');
      return;
    }

    setFormError('');
    setSubmitting(true);
    try {
      const result = await referralApi.create({
        salonName: cleanName,
        city: cleanCity,
        ...(cleanPhone ? { salonPhone: cleanPhone } : {}),
        ...(cleanInstagram ? { salonInstagram: cleanInstagram } : {}),
      });
      setCreated(result.referral);
      setReferrals((items) => [result.referral, ...items]);
      setSalonName('');
      setCity('');
      setSalonPhone('');
      setSalonInstagram('');
      success({
        title: 'لینک معرفی ساخته شد',
        description: 'لینک را برای صاحب سالن بفرستید.',
      });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'REFERRAL_EXISTS') {
        setFormError('برای این سالن قبلاً لینک معرفی ساخته شده است.');
      } else {
        setFormError('ساخت لینک انجام نشد. اطلاعات را بررسی کنید.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <SeoHead title="معرفی سالن به آرا" description="آرایشگاه مورد علاقه‌ات را آنلاین کن و اعتبار خدماتی بگیر." />
      <div className="mb-8">
        <Badge status="success" icon={<Gift className="h-3.5 w-3.5" />}>باشگاه معرفی آرا</Badge>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-fg sm:text-4xl">آرایشگرت را آنلاین کن</h1>
        <p className="mt-3 max-w-2xl text-base leading-8 text-muted">
          سالن مورد علاقه‌ات را معرفی کن. اگر صاحب سالن ثبت‌نام کند و سه رزرو تکمیل‌شده داشته باشد،
          اعتبار خدماتی یک‌باره برایت فعال می‌شود.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <Card as="section" aria-labelledby="referral-form-title">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-3 text-primary"><Store className="h-6 w-6" /></div>
            <div>
              <h2 id="referral-form-title" className="text-lg font-semibold text-fg">ساخت لینک معرفی</h2>
              <p className="mt-1 text-sm leading-6 text-muted">اطلاعاتی وارد کنید که صاحب سالن با آن خودش را پیدا کند.</p>
            </div>
          </div>
          <form className="space-y-4" onSubmit={submit} noValidate>
            <TextField label="نام سالن" value={salonName} onChange={(event) => setSalonName(event.target.value)} placeholder="مثلاً سالن ماهور" required />
            <TextField label="شهر" value={city} onChange={(event) => setCity(event.target.value)} placeholder="مثلاً تهران" required />
            <TextField
              label="شماره تماس سالن"
              value={salonPhone}
              onChange={(event) => setSalonPhone(event.target.value)}
              placeholder="اختیاری"
              dir="ltr"
              inputMode="tel"
            />
            <TextField
              label="آیدی اینستاگرام سالن"
              value={salonInstagram}
              onChange={(event) => setSalonInstagram(event.target.value)}
              placeholder="مثلاً salon.example"
              dir="ltr"
            />
            {formError ? <p className="text-sm text-danger" role="alert">{formError}</p> : null}
            <Button type="submit" loading={submitting} className="w-full sm:w-auto">
              <Link2 className="h-4 w-4" />
              ساخت لینک دعوت
            </Button>
          </form>
        </Card>

        <Card as="section" aria-labelledby="reward-title" className="border-primary/20 bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3 text-primary"><Gift className="h-6 w-6" /></div>
            <div>
              <h2 id="reward-title" className="text-lg font-semibold text-fg">پاداش چطور فعال می‌شود؟</h2>
              <p className="mt-1 text-sm text-muted">قانون ساده و قابل پیگیری</p>
            </div>
          </div>
          <ol className="mt-6 space-y-5 text-sm leading-7 text-fg">
            <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">۱</span><span>لینک اختصاصی را برای صاحب سالن بفرستید.</span></li>
            <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">۲</span><span>سالن با همان لینک ثبت‌نام و فعال می‌شود.</span></li>
            <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">۳</span><span>بعد از سه رزرو تکمیل‌شده، اعتبار برایت آماده می‌شود.</span></li>
          </ol>
          <p className="mt-6 rounded-lg border border-border bg-surface/70 p-3 text-xs leading-6 text-muted">
            اعتبار فقط یک‌بار، در همان سالن و تا ۳۰ روز بعد از فعال‌شدن قابل استفاده است.
          </p>
        </Card>
      </div>

      {created && inviteUrl ? (
        <Card as="section" aria-labelledby="created-link-title" className="mt-5 border-success/30">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="created-link-title" className="text-lg font-semibold text-fg">لینک آماده ارسال است</h2>
              <p className="mt-1 text-sm text-muted">{created.salonName} · {created.city}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void copyInvite(inviteUrl)}><Copy className="h-4 w-4" /> کپی لینک</Button>
              <Button onClick={() => void shareInvite(created)}><Share2 className="h-4 w-4" /> اشتراک‌گذاری</Button>
            </div>
          </div>
          <p className="mt-4 break-all rounded-lg bg-surface p-3 text-left text-sm text-muted" dir="ltr">{inviteUrl}</p>
        </Card>
      ) : null}

      <Card as="section" aria-labelledby="referrals-title" className="mt-5">
        <div className="flex items-center gap-3">
          <UsersRound className="h-5 w-5 text-primary" />
          <div>
            <h2 id="referrals-title" className="text-lg font-semibold text-fg">معرفی‌های من</h2>
            <p className="mt-1 text-sm text-muted">وضعیت ورود سالن و پیشرفت پاداش را ببینید.</p>
          </div>
        </div>
        {loading ? (
          <p className="mt-6 text-sm text-muted">در حال بارگذاری…</p>
        ) : referrals.length === 0 ? (
          <p className="mt-6 rounded-lg bg-surface p-4 text-sm leading-7 text-muted">هنوز معرفی‌ای ثبت نکرده‌اید. اولین لینک را بسازید.</p>
        ) : (
          <div className="mt-5 space-y-3">
            {referrals.map((referral) => {
              const meta = referralStatus(referral);
              const progress = Math.min(100, Math.round((referral.qualifyingBookings / referral.requiredBookings) * 100));
              return (
                <div key={referral.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-fg">{referral.salonName}</p>
                      <p className="mt-1 text-sm text-muted">{referral.city || 'شهر ثبت نشده'} · {rewardText(referral.rewardAmountRial)}</p>
                    </div>
                    <Badge status={meta.status}>{meta.label}</Badge>
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 flex justify-between text-xs text-muted">
                      <span>رزروهای تکمیل‌شده</span>
                      <span>{referral.qualifyingBookings} از {referral.requiredBookings}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={referral.requiredBookings} aria-valuenow={referral.qualifyingBookings}>
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: progress + '%' }} />
                    </div>
                  </div>
                  {referral.claimUrl ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="md" variant="ghost" onClick={() => void copyInvite(referral.claimUrl || '')}><Copy className="h-4 w-4" /> کپی لینک</Button>
                      <Button size="md" variant="ghost" onClick={() => void shareInvite(referral)}><Share2 className="h-4 w-4" /> ارسال دوباره</Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <p className="mt-5 text-center text-sm text-muted">
        سالن صاحب شماست؟ <Link className="text-primary underline underline-offset-4" to="/business/register">ثبت‌نام سالن</Link>
      </p>
    </div>
  );
}
