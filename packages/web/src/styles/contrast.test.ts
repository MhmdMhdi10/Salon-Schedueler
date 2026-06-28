import { describe, it, expect } from 'vitest';
import { lightColors, darkColors, type ColorPalette } from '@salon/shared';
import { contrastRatio, AA_TEXT, AA_LARGE_OR_NONTEXT } from './contrast';

/**
 * Token contrast verification — WCAG 2.2 AA (task 10.2; R1.3, R10.x; ui-ux §3).
 *
 * axe-core **cannot compute `color-contrast` under jsdom** (it has no layout /
 * computed-color engine — see `src/test/a11y.tsx`, which intentionally ignores
 * the rule so the gate stays meaningful). That leaves a real hole: nothing
 * automatically proves the palette clears AA. This file closes it by computing
 * the WCAG contrast ratio directly from the **authoritative token values**
 * (`@salon/shared` — the single source of truth the web CSS variables mirror)
 * and asserting every foreground/background pairing the UI actually ships, in
 * **both** the light and dark themes.
 *
 * The relative-luminance / contrast-ratio math lives in `./contrast` (the single
 * implementation shared with the tenant-theming color derivation); this file
 * imports it so there is no duplicate copy to drift.
 *
 * Thresholds (WCAG 2.1/2.2 §1.4.3 + §1.4.11):
 *  - **4.5:1** — normal body / UI text ({@link AA_TEXT}).
 *  - **3:1** — large text (≥ 24px or 18.66px bold) and meaningful non-text
 *    (focus ring, decorative status fills that are paired with a text label).
 *
 * The pairings below are taken from how the components compose the tokens
 * (Button / Badge / SlotGrid / TextField / FunnelShell / shells), verified by
 * grep when this test was written. If a component starts using a token pair in
 * a way that drops below its threshold, this test fails before it ships.
 */

/** Round for readable failure messages without hiding a near-miss. */
function ratio(fg: string, bg: string): number {
  return Math.round(contrastRatio(fg, bg) * 100) / 100;
}

describe('contrastRatio (sanity)', () => {
  it('is 21:1 for black on white and 1:1 for identical colors', () => {
    expect(ratio('#000000', '#ffffff')).toBe(21);
    expect(ratio('#5457e6', '#5457e6')).toBe(1);
  });
});

/**
 * Runs the full AA matrix against one theme palette. Called for both light and
 * dark so neither mode is "invert and ship" (ui-ux §2).
 */
function describeTheme(themeName: string, c: ColorPalette) {
  describe(`${themeName} theme — token contrast (WCAG AA)`, () => {
    // --- Body / UI text on every surface it can sit on (≥ 4.5:1) -----------
    describe('primary & muted text on bg / surface / elevated (≥ 4.5:1)', () => {
      const surfaces: Array<[string, string]> = [
        ['bg', c.bg],
        ['surface', c.surface],
        ['elevated', c.elevated],
      ];
      for (const [surfaceName, surface] of surfaces) {
        it(`text on ${surfaceName}`, () => {
          expect(ratio(c.text, surface)).toBeGreaterThanOrEqual(AA_TEXT);
        });
        it(`muted text on ${surfaceName}`, () => {
          expect(ratio(c.textMuted, surface)).toBeGreaterThanOrEqual(AA_TEXT);
        });
      }
    });

    // --- Text-bearing fills: label color on the fill (≥ 4.5:1) -------------
    // Button primary/danger render `text-primary-contrast` on the fill; the
    // selected SlotGrid chip and current FunnelShell step do the same.
    describe('text-bearing fills carry ≥ 4.5:1 label contrast', () => {
      it('primary-contrast on primary (primary Button, selected slot, current step)', () => {
        expect(ratio(c.primaryContrast, c.primary)).toBeGreaterThanOrEqual(
          AA_TEXT,
        );
      });
      it('primary-contrast on danger (danger Button)', () => {
        expect(ratio(c.primaryContrast, c.danger)).toBeGreaterThanOrEqual(
          AA_TEXT,
        );
      });
    });

    // --- Status colors used AS TEXT over tinted surfaces (≥ 4.5:1) ---------
    // Badge (`bg-<status>/10 text-<status>`) and Toast accents render the
    // status hue as text. The tint is ~10% over bg, so bg is the conservative
    // backdrop to test against. SlotGrid "held" uses warning text the same way.
    describe('status colors as text on bg (≥ 4.5:1)', () => {
      const statusAsText: Array<[string, string]> = [
        ['success', c.success],
        ['warning', c.warning],
        ['danger', c.danger],
        ['info', c.info],
        ['primary (links, accents)', c.primary],
      ];
      for (const [name, color] of statusAsText) {
        it(`${name} text on bg`, () => {
          expect(ratio(color, c.bg)).toBeGreaterThanOrEqual(AA_TEXT);
        });
        it(`${name} text on surface`, () => {
          expect(ratio(color, c.surface)).toBeGreaterThanOrEqual(AA_TEXT);
        });
      }
    });

    // --- Non-text / large (≥ 3:1) ------------------------------------------
    describe('focus ring & decorative fills (≥ 3:1)', () => {
      it('focus ring on bg', () => {
        expect(ratio(c.focusRing, c.bg)).toBeGreaterThanOrEqual(
          AA_LARGE_OR_NONTEXT,
        );
      });
      it('focus ring on surface', () => {
        expect(ratio(c.focusRing, c.surface)).toBeGreaterThanOrEqual(
          AA_LARGE_OR_NONTEXT,
        );
      });
      // The completed-step badge in FunnelShell is `bg-secondary` with a white
      // glyph; it is `aria-hidden` decoration paired with a text label, so the
      // 3:1 non-text bar applies (the white "✓"/number is large + bold).
      it('primary-contrast on secondary (decorative completed-step badge)', () => {
        expect(ratio(c.primaryContrast, c.secondary)).toBeGreaterThanOrEqual(
          AA_LARGE_OR_NONTEXT,
        );
      });
    });
  });
}

describeTheme('light', lightColors);
describeTheme('dark', darkColors);
