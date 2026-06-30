import {
  tokens,
  lightColors,
  darkColors,
  spacing,
  radius,
  typeScale,
  duration,
  easing,
  fontFamily,
  zIndex,
  type ColorPalette,
} from './index';

describe('Shared design tokens', () => {
  describe('color palettes (verbatim from ui-ux-skills.md)', () => {
    it('light palette matches the authoritative hex values', () => {
      expect(lightColors).toEqual({
        bg: '#FBF7F2',
        surface: '#F4ECE1',
        elevated: '#FFFFFF',
        text: '#241C18',
        textMuted: '#6E5C50',
        border: '#E4D8CB',
        primary: '#8E2F50',
        primaryContrast: '#FFFFFF',
        secondary: '#2E6E63',
        accent: '#A6452A',
        success: '#1F7A43',
        warning: '#9A5B12',
        danger: '#B3261E',
        info: '#1F5FAE',
        focusRing: '#8E2F50',
      });
    });

    it('dark palette matches the authoritative hex values', () => {
      expect(darkColors).toEqual({
        bg: '#1A1117',
        surface: '#271A22',
        elevated: '#33232C',
        text: '#F7EBF0',
        textMuted: '#C6ABB5',
        border: '#402E38',
        primary: '#EAA0B8',
        primaryContrast: '#1A1117',
        secondary: '#79C9BB',
        accent: '#ECA486',
        success: '#69D08C',
        warning: '#E7B45C',
        danger: '#F2938C',
        info: '#86B6F0',
        focusRing: '#EAA0B8',
      });
    });

    it('light and dark define exactly the same semantic keys', () => {
      expect(Object.keys(lightColors).sort()).toEqual(Object.keys(darkColors).sort());
    });

    it('uses the salon-luxe plum-wine primary #8E2F50 for text-bearing actions in light mode', () => {
      expect(lightColors.primary).toBe('#8E2F50');
    });
  });

  describe('values are pure and RN-consumable (no web CSS leaks)', () => {
    const colorValues = [...Object.values(lightColors), ...Object.values(darkColors)];

    it('every color is a plain hex string, never a CSS var()', () => {
      for (const value of colorValues) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/i);
        expect(value).not.toContain('var(');
      }
    });

    it('spacing values are unitless numbers', () => {
      for (const value of Object.values(spacing)) {
        expect(typeof value).toBe('number');
      }
    });

    it('radius values are unitless numbers', () => {
      for (const value of Object.values(radius)) {
        expect(typeof value).toBe('number');
      }
    });

    it('type-scale sizes and line heights are numbers', () => {
      for (const step of Object.values(typeScale)) {
        expect(typeof step.fontSize).toBe('number');
        expect(typeof step.lineHeight).toBe('number');
      }
    });

    it('durations are numbers in milliseconds', () => {
      for (const value of Object.values(duration)) {
        expect(typeof value).toBe('number');
      }
    });
  });

  describe('spacing (8pt grid)', () => {
    it('matches the authoritative scale', () => {
      expect(spacing).toEqual({ 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 8: 48, 10: 64 });
    });
  });

  describe('radius', () => {
    it('matches the authoritative scale', () => {
      expect(radius).toEqual({ sm: 6, md: 10, lg: 16, pill: 999 });
    });
  });

  describe('typeScale', () => {
    it('resolves rem sizes against the 16px base', () => {
      // 1.0rem body == 16px; 0.875rem helper == 14px; 2.25rem hero == 36px
      expect(typeScale.sm.fontSize).toBe(16);
      expect(typeScale.xs.fontSize).toBe(14);
      expect(typeScale['2xl'].fontSize).toBe(36);
    });

    it('keeps the taller Persian body line height', () => {
      expect(typeScale.sm.lineHeight).toBe(1.75);
    });
  });

  describe('motion', () => {
    it('matches the authoritative durations', () => {
      expect(duration).toEqual({ fast: 150, base: 200, slow: 300 });
    });

    it('exposes easing as both a CSS string and a raw control-point tuple', () => {
      expect(easing.standard.css).toBe('cubic-bezier(0.2,0,0,1)');
      expect(easing.standard.points).toEqual([0.2, 0, 0, 1]);
      expect(easing.emphasized.points).toEqual([0.2, 0, 0, 1.2]);
    });
  });

  describe('typography family', () => {
    it('exposes Vazirmatn as the base family and a CSS fallback stack', () => {
      expect(fontFamily.base).toBe('Vazirmatn');
      expect(fontFamily.cssStack).toContain('Vazirmatn');
    });
  });

  describe('aggregate tokens object', () => {
    it('bundles every token group for the RN ThemeProvider', () => {
      expect(tokens.colors.light).toBe(lightColors);
      expect(tokens.colors.dark).toBe(darkColors);
      expect(tokens.spacing).toBe(spacing);
      expect(tokens.radius).toBe(radius);
      expect(tokens.typeScale).toBe(typeScale);
      expect(tokens.duration).toBe(duration);
      expect(tokens.easing).toBe(easing);
      expect(tokens.zIndex).toBe(zIndex);
    });

    it('the ColorPalette type is satisfied by both themes', () => {
      const themes: ColorPalette[] = [tokens.colors.light, tokens.colors.dark];
      expect(themes).toHaveLength(2);
    });
  });
});
