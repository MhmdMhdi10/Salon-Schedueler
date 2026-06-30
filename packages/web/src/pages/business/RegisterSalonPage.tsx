import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Plus,
  Scissors,
  ShieldCheck,
  Store,
  Trash2,
} from 'lucide-react';
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
import { Motif } from '../../components/brand';
import {
  Button,
  Card,
  TextField,
  ToastProvider,
  cn,
  toPersianDigits,
  useToast,
} from '../../components/ui';
import { ACCENTS, accentVars } from '../owner/marketing-assets';

/** Iranian mobile pattern: `09` followed by 9 digits (ui-ux §7). */
const PHONE_PATTERN = /^09\d{9}$/;
/** Number of digits in the SMS one-time code. */
const OTP_LENGTH = 6;
/** Resend cooldown in seconds — the «ارسال مجدد تا ۰:۴۵» timer (ui-ux §7). */
const RESEND_SECONDS = 45;

/** The visible onboarding steps, in order. `otp` is the final sign-in step. */
type Step = 'info' | 'services' | 'setup' | 'otp';
const STEP_ORDER: readonly Step[] = ['info', 'services', 'setup', 'otp'] as const;

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
  return (
    <ToastProvider>
      <RegisterSalonContent />
    </ToastProvider>
  );
}

function RegisterSalonContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { success } = useToast();
  const { refresh: refreshAuth } = useAuth();

  const [step, setStep] = useState<Step>('info');

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
  const [chairCount, setChairCount] = useState('');
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
    if (salonName.trim().length < 1) errors.salonName = t('business.register.errors.salonNameRequired');
    if (ownerName.trim().length < 1) errors.ownerName = t('business.register.errors.ownerNameRequired');
    if (!PHONE_PATTERN.test(normalizedPhone)) errors.phone = t('business.register.errors.invalidPhone');
    setInfoErrors(errors);
    if (Object.keys(errors).length === 0) setStep('services');
  };

  // ── Step 2: add / remove a service ────────────────────────────────────────
  const handleAddService = () => {
    const name = svcName.trim();
    const duration = toIntOrZero(svcDuration);
    if (name.length < 1 || duration <= 0) {
      setSvcError(t('business.register.services.invalid'));
      return;
    }
    setServices((prev) => [
      ...prev,
      { key: `${Date.now()}-${prev.length}`, name, durationMinutes: duration, priceRial: toIntOrZero(svcPrice) },
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
          durationMinutes,
          priceRial,
        })),
        chairCount: toIntOrZero(chairCount),
      });
      // Salon created — send the OTP so the owner can sign straight in.
      await authApi.requestOtp(normalizedPhone);
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
      await authApi.requestOtp(normalizedPhone);
      setSecondsLeft(RESEND_SECONDS);
      setCode(Array(OTP_LENGTH).fill(''));
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
    <div
      className="mx-auto flex w-full max-w-funnel flex-col gap-5 py-6"
      data-testid="register-salon-page"
    >
      <SeoHead title={t('business.register.title')} />

      <header className="flex flex-col items-center gap-3 text-center">
        <span
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-accent"
        >
          <Motif variant="mark" className="h-4 w-4" />
          {t('business.register.eyebrow')}
        </span>
        <h1 className="text-xl leading-display text-display text-text">
          {t('business.register.title')}
        </h1>
        <p className="max-w-prose text-sm text-muted">
          {t('business.register.subtitle')}
        </p>
      </header>

      {/* Progress stepper — ordered, with the active step marked aria-current. */}
      <ol className="flex items-center justify-center gap-2" aria-label={t('business.register.progressLabel')}>
        {STEP_ORDER.map((s, i) => {
          const done = i < stepIndex;
          const current = i === stepIndex;
          return (
            <li key={s} className="flex items-center gap-2">
              <span
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'flex h-7 min-w-7 items-center justify-center rounded-pill px-2 text-xs font-bold transition-colors duration-fast ease-standard',
                  current
                    ? 'bg-primary text-primary-contrast'
                    : done
                      ? 'bg-primary/15 text-primary'
                      : 'bg-surface text-muted',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : toPersianDigits(i + 1)}
              </span>
              <span className={cn('text-xs', current ? 'font-medium text-text' : 'text-muted')}>
                {t(`business.register.steps.${s}`)}
              </span>
              {i < STEP_ORDER.length - 1 && (
                <span className="h-px w-4 bg-border" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>

      <Card as="section" elevated className="flex flex-col gap-5">
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
                if (infoErrors.salonName) setInfoErrors((p) => ({ ...p, salonName: undefined }));
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
                if (infoErrors.ownerName) setInfoErrors((p) => ({ ...p, ownerName: undefined }));
              }}
            />
            <TextField
              id="phone"
              label={t('business.register.info.phoneLabel')}
              helperText={t('business.register.info.phoneHelper')}
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
                    onClick={() => setSvcName(t(`business.register.services.presets.${presetKey}`))}
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
              <ul className="flex flex-col gap-2" aria-label={t('business.register.services.listLabel')}>
                {services.map((s) => (
                  <li
                    key={s.key}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg px-3 py-2"
                  >
                    <span className="flex flex-col">
                      <span className="text-sm font-medium text-text">{s.name}</span>
                      <span className="text-xs text-muted">
                        {t('business.register.services.summary', {
                          minutes: toPersianDigits(s.durationMinutes),
                          price: toPersianDigits(s.priceRial.toLocaleString('en-US')),
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
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('business.register.setup.accentLabel')}>
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
                    // eslint-disable-next-line react/no-array-index-key
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

            <Button type="submit" size="lg" fullWidth loading={otpLoading} disabled={!codeIsComplete}>
              {t('business.register.verify.cta')}
            </Button>

            <div className="flex items-center justify-center">
              {secondsLeft > 0 ? (
                <span className="text-xs text-muted" aria-live="polite">
                  {t('auth.resendIn', { time: formatCountdown(secondsLeft) })}
                </span>
              ) : (
                <Button type="button" variant="ghost" size="md" onClick={() => void resendOtp()} disabled={otpLoading}>
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
      </Card>

      {/* Already have an account? */}
      {step !== 'otp' && (
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
  );
}

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
      {selected && !accentStyle && (
        <Check className="h-4 w-4 text-text" aria-hidden="true" />
      )}
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
