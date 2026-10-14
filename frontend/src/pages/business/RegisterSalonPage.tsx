import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { normalizeDigits } from '@salon/shared';
import {
  ApiError,
  authApi,
  customerApi,
  registrationApi,
  setAccessToken,
  type RegisterSalonServiceInput,
} from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { SeoHead } from '../../components/seo';
import { BrandLogo, Motif } from '../../components/brand';
import { ThemeToggle } from '../../components/theme/ThemeToggle';
import {
  Button,
  DurationStepper,
  IconButton,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  TextField,
  cn,
  toPersianDigits,
  useToast,
} from '../../components/ui';
import { filterPhoneInput, normalizePhone, PHONE_PATTERN } from '../../auth/phone';
import { formatPriceInput } from '../../components/ui/price-input';
import {
  BarberIcon,
  BrowsIcon,
  HaircutIcon,
  MakeupIcon,
  NailsIcon,
  SkinIcon,
  TattooIcon,
} from '../../components/icons';
import type { CategoryIconProps } from '../../components/icons';

import './RegisterSalonPage.css';

/** Number of digits in the SMS one-time code. */
const OTP_LENGTH = 4;
/** Resend cooldown in seconds — the «ارسال مجدد تا ۰:۴۵» timer (ui-ux §7). */
const RESEND_SECONDS = 45;

