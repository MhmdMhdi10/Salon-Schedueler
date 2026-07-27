import { describe, it, expect } from 'vitest';
import { ACCENTS } from '../pages/owner/marketing-assets';
import { deriveTenantTokens } from '../components/theme/tenantTokens';
import { contrastRatio, AA_TEXT, AA_LARGE_OR_NONTEXT } from './contrast';

/**
 * Derived on-accent foreground meets AA — for EVERY curated Brand_Accent
 * (signature-ui-system Property 5, R4.3).
 *
 * `Feature: signature-ui-system, Property 5: Derived on-accent foreground meets AA`
 *
 * The Tenant_Theming_System injects a salon's accent as runtime token overrides
 * via {@link deriveTenantTokens}. Naive "white text on the accent" is unsafe for
 * most of the curated `ACCENTS` (design §4), so the derivation darkens the fill
 * (`ensureAaFill`) and picks the legible ink (`onAccentForeground`). This suite
 * computes the WCAG ratio directly from the **derived** override map and asserts,
 * for every accent, that the on-primary foreground clears body-text AA (4.5:1)
 * and that the focus ring (a non-text use of the same fill) clears 3:1.
 *
 * The math is the single shared implementation in `./contrast` (the same gate
 * `contrast.test.ts` uses), so there is no duplicate copy to drift.
 *
 * Validates: Requirements 4.3
 */

/** Read a derived CSS custom property as a hex string. */
function token(map: ReturnType<typeof deriveTenantTokens>, name: string): string {
  const value = (map as Record<string, string>)[name];
  expect(value, `expected ${name} to be derived`).toBeTruthy();
  return value;
}

/** Round for readable failure messages without hiding a near-miss. */
function ratio(fg: string, bg: string): number {
  return Math.round(contrastRatio(fg, bg) * 100) / 100;
}

describe('tenant accent contrast (WCAG AA) — every ACCENTS entry', () => {
  for (const accent of ACCENTS) {
    describe(`accent "${accent.key}"`, () => {
      const tokens = deriveTenantTokens(accent);
      const primary = token(tokens, '--color-primary');
      const primaryContrast = token(tokens, '--color-primary-contrast');
      const focusRing = token(tokens, '--color-focus-ring');

      it('derives a valid #RRGGBB primary + contrast pair', () => {
        expect(primary).toMatch(/^#[0-9A-F]{6}$/);
        expect(primaryContrast).toMatch(/^#[0-9A-F]{6}$/i);
      });

      it('primary-contrast on primary clears body-text AA (≥ 4.5:1)', () => {
        expect(ratio(primaryContrast, primary)).toBeGreaterThanOrEqual(AA_TEXT);
      });

      it('focus ring (= primary fill) clears non-text AA on the page bg (≥ 3:1)', () => {
        // The signature light/dark page bg the storefront sits on. The accent
        // wrapper never overrides bg, so the ring is judged against it.
        expect(ratio(focusRing, '#FFFFFF')).toBeGreaterThanOrEqual(AA_LARGE_OR_NONTEXT);
      });
    });
  }
});
