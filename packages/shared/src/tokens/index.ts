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

/**
 * Light theme palette — Booksy-inspired: a vibrant magenta-pink primary on a
 * clean white canvas with cool-neutral grays. Every pairing is WCAG 2.2 AA
 * verified in `web/src/styles/contrast.test.ts`.
 */
export const lightColors: ColorPalette = {
  bg: '#FFFFFF',
  surface: '#F6F7F9',
  elevated: '#FFFFFF',
  text: '#1A1D23',
  textMuted: '#5B6573',
  border: '#E6E8EC',
  primary: '#D81B60',
  primaryContrast: '#FFFFFF',
  secondary: '#1F8A70',
  accent: '#FF6B35',
  success: '#1F7A43',
  warning: '#9A5B12',
  danger: '#B3261E',
  info: '#1F5FAE',
  focusRing: '#D81B60',
};

/**
 * Dark theme palette — Instagram-inspired: a near-black charcoal ground so the
 * magenta brand glows and white text reads crisply. Mirror of the
 * `[data-theme="dark"]` block in `tokens.css`; AA-verified in `contrast.test.ts`.
 */
export const darkColors: ColorPalette = {
  bg: '#121212',
  surface: '#181818',
  elevated: '#1F1F1F',
  text: '#FAFAFA',
  textMuted: '#A8A8A8',
  border: '#262626',
  primary: '#FF6B9D',
  primaryContrast: '#121212',
  secondary: '#79C9BB',
  accent: '#ECA486',
  success: '#69D08C',
  warning: '#E7B45C',
  danger: '#F2938C',
  info: '#86B6F0',
  focusRing: '#FF6B9D',
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

/**
 * Signature display-type pairing (design §2, R1.2/R8.1). Numeric so the
 * display-vs-body relationship is machine-checkable: the web mirror in
 * `tokens.css` declares the matching `--font-weight-body` / `--font-weight-display`
 * / `--line-height-display` / `--tracking-display` custom properties, and
 * `styles/tokens-complete.test.ts` asserts the invariant
 * `display weight > body weight` AND `display line-height < body line-height`,
 * so heading text can never render visually uniform with body copy.
 *
 *  - weights are unitless OpenType weight values (Vazirmatn is a 100–900 variable face);
 *  - line heights are unitless multipliers (body matches the `sm` body step, 1.75);
 *  - `displayTracking` is letter-spacing in **em** (negative = tighter; `-0.01em` on web).
 */
export const typography = {
  fontWeights: {
    body: 400,
    display: 800,
  },
  lineHeight: {
    body: 1.75,
    display: 1.15,
  },
  /** Letter-spacing in em. */
  tracking: {
    display: -0.01,
  },
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
  typography,
  duration,
  easing,
  zIndex,
} as const;

/** A resolved set of color tokens for one active theme. */
export type ThemeName = 'light' | 'dark';

export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type TypeScale = typeof typeScale;
export type Typography = typeof typography;
export type Tokens = typeof tokens;
