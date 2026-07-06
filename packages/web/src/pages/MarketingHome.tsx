import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CalendarCheck, Check, ChevronDown, MessageSquare, TrendingDown } from 'lucide-react';
import { SeoHead, JsonLd, SITE_NAME, SITE_URL } from '../components/seo';
import { ScrollReveal } from '../components/ui';

/**
 * Public marketing home at `/` — B2B signup landing targeting salon owners.
 *
 * Phase 1: The goal is salon owner registration. Not a marketplace (yet).
 * Structure:
 *  1. HERO — Value prop for salon owners + register CTA
 *  2. BENEFITS — 3 key reasons to join (icon cards)
 *  3. HOW IT WORKS — 3 steps to get started
 *  4. FAQ — Objection handling for owners
 *  5. FINAL CTA — Closing push
 *  6. FOOTER NAV
 *
 * ## SEO — PRESERVED
 */
export function MarketingHome() {
  const { t } = useTranslation();

  return (
    <div data-testid="marketing-home" className="bg-bg">
      <SeoHead
        title={t('seo.titles.home')}
        description={t('seo.descriptions.home')}
        path="/"
        index
      />

      <JsonLd
        data={[
          {
            '@type': 'WebSite',
            name: SITE_NAME,
            url: SITE_URL,
            inLanguage: 'fa-IR',
          },
          {
            '@type': 'Organization',
            name: SITE_NAME,
            url: SITE_URL,
          },
        ]}
      />

      {/* ─── HERO — Owner-focused value prop ─── */}
      <section className="bg-bg pb-10 pt-12 sm:pb-14 sm:pt-16">
        <div className="mx-auto w-full max-w-container px-4">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
            <h1 className="text-2xl font-[800] leading-[var(--line-height-display)] tracking-[var(--tracking-display)] text-text sm:text-3xl md:text-4xl">
              {t('landing.hero.title')}
            </h1>
            <p className="max-w-prose text-md text-muted">
              {t('landing.hero.subtitle')}
            </p>
            <Link
              to="/business/register"
              className={PRIMARY_CTA}
            >
              {t('landing.hero.cta')}
            </Link>
            <p className="text-xs text-muted">
              {t('landing.hero.noCreditCard')}
            </p>
          </div>
        </div>
      </section>

      {/* ─── BENEFITS — Why register? ─── */}
      <section aria-labelledby="benefits-title" className="bg-surface py-10 sm:py-14">
        <div className="mx-auto w-full max-w-container px-4">
          <ScrollReveal>
            <h2
              id="benefits-title"
              className="text-center text-xl font-[var(--font-weight-display)] leading-[var(--line-height-display)] text-text md:text-2xl"
            >
              {t('landing.benefits.title')}
            </h2>
          </ScrollReveal>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {BENEFITS.map((b, i) => (
              <ScrollReveal key={b.key} delay={i * 0.05}>
                <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-elevated p-6 text-center">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-pill bg-primary/10 text-primary">
                    <b.icon size={24} aria-hidden="true" />
                  </span>
                  <h3 className="text-md font-medium text-text">
                    {t(`landing.benefits.${b.key}.title`)}
                  </h3>
                  <p className="text-sm text-muted">
                    {t(`landing.benefits.${b.key}.body`)}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS — 3 steps ─── */}
      <section aria-labelledby="steps-title" className="bg-bg py-10 sm:py-14">
        <div className="mx-auto w-full max-w-container px-4">
          <ScrollReveal>
            <h2
              id="steps-title"
              className="text-center text-xl font-[var(--font-weight-display)] leading-[var(--line-height-display)] text-text md:text-2xl"
            >
              {t('landing.steps.title')}
            </h2>
          </ScrollReveal>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <ScrollReveal key={step} delay={i * 0.05}>
                <div className="flex flex-col items-center gap-3 text-center">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-pill bg-primary text-md font-bold text-primary-contrast">
                    {t(`landing.steps.${step}.number`)}
                  </span>
                  <h3 className="text-md font-medium text-text">
                    {t(`landing.steps.${step}.title`)}
                  </h3>
                  <p className="text-sm text-muted">
                    {t(`landing.steps.${step}.body`)}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section aria-labelledby="faq-title" className="bg-surface py-10 sm:py-14">
        <div className="mx-auto w-full max-w-container px-4">
          <h2
            id="faq-title"
            className="text-xl font-[var(--font-weight-display)] leading-[var(--line-height-display)] text-text"
          >
            {t('landing.faq.title')}
          </h2>
          <div className="mt-6 flex flex-col gap-3">
            {FAQ_KEYS.map((key) => (
              <FaqItem
                key={key}
                question={t(`landing.faq.items.${key}.q`)}
                answer={t(`landing.faq.items.${key}.a`)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="bg-bg py-10 sm:py-14">
        <div className="mx-auto w-full max-w-container px-4">
          <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
            <h2 className="text-xl font-[var(--font-weight-display)] leading-[var(--line-height-display)] text-text md:text-2xl">
              {t('landing.closing.title')}
            </h2>
            <p className="text-sm text-muted">
              {t('landing.closing.body')}
            </p>
            <Link
              to="/business/register"
              className={PRIMARY_CTA}
            >
              {t('landing.closing.cta')}
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <nav
        aria-label={t('home.footer.nav')}
        className="mx-auto w-full max-w-container border-t border-border px-4 py-5"
      >
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted" role="list">
          <li><Link to="/about" className="hover:text-text hover:underline">{t('home.footer.about')}</Link></li>
          <li><Link to="/contact" className="hover:text-text hover:underline">{t('home.footer.contact')}</Link></li>
          <li><Link to="/privacy" className="hover:text-text hover:underline">{t('home.footer.privacy')}</Link></li>
          <li><Link to="/terms" className="hover:text-text hover:underline">{t('home.footer.terms')}</Link></li>
        </ul>
      </nav>
    </div>
  );
}

const PRIMARY_CTA =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-md font-medium text-primary-contrast no-underline shadow-1 transition-colors duration-fast ease-standard hover:brightness-110 active:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

const BENEFITS = [
  { key: 'noCall', icon: MessageSquare },
  { key: 'noShow', icon: TrendingDown },
  { key: 'calendar', icon: CalendarCheck },
] as const;

const STEPS = ['s1', 's2', 's3'] as const;

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4'] as const;

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group rounded-lg border border-border bg-elevated px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-text marker:hidden [&::-webkit-details-marker]:hidden">
        <span>{question}</span>
        <ChevronDown
          aria-hidden="true"
          size={20}
          className="shrink-0 text-muted transition-transform duration-fast ease-standard group-open:-rotate-180"
        />
      </summary>
      <p className="mt-3 text-sm text-muted">{answer}</p>
    </details>
  );
}

export default MarketingHome;
