import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  HaircutIcon,
  MakeupIcon,
  NailsIcon,
  SkinIcon,
  BrowsIcon,
  BarberIcon,
} from '../icons';
import type { CategoryIconProps } from '../icons';
import { cn } from './cn';

/**
 * Category taxonomy entry — maps an app taxonomy key to its route,
 * icon component, and i18n label path.
 */
interface CategoryEntry {
  key: string;
  to: string;
  Icon: React.ComponentType<CategoryIconProps>;
}

const CATEGORIES: readonly CategoryEntry[] = [
  { key: 'haircut', to: '/services/haircut', Icon: HaircutIcon },
  { key: 'color', to: '/services/color', Icon: HaircutIcon }, // hair family
  { key: 'makeup', to: '/services/makeup', Icon: MakeupIcon },
  { key: 'nails', to: '/services/nails', Icon: NailsIcon },
  { key: 'skin', to: '/services/skin', Icon: SkinIcon },
  { key: 'brows', to: '/services/brows', Icon: BrowsIcon },
  { key: 'barber', to: '/services/barber', Icon: BarberIcon },
];

export type CategoryBrowserVariant = 'hero' | 'nav';

export interface CategoryBrowserProps {
  /** 'hero' for MarketingHome hero region (larger, on dark bg); 'nav' for AppShell category nav */
  variant?: CategoryBrowserVariant;
  className?: string;
}

/**
 * boosky-style horizontal category browser — a scrollable row of icon + label
 * chips mapped to the app taxonomy (haircut/color/makeup/nails/skin/brows/barber).
 *
 * - Token-driven fill (icons use `currentColor`)
 * - RTL-aware (logical scroll, no physical left/right)
 * - ≥ 44×44px touch targets
 * - No horizontal overflow (contained, scrollbar hidden)
 * - Persian aria-labels from i18n
 *
 * Design: Category Taxonomy & Icons; Goals 8, 17
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
        {CATEGORIES.map(({ key, to, Icon }) => (
          <li key={key} className="shrink-0">
            <Link
              to={to}
              aria-label={t(`home.categories.items.${key}.short`)}
              className={cn(
                // ≥ 44×44px touch target
                'flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-2 no-underline transition-opacity duration-fast ease-standard',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                isHero
                  ? 'text-ink-contrast hover:opacity-80'
                  : 'text-text hover:text-primary',
              )}
            >
              <Icon className={cn('h-6 w-6 shrink-0', isHero && 'h-7 w-7')} aria-hidden />
              <span
                className={cn(
                  'whitespace-nowrap text-2xs font-medium',
                  isHero ? 'text-ink-contrast' : 'text-muted',
                )}
              >
                {t(`home.categories.items.${key}.short`)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default CategoryBrowser;
