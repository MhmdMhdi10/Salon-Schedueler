import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { normalizeDigits } from '@salon/shared';
import {
  authApi,
  customerApi,
  registrationApi,
  setAccessToken,
  type RegisterSalonServiceInput,
  type RegisterSalonResponse,
} from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { SeoHead } from '../../components/seo';
import { BrandLogo } from '../../components/brand';
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

/** Keep a visible scroll thumb in sync on iOS, where native scrollbars fade away. */
function syncScrollRail(element: HTMLElement | null) {
  if (!element) return;
  const frame = element.parentElement;
  if (!frame?.classList.contains('register-scroll-frame')) return;

  const viewport = element.clientHeight;
  if (viewport <= 0 || element.scrollHeight <= 0) {
    frame.dataset.scrollable = 'false';
    return;
  }
  const range = element.scrollHeight - viewport;
  const thumbHeight = Math.min(viewport, Math.max(24, (viewport * viewport) / element.scrollHeight));
  frame.dataset.scrollable = range > 1 ? 'true' : 'false';
  frame.style.setProperty('--scroll-thumb-height', `${thumbHeight}px`);
  frame.style.setProperty(
    '--scroll-thumb-top',
    `${range > 0 ? ((viewport - thumbHeight) * element.scrollTop) / range : 0}px`,
  );
}

