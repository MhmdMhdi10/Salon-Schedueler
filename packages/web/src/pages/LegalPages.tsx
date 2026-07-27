import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SeoHead, SITE_URL } from '../components/seo';
import { Motif } from '../components/brand/Motif';
import { DirText } from '../components/ui/DirText';

/** Support address on the canonical project domain (same origin the sitemap and
 *  SEO config publish), so staging/production builds advertise a consistent,
 *  real contact host — never a hardcoded placeholder. */
const SUPPORT_EMAIL = `support@${new URL(SITE_URL).host}`;

function HomeLink() {
  return (
    <Link to="/" className="sr-only">
      خانه
    </Link>
  );
}

export function AboutPage() {
  const { t } = useTranslation();
  const points = [
    {
      title: 'اطرافتان را ببینید',
      body: 'آرا پیدا کردن وقت آزاد متخصصان زیبایی، سلامت و مراقبت نزدیک شما را ساده می‌کند. سالن محبوبتان را پیدا کنید یا گزینه‌های تازه را در بازار آرا ببینید.',
    },
    {
      title: 'هر زمان، هر قرار',
      body: 'خدمت دلخواهتان را همان لحظه در وب‌اپ آرا رزرو کنید و تماس‌های رفت‌وبرگشتی ساعت کاری را کنار بگذارید.',
    },
    {
      title: 'به‌موقع باخبر شوید',
      body: 'یادآوری خودکار باعث می‌شود هیچ نوبتی را فراموش نکنید. قرارها را در وب‌اپ تغییر دهید و مدیریت کنید.',
    },
  ];

  return (
    <div data-testid="about-page" className="bg-bg text-text">
      <SeoHead
        title={t('seo.titles.about')}
        description={t('seo.descriptions.about')}
        path="/about"
        index
      />
      <HomeLink />
      <section className="bg-accent/10">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-3xl text-display leading-display sm:text-4xl">
            وقت گرفتن حالا ساده‌تر از همیشه است
          </h1>
          <div className="mt-8 flex justify-center text-primary">
            <Motif variant="band" className="h-8 w-64" aria-hidden />
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid gap-10 md:grid-cols-3">
          {points.map((point) => (
            <article key={point.title}>
              <h2 className="mb-3 text-xl text-display leading-display">{point.title}</h2>
              <p className="leading-7 text-muted">{point.body}</p>
            </article>
          ))}
        </div>
      </section>
      {/* Mission/audience — the legal.about.* catalog content (single source of
          truth with fa.json, reconciled instead of drifting). */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-2">
          <article>
            <h2 className="mb-3 text-xl text-display leading-display">
              {t('legal.about.missionTitle')}
            </h2>
            <p className="leading-8 text-muted">{t('legal.about.missionBody')}</p>
          </article>
          <article>
            <h2 className="mb-3 text-xl text-display leading-display">
              {t('legal.about.audienceTitle')}
            </h2>
            <p className="leading-8 text-muted">{t('legal.about.audienceBody')}</p>
          </article>
        </div>
      </section>
      {/* Closing band on the ink tokens — deliberately dark in BOTH themes; the
          CTA promises exactly what it does: online booking via the web app. */}
      <section className="bg-ink text-ink-contrast">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-16 text-center">
          <h2 className="text-2xl text-display leading-display sm:text-3xl">
            قرار بعدی‌تان را در چند ثانیه رزرو کنید
          </h2>
          <p className="text-ink-muted">بدون تماس تلفنی — همین حالا آنلاین نوبت بگیرید.</p>
          <Link
            to="/auth"
            className="rounded-md bg-primary px-8 py-3 text-sm font-semibold text-primary-contrast no-underline transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            همین حالا رزرو کنید
          </Link>
        </div>
      </section>
    </div>
  );
}

export function ContactPage() {
  const { t } = useTranslation();
  return (
    <div data-testid="contact-page" className="mx-auto min-h-[60vh] max-w-3xl px-4 py-16">
      <SeoHead
        title={t('seo.titles.contact')}
        description={t('seo.descriptions.contact')}
        path="/contact"
        index
      />
      <HomeLink />
      <h1 className="text-3xl text-display leading-display text-text sm:text-4xl">
        {t('legal.contact.title')}
      </h1>
      <p className="mt-4 text-muted">{t('legal.contact.intro')}</p>

      <section className="mt-8 rounded-2xl border border-border p-6">
        <h2 className="text-lg text-display leading-display text-text">
          {t('legal.contact.supportTitle')}
        </h2>
        <div className="mt-3 flex flex-col gap-1">
          <span className="text-sm text-muted">{t('legal.contact.emailLabel')}</span>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-block w-fit rounded-sm font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <DirText dir="ltr">{SUPPORT_EMAIL}</DirText>
          </a>
        </div>
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-text">{t('legal.contact.hoursTitle')}</h3>
          <p className="mt-1 text-sm text-muted">{t('legal.contact.hoursBody')}</p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-border p-6">
        <h2 className="text-lg text-display leading-display text-text">
          {t('legal.contact.businessTitle')}
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted">{t('legal.contact.businessBody')}</p>
        <Link
          to="/business"
          className="mt-3 inline-block rounded-sm font-semibold text-primary underline underline-offset-4 transition-opacity duration-fast ease-standard hover:opacity-80"
        >
          {t('legal.contact.businessCta')}
        </Link>
      </section>
    </div>
  );
}

interface LegalSection {
  title: string;
  body: ReactNode;
}

function PolicyPage({
  testId,
  path,
  seoTitle,
  seoDescription,
  heading,
  intro,
  updated,
  sections,
}: {
  testId: string;
  path: string;
  seoTitle: string;
  seoDescription: string;
  heading: string;
  intro: string;
  /** Persian-digit «آخرین به‌روزرسانی» date line rendered under the heading. */
  updated?: string;
  sections: LegalSection[];
}) {
  const { t } = useTranslation();
  return (
    <article data-testid={testId} className="mx-auto max-w-3xl px-4 py-12">
      <SeoHead title={seoTitle} description={seoDescription} path={path} index />
      <HomeLink />
      <h1 className="mb-3 text-3xl text-display leading-display text-text sm:text-4xl">
        {heading}
      </h1>
      {updated ? (
        <p className="mb-4 text-sm text-muted">
          {t('legal.updatedLabel')}: {updated}
        </p>
      ) : null}
      <p className="mb-6 leading-8 text-muted">{intro}</p>
      {sections.map((section) => (
        <section key={section.title}>
          <h2 className="mb-3 mt-8 text-2xl text-display leading-display text-text">
            {section.title}
          </h2>
          <div className="leading-8 text-muted">{section.body}</div>
        </section>
      ))}
    </article>
  );
}

/** Inline accent link to the contact page used by policy bodies. */
function ContactInlineLink() {
  return (
    <Link to="/contact" className="font-semibold text-primary">
      تماس با ما
    </Link>
  );
}

export function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <PolicyPage
      testId="privacy-page"
      path="/privacy"
      seoTitle={t('seo.titles.privacy')}
      seoDescription={t('seo.descriptions.privacy')}
      heading={t('legal.privacy.title')}
      intro={t('legal.privacy.intro')}
      updated={t('legal.privacy.updated')}
      sections={[
        { title: t('legal.privacy.collectTitle'), body: <p>{t('legal.privacy.collectBody')}</p> },
        { title: t('legal.privacy.useTitle'), body: <p>{t('legal.privacy.useBody')}</p> },
        {
          title: t('legal.privacy.thirdPartiesTitle'),
          body: <p>{t('legal.privacy.thirdPartiesBody')}</p>,
        },
        { title: t('legal.privacy.cookiesTitle'), body: <p>{t('legal.privacy.cookiesBody')}</p> },
        {
          title: t('legal.privacy.retentionTitle'),
          body: <p>{t('legal.privacy.retentionBody')}</p>,
        },
        { title: t('legal.privacy.securityTitle'), body: <p>{t('legal.privacy.securityBody')}</p> },
        { title: t('legal.privacy.rightsTitle'), body: <p>{t('legal.privacy.rightsBody')}</p> },
        {
          title: t('legal.privacy.contactTitle'),
          body: (
            <p>
              {t('legal.privacy.contactBody')} <ContactInlineLink />
            </p>
          ),
        },
      ]}
    />
  );
}

export function TermsPage() {
  const { t } = useTranslation();
  return (
    <PolicyPage
      testId="terms-page"
      path="/terms"
      seoTitle={t('seo.titles.terms')}
      seoDescription={t('seo.descriptions.terms')}
      heading={t('legal.terms.title')}
      intro={t('legal.terms.intro')}
      updated={t('legal.terms.updated')}
      sections={[
        { title: t('legal.terms.useTitle'), body: <p>{t('legal.terms.useBody')}</p> },
        { title: t('legal.terms.bookingTitle'), body: <p>{t('legal.terms.bookingBody')}</p> },
        {
          title: t('legal.terms.cancellationTitle'),
          body: <p>{t('legal.terms.cancellationBody')}</p>,
        },
        {
          title: t('legal.terms.subscriptionTitle'),
          body: <p>{t('legal.terms.subscriptionBody')}</p>,
        },
        { title: t('legal.terms.liabilityTitle'), body: <p>{t('legal.terms.liabilityBody')}</p> },
        { title: t('legal.terms.lawTitle'), body: <p>{t('legal.terms.lawBody')}</p> },
      ]}
    />
  );
}
