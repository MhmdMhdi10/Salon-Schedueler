import fc from 'fast-check';
import {
  lightColors,
  darkColors,
  spacing,
  radius,
  typeScale,
  fontFamily,
  duration,
  easing,
  zIndex,
} from '@salon/shared';
import {
  buildTheme,
  lightTheme,
  darkTheme,
  themes,
  rnTypeScale,
  persianTextBaseline,
} from './theme';

/**
 * Unit + property tests for the React Native theme derived from shared tokens.
 * Validates that the RN theme is a faithful, RN-consumable mapping of the single
 * source-of-truth token values (R6.1) and establishes the RTL/Persian baseline
 * (R6.5).
 */
describe('RN theme mapping from shared tokens', () => {
  describe('color parity (R6.1)', () => {
    it('light theme uses the shared light palette verbatim', () => {
      expect(lightTheme.colors).toEqual(lightColors);
    });

    it('dark theme uses the shared dark palette verbatim', () => {
      expect(darkTheme.colors).toEqual(darkColors);
    });

    it('selects the palette by name', () => {
      expect(buildTheme('light').colors).toBe(lightColors);
      expect(buildTheme('dark').colors).toBe(darkColors);
    });

    it('carries no web-only var() constructs in any color', () => {
      const all = [
        ...Object.values(lightTheme.colors),
        ...Object.values(darkTheme.colors),
      ];
      for (const value of all) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });
  });

  describe('spacing & radius parity', () => {
    it('reuses the shared spacing scale unchanged', () => {
      expect(lightTheme.spacing).toBe(spacing);
      expect(darkTheme.spacing).toBe(spacing);
    });

    it('reuses the shared radius scale unchanged', () => {
      expect(lightTheme.radius).toBe(radius);
    });
  });

  describe('typography (R6.5)', () => {
    it('uses the Vazirmatn family from shared tokens', () => {
      expect(lightTheme.typography.fontFamily).toBe(fontFamily.base);
      expect(fontFamily.base).toBe('Vazirmatn');
    });

    it('resolves the shared multiplier line heights to absolute RN dp values', () => {
      // sm body: 16px × 1.75 = 28
      expect(rnTypeScale.sm.fontSize).toBe(16);
      expect(rnTypeScale.sm.lineHeight).toBe(28);
      // xl page title: 28px × 1.35 = 37.8 -> rounded 38
      expect(rnTypeScale.xl.fontSize).toBe(28);
      expect(rnTypeScale.xl.lineHeight).toBe(Math.round(28 * 1.35));
    });

    it('keeps the same variant keys as the shared type scale', () => {
      expect(Object.keys(rnTypeScale).sort()).toEqual(Object.keys(typeScale).sort());
    });

    it('establishes a Persian RTL text baseline', () => {
      expect(persianTextBaseline).toEqual({
        fontFamily: 'Vazirmatn',
        textAlign: 'right',
        writingDirection: 'rtl',
      });
      expect(lightTheme.typography.baseline).toBe(persianTextBaseline);
    });
  });

  describe('RTL default', () => {
    it('defaults to RTL for the Persian-first UI', () => {
      expect(lightTheme.isRTL).toBe(true);
      expect(darkTheme.isRTL).toBe(true);
    });

    it('allows an explicit LTR override without touching token values', () => {
      const ltr = buildTheme('light', false);
      expect(ltr.isRTL).toBe(false);
      expect(ltr.colors).toEqual(lightColors);
    });
  });

  describe('motion & layering parity', () => {
    it('reuses durations, easing tuples, and z-index ladder', () => {
      expect(lightTheme.duration).toBe(duration);
      expect(lightTheme.easing).toBe(easing);
      expect(lightTheme.zIndex).toBe(zIndex);
    });

    it('exposes easing as RN cubic-bezier control-point tuples', () => {
      expect(lightTheme.easing.standard.points).toEqual([0.2, 0, 0, 1]);
    });
  });

  describe('themes lookup', () => {
    it('maps both names to the prebuilt themes', () => {
      expect(themes.light).toBe(lightTheme);
      expect(themes.dark).toBe(darkTheme);
    });
  });

  /**
   * Property: for any theme name, the built RN theme's resolved line heights are
   * exactly round(fontSize × multiplier) for every variant, and font sizes pass
   * through unchanged — i.e. the mapping never invents or drops type values.
   *
   * **Validates: Requirements 6.5**
   */
  describe('property: type scale is a faithful resolution of shared tokens', () => {
    it('lineHeight = round(fontSize × multiplier) for every variant and theme', () => {
      fc.assert(
        fc.property(fc.constantFrom('light', 'dark'), (name) => {
          const theme = buildTheme(name as 'light' | 'dark');
          for (const key of Object.keys(typeScale) as (keyof typeof typeScale)[]) {
            const shared = typeScale[key];
            const resolved = theme.typography.variants[key];
            expect(resolved.fontSize).toBe(shared.fontSize);
            expect(resolved.lineHeight).toBe(Math.round(shared.fontSize * shared.lineHeight));
          }
        }),
      );
    });
  });
});
