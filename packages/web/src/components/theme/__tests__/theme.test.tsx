import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider, ThemeToggle, useTheme, THEME_STORAGE_KEY } from '..';
import '../../../i18n';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Tests for the ThemeProvider (persisted light/dark with OS fallback) and the
 * header ThemeToggle.
 * Requirements: 1.8, 3.3, 3.4, 11.4
 */

function getThemeColorMeta(): string | null {
  return document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null;
}

/** Install a matchMedia mock whose `matches` reflects `prefersDark`, capturing
 * change listeners so tests can simulate an OS preference change. */
function mockMatchMedia(prefersDark: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches: prefersDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    addListener: (cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeListener: (cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    dispatchEvent: () => false,
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mql) as unknown as typeof window.matchMedia);
  return {
    emit(nowDark: boolean) {
      mql.matches = nowDark;
      const event = { matches: nowDark } as MediaQueryListEvent;
      listeners.forEach((cb) => cb(event));
    },
  };
}

function ThemeReadout() {
  const { theme, hasExplicitChoice } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="explicit">{String(hasExplicitChoice)}</span>
    </div>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves a stored choice ahead of the OS preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    mockMatchMedia(false); // OS prefers light, but the stored choice wins.

    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('explicit')).toHaveTextContent('true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('defaults to light even when the OS prefers dark (no auto-follow)', () => {
    // A Persian beauty/salon storefront should land on the warm porcelain
    // palette every time regardless of the visitor's OS scheme — users opt in
    // to dark via the explicit toggle (the choice then persists).
    mockMatchMedia(true); // OS prefers dark, nothing stored.

    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(screen.getByTestId('explicit')).toHaveTextContent('false');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('defaults to light when nothing is stored and the OS prefers light', () => {
    mockMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('sets and updates the theme-color meta to match the active theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    mockMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    );

    // jsdom can't resolve the CSS var, so the mirrored fallback applies — the
    // Booksy_Identity dark-mode bg.
    expect(getThemeColorMeta()).toBe('#0F1111');
  });

  it('does NOT auto-follow OS scheme changes (visitor must opt in)', () => {
    // The OS-follow listener was intentionally removed so a dark-OS visitor
    // never sees a stark night-mode brand on first paint and a system flip
    // can never silently override the warm porcelain default.
    const media = mockMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('light');

    act(() => media.emit(true));
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('stops following the OS once a choice is persisted', () => {
    const media = mockMatchMedia(false);

    function Harness() {
      const { theme, setTheme } = useTheme();
      return (
        <div>
          <span data-testid="theme">{theme}</span>
          <button onClick={() => setTheme('light')}>choose-light</button>
        </div>
      );
    }

    render(
      <ThemeProvider>
        <Harness />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('choose-light'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    // OS now prefers dark, but the explicit choice must hold.
    act(() => media.emit(true));
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
  });

  it('throws when useTheme is used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ThemeReadout />)).toThrow(/useTheme must be used within a ThemeProvider/);
    spy.mockRestore();
  });
});

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('flips the theme and persists the choice on click', () => {
    mockMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeToggle />
        <ThemeReadout />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    const toggle = screen.getByRole('button');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);

    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('exposes an accessible action label that reflects the next state', () => {
    mockMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    // Light active → offers switching to dark.
    expect(screen.getByRole('button', { name: 'تغییر به حالت تاریک' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));

    // Dark active → offers switching to light.
    expect(screen.getByRole('button', { name: 'تغییر به حالت روشن' })).toBeInTheDocument();
  });

  it('has no serious/critical a11y violations', async () => {
    mockMatchMedia(false);
    const { rtlContainer } = renderRtl(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
