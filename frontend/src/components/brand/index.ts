/**
 * Brand module barrel: the signature `Motif` device (design §2, R1.3, R2.5).
 *
 * The motif is the one reusable brand shape — a token-driven "petal arc" — used
 * as a logo-scale `mark`, a hero/section `band` divider, and a faint
 * `watermark` behind empty states. It is colored entirely by tokens
 * (`var(--color-primary)` / `var(--color-accent)`) and `currentColor`, so it
 * re-tints with the theme and with any tenant accent override.
 */
export { Motif } from './Motif';
export type { MotifProps, MotifVariant } from './Motif';
export { BrandLogo } from './BrandLogo';
export type { BrandLogoProps } from './BrandLogo';
