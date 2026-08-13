import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';

/**
 * Light/dark theming for the PWA (R1.8, R3.3, R3.4, R11.4).
 *
 * Resolution order on first load: stored user choice (`localStorage`) →
 * **dark default**. The OS `prefers-color-scheme` is intentionally **not**
 * auto-followed: the storefront should land on the focused dark Ara surface
 * every time regardless of the visitor's OS scheme. Users can switch to light
 * via the explicit toggle, and that choice persists.
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
 * mirror the Booksy_Identity page background per theme (clean white in light,
 * near-black in dark) so the PWA chrome matches the real surface.
 */
const FALLBACK_THEME_COLOR: Record<Theme, string> = {
  light: '#FFFFFF',
  dark: '#0F1111',
};

interface ThemeContextValue {
  /** The currently active theme. */
  theme: Theme;
  /** Explicitly set (and persist) a theme choice. */
  setTheme: (theme: Theme) => void;
  /** Flip between light and dark, persisting the result. */
  toggleTheme: () => void;
  /**
   * Whether the user has made an explicit, persisted choice. When false the
   * app is on the dark default (the OS `prefers-color-scheme` is intentionally
   * never consulted — see the module doc).
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

/** localStorage → dark. The OS `prefers-color-scheme` is intentionally not
 * consulted; visitors land on the dark Ara surface on first paint and only
 * switch when they explicitly toggle. */
function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? 'dark';
}

/** Apply the theme to `<html>` and keep `<meta name="theme-color">` in sync. */
function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);

  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
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
 * Provides theme state to the tree and applies it to the document (dark
 * default; explicit user choice persists — the OS preference is not followed).
 */
export function ThemeProvider({ children, defaultTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => defaultTheme ?? resolveInitialTheme());
  const [hasExplicitChoice, setHasExplicitChoice] = useState<boolean>(
    () => defaultTheme != null || readStoredTheme() !== null,
  );

  // Apply before paint so a toggle never shows a half-themed frame.
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // We intentionally do NOT subscribe to `prefers-color-scheme` changes (see
  // the module doc): the dark default only changes when the visitor toggles.

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

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
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

/* ------------------------------------------------------------------------- *
 * Scoped theming (owner panel / any subtree with its own theme)
 * ------------------------------------------------------------------------- */

const ThemeScopeContext = createContext<Theme | null>(null);

export interface ThemeScopeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The theme this subtree renders in, independent of the document theme. */
  theme: Theme;
  children: React.ReactNode;
}

/**
 * Scope a subtree to its own theme, **portal-safely**.
 *
 * Setting `data-theme` on a wrapper div themes in-flow descendants, but Radix
 * overlays (Dialog/Sheet/Select/Tooltip/Toast/popovers) portal to
 * `document.body` — *outside* the wrapper — so they would render in the
 * document theme instead (e.g. a light dialog over the dark owner panel).
 *
 * `ThemeScope` therefore does two things:
 *  1. renders a `data-theme` wrapper for in-flow content, and
 *  2. provides the scope theme via context; every shared portaled primitive
 *     reads it with {@link useThemeScope} and stamps the same `data-theme` on
 *     its portaled root, so tokens resolve identically inside the portal.
 *
 * Used by the owner panel shell (`OwnerShell`) — replace a raw
 * `<div data-theme={theme}>` with `<ThemeScope theme={theme}>` and portals
 * follow the scope for free.
 */
export function ThemeScope({ theme, children, ...rest }: ThemeScopeProps) {
  return (
    <ThemeScopeContext.Provider value={theme}>
      <div data-theme={theme} {...rest}>
        {children}
      </div>
    </ThemeScopeContext.Provider>
  );
}

/**
 * The nearest scoped theme, or `undefined` when the subtree follows the
 * document theme. Portaled primitives stamp the returned value as `data-theme`
 * on their portal content (`undefined` → no attribute → inherit `<html>`).
 */
export function useThemeScope(): Theme | undefined {
  return useContext(ThemeScopeContext) ?? undefined;
}
