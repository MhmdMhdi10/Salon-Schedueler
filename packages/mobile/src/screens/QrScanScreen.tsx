import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { resolveScannedQr, ResolvedSalon } from './QrScanScreen.logic';
import { useTheme } from '../theme';
import type { RnTheme } from '../theme';

/**
 * Camera QR scan screen (React Native), re-skinned to the shared design
 * language (R6.3; ui-ux QrScan recipe, §6 states, §11 RTL).
 *
 * The device camera is abstracted behind the `onScan` prop: a real camera
 * component wires the provided handler and invokes it with each decoded
 * payload (tests/hosts can drive it without a camera). That abstraction and the
 * resolve flow in `QrScanScreen.logic.ts` are **unchanged** — this is
 * presentation only.
 *
 * The screen renders a themed scan frame plus a status surface that carries the
 * full data-state set:
 *  - **idle/scanning** — the framed viewfinder with a hint to aim at the code.
 *  - **resolving** — an activity indicator (`qr-loading`) while the salon is
 *    looked up.
 *  - **resolved** — a success surface (`qr-success`) showing the salon name.
 *  - **error** — an error surface (`qr-error`) that keeps **distinct** messaging
 *    for a malformed payload versus an unregistered salon (and a generic
 *    fallback), each with a next-step hint and a retry affordance.
 *
 * Copy comes from the mobile i18n catalog (`salon.*` / `common.*`); the existing
 * `qr-loading` / `qr-error` / `qr-success` testIDs are preserved.
 *
 * Requirement: 6.3, 7.5
 */

/** Navigation route name for the QR scan screen. */
export const QR_SCAN_SCREEN = 'QrScanScreen';

type ScanStatus = 'idle' | 'resolving' | 'resolved' | 'error';

/** Failure category surfaced by the resolve flow (drives distinct copy). */
type ErrorKind = 'malformed' | 'unregistered' | 'error';

export interface QrScanScreenProps {
  /**
   * Camera abstraction. Receives a callback that should be invoked with each
   * decoded QR payload.
   */
  onScan?: (handlePayload: (payload: string) => void) => void;
  /** Success navigation callback, invoked with the resolved salon. */
  onResolved?: (salon: ResolvedSalon) => void;
}

