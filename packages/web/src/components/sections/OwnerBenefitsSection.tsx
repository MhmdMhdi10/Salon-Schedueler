import { useTranslation } from 'react-i18next';
import { CalendarCheck, TrendingDown, Globe } from 'lucide-react';
import { EditorialSplit } from '../layout';
import { ScrollReveal } from '../ui/ScrollReveal';
import { Motif } from '../brand';

/**
 * Owner benefits section — editorial split layouts with alternating image/text
 * sides, targeting salon owners with key platform advantages:
 * - Reduced no-shows (via SMS/bot reminders)
 * - Online bookings (24/7, no phone calls)
 * - Calendar management (smart scheduling)
 *
 * Uses `EditorialSplit` (asymmetric 2-column) with alternating `lead` prop
 * to create an editorial rhythm (image left / text right, then reversed, then
 * back). Each row enters with `ScrollReveal` for fade-up animation.
 *
 * Responsive: 2 columns on desktop (md+), stacked on mobile.
 * RTL-first: logical properties only; the `EditorialSplit` mirrors automatically.
 *
 * **Validates: Requirements 4.6**
 */
export function OwnerBenefitsSection() {
  const { t } = useTranslation();

  const benefits = [
    {
      key: 'noShows',
      icon: <TrendingDown aria-hidden="true" size={28} />,
      image: '/images/benefit-no-shows-960w.avif',
      imageAlt: t('marketing.benefits.noShows.imageAlt'),
      lead: 'start' as const,
    },
    {
      key: 'onlineBooking',
      icon: <Globe aria-hidden="true" size={28} />,
      image: '/images/benefit-online-booking-960w.avif',
      imageAlt: t('marketing.benefits.onlineBooking.imageAlt'),
      lead: 'end' as const,
    },
    {
      key: 'calendar',
      icon: <CalendarCheck aria-hidden="true" size={28} />,
      image: '/images/benefit-calendar-960w.avif',
      imageAlt: t('marketing.benefits.calendar.imageAlt'),
      lead: 'start' as const,
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

      <div className="mt-10 flex flex-col gap-12 md:gap-16">
        {benefits.map((benefit, index) => (
          <ScrollReveal key={benefit.key} delay={index * 0.05}>
            <EditorialSplit lead={benefit.lead}>
              {/* Image / illustration column */}
              <div className="relative overflow-hidden rounded-lg">
                <img
                  src={benefit.image}
                  alt={benefit.imageAlt}
                  width={960}
                  height={640}
                  loading="lazy"
                  className="h-auto w-full rounded-lg object-cover"
                />
                {/* Decorative motif overlay — token-driven, re-tints per theme */}
                <Motif
                  variant="watermark"
                  className="pointer-events-none absolute -bottom-6 -end-6 h-32 w-32"
                />
              </div>

              {/* Text content column */}
              <div className="flex flex-col justify-center gap-3">
                <span
                  aria-hidden="true"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-pill bg-surface text-primary"
                >
                  {benefit.icon}
                </span>
                <h3 className="text-lg leading-display text-display text-text">
                  {t(`marketing.benefits.${benefit.key}.title`)}
                </h3>
                <p className="max-w-prose text-sm text-muted">
                  {t(`marketing.benefits.${benefit.key}.body`)}
                </p>
              </div>
            </EditorialSplit>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}

export default OwnerBenefitsSection;
