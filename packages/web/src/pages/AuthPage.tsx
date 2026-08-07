import { useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Check } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { authApi, setAccessToken, setRefreshToken } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { OtpInput, OTP_LENGTH, type OtpInputHandle } from '../auth/OtpInput';
import { normalizePhone, PHONE_PATTERN } from '../auth/phone';
import { SeoHead } from '../components/seo';
import { BrandLogo } from '../components/brand';
import { Button, TextField, cn, toPersianDigits, useToast } from '../components/ui';
import { durations, stepTransition, stepVariants } from '../lib/motion-variants';

export { normalizePhone } from '../auth/phone';

/** Resend cooldown in seconds — the «ارسال مجدد تا ۰:۴۵» timer (ui-ux §7). */
const RESEND_SECONDS = 45;

/** Formats remaining seconds as `m:ss` with Persian digits for the resend timer. */
function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return toPersianDigits(`${minutes}:${String(seconds).padStart(2, '0')}`);
}

/** Authenticated operator roles that route into a management panel. */
const PANEL_ROLES = new Set(['Owner', 'Admin', 'Stylist', 'PlatformAdmin']);

/**
 * Best-effort decode of the `role` claim from a JWT access token, for routing
 * only (the server still enforces authorization). Returns the role string when
 * the token carries a recognised staff role, otherwise undefined (customers).
 * Never throws — a malformed/opaque token simply yields undefined.
 */
function roleFromAccessToken(token: string): string | undefined {
  try {
    const payload = token.split('.')[1];
    if (!payload) return undefined;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = JSON.parse(atob(padded)) as {
      role?: unknown;
    };
    return typeof json.role === 'string' && PANEL_ROLES.has(json.role) ? json.role : undefined;
  } catch {
    return undefined;
  }
}

/** Reduced-motion step variants: opacity-only crossfade, no transform. */
const fadeStepVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * Phone + OTP authentication page (R4.1, R4.2, R7.6; ui-ux Auth recipe, §7,
 * §10, §11; Booksy directive §auth).
 *
 * A single centered `max-w-md` card on a neutral wash — the card is the whole
 * composition (no split-pane imagery, no dead social CTAs). Two steps with an
 * RTL-aware directional slide between them:
 *
 *  - **Phone step** — one labelled LTR tel field (`09xxxxxxxxx`, pasted
 *    `+98`/Persian digits normalized) + full-width primary «دریافت کد» and the
 *    terms/privacy consent line.
 *  - **OTP step** — the shared {@link OtpInput} six-box entry (survives fast
 *    typing, OS one-time-code autofill, and paste), resend cooldown with a
 *    draining progress bar, and expiry-aware error copy.
 *
 * Already-authenticated visitors are redirected away (`/owner` for staff, `/account`
 * for customers, honoring any mid-booking `returnTo`). Verify failures branch
 * on the server error code: `OTP_EXPIRED` → «کد منقضی شده…» + resend unlocked;
 * network failure → connection copy; anything else → «کد نامعتبر است». Errors
 * render inline in a `role="alert"` region without discarding entered data.
 *
 * The OTP login wall has no public content and must never be indexed; the
 * `<SeoHead>` default emits `noindex,follow` (seo §1, R8.7). Toasts come from
 * the app-root `ToastProvider` (no page-level provider).
 */
