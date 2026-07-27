import { describe, it, expect } from 'vitest';
import { lightColors, darkColors, typography, type ColorPalette } from '@salon/shared';

/**
 * Token completeness + display-vs-body distinctiveness guardrail
 * (signature-ui-system tasks 16.1; R1.1, R1.2, R1.6, R8.1).
 *
 * Where `contrast.test.ts` proves the shipped palette clears WCAG AA, this file
 * proves the identity is *complete in each theme* and that the signature display
 * type can never collapse into body type. Both checks run against the
 * authoritative token values in `@salon/shared` (the single source of truth the
 * web CSS custom properties mirror).
 *
 *  - **Property 2 — Token completeness across both themes:** for every semantic
 *    role in `ColorPalette`, BOTH `lightColors` and `darkColors` define a
 *    non-empty value, so neither theme is missing a role.
 *  - **Property 3 — Display type is always distinct from body type:** the
 *    display weight is strictly greater than the body weight AND the display
 *    line-height is strictly less than the body line-height, so headings can
 *    never render visually uniform with body copy.
 */

/**
 * Every semantic role in `ColorPalette`, listed exhaustively. Typed as
 * `Record<keyof ColorPalette, true>` so adding a role to the interface without
 * adding it here is a **compile error** — the iteration below can never silently
 * skip a role. (TypeScript interfaces have no runtime representation, so this is
 * how we enumerate the keys while keeping the list provably complete.)
 */
const COLOR_ROLES: Record<keyof ColorPalette, true> = {
  bg: true,
  surface: true,
  elevated: true,
  text: true,
  textMuted: true,
  border: true,
  primary: true,
  primaryContrast: true,
  secondary: true,
  accent: true,
  success: true,
  warning: true,
  danger: true,
  info: true,
  focusRing: true,
};

const ROLES = Object.keys(COLOR_ROLES) as Array<keyof ColorPalette>;

/** A non-empty hex color: `#` + 3, 4, 6, or 8 hex digits. */
const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Validates: Requirements 1.1, 1.6 — Property 2: Token completeness across both
 * themes. Iterates EVERY ColorPalette role so a missing or empty value in either
 * theme fails.
 */
describe('Property 2: token completeness across both themes', () => {
  const themes: Array<[string, ColorPalette]> = [
    ['light', lightColors],
    ['dark', darkColors],
  ];

  for (const [themeName, palette] of themes) {
    describe(`${themeName} theme defines every role`, () => {
      for (const role of ROLES) {
        it(`${role} is a non-empty hex value`, () => {
          const value = palette[role];
          expect(value, `${themeName}.${role} must be defined`).toBeDefined();
          expect(typeof value).toBe('string');
          expect(value.trim().length).toBeGreaterThan(0);
          expect(value).toMatch(HEX);
        });
      }
    });
  }

  it('both themes define the exact same set of roles', () => {
    expect(Object.keys(lightColors).sort()).toEqual(ROLES.slice().sort());
    expect(Object.keys(darkColors).sort()).toEqual(ROLES.slice().sort());
  });
});

/**
 * Validates: Requirements 1.2, 8.1 — Property 3: Display type is always distinct
 * from body type. The relationship is encoded in the shared `typography` tokens
 * so heading text can never render visually uniform with body copy.
 */
describe('Property 3: display type is always distinct from body type', () => {
  it('display weight is strictly heavier than body weight', () => {
    expect(typography.fontWeights.display).toBeGreaterThan(typography.fontWeights.body);
  });

  it('display line-height is strictly tighter than body line-height', () => {
    expect(typography.lineHeight.display).toBeLessThan(typography.lineHeight.body);
  });

  it('both relationships hold together (no uniform-with-body exception)', () => {
    const distinct =
      typography.fontWeights.display > typography.fontWeights.body &&
      typography.lineHeight.display < typography.lineHeight.body;
    expect(distinct).toBe(true);
  });
});
