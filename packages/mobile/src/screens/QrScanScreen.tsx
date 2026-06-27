import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { resolveScannedQr, ResolvedSalon } from './QrScanScreen.logic';
import { useTheme } from '../theme';
import type { RnTheme } from '../theme';

/**
 * Camera QR scan screen (React Native + Expo), re-skinned to the shared design
 * language (R6.3; ui-ux QrScan recipe, §6 states, §11 RTL).
 *
 * Scanning is powered by `expo-camera`'s `CameraView`: when camera permission is
 * granted the live preview mounts inside the viewfinder and decodes QR codes via
 * `onBarcodeScanned`, forwarding each payload to the resolve flow. Permission is
 * requested on first mount; an explicit "grant access" affordance is shown if it
 * is missing. The optional `onScan` prop remains as a test/host override — when
 * provided, the screen wires that handler instead of mounting the camera, so the
 * Node test suites (which never mount a camera) stay unchanged. The resolve flow
 * in `QrScanScreen.logic.ts` is untouched.
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

  // Real device scanning via expo-camera, used unless a host/test supplies its
  // own `onScan` driver. Permission is requested once on first mount.
  const useCamera = !onScan;
  const [permission, requestPermission] = useCameraPermissions();
  const askedRef = useRef(false);

  useEffect(() => {
    if (
      useCamera &&
      !askedRef.current &&
      permission &&
      !permission.granted &&
      permission.canAskAgain
    ) {
      askedRef.current = true;
      void requestPermission();
    }
  }, [useCamera, permission, requestPermission]);

  // Only decode while idle so a code resolves exactly once: `active`/`onBarcodeScanned`
  // are cleared the moment the resolve flow starts and re-armed on "rescan".
  const scanning = status === 'idle';
  const handleBarcode = useCallback(
    (result: BarcodeScanningResult) => {
      handlePayload(result.data);
    },
    [handlePayload]
  );

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

      {/* Themed viewfinder: a square frame with corner accents. The live camera
          preview mounts behind the accents when permission is granted; the
          permission gate / loading state render as overlays otherwise. */}
      <View style={styles.frame} accessibilityRole="image" accessibilityLabel={t('salon.scanQr')}>
        {useCamera && permission?.granted ? (
          <View style={styles.cameraContainer}>
            <CameraView
              testID="qr-camera"
              style={styles.camera}
              facing="back"
              active={scanning}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanning ? handleBarcode : undefined}
            />
          </View>
        ) : null}

        <View style={[styles.corner, styles.cornerTopStart]} />
        <View style={[styles.corner, styles.cornerTopEnd]} />
        <View style={[styles.corner, styles.cornerBottomStart]} />
        <View style={[styles.corner, styles.cornerBottomEnd]} />

        {/* Camera permission still being resolved. */}
        {useCamera && !permission ? (
          <View style={styles.frameOverlay}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.overlayText}>{t('salon.cameraLoading')}</Text>
          </View>
        ) : null}

        {/* Permission not granted: explain + offer to grant (or guide to Settings). */}
        {useCamera && permission && !permission.granted ? (
          <View style={styles.frameOverlay}>
            <Text style={styles.overlayText}>{t('salon.cameraPermissionHint')}</Text>
            {permission.canAskAgain ? (
              <Pressable
                testID="qr-grant-permission"
                accessibilityRole="button"
                accessibilityLabel={t('salon.grantCameraAccess')}
                onPress={() => {
                  void requestPermission();
                }}
                style={({ pressed }: { pressed: boolean }) => [
                  styles.permissionButton,
                  pressed ? styles.rescanButtonPressed : null,
                ]}
              >
                <Text style={styles.permissionButtonText}>{t('salon.grantCameraAccess')}</Text>
              </Pressable>
            ) : (
              <Text style={styles.overlayText}>{t('salon.cameraDeniedHint')}</Text>
            )}
          </View>
        ) : null}

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
      textAlign: 'center',
    },
    // Live camera preview fills the frame and is clipped to its rounded corners.
    cameraContainer: {
      position: 'absolute',
      insetBlockStart: 0,
      insetBlockEnd: 0,
      insetInlineStart: 0,
      insetInlineEnd: 0,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.text,
    },
    camera: {
      flex: 1,
    },
    permissionButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing[4],
      marginBlockStart: spacing[1],
    },
    permissionButtonText: {
      ...base,
      fontSize: typography.variants.sm.fontSize,
      lineHeight: typography.variants.sm.lineHeight,
      fontWeight: '700',
      color: colors.primaryContrast,
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
