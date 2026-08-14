import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, X, SlidersHorizontal } from 'lucide-react';
import { cn } from './cn';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Sort orders the discovery surface actually implements. `distance` is
 * deliberately absent until geolocation ships — a sort chip that visibly
 * activates but reorders nothing erodes trust in every other filter.
 */
export type SortOption = 'rating' | 'price';

export interface FilterBarProps {
  /** Available service type slugs to filter by (e.g. ['hair', 'nails']). */
  serviceTypes: string[];
  /** Display labels for each service type slug, keyed by slug. */
  serviceTypeLabels?: Record<string, string>;
  /**
   * Presentation: `bar` (default) is the sticky toolbar with its own border
   * and backdrop; `panel` is a plain block for embedding inside a Sheet/
   * popover that already owns the surface chrome.
   */
  variant?: 'bar' | 'panel';
  /** Custom className for the outer wrapper. */
  className?: string;
}

// ─── URL Param Keys ──────────────────────────────────────────────────────────

const PARAM_TYPE = 'type';
const PARAM_RATING = 'rating';
const PARAM_SORT = 'sort';

// ─── Sort options list ───────────────────────────────────────────────────────

const SORT_OPTIONS: SortOption[] = ['rating', 'price'];
const RATING_OPTIONS = [3, 4, 5];

// ─── Animation Variants ──────────────────────────────────────────────────────

const chipVariants = {
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.85 },
};

const chipTransition = {
  duration: 0.2,
  ease: [0.2, 0, 0, 1] as [number, number, number, number],
};

const collapseVariants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: { height: 'auto', opacity: 1 },
};

