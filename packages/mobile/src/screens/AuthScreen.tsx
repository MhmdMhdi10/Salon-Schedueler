import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';

/** Imperative handle exposed by a TextInput ref (focus/blur management). */
type TextInputInstance = React.ElementRef<typeof TextInput>;
import { useTranslation } from 'react-i18next';
import { toPersianDigits, normalizeDigits } from '@salon/shared';
import { requestOtp, verifyOtp, PersistTokens } from './AuthScreen.logic';
import { useTheme } from '../theme';
import type { RnTheme } from '../theme';

/**
 * Phone + OTP authentication screen (React Native), re-skinned to the shared
 * design language (R6.2; ui-ux Auth recipe, §7 forms, §11 RTL/numerals).
 *
 * Presentation only — the phone → OTP → verify → store-tokens flow lives in
 * `AuthScreen.logic.ts` and is untouched. This component consumes the RN
 * `useTheme` tokens (built from the same source-of-truth values as the web CSS
 * variables) and renders:
 *
 *  - **Phone step** — a themed `TextInput` (`keyboardType=phone-pad`, LTR digit
 *    entry) with a visible label, and a primary button with an in-button
 *    loading state and a «دریافت کد» CTA.
 *  - **OTP step** — six single-digit boxes (`keyboardType=number-pad`) with
 *    auto-advance, backspace-to-previous, a primary «تایید» button, and a
 *    **resend timer** («ارسال مجدد تا ۰:۴۵») rendered in Persian digits that
 *    disables resend until it elapses.
 *
 * Errors surface inline via the existing `auth-error` testID (preserved so the
 * current tests stay green). Persian typography, Persian display digits, and
 * RTL layout come from the theme baseline. All copy is read from the mobile
 * i18n catalog (`auth.*`) — no hard-coded Farsi in JSX.
 *
 * Requirement: 6.2, 7.4, 7.5
 */

/** Navigation route name for the auth screen. */
export const AUTH_SCREEN = 'AuthScreen';

export type AuthStep = 'phone' | 'otp';

/** Number of digits in the SMS one-time code. */
const OTP_LENGTH = 6;
/** Resend cooldown in seconds — the «ارسال مجدد تا ۰:۴۵» timer (ui-ux §7). */
const RESEND_SECONDS = 45;

/** Formats remaining seconds as `m:ss` with Persian digits for the resend timer. */
function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return toPersianDigits(`${minutes}:${String(seconds).padStart(2, '0')}`);
}

export interface AuthScreenProps {
  /** Invoked after tokens are stored, so the host can navigate onward. */
  onAuthenticated?: () => void;
  /** Optional token persistence (e.g. secure storage / AsyncStorage). */
  persistTokens?: PersistTokens;
}

