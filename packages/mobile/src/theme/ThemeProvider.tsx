import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ThemeName } from '@salon/shared';
import { type RnTheme, themes } from './theme';

/**
 * React Native ThemeProvider (R6.1).
 *
 * Mirrors the web `ThemeProvider` contract (`theme`, `setTheme`, `toggleTheme`)
 * but resolves a React Native `RnTheme` object built from the **same** shared
 * tokens as the web CSS variables, so color/space/radius/type are identical
 * across platforms. RTL + Persian typography is the baseline (carried by the
 * theme object itself).
 *
 * This is presentation wiring only — no logic, no navigation, no API change.
 * Default mode is light (per the steering guide); callers can seed an initial
 * mode (e.g. from device `Appearance`/persisted preference at the app entry).
 */
interface ThemeContextValue {
  /** The active theme name. */
  themeName: ThemeName;
  /** The resolved React Native theme (colors/spacing/radius/typography/motion). */
  theme: RnTheme;
  /** Explicitly set the active theme. */
  setTheme: (name: ThemeName) => void;
  /** Flip between light and dark. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children?: React.ReactNode;
  /** Initial mode; defaults to light per the design system. */
  defaultTheme?: ThemeName;
}

/**
 * Provides the resolved RN theme to the component tree. Switching themes only
 * swaps token values, so consuming `StyleSheet`s recompute from the new theme
 * without any structural change.
 */
export function ThemeProvider({ children, defaultTheme = 'light' }: ThemeProviderProps) {
  const [themeName, setThemeName] = useState<ThemeName>(defaultTheme);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeName(name);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeName((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeName,
      theme: themes[themeName],
      setTheme,
      toggleTheme,
    }),
    [themeName, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Access the active RN theme. Throws if used outside a `ThemeProvider` so misuse
 * surfaces immediately rather than rendering an unthemed tree.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
