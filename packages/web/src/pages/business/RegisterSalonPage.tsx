import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Plus, Scissors, ShieldCheck, Store, Trash2 } from 'lucide-react';
import { normalizeDigits } from '@salon/shared';
import {
  ApiError,
  authApi,
  registrationApi,
  setAccessToken,
  setRefreshToken,
  type RegisterSalonServiceInput,
} from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { SeoHead } from '../../components/seo';
import { BrandLogo } from '../../components/brand';
import { Button, TextField, cn, toPersianDigits, useToast } from '../../components/ui';
import { ACCENTS, accentVars } from '../../components/theme/accents';

/** Iranian mobile pattern: `09` followed by 9 digits (ui-ux §7). */
const PHONE_PATTERN = /^09\d{9}$/;
/** Number of digits in the SMS one-time code. */
const OTP_LENGTH = 6;
/** Resend cooldown in seconds — the «ارسال مجدد تا ۰:۴۵» timer (ui-ux §7). */
const RESEND_SECONDS = 45;

/** The visible onboarding steps, in order. `otp` is the final sign-in step. */
type Step = 'category' | 'info' | 'services' | 'setup' | 'otp';
const STEP_ORDER: readonly Step[] = ['category', 'info', 'services', 'setup', 'otp'] as const;

/**
 * Normalizes a raw phone entry to canonical `09xxxxxxxxx` before validation:
 * localizes digits, strips spacing/punctuation, rewrites `+98`/`0098`/`98`
 * country-code prefixes to a leading `0` (mirrors AuthPage, ui-ux §7).
 */
function normalizePhone(raw: string): string {
  let v = normalizeDigits(raw).replace(/[\s()-]/g, '');
  if (v.startsWith('+98')) v = `0${v.slice(3)}`;
  else if (v.startsWith('0098')) v = `0${v.slice(4)}`;
  else if (v.startsWith('98') && v.length === 12) v = `0${v.slice(2)}`;
  return v;
}

/** Format remaining seconds as `m:ss` in Persian digits (resend timer). */
function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return toPersianDigits(`${minutes}:${String(seconds).padStart(2, '0')}`);
}

