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

/**
 * Two crossed straight razor blades in a 48×48 coordinate box, centered at (24,24).
 * Each blade is a diagonal line with slightly curved razor ends. The blades use
 * alternating primary/accent tokens; the center diamond uses `currentColor` for
 * adaptive visibility against any surface.
 */
function CrossedRazors({ idPrefix }: { idPrefix: string }) {
  return (
    <g>
      {/* Blade 1: top-left to bottom-right diagonal */}
      <path
        d="M8 8 C 10 12 14 18 22 22 L 26 26 C 34 30 38 36 40 40 L 42 38 C 38 34 34 28 26 24 L 22 22 C 14 16 10 10 10 6 Z"
        fill="var(--color-primary)"
        data-motif-part={`${idPrefix}-blade-1`}
      />
      {/* Blade 2: top-right to bottom-left diagonal */}
      <path
        d="M40 8 C 38 12 34 18 26 22 L 22 26 C 14 30 10 36 8 40 L 6 38 C 10 34 14 28 22 24 L 26 22 C 34 16 38 10 38 6 Z"
        fill="var(--color-accent)"
        data-motif-part={`${idPrefix}-blade-2`}
      />
      {/* Center diamond where blades cross */}
      <path
        d="M24 20 L 28 24 L 24 28 L 20 24 Z"
        fill="currentColor"
      />
    </g>
  );
}

/**
 * Signature brand motif — a token-driven "crossed razors" device (NYC barbershop
 * aesthetic). It uses **only** `var(--color-primary)` / `var(--color-accent)` and
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
    // A horizontal line with a small crossed-razors mark centered on it.
    // Reads as a refined section divider with the barbershop identity.
    const fadeId = `motif-band-fade-${uid}`;
    return (
      <svg
        {...common}
        viewBox="0 0 320 48"
        preserveAspectRatio="xMidYMid meet"
        data-motif="band"
      >
        <defs>
          <linearGradient id={fadeId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0" />
            <stop
              offset="0.5"
              stopColor="var(--color-accent)"
              stopOpacity="0.55"
            />
            <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Hairline that fades toward both edges, passing behind the razors. */}
        <rect x="16" y="23" width="288" height="2" rx="1" fill={`url(#${fadeId})`} />
        {/* Small accent dots flanking the center mark */}
        <circle cx="112" cy="24" r="2" fill="var(--color-accent)" opacity="0.85" />
        <circle cx="208" cy="24" r="2" fill="var(--color-accent)" opacity="0.85" />
        {/* Centered crossed razors mark (scaled down) */}
        <g transform="translate(160 24) scale(0.6)">
          <g transform="translate(-24 -24)">
            <CrossedRazors idPrefix={`band-${uid}`} />
          </g>
        </g>
      </svg>
    );
  }

  if (variant === 'watermark') {
    // Faint oversized backdrop: crossed razors at low opacity, drawn in
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
          <CrossedRazors idPrefix="watermark" />
        </g>
      </svg>
    );
  }

  // `mark` — the logo-scale signature shape.
  return (
    <svg
      {...common}
      viewBox="0 0 48 48"
      preserveAspectRatio="xMidYMid meet"
      data-motif="mark"
    >
      <CrossedRazors idPrefix="mark" />
    </svg>
  );
}

export default Motif;
