import type { CSSProperties, ReactNode } from 'react';
import { ACCENTS, resolveAccent } from '../../pages/owner/marketing-assets';
import { deriveTenantTokens } from './tenantTokens';

export interface TenantThemeProps {
  /**
   * Brand_Accent key (from the curated `ACCENTS`). `null`/`undefined`/unknown
   * → the signature default (no overrides are applied).
   */
  accentKey?: string | null;
  /** Optional class on the scoped wrapper element. */
  className?: string;
  children: ReactNode;
}

/**
 * Scopes a salon's Brand_Accent to its storefront subtree (signature-ui-system
 * design §4, R4.2/R4.4/R4.7/R4.8).
 *
 * The accent is written as **inline CSS custom properties** on this element
 * only, overriding `--color-primary`, `--color-primary-contrast`,
 * `--color-accent`, and `--color-focus-ring` for everything inside — and
 * nothing outside (R4.7). Because cascade variables inherit, the unchanged
 * Component_Library picks them up with zero code change.
 *
 * Resolution is **total and safe** (R4.4, Property 7): only a key present in the
 * curated `ACCENTS` applies overrides; a nullish, unknown, or malformed key
 * applies **no** overrides and the subtree inherits the signature default
 * palette (a usable theme — it never renders unstyled and never retries).
 *
 * Only the four accent-related variables are overridden, so `--color-bg` /
 * `--color-surface` / `--color-text` still resolve from `:root` vs
 * `[data-theme="dark"]` — theme-switching and `prefers-reduced-motion` are
 * unchanged by this wrapper (R4.8, Property 10). The wrapper itself adds no
 * motion.
 */
export function TenantTheme({ accentKey, className, children }: TenantThemeProps) {
  // Apply overrides only for a *known* accent (Property 7: invalid → signature
  // default, i.e. no overrides). `resolveAccent` would fall back to ACCENTS[0]
  // for any string, so guard on membership first to keep an unknown key on the
  // signature default rather than silently tinting it.
  const isKnown =
    typeof accentKey === 'string' && ACCENTS.some((a) => a.key === accentKey);
  const style: CSSProperties | undefined = isKnown
    ? deriveTenantTokens(resolveAccent(accentKey as string))
    : undefined;

  return (
    <div data-tenant-theme={isKnown ? (accentKey as string) : 'default'} style={style} className={className}>
      {children}
    </div>
  );
}

export default TenantTheme;
