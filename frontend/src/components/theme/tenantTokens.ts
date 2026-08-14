import type { CSSProperties } from 'react';
import type { AccentTheme } from './accents';
import { onAccentForeground, ensureAaFill } from '../../styles/contrast';

/**
 * Derive the per-tenant CSS custom-property override map for a Brand_Accent
 * (signature-ui-system design §4, R4.3/R4.7).
 *
 * The Tenant_Theming_System keeps the Component_Library tokens-only, so a
 * salon's accent is never an authored literal — it is injected as runtime CSS
 * custom properties on a scoped wrapper ({@link TenantTheme}). This function
 * turns the existing {@link AccentTheme} (`{ key, from, to, soft, ink }`) into
 * the **four** accent-related variables the wrapper overrides — and only those
 * four, so `--color-bg` / `--color-surface` / `--color-text` still resolve from
 * `:root` vs `[data-theme="dark"]` and theme-switching keeps working (R4.8).
 *
 * The contrast is *grounded, not assumed* (design §4): white-on-`from` is unsafe
 * for most curated accents, so:
 *  - `--color-primary` = {@link ensureAaFill}(`from`) — the fill is darkened
 *    deterministically until **white** text clears 4.5:1, keeping a vivid but
 *    AA-legible brand action;
 *  - `--color-primary-contrast` = {@link onAccentForeground}(primary, ink) —
 *    whichever of white or the accent's dark `ink` clears AA on that fill;
 *  - `--color-accent` = `to` (a non-text highlight, ≥ 3:1 use only);
 *  - `--color-focus-ring` = the AA primary fill.
 *
 * Pure (no React/DOM) so it is trivially unit- and property-testable. The WCAG
 * math is imported from `styles/contrast` — the single shared implementation
 * (no duplicate copy to drift).
 */
export function deriveTenantTokens(accent: AccentTheme): CSSProperties {
  const primary = ensureAaFill(accent.from);
  // Cast: CSS custom properties are not part of the typed CSSProperties map.
  return {
    '--color-primary': primary,
    '--color-primary-contrast': onAccentForeground(primary, accent.ink),
    '--color-accent': accent.to,
    '--color-focus-ring': primary,
  } as CSSProperties;
}