export function QrScanScreen({ onScan, onResolved }: QrScanScreenProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [status, setStatus] = useState<ScanStatus>('idle');
  const [errorKind, setErrorKind] = useState<ErrorKind>('error');
  const [errorDetail, setErrorDetail] = useState('');
  const [salonName, setSalonName] = useState('');

  const handlePayload = useCallback(
    async (payload: string) => {
      setStatus('resolving');
      setErrorDetail('');
      const result = await resolveScannedQr(payload);
      if (result.ok) {
        setSalonName(result.salon.name);
        setStatus('resolved');
        onResolved?.(result.salon);
      } else {
        setErrorKind(result.kind);
        // Keep the resolved detail for the generic fallback (never a raw stack);
        // malformed/unregistered render their own catalog copy.
        setErrorDetail(result.message);
        setStatus('error');
      }
    },
    [onResolved]
  );

  useEffect(() => {
    onScan?.(handlePayload);
  }, [onScan, handlePayload]);

  // Distinct title/hint per failure category (R7.5): malformed vs unregistered
  // are clearly different, with a generic fallback for transport errors.
  const errorTitle =
    errorKind === 'malformed'
      ? t('salon.malformedQr')
      : errorKind === 'unregistered'
        ? t('salon.notFound')
        : errorDetail || t('common.retry');
  const errorHint =
    errorKind === 'malformed'
      ? t('salon.malformedQrHint')
      : errorKind === 'unregistered'
        ? t('salon.notFoundHint')
        : '';

  return (
    <View testID="qr-scan-screen" style={styles.screen}>
      <Text style={styles.title}>{t('salon.scanQr')}</Text>

      {/* Themed viewfinder: a square frame with corner accents. The camera
          preview mounts behind this in a real device build; here it is the
          idle/scanning affordance. */}
      <View style={styles.frame} accessibilityRole="image" accessibilityLabel={t('salon.scanQr')}>
        <View style={[styles.corner, styles.cornerTopStart]} />
        <View style={[styles.corner, styles.cornerTopEnd]} />
        <View style={[styles.corner, styles.cornerBottomStart]} />
        <View style={[styles.corner, styles.cornerBottomEnd]} />
        {status === 'resolving' ? (
          <View style={styles.frameOverlay}>
            <ActivityIndicator testID="qr-loading" color={theme.colors.primary} />
            <Text style={styles.overlayText}>{t('salon.resolving')}</Text>
          </View>
        ) : null}
      </View>

      {status === 'idle' ? (
        <Text style={styles.hint}>{t('salon.scanHint')}</Text>
      ) : null}

      {status === 'resolved' ? (
        <View style={[styles.statusCard, styles.successCard]} accessibilityRole="summary">
          <Text style={styles.successLabel}>{t('salon.resolvedTitle')}</Text>
          <Text testID="qr-success" style={styles.salonName}>
            {salonName}
          </Text>
        </View>
      ) : null}

      {status === 'error' ? (
        <View style={[styles.statusCard, styles.errorCard]} accessibilityRole="alert">
          <Text testID="qr-error" style={styles.errorTitle}>
            {errorTitle}
          </Text>
          {errorHint.length > 0 ? <Text style={styles.errorHint}>{errorHint}</Text> : null}
        </View>
      ) : null}

      {status !== 'idle' ? (
        <Pressable
          testID="qr-rescan"
          accessibilityRole="button"
          accessibilityLabel={t('salon.rescan')}
          onPress={() => {
            setSalonName('');
            setErrorDetail('');
            setStatus('idle');
          }}
          style={({ pressed }: { pressed: boolean }) => [
            styles.rescanButton,
            pressed ? styles.rescanButtonPressed : null,
          ]}
        >
          <Text style={styles.rescanButtonText}>{t('salon.rescan')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Token-driven styles for the active theme (no raw hex/px literals leak in). */
function createStyles(theme: RnTheme) {
  const { colors, spacing, radius, typography } = theme;
  const base = typography.baseline;
  const frameSize = 256;
  const cornerSize = 32;
  const cornerWidth = 3;
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing[4],
      gap: spacing[5],
    },
    title: {
      ...base,
      fontSize: typography.variants.xl.fontSize,
      lineHeight: typography.variants.xl.lineHeight,
      fontWeight: '700',
      color: colors.text,
    },
    frame: {
      width: frameSize,
      height: frameSize,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Corner accents mark the scan target; mirrored with logical insets in RTL.
    corner: {
      position: 'absolute',
      width: cornerSize,
      height: cornerSize,
      borderColor: colors.primary,
    },
    cornerTopStart: {
      insetBlockStart: 0,
      insetInlineStart: 0,
      borderStartStartRadius: radius.lg,
      borderTopWidth: cornerWidth,
      borderStartWidth: cornerWidth,
    },
    cornerTopEnd: {
      insetBlockStart: 0,
      insetInlineEnd: 0,
      borderStartEndRadius: radius.lg,
      borderTopWidth: cornerWidth,
      borderEndWidth: cornerWidth,
    },
    cornerBottomStart: {
      insetBlockEnd: 0,
      insetInlineStart: 0,
      borderEndStartRadius: radius.lg,
      borderBottomWidth: cornerWidth,
      borderStartWidth: cornerWidth,
    },
    cornerBottomEnd: {
      insetBlockEnd: 0,
      insetInlineEnd: 0,
      borderEndEndRadius: radius.lg,
      borderBottomWidth: cornerWidth,
      borderEndWidth: cornerWidth,
    },
    frameOverlay: {
      position: 'absolute',
      insetBlockStart: 0,
      insetBlockEnd: 0,
      insetInlineStart: 0,
      insetInlineEnd: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing[2],
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
    },
    overlayText: {
      ...base,
      fontSize: typography.variants.sm.fontSize,
      lineHeight: typography.variants.sm.lineHeight,
      color: colors.textMuted,
    },
    hint: {
      ...base,
      fontSize: typography.variants.sm.fontSize,
      lineHeight: typography.variants.sm.lineHeight,
      color: colors.textMuted,
      textAlign: 'center',
    },
    statusCard: {
      width: '100%',
      maxWidth: 480,
      borderWidth: 1,
      borderRadius: radius.lg,
      padding: spacing[4],
      gap: spacing[2],
    },
    successCard: {
      backgroundColor: colors.surface,
      borderColor: colors.success,
    },
    successLabel: {
      ...base,
      fontSize: typography.variants.xs.fontSize,
      lineHeight: typography.variants.xs.lineHeight,
      fontWeight: '600',
      color: colors.success,
    },
    salonName: {
      ...base,
      fontSize: typography.variants.lg.fontSize,
      lineHeight: typography.variants.lg.lineHeight,
      fontWeight: '700',
      color: colors.text,
    },
    errorCard: {
      backgroundColor: colors.surface,
      borderColor: colors.danger,
    },
    errorTitle: {
      ...base,
      fontSize: typography.variants.md.fontSize,
      lineHeight: typography.variants.md.lineHeight,
      fontWeight: '700',
      color: colors.danger,
    },
    errorHint: {
      ...base,
      fontSize: typography.variants.xs.fontSize,
      lineHeight: typography.variants.xs.lineHeight,
      color: colors.textMuted,
    },
    rescanButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing[5],
    },
    rescanButtonPressed: {
      opacity: 0.85,
    },
    rescanButtonText: {
      ...base,
      textAlign: 'center',
      fontSize: typography.variants.sm.fontSize,
      lineHeight: typography.variants.sm.lineHeight,
      fontWeight: '700',
      color: colors.primaryContrast,
    },
  });
}

export default QrScanScreen;
