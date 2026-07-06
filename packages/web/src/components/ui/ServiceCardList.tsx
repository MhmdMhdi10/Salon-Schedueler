import { useId } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, Clock } from 'lucide-react';
import { cn } from './cn';
import { Money } from './Money';
import { toPersianDigits } from './Num';
import { easings } from '../../lib/motion-variants';

export interface ServiceCardItem {
  /** Unique service identifier. */
  id: string;
  /** Display name of the service (Persian). */
  name: string;
  /** Duration in minutes. */
  durationMinutes: number;
  /** Price in Iranian Rial. */
  priceRial: number;
  /** Optional category for grouping. */
  category?: string;
}

export interface ServiceCardListProps {
  /** The service items to display. */
  services: ServiceCardItem[];
  /** Currently selected service ID (controlled). */
  value: string;
  /** Callback when a service card is selected. */
  onValueChange: (serviceId: string) => void;
  /** Accessible label for the service list. */
  ariaLabel?: string;
  /** Duration format template (e.g. "{{count}} دقیقه"). */
  durationLabel?: (minutes: number) => string;
  /** Additional class names for the root container. */
  className?: string;
}

/**
 * Booksy-style service selection card list for the booking flow.
 *
 * Renders services as individual cards with:
 * - Service name, duration (with clock icon), and Rial price (Persian numerals)
 * - Selection animation: border transitions to primary color, checkmark scales in
 * - Press feedback: `whileTap={{ scale: 0.97 }}` micro-interaction
 * - Grouped by category when categories are provided
 * - Respects `prefers-reduced-motion`: falls back to instant state changes
 * - Only animates compositor-friendly properties (transform, opacity)
 * - Accessible: role="radiogroup", each card is role="radio" with aria-checked
 * - Touch targets ≥ 44px height for accessibility compliance
 *
 * Validates: Requirements 7.2, 3.3, 3.5, 11.4, 11.6
 */
export function ServiceCardList({
  services,
  value,
  onValueChange,
  ariaLabel,
  durationLabel,
  className,
}: ServiceCardListProps) {
  const prefersReduced = useReducedMotion();
  const groupId = useId();

  // Group services by category if any categories are provided
  const hasCategories = services.some((s) => s.category);
  const grouped = hasCategories
    ? services.reduce<Record<string, ServiceCardItem[]>>((acc, service) => {
        const key = service.category ?? '';
        if (!acc[key]) acc[key] = [];
        acc[key].push(service);
        return acc;
      }, {})
    : { '': services };

  const formatDuration = durationLabel ?? ((m: number) => `${toPersianDigits(m)} دقیقه`);

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('flex flex-col gap-3', className)}
    >
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category || '__uncategorized'} className="flex flex-col gap-2">
          {category && (
            <h3 className="text-sm font-bold text-text-muted px-1">{category}</h3>
          )}
          {items.map((service) => {
            const isSelected = value === service.id;
            const cardId = `${groupId}-service-${service.id}`;

            return (
              <motion.button
                key={service.id}
                id={cardId}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={service.name}
                onClick={() => onValueChange(service.id)}
                whileTap={prefersReduced ? undefined : { scale: 0.97 }}
                transition={{
                  duration: 0.2,
                  ease: easings.standard,
                }}
                className={cn(
                  'relative w-full rounded-lg border-2 p-4 text-start',
                  'transition-colors',
                  'outline-none focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-offset-2 focus-visible:outline-focus',
                  'min-h-[3.5rem]', // ≥ 44px touch target (56px with padding)
                  isSelected
                    ? 'border-primary bg-surface shadow-1'
                    : 'border-border bg-surface hover:border-text-muted',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Service info (start side) */}
                  <div className="flex flex-col gap-1 min-w-0">
                    <span
                      className={cn(
                        'text-sm font-bold truncate',
                        isSelected ? 'text-primary' : 'text-text',
                      )}
                    >
                      {service.name}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-text-muted">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <bdi>{formatDuration(service.durationMinutes)}</bdi>
                    </span>
                  </div>

                  {/* Price + checkmark (end side) */}
                  <div className="flex items-center gap-3 shrink-0">
                    <Money
                      amountRial={service.priceRial}
                      className={cn(
                        'text-sm font-medium',
                        isSelected ? 'text-primary' : 'text-text',
                      )}
                    />

                    {/* Checkmark indicator — animates in on selection */}
                    <div className="relative flex h-6 w-6 items-center justify-center">
                      <AnimatePresence mode="wait">
                        {isSelected && (
                          <motion.div
                            key="check"
                            initial={
                              prefersReduced
                                ? { opacity: 1, scale: 1 }
                                : { opacity: 0, scale: 0.5 }
                            }
                            animate={{ opacity: 1, scale: 1 }}
                            exit={
                              prefersReduced
                                ? { opacity: 0 }
                                : { opacity: 0, scale: 0.5 }
                            }
                            transition={{
                              duration: prefersReduced ? 0.01 : 0.2,
                              ease: easings.emphasized,
                            }}
                            className={cn(
                              'flex h-6 w-6 items-center justify-center',
                              'rounded-full bg-primary',
                            )}
                            aria-hidden="true"
                          >
                            <Check
                              className="h-3.5 w-3.5 text-primary-contrast"
                              strokeWidth={3}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
