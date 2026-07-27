import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { JsonLd, SeoHead, SITE_NAME, SITE_URL } from '../components/seo';
import { Motif } from '../components/brand/Motif';
import { FeatureMosaic } from '../components/layout/FeatureMosaic';
import { ScrollReveal } from '../components/ui/ScrollReveal';

/** i18n keys of the 3-col plain-text value props (#why — directive §g.3). */
const WHY_KEYS = ['booked', 'busywork', 'brand'] as const;

/** i18n keys of the feature mosaic tiles; the first is the lead tile. */
const FEATURE_KEYS = ['calendar', 'payments', 'marketing', 'noShows'] as const;

/**
 * i18n keys of the dark solutions band. Content-honesty policy (contract):
 * NO invented adoption statistics — these sell real product capabilities with
 * truthful outcome copy instead of made-up user counts, so there is no
 * AnimatedCounter here until a genuine number exists to count.
 */
const SOLUTION_KEYS = ['online', 'reminders', 'deposits', 'reports'] as const;

/**
 * Owner-acquisition landing (`/business`) — the 6-section Booksy biz skeleton
 * (directive §g) in Ara tokens:
 *
 *  1. Sticky product header (AppShell `business` variant — logo + «بیز» badge,
 *     anchors to the section ids this page owns: #why / #features /
 *     #solutions / #pricing).
 *  2. Tinted hero with dual CTA (primary sign-up + outlined live demo).
 *  3. 3-col plain-text value props (#why) — no icons, no cards.
 *  4. Feature mosaic on the surface wash (#features) — asymmetric lead tile.
 *  5. ONE dark ink band (#solutions) — honest capabilities, dark in both themes.
 *  6. Pricing (#pricing) + final centered CTA; the primary CTA repeats 3×.
 */
export function BusinessLanding() {
  const { t } = useTranslation();

  return (
    <div data-testid="business-landing" className="bg-bg text-text">
      <SeoHead
        title={t('seo.titles.business')}
        description={t('seo.descriptions.business')}
        path="/business"
        index
      />
      <JsonLd
        data={[
          { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL, inLanguage: 'fa-IR' },
          { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
        ]}
      />

      <section
        data-hero
        className="flex min-h-[55vh] items-center bg-accent/10 px-4 py-20 text-center"
      >
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl text-display leading-display sm:text-3xl">
            {t('business.hero.title')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted">
            {t('business.hero.subtitle')}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/business/register"
              data-cta="primary"
              className="inline-flex min-h-12 items-center rounded-md bg-primary px-8 font-semibold text-primary-contrast no-underline shadow-1 transition-opacity duration-fast ease-standard hover:opacity-90"
            >
              {t('business.hero.primaryCta')}
            </Link>
            <Link
              to="/auth"
              data-cta="secondary"
              className="inline-flex min-h-12 items-center rounded-md border border-primary px-8 font-semibold text-primary no-underline transition-colors duration-fast ease-standard hover:bg-accent/10"
            >
              {t('business.hero.secondaryCta')}
            </Link>
          </div>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted">
            {t('business.hero.demoHint')}
          </p>
          <Link
            to="/"
            className="mt-2 inline-block rounded-sm text-sm font-semibold text-primary underline underline-offset-4 transition-opacity duration-fast ease-standard hover:opacity-80"
          >
            {t('business.hero.customerLink')}
          </Link>
          {/* Signature motif band closes the brand hero. */}
          <div className="mt-8 flex justify-center text-primary">
            <Motif variant="band" className="h-8 w-64" aria-hidden />
          </div>
        </div>
      </section>

      {/* #why — 3-col plain-text value props (directive §g.3: no icons, no cards) */}
      <section
        id="why"
        className="mx-auto grid max-w-7xl scroll-mt-20 gap-10 px-4 py-20 md:grid-cols-3"
      >
        {WHY_KEYS.map((key, index) => (
          <ScrollReveal key={key} delay={index * 0.05}>
            <article>
              <h2 className="text-xl text-display leading-display">
                {t(`business.why.items.${key}.title`)}
              </h2>
              <p className="mt-3 leading-7 text-muted">{t(`business.why.items.${key}.body`)}</p>
            </article>
          </ScrollReveal>
        ))}
      </section>

      {/* #features — asymmetric mosaic (signature layout rule: 3+ peer features
          never render as a row of equal cards; the lead tile dominates). */}
      <section id="features" className="scroll-mt-20 bg-surface py-20">
        <div className="mx-auto max-w-7xl px-4">
          <ScrollReveal>
            <h2 className="text-center text-2xl text-display leading-display">
              {t('business.features.title')}
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={0.05}>
            <FeatureMosaic className="mt-10">
              {FEATURE_KEYS.map((key, index) => (
                <article
                  key={key}
                  className="flex h-full flex-col justify-center rounded-2xl border border-border bg-elevated p-6"
                >
                  <h3
                    className={
                      index === 0
                        ? 'text-xl text-display leading-display'
                        : 'text-lg font-semibold'
                    }
                  >
                    {t(`business.features.items.${key}.title`)}
                  </h3>
                  <p className="mt-3 leading-7 text-muted">
                    {t(`business.features.items.${key}.body`)}
                  </p>
                </article>
              ))}
            </FeatureMosaic>
          </ScrollReveal>
        </div>
      </section>

      {/* #solutions — the single dark ink band (stays dark in BOTH themes).
          Honest capability claims, not invented adoption numbers. */}
      <section id="solutions" className="scroll-mt-20 bg-ink px-4 py-20 text-ink-contrast">
        <div className="mx-auto max-w-7xl">
          <ScrollReveal>
            <h2 className="text-center text-2xl text-display leading-display">
              {t('business.solutions.title')}
            </h2>
          </ScrollReveal>
          <div className="mt-12 grid grid-cols-1 gap-8 text-center sm:grid-cols-2 md:grid-cols-4">
            {SOLUTION_KEYS.map((key, index) => (
              <ScrollReveal key={key} delay={index * 0.05}>
                <div className="text-lg font-bold text-accent">
                  {t(`business.solutions.items.${key}.claim`)}
                </div>
                <div className="mt-2 text-sm leading-6 text-ink-muted">
                  {t(`business.solutions.items.${key}.outcome`)}
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* #pricing — honest model: free trial, then subscription; no fabricated
          price table (plans/prices live in the owner panel, env-configured). */}
      <section id="pricing" className="scroll-mt-20 px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <h2 className="text-2xl text-display leading-display">{t('business.pricing.title')}</h2>
            <p className="mx-auto mt-4 max-w-2xl leading-8 text-muted">
              {t('business.pricing.body')}
            </p>
            <Link
              to="/business/register"
              className="mt-8 inline-flex min-h-12 items-center rounded-md bg-primary px-8 font-semibold text-primary-contrast no-underline shadow-1 transition-opacity duration-fast ease-standard hover:opacity-90"
            >
              {t('business.hero.primaryCta')}
            </Link>
          </ScrollReveal>
        </div>
      </section>

      <section className="bg-surface px-4 py-20 text-center">
        <ScrollReveal>
          <h2 className="text-2xl text-display leading-display">{t('business.cta.title')}</h2>
          <p className="mt-4 text-muted">{t('business.cta.body')}</p>
          <Link
            to="/business/register"
            className="mt-8 inline-flex min-h-12 items-center rounded-md bg-primary px-8 font-semibold text-primary-contrast no-underline shadow-1 transition-opacity duration-fast ease-standard hover:opacity-90"
          >
            {t('business.cta.ownerCta')}
          </Link>
        </ScrollReveal>
      </section>
    </div>
  );
}

export default BusinessLanding;