/**
 * Salon self-registration wizard at `/business/register` (the owner-acquisition
 * onboarding). A short, skippable questionnaire that provisions the salon and
 * lands the owner straight in their panel:
 *
 *   1. حوزه کاری — business type, used to tailor service suggestions
 *   2. مشخصات — salon name + owner name + phone
 *   3. خدمات — choose services and optionally refine duration and price
 *   4. ورود — verify the phone, then create the salon under that identity
 *
 * On submit it sends an OTP. Only after the phone is verified does it create
 * the salon, its Owner membership, free trial, and the answered services.
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
  const [otpVerified, setOtpVerified] = useState(false);
  const [registeredSalon, setRegisteredSalon] = useState<RegisterSalonResponse | null>(null);
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
  const serviceSheetTitleRef = useRef<HTMLHeadingElement | null>(null);
  const selectedServicesRef = useRef<HTMLUListElement | null>(null);
  const suggestedServicesRef = useRef<HTMLDivElement | null>(null);
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
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.scrollLeft = 0;
      mainContent.scrollTop = 0;
    }
    const formContent = document.querySelector<HTMLElement>('.register-form-content');
    if (formContent) {
      formContent.scrollLeft = 0;
      formContent.scrollTop = 0;
    }
    window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
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
    const returningFromCustom = serviceSheetMode === 'custom';
    setServiceSheetMode('catalog');
    if (returningFromCustom) {
      window.requestAnimationFrame(() => serviceSheetTitleRef.current?.focus({ preventScroll: true }));
    }
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
    closeServiceSheet();
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

  useEffect(() => {
    const scrollAreas = [selectedServicesRef.current, suggestedServicesRef.current].filter(
      (element): element is HTMLUListElement | HTMLDivElement => element !== null,
    );
    const update = () => scrollAreas.forEach(syncScrollRail);
    const frame = window.requestAnimationFrame(update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    scrollAreas.forEach((element) => observer?.observe(element));
    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [services.length, serviceSheetMode, filteredServicePresets.length, servicePresetQuery, showAllPresets]);
  // ── Request OTP before any salon data is created ─────────────────────────
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
    try {
      const response = await authApi.requestOtp(normalizedPhone);
      setOtpVerified(false);
      setRegisteredSalon(null);
      applyOtpResponse(response);
      setStep('otp');
      setSecondsLeft(RESEND_SECONDS);
      success({ title: t('auth.otpSent') });
      window.setTimeout(() => otpRefs.current[0]?.focus(), 0);
    } catch {
      setSubmitError(t('business.register.errors.requestFailed'));
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
    let identityVerified = otpVerified;
    try {
      if (!identityVerified) {
        const result = await authApi.verifyOtp(normalizedPhone, codeValue);
        setAccessToken(result.accessToken);
        setOtpVerified(true);
        identityVerified = true;
      }

      let salon = registeredSalon;
      if (!salon) {
        salon = await registrationApi.registerSalon({
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
        setRegisteredSalon(salon);
      }

      const contexts = await authApi.getContexts();
      const ownerContext = contexts.staffContexts.find(
        (context) => context.salonId === salon?.salonId && context.role === 'Owner',
      );
      if (!ownerContext) throw new Error('Owner membership was not created');
      const scopedSession = await authApi.selectContext(ownerContext.staffMemberId);
      setAccessToken(scopedSession.accessToken);
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
      setOtpError(
        identityVerified
          ? t('business.register.errors.generic')
          : t('business.register.errors.invalidOtp'),
      );
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

      <div
        className="register-form-content mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-7 sm:px-8 sm:py-10"
        data-register-step={step}
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={step}
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={
              prefersReducedMotion ? { duration: 0 } : { duration: 0.22, ease: [0.2, 0, 0, 1] }
            }
            className={cn('min-w-0', step === 'category' && 'register-category-motion')}
          >
            <div className="register-step-topbar flex min-h-11 items-center justify-between">
              {step === 'info' || step === 'services' ? (
                <IconButton
                  type="button"
                  aria-label={t('business.register.back')}
                  title={t('business.register.back')}
                  onClick={() => setStep(step === 'info' ? 'category' : 'info')}
                  className="rounded-full text-muted hover:text-text"
                >
                  <ArrowRight className="size-5" />
                </IconButton>
              ) : (
                <span className="size-11" aria-hidden="true" />
              )}
              <p className="register-step-count text-sm font-medium text-primary">
                {t('business.register.progress', {
                  current: toPersianDigits(stepIndex + 1),
                  total: toPersianDigits(STEP_ORDER.length),
                })}
              </p>
            </div>
            <h1
              className={cn(
                'register-step-title mt-3 text-2xl leading-display text-display text-text',
                step === 'category' && 'register-category-title',
              )}
            >
              {step === 'category'
                ? t('business.register.category.title')
                : step === 'info'
                  ? t('business.register.info.title')
                  : step === 'services'
                    ? t('business.register.services.title')
                    : t('business.register.verify.title')}
            </h1>
            <p
              className={cn(
                'register-step-subtitle mt-2 max-w-[38rem] text-sm leading-6 text-muted',
                step === 'category' && 'register-category-subtitle',
              )}
            >
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
              <section className="register-category-step flex flex-col pt-7">
                <p className="register-category-hint mb-3 text-sm text-muted">
                  {t('business.register.category.selectionHint')}
                </p>
                <div className="register-category-grid grid grid-cols-2 gap-2 sm:gap-3">
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
                          'register-category-option flex min-h-12 items-center gap-1.5 rounded-lg border px-2 py-2 text-start text-text transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-[4.5rem] sm:gap-3 sm:rounded-xl sm:px-4 sm:py-3',
                          selected
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-elevated hover:border-primary/50',
                          index === BUSINESS_PROFILES.length - 1 && 'register-category-option-last',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-7 shrink-0 items-center justify-center rounded-lg sm:size-9',
                            selected
                              ? 'bg-primary text-primary-contrast'
                              : 'bg-surface text-primary',
                          )}
                        >
                          <Icon className="size-[1.125rem]" aria-hidden="true" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-xs font-semibold leading-4 sm:text-sm sm:leading-normal">
                            {t(`business.register.category.profiles.${profile.key}.label`)}
                          </span>
                          <span className="hidden text-xs leading-5 text-muted sm:block">
                            {t(`business.register.category.profiles.${profile.key}.description`)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'flex size-5 shrink-0 items-center justify-center rounded-full border sm:size-6',
                            selected
                              ? 'border-primary bg-primary text-primary-contrast'
                              : 'border-border text-transparent',
                          )}
                          aria-hidden="true"
                        >
                          <Check className="size-3 sm:size-4" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : (
              <section className="register-step-section mt-8 flex flex-col gap-5">
                {step === 'info' && (
                  <form
                    id="register-info-form"
                    className="register-info-form grid gap-5 sm:grid-cols-2"
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
                  </form>
                )}

                {step === 'services' && (
                  <div
                    className="register-services-step flex flex-col gap-5"
                    data-testid="register-services-step"
                  >
                    <section className="register-services-card rounded-2xl border border-border bg-elevated p-4 sm:p-5">
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
                            aria-label={t('business.register.services.addCta')}
                            startIcon={<Plus className="size-4" aria-hidden="true" />}
                            onClick={openServiceCatalog}
                            className="shrink-0"
                          >
                            <span className="register-service-add-long">
                              {t('business.register.services.addCta')}
                            </span>
                            <span className="register-service-add-short">
                              {t('business.register.services.addCtaShort')}
                            </span>
                          </Button>
                        )}
                      </div>

                      {services.length === 0 ? (
                        <div className="register-services-empty mt-4 flex flex-col items-center rounded-xl border border-dashed border-border px-4 py-7 text-center">
                          <h3 className="register-services-empty-title text-sm font-semibold text-text">
                            {t('business.register.services.emptyTitle')}
                          </h3>
                          <p className="register-services-empty-hint mt-1 max-w-sm text-xs leading-5 text-muted">
                            {t('business.register.services.emptyHint')}
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            startIcon={<Plus className="size-4" aria-hidden="true" />}
                            onClick={openServiceCatalog}
                            className="register-services-empty-cta mt-4"
                          >
                            {t('business.register.services.addCta')}
                          </Button>
                        </div>
                      ) : (
                        <div className="register-scroll-frame mt-3">
                          <ul
                            ref={selectedServicesRef}
                            onScroll={(event) => syncScrollRail(event.currentTarget)}
                            className="register-services-list divide-y divide-border"
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
                          <span className="register-scroll-rail" aria-hidden="true">
                            <span className="register-scroll-thumb" />
                          </span>
                        </div>
                      )}
                    </section>

                    {submitError && (
                      <p className="text-sm text-danger" role="alert">
                        {submitError}
                      </p>
                    )}

                    <Sheet
                      open={serviceSheetMode !== null}
                      onOpenChange={(open) => {
                        if (!open) closeServiceSheet();
                      }}
                    >
                      <SheetContent
                        side="bottom"
                        className="mx-auto flex h-[min(90dvh,48rem)] max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden p-0 sm:rounded-t-2xl"
                        onOpenAutoFocus={(event) => {
                          if (serviceSheetMode === 'catalog') {
                            event.preventDefault();
                            serviceSheetTitleRef.current?.focus({ preventScroll: true });
                          }
                        }}
                      >
                        <header className="shrink-0 border-b border-border px-5 pb-4 pe-16 pt-6">
                          <span
                            className="mx-auto mb-4 block h-1 w-9 rounded-full bg-border sm:hidden"
                            aria-hidden="true"
                          />
                          <SheetTitle
                            ref={serviceSheetTitleRef}
                            tabIndex={-1}
                            className="text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                          >
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

                            <div className="register-scroll-frame min-h-0 flex-1">
                              <div
                                ref={suggestedServicesRef}
                                onScroll={(event) => syncScrollRail(event.currentTarget)}
                                className="register-suggested-services-list h-full min-h-0 overflow-y-auto px-5 pb-4"
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
                              <span className="register-scroll-rail" aria-hidden="true">
                                <span className="register-scroll-thumb" />
                              </span>
                            </div>

                            <footer className="shrink-0 border-t border-border px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:pb-4">
                              <div className="register-service-sheet-actions flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="md"
                                  aria-label={t('business.register.services.customCta')}
                                  startIcon={<Plus className="size-4" aria-hidden="true" />}
                                  onClick={openCustomServiceForm}
                                  className="min-w-0 flex-1 whitespace-nowrap px-2 sm:px-4"
                                >
                                  <span className="register-service-custom-short sm:hidden">
                                    {t('business.register.services.customCtaShort')}
                                  </span>
                                  <span className="register-service-custom-compact sm:hidden">
                                    {t('business.register.services.customCtaCompact')}
                                  </span>
                                  <span className="hidden sm:inline">
                                    {t('business.register.services.customCta')}
                                  </span>
                                </Button>
                                <Button
                                  type="button"
                                  size="md"
                                  onClick={closeServiceSheet}
                                  className="min-w-0 flex-1 whitespace-nowrap px-2 sm:px-4"
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
                              <div className="register-service-sheet-actions flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="md"
                                  aria-label={t('business.register.services.backToCatalog')}
                                  onClick={openServiceCatalog}
                                  className="min-w-0 flex-1 whitespace-nowrap px-2 sm:px-4"
                                >
                                  <span className="sm:hidden">
                                    {t('business.register.services.backToCatalogShort')}
                                  </span>
                                  <span className="hidden sm:inline">
                                    {t('business.register.services.backToCatalog')}
                                  </span>
                                </Button>
                                <Button
                                  type="submit"
                                  size="md"
                                  className="min-w-0 flex-1 whitespace-nowrap px-2 sm:px-4"
                                >
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
                    id="register-otp-form"
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
                            disabled={otpVerified}
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

                    {otpVerified && (
                      <p className="text-center text-sm text-success" role="status">
                        {t('business.register.verify.phoneVerified')}
                      </p>
                    )}

                    {!otpVerified && (
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
                    )}

                    {otpError && (
                      <p className="mt-1 flex items-center gap-1 text-sm text-danger" role="alert">
                        {otpError}
                      </p>
                    )}
                  </form>
                )}
              </section>
            )}

          </motion.div>
        </AnimatePresence>

        <StepNav
          showSignIn={step !== 'otp'}
          onNext={
            step === 'category'
              ? () => setStep('info')
              : step === 'services'
                ? () => void handleSubmit()
                : undefined
          }
          formId={
            step === 'info'
              ? 'register-info-form'
              : step === 'otp'
                ? 'register-otp-form'
                : undefined
          }
          nextLabel={
            step === 'services'
              ? t('business.register.submit')
              : step === 'otp'
                ? otpVerified
                  ? t('business.register.submit')
                  : t('business.register.verify.cta')
                : t('business.register.next')
          }
          nextDisabled={
            step === 'category' ? categories.length === 0 : step === 'otp' ? !codeIsComplete : undefined
          }
          loading={step === 'services' ? submitting : step === 'otp' ? otpLoading : undefined}
        />
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
  showSignIn,
  onNext,
  formId,
  nextLabel,
  nextDisabled,
  loading,
}: {
  showSignIn: boolean;
  onNext?: () => void;
  formId?: string;
  nextLabel: string;
  nextDisabled?: boolean;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn('register-step-nav-shell', showSignIn && 'has-sign-in')}>
      <div className="register-step-nav flex flex-col items-stretch gap-1 pt-1">
        {showSignIn && (
          <p className="register-have-account m-0 text-center text-xs text-muted">
            {t('business.register.haveAccount')}{' '}
            <Link
              to="/auth"
              className="inline-flex min-h-8 items-center px-1 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {t('business.register.signIn')}
            </Link>
          </p>
        )}
        <Button
          type={formId ? 'submit' : 'button'}
          form={formId}
          size="lg"
          onClick={formId ? undefined : onNext}
          loading={loading}
          disabled={nextDisabled || loading}
          className="min-w-0 flex-1 sm:min-w-44 sm:flex-none sm:self-start"
        >
          {nextLabel}
        </Button>
      </div>
      <div className="register-step-nav-spacer" aria-hidden="true" />
    </div>
  );
}

export default RegisterSalonPage;
