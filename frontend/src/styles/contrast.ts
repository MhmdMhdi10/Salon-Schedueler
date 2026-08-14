/**
 * WCAG 2.2 contrast math — the single implementation shared by the token AA
 * gate (`contrast.test.ts`) and the tenant-theming color derivation
 * (`components/theme/tenantTokens.ts`).
 *
 * This logic originally lived inside `contrast.test.ts`; it is extracted here so
 * there is exactly **one** relative-luminance / contrast-ratio implementation
 * the rest of the app can reuse (design §4 — "we extract it into a shared
 * `styles/contrast.ts` so both the test and `tenantTokens.ts` import one
 * implementation, no duplication"). Pure functions only — no React, no DOM — so
 * it is trivially unit- and property-testable.
 *
 * Thresholds (WCAG 2.1/2.2 §1.4.3 + §1.4.11):
 *  - **4.5:1** — normal body / UI text ({@link AA_TEXT}).
 *  - **3:1** — large text (≥ 24px or 18.66px bold) and meaningful non-text
 *    (focus ring, decorative fills paired with a label) ({@link AA_LARGE_OR_NONTEXT}).
 */

/** Minimum contrast for normal body / UI text (WCAG §1.4.3). */
export const AA_TEXT = 4.5;

/** Minimum contrast for large text and non-text UI (WCAG §1.4.11). */
export const AA_LARGE_OR_NONTEXT = 3;

/** Pure white — the conventional on-accent ink candidate. */
const WHITE = '#FFFFFF';

// --- hex parsing / formatting ----------------------------------------------

/** Parse a `#rgb` or `#rrggbb` hex string into 8-bit channels. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`expected a #rgb or #rrggbb hex color, got "${hex}"`);
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const int = parseInt(h, 16);
  return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
}

/** Clamp to a valid 8-bit channel (0..255), rounding to the nearest integer. */
function clamp8(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Format 8-bit channels as an uppercase `#RRGGBB` string. */
function rgbToHex(r: number, g: number, b: number): string {
  const hex = (n: number) => clamp8(n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

// --- WCAG relative-luminance / contrast-ratio math (sRGB) ------------------

/** Linearize one gamma-encoded 8-bit sRGB channel (WCAG §1.4.3 formula). */
export function channelToLinear(value8bit: number): number {
  const c = value8bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance (0..1) of an opaque `#rgb`/`#rrggbb` color. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/** WCAG contrast ratio (1..21) between two opaque hex colors. */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// --- on-accent foreground derivation (design §4) ---------------------------

/**
 * Pick the legible on-accent ink for a brand fill.
 *
 * Returns whichever of pure white or the supplied `ink` has the **higher**
 * contrast against `fill`, preferring a candidate that clears the AA threshold
 * (default {@link AA_TEXT}). "White text on the accent" is unsafe for several of
 * the curated accents (design §4: only 2 of 7 clear white-on-`from`), so this
 * deliberately considers the dark `ink` too.
 *
 * Total by construction: if neither candidate clears the threshold it returns
 * the best-available (highest-ratio) candidate rather than throwing — callers
 * that need a guaranteed-AA pair first run the fill through {@link ensureAaFill}.
 *
 * @param fill  The accent fill the text sits on (`#rgb`/`#rrggbb`).
 * @param ink   Optional dark ink candidate (e.g. an `AccentTheme.ink`).
 * @param threshold  Contrast bar to clear; defaults to body-text AA (4.5:1).
 */
export function onAccentForeground(
  fill: string,
  ink?: string,
  threshold: number = AA_TEXT,
): string {
  const candidates = ink ? [WHITE, ink] : [WHITE];
  const scored = candidates
    .map((color) => ({ color, ratio: contrastRatio(color, fill) }))
    .sort((a, b) => b.ratio - a.ratio);
  const passing = scored.find((s) => s.ratio >= threshold);
  return (passing ?? scored[0]).color;
}

/**
 * Deterministically darken a fill until **white text** clears the AA threshold
 * (default {@link AA_TEXT}). Channels are scaled toward black by a fixed factor,
 * which preserves the hue ratio while monotonically lowering luminance — so the
 * loop always terminates (black clears 21:1 against white). If the fill already
 * clears the threshold it is returned unchanged (normalized to `#RRGGBB`).
 *
 * Used to keep a vivid tenant brand action legible: `ensureAaFill(accent.from)`
 * yields a `--color-primary` on which white `--color-primary-contrast` is AA
 * (design §4, R4.3).
 *
 * @param hex        The starting fill (`#rgb`/`#rrggbb`).
 * @param threshold  Contrast bar white text must clear; defaults to 4.5:1.
 */
export function ensureAaFill(hex: string, threshold: number = AA_TEXT): string {
  let { r, g, b } = hexToRgb(hex);
  let out = rgbToHex(r, g, b);
  // Scale toward black until white text is legible. The factor keeps r:g:b
  // (hue) roughly constant; floats retain precision across iterations so the
  // value converges to #000000 rather than stalling on rounding.
  const STEP = 0.92;
  for (let guard = 0; guard < 100 && contrastRatio(WHITE, out) < threshold; guard++) {
    r *= STEP;
    g *= STEP;
    b *= STEP;
    out = rgbToHex(r, g, b);
  }
  return out;
}
