import type { FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronDown, Search } from 'lucide-react';
import { JsonLd, SeoHead, SITE_NAME, SITE_URL } from '../components/seo';

const CATEGORIES = [
  ['آرایش مو', 'hair'],
  ['آرایشگاه مردانه', 'barber'],
  ['ناخن', 'nails'],
  ['مراقبت پوست', 'skin'],
  ['ابرو و مژه', 'brows'],
  ['ماساژ', 'massage'],
  ['میکاپ', 'makeup'],
  ['سلامت و اسپا', 'spa'],
] as const;

const FEATURES = [
  {
    title: 'قرارهای زیبایی، بهتر از همیشه',
    paragraphs: [
      'دنبال آرایشگر، متخصص پوست، ناخن‌کار یا ماساژور نزدیک خودتان هستید؟ آرا بهترین متخصصان زیبایی را یک‌جا به شما نشان می‌دهد.',
      'آرا رزرو خدمات زیبایی را ساده می‌کند؛ بدون تماس تلفنی، در چند ثانیه زمان آزاد را پیدا کنید و هر ساعت از شبانه‌روز رزرو کنید.',
      'بهترین کسب‌وکارهای اطرافتان را پیدا کنید و همان لحظه وقت بگیرید.',
    ],
    image: '/images/features/section-1.webp',
    alt: 'مراجعه به یک سالن زیبایی محلی',
    reverse: false,
  },
  {
    title: 'برنامه‌تان عوض شد؟ خیالتان راحت.',
    paragraphs: [
      'رزروهای خود را از هرجا مدیریت کنید. بدون تماس تلفنی، زمان قرار را تغییر دهید یا آن را لغو کنید.',
      'آرا پیش از قرار به شما یادآوری می‌کند تا هیچ نوبتی را فراموش نکنید.',
    ],
    image: '/images/features/section-2.webp',
    alt: 'یادآوری قرار زیبایی در اپلیکیشن',
    reverse: true,
  },
  {
    title: 'بهترین‌ها را نزدیک خودتان رزرو کنید',
    paragraphs: [
      'در بازار آرا میان سالن‌ها و متخصصان برتر شهر بچرخید و گزینه مناسب خودتان را پیدا کنید.',
      'نمونه‌کارها، فضای سالن، قیمت‌ها و نظرهای تأییدشده مشتریان را پیش از رزرو ببینید.',
      'زمانتان را ذخیره کنید؛ گرفتن نوبت زیبایی در آرا رایگان، سریع و ساده است.',
    ],
    image: '/images/features/section-3.webp',
    alt: 'پروفایل یک سالن زیبایی همراه امتیاز مشتریان',
    reverse: false,
  },
] as const;

const CITIES = [
  'تهران',
  'مشهد',
  'اصفهان',
  'شیراز',
  'کرج',
  'تبریز',
  'قم',
  'اهواز',
  'رشت',
  'ارومیه',
  'کرمان',
  'یزد',
  'قزوین',
  'ساری',
  'کیش',
  'بندرعباس',
  'همدان',
  'گرگان',
  'کرمانشاه',
  'اراک',
] as const;

const ARTICLES = [
  {
    title: 'چطور بهترین متخصص پوست را انتخاب کنیم؟',
    image: '/images/blog/esthetician.jpg',
  },
  {
    title: 'محبوب‌ترین مدل‌های سبیل و ریش',
    image: '/images/blog/mustache.jpg',
  },
  {
    title: 'راهنمای انتخاب خدمات مراقبت و زیبایی',
    image: '/images/blog/short-nails.jpg',
  },
] as const;

