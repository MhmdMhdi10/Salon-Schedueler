import { describe, it, expect } from 'vitest';
import {
  contrastRatio,
  onAccentForeground,
  ensureAaFill,
  AA_TEXT,
} from './contrast';
import { ACCENTS } from '../pages/owner/marketing-assets';

/**
 * Unit tests for the extracted WCAG helpers (task 2.2; R4.3).
 *
 * These lock the two properties the tenant-theming derivation relies on:
 *  - `contrastRatio` matches the known reference points (black/white = 21:1,
 *    identical colors = 1:1);
 *  - `ensureAaFill` always returns a fill on which **white** text clears 4.5:1;
 *  - `onAccentForeground` returns the higher-contrast AA-clearing candidate.
 */

/** Round like the AA gate does, for readable failure messages. */
function ratio(fg: string, bg: string): number {
  return Math.round(contrastRatio(fg, bg) * 100) / 100;
}

describe('contrastRatio (reference points)', () => {
  it('is 21:1 for black on white', () => {
    expect(ratio('#000000', '#FFFFFF')).toBe(21);
  });

  it('is 1:1 for identical colors', () => {
    expect(ratio('#8E2F50', '#8E2F50')).toBe(1);
  });

  it('is symmetric in its arguments', () => {
    expect(contrastRatio('#8E2F50', '#FBF7F2')).toBeCloseTo(
      contrastRatio('#FBF7F2', '#8E2F50'),
      10,
    );
  });

  it('accepts shorthand #rgb hex', () => {
    expect(ratio('#000', '#fff')).toBe(21);
  });
});

describe('ensureAaFill', () => {
  it('leaves an already-AA fill effectively unchanged', () => {
    // Plum-wine primary already clears white-text AA; darkening must not be
    // needed (the returned value still clears the bar).
    const out = ensureAaFill('#8E2F50');
    expect(contrastRatio('#FFFFFF', out)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('darkens a light fill until white text clears 4.5:1', () => {
    // Amber is far too light for white text; the helper must darken it.
    const out = ensureAaFill('#f59e0b');
    expect(out).not.toBe('#F59E0B');
    expect(contrastRatio('#FFFFFF', out)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('returns an AA fill for every curated accent (from-color)', () => {
    for (const accent of ACCENTS) {
      const fill = ensureAaFill(accent.from);
      expect(
        contrastRatio('#FFFFFF', fill),
        `white-on-fill must clear AA for accent "${accent.key}"`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('clears AA even for pure white input', () => {
    const out = ensureAaFill('#FFFFFF');
    expect(contrastRatio('#FFFFFF', out)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('onAccentForeground', () => {
  it('returns white for a dark fill', () => {
    expect(onAccentForeground('#241C18')).toBe('#FFFFFF');
  });

  it('prefers the supplied ink when it clears AA and white does not', () => {
    // Amber raw fill: white fails 4.5:1, the dark ink clears it → choose ink.
    const fg = onAccentForeground('#f59e0b', '#451a03');
    expect(fg).toBe('#451a03');
    expect(contrastRatio(fg, '#f59e0b')).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('picks the higher-contrast candidate when both clear AA', () => {
    // Mid-dark fill where white wins on ratio.
    const fg = onAccentForeground('#6E5C50', '#241C18');
    const ink = '#241C18';
    const better =
      contrastRatio('#FFFFFF', '#6E5C50') >= contrastRatio(ink, '#6E5C50')
        ? '#FFFFFF'
        : ink;
    expect(fg).toBe(better);
  });

  it('always returns an AA-clearing ink once the fill is normalized via ensureAaFill', () => {
    for (const accent of ACCENTS) {
      const fill = ensureAaFill(accent.from);
      const fg = onAccentForeground(fill, accent.ink);
      expect(
        contrastRatio(fg, fill),
        `derived on-accent ink must clear AA for accent "${accent.key}"`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});
