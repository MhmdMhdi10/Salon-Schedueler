import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clipboard, ImagePlus, Landmark, Loader2, UploadCloud } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { customerApi, type DepositOverview } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { SeoHead } from '../components/seo';
import { Button, Card, Money, cn } from '../components/ui';

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function formatCardNumber(value: string): string {
  return value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('READ_FAILED')));
    reader.onerror = () => reject(new Error('READ_FAILED'));
    reader.readAsDataURL(file);
  });
}

function depositStatusLabel(status: string | null): string {
  if (status === 'pending') return 'در انتظار بررسی سالن';
  if (status === 'approved') return 'تأیید شده';
  if (status === 'rejected') return 'رد شده؛ رسید جدید ارسال کن';
  if (status === 'expired') return 'مهلت رزرو تمام شده';
  return 'رسید ارسال نشده';
}

export function DepositReceiptPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const { status: authStatus, isCustomer } = useAuth();
  const [deposit, setDeposit] = useState<DepositOverview | null>(null);
  const [file, setFile] = useState<{ name: string; type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } | null>(null);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!appointmentId || !isCustomer) return;
    let active = true;
    setLoadStatus('loading');
    customerApi
      .getDeposit(appointmentId)
      .then((response) => {
        if (!active) return;
        setDeposit(response.deposit);
        setLoadStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setLoadStatus('error');
        setError('اطلاعات بیعانه بارگذاری نشد. ممکن است نوبت منقضی یا لغو شده باشد.');
      });
    return () => {
      active = false;
    };
  }, [appointmentId, isCustomer]);

  const isManual = deposit?.method === 'card_transfer';
  const isWaiting = deposit?.receiptStatus === 'pending';
  const isApproved = deposit?.receiptStatus === 'approved' || deposit?.appointmentStatus === 'confirmed';
  const isExpired = deposit?.appointmentStatus !== 'held' && !isApproved;
  const cardNumber = deposit?.cardNumber ?? '';
  const canUpload = Boolean(isManual && !isExpired && !isApproved && !isWaiting);
  const statusText = useMemo(() => depositStatusLabel(deposit?.receiptStatus ?? null), [deposit?.receiptStatus]);

  if (authStatus === 'loading') {
    return <div className="flex min-h-screen items-center justify-center bg-bg text-muted"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!isCustomer) {
    return <div className="flex min-h-screen items-center justify-center bg-bg p-4"><Card className="max-w-md text-center"><p className="text-sm text-muted">برای ارسال رسید، ابتدا وارد حساب مشتری شو.</p><Button className="mt-4" onClick={() => navigate('/auth', { state: { returnTo: `/booking/deposit/${appointmentId}` } })}>ورود</Button></Card></div>;
  }

  const handleFile = async (selected: File | undefined) => {
    if (!selected) return;
    setError('');
    if (!ACCEPTED_TYPES.has(selected.type)) {
      setError('فقط تصویر JPG، PNG یا WebP قابل ارسال است.');
      return;
    }
    if (selected.size > MAX_RECEIPT_BYTES) {
      setError('حجم تصویر باید حداکثر ۵ مگابایت باشد.');
      return;
    }
    try {
      const dataUrl = await readFile(selected);
      setFile({ name: selected.name, type: selected.type as 'image/jpeg' | 'image/png' | 'image/webp', data: dataUrl });
    } catch {
      setError('خواندن تصویر انجام نشد؛ دوباره انتخاب کن.');
    }
  };

  const submit = async () => {
    if (!appointmentId || !file || !canUpload || saving) return;
    setSaving(true);
    setError('');
    try {
      const comma = file.data.indexOf(',');
      const dataBase64 = comma >= 0 ? file.data.slice(comma + 1) : file.data;
      await customerApi.uploadDepositReceipt(appointmentId, {
        fileName: file.name,
        mimeType: file.type,
        dataBase64,
      });
      setDeposit((current) => (current ? { ...current, receiptStatus: 'pending' } : current));
      setFile(null);
    } catch {
      setError('ارسال رسید انجام نشد؛ دوباره تلاش کن.');
    } finally {
      setSaving(false);
    }
  };

  const copyCard = async () => {
    if (!cardNumber || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(cardNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('کپی شماره کارت انجام نشد.');
    }
  };

  return (
    <div className="min-h-screen bg-bg px-4 py-6 text-text sm:py-10" dir="rtl">
      <SeoHead title="ارسال رسید بیعانه" />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <Link to="/account" className="inline-flex min-h-10 w-fit items-center gap-2 text-sm font-bold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
          بازگشت به حساب من
        </Link>
        <header>
          <p className="text-sm font-semibold text-primary">تکمیل رزرو</p>
          <h1 className="mt-1 text-2xl font-bold text-text">ارسال رسید بیعانه</h1>
          <p className="mt-2 text-sm leading-7 text-muted">پس از بررسی رسید توسط سالن، نوبت شما نهایی می‌شود.</p>
        </header>

        {loadStatus === 'loading' && <Card className="text-sm text-muted">در حال دریافت اطلاعات پرداخت…</Card>}
        {loadStatus === 'error' && <Card className="border-danger/30 bg-danger/5 text-sm text-danger">{error}</Card>}

        {deposit && loadStatus === 'ready' && (
          <>
            <Card className="border-primary/20 bg-primary/5">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-contrast"><Landmark className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold">اطلاعات واریز</h2>
                  <p className="mt-1 text-xs leading-6 text-muted">مبلغ زیر را به کارت سالن واریز کن، سپس تصویر رسید را انتخاب کن.</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
                <span className="text-sm text-muted">مبلغ بیعانه</span>
                <Money amountRial={deposit.amountRial ?? 0} className="font-bold text-text" />
              </div>
              {deposit.method === 'card_transfer' && deposit.cardNumber && (
                <div className="mt-3 rounded-xl border border-border bg-surface p-3">
                  <span className="text-xs text-muted">شماره کارت سالن</span>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <strong dir="ltr" className="text-lg tracking-wider text-text">{formatCardNumber(deposit.cardNumber)}</strong>
                    <button type="button" onClick={() => void copyCard()} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-bold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">
                      <Clipboard className="h-4 w-4" aria-hidden="true" />
                      {copied ? 'کپی شد' : 'کپی'}
                    </button>
                  </div>
                  {deposit.cardHolder && <p className="m-0 mt-2 text-xs text-muted">به نام: <strong className="text-text">{deposit.cardHolder}</strong></p>}
                  {deposit.bankName && <p className="m-0 mt-1 text-xs text-muted">بانک: {deposit.bankName}</p>}
                </div>
              )}
            </Card>

            <Card className={cn('flex flex-col gap-4', isWaiting && 'border-success/30 bg-success/5')}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold">وضعیت رسید</h2>
                  <p className="mt-1 text-sm text-muted">{statusText}</p>
                </div>
                {isWaiting ? <CheckCircle2 className="h-7 w-7 text-success" aria-hidden="true" /> : <UploadCloud className="h-7 w-7 text-primary" aria-hidden="true" />}
              </div>

              {isApproved ? (
                <p className="rounded-lg bg-success/10 p-3 text-sm leading-7 text-success">بیعانه تأیید شد و رزرو شما نهایی شده است.</p>
              ) : !isManual ? (
                <p className="rounded-lg bg-surface p-3 text-sm leading-7 text-muted">این رزرو از طریق درگاه پرداخت می‌شود؛ برای ادامه به صفحه پرداخت برگرد.</p>
              ) : isWaiting ? (
                <p className="rounded-lg bg-surface p-3 text-sm leading-7 text-muted">رسید شما دریافت شد. تا تأیید سالن، این نوبت در حالت رزرو موقت باقی می‌ماند.</p>
              ) : isExpired ? (
                <p className="rounded-lg bg-danger/5 p-3 text-sm leading-7 text-danger">این مهلت رزرو تمام شده است. برای انتخاب زمان جدید به تقویم سالن برگرد.</p>
              ) : (
                <>
                  <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/35 bg-primary/5 p-4 text-center hover:bg-primary/10">
                    <ImagePlus className="h-7 w-7 text-primary" aria-hidden="true" />
                    <span className="text-sm font-bold text-text">تصویر رسید را انتخاب کن</span>
                    <span className="text-xs text-muted">JPG، PNG یا WebP · حداکثر ۵ مگابایت</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0])} />
                  </label>
                  {file && (
                    <div className="overflow-hidden rounded-xl border border-border bg-surface">
                      <img src={file.data} alt="پیش‌نمایش رسید بیعانه" className="max-h-72 w-full object-contain" />
                      <p className="truncate border-t border-border px-3 py-2 text-xs text-muted">{file.name}</p>
                    </div>
                  )}
                  <Button type="button" fullWidth loading={saving} disabled={!file || saving} startIcon={<UploadCloud className="h-4 w-4" />} onClick={() => void submit()}>
                    ارسال رسید برای سالن
                  </Button>
                </>
              )}
              {error && loadStatus === 'ready' && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

export default DepositReceiptPage;