export function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { success } = useToast();
  const { status, role, refresh: refreshAuth } = useAuth();
  const prefersReduced = useReducedMotion();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState<string[]>(() => Array(OTP_LENGTH).fill(''));
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [direction, setDirection] = useState(1);
  const [phoneError, setPhoneError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const otpRef = useRef<OtpInputHandle | null>(null);
  const redirectTimer = useRef<number | undefined>(undefined);
  const lastAccessToken = useRef('');
  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);
  const phoneIsValid = PHONE_PATTERN.test(normalizedPhone);
  const codeValue = code.join('');
  const codeIsComplete = codeValue.length === OTP_LENGTH;

  // Where to land after auth. `returnTo` means we arrived mid-booking
  // (BookingConfirmPage bounced an anonymous customer to log in) — it drives
  // the phone-step subtitle copy and the post-verify routing.
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const returnState =
    (location.state as { returnState?: Record<string, unknown> } | null)?.returnState ?? {};
  const hasBookingReturnIntent = typeof returnTo === 'string' && returnTo.length > 0;

  const panelPath = (panelRole: string | undefined) =>
    panelRole === 'PlatformAdmin' ? '/platform-admin' : panelRole ? '/owner' : '/account';

  // Resend countdown: ticks once per second while the cooldown is active.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  useEffect(() => () => window.clearTimeout(redirectTimer.current), []);

  // Signed-in users have nothing to do here: route them to their surface
  // instead of re-showing the login form. Suppressed while the just-verified
  // success beat plays (its own timer performs the same navigation).
  if (status === 'authenticated' && !verified) {
    return hasBookingReturnIntent ? (
      <Navigate to={returnTo!} state={{ ...returnState, autoConfirm: true }} replace />
    ) : (
      <Navigate to={panelPath(role)} replace />
    );
  }

  const goToDestination = () => {
    if (hasBookingReturnIntent) {
      navigate(returnTo!, { state: { ...returnState, autoConfirm: true }, replace: true });
    } else {
      navigate(panelPath(roleFromAccessToken(lastAccessToken.current)), {
        replace: true,
      });
    }
  };

  const sendOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authApi.requestOtp(normalizedPhone);
      const devOtp = response?.devOtp;
      setCode(devOtp ? devOtp.split('') : Array(OTP_LENGTH).fill(''));
      setDirection(1);
      setStep('otp');
      setSecondsLeft(RESEND_SECONDS);
      success({ title: t('auth.otpSent') });
    } catch {
      setError(t('auth.requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = () => {
    if (!phoneIsValid) {
      setPhoneError(t('auth.invalidPhone'));
      return;
    }
    setPhoneError('');
    void sendOtp();
  };

  const handleResend = () => {
    if (secondsLeft > 0 || loading) return;
    setCode(Array(OTP_LENGTH).fill(''));
    otpRef.current?.focus();
    void sendOtp();
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await authApi.verifyOtp(normalizedPhone, codeValue);
      setAccessToken(result.accessToken);
      setRefreshToken(result.refreshToken);
      lastAccessToken.current = result.accessToken;
      // Resolve the app-wide session before navigating. This prevents the
      // owner guard from racing the /me request and bouncing a valid login
      // back to /auth on slower mobile connections.
      await refreshAuth();
      // Show a brief in-button success beat (motion-safe), then route: back to
      // the funnel with `autoConfirm` when we arrived mid-booking, otherwise by
      // the token's role (staff → panel, customers → account dashboard).
      setVerified(true);
      if (prefersReduced) {
        goToDestination();
      } else {
        redirectTimer.current = window.setTimeout(goToDestination, durations.slow * 1000);
      }
    } catch (err) {
      const errCode = (err as { code?: unknown } | null)?.code;
      const errStatus = (err as { status?: unknown } | null)?.status;
      if (errCode === 'OTP_EXPIRED') {
        // The correct-but-late case: say so, and unlock resend immediately.
        setError(t('auth.expiredOtp'));
        setSecondsLeft(0);
      } else if (typeof errStatus !== 'number') {
        setError(t('auth.networkError'));
      } else {
        setError(t('auth.invalidOtp'));
      }
      setLoading(false);
    }
  };

  const backToPhone = () => {
    setDirection(-1);
    setStep('phone');
    setError('');
    setCode(Array(OTP_LENGTH).fill(''));
  };

  const variants = prefersReduced ? fadeStepVariants : stepVariants;

  return (
    <div
      className="auth-page mx-auto flex min-h-screen min-h-[100dvh] w-full max-w-md flex-col items-center justify-center gap-4 px-3 py-8 sm:gap-5 sm:px-4 sm:py-12"
      data-testid="auth-page"
    >
      <SeoHead title={t('seo.titles.auth')} />

      <Link to="/" aria-label="آرا" className="inline-flex min-h-10 items-center no-underline">
        <BrandLogo className="h-12" />
      </Link>

      <div className="w-full overflow-hidden rounded-2xl border border-border bg-elevated p-4 shadow-1 sm:p-8">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          {step === 'phone' ? (
            <motion.div
              key="phone"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={stepTransition}
            >
              <div className="mb-5 text-start">
                <h1 className="text-lg font-bold leading-display text-text">{t('auth.title')}</h1>
                <p className="mt-1 text-sm leading-5 text-muted">
                  {hasBookingReturnIntent
                    ? t('auth.bookingIntentSubtitle')
                    : t('auth.phoneStepSubtitle')}
                </p>
              </div>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleRequestOtp();
                }}
              >
                <TextField
                  id="phone"
                  label={t('auth.phoneLabel')}
                  helperText={t('auth.phoneHelper')}
                  error={phoneError}
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  autoComplete="tel"
                  maxLength={20}
                  placeholder={t('auth.phonePlaceholder')}
                  value={phone}
                  style={{ unicodeBidi: 'isolate' }}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (phoneError) setPhoneError('');
                  }}
                />
                <Button type="submit" size="lg" fullWidth loading={loading}>
                  {t('auth.requestOtp')}
                </Button>
              </form>
              {/* Inline, friendly send-failure error — icon + text (never
                  color-only); the entered phone stays in the field (R4.2). */}
              {error && (
                <p className="error mt-4 flex items-center gap-1 text-sm text-danger" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}
              <p className="mt-5 flex flex-wrap items-center justify-center gap-x-1 text-center text-2xs leading-5 text-muted">
                <Trans
                  i18nKey="auth.consent"
                  components={{
                    terms: <Link to="/terms" className="inline-flex min-h-10 items-center text-primary" />,
                    privacy: <Link to="/privacy" className="inline-flex min-h-10 items-center text-primary" />,
                  }}
                />
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="otp"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={stepTransition}
            >
              <div className="mb-5 text-start">
                <h1 className="text-lg font-bold leading-display text-text">
                  {t('auth.otpLabel')}
                </h1>
                <p className="mt-1 text-sm leading-5 text-muted">
                  {t('auth.otpStepSubtitle', { phone: toPersianDigits(normalizedPhone) })}
                </p>
              </div>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleVerifyOtp();
                }}
              >
                <fieldset className="m-0 border-0 p-0">
                  <legend className="mb-1 block text-xs font-medium text-text">
                    {t('auth.otpLabel')}
                  </legend>
                  <OtpInput
                    ref={otpRef}
                    value={code}
                    onChange={(next) => {
                      setError('');
                      setCode(next);
                    }}
                    invalid={Boolean(error)}
                    describedBy="otp-error"
                    autoFocus
                  />
                </fieldset>

                <Button
                  type="submit"
                  size="lg"
                  fullWidth
                  loading={loading && !verified}
                  disabled={!codeIsComplete || verified}
                  startIcon={
                    verified ? <Check className="h-4 w-4" aria-hidden="true" /> : undefined
                  }
                >
                  {verified ? t('auth.verified') : t('auth.verify')}
                </Button>

                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    // In RTL the back affordance points RIGHT (steering §8) —
                    // ArrowRight is already correct, so no rtl flip.
                    startIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    onClick={backToPhone}
                  >
                    {t('auth.changePhone')}
                  </Button>
                  {secondsLeft > 0 ? (
                    <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted">
                      {t('auth.resendIn', { time: formatCountdown(secondsLeft) })}
                      {!prefersReduced && (
                        <span
                          className="block h-0.5 w-full overflow-hidden rounded-pill bg-border"
                          aria-hidden="true"
                        >
                          <motion.span
                            className="block h-full w-full bg-primary"
                            initial={{ scaleX: secondsLeft / RESEND_SECONDS }}
                            animate={{ scaleX: 0 }}
                            transition={{ duration: secondsLeft, ease: 'linear' }}
                          />
                        </span>
                      )}
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      onClick={handleResend}
                      disabled={loading}
                    >
                      {t('auth.resend')}
                    </Button>
                  )}
                  {/* Announce cooldown transitions ONCE each (start / ready)
                      instead of every ticking second. */}
                  <span className="sr-only" role="status">
                    {secondsLeft > 0 ? t('auth.resendCooldownStarted') : t('auth.resendReady')}
                  </span>
                </div>
              </form>

              {/* Inline, friendly error — icon + text (never color-only), wired
                  to the OTP inputs via `aria-describedby`; preserves entered
                  data (R4.2). */}
              {error && (
                <p
                  id="otp-error"
                  className={cn('error mt-4 flex items-center gap-1 text-sm text-danger')}
                  role="alert"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
