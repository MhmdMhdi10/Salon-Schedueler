import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Eye,
  Hand,
  Plus,
  Scissors,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { normalizeDigits } from '@salon/shared';
import {
  ApiError,
  authApi,
  registrationApi,
  setAccessToken,
  type RegisterSalonServiceInput,
} from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { SeoHead } from '../../components/seo';
import { BrandLogo } from '../../components/brand';
import { Button, Select, TextField, cn, toPersianDigits, useToast } from '../../components/ui';
import { ACCENTS, accentVars } from '../../components/theme/accents';

import './RegisterSalonPage.css';

/** Iranian mobile pattern: `09` followed by 9 digits (ui-ux §7). */
const PHONE_PATTERN = /^09\d{9}$/;
/** Number of digits in the SMS one-time code. */
const OTP_LENGTH = 6;
/** Resend cooldown in seconds — the «ارسال مجدد تا ۰:۴۵» timer (ui-ux §7). */
const RESEND_SECONDS = 45;

/** The visible onboarding steps, in order. `otp` is the final sign-in step. */
type Step = 'profile' | 'context' | 'category' | 'info' | 'services' | 'setup' | 'otp';
const STEP_ORDER: readonly Step[] = [
  'profile',
  'context',
  'category',
  'info',
  'services',
  'setup',
  'otp',
] as const;

type WorkMode = 'solo' | 'team' | 'salon' | 'starting';
type Workspace = 'fixed_salon' | 'rented_chair' | 'home' | 'mobile' | 'not_decided';
type TeamRange = '2_3' | '4_8' | '9_plus';
type MainGoal = 'online_booking' | 'calendar' | 'client_management' | 'all';

const WORKSPACES: readonly Workspace[] = [
  'fixed_salon',
  'rented_chair',
  'home',
  'mobile',
  'not_decided',
] as const;
const TEAM_RANGES: readonly TeamRange[] = ['2_3', '4_8', '9_plus'] as const;
const MAIN_GOALS: readonly MainGoal[] = [
  'online_booking',
  'calendar',
  'client_management',
  'all',
] as const;

const CHAIR_COUNT_BY_RANGE: Record<TeamRange, string> = {
  '2_3': '3',
  '4_8': '6',
  '9_plus': '10',
};

