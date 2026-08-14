import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Flower2, Sparkles } from 'lucide-react';
import {
  HaircutIcon,
  MakeupIcon,
  NailsIcon,
  SkinIcon,
  BrowsIcon,
  BarberIcon,
} from '../icons';
import type { CategoryIconProps } from '../icons';
import { DISCOVERY_CATEGORIES } from '../../data/taxonomy';
import { cn } from './cn';

/**
 * Icon for each canonical taxonomy slug (`data/taxonomy.ts`). Categories
 * without a bespoke brand glyph (massage / spa) use matching lucide glyphs —
 * both are `currentColor`-driven so they re-tint per theme identically.
 */
const CATEGORY_ICONS: Record<string, React.ComponentType<CategoryIconProps>> = {
  hair: HaircutIcon,
  barber: BarberIcon,
  nails: NailsIcon,
  skin: SkinIcon,
  brows: BrowsIcon,
  massage: Flower2 as React.ComponentType<CategoryIconProps>,
  makeup: MakeupIcon,
  spa: Sparkles as React.ComponentType<CategoryIconProps>,
};

export type CategoryBrowserVariant = 'hero' | 'nav';

export interface CategoryBrowserProps {
  /** 'hero' for MarketingHome hero region (larger, on dark bg); 'nav' for light surfaces */
  variant?: CategoryBrowserVariant;
  className?: string;
}

/**
 * Booksy-style horizontal category browser — a scrollable row of icon + label
 * chips fed from the canonical taxonomy (`DISCOVERY_CATEGORIES`), so its links
 * can never drift from the `/services/:slug` routes the discovery surface
 * guarantees (implementation contract §"Canonical taxonomy").
 *
 * - Token-driven fill (icons use `currentColor`)
 * - RTL-aware (logical scroll, no physical left/right)
 * - ≥ 44×44px touch targets
 * - No horizontal overflow (contained, scrollbar hidden)
 * - Persian labels straight from the taxonomy (single source of truth)
 */
export function CategoryBrowser({ variant = 'nav', className }: CategoryBrowserProps) {
  const { t } = useTranslation();
  const isHero = variant === 'hero';

  return (
    <nav
      aria-label={t('home.categories.title')}
      className={cn(
        'w-full max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      <ul
        role="list"
        className={cn(
          'flex items-center gap-4',
          // Prevent horizontal overflow at 360px — allow scroll but no visible overflow
          'min-w-0',
          isHero ? 'justify-center gap-5 py-4 sm:gap-6' : 'px-4 py-3',
        )}
      >
        {DISCOVERY_CATEGORIES.map(({ slug, label }) => {
          const Icon = CATEGORY_ICONS[slug] ?? SkinIcon;
          return (
            <li key={slug} className="shrink-0">
              <Link
                to={`/services/${slug}`}
                className={cn(
                  // ≥ 44×44px touch target
                  'flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-2 no-underline transition-opacity duration-fast ease-standard',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                  isHero ? 'text-ink-contrast hover:opacity-80' : 'text-text hover:text-primary',
                )}
              >
                <Icon className={cn('h-6 w-6 shrink-0', isHero && 'h-7 w-7')} aria-hidden />
                <span
                  className={cn(
                    'whitespace-nowrap text-2xs font-medium',
                    isHero ? 'text-ink-contrast' : 'text-muted',
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default CategoryBrowser;
