/**
 * Curated Brand_Accent palette shared by tenant theming and the owner
 * marketing studio.
 *
 * Lives in `components/theme` (not `pages/owner/marketing-assets`) so that
 * public storefront surfaces — `TenantTheme` on `/s/:slug`, the QR landing —
 * can resolve accents WITHOUT statically dragging the QR-SVG generator and
 * print/download helpers of the owner studio into their initial JS graph
 * (public-route bundle budget, seo §9). `marketing-assets` re-exports these
 * for its existing consumers.
 */
import type { CSSProperties } from 'react';

/** A brand-accent theme: the gradient pair + soft tint + dark ink. */
export interface AccentTheme {
  key: string;
  from: string;
  to: string;
  soft: string;
  ink: string;
}

/**
 * Curated accent palette (gradient from→to). Values are chosen so white text
 * sits comfortably on the gradient and the QR panel stays high-contrast.
 */
export const ACCENTS: readonly AccentTheme[] = [
  { key: 'violet', from: '#6d5efc', to: '#a855f7', soft: '#efeafe', ink: '#2e1065' },
  { key: 'jade', from: '#0B7A68', to: '#05CFA6', soft: '#E2F7F2', ink: '#073F36' },
  { key: 'teal', from: '#0ea5a4', to: '#0284c7', soft: '#e2fbfb', ink: '#083344' },
  { key: 'rose', from: '#fb7185', to: '#ef4444', soft: '#ffe9ec', ink: '#4c0519' },
  { key: 'amber', from: '#f59e0b', to: '#ea580c', soft: '#fdf0d5', ink: '#451a03' },
  { key: 'emerald', from: '#10b981', to: '#047857', soft: '#dcfbee', ink: '#022c22' },
  { key: 'night', from: '#3b4252', to: '#4f46e5', soft: '#e6e8f0', ink: '#0b1020' },
] as const;

/** Resolve an accent by key, falling back to the first (violet). */
export function resolveAccent(key: string): AccentTheme {
  return ACCENTS.find((a) => a.key === key) ?? ACCENTS[0];
}

/**
 * Inline CSS custom properties an asset reads for its brand colors. Cast to
 * CSSProperties since CSS variables are not in the typed property map.
 */
export function accentVars(a: AccentTheme): CSSProperties {
  return {
    '--asset-from': a.from,
    '--asset-to': a.to,
    '--asset-soft': a.soft,
    '--asset-ink': a.ink,
  } as CSSProperties;
}
