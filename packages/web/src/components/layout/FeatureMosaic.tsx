import { Children } from 'react';
import { cn } from '../ui/cn';

export interface FeatureMosaicProps {
  /**
   * The feature tiles. The **first** child becomes the prominent lead tile
   * (spanning two columns and two rows at `md`+); the rest are supporting
   * tiles. Three or more tiles produce a deliberately uneven mosaic instead of
   * a single row of equal cards (design §3, R2.2).
   */
  children: React.ReactNode;
  /** Extra sizing/spacing classes (tokens only). */
  className?: string;
}

/**
 * `FeatureMosaic` — an intentionally **uneven** grid for 3+ peer features
 * (design §3, R2.2). The lead tile dominates; supporting tiles fill the
 * remaining cells, so a page never has to fall back on "one row of three equal
 * cards." Stacks to a single column on phones. CSS-grid only, logical flow,
 * tokenized `gap` — RTL-safe with no physical `left`/`right`.
 */
export function FeatureMosaic({ children, className }: FeatureMosaicProps) {
  const tiles = Children.toArray(children);
  return (
    <div
      data-layout="feature-mosaic"
      className={cn('grid grid-cols-1 gap-5', 'md:grid-cols-3 md:auto-rows-fr', className)}
    >
      {tiles.map((tile, index) => (
        <div
          key={index}
          data-mosaic-tile={index === 0 ? 'lead' : 'support'}
          className={cn(index === 0 && 'md:col-span-2 md:row-span-2')}
        >
          {tile}
        </div>
      ))}
    </div>
  );
}

export default FeatureMosaic;
