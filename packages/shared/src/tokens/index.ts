/**
 * Shared design tokens — pure values for cross-platform parity (web + React Native).
 *
 * These are the single source of truth for the token *values* defined in
 * `.kiro/steering/ui-ux-skills.md`. The web app exposes them as CSS custom
 * properties (`:root` / `[data-theme="dark"]`); React Native consumes this object
 * directly through its ThemeProvider so color/space/radius/type are identical
 * across platforms.
 *
 * Conventions (so the same values work on both web and RN):
 * - Colors are plain hex strings.
 * - Spacing and radius are unitless numbers in **device-independent pixels** (px on
 *   web, dp/points in RN). The web stylesheet appends `px`; RN uses the number as-is.
 * - Font sizes are numbers in **pixels** (the rem values from the type scale resolved
 *   against the 16px base, e.g. 0.875rem -> 14). The web stylesheet may re-express
 *   them in rem; RN uses the pixel number directly.
 * - Line heights are unitless multipliers (multiply by font size for RN `lineHeight`).
 * - Durations are numbers in **milliseconds**.
 *
 * No web-only constructs (no `var(...)`, no units, no easing strings RN can't use as
 * timing values) leak into RN: easing is provided both as a CSS string and as a raw
 * cubic-bezier control-point tuple for RN animation libraries.
 */

/** Semantic color roles for a single theme. */
export interface ColorPalette {
  /** Page background */
  bg: string;
  /** Cards, sheets */
  surface: string;
  /** Menus, dialogs, popovers */
  elevated: string;
  /** Primary text */
  text: string;
  /** Secondary/help text */
  textMuted: string;
  /** Dividers, input borders */
  border: string;
  /** Brand actions, CTAs */
  primary: string;
  /** Text/icon on primary */
  primaryContrast: string;
  /** Secondary actions */
  secondary: string;
  /** Highlights, badges */
  accent: string;
  /** Booked, paid, confirmed */
  success: string;
  /** Expiring OTP, low slots */
  warning: string;
  /** Failed pay, cancel, errors */
  danger: string;
  /** Neutral notices */
  info: string;
  /** Focus outline */
  focusRing: string;
}

/** Light theme palette (verbatim from ui-ux-skills.md). */
export const lightColors: ColorPalette = {
  bg: '#ffffff',
  surface: '#f7f8fa',
  elevated: '#ffffff',
  text: '#16181d',
  textMuted: '#5b6472',
  border: '#e3e6eb',
  primary: '#5457e6',
  primaryContrast: '#ffffff',
  secondary: '#0ea5a4',
  accent: '#d946ef',
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
  info: '#1d4ed8',
  focusRing: '#5457e6',
};

/** Dark theme palette (verbatim from ui-ux-skills.md). */
export const darkColors: ColorPalette = {
  bg: '#0b0f1a',
  surface: '#121826',
  elevated: '#1b2233',
  text: '#eef1f6',
  textMuted: '#9aa4b2',
  border: '#2a3344',
  primary: '#818cf8',
  primaryContrast: '#0b0f1a',
  secondary: '#2dd4bf',
  accent: '#e879f9',
  success: '#4ade80',
  warning: '#fbbf24',
  danger: '#f87171',
  info: '#60a5fa',
  focusRing: '#a5b4fc',
};

/**
 * Spacing scale on the 8pt grid, in device-independent pixels.
 * (4 only for tight icon/text gaps; everything else a multiple of 8.)
 */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  8: 48,
  10: 64,
} as const;

/** Border-radius scale, in device-independent pixels (`pill` is an effectively-full radius). */
export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/** A single type-scale step: size in px (16px base) plus a unitless line-height multiplier. */
export interface TypeScaleStep {
  /** Font size in pixels (rem * 16). */
  fontSize: number;
  /** Unitless line-height multiplier. */
  lineHeight: number;
}

/**
 * Typography scale (verbatim from ui-ux-skills.md), with rem sizes resolved to px
 * against the 16px base so the numbers are RN-consumable.
 */
export const typeScale = {
  /** 0.75rem — captions, legal */
  '2xs': { fontSize: 12, lineHeight: 1.7 },
  /** 0.875rem — helper text */
  xs: { fontSize: 14, lineHeight: 1.7 },
  /** 1.0rem — body (Farsi default) */
  sm: { fontSize: 16, lineHeight: 1.75 },
  /** 1.125rem — lead paragraph */
  md: { fontSize: 18, lineHeight: 1.7 },
  /** 1.375rem — section title (h2) */
  lg: { fontSize: 22, lineHeight: 1.45 },
  /** 1.75rem — page title (h1) */
  xl: { fontSize: 28, lineHeight: 1.35 },
  /** 2.25rem — marketing hero */
  '2xl': { fontSize: 36, lineHeight: 1.25 },
} as const satisfies Record<string, TypeScaleStep>;

/**
 * Font family stack. RN typically registers the single family name (`Vazirmatn`);
 * the full CSS stack is the web fallback chain.
 */
export const fontFamily = {
  base: 'Vazirmatn',
  cssStack: "'Vazirmatn', system-ui, 'Segoe UI', Tahoma, sans-serif",
} as const;

/** Motion durations in milliseconds. */
export const duration = {
  fast: 150,
  base: 200,
  slow: 300,
} as const;

/**
 * Easing curves. `css` is the ready-to-use CSS timing-function string; `points` is the
 * raw cubic-bezier control-point tuple [x1, y1, x2, y2] for RN animation libraries.
 */
export const easing = {
  standard: { css: 'cubic-bezier(0.2,0,0,1)', points: [0.2, 0, 0, 1] },
  emphasized: { css: 'cubic-bezier(0.2,0,0,1.2)', points: [0.2, 0, 0, 1.2] },
} as const;

/** Z-index ladder (web layering; included for parity/reference). */
export const zIndex = {
  base: 0,
  sticky: 100,
  nav: 200,
  overlay: 1000,
  dialog: 1100,
  toast: 1200,
} as const;

/**
 * The complete, pure token object. Consumed directly by the RN ThemeProvider and
 * mirrored by the web CSS custom properties.
 */
export const tokens = {
  colors: {
    light: lightColors,
    dark: darkColors,
  },
  spacing,
  radius,
  typeScale,
  fontFamily,
  duration,
  easing,
  zIndex,
} as const;

/** A resolved set of color tokens for one active theme. */
export type ThemeName = 'light' | 'dark';

export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type TypeScale = typeof typeScale;
export type Tokens = typeof tokens;
