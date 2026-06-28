import { Children } from 'react';
import { cn } from '../ui/cn';

export interface SectionRhythmProps {
  /**
   * The page sections to lay out with alternating rhythm. Each child is wrapped
   * in a full-width band; the wrapper supplies background + vertical density,
   * the child supplies its own inner container and headings.
   */
  children: React.ReactNode;
  /**
   * Background of the first band. `bg` (default) starts on the page background
   * and alternates to `surface`; `surface` starts the other way. Alternating
   * the backdrop and vertical density keeps consecutive sections visually
   * distinct (design §3, R3.4).
   */
  startWith?: 'bg' | 'surface';
  /** Extra classes applied to the outer wrapper (tokens only). */
  className?: string;
}

/**
 * `SectionRhythm` — alternates each section's background between `--color-bg`
 * and `--color-surface` and varies the vertical density, so a page never reads
 * as one flat stack of identical bands (design §3, R3.4). Block-axis padding
 * only (RTL-neutral); colors are tokens. The inner content container is the
 * child's responsibility.
 */
export function SectionRhythm({
  children,
  startWith = 'bg',
  className,
}: SectionRhythmProps) {
  const bands = Children.toArray(children);
  const startsOnSurface = startWith === 'surface';
  return (
    <div data-layout="section-rhythm" className={cn(className)}>
      {bands.map((band, index) => {
        // Even indices take the starting tone; odd indices take the other.
        const onSurface = startsOnSurface ? index % 2 === 0 : index % 2 === 1;
        return (
          <div
            key={index}
            data-rhythm-band={onSurface ? 'surface' : 'bg'}
            className={cn(
              'w-full',
              onSurface ? 'bg-surface text-text' : 'bg-bg text-text',
              // Density alternation (block axis only — RTL-neutral).
              index % 2 === 0 ? 'py-8' : 'py-10',
            )}
          >
            {band}
          </div>
        );
      })}
    </div>
  );
}

export default SectionRhythm;
