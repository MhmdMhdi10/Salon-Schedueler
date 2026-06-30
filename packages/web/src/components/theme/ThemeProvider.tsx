import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

/**
 * Light/dark theming for the PWA (R1.8, R3.3, R3.4, R11.4).
 *
 * Resolution order on first load: stored user choice (`localStorage`) →
 * **light default**. The OS `prefers-color-scheme` is intentionally **not**
 * auto-followed: a Persian beauty/salon storefront should land on the warm
 * porcelain palette every time regardless of the visitor's OS scheme (so a
 * dark-OS visitor doesn't see a stark night-mode brand on first paint).
 * Users opt in to dark via the explicit toggle, and that choice persists.
 *
 * The active theme is written as `data-theme` on `<html>` (the hook the token
 * stylesheet and Tailwind's `darkMode: ['class','[data-theme="dark"]']` config
 * key off), and the `<meta name="theme-color">` is kept in sync so the PWA
 * chrome matches.
 *
 * Switching themes only swaps CSS custom properties, so all token-driven
 * styling updates immediately with **no reload and no layout shift** — nothing
 * reflows because no box geometry changes.
 */
export type Theme = 'light' | 'dark';

/** localStorage key for the persisted user choice. Kept in sync with the
 * pre-paint inline script in `index.html` that applies the theme before React
 * mounts (avoids a flash of the wrong theme). */
export const THEME_STORAGE_KEY = 'salon-theme';

/**
 * Fallback `theme-color` values used only when the `--color-bg` token can't be
 * read from the cascade (e.g. jsdom in tests, or before styles load). They
 * mirror the `--color-bg` token in `styles/tokens.css` (light `:root`, dark
 * `[data-theme="dark"]`) so the PWA chrome matches the page background. The
 * dark fallback tracks the salon-luxe rosé-noir bg.
 */
const FALLBACK_THEME_COLOR: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#1A1117',
};

interface ThemeContextValue {
  /** The currently active theme. */
  theme: Theme;
  /** Explicitly set (and persist) a theme choice. */
  setTheme: (theme: Theme) => void;
  /** Flip between light and dark, persisting the result. */
  toggleTheme: () => void;
  /**
   * Whether the user has made an explicit choice (persisted). When false the
   * app follows the OS `prefers-color-scheme` and reacts to its changes.
   */
  hasExplicitChoice: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    // localStorage can throw in private-mode / sandboxed contexts.
    return null;
  }
}

/** localStorage → light. The OS `prefers-color-scheme` is intentionally not
 * consulted; a dark-OS visitor still lands on the warm porcelain palette on
 * first paint and only flips to dark if they explicitly toggle. */
function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? 'light';
}

/** Apply the theme to `<html>` and keep `<meta name="theme-color">` in sync. */
function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);

  let meta = document.head.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  // Prefer the resolved `--color-bg` token so the chrome always matches the
  // real surface; fall back to the mirrored constant when it can't be read.
  const tokenBg = getComputedStyle(root).getPropertyValue('--color-bg').trim();
  meta.setAttribute('content', tokenBg || FALLBACK_THEME_COLOR[theme]);
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** Test seam: force an initial theme instead of resolving from env. */
  defaultTheme?: Theme;
}

/**
 * Provides theme state to the tree, applies it to the document, and follows the
 * OS preference until the user makes an explicit choice.
 */
export function ThemeProvider({ children, defaultTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(
    () => defaultTheme ?? resolveInitialTheme(),
  );
  const [hasExplicitChoice, setHasExplicitChoice] = useState<boolean>(
    () => defaultTheme != null || readStoredTheme() !== null,
  );

  // Apply before paint so a toggle never shows a half-themed frame.
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // We intentionally do NOT subscribe to `prefers-color-scheme` changes (see
  // the module doc): a dark-OS visitor stays on the warm porcelain palette and
  // only flips when they explicitly toggle.

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setHasExplicitChoice(true);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore persistence failures; the in-memory choice still applies.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme, hasExplicitChoice }),
    [theme, setTheme, toggleTheme, hasExplicitChoice],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * Access the theme context. Throws if used outside a `ThemeProvider` so misuse
 * surfaces immediately rather than silently rendering an unthemed tree.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
