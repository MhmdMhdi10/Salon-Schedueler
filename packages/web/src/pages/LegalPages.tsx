import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SeoHead } from '../components/seo';
import { Card, CardContent, CardTitle, DirText } from '../components/ui';

/**
 * Public trust & legal pages — `/about`, `/contact`, `/privacy`, `/terms`
 * (task 5.3; R8.1, R8.4, R8.8; seo §1 "trust & legal = index").
 *
 * These are indexable content pages: each opts **in** via `<SeoHead index>`
 * (the default is noindex — R8.7), carries a single `<h1>` and ordered headings
 * inside the `main` landmark, a home breadcrumb with descriptive link text, and
 * a unique Persian title/description (seo §2, §3). They are intentionally
 * JS-light informational surfaces (seo §9 — minimal main-thread work) and ship
 * the same content the prerender step writes (`scripts/prerender.mjs`
 * `STATIC_ROUTE_CONTENT`) so View Source and the hydrated page agree.
 *
 * All copy comes from the `fa.json` catalog (`legal.*` / `seo.*`) — no
 * hard-coded Farsi in JSX. Layout uses logical properties only (RTL-first).
 */

/** A reusable section: an ordered `<h2>` + body paragraph(s). */
interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Shared scaffold: SeoHead (index), breadcrumb, single `<h1>`, lead, sections. */
function LegalLayout({
  testId,
  path,
  seoTitle,
  seoDescription,
  heading,
  intro,
  sections,
}: {
  testId: string;
  path: string;
  seoTitle: string;
  seoDescription: string;
  heading: string;
  intro: string;
  sections: LegalSection[];
}) {
  const { t } = useTranslation();
  return (
    <div data-testid={testId}>
      <SeoHead
        title={seoTitle}
        description={seoDescription}
        path={path}
        index
      />

      {/* Breadcrumb — descriptive link text back to the indexable home. */}
      <nav aria-label={t('discovery.breadcrumb')} className="py-3 text-sm">
        <ol className="flex flex-wrap items-center gap-x-2 text-muted" role="list">
          <li>
            <Link to="/" className="hover:text-text hover:underline">
              {t('discovery.crumbHome')}
            </Link>
          </li>
          <li aria-hidden="true">‹</li>
          <li className="text-text">{heading}</li>
        </ol>
      </nav>

      <header className="flex flex-col items-start gap-3 py-4">
        <h1 className="max-w-prose text-xl font-bold text-text">{heading}</h1>
        <p className="max-w-prose text-md text-muted">{intro}</p>
      </header>

      {sections.map((section) => (
        <section
          key={section.id}
          className="py-4"
          aria-labelledby={`${section.id}-title`}
        >
          <Card as="article" className="flex flex-col gap-2">
            <CardTitle as="h2" id={`${section.id}-title`}>
              {section.title}
            </CardTitle>
            <CardContent>
              <div className="max-w-prose text-muted">{section.body}</div>
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}

/** `/about` — what the platform is and who it serves (R8.1, R8.8). */
export function AboutPage() {
  const { t } = useTranslation();
  return (
    <LegalLayout
      testId="about-page"
      path="/about"
      seoTitle={t('seo.titles.about')}
      seoDescription={t('seo.descriptions.about')}
      heading={t('legal.about.title')}
      intro={t('legal.about.intro')}
      sections={[
        {
          id: 'about-mission',
          title: t('legal.about.missionTitle'),
          body: <p>{t('legal.about.missionBody')}</p>,
        },
        {
          id: 'about-audience',
          title: t('legal.about.audienceTitle'),
          body: <p>{t('legal.about.audienceBody')}</p>,
        },
      ]}
    />
  );
}

/** `/contact` — support and partnership contact details (R8.1, R8.8). */
export function ContactPage() {
  const { t } = useTranslation();
  return (
    <LegalLayout
      testId="contact-page"
      path="/contact"
      seoTitle={t('seo.titles.contact')}
      seoDescription={t('seo.descriptions.contact')}
      heading={t('legal.contact.title')}
      intro={t('legal.contact.intro')}
      sections={[
        {
          id: 'contact-channels',
          title: t('legal.contact.title'),
          body: (
            <ul className="flex flex-col gap-2" role="list">
              <li className="flex flex-wrap items-center gap-2">
                <span>{t('legal.contact.emailLabel')}:</span>
                <a
                  href="mailto:support@example.ir"
                  className="text-primary hover:underline"
                >
                  <DirText dir="ltr">support@example.ir</DirText>
                </a>
              </li>
              <li className="flex flex-wrap items-center gap-2">
                <span>{t('legal.contact.phoneLabel')}:</span>
                <a href="tel:+982112345678" className="text-primary hover:underline">
                  <DirText dir="ltr">+98-21-1234-5678</DirText>
                </a>
              </li>
            </ul>
          ),
        },
        {
          id: 'contact-hours',
          title: t('legal.contact.hoursTitle'),
          body: <p>{t('legal.contact.hoursBody')}</p>,
        },
      ]}
    />
  );
}

/** `/privacy` — privacy policy (R8.1, R8.8). */
export function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <LegalLayout
      testId="privacy-page"
      path="/privacy"
      seoTitle={t('seo.titles.privacy')}
      seoDescription={t('seo.descriptions.privacy')}
      heading={t('legal.privacy.title')}
      intro={t('legal.privacy.intro')}
      sections={[
        {
          id: 'privacy-collect',
          title: t('legal.privacy.collectTitle'),
          body: <p>{t('legal.privacy.collectBody')}</p>,
        },
        {
          id: 'privacy-use',
          title: t('legal.privacy.useTitle'),
          body: <p>{t('legal.privacy.useBody')}</p>,
        },
        {
          id: 'privacy-security',
          title: t('legal.privacy.securityTitle'),
          body: <p>{t('legal.privacy.securityBody')}</p>,
        },
      ]}
    />
  );
}

/** `/terms` — terms of service (R8.1, R8.8). */
export function TermsPage() {
  const { t } = useTranslation();
  return (
    <LegalLayout
      testId="terms-page"
      path="/terms"
      seoTitle={t('seo.titles.terms')}
      seoDescription={t('seo.descriptions.terms')}
      heading={t('legal.terms.title')}
      intro={t('legal.terms.intro')}
      sections={[
        {
          id: 'terms-use',
          title: t('legal.terms.useTitle'),
          body: <p>{t('legal.terms.useBody')}</p>,
        },
        {
          id: 'terms-booking',
          title: t('legal.terms.bookingTitle'),
          body: <p>{t('legal.terms.bookingBody')}</p>,
        },
        {
          id: 'terms-liability',
          title: t('legal.terms.liabilityTitle'),
          body: <p>{t('legal.terms.liabilityBody')}</p>,
        },
      ]}
    />
  );
}
