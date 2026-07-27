import { describe, it, expect } from 'vitest';
import { deriveTenantTokens } from '../tenantTokens';
import { ACCENTS, resolveAccent } from '../../../pages/owner/marketing-assets';
import { ensureAaFill, onAccentForeground, contrastRatio, AA_TEXT } from '../../../styles/contrast';

/**
 * Unit tests for `deriveTenantTokens` (signature-ui-system task 9.7; Property 5,
 * R4.3). Asserts the four-variable override-map shape and that the derived
 * values are exactly what the shared WCAG helpers produce — so the map is a
 * faithful, AA-grounded projection of an `AccentTheme`, not an ad-hoc copy.
 *
 * Validates: Requirements 4.3
 */

describe('deriveTenantTokens', () => {
  it('produces exactly the four accent override variables', () => {
    const map = deriveTenantTokens(resolveAccent('violet')) as Record<string, string>;
    expect(Object.keys(map).sort()).toEqual(
      [
        '--color-accent',
        '--color-focus-ring',
        '--color-primary',
        '--color-primary-contrast',
      ].sort(),
    );
  });

  it('derives primary = ensureAaFill(from), contrast = onAccentForeground, accent = to, ring = primary', () => {
    const accent = resolveAccent('rose');
    const map = deriveTenantTokens(accent) as Record<string, string>;

    const expectedPrimary = ensureAaFill(accent.from);
    expect(map['--color-primary']).toBe(expectedPrimary);
    expect(map['--color-primary-contrast']).toBe(onAccentForeground(expectedPrimary, accent.ink));
    expect(map['--color-accent']).toBe(accent.to);
    expect(map['--color-focus-ring']).toBe(expectedPrimary);
  });

  it('keeps the on-primary foreground AA for every curated accent', () => {
    for (const accent of ACCENTS) {
      const map = deriveTenantTokens(accent) as Record<string, string>;
      expect(
        contrastRatio(map['--color-primary-contrast'], map['--color-primary']),
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});