/** Parse a possibly-Persian numeric string to a non-negative integer (or 0). */
function toIntOrZero(raw: string): number {
  const n = parseInt(normalizeDigits(raw).replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** A service captured in the questionnaire (with a stable key for the list). */
interface DraftService extends RegisterSalonServiceInput {
  key: string;
}

/**
 * Salon self-registration wizard at `/business/register` (the owner-acquisition
 * onboarding). A short, skippable questionnaire that provisions the salon and
 * lands the owner straight in their panel:
 *
 *   1. مشخصات  — salon name + owner name + phone (required)
 *   2. خدمات    — add the services the salon offers (skippable)
 *   3. راه‌اندازی — chairs + brand colour, then a summary + submit (skippable)
 *   4. ورود     — OTP sign-in with the phone just registered → owner panel
 *
 * On submit it creates the salon, its Owner staff member, a free trial, and the
 * answered services/chairs/accent (so the panel is pre-filled), then sends an
 * OTP to the phone. Verifying it signs the owner in (an Owner token scoped to
 * the new salon) and routes to `/owner`.
 *
 * Signature, tokens-only, RTL (logical properties); all copy from `fa.json`
 * (`business.register.*`). Noindex (a form flow, not a search surface).
 */
export function RegisterSalonPage() {
  // Toasts surface through the app-root <ToastProvider> in App.tsx — a nested
  // per-page provider would silo this page's toasts from the app host.
  return <RegisterSalonContent />;
}

function RegisterSalonContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { success } = useToast();
  const { refresh: refreshAuth } = useAuth();

  const [step, setStep] = useState<Step>('category');
  const [category, setCategory] = useState('');

  // Step 1 — identity (required).
  const [salonName, setSalonName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [infoErrors, setInfoErrors] = useState<{
    salonName?: string;
    ownerName?: string;
    phone?: string;
  }>({});

  // Step 2 — services questionnaire.
  const [services, setServices] = useState<DraftService[]>([]);
  const [svcName, setSvcName] = useState('');
  const [svcDuration, setSvcDuration] = useState('');
  const [svcPrice, setSvcPrice] = useState('');
  const [svcError, setSvcError] = useState('');

  // Step 3 — setup questionnaire.
  const [chairCount, setChairCount] = useState('1');
  const [accentKey, setAccentKey] = useState('');

  // Submit + OTP.
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [code, setCode] = useState<string[]>(() => Array(OTP_LENGTH).fill(''));
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);
  const codeValue = code.join('');
  const codeIsComplete = codeValue.length === OTP_LENGTH;
  const stepIndex = STEP_ORDER.indexOf(step);

  // Resend countdown for the OTP step.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  // ── Step 1: validate identity, then advance ──────────────────────────────
  const handleInfoNext = () => {
    const errors: typeof infoErrors = {};
    if (salonName.trim().length < 1)
      errors.salonName = t('business.register.errors.salonNameRequired');
    if (ownerName.trim().length < 1)
      errors.ownerName = t('business.register.errors.ownerNameRequired');
    if (!PHONE_PATTERN.test(normalizedPhone))
      errors.phone = t('business.register.errors.invalidPhone');
    // Block advancing while a duplicate-phone verdict is pending or known.
    if (phoneCheck === 'checking')
      errors.phone = t('business.register.info.phoneChecking', { defaultValue: 'در حال بررسی…' });
    else if (phoneCheck === 'taken') errors.phone = t('business.register.errors.phoneTaken');
    setInfoErrors(errors);
    if (Object.keys(errors).length === 0) setStep('services');
  };

  // ── Live phone-duplicate check ──────────────────────────────────────────
  // As soon as the phone is format-valid, hit the backend to learn whether it
  // is already registered — flag the field immediately instead of bouncing the
  // user all the way back from Submit at Step 3. Debounced + cancels stale
  // responses so a quick typist never sees a stale "taken" verdict.
  const [phoneCheck, setPhoneCheck] = useState<'idle' | 'checking' | 'taken'>('idle');
  useEffect(() => {
    if (!PHONE_PATTERN.test(normalizedPhone)) {
      setPhoneCheck('idle');
      return;
    }
    let active = true;
    setPhoneCheck('checking');
    const handle = window.setTimeout(() => {
      registrationApi
        .checkPhone(normalizedPhone)
        .then((res) => {
          if (!active) return;
          setPhoneCheck(res.available ? 'idle' : 'taken');
          setInfoErrors((prev) => ({
            ...prev,
            phone: res.available ? undefined : t('business.register.errors.phoneTaken'),
          }));
        })
        .catch(() => {
          if (active) setPhoneCheck('idle');
        });
    }, 450);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [normalizedPhone, t]);

  // ── Step 2: add / remove a service ────────────────────────────────────────
  // Only the name is required — duration/price are optional and default
  // server-side (30 min / 0 Rial) when left blank, so an owner can quickly
  // sketch a service list during onboarding and fill details later.
  const handleAddService = () => {
    const name = svcName.trim();
    if (name.length < 1) {
      setSvcError(t('business.register.services.invalid'));
      return;
    }
    const duration = toIntOrZero(svcDuration);
    setServices((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${prev.length}`,
        name,
        ...(duration > 0 ? { durationMinutes: duration } : {}),
        priceRial: toIntOrZero(svcPrice) || undefined,
      },
    ]);
    setSvcName('');
    setSvcDuration('');
    setSvcPrice('');
    setSvcError('');
  };

  const handleRemoveService = (key: string) =>
    setServices((prev) => prev.filter((s) => s.key !== key));

  // ── Step 3: submit registration, then send the OTP ────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      await registrationApi.registerSalon({
        salonName: salonName.trim(),
        ownerName: ownerName.trim(),
        phone: normalizedPhone,
        brandAccent: accentKey || undefined,
        services: services.map(({ name, durationMinutes, priceRial }) => ({
          name,
          ...(durationMinutes ? { durationMinutes } : {}),
          ...(priceRial ? { priceRial } : {}),
        })),
        chairCount: toIntOrZero(chairCount),
      });
      // Salon created — send the OTP so the owner can sign straight in.
      const response = await authApi.requestOtp(normalizedPhone);
      const devOtp = response?.devOtp;
      setCode(devOtp ? devOtp.split('') : Array(OTP_LENGTH).fill(''));
      setStep('otp');
      setSecondsLeft(RESEND_SECONDS);
      success({ title: t('auth.otpSent') });
      window.setTimeout(() => otpRefs.current[0]?.focus(), 0);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PHONE_TAKEN') {
        // The phone already owns a salon — send them back to fix it.
        setInfoErrors({ phone: t('business.register.errors.phoneTaken') });
        setStep('info');
      } else {
        setSubmitError(t('business.register.errors.generic'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── OTP step ──────────────────────────────────────────────────────────────
  const resendOtp = async () => {
    setOtpLoading(true);
    setOtpError('');
    try {
      const response = await authApi.requestOtp(normalizedPhone);
      setSecondsLeft(RESEND_SECONDS);
      setCode(response?.devOtp ? response.devOtp.split('') : Array(OTP_LENGTH).fill(''));
      success({ title: t('auth.otpSent') });
      window.setTimeout(() => otpRefs.current[0]?.focus(), 0);
    } catch {
      setOtpError(t('business.register.errors.requestFailed'));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setOtpLoading(true);
    setOtpError('');
    try {
      const result = await authApi.verifyOtp(normalizedPhone, codeValue);
      setAccessToken(result.accessToken);
      setRefreshToken(result.refreshToken);
      void refreshAuth();
      navigate('/owner');
    } catch {
      setOtpError(t('business.register.errors.invalidOtp'));
    } finally {
      setOtpLoading(false);
    }
  };

  const setDigit = (index: number, digit: string) => {
    setOtpError('');
    setCode((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = normalizeDigits(e.target.value).replace(/\D/g, '');
    setDigit(index, raw ? raw[raw.length - 1] : '');
  };

  const handleOtpPaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = normalizeDigits(e.clipboardData.getData('text'))
      .replace(/\D/g, '')
      .slice(0, OTP_LENGTH - index);
    if (!pasted) return;
    e.preventDefault();
    setOtpError('');
    setCode((prev) => {
      const next = [...prev];
      for (let i = 0; i < pasted.length; i += 1) next[index + i] = pasted[i];
      return next;
    });
    otpRefs.current[Math.min(index + pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      e.preventDefault();
      otpRefs.current[index - 1]?.focus();
      setDigit(index - 1, '');
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-bg" data-testid="register-salon-page">
      <SeoHead title={t('business.register.title')} />

      <header className="border-b border-border bg-elevated">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-5 px-4">
          <Link to="/" aria-label="آرا" className="no-underline">
            <BrandLogo className="h-9" />
          </Link>
          <div className="flex flex-1 gap-1" aria-label={t('business.register.progressLabel')}>
            {STEP_ORDER.map((item, index) => (
              <span
                key={item}
                className={cn(
                  'h-1 flex-1 rounded-pill',
                  index <= stepIndex ? 'bg-primary' : 'bg-border',
                )}
                aria-hidden="true"
              />
            ))}
          </div>
          {step !== 'category' ? (
            <button
              type="button"
              onClick={() => setStep(STEP_ORDER[Math.max(0, stepIndex - 1)])}
              className="inline-flex size-10 items-center justify-center rounded-md text-text"
              aria-label={t('business.register.back')}
            >
              <ArrowRight className="size-5 rtl:-scale-x-100" aria-hidden="true" />
            </button>
          ) : (
            <span className="size-10" aria-hidden="true" />
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10">
        <p className="text-sm font-medium text-primary">
          مرحله {toPersianDigits(stepIndex + 1)} از {toPersianDigits(STEP_ORDER.length)}
        </p>
        <h1 className="mt-3 text-2xl leading-display text-display text-text">
          {step === 'category'
            ? 'چه نوع کسب‌وکاری دارید؟'
            : step === 'info'
              ? t('business.register.info.title')
              : step === 'services'
                ? t('business.register.services.title')
                : step === 'setup'
                  ? t('business.register.setup.title')
                  : t('business.register.verify.title')}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {step === 'category'
            ? 'با انتخاب حوزه کاری، آرا را متناسب با نیازهای شما آماده می‌کنیم.'
            : t('business.register.subtitle')}
        </p>

        {step === 'category' ? (
          <section className="flex flex-1 flex-col pt-8">
            <div className="grid gap-3 sm:grid-cols-2">
              {BUSINESS_CATEGORIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  aria-pressed={category === item}
                  className={cn(
                    'flex min-h-14 items-center rounded-lg border-2 bg-elevated px-5 text-start font-medium text-text transition-colors duration-fast',
                    category === item ? 'border-primary' : 'border-border',
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
            <Button
              type="button"
              size="lg"
              fullWidth
              disabled={!category}
              onClick={() => setStep('info')}
              className="mt-auto"
            >
              {t('business.register.next')}
            </Button>
          </section>
        ) : (
          <section className="mt-8 flex flex-col gap-5">
            {step === 'info' && (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleInfoNext();
                }}
              >
                <StepHeading
                  icon={<Store className="h-5 w-5" aria-hidden="true" />}
                  title={t('business.register.info.title')}
                  subtitle={t('business.register.info.subtitle')}
                />
                <TextField
                  id="salonName"
                  label={t('business.register.info.salonNameLabel')}
                  placeholder={t('business.register.info.salonNamePlaceholder')}
                  error={infoErrors.salonName}
                  value={salonName}
                  onChange={(e) => {
                    setSalonName(e.target.value);
                    if (infoErrors.salonName)
                      setInfoErrors((p) => ({ ...p, salonName: undefined }));
                  }}
                />
                <TextField
                  id="ownerName"
                  label={t('business.register.info.ownerNameLabel')}
                  placeholder={t('business.register.info.ownerNamePlaceholder')}
                  error={infoErrors.ownerName}
                  value={ownerName}
                  onChange={(e) => {
                    setOwnerName(e.target.value);
                    if (infoErrors.ownerName)
                      setInfoErrors((p) => ({ ...p, ownerName: undefined }));
                  }}
                />
                <TextField
                  id="phone"
                  label={t('business.register.info.phoneLabel')}
                  helperText={
                    phoneCheck === 'checking'
                      ? t('business.register.info.phoneChecking', { defaultValue: 'در حال بررسی…' })
                      : t('business.register.info.phoneHelper')
                  }
                  error={infoErrors.phone}
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  autoComplete="tel"
                  maxLength={13}
                  placeholder={t('auth.phonePlaceholder')}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (infoErrors.phone) setInfoErrors((p) => ({ ...p, phone: undefined }));
                  }}
                />
                <Button type="submit" size="lg" fullWidth>
                  {t('business.register.next')}
                </Button>
              </form>
            )}

            {step === 'services' && (
              <div className="flex flex-col gap-4">
                <StepHeading
                  icon={<Scissors className="h-5 w-5" aria-hidden="true" />}
                  title={t('business.register.services.title')}
                  subtitle={t('business.register.services.subtitle')}
                />

                {/* Quick-add presets fill the service-name draft. */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted">
                    {t('business.register.services.presetsLabel')}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {SERVICE_PRESETS.map((presetKey) => (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() =>
                          setSvcName(t(`business.register.services.presets.${presetKey}`))
                        }
                        className="inline-flex min-h-9 items-center gap-1 rounded-pill border border-border bg-bg px-3 py-1 text-xs text-text transition-colors duration-fast ease-standard hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        <Plus className="h-3 w-3" aria-hidden="true" />
                        {t(`business.register.services.presets.${presetKey}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
                  <TextField
                    id="svcName"
                    label={t('business.register.services.nameLabel')}
                    placeholder={t('business.register.services.namePlaceholder')}
                    value={svcName}
                    onChange={(e) => setSvcName(e.target.value)}
                  />
                  <TextField
                    id="svcDuration"
                    label={t('business.register.services.durationLabel')}
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="۳۰"
                    containerClassName="sm:w-28"
                    value={svcDuration}
                    onChange={(e) => setSvcDuration(e.target.value)}
                  />
                  <TextField
                    id="svcPrice"
                    label={t('business.register.services.priceLabel')}
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="۵۰۰۰۰۰"
                    containerClassName="sm:w-36"
                    value={svcPrice}
                    onChange={(e) => setSvcPrice(e.target.value)}
                  />
                </div>
                {svcError && (
                  <p className="flex items-center gap-1 text-sm text-danger" role="alert">
                    {svcError}
                  </p>
                )}
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    startIcon={<Plus className="h-4 w-4" />}
                    onClick={handleAddService}
                  >
                    {t('business.register.services.addCta')}
                  </Button>
                </div>

                {services.length > 0 && (
                  <ul
                    className="flex flex-col gap-2"
                    aria-label={t('business.register.services.listLabel')}
                  >
                    {services.map((s) => (
                      <li
                        key={s.key}
                        className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg px-3 py-2"
                      >
                        <span className="flex flex-col">
                          <span className="text-sm font-medium text-text">{s.name}</span>
                          <span className="text-xs text-muted">
                            {t('business.register.services.summary', {
                              minutes: toPersianDigits(s.durationMinutes ?? 30),
                              price: toPersianDigits((s.priceRial ?? 0).toLocaleString('en-US')),
                            })}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveService(s.key)}
                          aria-label={t('business.register.services.remove', { name: s.name })}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors duration-fast ease-standard hover:bg-surface hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <StepNav
                  onBack={() => setStep('info')}
                  onNext={() => setStep('setup')}
                  onSkip={() => setStep('setup')}
                  nextLabel={t('business.register.next')}
                  skipLabel={t('business.register.skip')}
                  backLabel={t('business.register.back')}
                />
              </div>
            )}

            {step === 'setup' && (
              <div className="flex flex-col gap-5">
                <StepHeading
                  icon={<Store className="h-5 w-5" aria-hidden="true" />}
                  title={t('business.register.setup.title')}
                  subtitle={t('business.register.setup.subtitle')}
                />

                <TextField
                  id="chairCount"
                  label={t('business.register.setup.chairsLabel')}
                  helperText={t('business.register.setup.chairsHelper')}
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="۳"
                  containerClassName="max-w-[10rem]"
                  value={chairCount}
                  onChange={(e) => setChairCount(e.target.value)}
                />

                {/* Brand-accent picker — themes the storefront + booking funnel. */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted">
                    {t('business.register.setup.accentLabel')}
                  </span>
                  <div
                    className="flex flex-wrap gap-2"
                    role="radiogroup"
                    aria-label={t('business.register.setup.accentLabel')}
                  >
                    <AccentSwatch
                      selected={accentKey === ''}
                      onSelect={() => setAccentKey('')}
                      label={t('business.register.setup.accentDefault')}
                    />
                    {ACCENTS.map((accent) => (
                      <AccentSwatch
                        key={accent.key}
                        accentStyle={accentVars(accent)}
                        selected={accentKey === accent.key}
                        onSelect={() => setAccentKey(accent.key)}
                        label={t(`admin.config.brand.accents.${accent.key}`, accent.key)}
                      />
                    ))}
                  </div>
                </div>

                {/* Compact summary so the owner can confirm before submitting. */}
                <dl className="flex flex-col gap-2 rounded-md border border-border bg-bg p-3 text-sm">
                  <SummaryRow label={t('business.register.review.salon')} value={salonName} />
                  <SummaryRow label={t('business.register.review.owner')} value={ownerName} />
                  <SummaryRow
                    label={t('business.register.review.phone')}
                    value={toPersianDigits(normalizedPhone)}
                    dir="ltr"
                  />
                  <SummaryRow
                    label={t('business.register.review.services')}
                    value={
                      services.length > 0
                        ? t('business.register.review.servicesCount', {
                            count: toPersianDigits(services.length),
                          })
                        : t('business.register.review.none')
                    }
                  />
                </dl>

                {submitError && (
                  <p className="flex items-center gap-1 text-sm text-danger" role="alert">
                    {submitError}
                  </p>
                )}

                <StepNav
                  onBack={() => setStep('services')}
                  onNext={() => void handleSubmit()}
                  onSkip={() => void handleSubmit()}
                  nextLabel={t('business.register.submit')}
                  skipLabel={t('business.register.skipSetup')}
                  backLabel={t('business.register.back')}
                  loading={submitting}
                />
              </div>
            )}

            {step === 'otp' && (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleVerifyOtp();
                }}
              >
                <StepHeading
                  icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
                  title={t('business.register.verify.title')}
                  subtitle={t('business.register.verify.subtitle', {
                    phone: toPersianDigits(normalizedPhone),
                  })}
                />
                <fieldset className="m-0 border-0 p-0">
                  <legend className="mb-1 block text-xs font-medium text-text">
                    {t('auth.otpLabel')}
                  </legend>
                  <div
                    className="flex flex-row justify-center gap-2"
                    dir="ltr"
                    style={{ direction: 'ltr' }}
                  >
                    {code.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => {
                          otpRefs.current[index] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        autoComplete={index === 0 ? 'one-time-code' : 'off'}
                        dir="ltr"
                        maxLength={1}
                        aria-label={t('auth.otpDigitLabel', { index: toPersianDigits(index + 1) })}
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e)}
                        onPaste={(e) => handleOtpPaste(index, e)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        className={cn(
                          'h-12 w-11 rounded-md border bg-bg text-center text-lg font-bold text-text',
                          'transition-colors duration-fast ease-standard',
                          'outline-none focus-visible:outline focus-visible:outline-2',
                          'focus-visible:outline-offset-2 focus-visible:outline-focus',
                          otpError ? 'border-danger' : 'border-border',
                        )}
                      />
                    ))}
                  </div>
                </fieldset>

                <Button
                  type="submit"
                  size="lg"
                  fullWidth
                  loading={otpLoading}
                  disabled={!codeIsComplete}
                >
                  {t('business.register.verify.cta')}
                </Button>

                <div className="flex items-center justify-center">
                  {secondsLeft > 0 ? (
                    <span className="text-xs text-muted" aria-live="polite">
                      {t('auth.resendIn', { time: formatCountdown(secondsLeft) })}
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      onClick={() => void resendOtp()}
                      disabled={otpLoading}
                    >
                      {t('auth.resend')}
                    </Button>
                  )}
                </div>

                {otpError && (
                  <p className="mt-1 flex items-center gap-1 text-sm text-danger" role="alert">
                    {otpError}
                  </p>
                )}
              </form>
            )}
          </section>
        )}

        {/* Already have an account? */}
        {step !== 'otp' && step !== 'category' && (
          <p className="text-center text-sm text-muted">
            {t('business.register.haveAccount')}{' '}
            <Link
              to="/auth"
              className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {t('business.register.signIn')}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

const BUSINESS_CATEGORIES = [
  'آرایشگاه مردانه',
  'سالن مو و زیبایی',
  'سالن ناخن',
  'اسپا و سلامت',
  'ابرو و مژه',
  'تتو و پیرسینگ',
  'سایر',
] as const;

/** Quick-add service presets (keys map to `business.register.services.presets.*`). */
const SERVICE_PRESETS = ['haircut', 'color', 'highlights', 'blowout', 'makeup', 'nails'] as const;

/** A step heading: small accent icon chip + title + subtitle. */
function StepHeading({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-text">{title}</h2>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

/** Bottom navigation for a skippable step: primary next + (back · skip). */
function StepNav({
  onBack,
  onNext,
  onSkip,
  nextLabel,
  skipLabel,
  backLabel,
  loading,
}: {
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  nextLabel: string;
  skipLabel: string;
  backLabel: string;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 pt-1">
      <Button type="button" size="lg" fullWidth onClick={onNext} loading={loading}>
        {nextLabel}
      </Button>
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="md"
          startIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}
          onClick={onBack}
        >
          {backLabel}
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={onSkip} disabled={loading}>
          {skipLabel}
        </Button>
      </div>
    </div>
  );
}

/** A selectable brand-accent swatch (the default option carries no colour). */
function AccentSwatch({
  accentStyle,
  selected,
  onSelect,
  label,
}: {
  accentStyle?: React.CSSProperties;
  selected: boolean;
  onSelect: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      style={accentStyle}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-pill border-2 transition-transform duration-fast ease-standard',
        accentStyle ? 'bg-[var(--asset-from)]' : 'bg-surface',
        selected ? 'scale-110 border-text' : 'border-border',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
      )}
    >
      {selected && !accentStyle && <Check className="h-4 w-4 text-text" aria-hidden="true" />}
    </button>
  );
}

/** One labelled row in the confirmation summary list. */
function SummaryRow({ label, value, dir }: { label: string; value: string; dir?: 'ltr' | 'rtl' }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-text" dir={dir}>
        {value || '—'}
      </dd>
    </div>
  );
}

export default RegisterSalonPage;
