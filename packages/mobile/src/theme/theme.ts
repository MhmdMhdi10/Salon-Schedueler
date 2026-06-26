/**
 * React Native theme derived from the shared design tokens (R6.1).
 *
 * This module maps the single source-of-truth token object in `@salon/shared`
 * (`tokens` — the same values the web app exposes as CSS custom properties) onto
 * a React Native-consumable theme: color / space / radius / type, plus an RTL +
 * Persian typography baseline. It carries **no** web-only constructs (no
 * `var(...)`, no unit strings, no CSS easing where a tuple is needed) so the same
 * brand values render identically on web and native.
 *
 * Presentation only: this introduces no logic and no API/contract changes. The
 * existing screens keep their behavior; they (and future screens) read brand
 * values from here instead of hard-coding hex/px.
 */
import {
  tokens,
  lightColors,
  darkColors,
  spacing,
  radius,
  duration,
  easing,
  fontFamily,
  zIndex,
  typeScale,
  type ColorPalette,
  type ThemeName,
  type Spacing,
  type Radius,
} from '@salon/shared';

/**
 * A single resolved typography variant for React Native. Unlike the web (which
 * uses a unitless line-height multiplier), RN's `lineHeight` is an **absolute**
 * value in device-independent pixels, so we resolve `fontSize * multiplier` here.
 */
export interface RnTypeVariant {
  /** Font size in device-independent pixels. */
  fontSize: number;
  /** Absolute line height in dp (fontSize × the token's line-height multiplier). */
  lineHeight: number;
}

/** The resolved RN type scale, keyed by the same names as the shared token scale. */
export type RnTypeScale = { [K in keyof typeof typeScale]: RnTypeVariant };

/**
 * Base text style every Text component should inherit so Persian renders well in
 * RTL: the Vazirmatn family, right alignment, and `rtl` writing direction. Pair
 * with a type variant for size/line-height.
 */
export interface PersianTextBaseline {
  fontFamily: string;
  /** Logical end alignment for RTL Persian copy. */
  textAlign: 'right';
  /** Bidi base direction for mixed Persian/Latin runs. */
  writingDirection: 'rtl';
}

/** The complete React Native theme for one active mode (light or dark). */
export interface RnTheme {
  /** Which palette is active. */
  name: ThemeName;
  /** True when the UI is laid out right-to-left (Persian default). */
  isRTL: boolean;
  /** Semantic color roles for the active theme. */
  colors: ColorPalette;
  /** Spacing scale (8pt grid), unitless dp numbers. */
  spacing: Spacing;
  /** Border-radius scale, unitless dp numbers. */
  radius: Radius;
  /** Typography: family, RTL/Persian baseline, and the resolved type scale. */
  typography: {
    fontFamily: string;
    /** Drop-in base style for Persian RTL text. */
    baseline: PersianTextBaseline;
    /** Resolved size/line-height variants. */
    variants: RnTypeScale;
  };
  /** Motion durations in milliseconds. */
  duration: typeof duration;
  /** Easing as cubic-bezier control-point tuples for RN animation libraries. */
  easing: typeof easing;
  /** Layering ladder (parity/reference). */
  zIndex: typeof zIndex;
}

/** Resolve the shared (size, multiplier) type scale into RN absolute line heights. */
function buildTypeScale(): RnTypeScale {
  const resolved: Record<string, RnTypeVariant> = {};
  for (const key of Object.keys(typeScale) as (keyof typeof typeScale)[]) {
    const step = typeScale[key];
    resolved[key] = {
      fontSize: step.fontSize,
      // RN needs an absolute line height; round to a whole dp to avoid sub-pixel drift.
      lineHeight: Math.round(step.fontSize * step.lineHeight),
    };
  }
  return resolved as RnTypeScale;
}

/** The shared Persian/RTL text baseline (same for both themes). */
export const persianTextBaseline: PersianTextBaseline = {
  fontFamily: fontFamily.base,
  textAlign: 'right',
  writingDirection: 'rtl',
};

/** The resolved type scale (theme-independent). */
export const rnTypeScale: RnTypeScale = buildTypeScale();

/**
 * Build the RN theme for a given mode. RTL is the Persian default; callers may
 * override (e.g. for a future LTR locale) without touching token values.
 */
export function buildTheme(name: ThemeName, isRTL = true): RnTheme {
  return {
    name,
    isRTL,
    colors: name === 'dark' ? darkColors : lightColors,
    spacing,
    radius,
    typography: {
      fontFamily: fontFamily.base,
      baseline: persianTextBaseline,
      variants: rnTypeScale,
    },
    duration: tokens.duration,
    easing: tokens.easing,
    zIndex: tokens.zIndex,
  };
}

/** Prebuilt light theme (the default per the steering guide). */
export const lightTheme: RnTheme = buildTheme('light');

/** Prebuilt dark theme. */
export const darkTheme: RnTheme = buildTheme('dark');

/** Convenience lookup by name. */
export const themes: Record<ThemeName, RnTheme> = {
  light: lightTheme,
  dark: darkTheme,
};
