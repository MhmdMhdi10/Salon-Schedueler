import { useId } from 'react';
import { cn } from '../ui/cn';

/**
 * The motif's three roles (design §2 "Brand motif"):
 *  - `mark`      — logo-scale signature shape beside the wordmark in shells.
 *  - `band`      — a wide hero / section divider flourish.
 *  - `watermark` — a faint, oversized backdrop behind empty states.
 */
export type MotifVariant = 'mark' | 'band' | 'watermark';

export interface MotifProps {
  /** Which signature treatment to render. Defaults to `mark`. */
  variant?: MotifVariant;
  /**
   * Sizing/positioning classes only — **never** color. The motif's fills come
   * from design tokens (`var(--color-primary)` / `var(--color-accent)`) and
   * `currentColor`, so it re-tints automatically per theme and per tenant
   * accent override.
   */
  className?: string;
  /**
   * Decorative by default (`aria-hidden`). The motif carries no information a
   * screen reader needs; pass `false` only if you wrap it with your own label.
   */
  'aria-hidden'?: boolean;
}

/** آرا bloom: three overlapping adornment petals, token-colored. */
function AraBloom({ idPrefix }: { idPrefix: string }) {
  return (
    <g>
      <path
        d="M24 5C13 11 10 22 24 30C38 22 35 11 24 5Z"
        fill="var(--color-primary)"
        data-motif-part={`${idPrefix}-petal-center`}
      />
      <path
        d="M8 18C9 31 16 39 24 30C21 17 14 14 8 18Z"
        fill="var(--color-accent)"
        data-motif-part={`${idPrefix}-petal-start`}
      />
      <path
        d="M40 18C39 31 32 39 24 30C27 17 34 14 40 18Z"
        fill="var(--color-accent)"
        data-motif-part={`${idPrefix}-petal-end`}
      />
      <circle cx="24" cy="31" r="3" fill="currentColor" />
    </g>
  );
}

/**
 * Signature آرا adornment motif — a token-driven petal/bloom arc. It uses
 * **only** `var(--color-primary)` / `var(--color-accent)` and
 * `currentColor` for color, so a tenant storefront's runtime accent override
 * re-tints it for free and it never hard-codes a hex. Decorative by default.
 */
export function Motif({
  variant = 'mark',
  className,
  'aria-hidden': ariaHidden = true,
}: MotifProps) {
  // A document-unique id so the band gradient never collides when several
  // motifs render on one page (SVG paint-server refs are document-global).
  const uid = useId().replace(/:/g, '');
  const common = {
    className: cn(className),
    'aria-hidden': ariaHidden,
    focusable: false as const,
    xmlns: 'http://www.w3.org/2000/svg',
  };

  if (variant === 'band') {
    // A horizontal line with a small bloom centered on it.
    const fadeId = `motif-band-fade-${uid}`;
    return (
      <svg {...common} viewBox="0 0 320 48" preserveAspectRatio="xMidYMid meet" data-motif="band">
        <defs>
          <linearGradient id={fadeId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0" />
            <stop offset="0.5" stopColor="var(--color-accent)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Hairline that fades toward both edges, passing behind the bloom. */}
        <rect x="16" y="23" width="288" height="2" rx="1" fill={`url(#${fadeId})`} />
        {/* Small accent dots flanking the center mark */}
        <circle cx="112" cy="24" r="2" fill="var(--color-accent)" opacity="0.85" />
        <circle cx="208" cy="24" r="2" fill="var(--color-accent)" opacity="0.85" />
        {/* Centered bloom mark (scaled down) */}
        <g transform="translate(160 24) scale(0.6)">
          <g transform="translate(-24 -24)">
            <AraBloom idPrefix={`band-${uid}`} />
          </g>
        </g>
      </svg>
    );
  }

  if (variant === 'watermark') {
    // Faint oversized bloom backdrop at low opacity, drawn in
    // currentColor so it sits quietly behind content as a texture.
    return (
      <svg
        {...common}
        viewBox="0 0 48 48"
        preserveAspectRatio="xMidYMid meet"
        data-motif="watermark"
        opacity={0.06}
        color="var(--color-primary)"
      >
        <g color="var(--color-primary)">
          <AraBloom idPrefix="watermark" />
        </g>
      </svg>
    );
  }

  // `mark` — the logo-scale signature shape.
  return (
    <svg {...common} viewBox="0 0 48 48" preserveAspectRatio="xMidYMid meet" data-motif="mark">
      <AraBloom idPrefix="mark" />
    </svg>
  );
}

export default Motif;
