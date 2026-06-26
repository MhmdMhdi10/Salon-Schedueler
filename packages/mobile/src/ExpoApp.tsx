import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import './i18n';
import { ThemeProvider, useTheme } from './theme';
import type { RnTheme } from './theme';
import {
  AuthScreen,
  QrScanScreen,
  AvailabilityScreen,
} from './screens';
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
 * The QR scan camera is abstracted behind `onScan` in `QrScanScreen`; a real
 * `expo-camera` wiring can be added later. For now QrScan resolves a salon via
 * its own logic and hands the id forward to the availability/booking screen.
 */

type Route = 'auth' | 'qr' | 'availability';

function AppShell() {
  const { t } = useTranslation();
  const { theme, toggleTheme, themeName } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const [route, setRoute] = useState<Route>('auth');
  const [salonId, setSalonId] = useState<string | null>(null);

  return (
    <View style={styles.root}>
      {/* Lightweight top bar with a theme toggle + manual route switch. */}
      <View style={styles.bar}>
        <Text style={styles.brand}>{t('auth.title')}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={toggleTheme}
          style={styles.themeToggle}
        >
          <Text style={styles.themeToggleText}>
            {themeName === 'dark' ? '☀' : '☾'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <Tab label={t('auth.title')} active={route === 'auth'} onPress={() => setRoute('auth')} styles={styles} />
        <Tab label={t('salon.scanQr')} active={route === 'qr'} onPress={() => setRoute('qr')} styles={styles} />
        <Tab
          label={t('booking.heading')}
          active={route === 'availability'}
          onPress={() => salonId && setRoute('availability')}
          styles={styles}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {route === 'auth' ? (
          <AuthScreen onAuthenticated={() => setRoute('qr')} />
        ) : null}

        {route === 'qr' ? (
          <QrScanScreen
            onResolved={(salon: ResolvedSalon) => {
              setSalonId(salon.id);
              setRoute('availability');
            }}
          />
        ) : null}

        {route === 'availability' && salonId ? (
          <AvailabilityScreen
            salonId={salonId}
            onBooked={() => setRoute('auth')}
          />
        ) : null}

        {route === 'availability' && !salonId ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{t('salon.scanHint')}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Tab({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, active ? styles.tabActive : null]}
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
    bar: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing[4],
      paddingTop: spacing[8],
      paddingBottom: spacing[3],
      backgroundColor: colors.surface,
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
    },
    brand: {
      ...base,
      fontSize: typography.variants.lg.fontSize,
      lineHeight: typography.variants.lg.lineHeight,
      fontWeight: '700',
      color: colors.text,
    },
    themeToggle: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
    },
    themeToggleText: { fontSize: 20, color: colors.primary },
    tabs: {
      flexDirection: 'row-reverse',
      gap: spacing[2],
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
      backgroundColor: colors.surface,
    },
    tab: {
      paddingVertical: spacing[2],
      paddingHorizontal: spacing[3],
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    tabText: {
      ...base,
      fontSize: typography.variants.xs.fontSize,
      lineHeight: typography.variants.xs.lineHeight,
      color: colors.text,
    },
    tabTextActive: { color: colors.primaryContrast, fontWeight: '700' },
    body: { flexGrow: 1 },
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
