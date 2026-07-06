import { useTranslation } from 'react-i18next';
import { CalendarCheck, TrendingDown, Globe } from 'lucide-react';
import { ScrollReveal } from '../ui/ScrollReveal';

/**
 * Owner benefits section — a responsive grid of benefit cards targeting salon
 * owners with key platform advantages:
 * - Reduced no-shows (via SMS/bot reminders)
 * - Online bookings (24/7, no phone calls)
 * - Calendar management (smart scheduling)
 *
 * Each card uses a Lucide icon as the visual anchor alongside title + body text.
 * No images required — the icons convey meaning directly.
 *
 * Responsive: 3 columns on desktop (lg+), 1 column on mobile.
 * RTL-first: logical properties only.
 *
 * **Validates: Requirements 4.6**
 */
export function OwnerBenefitsSection() {
  const { t } = useTranslation();

  const benefits = [
    {
      key: 'noShows',
      icon: TrendingDown,
    },
    {
      key: 'onlineBooking',
      icon: Globe,
    },
    {
      key: 'calendar',
      icon: CalendarCheck,
    },
  ] as const;

  return (
    <section aria-labelledby="owner-benefits-title">
      <ScrollReveal>
        <h2
          id="owner-benefits-title"
          className="text-xl leading-display text-display text-text"
        >
          {t('marketing.benefits.title')}
        </h2>
        <p className="mt-2 max-w-prose text-muted">
          {t('marketing.benefits.subtitle')}
        </p>
      </ScrollReveal>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {benefits.map((benefit, index) => {
          const Icon = benefit.icon;
          return (
            <ScrollReveal key={benefit.key} delay={index * 0.05}>
              <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
                <span
                  aria-hidden="true"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-pill bg-bg text-primary"
                >
                  <Icon size={28} />
                </span>
                <h3 className="text-lg leading-display text-display text-text">
                  {t(`marketing.benefits.${benefit.key}.title`)}
                </h3>
                <p className="text-sm text-muted">
                  {t(`marketing.benefits.${benefit.key}.body`)}
                </p>
              </div>
            </ScrollReveal>
          );
        })}
      </div>
    </section>
  );
}

export default OwnerBenefitsSection;