const collapseTransition = {
  duration: 0.25,
  ease: [0.2, 0, 0, 1] as [number, number, number, number],
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * FilterBar — sticky filter/sort chip bar for discovery pages.
 *
 * Syncs selected filters to URL search params (`useSearchParams`) so filters
 * are shareable and persist across navigation. Sticky-positioned below the nav
 * at `--z-sticky`. Collapsible on mobile with an expand/collapse toggle.
 *
 * Features:
 * - Service type chips (single-select, clearable)
 * - Minimum rating filter (3+, 4+, 5 stars)
 * - Sort order (rating, price)
 * - Clear-all button when any filter is active
 * - Chips animate in/out with Framer Motion `AnimatePresence`
 * - Respects `prefers-reduced-motion`
 * - All labels from i18n (`discovery.filter.*` keys)
 * - 44x44 min touch targets for chips
 * - `aria-pressed` for selected chips, `aria-expanded` for collapse
 *
 * @example
 * ```tsx
 * <FilterBar
 *   serviceTypes={['haircut', 'color', 'makeup']}
 *   serviceTypeLabels={{ haircut: 'کوتاهی مو', color: 'رنگ مو', makeup: 'میکاپ' }}
 * />
 * ```
 */
export function FilterBar({
  serviceTypes,
  serviceTypeLabels,
  variant = 'bar',
  className,
}: FilterBarProps) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const prefersReduced = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  // ── Read current filter state from URL ──
  const selectedType = searchParams.get(PARAM_TYPE);
  const selectedRating = searchParams.get(PARAM_RATING)
    ? Number(searchParams.get(PARAM_RATING))
    : null;
  const selectedSort = (searchParams.get(PARAM_SORT) as SortOption) || null;

  const hasActiveFilters = !!(selectedType || selectedRating || selectedSort);

  // ── URL update helpers ──
  const updateParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value === null) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
        return next;
      });
    },
    [setSearchParams],
  );

  const handleTypeChange = useCallback(
    (type: string) => {
      updateParam(PARAM_TYPE, selectedType === type ? null : type);
    },
    [selectedType, updateParam],
  );

  const handleRatingChange = useCallback(
    (rating: number) => {
      updateParam(PARAM_RATING, selectedRating === rating ? null : String(rating));
    },
    [selectedRating, updateParam],
  );

  const handleSortChange = useCallback(
    (sort: SortOption) => {
      updateParam(PARAM_SORT, selectedSort === sort ? null : sort);
    },
    [selectedSort, updateParam],
  );

  const handleClearAll = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(PARAM_TYPE);
      next.delete(PARAM_RATING);
      next.delete(PARAM_SORT);
      return next;
    });
  }, [setSearchParams]);

  // ── Chip renderer ──
  const renderChip = (label: string, isActive: boolean, onPress: () => void, key: string) => (
    <motion.button
      key={key}
      type="button"
      onClick={onPress}
      aria-pressed={isActive}
      variants={prefersReduced ? undefined : chipVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={chipTransition}
      className={cn(
        'inline-flex items-center gap-1.5',
        'min-h-[44px] min-w-[44px] px-4 py-2',
        'rounded-pill text-sm font-medium',
        'select-none whitespace-nowrap',
        'transition-[background-color,border-color,color] duration-fast ease-standard',
        'outline-none focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-offset-2 focus-visible:outline-focus',
        isActive
          ? 'bg-primary text-primary-contrast border border-transparent'
          : 'bg-surface text-text border border-border hover:bg-elevated',
      )}
    >
      {label}
      {isActive && <X size={14} aria-hidden="true" className="shrink-0" />}
    </motion.button>
  );

  // ── Visible chips (first row — always visible) ──
  const firstRowContent = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Sort chips */}
      {SORT_OPTIONS.map((sort) =>
        renderChip(
          t(`discovery.filter.sort.${sort}`),
          selectedSort === sort,
          () => handleSortChange(sort),
          `sort-${sort}`,
        ),
      )}

      {/* Rating chips */}
      {RATING_OPTIONS.map((rating) =>
        renderChip(
          t('discovery.filter.rating', { count: rating }),
          selectedRating === rating,
          () => handleRatingChange(rating),
          `rating-${rating}`,
        ),
      )}
    </div>
  );

  // ── Expandable chips (service types — hidden on mobile until expanded) ──
  const expandableContent = (
    <div className="flex flex-wrap items-center gap-2">
      {serviceTypes.map((type) => {
        const label = serviceTypeLabels?.[type] ?? type;
        return renderChip(
          label,
          selectedType === type,
          () => handleTypeChange(type),
          `type-${type}`,
        );
      })}
    </div>
  );

  return (
    <div
      className={cn(
        variant === 'bar' && 'sticky top-0 z-sticky border-b border-border bg-bg/95 px-4 py-3 backdrop-blur-sm',
        className,
      )}
      role="toolbar"
      aria-label={t('discovery.filter.label')}
    >
      {/* Header row: filter icon + expand toggle (mobile) + clear button */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted">
          <SlidersHorizontal size={18} aria-hidden="true" className="shrink-0" />
          <span>{t('discovery.filter.title')}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Clear all — shown when any filter is active */}
          <AnimatePresence>
            {hasActiveFilters && (
              <motion.button
                type="button"
                onClick={handleClearAll}
                initial={prefersReduced ? undefined : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={prefersReduced ? undefined : { opacity: 0, scale: 0.9 }}
                transition={chipTransition}
                className={cn(
                  'inline-flex items-center gap-1',
                  'min-h-[44px] min-w-[44px] px-3 py-2',
                  'rounded-pill text-sm font-medium',
                  'text-danger bg-transparent border border-danger/30',
                  'hover:bg-danger/5',
                  'outline-none focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-offset-2 focus-visible:outline-focus',
                )}
              >
                <X size={14} aria-hidden="true" />
                {t('discovery.filter.clearAll')}
              </motion.button>
            )}
          </AnimatePresence>

          {/* Expand/collapse toggle — visible only on mobile (bar variant) */}
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-controls="filter-bar-expandable"
            className={cn(
              'inline-flex items-center gap-1 md:hidden',
              variant === 'panel' && 'hidden',
              'min-h-[44px] min-w-[44px] px-3 py-2',
              'rounded-pill text-sm font-medium',
              'text-muted bg-transparent border border-border',
              'hover:bg-surface',
              'outline-none focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-offset-2 focus-visible:outline-focus',
            )}
          >
            {expanded ? t('discovery.filter.collapse') : t('discovery.filter.expand')}
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="inline-flex"
            >
              <ChevronDown size={16} aria-hidden="true" />
            </motion.span>
          </button>
        </div>
      </div>

      {/* Always-visible first row of chips */}
      <AnimatePresence mode="popLayout">{firstRowContent}</AnimatePresence>

      {/* Service type chips — always visible on md+ (and always in a panel),
          expandable on mobile in the bar variant */}
      <div className={cn('mt-2', variant === 'panel' ? 'block' : 'hidden md:block')}>
        <AnimatePresence mode="popLayout">{expandableContent}</AnimatePresence>
      </div>

      {/* Mobile collapsible section (bar variant only) */}
      <AnimatePresence>
        {variant === 'bar' && expanded && (
          <motion.div
            id="filter-bar-expandable"
            variants={prefersReduced ? undefined : collapseVariants}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            transition={collapseTransition}
            className="overflow-hidden mt-2 md:hidden"
          >
            {expandableContent}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
