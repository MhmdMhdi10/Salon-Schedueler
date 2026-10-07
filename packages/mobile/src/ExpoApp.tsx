import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import './i18n';
import { ThemeProvider, useTheme } from './theme';
import type { RnTheme } from './theme';
import { authApi, setAccessToken } from './api/client';
import { clearRefreshToken, loadRefreshToken, saveRefreshToken } from './auth/secure-storage';
import { AuthScreen, QrScanScreen, AvailabilityScreen } from './screens';
import type { ResolvedSalon } from './screens/QrScanScreen.logic';

/**
 * Runnable Expo root for the Salon Booking mobile app.
 *
 * This is the device/runtime entry (registered in `index.ts`). It is kept
 * separate from `src/App.tsx` (the source-only barrel consumed by the existing
 * Jest suites) so those tests stay untouched. It provides a minimal in-app
 * navigation between the three existing screens — Auth → QrScan → Availability
 * — wrapped in the shared `ThemeProvider` and i18n (Persian / RTL default).
 *
 * `QrScanScreen` now mounts a real `expo-camera` scanner (no `onScan` override is
 * passed), resolves the scanned salon via its own logic, and hands the salon id
 * forward to the availability/booking screen.
 */

type Route = 'auth' | 'qr' | 'availability';

function AppShell() {
  const { t } = useTranslation();
  const { theme, toggleTheme, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    const webDocument = (
      globalThis as unknown as {
        document?: { documentElement: { lang: string; dir: string } };
      }
    ).document;
    if (Platform.OS !== 'web' || !webDocument) return;
    webDocument.documentElement.lang = 'fa';
    webDocument.documentElement.dir = 'rtl';
  }, []);

  const [route, setRoute] = useState<Route>('auth');
  const [salonId, setSalonId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      const refreshToken = await loadRefreshToken();
      if (!refreshToken) {
        if (mounted) setAuthReady(true);
        return;
      }

      try {
        const tokens = await authApi.refresh(refreshToken);
        setAccessToken(tokens.accessToken);
        await saveRefreshToken(tokens.refreshToken);
        if (mounted) setRoute('qr');
      } catch {
        setAccessToken(null);
        await clearRefreshToken();
      } finally {
        if (mounted) setAuthReady(true);
      }
    };

    void restoreSession();
    return () => {
      mounted = false;
    };
  }, []);

  if (!authReady) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View
        style={[
          styles.appFrame,
          Platform.OS === 'android' ? { paddingTop: StatusBar.currentHeight ?? 0 } : null,
        ]}
      >
        <StatusBar
          barStyle={themeName === 'dark' ? 'light-content' : 'dark-content'}
          backgroundColor={theme.colors.bg}
        />

        <View style={styles.bar}>
          <View style={styles.brandLockup}>
            <View
              style={styles.brandMark}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={styles.brandMarkText}>آ</Text>
            </View>
            <Text style={styles.brand}>{t('app.title')}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              themeName === 'dark' ? t('app.switchToLightTheme') : t('app.switchToDarkTheme')
            }
            onPress={toggleTheme}
            style={({ pressed }: { pressed: boolean }) => [
              styles.themeToggle,
              pressed ? styles.themeTogglePressed : null,
            ]}
          >
            <Text style={styles.themeToggleText}>
              {themeName === 'dark' ? t('app.lightTheme') : t('app.darkTheme')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          <Tab
            label={t('app.navAuth')}
            active={route === 'auth'}
            onPress={() => setRoute('auth')}
            styles={styles}
          />
          <Tab
            label={t('app.navSalon')}
            active={route === 'qr'}
            onPress={() => setRoute('qr')}
            styles={styles}
          />
          <Tab
            label={t('app.navBooking')}
            active={route === 'availability'}
            disabled={!salonId}
            hint={salonId ? undefined : t('salon.scanHint')}
            onPress={() => salonId && setRoute('availability')}
            styles={styles}
          />
        </View>

        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {route === 'auth' ? (
              <AuthScreen
                onAuthenticated={() => setRoute('qr')}
                persistTokens={async ({ refreshToken }) => {
                  await saveRefreshToken(refreshToken);
                }}
              />
            ) : null}

            {route === 'qr' ? (
              <QrScanScreen
                onResolved={(salon: ResolvedSalon) => {
                  setSalonId(salon.id);
                  setRoute('availability');
                }}
              />
            ) : null}

            {route === 'availability' && salonId ? <AvailabilityScreen salonId={salonId} /> : null}

            {route === 'availability' && !salonId ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{t('salon.scanHint')}</Text>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

function Tab({
  label,
  active,
  disabled = false,
  hint,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  hint?: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityHint={hint}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.tab,
        active ? styles.tabActive : null,
        disabled ? styles.tabDisabled : null,
        pressed && !disabled ? styles.tabPressed : null,
      ]}
    >
      <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

export default function ExpoApp() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

function createStyles(theme: RnTheme) {
  const { colors, spacing, radius, typography } = theme;
  const base = typography.baseline;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    appFrame: { flex: 1, backgroundColor: colors.bg },
    bar: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing[4],
      paddingBottom: spacing[3],
      paddingTop: spacing[3],
      backgroundColor: colors.surface,
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
    },
    brandLockup: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: spacing[2],
    },
    brandMark: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      backgroundColor: colors.primary,
    },
    brandMarkText: {
      ...base,
      fontSize: typography.variants.md.fontSize,
      lineHeight: typography.variants.md.lineHeight,
      fontWeight: '800',
      color: colors.primaryContrast,
    },
    brand: {
      ...base,
      fontSize: typography.variants.lg.fontSize,
      lineHeight: typography.variants.lg.lineHeight,
      fontWeight: '700',
      color: colors.text,
    },
    themeToggle: {
      minWidth: 64,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing[3],
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    themeTogglePressed: {
      opacity: 0.75,
    },
    themeToggleText: {
      ...base,
      fontSize: typography.variants.xs.fontSize,
      lineHeight: typography.variants.xs.lineHeight,
      fontWeight: '600',
      color: colors.primary,
    },
    tabs: {
      flexDirection: 'row-reverse',
      gap: spacing[2],
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[3],
      backgroundColor: colors.surface,
    },
    tab: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing[2],
      paddingHorizontal: spacing[2],
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    tabDisabled: { opacity: 0.48 },
    tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    tabPressed: { opacity: 0.78 },
    tabText: {
      ...base,
      fontSize: typography.variants.xs.fontSize,
      lineHeight: typography.variants.xs.lineHeight,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    tabTextActive: { color: colors.primaryContrast, fontWeight: '700' },
    content: { flex: 1 },
    body: { flexGrow: 1, paddingBottom: spacing[4] },
    notice: { padding: spacing[5], alignItems: 'center' },
    noticeText: {
      ...base,
      fontSize: typography.variants.sm.fontSize,
      lineHeight: typography.variants.sm.lineHeight,
      color: colors.textMuted,
      textAlign: 'center',
    },
  });
}