/** The visible onboarding steps, in order. `otp` is the final sign-in step. */
type Step = 'category' | 'info' | 'services' | 'otp';
type ServiceSheetMode = 'catalog' | 'custom' | 'edit' | null;
const STEP_ORDER: readonly Step[] = ['category', 'info', 'services', 'otp'] as const;

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
 *   1. حوزه کاری — business type, used to tailor service suggestions
 *   2. مشخصات — salon name + owner name + phone
 *   3. خدمات — choose services and optionally refine duration and price
 *   4. ورود — OTP sign-in with the phone just registered
 *
 * On submit it creates the salon, its Owner staff member, a free trial, and the
 * answered services (so the panel is pre-filled), then sends an
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
  const location = useLocation();
  const navigate = useNavigate();
  const { success } = useToast();
  const { refresh: refreshAuth } = useAuth();

  const [step, setStep] = useState<Step>('category');
  const [categories, setCategories] = useState<string[]>([]);

  // Identity — required before provisioning the salon.
  const [salonName, setSalonName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState(() => {
    const ownerPhone = (location.state as { ownerPhone?: unknown } | null)?.ownerPhone;
    return typeof ownerPhone === 'string' ? ownerPhone : '';
  });
  const [infoErrors, setInfoErrors] = useState<{
    salonName?: string;
    ownerName?: string;
    phone?: string;
  }>({});

  // Services questionnaire.
  const [services, setServices] = useState<DraftService[]>([]);
  const [serviceSheetMode, setServiceSheetMode] = useState<ServiceSheetMode>(null);
  const [svcName, setSvcName] = useState('');
  const [svcDuration, setSvcDuration] = useState('30');
  const [svcPrice, setSvcPrice] = useState('');
  const [svcError, setSvcError] = useState('');
  const [editingService, setEditingService] = useState<{
    key: string;
    name: string;
    duration: string;
    price: string;
  } | null>(null);
  const [serviceEditError, setServiceEditError] = useState('');
  const [servicePresetQuery, setServicePresetQuery] = useState('');
  const [showAllPresets, setShowAllPresets] = useState(false);

  // Submit + OTP.
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [otpLength, setOtpLength] = useState(OTP_LENGTH);
  const [code, setCode] = useState<string[]>(() => Array(OTP_LENGTH).fill(''));
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    setServicePresetQuery('');
    setShowAllPresets(false);
  }, [categories]);

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const autoSubmittedOtp = useRef('');
  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);
  const codeValue = code.join('');
  const codeIsComplete = codeValue.length === otpLength;
  const stepIndex = STEP_ORDER.indexOf(step);
  const prefersReducedMotion = useReducedMotion();

  const applyOtpResponse = (response?: { devOtp?: string; otpLength?: number }) => {
    setOtpLength(OTP_LENGTH);
    setCode(
      response?.devOtp && /^\d{4}$/.test(response.devOtp)
        ? response.devOtp.split('')
        : Array(OTP_LENGTH).fill(''),
    );
    autoSubmittedOtp.current = '';
  };

  // Resend countdown for the OTP step.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  // Every step is a new reading surface. Start it at the top so a short
  // mobile viewport never opens halfway through the next form.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [step]);

  // ── Identity: validate required fields, then advance ─────────────────────
  const handleInfoNext = () => {
    const errors: typeof infoErrors = {};
    if (salonName.trim().length < 1)
      errors.salonName = t('business.register.errors.salonNameRequired');
    if (ownerName.trim().length < 1)
      errors.ownerName = t('business.register.errors.ownerNameRequired');
    if (!PHONE_PATTERN.test(normalizedPhone))
      errors.phone = t('business.register.errors.invalidPhone');
    setInfoErrors(errors);
    if (Object.keys(errors).length === 0) setStep('services');
  };

  const closeServiceSheet = () => {
    setServiceSheetMode(null);
    setEditingService(null);
    setServiceEditError('');
    setSvcError('');
    setSvcName('');
    setSvcDuration('30');
    setSvcPrice('');
    setServicePresetQuery('');
    setShowAllPresets(false);
  };

  const openServiceCatalog = () => {
    setSvcError('');
    setServiceEditError('');
    setServicePresetQuery('');
    setShowAllPresets(false);
    setServiceSheetMode('catalog');
  };

  const openCustomServiceForm = () => {
    setSvcError('');
    setServiceSheetMode('custom');
  };

  // ── Services: add / edit / remove a service ──────────────────────────────
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
    setSvcDuration('30');
    setSvcPrice('');
    setSvcError('');
    setServiceSheetMode('catalog');
  };

  const handleTogglePresetService = (preset: SuggestedService) => {
    const key = `preset-${preset.key}`;
    const name = preset.label;
    const existing = services.find((service) => service.key === key);
    if (existing) {
      setServices((previous) => previous.filter((service) => service.key !== existing.key));
    } else {
      setServices((previous) => [...previous, { key, name, durationMinutes: 30, priceRial: 0 }]);
    }
    setSvcError('');
  };

  const startEditingService = (service: DraftService) => {
    setEditingService({
      key: service.key,
      name: service.name,
      duration: service.durationMinutes ? String(service.durationMinutes) : '',
      price: service.priceRial ? String(service.priceRial) : '',
    });
    setServiceEditError('');
    setServiceSheetMode('edit');
  };

  const handleSaveService = () => {
    if (!editingService) return;
    const name = editingService.name.trim();
    if (name.length < 1) {
      setServiceEditError(t('business.register.services.invalid'));
      return;
    }
    const duration = toIntOrZero(editingService.duration);
    const price = toIntOrZero(editingService.price);
    setServices((previous) =>
      previous.map((service) =>
        service.key === editingService.key
          ? {
              ...service,
              name,
              durationMinutes: duration > 0 ? duration : undefined,
              priceRial: price > 0 ? price : undefined,
            }
          : service,
      ),
    );
    closeServiceSheet();
  };

  const handleRemoveService = (key: string) => {
    setServices((prev) => prev.filter((s) => s.key !== key));
  };

  const suggestedServices = useMemo(() => {
    const keys =
      categories.length > 0
        ? categories.flatMap((profileKey) => SERVICE_PRESETS_BY_PROFILE[profileKey] ?? [])
        : [
            'haircut',
            'manicure',
            'mens_haircut',
            'brows',
            'makeup',
            'facial',
            ...Object.values(SERVICE_PRESETS_BY_PROFILE).flat(),
          ];
    return [...new Set(keys)].map((key) => ({
      key,
      label: t(`business.register.services.presets.${key}`, { defaultValue: key }),
    }));
  }, [categories, t]);
  const filteredServicePresets = useMemo(() => {
    const query = servicePresetQuery.trim().toLocaleLowerCase('fa-IR');
    if (!query) return suggestedServices;
    return suggestedServices.filter((service) =>
      service.label.toLocaleLowerCase('fa-IR').includes(query),
    );
  }, [servicePresetQuery, suggestedServices]);
  // ── Submit registration, then send the OTP ───────────────────────────────
  const handleSubmit = async () => {
    if (!PHONE_PATTERN.test(normalizedPhone)) {
      setInfoErrors((previous) => ({
        ...previous,
        phone: t('business.register.errors.invalidPhone'),
      }));
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    let salonCreated = registered;
    try {
      if (!registered) {
        await registrationApi.registerSalon({
          salonName: salonName.trim(),
          ownerName: ownerName.trim(),
          phone: normalizedPhone,
          businessType: categories[0] || undefined,
          businessTypes: categories,
          workMode: 'not_decided',
          services: services.map(({ name, durationMinutes, priceRial }) => ({
            name,
            ...(durationMinutes ? { durationMinutes } : {}),
            ...(priceRial ? { priceRial: priceRial * 10 } : {}),
          })),
          chairCount: 1,
        });
        salonCreated = true;
        setRegistered(true);
      }
      // Salon created — send the OTP so the owner can sign straight in.
      const response = await authApi.requestOtp(normalizedPhone);
      applyOtpResponse(response);
      setStep('otp');
      setSecondsLeft(RESEND_SECONDS);
      success({ title: t('auth.otpSent') });
      window.setTimeout(() => otpRefs.current[0]?.focus(), 0);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PHONE_TAKEN' && !salonCreated) {
        setSubmitError('این شماره قابل استفاده نیست؛ دوباره تلاش کنید.');
      } else if (salonCreated) {
        setSubmitError(t('business.register.errors.requestFailed'));
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
      applyOtpResponse(response);
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
      await refreshAuth();
      try {
        const profile = await customerApi.getProfile();
        if (!profile.customer.fullName?.trim()) {
          await customerApi.updateProfile(ownerName.trim());
        }
      } catch {
        // A profile update must not delay entry after OTP verification.
      }
      navigate('/owner');
    } catch {
      setOtpError(t('business.register.errors.invalidOtp'));
    } finally {
      setOtpLoading(false);
    }
  };

  // Development autofill and mobile SMS autofill should complete onboarding
  // immediately once all code digits are present; the button remains as a
  // fallback for users who prefer an explicit action.
  useEffect(() => {
    if (step === 'otp' && codeIsComplete && !otpLoading && autoSubmittedOtp.current !== codeValue) {
      autoSubmittedOtp.current = codeValue;
      void handleVerifyOtp();
    }
  }, [codeIsComplete, codeValue, otpLoading, step]);

  const setDigit = (index: number, digit: string) => {
    setOtpError('');
    setCode((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < otpLength - 1) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = normalizeDigits(e.target.value).replace(/\D/g, '');
    if (raw.length > 1) {
      const pasted = raw.slice(0, otpLength - index).split('');
      setOtpError('');
      setCode((previous) => {
        const next = [...previous];
        pasted.forEach((digit, offset) => {
          next[index + offset] = digit;
        });
        return next;
      });
      otpRefs.current[Math.min(index + pasted.length, otpLength - 1)]?.focus();
      return;
    }
    setDigit(index, raw ? raw[raw.length - 1] : '');
  };

  const handleOtpPaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = normalizeDigits(e.clipboardData.getData('text'))
      .replace(/\D/g, '')
      .slice(0, otpLength - index);
    if (!pasted) return;
    e.preventDefault();
    setOtpError('');
    setCode((prev) => {
      const next = [...prev];
      for (let i = 0; i < pasted.length; i += 1) next[index + i] = pasted[i];
      return next;
    });
    otpRefs.current[Math.min(index + pasted.length, otpLength - 1)]?.focus();
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
      className="register-page-shell flex min-h-screen min-h-[100dvh] w-full flex-col bg-bg"
      data-testid="register-salon-page"
    >
      <SeoHead title={t('business.register.title')} />

      <header className="register-page-header border-b border-border bg-elevated" dir="rtl">
        <div className="relative mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-2 px-4 sm:gap-5 sm:px-8">
          <Link
            to="/"
            aria-label="آرا"
            className="inline-flex min-h-10 shrink-0 items-center no-underline"
          >
            <BrandLogo className="h-9" />
          </Link>
          <div
            className="register-step-progress pointer-events-none absolute inset-0 flex items-center justify-center"
            role="progressbar"
            aria-label={t('business.register.progressLabel')}
            aria-valuemin={1}
            aria-valuemax={STEP_ORDER.length}
            aria-valuenow={stepIndex + 1}
            aria-valuetext={t('business.register.progress', {
              current: toPersianDigits(stepIndex + 1),
              total: toPersianDigits(STEP_ORDER.length),
            })}
          >
            <div className="register-step-progress__track flex gap-1">
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
          </div>
          <ThemeToggle className="shrink-0" />
        </div>
      </header>

      <div className="register-form-content mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-7 sm:px-8 sm:py-10">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={step}
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={
              prefersReducedMotion ? { duration: 0 } : { duration: 0.22, ease: [0.2, 0, 0, 1] }
            }
            className="min-w-0"
          >
            <p className="text-sm font-medium text-primary">
              {t('business.register.progress', {
                current: toPersianDigits(stepIndex + 1),
                total: toPersianDigits(STEP_ORDER.length),
              })}
            </p>
            <h1 className="mt-3 text-2xl leading-display text-display text-text">
              {step === 'category'
                ? t('business.register.category.title')
                : step === 'info'
                  ? t('business.register.info.title')
                  : step === 'services'
                    ? t('business.register.services.title')
                    : t('business.register.verify.title')}
            </h1>
            <p className="mt-2 max-w-[38rem] text-sm leading-6 text-muted">
              {step === 'category'
                ? t('business.register.category.subtitle')
                : step === 'info'
                  ? t('business.register.info.subtitle')
                  : step === 'services'
                    ? t('business.register.services.subtitle')
                    : t('business.register.verify.subtitle', {
                        phone: toPersianDigits(normalizedPhone),
                      })}
            </p>

            {step === 'category' ? (
              <section className="flex flex-col pt-7">
                <p className="mb-3 text-sm text-muted">
                  {t('business.register.category.selectionHint')}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {BUSINESS_PROFILES.map((profile, index) => {
                    const Icon = profile.icon;
                    const selected = categories.includes(profile.key);
                    return (
                      <button
                        key={profile.key}
                        type="button"
                        onClick={() => {
                          const nextCategories = selected
                            ? categories.filter((key) => key !== profile.key)
                            : [...categories, profile.key];
                          setCategories(nextCategories);
                        }}
                        aria-pressed={selected}
                        data-testid={`business-type-${profile.key}`}
                        className={cn(
                          'flex min-h-[4.5rem] items-center gap-3 rounded-xl border px-3 py-3 text-start text-text transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:px-4',
                          selected
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-elevated hover:border-primary/50',
                          index === BUSINESS_PROFILES.length - 1 &&
                            'sm:col-span-2 sm:w-1/2 sm:justify-self-center',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-lg',
                            selected
                              ? 'bg-primary text-primary-contrast'
                              : 'bg-surface text-primary',
                          )}
                        >
                          <Icon className="size-[1.125rem]" aria-hidden="true" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-sm font-semibold">
                            {t(`business.register.category.profiles.${profile.key}.label`)}
                          </span>
                          <span className="text-xs leading-5 text-muted">
                            {t(`business.register.category.profiles.${profile.key}.description`)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-full border',
                            selected
                              ? 'border-primary bg-primary text-primary-contrast'
                              : 'border-border text-transparent',
                          )}
                          aria-hidden="true"
                        >
                          <Check className="size-4" />
                        </span>
                      </button>
                    );
                  })}
                </div>
                <StepNav
                  onNext={() => setStep('info')}
                  nextLabel={t('business.register.next')}
                  backLabel={t('business.register.back')}
                  nextDisabled={categories.length === 0}
                />
              </section>
            ) : (
              <section className="mt-8 flex flex-col gap-5">
                {step === 'info' && (
                  <form
                    className="grid gap-5 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleInfoNext();
                    }}
                  >
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
                    <div className="sm:col-span-2">
                      <TextField
                        id="phone"
                        label={t('business.register.info.phoneLabel')}
                        helperText={t('business.register.info.phoneHelper')}
                        error={infoErrors.phone}
                        type="tel"
                        inputMode="tel"
                        dir="ltr"
                        autoComplete="tel"
                        maxLength={14}
                        placeholder={t('auth.phonePlaceholder')}
                        value={phone}
                        onChange={(e) => {
                          setPhone(filterPhoneInput(e.target.value));
                          if (infoErrors.phone) setInfoErrors((p) => ({ ...p, phone: undefined }));
                        }}
                      />
                    </div>
                    <div className="register-info-actions flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
                      <Button type="submit" size="lg" className="register-info-primary sm:min-w-44">
                        {t('business.register.next')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        // RTL-native: the back action points visually right.
                        startIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                        onClick={() => setStep('category')}
                      >
                        {t('business.register.back')}
                      </Button>
                    </div>
                  </form>
                )}

                {step === 'services' && (
                  <div className="flex flex-col gap-5" data-testid="register-services-step">
                    <section className="rounded-2xl border border-border bg-elevated p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-sm font-semibold text-text">
                            {t('business.register.services.listLabel')}
                          </h2>
                          <p className="mt-1 text-xs text-muted" role="status">
                            {t('business.register.services.selectedCount', {
                              count: toPersianDigits(services.length),
                            })}
                          </p>
                        </div>
                        {services.length > 0 && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            startIcon={<Plus className="size-4" aria-hidden="true" />}
                            onClick={openServiceCatalog}
                            className="shrink-0"
                          >
                            {t('business.register.services.addCta')}
                          </Button>
                        )}
                      </div>

                      {services.length === 0 ? (
                        <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-border px-4 py-7 text-center">
                          <span className="flex size-11 items-center justify-center rounded-full bg-surface text-primary">
                            <Motif variant="mark" className="size-6" aria-hidden />
                          </span>
                          <h3 className="mt-3 text-sm font-semibold text-text">
                            {t('business.register.services.emptyTitle')}
                          </h3>
                          <p className="mt-1 max-w-sm text-xs leading-5 text-muted">
                            {t('business.register.services.emptyHint')}
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            startIcon={<Plus className="size-4" aria-hidden="true" />}
                            onClick={openServiceCatalog}
                            className="mt-4"
                          >
                            {t('business.register.services.addCta')}
                          </Button>
                        </div>
                      ) : (
                        <ul
                          className="mt-3 divide-y divide-border"
                          aria-label={t('business.register.services.listLabel')}
                        >
                          {services.map((service) => (
                            <li
                              key={service.key}
                              className="flex min-h-16 items-center justify-between gap-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-text">
                                  {service.name}
                                </p>
                                <p className="mt-1 text-xs text-muted">
                                  {service.priceRial
                                    ? t('business.register.services.summary', {
                                        minutes: toPersianDigits(service.durationMinutes ?? 30),
                                        price: toPersianDigits(
                                          service.priceRial.toLocaleString('en-US'),
                                        ),
                                      })
                                    : t('business.register.services.summaryNoPrice', {
                                        minutes: toPersianDigits(service.durationMinutes ?? 30),
                                      })}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <IconButton
                                  aria-label={t('business.register.services.edit', {
                                    name: service.name,
                                  })}
                                  onClick={() => startEditingService(service)}
                                >
                                  <Pencil className="size-4" />
                                </IconButton>
                                <IconButton
                                  variant="danger"
                                  aria-label={t('business.register.services.remove', {
                                    name: service.name,
                                  })}
                                  onClick={() => handleRemoveService(service.key)}
                                >
                                  <Trash2 className="size-4" />
                                </IconButton>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    {submitError && (
                      <p className="text-sm text-danger" role="alert">
                        {submitError}
                      </p>
                    )}

                    <StepNav
                      onBack={() => setStep('info')}
                      onNext={() => void handleSubmit()}
                      nextLabel={t('business.register.submit')}
                      backLabel={t('business.register.back')}
                      loading={submitting}
                    />

                    <Sheet
                      open={serviceSheetMode !== null}
                      onOpenChange={(open) => {
                        if (!open) closeServiceSheet();
                      }}
                    >
                      <SheetContent
                        side="bottom"
                        className="mx-auto flex h-[min(90dvh,48rem)] max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden p-0 sm:rounded-t-2xl"
                      >
                        <header className="shrink-0 border-b border-border px-5 pb-4 pe-16 pt-6">
                          <span
                            className="mx-auto mb-4 block h-1 w-9 rounded-full bg-border sm:hidden"
                            aria-hidden="true"
                          />
                          <SheetTitle className="text-base font-semibold">
                            {serviceSheetMode === 'edit'
                              ? t('business.register.services.editTitle')
                              : serviceSheetMode === 'custom'
                                ? t('business.register.services.formTitle')
                                : t('business.register.services.presetsLabel')}
                          </SheetTitle>
                          <SheetDescription className="leading-6">
                            {serviceSheetMode === 'edit'
                              ? t('business.register.services.editDescription')
                              : serviceSheetMode === 'custom'
                                ? t('business.register.services.formHelper')
                                : t('business.register.services.presetsHelper')}
                          </SheetDescription>
                        </header>

                        {serviceSheetMode === 'catalog' && (
                          <div className="flex min-h-0 flex-1 flex-col">
                            <div className="shrink-0 space-y-3 px-5 pb-3 pt-4">
                              <label className="relative block">
                                <span className="sr-only">
                                  {t('business.register.services.presetsSearchLabel')}
                                </span>
                                <Search
                                  className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                                  aria-hidden="true"
                                />
                                <input
                                  id="suggested-service-search"
                                  type="search"
                                  value={servicePresetQuery}
                                  onChange={(event) => setServicePresetQuery(event.target.value)}
                                  placeholder={t(
                                    'business.register.services.presetsSearchPlaceholder',
                                  )}
                                  className="min-h-11 w-full rounded-lg border border-border bg-surface pe-10 ps-3 text-sm text-text outline-none placeholder:text-muted focus:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                                />
                              </label>
                              <div className="flex items-center justify-between gap-3 text-xs text-muted">
                                <span>
                                  {t('business.register.services.presetsCount', {
                                    count: toPersianDigits(filteredServicePresets.length),
                                  })}
                                </span>
                                <span className="font-medium text-primary" role="status">
                                  {t('business.register.services.selectedCount', {
                                    count: toPersianDigits(services.length),
                                  })}
                                </span>
                              </div>
                            </div>

                            <div
                              className="min-h-0 flex-1 overflow-y-auto px-5 pb-4"
                              data-testid="suggested-services-list"
                            >
                              {filteredServicePresets.length > 0 ? (
                                <div className="flex flex-col gap-2">
                                  {(servicePresetQuery || showAllPresets
                                    ? filteredServicePresets
                                    : filteredServicePresets.slice(0, 6)
                                  ).map((preset) => {
                                    const checked = services.some(
                                      (service) => service.key === `preset-${preset.key}`,
                                    );
                                    return (
                                      <button
                                        key={preset.key}
                                        type="button"
                                        aria-pressed={checked}
                                        onClick={() => handleTogglePresetService(preset)}
                                        className={cn(
                                          'flex min-h-12 items-center gap-3 rounded-xl border px-3 text-start text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                                          checked
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-border bg-elevated text-text hover:border-primary/40',
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            'flex size-5 shrink-0 items-center justify-center rounded-full border',
                                            checked
                                              ? 'border-primary bg-primary text-primary-contrast'
                                              : 'border-border text-transparent',
                                          )}
                                          aria-hidden="true"
                                        >
                                          {checked && <Check className="size-3.5" />}
                                        </span>
                                        <span className="min-w-0 flex-1">{preset.label}</span>
                                      </button>
                                    );
                                  })}
                                  {!servicePresetQuery && filteredServicePresets.length > 6 && (
                                    <button
                                      type="button"
                                      className="min-h-11 rounded-lg px-3 text-sm font-medium text-primary transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                                      onClick={() => setShowAllPresets((value) => !value)}
                                    >
                                      {showAllPresets
                                        ? t('business.register.services.showLess')
                                        : t('business.register.services.showAll', {
                                            count: toPersianDigits(filteredServicePresets.length),
                                          })}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <p
                                  className="rounded-xl border border-dashed border-border p-4 text-center text-sm leading-6 text-muted"
                                  role="status"
                                >
                                  {t('business.register.services.presetsNoResults')}
                                </p>
                              )}
                            </div>

                            <footer className="shrink-0 border-t border-border px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:pb-4">
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="md"
                                  startIcon={<Plus className="size-4" aria-hidden="true" />}
                                  onClick={openCustomServiceForm}
                                  className="min-w-0 flex-1"
                                >
                                  {t('business.register.services.customCta')}
                                </Button>
                                <Button
                                  type="button"
                                  size="md"
                                  onClick={closeServiceSheet}
                                  className="min-w-0 flex-1"
                                >
                                  {t('business.register.services.done')}
                                </Button>
                              </div>
                            </footer>
                          </div>
                        )}

                        {serviceSheetMode === 'custom' && (
                          <form
                            className="flex min-h-0 flex-1 flex-col"
                            data-testid="add-service-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              handleAddService();
                            }}
                          >
                            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
                              <TextField
                                id="svcName"
                                label={t('business.register.services.nameLabel')}
                                placeholder={t('business.register.services.namePlaceholder')}
                                value={svcName}
                                onChange={(event) => setSvcName(event.target.value)}
                                autoFocus
                              />
                              <DurationStepper
                                label={t('business.register.services.durationLabel')}
                                ariaLabel={t('business.register.services.durationLabel')}
                                value={svcDuration}
                                onChange={setSvcDuration}
                                step={15}
                                allowEmpty
                              />
                              <TextField
                                id="svcPrice"
                                label={t('business.register.services.priceLabel')}
                                inputMode="numeric"
                                dir="ltr"
                                placeholder="۵۰۰۰۰۰"
                                value={svcPrice}
                                onChange={(event) =>
                                  setSvcPrice(formatPriceInput(event.target.value))
                                }
                              />
                              {svcError && (
                                <p className="text-sm text-danger" role="alert">
                                  {svcError}
                                </p>
                              )}
                            </div>
                            <footer className="shrink-0 border-t border-border px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:pb-4">
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="md"
                                  onClick={openServiceCatalog}
                                  className="min-w-0 flex-1"
                                >
                                  {t('business.register.services.backToCatalog')}
                                </Button>
                                <Button type="submit" size="md" className="min-w-0 flex-1">
                                  {t('business.register.services.addCta')}
                                </Button>
                              </div>
                            </footer>
                          </form>
                        )}

                        {serviceSheetMode === 'edit' && editingService && (
                          <form
                            className="flex min-h-0 flex-1 flex-col"
                            data-testid={`edit-service-${editingService.key}`}
                            onSubmit={(event) => {
                              event.preventDefault();
                              handleSaveService();
                            }}
                          >
                            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
                              <TextField
                                id="edit-svc-name"
                                label={t('business.register.services.nameLabel')}
                                value={editingService.name}
                                onChange={(event) =>
                                  setEditingService((current) =>
                                    current ? { ...current, name: event.target.value } : current,
                                  )
                                }
                                autoFocus
                              />
                              <DurationStepper
                                label={t('business.register.services.durationLabel')}
                                ariaLabel={t('business.register.services.durationLabel')}
                                value={editingService.duration}
                                onChange={(value) =>
                                  setEditingService((current) =>
                                    current ? { ...current, duration: value } : current,
                                  )
                                }
                                step={15}
                                allowEmpty
                              />
                              <TextField
                                id="edit-svc-price"
                                label={t('business.register.services.priceLabel')}
                                inputMode="numeric"
                                dir="ltr"
                                value={editingService.price}
                                onChange={(event) =>
                                  setEditingService((current) =>
                                    current
                                      ? {
                                          ...current,
                                          price: formatPriceInput(event.target.value),
                                        }
                                      : current,
                                  )
                                }
                              />
                              {serviceEditError && (
                                <p className="text-sm text-danger" role="alert">
                                  {serviceEditError}
                                </p>
                              )}
                            </div>
                            <footer className="shrink-0 border-t border-border px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:pb-4">
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="md"
                                  onClick={closeServiceSheet}
                                  className="min-w-0 flex-1"
                                >
                                  {t('business.register.services.cancel')}
                                </Button>
                                <Button type="submit" size="md" className="min-w-0 flex-1">
                                  {t('business.register.services.save')}
                                </Button>
                              </div>
                            </footer>
                          </form>
                        )}
                      </SheetContent>
                    </Sheet>
                  </div>
                )}

                {step === 'otp' && (
                  <form
                    className="flex flex-col gap-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleVerifyOtp();
                    }}
                  >
                    <fieldset className="m-0 border-0 p-0">
                      <legend className="mb-3 block text-sm font-semibold text-text">
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
                            maxLength={index === 0 ? otpLength : 1}
                            aria-label={t('auth.otpDigitLabel', {
                              index: toPersianDigits(index + 1),
                            })}
                            value={digit}
                            onChange={(e) => handleOtpChange(index, e)}
                            onPaste={(e) => handleOtpPaste(index, e)}
                            onKeyDown={(e) => handleOtpKeyDown(index, e)}
                            className={cn(
                              'h-14 w-14 rounded-xl border bg-bg text-center text-xl font-bold text-text sm:h-16 sm:w-16',
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
            {step !== 'otp' && (
              <p className="mt-6 shrink-0 pb-1 text-center text-sm text-muted">
                {t('business.register.haveAccount')}{' '}
                <Link
                  to="/auth"
                  className="inline-flex min-h-10 items-center px-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {t('business.register.signIn')}
                </Link>
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

interface BusinessProfile {
  key: string;
  icon: React.ComponentType<CategoryIconProps>;
}

interface SuggestedService {
  key: string;
  label: string;
}

const BUSINESS_PROFILES: readonly BusinessProfile[] = [
  {
    key: 'barber',
    icon: BarberIcon,
  },
  {
    key: 'hair_salon',
    icon: HaircutIcon,
  },
  {
    key: 'nails',
    icon: NailsIcon,
  },
  {
    key: 'brows_lashes',
    icon: BrowsIcon,
  },
  {
    key: 'makeup',
    icon: MakeupIcon,
  },
  {
    key: 'spa',
    icon: SkinIcon,
  },
  {
    key: 'tattoo',
    icon: TattooIcon,
  },
] as const;

/** Quick-add service presets adapt to every selected business profile. */
const SERVICE_PRESETS_BY_PROFILE: Record<string, readonly string[]> = {
  hair_salon: [
    'haircut',
    'color',
    'highlights',
    'blowout',
    'bridal',
    'hair_treatment',
    'keratin',
    'hair_extension',
    'updo',
    'root_touch_up',
  ],
  barber: [
    'mens_haircut',
    'beard',
    'fade',
    'classic_shave',
    'kids_haircut',
    'hair_wash',
    'styling',
    'gray_blending',
  ],
  nails: [
    'manicure',
    'pedicure',
    'nail_art',
    'extensions',
    'gel_polish',
    'nail_repair',
    'french_design',
    'polish_removal',
  ],
  brows_lashes: [
    'brows',
    'lash_lift',
    'lash_extension',
    'brow_lamination',
    'brow_tint',
    'lash_tint',
    'lash_repair',
  ],
  makeup: [
    'makeup',
    'bridal_makeup',
    'skin_prep',
    'party_makeup',
    'makeup_lesson',
    'hair_styling',
    'makeup_touchup',
  ],
  spa: [
    'massage',
    'facial',
    'spa',
    'deep_cleaning',
    'skin_care',
    'body_scrub',
    'aromatherapy',
    'waxing',
  ],
  tattoo: [
    'tattoo',
    'microblading',
    'piercing',
    'tattoo_touchup',
    'tattoo_design',
    'tattoo_coverup',
    'piercing_change',
  ],
};
/** Bottom navigation for an onboarding step. */
function StepNav({
  onBack,
  onNext,
  nextLabel,
  backLabel,
  nextDisabled,
  loading,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  backLabel: string;
  nextDisabled?: boolean;
  loading?: boolean;
}) {
  return (
    <div
      className={cn(
        'register-step-nav-shell',
        onBack && 'has-secondary',
      )}
    >
      <div className="register-step-nav flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          size="lg"
          onClick={onNext}
          loading={loading}
          disabled={nextDisabled || loading}
          className="sm:min-w-44"
        >
          {nextLabel}
        </Button>
        {onBack && (
          <div className="flex items-center justify-between gap-2 sm:min-w-0">
            <Button
              type="button"
              variant="ghost"
              size="md"
              // RTL-native: back affordance intentionally points visually right.
              startIcon={<ArrowRight className="h-4 w-4" />}
              onClick={onBack}
            >
              {backLabel}
            </Button>
          </div>
        )}
      </div>
      <div className="register-step-nav-spacer" aria-hidden="true" />
    </div>
  );
}

export default RegisterSalonPage;
