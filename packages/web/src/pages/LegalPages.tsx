import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SeoHead } from '../components/seo';
import { DirText } from '../components/ui/DirText';

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
      body: 'خدمت دلخواهتان را همان لحظه در اپلیکیشن آرا رزرو کنید و تماس‌های رفت‌وبرگشتی ساعت کاری را کنار بگذارید.',
    },
    {
      title: 'به‌موقع باخبر شوید',
      body: 'یادآوری خودکار باعث می‌شود هیچ نوبتی را فراموش نکنید. قرارها را در اپلیکیشن تغییر دهید و مدیریت کنید.',
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
          <h1 className="text-4xl font-bold leading-[1.3] sm:text-5xl">
            وقت گرفتن حالا ساده‌تر از همیشه است
          </h1>
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid gap-10 md:grid-cols-3">
          {points.map((point) => (
            <article key={point.title}>
              <h2 className="mb-3 text-xl font-bold">{point.title}</h2>
              <p className="leading-7 text-muted">{point.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="bg-text text-bg">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-16 text-center">
          <h2 className="text-3xl font-bold">قرار بعدی‌تان را در چند ثانیه رزرو کنید</h2>
          <p className="text-white/70">همین حالا اپلیکیشن آرا را دریافت کنید.</p>
          <Link
            to="/auth"
            className="rounded-md bg-primary px-8 py-3 text-sm font-semibold text-primary-contrast no-underline"
          >
            دریافت اپلیکیشن
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
      <h1 className="text-4xl font-bold text-text">تماس با ما</h1>
      <p className="mt-4 text-muted">
        سؤال یا مشکلی دارید؟ با تیم پشتیبانی مشتریان آرا در تماس باشید.
      </p>
      <section className="mt-8 rounded-2xl border border-black/10 p-6">
        <h2 className="text-lg font-bold text-text">پشتیبانی</h2>
        <a
          href="mailto:support@example.ir"
          className="mt-1 inline-block font-semibold text-primary"
        >
          <DirText dir="ltr">support@example.ir</DirText>
        </a>
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
  return (
    <article data-testid={testId} className="mx-auto max-w-3xl px-4 py-12">
      <SeoHead title={seoTitle} description={seoDescription} path={path} index />
      <HomeLink />
      <h1 className="mb-6 text-3xl font-bold text-text sm:text-4xl">{heading}</h1>
      <p className="mb-6 leading-8 text-muted">{intro}</p>
      {sections.map((section) => (
        <section key={section.title}>
          <h2 className="mb-3 mt-8 text-2xl font-bold text-text">{section.title}</h2>
          <div className="leading-8 text-muted">{section.body}</div>
        </section>
      ))}
    </article>
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
      sections={[
        { title: t('legal.privacy.collectTitle'), body: <p>{t('legal.privacy.collectBody')}</p> },
        { title: t('legal.privacy.useTitle'), body: <p>{t('legal.privacy.useBody')}</p> },
        { title: t('legal.privacy.securityTitle'), body: <p>{t('legal.privacy.securityBody')}</p> },
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
      sections={[
        { title: t('legal.terms.useTitle'), body: <p>{t('legal.terms.useBody')}</p> },
        { title: t('legal.terms.bookingTitle'), body: <p>{t('legal.terms.bookingBody')}</p> },
        { title: t('legal.terms.liabilityTitle'), body: <p>{t('legal.terms.liabilityBody')}</p> },
      ]}
    />
  );
}
