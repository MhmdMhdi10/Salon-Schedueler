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
 * A single petal, drawn from the flower's center (24,24) up to a tip at (24,4)
 * and back — symmetric about the vertical axis. Five rotated copies form the
 * "petal arc" flower. These are **geometry** coordinates (user units), not
 * style literals.
 */
const PETAL_PATH = 'M24 24 C 18 16 18 8 24 4 C 30 8 30 16 24 24 Z';

/** The five petal rotations (72° apart) that make up one flower. */
const PETAL_ANGLES = [0, 72, 144, 216, 288] as const;

/**
 * One "petal arc" flower in a 48×48 coordinate box, centered at (24,24).
 * Petals alternate the brand primary and accent tokens; the hub uses
 * `currentColor` so the mark always has a legible center against any surface.
 */
function Flower({ idPrefix }: { idPrefix: string }) {
  return (
    <g>
      {PETAL_ANGLES.map((angle, i) => (
        <path
          key={`${idPrefix}-petal-${angle}`}
          d={PETAL_PATH}
          transform={`rotate(${angle} 24 24)`}
          fill={i % 2 === 0 ? 'var(--color-primary)' : 'var(--color-accent)'}
        />
      ))}
      {/* Center hub ties the petals together; currentColor keeps it adaptive. */}
      <circle cx="24" cy="24" r="4" fill="currentColor" />
    </g>
  );
}

/**
 * Signature brand motif — a token-driven "petal arc" device (design §2, R1.3,
 * R2.5). It uses **only** `var(--color-primary)` / `var(--color-accent)` and
 * `currentColor` for color, so a tenant storefront's runtime accent override
 * re-tints it for free and it never hard-codes a hex. Decorative by default.
 */
export function Motif({
  variant = 'mark',
  className,
  'aria-hidden': ariaHidden = true,
}: MotifProps) {
  const common = {
    className: cn(className),
    'aria-hidden': ariaHidden,
    focusable: false as const,
    xmlns: 'http://www.w3.org/2000/svg',
  };

  if (variant === 'band') {
    // A wide divider: a row of small flowers stepping across the strip,
    // alternating their vertical nudge so the band reads as an organic arc.
    const count = 7;
    const step = 48;
    return (
      <svg
        {...common}
        viewBox={`0 0 ${count * step} 48`}
        preserveAspectRatio="xMidYMid meet"
        data-motif="band"
      >
        {Array.from({ length: count }, (_, i) => (
          <g
            key={`band-flower-${i}`}
            transform={`translate(${i * step} 0) scale(0.9)`}
            opacity={i % 2 === 0 ? 1 : 0.8}
          >
            <Flower idPrefix={`band-${i}`} />
          </g>
        ))}
      </svg>
    );
  }

  if (variant === 'watermark') {
    // Faint oversized backdrop: a single flower at low opacity, drawn in
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
          <Flower idPrefix="watermark" />
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
      <Flower idPrefix="mark" />
    </svg>
  );
}

export default Motif;