function AppMark({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-2xs font-bold ${
        dark ? 'bg-text text-bg' : 'bg-primary text-primary-contrast'
      }`}
      aria-hidden="true"
    >
      آرا
    </span>
  );
}

function AppPromo() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex min-h-[41rem] flex-col overflow-hidden rounded-2xl bg-accent/10 px-6 pt-10 sm:px-10">
          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-text">
            <AppMark />
            اپلیکیشن آرا · اندروید و iOS
          </div>
          <h2 className="mb-8 mt-8 text-center text-xl font-bold leading-9 text-text">
            وقت زیبایی‌تان را پیدا و رزرو کنید
          </h2>
          <p className="mx-auto max-w-md text-center text-muted">
            بدون تماس تلفنی، قرار بعدی‌تان را پیدا کنید و
            <strong className="text-text"> همان لحظه </strong>
            در هر زمان و مکان رزرو کنید.
          </p>
          <div className="mx-auto mt-6 flex w-full max-w-md items-stretch gap-3">
            <div className="flex min-w-0 flex-1 items-center rounded-md border border-black/10 bg-white px-3">
              <span className="flex items-center gap-1 border-e border-border pe-2 text-sm text-text">
                ۹۸+ <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </span>
              <input
                type="tel"
                inputMode="tel"
                placeholder="شماره موبایل"
                aria-label="شماره موبایل"
                className="min-w-0 flex-1 bg-transparent py-3 ps-2 text-sm text-text outline-none placeholder:text-muted"
              />
            </div>
            <Link
              to="/auth"
              className="flex items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-contrast no-underline"
            >
              دریافت
            </Link>
          </div>
          <div className="mt-auto flex justify-center pt-6">
            <img
              src="/images/app/customer-app-en.webp"
              alt="اپلیکیشن رزرو مشتری آرا"
              width={610}
              height={471}
              loading="lazy"
              className="w-full max-w-md"
            />
          </div>
        </div>

        <div className="flex min-h-[41rem] flex-col overflow-hidden rounded-2xl bg-surface px-6 pt-10 sm:px-10">
          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-text">
            <AppMark dark />
            اپلیکیشن آرا بیز · اندروید و iOS
          </div>
          <h2 className="mb-8 mt-8 text-center text-xl font-bold leading-9 text-text">
            آرا برای کسب‌وکار شما
          </h2>
          <p className="mx-auto max-w-md text-center text-muted">
            تقویم، رزرو، بازاریابی و پرداخت؛ همه ابزارهای رشد سالن در
            <strong className="text-text"> یک اپلیکیشن.</strong>
          </p>
          <div className="mt-6 flex justify-center">
            <Link
              data-cta="owner"
              to="/business"
              className="rounded-md bg-text px-6 py-3.5 text-sm font-semibold text-bg no-underline"
            >
              رشد کسب‌وکار من
            </Link>
          </div>
          <div className="mt-auto flex justify-center pt-6">
            <img
              src="/images/app/biz-app-en.webp"
              alt="اپلیکیشن مدیریت کسب‌وکار آرا"
              width={610}
              height={471}
              loading="lazy"
              className="w-full max-w-md"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureRow({
  title,
  paragraphs,
  image,
  alt,
  reverse,
}: (typeof FEATURES)[number]) {
  const text = (
    <div className="flex flex-col justify-center">
      <h2 className="mb-6 text-2xl font-bold leading-[1.25] text-text lg:mb-10 lg:text-3xl">
        {title}
      </h2>
      <div className="space-y-5 text-muted">
        {paragraphs.map((paragraph, index) => (
          <p
            key={paragraph}
            className={index === paragraphs.length - 1 ? 'font-bold text-text' : undefined}
          >
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
  const visual = (
    <div className="flex min-h-[28rem] items-center justify-center">
      <img
        src={image}
        alt={alt}
        width={988}
        height={782}
        loading="lazy"
        className="w-full max-w-md"
      />
    </div>
  );

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 lg:py-24">
      <div className="grid items-center gap-10 md:grid-cols-2">
        {reverse ? (
          <>
            <div className="order-2 md:order-1">{visual}</div>
            <div className="order-1 md:order-2">{text}</div>
          </>
        ) : (
          <>
            {text}
            {visual}
          </>
        )}
      </div>
    </section>
  );
}

function FeatureLink({ children, to }: { children: ReactNode; to: string }) {
  return (
    <Link
      to={to}
      className="group flex min-h-11 items-center gap-2 text-text no-underline hover:text-primary"
    >
      <ChevronLeft className="h-4 w-4 text-primary rtl:-scale-x-100" aria-hidden="true" />
      {children}
    </Link>
  );
}

export function MarketingHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get('q')?.toString().trim();
    navigate(query ? `/services/all?q=${encodeURIComponent(query)}` : '/services/all');
  };

  return (
    <div data-testid="marketing-home" className="overflow-x-clip bg-white">
      <SeoHead
        title={t('seo.titles.home')}
        description={t('seo.descriptions.home')}
        path="/"
        index
      />
      <JsonLd
        data={[
          { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL, inLanguage: 'fa-IR' },
          { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
        ]}
      />

      <section className="relative flex min-h-[34rem] flex-col overflow-hidden bg-text">
        <img
          src="/images/hero/poster-us.webp"
          alt="رزرو خدمات زیبایی در آرا"
          width={1920}
          height={1080}
          loading="eager"
          {...{ fetchpriority: 'high' }}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          poster="/images/hero/poster-us.webp"
          aria-hidden="true"
        >
          <source src="/videos/hero.webm" type="video/webm" />
        </video>
        <div className="absolute inset-0 bg-black/50" aria-hidden="true" />

        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col px-4">
          <div className="flex flex-1 flex-col items-center justify-center pb-6 pt-28">
            <h1 className="mb-6 max-w-2xl text-center text-2xl font-bold leading-8 text-bg sm:text-3xl">
              متخصصان زیبایی و سلامت نزدیک خودتان را پیدا و رزرو کنید
            </h1>
            <form
              onSubmit={search}
              role="search"
              className="relative flex w-full max-w-xl items-center rounded-lg bg-white shadow-sm"
            >
              <Search className="pointer-events-none absolute start-4 h-5 w-5 text-muted" aria-hidden="true" />
              <label htmlFor="home-search" className="sr-only">
                جستجوی خدمت یا کسب‌وکار
              </label>
              <input
                id="home-search"
                name="q"
                type="search"
                placeholder="خدمت یا سالن را جستجو کنید"
                className="w-full rounded-lg bg-transparent py-3 pe-4 ps-11 text-sm text-text outline-none placeholder:text-muted"
              />
            </form>
            <Link
              data-cta="primary"
              to="/s/salon-rose"
              className="sr-only bg-primary text-primary-contrast shadow-1"
            >
              رزرو سالن
            </Link>
            <Link data-cta="secondary" to="/city/tehran" className="sr-only text-primary">
              سالن‌های تهران
            </Link>
            <Link to="/auth" className="sr-only">
              ورود به حساب
            </Link>
          </div>

          <nav
            aria-label="دسته‌بندی خدمات"
            className="flex items-center justify-between gap-6 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {CATEGORIES.map(([label, slug]) => (
              <Link
                key={slug}
                to={`/services/${slug}`}
                className="shrink-0 whitespace-nowrap text-sm font-semibold text-white no-underline hover:opacity-80"
              >
                {label}
              </Link>
            ))}
            <Link
              to="/services/all"
              className="shrink-0 whitespace-nowrap text-sm font-semibold text-white no-underline hover:opacity-80"
            >
              بیشتر...
            </Link>
          </nav>
        </div>
      </section>

      <AppPromo />

      {FEATURES.map((feature) => (
        <FeatureRow key={feature.title} {...feature} />
      ))}

      <section className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="mb-6 text-center text-4xl font-bold leading-[1.35] text-text">
          متخصص آرا را در شهر خودتان پیدا کنید
        </h2>
        <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-x-8 gap-y-1 p-0 sm:grid-cols-3 lg:grid-cols-4">
          {CITIES.map((city) => (
            <li key={city}>
              <FeatureLink to={`/city/${city === 'تهران' ? 'tehran' : encodeURIComponent(city)}`}>
                {city}
              </FeatureLink>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <h2 className="pb-8 text-xl font-bold leading-9 text-text">
          پیشنهاد آرا برای شما
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ARTICLES.map((article) => (
            <Link
              key={article.title}
              to="/about"
              className="group flex flex-col overflow-hidden rounded-lg border border-black/5 bg-white no-underline shadow-sm hover:shadow-md"
            >
              <div className="aspect-[16/10] w-full overflow-hidden rounded-t-lg">
                <img
                  src={article.image}
                  alt=""
                  width={720}
                  height={450}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <h3 className="p-5 text-xl font-semibold leading-[1.6] text-neutral-700">
                {article.title}
              </h3>
            </Link>
          ))}
        </div>
      </section>

      <nav aria-label="پیوندهای اعتماد" className="sr-only">
        <Link to="/about">درباره آرا</Link>
        <Link to="/contact">تماس با ما</Link>
        <Link to="/privacy">حریم خصوصی</Link>
        <Link to="/terms">شرایط استفاده</Link>
      </nav>
    </div>
  );
}

export default MarketingHome;