export function AuthScreen({ onAuthenticated, persistTokens }: AuthScreenProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState<string[]>(() => Array(OTP_LENGTH).fill(''));
  const [step, setStep] = useState<AuthStep>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);

  const otpRefs = useRef<Array<TextInputInstance | null>>([]);
  const codeValue = code.join('');
  const codeIsComplete = codeValue.length === OTP_LENGTH;

  // Resend countdown: ticks once per second while the cooldown is active.
  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const sendOtp = async () => {
    setLoading(true);
    setError('');
    const result = await requestOtp(phone);
    setLoading(false);
    if (result.ok) {
      setStep('otp');
      setSecondsLeft(RESEND_SECONDS);
    } else {
      setError(resolveAuthError(result));
    }
  };

  const handleRequestOtp = () => {
    if (loading || phone.length === 0) return;
    sendOtp();
  };

  const handleResend = () => {
    if (secondsLeft > 0 || loading) return;
    setCode(Array(OTP_LENGTH).fill(''));
    sendOtp();
  };

  const handleVerifyOtp = async () => {
    if (loading || !codeIsComplete) return;
    setLoading(true);
    setError('');
    const result = await verifyOtp(phone, codeValue, persistTokens);
    setLoading(false);
    if (result.ok) {
      onAuthenticated?.();
    } else {
      setError(resolveAuthError(result));
    }
  };

  /**
   * Map an auth failure to a localized, actionable message. Prefers the
   * backend's stable error `code` (e.g. OTP_EXPIRED → «کد منقضی شده…») so the
   * user sees what happened and the next step, not a bare «Request failed».
   */
  function resolveAuthError(result: { error: string; code?: string }): string {
    if (result.code) {
      const key = `auth.errors.${result.code}`;
      const localized = t(key);
      if (localized !== key) return localized; // a translation exists
    }
    return result.error || t('auth.unknownError');
  }

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

  const handleOtpChange = (index: number, text: string) => {
    const raw = normalizeDigits(text).replace(/\D/g, '');
    if (!raw) {
      setDigit(index, '');
      return;
    }
    // Full-paste support: distribute multiple digits across the boxes.
    if (raw.length > 1) {
      const slice = raw.slice(0, OTP_LENGTH - index);
      setError('');
      setCode((prev) => {
        const next = [...prev];
        for (let i = 0; i < slice.length; i += 1) {
          next[index + i] = slice[i];
        }
        return next;
      });
      const lastFilled = Math.min(index + slice.length, OTP_LENGTH - 1);
      otpRefs.current[lastFilled]?.focus();
      return;
    }
    setDigit(index, raw[raw.length - 1]);
  };

  const handleOtpKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
      setDigit(index - 1, '');
    }
  };

  const backToPhone = () => {
    setStep('phone');
    setError('');
    setCode(Array(OTP_LENGTH).fill(''));
  };

  const phoneStepValid = phone.length > 0;
  const primaryDisabled =
    loading || (step === 'phone' ? !phoneStepValid : !codeIsComplete);

  return (
    <View testID="auth-screen" style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('auth.title')}</Text>
        <Text style={styles.subtitle}>
          {step === 'phone'
            ? t('auth.phoneStepSubtitle')
            : t('auth.otpStepSubtitle', { phone: toPersianDigits(phone) })}
        </Text>

        {step === 'phone' ? (
          <View style={styles.field}>
            <Text style={styles.label}>{t('auth.phoneLabel')}</Text>
            <TextInput
              testID="phone-input"
              value={phone}
              onChangeText={setPhone}
              placeholder={t('auth.phonePlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              maxLength={13}
              style={[styles.input, styles.ltrInput]}
            />
            <Text style={styles.helper}>{t('auth.phoneHelper')}</Text>
          </View>
        ) : (
          <View style={styles.field}>
            <Text style={styles.label}>{t('auth.otpLabel')}</Text>
            {/* Six single-digit boxes laid out left-to-right: box index 0 is
                the leftmost so entry order matches the code sent to the API. */}
            <View style={styles.otpRow}>
              {code.map((digit, index) => (
                <TextInput
                  // eslint-disable-next-line react/no-array-index-key
                  key={index}
                  testID={`otp-input-${index}`}
                  ref={(el: TextInputInstance | null) => {
                    otpRefs.current[index] = el;
                  }}
                  value={digit}
                  onChangeText={(text) => handleOtpChange(index, text)}
                  onKeyPress={(e: { nativeEvent: { key: string } }) =>
                    handleOtpKeyPress(index, e.nativeEvent.key)
                  }
                  keyboardType="number-pad"
                  autoComplete={index === 0 ? 'sms-otp' : 'off'}
                  textContentType="oneTimeCode"
                  maxLength={index === 0 ? OTP_LENGTH : 1}
                  style={[styles.input, styles.otpBox, error ? styles.inputError : null]}
                />
              ))}
            </View>
          </View>
        )}

        <Pressable
          testID="primary-button"
          accessibilityRole="button"
          accessibilityState={{ disabled: primaryDisabled, busy: loading }}
          disabled={primaryDisabled}
          onPress={step === 'phone' ? handleRequestOtp : handleVerifyOtp}
          style={({ pressed }: { pressed: boolean }) => [
            styles.primaryButton,
            primaryDisabled ? styles.primaryButtonDisabled : null,
            pressed && !primaryDisabled ? styles.primaryButtonPressed : null,
          ]}
        >
          {loading ? (
            <ActivityIndicator testID="auth-loading" color={theme.colors.primaryContrast} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {step === 'phone' ? t('auth.requestOtp') : t('auth.verify')}
            </Text>
          )}
        </Pressable>

        {step === 'otp' ? (
          <View style={styles.otpActions}>
            <Pressable
              testID="change-phone"
              accessibilityRole="button"
              onPress={backToPhone}
              disabled={loading}
              style={styles.ghostButton}
            >
              <Text style={styles.ghostButtonText}>{t('auth.changePhone')}</Text>
            </Pressable>
            {secondsLeft > 0 ? (
              <Text testID="resend-timer" style={styles.resendTimer}>
                {t('auth.resendIn', { time: formatCountdown(secondsLeft) })}
              </Text>
            ) : (
              <Pressable
                testID="resend-button"
                accessibilityRole="button"
                onPress={handleResend}
                disabled={loading}
                style={styles.ghostButton}
              >
                <Text style={styles.ghostButtonText}>{t('auth.resend')}</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {error.length > 0 ? (
          <Text testID="auth-error" accessibilityRole="alert" style={styles.errorText}>
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Token-driven styles for the active theme (no raw hex/px literals leak in). */
function createStyles(theme: RnTheme) {
  const { colors, spacing, radius, typography } = theme;
  const base = typography.baseline;
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing[4],
    },
    card: {
      width: '100%',
      maxWidth: 480,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.lg,
      padding: spacing[5],
      gap: spacing[4],
    },
    title: {
      ...base,
      fontSize: typography.variants.xl.fontSize,
      lineHeight: typography.variants.xl.lineHeight,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      ...base,
      fontSize: typography.variants.sm.fontSize,
      lineHeight: typography.variants.sm.lineHeight,
      color: colors.textMuted,
    },
    field: {
      gap: spacing[2],
    },
    label: {
      ...base,
      fontSize: typography.variants.xs.fontSize,
      lineHeight: typography.variants.xs.lineHeight,
      fontWeight: '600',
      color: colors.text,
    },
    helper: {
      ...base,
      fontSize: typography.variants['2xs'].fontSize,
      lineHeight: typography.variants['2xs'].lineHeight,
      color: colors.textMuted,
    },
    input: {
      backgroundColor: colors.bg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: spacing[3],
      minHeight: 48,
      fontFamily: typography.fontFamily,
      fontSize: typography.variants.sm.fontSize,
      color: colors.text,
    },
    ltrInput: {
      // Phone field reads left-to-right while labels/layout stay RTL (§7, §11).
      writingDirection: 'ltr',
      textAlign: 'left',
    },
    inputError: {
      borderColor: colors.danger,
    },
    otpRow: {
      // The OTP code is an inherently LTR number: box index 0 MUST be the
      // leftmost so visual entry order matches `code.join('')`. Layout flow
      // differs by platform:
      //   • native — the RN layout engine is LTR, so `flexDirection: 'row'`
      //     already puts index 0 on the left. ✓
      //   • web (react-native-web) — the app document is dir="rtl", and a plain
      //     `row` flows right-to-left there, putting index 0 on the RIGHT and
      //     sending the code REVERSED to the API. `row-reverse` cancels the
      //     document flip so index 0 is on the left again.
      flexDirection: Platform.OS === 'web' ? 'row-reverse' : 'row',
      justifyContent: 'center',
      gap: spacing[2],
    },
    otpBox: {
      width: 48,
      textAlign: 'center',
      writingDirection: 'ltr',
      fontSize: typography.variants.lg.fontSize,
      fontWeight: '700',
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing[4],
    },
    primaryButtonPressed: {
      opacity: 0.85,
    },
    primaryButtonDisabled: {
      opacity: 0.5,
    },
    primaryButtonText: {
      ...base,
      textAlign: 'center',
      fontSize: typography.variants.sm.fontSize,
      lineHeight: typography.variants.sm.lineHeight,
      fontWeight: '700',
      color: colors.primaryContrast,
    },
    otpActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing[2],
    },
    ghostButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: spacing[2],
    },
    ghostButtonText: {
      ...base,
      fontSize: typography.variants.xs.fontSize,
      lineHeight: typography.variants.xs.lineHeight,
      fontWeight: '600',
      color: colors.primary,
    },
    resendTimer: {
      ...base,
      fontSize: typography.variants.xs.fontSize,
      lineHeight: typography.variants.xs.lineHeight,
      color: colors.textMuted,
    },
    errorText: {
      ...base,
      fontSize: typography.variants.xs.fontSize,
      lineHeight: typography.variants.xs.lineHeight,
      color: colors.danger,
    },
  });
}

export default AuthScreen;
