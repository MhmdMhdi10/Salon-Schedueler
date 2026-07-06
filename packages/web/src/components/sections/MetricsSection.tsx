import { useTranslation } from 'react-i18next';
import { AnimatedCounter } from '../ui/AnimatedCounter';
import { ScrollReveal } from '../ui/ScrollReveal';

/**
 * Platform metrics (social proof) displayed as animated counters in Persian
 * numerals. Each metric counts up from 0 when scrolled into view.
 *
 * Layout: 3 columns on desktop (lg), 2 on tablet (sm), stacked on mobile.
 * Uses `ScrollReveal` for a fade-up entrance and `AnimatedCounter` (which has
 * its own scroll trigger) for each stat.
 *
 * **Validates: Requirements 4.4**
 */
export function MetricsSection() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="metrics-section-title">
      <ScrollReveal>
        <h2
          id="metrics-section-title"
          className="text-xl leading-display text-display text-text"
        >
          {t('marketing.metrics.title')}
        </h2>
      </ScrollReveal>

      <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <ScrollReveal delay={0}>
          <AnimatedCounter
            target={178}
            suffix=""
            label={t('marketing.metrics.salons.label')}
          />
        </ScrollReveal>

        <ScrollReveal delay={0.05}>
          <AnimatedCounter
            target={12400}
            suffix=""
            label={t('marketing.metrics.bookings.label')}
          />
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <AnimatedCounter
            target={4.8}
            suffix=""
            label={t('marketing.metrics.satisfaction.label')}
          />
        </ScrollReveal>
      </div>
    </section>
  );
}

export default MetricsSection;
