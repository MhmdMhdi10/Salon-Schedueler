import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import { TenantTheme } from '../TenantTheme';
import { deriveTenantTokens } from '../tenantTokens';
import { ACCENTS, resolveAccent } from '../../../pages/owner/marketing-assets';

/**
 * Tenant theming — scoped override, total resolution, theme-switch preservation
 * (signature-ui-system Properties 6, 7, 10; R4.2/4.4/4.7/4.8).
 *
 * `TenantTheme` writes a salon's Brand_Accent as inline CSS custom properties on
 * its own wrapper element so the unchanged, tokens-only Component_Library
 * re-tints with zero code churn — and nothing outside the wrapper is touched.
 * These tests assert the three universal properties the design defines for it.
 *
 * The four accent variables the wrapper is allowed to override (and only these,
 * so surfaces still resolve bg/surface/text from `:root` vs `[data-theme]`).
 */
const ACCENT_VARS = [
  '--color-primary',
  '--color-primary-contrast',
  '--color-accent',
  '--color-focus-ring',
] as const;

/** Variables the wrapper must NEVER override (they drive light/dark surfaces). */
const SURFACE_VARS = ['--color-bg', '--color-surface', '--color-text'] as const;

const ACCENT_KEYS = ACCENTS.map((a) => a.key);

afterEach(() => {
  cleanup();
  // Defensive: ensure no test leaks an inline token onto the document root.
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-theme');
});

/** The single scoped wrapper element TenantTheme renders. */
function wrapperOf(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-tenant-theme]');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

describe('Feature: signature-ui-system, Property 6: Accent override is scoped and leaves the global theme unchanged', () => {
  it('writes the accent only as inline vars on the wrapper; document root is untouched', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ACCENT_KEYS), (key) => {
        cleanup();
        document.documentElement.removeAttribute('style');
        const { container } = render(
          <TenantTheme accentKey={key}>
            <button type="button">رزرو</button>
          </TenantTheme>,
        );
        const wrapper = wrapperOf(container);

        // The four accent vars live on the wrapper's inline style…
        for (const v of ACCENT_VARS) {
          expect(wrapper.style.getPropertyValue(v).trim()).not.toBe('');
        }
        // …and the document root carries none of them (scoped, R4.7).
        for (const v of [...ACCENT_VARS, ...SURFACE_VARS]) {
          expect(document.documentElement.style.getPropertyValue(v).trim()).toBe('');
        }
        // The child is plain markup (no authored color literal injected here).
        const child = wrapper.querySelector('button');
        expect(child?.getAttribute('style')).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});

describe('Feature: signature-ui-system, Property 7: Accent resolution is total and falls back safely', () => {
  it('renders a usable wrapper for any key; unknown/malformed → signature default (no overrides)', () => {
    const arbitraryKey = fc.oneof(
      fc.constantFrom(...ACCENT_KEYS), // valid
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(''),
      fc.string(), // arbitrary unknown / malformed
      fc.constantFrom('VIOLET', 'rose ', '#ff0000', 'unknown-key'),
    );
    fc.assert(
      fc.property(arbitraryKey, (key) => {
        cleanup();
        const { container } = render(
          <TenantTheme accentKey={key as string | null | undefined}>
            <span data-testid="child">محتوا</span>
          </TenantTheme>,
        );
        // Always renders a single wrapper + the children (never unstyled/blank).
        const wrapper = wrapperOf(container);
        expect(wrapper.querySelector('[data-testid="child"]')).not.toBeNull();

        const isKnown = typeof key === 'string' && ACCENT_KEYS.includes(key);
        if (isKnown) {
          expect(wrapper.getAttribute('data-tenant-theme')).toBe(key);
          expect(wrapper.style.getPropertyValue('--color-primary').trim()).not.toBe('');
        } else {
          // Invalid → signature default: marked 'default' with NO overrides.
          expect(wrapper.getAttribute('data-tenant-theme')).toBe('default');
          for (const v of ACCENT_VARS) {
            expect(wrapper.style.getPropertyValue(v).trim()).toBe('');
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('Feature: signature-ui-system, Property 10: An active accent preserves theme switching and reduced-motion', () => {
  it('overrides only the four accent vars (never surface vars) and adds no motion', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ACCENT_KEYS),
        fc.constantFrom('light', 'dark'),
        (key, theme) => {
          cleanup();
          document.documentElement.setAttribute('data-theme', theme);
          const { container } = render(
            <TenantTheme accentKey={key}>
              <span>محتوا</span>
            </TenantTheme>,
          );
          const wrapper = wrapperOf(container);

          // Surface tokens still come from :root vs [data-theme] — the wrapper
          // must not pin bg/surface/text, so theme switching keeps working.
          for (const v of SURFACE_VARS) {
            expect(wrapper.style.getPropertyValue(v).trim()).toBe('');
          }
          // The wrapper adds no motion of its own (reduced-motion untouched).
          expect(wrapper.style.transition).toBe('');
          expect(wrapper.style.animation).toBe('');
          // Toggling the theme leaves the (orthogonal) accent overrides intact.
          document.documentElement.setAttribute('data-theme', theme === 'light' ? 'dark' : 'light');
          expect(wrapper.style.getPropertyValue('--color-primary').trim()).not.toBe('');
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('TenantTheme (example)', () => {
  it('applies the same derived map deriveTenantTokens produces for a known accent', () => {
    const accent = resolveAccent('rose');
    const expected = deriveTenantTokens(accent) as Record<string, string>;
    const { container } = render(
      <TenantTheme accentKey="rose">
        <span>محتوا</span>
      </TenantTheme>,
    );
    const wrapper = wrapperOf(container);
    expect(wrapper.style.getPropertyValue('--color-primary').trim().toUpperCase()).toBe(
      expected['--color-primary'].toUpperCase(),
    );
    expect(wrapper.style.getPropertyValue('--color-accent').trim().toLowerCase()).toBe(
      expected['--color-accent'].toLowerCase(),
    );
  });
});
