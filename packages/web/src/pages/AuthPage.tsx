import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Phone, ShieldCheck } from 'lucide-react';
import { authApi, setAccessToken, setRefreshToken } from '../api/client';
import { SeoHead } from '../components/seo';
import { normalizeDigits } from '@salon/shared';
import {
  Button,
  TextField,
  ToastProvider,
  cn,
  toPersianDigits,
  useToast,
} from '../components/ui';

/** Iranian mobile pattern: `09` followed by 9 digits (ui-ux §7). */
const PHONE_PATTERN = /^09\d{9}$/;
/** Number of digits in the SMS one-time code. */
const OTP_LENGTH = 6;
/** Resend cooldown in seconds — the «ارسال مجدد تا ۰:۴۵» timer (ui-ux §7). */
const RESEND_SECONDS = 45;

/**
 * Normalizes a raw phone entry to the canonical `09xxxxxxxxx` form before
 * validation: localizes digits, strips spacing/punctuation, and rewrites the
 * `+98` / `0098` / `98` country-code prefixes to a leading `0` (ui-ux §7).
 */
export function normalizePhone(raw: string): string {
  let v = normalizeDigits(raw).replace(/[\s()-]/g, '');
  if (v.startsWith('+98')) v = `0${v.slice(3)}`;
  else if (v.startsWith('0098')) v = `0${v.slice(4)}`;
  else if (v.startsWith('98') && v.length === 12) v = `0${v.slice(2)}`;
  return v;
}

/** Formats remaining seconds as `m:ss` with Persian digits for the resend timer. */
function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return toPersianDigits(`${minutes}:${String(seconds).padStart(2, '0')}`);
}

/**
 * Phone + OTP authentication page (R4.1, R4.2, R7.6; ui-ux Auth recipe, §7, §10,
 * §11).
 *
 * A centered card on a calm background with two steps:
 *
 *  - **Phone step** — a single direction-isolated LTR numeric field
 *    (`type=tel inputMode=tel dir=ltr autoComplete=tel`) validated against the
 *    Iranian mobile pattern `^09\d{9}$` (pasted `+98`/Persian digits are
 *    normalized first), with a primary «دریافت کد» CTA that shows an in-button
 *    loading state. A successful send raises a «کد ارسال شد» toast.
 *  - **OTP step** — six single-digit boxes (`inputMode=numeric`
 *    `autoComplete=one-time-code` `dir=ltr`) with auto-advance, full-paste,
 *    backspace-to-previous, and a resend timer rendered in Persian digits that
 *    disables resend until it elapses.
 *
 * Failures surface as an inline, friendly error in a `role="alert"` region
 * **without** discarding what the user typed (R4.2). The legacy `auth-page`
 * testID and the `role="alert"` error pattern are preserved so the existing
 * tests stay green. The auth API client calls are unchanged.
 *
 * The OTP login wall has no public content and must never be indexed; it renders
 * `<SeoHead>` with the `noindex` default so the route emits `noindex,follow`
 * (seo §1, R8.7). The login surface lives fully at `/auth`; the public marketing
 * home owns `/` (task 5.1).
 *
 * The page hosts its own {@link ToastProvider} so the «کد ارسال شد» confirmation
 * works whether the route is mounted standalone or inside the app shell.
 */
export function AuthPage() {
  return (
    <ToastProvider>
      <AuthPageContent />
    </ToastProvider>
  );
}

function AuthPageContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { success } = useToast();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState<string[]>(() => Array(OTP_LENGTH).fill(''));
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneError, setPhoneError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);
  const phoneIsValid = PHONE_PATTERN.test(normalizedPhone);
  const codeValue = code.join('');
  const codeIsComplete = codeValue.length === OTP_LENGTH;

  // Resend countdown: ticks once per second while the cooldown is active.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  const sendOtp = async () => {
    setLoading(true);
    setError('');
    try {
      await authApi.requestOtp(normalizedPhone);
      setStep('otp');
      setSecondsLeft(RESEND_SECONDS);
      success({ title: t('auth.otpSent') });
      // Focus the first OTP box once the step renders.
      window.setTimeout(() => otpRefs.current[0]?.focus(), 0);
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
    sendOtp();
  };

  const handleResend = () => {
    if (secondsLeft > 0 || loading) return;
    setCode(Array(OTP_LENGTH).fill(''));
    sendOtp();
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await authApi.verifyOtp(normalizedPhone, codeValue);
      setAccessToken(result.accessToken);
      setRefreshToken(result.refreshToken);
      navigate('/');
    } catch {
      setError(t('auth.invalidOtp'));
    } finally {
      setLoading(false);
    }
  };

  /** Sets one OTP box, then advances focus to the next empty box. */
  const setDigit = (index: number, digit: string) => {
    setError('');
    setCode((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const raw = normalizeDigits(e.target.value).replace(/\D/g, '');
    if (!raw) {
      setDigit(index, '');
      return;
    }
    // Typing into a box: keep the last entered digit and advance.
    setDigit(index, raw[raw.length - 1]);
  };

  const handleOtpPaste = (
    index: number,
    e: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    const pasted = normalizeDigits(e.clipboardData.getData('text'))
      .replace(/\D/g, '')
      .slice(0, OTP_LENGTH - index);
    if (!pasted) return;
    e.preventDefault();
    setError('');
    setCode((prev) => {
      const next = [...prev];
      for (let i = 0; i < pasted.length; i += 1) {
        next[index + i] = pasted[i];
      }
      return next;
    });
    const lastFilled = Math.min(index + pasted.length, OTP_LENGTH - 1);
    otpRefs.current[lastFilled]?.focus();
  };

  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      e.preventDefault();
      otpRefs.current[index - 1]?.focus();
      setDigit(index - 1, '');
    }
  };

  const backToPhone = () => {
    setStep('phone');
    setError('');
    setCode(Array(OTP_LENGTH).fill(''));
  };

  return (
    <div
      className="auth-page mx-auto flex w-full max-w-funnel flex-col items-center gap-5 py-6"
      data-testid="auth-page"
    >
      <SeoHead title={t('seo.titles.auth')} />

      <div
        className="flex h-12 w-12 items-center justify-center rounded-pill bg-primary/10 text-primary"
        aria-hidden="true"
      >
        {step === 'phone' ? (
          <Phone className="h-6 w-6" />
        ) : (
          <ShieldCheck className="h-6 w-6" />
        )}
      </div>

      <div className="text-center">
        <h1 className="text-xl font-bold text-text">{t('auth.title')}</h1>
        <p className="mt-2 text-sm text-muted">
          {step === 'phone'
            ? t('auth.phoneStepSubtitle')
            : t('auth.otpStepSubtitle', { phone: toPersianDigits(normalizedPhone) })}
        </p>
      </div>

      <div className="w-full rounded-lg border border-border bg-surface p-5 shadow-1">
        {step === 'phone' ? (
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
              error={phoneError || undefined}
              type="tel"
              inputMode="tel"
              dir="ltr"
              autoComplete="tel"
              maxLength={13}
              placeholder={t('auth.phonePlaceholder')}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (phoneError) setPhoneError('');
              }}
            />
            <Button type="submit" size="lg" fullWidth loading={loading}>
              {t('auth.requestOtp')}
            </Button>
          </form>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleVerifyOtp();
            }}
          >
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-1 block text-xs font-medium text-text">
                {t('auth.otpLabel')}
              </legend>
              {/* Six single-digit boxes — the EXPLICIT inline `direction: ltr`
                  (not the `dir` attribute alone) is what cascade-proofs this row
                  against inherited RTL from `<html dir="rtl">`. This guarantees
                  reading order == index order (index 0 = leftmost box), so
                  `code.join('')` submits digits in the order the user sees them.
                  Do NOT remove the inline style or reverse the join. */}
              <div className="flex flex-row justify-center gap-2" dir="ltr" style={{ direction: 'ltr' }}>
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
                    aria-label={t('auth.otpDigitLabel', {
                      index: toPersianDigits(index + 1),
                    })}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e)}
                    onPaste={(e) => handleOtpPaste(index, e)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    className={cn(
                      'h-12 w-11 rounded-md border bg-bg text-center text-lg font-bold text-text',
                      'transition-colors duration-fast ease-standard',
                      'outline-none focus-visible:outline focus-visible:outline-2',
                      'focus-visible:outline-offset-2 focus-visible:outline-focus',
                      error ? 'border-danger' : 'border-border',
                    )}
                  />
                ))}
              </div>
            </fieldset>

            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={loading}
              disabled={!codeIsComplete}
            >
              {t('auth.verify')}
            </Button>

            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="md"
                startIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}
                onClick={backToPhone}
              >
                {t('auth.changePhone')}
              </Button>
              {secondsLeft > 0 ? (
                <span className="text-xs text-muted" aria-live="polite">
                  {t('auth.resendIn', { time: formatCountdown(secondsLeft) })}
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
            </div>
          </form>
        )}

        {/* Inline, friendly error — preserves the existing `role="alert"`
            pattern and never clears the user's input (R4.2). */}
        {error && (
          <p
            className="error mt-4 flex items-center gap-1 text-sm text-danger"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