const WORK_MODES: readonly { key: WorkMode; icon: LucideIcon }[] = [
  { key: 'solo', icon: User },
  { key: 'team', icon: Users },
  { key: 'salon', icon: Store },
  { key: 'starting', icon: Sparkles },
] as const;

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
 *   1. شناخت مسیر — solo, team, salon owner, or starting out
 *   2. سؤال مرتبط — workspace or team size, based on the selected path
 *   3. حوزه کاری — business type + primary specialty (skippable)
 *   4. مشخصات    — salon name + owner name + phone (required)
 *   5. خدمات     — add the services the salon offers (skippable)
 *   6. راه‌اندازی — chairs + brand colour, then a summary + submit (skippable)
 *   7. ورود      — OTP sign-in with the phone just registered → owner panel
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
  const [searchParams] = useSearchParams();
  const referralToken = searchParams.get('referral')?.trim() || undefined;
  const { success } = useToast();
  const { refresh: refreshAuth } = useAuth();

  const [step, setStep] = useState<Step>('profile');
  const [workMode, setWorkMode] = useState<WorkMode | ''>('');
  const [workspace, setWorkspace] = useState<Workspace | ''>('');
  const [teamRange, setTeamRange] = useState<TeamRange | ''>('');
  const [mainGoal, setMainGoal] = useState<MainGoal | ''>('');
  const [category, setCategory] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);

  // Identity — required before provisioning the salon.
  const [salonName, setSalonName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [infoErrors, setInfoErrors] = useState<{
    salonName?: string;
    ownerName?: string;
    phone?: string;
  }>({});

  // Services questionnaire.
  const [services, setServices] = useState<DraftService[]>([]);
  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const [svcName, setSvcName] = useState('');
  const [svcDuration, setSvcDuration] = useState('');
  const [svcPrice, setSvcPrice] = useState('');
  const [svcError, setSvcError] = useState('');

  // Setup questionnaire.
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
  const specialtiesRef = useRef<HTMLDivElement | null>(null);
  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);
  const selectedProfile = useMemo(
    () => BUSINESS_PROFILES.find((profile) => profile.key === category),
    [category],
  );
  const codeValue = code.join('');
  const codeIsComplete = codeValue.length === OTP_LENGTH;
  const stepIndex = STEP_ORDER.indexOf(step);
  const isMobileWorkspace = workspace === 'mobile';

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

  const handleWorkModeSelect = (value: WorkMode) => {
    setWorkMode(value);
    setWorkspace('');
    setTeamRange('');
    setMainGoal('');
    // Give the final setup step a useful starting point even if the follow-up
    // question is skipped. The owner can still edit it before submitting.
    setChairCount(value === 'team' || value === 'salon' ? '3' : '1');
  };

  const contextAnswerReady =
    workMode === 'solo' || workMode === 'starting'
      ? Boolean(workspace)
      : workMode === 'team' || workMode === 'salon'
        ? Boolean(teamRange)
        : false;

  const handleWizardBack = () => {
    if (step === 'category') {
      setStep(workMode ? 'context' : 'profile');
      return;
    }
    setStep(STEP_ORDER[Math.max(0, stepIndex - 1)]);
  };

  const handleContextNext = () => {
    if (workMode === 'team' || workMode === 'salon') {
      setChairCount(teamRange ? CHAIR_COUNT_BY_RANGE[teamRange] : '3');
    } else if (workspace === 'mobile') {
      // Mobile work has no physical chair. The backend creates one private
      // mobile capacity lane for the owner instead.
      setChairCount('0');
    } else {
      setChairCount('1');
    }
    setStep('category');
  };

  // ── Identity: validate required fields, then advance ─────────────────────
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

  // ── Services: add / remove a service ─────────────────────────────────────
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
    setSelectedPresetKey('');
    setSvcName('');
    setSvcDuration('');
    setSvcPrice('');
    setSvcError('');
  };

  const handleSelectPresetService = (presetKey: (typeof SERVICE_PRESETS)[number]) => {
    const name = t(`business.register.services.presets.${presetKey}`);
    const alreadyAdded = services.some((service) => service.name === name);
    if (alreadyAdded) return;

    setSelectedPresetKey(presetKey);
    setSvcName(name);
    setSvcError('');
  };

  const handleRemoveService = (key: string) =>
    setServices((prev) => prev.filter((s) => s.key !== key));

  // ── Submit registration, then send the OTP ───────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      await registrationApi.registerSalon({
        salonName: salonName.trim(),
        ownerName: ownerName.trim(),
        phone: normalizedPhone,
        businessType: category || undefined,
        specialties,
        brandAccent: accentKey || undefined,
        workMode:
          workMode === 'solo' || workMode === 'starting'
            ? workspace || 'not_decided'
            : 'fixed_salon',
        services: services.map(({ name, durationMinutes, priceRial }) => ({
          name,
          ...(durationMinutes ? { durationMinutes } : {}),
          ...(priceRial ? { priceRial } : {}),
        })),
        chairCount: isMobileWorkspace ? 0 : toIntOrZero(chairCount),
        referralToken,
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
      await refreshAuth();
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
      className="flex min-h-screen min-h-[100dvh] w-full flex-col bg-bg"
      data-testid="register-salon-page"
    >
      <SeoHead title={t('business.register.title')} />

      <header className="register-page-header border-b border-border bg-elevated">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-3 sm:gap-5 sm:px-4">
          <Link
            to="/"
            aria-label="آرا"
            className="inline-flex min-h-10 shrink-0 items-center no-underline"
          >
            <BrandLogo className="h-9" />
          </Link>
          <div
            className="flex min-w-0 flex-1 basis-16 gap-1"
            role="group"
            aria-label={t('business.register.progressLabel')}
          >
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
          {step !== 'profile' ? (
            <button
              type="button"
              onClick={handleWizardBack}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-text"
              aria-label={t('business.register.back')}
            >
              <ArrowRight className="size-5 rtl:-scale-x-100" aria-hidden="true" />
            </button>
          ) : (
            <span className="size-10" aria-hidden="true" />
          )}
        </div>
      </header>

      <div className="register-form-content mx-auto flex w-full max-w-2xl flex-1 flex-col px-3 py-6 sm:px-4 sm:py-10">
        <p className="text-sm font-medium text-primary">
          مرحله {toPersianDigits(stepIndex + 1)} از {toPersianDigits(STEP_ORDER.length)}
        </p>
        <h1 className="mt-3 text-2xl leading-display text-display text-text">
          {step === 'profile'
            ? t('business.register.profile.title')
            : step === 'context'
              ? t(`business.register.context.${workMode || 'starting'}.title`)
              : step === 'category'
                ? t('business.register.category.title')
                : step === 'info'
                  ? t('business.register.info.title')
                  : step === 'services'
                    ? t('business.register.services.title')
                    : step === 'setup'
                      ? t('business.register.setup.title')
                      : t('business.register.verify.title')}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {step === 'profile'
            ? t('business.register.profile.subtitle')
            : step === 'context'
              ? t(`business.register.context.${workMode || 'starting'}.subtitle`)
              : step === 'category'
                ? t('business.register.category.subtitle')
                : step === 'services'
                  ? t('business.register.services.subtitle')
                  : t('business.register.subtitle')}
        </p>

        {step === 'profile' ? (
          <section className="flex flex-1 flex-col pt-8">
            <StepHeading
              icon={<User className="h-5 w-5" aria-hidden="true" />}
              title={t('business.register.profile.question')}
              subtitle={t('business.register.profile.helper')}
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-2" role="group">
              {WORK_MODES.map((mode) => (
                <ChoiceCard
                  key={mode.key}
                  icon={mode.icon}
                  label={t(`business.register.profile.modes.${mode.key}.label`)}
                  description={t(`business.register.profile.modes.${mode.key}.description`)}
                  selected={workMode === mode.key}
                  onSelect={() => handleWorkModeSelect(mode.key)}
                  testId={`work-mode-${mode.key}`}
                />
              ))}
            </div>
            <StepNav
              onNext={() => setStep('context')}
              onSkip={() => setStep('category')}
              nextLabel={t('business.register.next')}
              skipLabel={t('business.register.skip')}
              backLabel={t('business.register.back')}
              nextDisabled={!workMode}
            />
          </section>
        ) : step === 'context' ? (
          <section className="flex flex-1 flex-col pt-8">
            <StepHeading
              icon={
                workMode === 'salon' ? (
                  <Store className="h-5 w-5" aria-hidden="true" />
                ) : workMode === 'team' ? (
                  <Users className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                )
              }
              title={t('business.register.context.question')}
              subtitle={t('business.register.context.helper')}
            />

            {(workMode === 'solo' || workMode === 'starting') && (
              <Select
                id="workspace"
                label={t('business.register.context.workspaceLabel')}
                value={workspace}
                onValueChange={(value) => setWorkspace(value as Workspace)}
                options={WORKSPACES.map((option) => ({
                  value: option,
                  label: t(`business.register.context.workspaceOptions.${option}`),
                }))}
                placeholder={t('business.register.context.workspacePlaceholder')}
                containerClassName="mt-5"
              />
            )}

            {(workMode === 'team' || workMode === 'salon') && (
              <Select
                id="teamRange"
                label={t(
                  workMode === 'salon'
                    ? 'business.register.context.teamSizeSalonLabel'
                    : 'business.register.context.teamSizeTeamLabel',
                )}
                value={teamRange}
                onValueChange={(value) => setTeamRange(value as TeamRange)}
                options={TEAM_RANGES.map((option) => ({
                  value: option,
                  label: t(`business.register.context.teamSizeOptions.${option}`),
                }))}
                placeholder={t('business.register.context.teamSizePlaceholder')}
                containerClassName="mt-5"
              />
            )}

            <Select
              id="mainGoal"
              label={t('business.register.context.goalLabel')}
              value={mainGoal}
              onValueChange={(value) => setMainGoal(value as MainGoal)}
              options={MAIN_GOALS.map((option) => ({
                value: option,
                label: t(`business.register.context.goalOptions.${option}`),
              }))}
              placeholder={t('business.register.context.goalPlaceholder')}
              containerClassName="mt-4"
            />

            <StepNav
              onBack={() => setStep('profile')}
              onNext={handleContextNext}
              onSkip={handleContextNext}
              nextLabel={t('business.register.next')}
              skipLabel={t('business.register.skip')}
              backLabel={t('business.register.back')}
              nextDisabled={!contextAnswerReady}
            />
          </section>
        ) : step === 'category' ? (
          <section className="flex flex-1 flex-col pt-8">
            <div className="grid gap-3 sm:grid-cols-2">
              {BUSINESS_PROFILES.map((profile) => {
                const Icon = profile.icon;
                const selected = category === profile.key;
                return (
                  <button
                    key={profile.key}
                    type="button"
                    onClick={() => {
                      setCategory(profile.key);
                      setSpecialties([profile.specialties[0].key]);
                      if (window.matchMedia('(max-width: 47.9375rem)').matches) {
                        window.requestAnimationFrame(() => {
                          specialtiesRef.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                          });
                        });
                      }
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
                      <span className="text-xs leading-5 text-muted">{profile.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedProfile && (
              <div
                ref={specialtiesRef}
                className="register-specialties-panel flex flex-col gap-2 rounded-xl border border-border bg-bg p-4"
              >
                <p className="text-sm font-bold text-text">
                  {t('business.register.category.specialtyTitle')}
                </p>
                <p className="text-xs leading-5 text-muted">
                  {t('business.register.category.specialtySubtitle')}
                </p>
                <Select
                  label={t('business.register.category.specialtyLabel')}
                  labelHidden
                  value={specialties[0] ?? ''}
                  onValueChange={(value) => setSpecialties(value ? [value] : [])}
                  options={selectedProfile.specialties.map((specialty) => ({
                    value: specialty.key,
                    label: specialty.label,
                  }))}
                  placeholder={t('business.register.category.specialtyPlaceholder')}
                  containerClassName="w-full"
                />
              </div>
            )}
            <StepNav
              onBack={() => setStep(workMode ? 'context' : 'profile')}
              onNext={() => setStep('info')}
              onSkip={() => setStep('info')}
              nextLabel={t('business.register.next')}
              skipLabel={t('business.register.skip')}
              backLabel={t('business.register.back')}
              nextDisabled={!category}
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
              <div className="flex flex-col gap-4" data-testid="register-services-step">
                <Select
                  id="svcPreset"
                  label={t('business.register.services.presetsLabel')}
                  placeholder="یک خدمت را انتخاب کنید"
                  value={selectedPresetKey}
                  options={SERVICE_PRESETS.filter((presetKey) => {
                    const presetName = t(`business.register.services.presets.${presetKey}`);
                    return !services.some((service) => service.name === presetName);
                  }).map((presetKey) => ({
                    value: presetKey,
                    label: t(`business.register.services.presets.${presetKey}`),
                  }))}
                  emptyText="همهٔ خدمات پیشنهادی اضافه شده‌اند"
                  onValueChange={(value) =>
                    handleSelectPresetService(value as (typeof SERVICE_PRESETS)[number])
                  }
                />

                <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_8.5rem_9.5rem]">
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <TextField
                      id="svcName"
                      label={t('business.register.services.nameLabel')}
                      placeholder={t('business.register.services.namePlaceholder')}
                      value={svcName}
                      onChange={(e) => {
                        setSelectedPresetKey('');
                        setSvcName(e.target.value);
                      }}
                    />
                  </div>
                  <TextField
                    id="svcDuration"
                    label={
                      <span className="whitespace-nowrap">
                        {t('business.register.services.durationLabel')}
                      </span>
                    }
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="۳۰"
                    containerClassName="min-w-0 w-full"
                    value={svcDuration}
                    onChange={(e) => setSvcDuration(e.target.value)}
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
                    containerClassName="min-w-0 w-full"
                    value={svcPrice}
                    onChange={(e) => setSvcPrice(e.target.value)}
                  />
                </div>
                {svcError && (
                  <p className="flex items-center gap-1 text-sm text-danger" role="alert">
                    {svcError}
                  </p>
                )}
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    startIcon={<Plus className="h-4 w-4" />}
                    onClick={handleAddService}
                    className="w-full sm:w-auto"
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

                {services.length === 0 && (
                  <p className="text-xs leading-5 text-muted" role="status">
                    {t('business.register.services.emptyHint')}
                  </p>
                )}

                <StepNav
                  onBack={() => setStep('info')}
                  onNext={() => setStep('setup')}
                  onSkip={() => setStep('setup')}
                  nextLabel={t('business.register.next')}
                  skipLabel={t('business.register.skip')}
                  backLabel={t('business.register.back')}
                  nextDisabled={services.length === 0}
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
                  helperText={
                    isMobileWorkspace
                      ? 'برای خدمات سیار صندلی فیزیکی لازم نیست؛ مسیر اختصاصی آرایشگر ساخته می‌شود.'
                      : t('business.register.setup.chairsHelper')
                  }
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="۳"
                  containerClassName="max-w-[10rem]"
                  value={chairCount}
                  onChange={(e) => setChairCount(e.target.value)}
                  disabled={isMobileWorkspace}
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
                  <SummaryRow
                    label={t('business.register.review.workMode')}
                    value={
                      workMode
                        ? t(`business.register.profile.modes.${workMode}.label`)
                        : t('business.register.review.none')
                    }
                  />
                  <SummaryRow
                    label={t('business.register.review.context')}
                    value={
                      workspace
                        ? t(`business.register.context.workspaceOptions.${workspace}`)
                        : teamRange
                          ? t(`business.register.context.teamSizeOptions.${teamRange}`)
                          : t('business.register.review.none')
                    }
                  />
                  <SummaryRow
                    label={t('business.register.review.goal')}
                    value={
                      mainGoal
                        ? t(`business.register.context.goalOptions.${mainGoal}`)
                        : t('business.register.review.none')
                    }
                  />
                  <SummaryRow
                    label={t('business.register.review.category')}
                    value={
                      selectedProfile?.label ?? (category || t('business.register.review.none'))
                    }
                  />
                  <SummaryRow
                    label={t('business.register.review.specialty')}
                    value={
                      specialties.length > 0
                        ? specialtyLabels(category, specialties)
                        : t('business.register.review.none')
                    }
                  />
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
        {step !== 'otp' && step !== 'profile' && (
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

interface BusinessProfile {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  specialties: readonly { key: string; label: string }[];
}

const BUSINESS_PROFILES: readonly BusinessProfile[] = [
  {
    key: 'hair_salon',
    label: 'سالن مو و زیبایی',
    description: 'مو، رنگ، براشینگ و خدمات زیبایی',
    icon: Scissors,
    specialties: [
      { key: 'haircut', label: 'کوتاهی مو' },
      { key: 'color', label: 'رنگ و مش' },
      { key: 'blowout', label: 'براشینگ' },
      { key: 'bridal', label: 'شینیون و عروس' },
    ],
  },
  {
    key: 'barber',
    label: 'آرایشگاه مردانه',
    description: 'کوتاهی، اصلاح و استایل آقایان',
    icon: Scissors,
    specialties: [
      { key: 'mens_haircut', label: 'کوتاهی مردانه' },
      { key: 'beard', label: 'اصلاح صورت و ریش' },
      { key: 'fade', label: 'فید و استایل' },
    ],
  },
  {
    key: 'nails',
    label: 'ناخن',
    description: 'مانیکور، پدیکور و طراحی ناخن',
    icon: Hand,
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
    icon: Eye,
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
    icon: Sparkles,
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
    icon: Sparkles,
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
    icon: Sparkles,
    specialties: [
      { key: 'tattoo', label: 'تتو' },
      { key: 'microblading', label: 'میکروبلیدینگ' },
      { key: 'piercing', label: 'پیرسینگ' },
    ],
  },
] as const;

function specialtyLabels(category: string, keys: string[]): string {
  const profile = BUSINESS_PROFILES.find((item) => item.key === category);
  return (
    profile?.specialties
      .filter((item) => keys.includes(item.key))
      .map((item) => item.label)
      .join('، ') || '—'
  );
}

/** Quick-add service presets (keys map to `business.register.services.presets.*`). */
const SERVICE_PRESETS = ['haircut', 'color', 'highlights', 'blowout', 'makeup', 'nails'] as const;

/** Large, touch-friendly choice used for the first adaptive onboarding question. */
function ChoiceCard({
  icon: Icon,
  label,
  description,
  selected,
  onSelect,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-testid={testId}
      onClick={onSelect}
      className={cn(
        'flex min-h-[5.5rem] items-start gap-3 rounded-xl border-2 bg-elevated p-4 text-start text-text transition-colors duration-fast',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60',
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary',
          selected && 'bg-primary text-primary-contrast',
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-bold">{label}</span>
        <span className="text-xs leading-5 text-muted">{description}</span>
      </span>
      {selected && <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  );
}

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
            startIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}
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
