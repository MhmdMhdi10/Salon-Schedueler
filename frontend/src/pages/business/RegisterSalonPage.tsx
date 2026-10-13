import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
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
import { BrandLogo } from '../../components/brand';
import { ThemeToggle } from '../../components/theme/ThemeToggle';
import {
  Button,
  DurationStepper,
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
  OnboardingSecurityIcon,
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
const STEP_ORDER: readonly Step[] = [
  'category',
  'info',
  'services',
  'otp',
] as const;

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
 *   1. حوزه کاری — business type + primary specialty
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
  const [specialties, setSpecialties] = useState<string[]>([]);

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
  const [servicePage, setServicePage] = useState(0);

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
  };

  const handleTogglePresetService = (preset: SuggestedService) => {
    const key = `preset-${preset.key}`;
    const name = preset.label;
    const existing = services.find((service) => service.key === key);
    if (existing) {
      if (editingService?.key === existing.key) cancelEditingService();
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
  };

  const cancelEditingService = () => {
    setEditingService(null);
    setServiceEditError('');
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
    cancelEditingService();
  };

  const handleRemoveService = (key: string) => {
    if (editingService?.key === key) cancelEditingService();
    setServices((prev) => prev.filter((s) => s.key !== key));
  };

  const suggestedServices = useMemo(() => {
    const profileKeys = categories.length > 0 ? categories : ['hair_salon'];
    const keys = profileKeys.flatMap((profileKey) => SERVICE_PRESETS_BY_PROFILE[profileKey] ?? []);
    return [...new Set(keys)].map((key) => {
      const specialty = BUSINESS_PROFILES.flatMap((profile) => profile.specialties).find(
        (item) => item.key === key,
      );
      return {
        key,
        label: t(`business.register.services.presets.${key}`, {
          defaultValue: specialty?.label ?? key,
        }),
      };
    });
  }, [categories, t]);
  const filteredServicePresets = useMemo(() => {
    const query = servicePresetQuery.trim().toLocaleLowerCase('fa-IR');
    if (!query) return suggestedServices;
    return suggestedServices.filter((service) =>
      service.label.toLocaleLowerCase('fa-IR').includes(query),
    );
  }, [servicePresetQuery, suggestedServices]);
  const visibleServices = services.slice(
    servicePage * ONBOARDING_SERVICE_PAGE_SIZE,
    (servicePage + 1) * ONBOARDING_SERVICE_PAGE_SIZE,
  );

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
          specialties,
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
        <div className="relative mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-2 px-3 sm:gap-5 sm:px-4">
          <Link
            to="/"
            aria-label="آرا"
            className="inline-flex min-h-10 shrink-0 items-center no-underline"
          >
            <BrandLogo className="h-9" />
          </Link>
          <div
            className="register-step-progress pointer-events-none absolute inset-0 flex items-center justify-center"
            role="group"
            aria-label={t('business.register.progressLabel')}
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

      <div className="register-form-content mx-auto flex w-full max-w-2xl flex-1 flex-col px-3 py-6 sm:px-4 sm:py-10">
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
              مرحله {toPersianDigits(stepIndex + 1)} از {toPersianDigits(STEP_ORDER.length)}
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
            <p className="mt-2 text-sm text-muted">
              {step === 'category'
                ? t('business.register.category.subtitle')
                : step === 'info'
                  ? t('business.register.info.subtitle')
                  : step === 'services'
                    ? t('business.register.services.subtitle')
                    : t('business.register.subtitle')}
            </p>

            {step === 'category' ? (
              <section className="flex flex-col pt-8">
                <div className="grid gap-3 sm:grid-cols-2">
                  {BUSINESS_PROFILES.map((profile) => {
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
                          setSpecialties((previous) => {
                            const allowed = nextCategories.flatMap(
                              (key) =>
                                BUSINESS_PROFILES.find((item) => item.key === key)?.specialties.map(
                                  (item) => item.key,
                                ) ?? [],
                            );
                            const retained = previous.filter((key) => allowed.includes(key));
                            const defaultSpecialty = !selected
                              ? profile.specialties[0]?.key
                              : undefined;
                            return defaultSpecialty && !retained.includes(defaultSpecialty)
                              ? [...retained, defaultSpecialty]
                              : retained;
                          });
                        }}
                        aria-pressed={selected}
                        data-testid={`business-type-${profile.key}`}
                        className={cn(
                          'flex min-h-[5.25rem] items-center gap-3 rounded-xl border-2 bg-elevated px-4 text-start text-text transition-colors duration-fast',
                          selected ? 'border-primary bg-primary/5' : 'border-border',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary',
                            selected && 'bg-primary text-primary-contrast',
                          )}
                        >
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="font-bold">{profile.label}</span>
                          <span className="text-xs leading-5 text-muted">
                            {profile.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <StepNav
                  onBack={() => navigate('/')}
                  onNext={() => setStep('info')}
                  onSkip={() => setStep('info')}
                  nextLabel={t('business.register.next')}
                  skipLabel={t('business.register.skip')}
                  backLabel={t('business.register.back')}
                  nextDisabled={categories.length === 0}
                />
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
                    <Button type="submit" size="lg" fullWidth>
                      {t('business.register.next')}
                    </Button>
                    <div className="flex justify-start">
                      <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        startIcon={
                          <ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
                        }
                        onClick={() => setStep('category')}
                      >
                        {t('business.register.back')}
                      </Button>
                    </div>
                  </form>
                )}

                {step === 'services' && (
                  <div className="flex flex-col gap-4" data-testid="register-services-step">
                    <form
                      className="rounded-xl border border-primary/20 bg-elevated p-4"
                      data-testid="add-service-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        handleAddService();
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary">
                          <Plus className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-text">
                            {t('business.register.services.formTitle')}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted">
                            {t('business.register.services.formHelper')}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_8.5rem_9.5rem_auto] sm:items-end">
                        <div className="col-span-2 min-w-0 sm:col-span-1">
                          <TextField
                            id="svcName"
                            label={t('business.register.services.nameLabel')}
                            placeholder={t('business.register.services.namePlaceholder')}
                            value={svcName}
                            onChange={(e) => setSvcName(e.target.value)}
                          />
                        </div>
                        <DurationStepper
                          label={
                            <span className="whitespace-nowrap">
                              {t('business.register.services.durationLabel')}
                            </span>
                          }
                          ariaLabel={t('business.register.services.durationLabel')}
                          value={svcDuration}
                          onChange={setSvcDuration}
                          step={15}
                          allowEmpty
                          className="min-w-0 w-full"
                        />
                        <TextField
                          id="svcPrice"
                          label={
                            <span className="whitespace-nowrap">
                              {t('business.register.services.priceLabel')}
                            </span>
                          }
                          inputMode="numeric"
                          dir="ltr"
                          placeholder="۵۰۰۰۰۰"
                          className="min-h-14"
                          containerClassName="min-w-0 w-full"
                          value={svcPrice}
                          onChange={(e) => setSvcPrice(formatPriceInput(e.target.value))}
                        />
                        <Button
                          type="submit"
                          variant="secondary"
                          startIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                          className="col-span-2 w-full sm:col-span-1 sm:w-auto"
                        >
                          {t('business.register.services.addCta')}
                        </Button>
                      </div>
                      {svcError && (
                        <p
                          className="mt-3 flex items-center gap-1 text-sm text-danger"
                          role="alert"
                        >
                          {svcError}
                        </p>
                      )}
                    </form>

                    <div className="rounded-xl border border-border bg-bg p-3">
                      <div className="flex shrink-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-text">
                            {t('business.register.services.presetsLabel')}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {t('business.register.services.presetsHelper')}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted">
                          {t('business.register.services.presetsCount', {
                            count: toPersianDigits(filteredServicePresets.length),
                          })}
                        </span>
                      </div>
                      <label className="relative mt-3 block shrink-0">
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
                          placeholder={t('business.register.services.presetsSearchPlaceholder')}
                          className="min-h-11 w-full rounded-lg border border-border bg-elevated pe-10 ps-3 text-sm text-text outline-none placeholder:text-muted focus:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                        />
                      </label>
                      <div
                        className="mt-3 pe-1"
                        data-testid="suggested-services-list"
                      >
                        {filteredServicePresets.length > 0 ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {(servicePresetQuery || showAllPresets ? filteredServicePresets : filteredServicePresets.slice(0, 6)).map((preset) => {
                              const name = preset.label;
                              const checked = services.some(
                                (service) => service.key === `preset-${preset.key}`,
                              );
                              return (
                                <label
                                  key={preset.key}
                                  className={cn(
                                    'flex min-h-16 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm sm:min-h-11',
                                    checked
                                      ? 'border-primary bg-primary/5 text-primary'
                                      : 'border-border text-text',
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => handleTogglePresetService(preset)}
                                    className="size-4 accent-primary"
                                  />
                                  <span>{name}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <p
                            className="rounded-lg border border-dashed border-border p-4 text-center text-xs leading-5 text-muted"
                            role="status"
                          >
                            {t('business.register.services.presetsNoResults')}
                          </p>
                        )}
                      </div>
                      {!servicePresetQuery && filteredServicePresets.length > 6 && (
                        <button type="button" className="mt-3 min-h-11 text-sm font-semibold text-primary" onClick={() => setShowAllPresets((value) => !value)}>
                          {showAllPresets ? 'نمایش کمتر' : `نمایش همهٔ ${toPersianDigits(filteredServicePresets.length)} خدمت`}
                        </button>
                      )}
                    </div>

                    {services.length > 0 && (
                      <ul
                        className="flex flex-col gap-2"
                        aria-label={t('business.register.services.listLabel')}
                      >
                        {visibleServices.map((s) => (
                          <li key={s.key} className="rounded-md border border-border bg-bg p-3">
                            {editingService?.key === s.key ? (
                              <form
                                className="flex flex-col gap-3"
                                data-testid={`edit-service-${s.key}`}
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  handleSaveService();
                                }}
                              >
                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8.5rem_9.5rem]">
                                  <TextField
                                    id={`edit-svc-name-${s.key}`}
                                    label={t('business.register.services.nameLabel')}
                                    value={editingService.name}
                                    onChange={(event) =>
                                      setEditingService((current) =>
                                        current
                                          ? { ...current, name: event.target.value }
                                          : current,
                                      )
                                    }
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
                                    id={`edit-svc-price-${s.key}`}
                                    label={t('business.register.services.priceLabel')}
                                    inputMode="numeric"
                                    dir="ltr"
                                    className="min-h-14"
                                    value={editingService.price}
                                    onChange={(event) =>
                                      setEditingService((current) =>
                                        current
                                          ? { ...current, price: formatPriceInput(event.target.value) }
                                          : current,
                                      )
                                    }
                                  />
                                </div>
                                {serviceEditError && (
                                  <p
                                    className="flex items-center gap-1 text-sm text-danger"
                                    role="alert"
                                  >
                                    {serviceEditError}
                                  </p>
                                )}
                                <div className="flex flex-wrap justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="md"
                                    startIcon={<X className="h-4 w-4" aria-hidden="true" />}
                                    onClick={cancelEditingService}
                                  >
                                    {t('business.register.services.cancel')}
                                  </Button>
                                  <Button
                                    type="submit"
                                    size="md"
                                    startIcon={<Check className="h-4 w-4" aria-hidden="true" />}
                                  >
                                    {t('business.register.services.save')}
                                  </Button>
                                </div>
                              </form>
                            ) : (
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <span className="flex min-w-0 flex-col">
                                  <span className="text-sm font-medium text-text">{s.name}</span>
                                  <span className="text-xs text-muted">
                                    {t('business.register.services.summary', {
                                      minutes: toPersianDigits(s.durationMinutes ?? 30),
                                      price: toPersianDigits(
                                        (s.priceRial ?? 0).toLocaleString('en-US'),
                                      ),
                                    })}
                                  </span>
                                </span>
                                <div className="flex shrink-0 items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="md"
                                    startIcon={<Pencil className="h-4 w-4" aria-hidden="true" />}
                                    aria-label={t('business.register.services.edit', {
                                      name: s.name,
                                    })}
                                    onClick={() => startEditingService(s)}
                                  >
                                    {t('business.register.services.editAction')}
                                  </Button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveService(s.key)}
                                    aria-label={t('business.register.services.remove', {
                                      name: s.name,
                                    })}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors duration-fast ease-standard hover:bg-surface hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {services.length > ONBOARDING_SERVICE_PAGE_SIZE && (
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="md"
                          disabled={servicePage === 0}
                          onClick={() => setServicePage((page) => Math.max(0, page - 1))}
                        >
                          قبلی
                        </Button>
                        <span className="text-xs text-muted">
                          {toPersianDigits(
                            `${servicePage + 1}/${Math.ceil(services.length / ONBOARDING_SERVICE_PAGE_SIZE)}`,
                          )}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="md"
                          disabled={
                            servicePage >=
                            Math.ceil(services.length / ONBOARDING_SERVICE_PAGE_SIZE) - 1
                          }
                          onClick={() =>
                            setServicePage((page) =>
                              Math.min(
                                Math.ceil(services.length / ONBOARDING_SERVICE_PAGE_SIZE) - 1,
                                page + 1,
                              ),
                            )
                          }
                        >
                          بعدی
                        </Button>
                      </div>
                    )}

                    {services.length === 0 && (
                      <p className="text-xs leading-5 text-muted" role="status">
                        {t('business.register.services.emptyHint')}
                      </p>
                    )}

                    {submitError && <p className="text-sm text-danger" role="alert">{submitError}</p>}

                    <StepNav
                      onBack={() => setStep('info')}
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
                      icon={<OnboardingSecurityIcon className="h-5 w-5" aria-hidden="true" />}
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
                            autoComplete="off"
                            dir="ltr"
                            maxLength={1}
                            aria-label={t('auth.otpDigitLabel', {
                              index: toPersianDigits(index + 1),
                            })}
                            value={digit}
                            onChange={(e) => handleOtpChange(index, e)}
                            onPaste={(e) => handleOtpPaste(index, e)}
                            onKeyDown={(e) => handleOtpKeyDown(index, e)}
                            className={cn(
                              'h-12 rounded-md border bg-bg text-center text-lg font-bold text-text',
                              otpLength > 6 ? 'w-9' : 'w-11',
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
  label: string;
  description: string;
  icon: React.ComponentType<CategoryIconProps>;
  specialties: readonly { key: string; label: string }[];
}

interface SuggestedService {
  key: string;
  label: string;
}

const BUSINESS_PROFILES: readonly BusinessProfile[] = [
  {
    key: 'barber',
    label: 'آرایشگاه مردانه',
    description: 'کوتاهی، اصلاح و استایل آقایان',
    icon: BarberIcon,
    specialties: [
      { key: 'mens_haircut', label: 'کوتاهی مردانه' },
      { key: 'beard', label: 'اصلاح صورت و ریش' },
      { key: 'fade', label: 'فید و استایل' },
    ],
  },
  {
    key: 'hair_salon',
    label: 'سالن مو و زیبایی',
    description: 'مو، رنگ، براشینگ و خدمات زیبایی',
    icon: HaircutIcon,
    specialties: [
      { key: 'haircut', label: 'کوتاهی مو' },
      { key: 'color', label: 'رنگ و مش' },
      { key: 'blowout', label: 'براشینگ' },
      { key: 'bridal', label: 'شینیون و عروس' },
    ],
  },
  {
    key: 'nails',
    label: 'ناخن',
    description: 'مانیکور، پدیکور و طراحی ناخن',
    icon: NailsIcon,
    specialties: [
      { key: 'manicure', label: 'مانیکور' },
      { key: 'pedicure', label: 'پدیکور' },
      { key: 'nail_art', label: 'طراحی ناخن' },
      { key: 'extensions', label: 'کاشت و ترمیم' },
    ],
  },
  {
    key: 'brows_lashes',
    label: 'ابرو و مژه',
    description: 'زیبایی چشم و فرم‌دهی ابرو',
    icon: BrowsIcon,
    specialties: [
      { key: 'brows', label: 'اصلاح و قرینه‌سازی ابرو' },
      { key: 'lash_lift', label: 'لیفت مژه' },
      { key: 'lash_extension', label: 'اکستنشن مژه' },
    ],
  },
  {
    key: 'makeup',
    label: 'میکاپ و گریم',
    description: 'میکاپ روز، مجلسی و عروس',
    icon: MakeupIcon,
    specialties: [
      { key: 'makeup', label: 'میکاپ' },
      { key: 'bridal_makeup', label: 'میکاپ عروس' },
      { key: 'skin_prep', label: 'پاکسازی و آماده‌سازی پوست' },
    ],
  },
  {
    key: 'spa',
    label: 'اسپا و سلامت',
    description: 'ماساژ، مراقبت پوست و آرامش',
    icon: SkinIcon,
    specialties: [
      { key: 'massage', label: 'ماساژ' },
      { key: 'facial', label: 'فیشال و مراقبت پوست' },
      { key: 'spa', label: 'اسپا' },
    ],
  },
  {
    key: 'tattoo',
    label: 'تتو و پیرسینگ',
    description: 'تتو، میکروپیگمنتیشن و پیرسینگ',
    icon: TattooIcon,
    specialties: [
      { key: 'tattoo', label: 'تتو' },
      { key: 'microblading', label: 'میکروبلیدینگ' },
      { key: 'piercing', label: 'پیرسینگ' },
    ],
  },
] as const;

function specialtyLabels(categories: string[], keys: string[]): string {
  const labels = BUSINESS_PROFILES.filter((item) => categories.includes(item.key))
    .flatMap((item) => item.specialties)
    .filter((item) => keys.includes(item.key))
    .map((item) => item.label);
  return labels.join('، ') || '—';
}

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
const ONBOARDING_SERVICE_PAGE_SIZE = 5;

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

/** Bottom navigation for an onboarding step: primary next + (back · optional skip). */
function StepNav({
  onBack,
  onNext,
  onSkip,
  nextLabel,
  skipLabel,
  backLabel,
  nextDisabled,
  loading,
}: {
  onBack?: () => void;
  onNext: () => void;
  onSkip?: () => void;
  nextLabel: string;
  skipLabel?: string;
  backLabel: string;
  nextDisabled?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="register-step-nav-shell">
      <div className="register-step-nav flex flex-col gap-3 pt-1">
        <Button
          type="button"
          size="lg"
          fullWidth
          onClick={onNext}
          loading={loading}
          disabled={nextDisabled || loading}
        >
          {nextLabel}
        </Button>
        <div className="flex items-center justify-between gap-2">
          {onBack ? (
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
          ) : (
            <span aria-hidden="true" />
          )}
          {onSkip && skipLabel ? (
            <Button type="button" variant="ghost" size="md" onClick={onSkip} disabled={loading}>
              {skipLabel}
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>
      </div>
      <div className="register-step-nav-spacer" aria-hidden="true" />
    </div>
  );
}

export default RegisterSalonPage;
