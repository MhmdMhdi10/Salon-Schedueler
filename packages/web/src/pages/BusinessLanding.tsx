import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  CreditCard,
  Headphones,
  Link2,
  Megaphone,
  ShieldCheck,
  Store,
  UserRound,
  Users,
} from 'lucide-react';
import { JsonLd, SeoHead, SITE_NAME, SITE_URL } from '../components/seo';
import { cn } from '../components/ui';

const WORKFLOW = [
  {
    icon: Link2,
    number: '۰۱',
    title: 'لینک رزروتان را منتشر کنید',
    body: 'لینک و QR اختصاصی سالن را در اینستاگرام، پیام‌رسان‌ها و ویترین بگذارید تا مشتری مستقیم رزرو کند.',
  },
  {
    icon: CalendarDays,
    number: '۰۲',
    title: 'رزرو، بدون رفت‌وبرگشت تلفنی',
    body: 'مشتری خدمت و زمان خالی را انتخاب می‌کند؛ نوبت همان لحظه وارد تقویم شما می‌شود.',
  },
  {
    icon: Users,
    number: '۰۳',
    title: 'هر مشتری را بهتر بشناسید',
    body: 'سوابق نوبت، یادداشت‌ها و برنامهٔ کارکنان در یک نمای منظم و در دسترس می‌ماند.',
  },
  {
    icon: Megaphone,
    number: '۰۴',
    title: 'برای بازگشت دعوت کنید',
    body: 'با یادآوری و ارتباط هدفمند، مشتری یک‌باره را به مشتری وفادار تبدیل کنید.',
  },
] as const;

const PRODUCT_FEATURES = [
  {
    icon: CalendarDays,
    title: 'تقویم و نوبت‌ها',
    body: 'برنامهٔ کارکنان، صندلی‌ها و زمان‌های خالی را یک‌جا ببینید؛ بدون تداخل و دفتر کاغذی.',
  },
  {
    icon: Users,
    title: 'پروندهٔ مشتری',
    body: 'سوابق خدمات، یادداشت‌ها و ترجیحات هر مشتری برای مراجعهٔ بعدی آماده است.',
  },
  {
    icon: Megaphone,
    title: 'یادآوری و بازاریابی',
    body: 'یادآوری پیامکی و ارتباط دوباره با مشتری‌ها از دل همان پنل انجام می‌شود.',
  },
  {
    icon: ShieldCheck,
    title: 'بیعانه و محافظت از زمان',
    body: 'قوانین لغو و دریافت بیعانه کمک می‌کند زمان‌های ارزشمند شما از دست نرود.',
  },
] as const;

const SOLUTIONS = [
  {
    icon: UserRound,
    label: 'برای متخصص مستقل',
    title: 'همه‌چیز ساده و در کنترل خودتان',
    body: 'لینک رزرو شخصی، تقویم روزانه و پروندهٔ مشتری؛ بدون نیاز به پذیرش یا ابزارهای پراکنده.',
  },
  {
    icon: Store,
    label: 'برای تیم سالن',
    title: 'یک تصویر روشن از کل روز سالن',
    body: 'برنامهٔ چند همکار و چند صندلی را کنار هم مدیریت کنید و مسئولیت‌ها را دقیق‌تر تقسیم کنید.',
  },
  {
    icon: Building2,
    label: 'برای رشد و چند شعبه',
    title: 'تصمیم‌گیری بر پایهٔ گزارش واقعی',
    body: 'روند نوبت‌ها، درآمد و خدمات پرتکرار را ببینید و فرایند موفق را در شعبه‌های بعدی تکرار کنید.',
  },
] as const;

const FAQS = [
  {
    question: 'راه‌اندازی آرا چقدر زمان می‌برد؟',
    answer:
      'پس از ثبت شماره، نام سالن و خدمات اصلی، صفحهٔ رزرو و پنل شما آماده است. جزئیات، کارکنان و ساعت کاری را می‌توانید همان موقع یا بعدتر تکمیل کنید.',
  },
  {
    question: 'مشتری چطور آنلاین رزرو می‌کند؟',
    answer:
      'لینک یا QR اختصاصی سالن را برای مشتری می‌فرستید؛ مشتری بدون نصب برنامه، خدمت و زمان خالی را انتخاب می‌کند و نوبت مستقیم وارد تقویم شما می‌شود.',
  },
  {
    question: 'نوبت‌های فعلی‌ام را چطور منتقل کنم؟',
    answer:
      'می‌توانید نوبت‌های از قبل ثبت‌شده را در تقویم آرا وارد کنید و سپس لینک رزرو آنلاین را برای نوبت‌های تازه با مشتری‌ها به اشتراک بگذارید.',
  },
  {
    question: 'مشتری برای رزرو باید برنامه نصب کند؟',
    answer:
      'خیر. مشتری از مرورگر، خدمت و زمان را انتخاب می‌کند و بدون نصب برنامه نوبتش را ثبت می‌کند.',
  },
  {
    question: 'شروع استفاده هزینه دارد؟',
    answer:
      'شروع با دورهٔ آزمایشی رایگان است. تعرفهٔ اشتراک‌ها پیش از هر پرداخت داخل پنل نمایش داده می‌شود و برای شروع نیازی به کارت بانکی نیست.',
  },
  {
    question: 'اگر هنگام راه‌اندازی سؤال داشته باشم چه؟',
    answer:
      'پشتیبانی فارسی آرا برای راه‌اندازی پروفایل، خدمات و تقویم همراه شماست.',
  },
] as const;

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const answerId = `faq-answer-${useId().replace(/:/g, '')}`;

  return (
    <div className="border-b border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={answerId}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-4 py-4 text-start font-bold outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span className="min-w-0">{question}</span>
        <span
          className={cn(
            'shrink-0 text-xl font-normal leading-none text-primary transition-transform duration-fast motion-reduce:transition-none',
            open && 'rotate-45',
          )}
          aria-hidden="true"
        >
          +
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="answer"
            id={answerId}
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.28, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <p className="max-w-3xl pb-6 text-sm leading-8 text-muted">{answer}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const primaryCtaClass = cn(
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-6',
  'font-semibold text-primary-contrast no-underline shadow-1',
  'transition-all duration-fast ease-standard hover:-translate-y-0.5 hover:shadow-2',
  'outline-none focus-visible:outline focus-visible:outline-2',
  'focus-visible:outline-offset-2 focus-visible:outline-focus',
);

const secondaryCtaClass = cn(
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-border',
  'bg-elevated px-6 font-semibold text-primary no-underline',
  'transition-colors duration-fast ease-standard hover:border-primary hover:text-primary',
  'outline-none focus-visible:outline focus-visible:outline-2',
  'focus-visible:outline-offset-2 focus-visible:outline-focus',
);

/**
 * Owner-acquisition landing and launch home at `/`.
 *
 * Editorial, image-led persuasion meets real product proof.
 * Essential content renders statically; motion is progressive decoration only.
 */
export function BusinessLanding() {
  const { t } = useTranslation();
  const heroTitleLines = t('business.hero.title').split('\n');

  return (
    <div data-testid="business-landing" className="bg-bg text-text">
      <SeoHead
        title={t('seo.titles.business')}
        description={t('seo.descriptions.business')}
        path="/"
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
        className={cn(
          'relative overflow-hidden border-b border-border',
          'bg-[radial-gradient(circle_at_85%_15%,color-mix(in_srgb,var(--color-warning)_12%,transparent),transparent_42%),linear-gradient(135deg,color-mix(in_srgb,var(--color-bg)_94%,var(--color-warning)),var(--color-bg))]',
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          aria-hidden="true"
          style={{
            backgroundImage:
              'radial-gradient(color-mix(in srgb, var(--color-text) 18%, transparent) 0.7px, transparent 0.7px)',
            backgroundSize: '8px 8px',
          }}
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 lg:grid-cols-12 lg:gap-8 lg:py-16">
          <div className="motion-safe:animate-fade-up lg:col-span-5">
            <div className="mb-6 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-primary">
              <span className="h-px w-10 bg-primary" aria-hidden="true" />
              {t('business.hero.eyebrow')}
            </div>
            <h1 className="flex max-w-lg flex-col gap-6 text-2xl font-display leading-tight tracking-tight sm:text-3xl lg:text-4xl">
              {heroTitleLines.map((line) => (
                <span key={line} className="block sm:whitespace-nowrap">
                  {line}
                </span>
              ))}
            </h1>
            <p className="mt-6 max-w-xl text-md leading-8 text-muted">
              {t('business.hero.subtitle')}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/business/register"
                data-hero-cta="primary"
                data-cta="primary"
                className={primaryCtaClass}
              >
                {t('business.hero.primaryCta')}
                {/* RTL-native: ArrowLeft indicates forward in Persian layouts. */}
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Link>
              <Link to="/auth" data-cta="secondary" className={secondaryCtaClass}>
                {t('business.hero.secondaryCta')}
              </Link>
            </div>
            <ul className="mt-8 grid gap-3 border-t border-border pt-5 text-sm text-muted sm:grid-cols-3">
              {['بدون نیاز به کارت بانکی', 'راه‌اندازی سریع', 'پشتیبانی فارسی'].map(
                (note) => (
                  <li key={note} className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    {note}
                  </li>
                ),
              )}
            </ul>
          </div>

          <figure className="relative pb-12 lg:col-span-7 lg:ps-4">
            <div className="relative aspect-[3/2] overflow-hidden rounded-2xl bg-surface shadow-3">
              <img
                src="/images/business/iranian-salon-owner-at-work.webp"
                alt="مدیر ایرانی سالن زیبایی در حال رسیدگی به موی مشتری در فضای گرم و حرفه‌ای سالن"
                width={1536}
                height={1024}
                loading="eager"
                decoding="async"
                className="h-full w-full object-cover motion-safe:animate-ken-burns-hero"
              />
              <div
                className="absolute inset-y-0 end-0 w-1/3 bg-gradient-to-s from-overlay/40 to-transparent"
                aria-hidden="true"
              />
            </div>
            <div className="absolute bottom-0 end-3 w-[68%] overflow-hidden rounded-lg border border-border bg-elevated p-1.5 shadow-3 sm:end-6">
              <img
                src="/screenshots/admin-desktop.png"
                alt="نمای تقویم و داشبورد مدیریت سالن در آرا"
                width={1920}
                height={1080}
                className="aspect-video w-full rounded-md object-cover object-top"
              />
            </div>
            <div className="absolute -bottom-2 start-3 w-[18%] overflow-hidden rounded-lg border border-border bg-elevated p-1 shadow-3 sm:start-8">
              <img
                src="/screenshots/booking-mobile.png"
                alt="نمای موبایلی رزرو نوبت مشتری در آرا"
                width={1080}
                height={1920}
                className="aspect-[9/16] w-full rounded-md object-cover object-top"
              />
            </div>
            <figcaption className="sr-only">
              مشتری از لینک اختصاصی رزرو می‌کند؛ شما همه‌چیز را در داشبورد آرا مدیریت می‌کنید.
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="why" className="scroll-mt-20 border-b border-border py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
            <div>
              <p className="text-xs font-bold tracking-wider text-primary">مسیر رشد در آرا</p>
              <h2 className="mt-3 max-w-xl text-2xl text-display sm:text-3xl">
                از اولین رزرو تا بازگشت دوبارهٔ مشتری
              </h2>
            </div>
            <p className="max-w-2xl text-md leading-8 text-muted lg:justify-self-end">
              آرا فقط یک دفتر نوبت دیجیتال نیست؛ مسیر رزرو، مدیریت و ساختن رابطه‌ای ماندگار با
              مشتری را به یک جریان ساده تبدیل می‌کند.
            </p>
          </div>
          <ol className="mt-12 grid border-y border-border md:grid-cols-2 lg:grid-cols-4">
            {WORKFLOW.map(({ icon: Icon, number, title, body }, index) => (
              <li
                key={number}
                className={cn(
                  'relative px-5 py-8',
                  index > 0 && 'border-t border-border md:border-t-0 md:border-s',
                  index === 2 && 'md:border-t lg:border-t-0',
                )}
              >
                <div className="flex items-center justify-between">
                  <Icon className="size-6 text-primary" aria-hidden="true" />
                  <span className="text-xs font-bold text-muted">{number}</span>
                </div>
                <h3 className="mt-8 text-lg font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 overflow-hidden py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5">
              <p className="text-xs font-bold tracking-wider text-primary">داخل محصول</p>
              <h2 className="mt-3 text-2xl text-display sm:text-3xl">
                روز شلوغ سالن، در یک نمای آرام و دقیق
              </h2>
              <p className="mt-5 text-md leading-8 text-muted">
                از ثبت اولین نوبت تا پیگیری مشتری و پرداخت، ابزارها کنار هم طراحی شده‌اند تا
                شما وقت کمتری صرف هماهنگی و وقت بیشتری صرف کار حرفه‌ای کنید.
              </p>
              <ul className="mt-8 divide-y divide-border border-y border-border">
                {PRODUCT_FEATURES.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="grid grid-cols-[auto_1fr] gap-x-4 py-5">
                    <Icon className="mt-1 size-5 text-primary" aria-hidden="true" />
                    <div>
                      <h3 className="font-bold">{title}</h3>
                      <p className="mt-1 text-sm leading-7 text-muted">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <figure className="relative pb-10 lg:col-span-7">
              <div className="overflow-hidden rounded-2xl border border-border bg-elevated p-2 shadow-3">
                <img
                  src="/screenshots/admin-desktop.png"
                  alt="داشبورد واقعی آرا برای مدیریت تقویم، نوبت‌ها و مشتریان سالن"
                  width={1920}
                  height={1080}
                  loading="lazy"
                  decoding="async"
                  className="aspect-video w-full rounded-lg object-cover object-top"
                />
              </div>
              <div className="absolute -bottom-3 start-4 w-1/4 overflow-hidden rounded-xl border border-border bg-elevated p-1.5 shadow-3 sm:start-10">
                <img
                  src="/screenshots/booking-mobile.png"
                  alt="فرایند رزرو آنلاین آرا در تلفن همراه مشتری"
                  width={1080}
                  height={1920}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[9/16] w-full rounded-lg object-cover object-top"
                />
              </div>
              <figcaption className="mt-6 text-end text-xs text-muted">
                داشبورد مدیریت و تجربهٔ رزرو موبایلی آرا
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section id="solutions" className="scroll-mt-20 bg-ink py-20 text-ink-contrast">
        <div className="mx-auto max-w-7xl px-4">
          <p className="text-xs font-bold tracking-wider text-accent">راهکار متناسب با امروز شما</p>
          <h2 className="mt-3 max-w-3xl text-2xl font-display sm:text-3xl">
            از یک صندلی تا چند شعبه، ساختار آرا همراه شما رشد می‌کند
          </h2>
          <div className="mt-12 grid border-y border-ink-border md:grid-cols-3">
            {SOLUTIONS.map(({ icon: Icon, label, title, body }, index) => (
              <article
                key={label}
                className={cn(
                  'py-8 md:px-8',
                  index > 0 && 'border-t border-ink-border md:border-t-0 md:border-s',
                  index === 0 && 'md:pe-0',
                )}
              >
                <Icon className="size-7 text-accent" aria-hidden="true" />
                <p className="mt-8 text-xs font-bold text-accent">{label}</p>
                <h3 className="mt-3 text-lg font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-ink-muted">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 border-b border-border py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid gap-10 bg-warning/10 p-6 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="flex items-center gap-3 text-primary">
                <CreditCard className="size-5" aria-hidden="true" />
                <span className="text-xs font-bold tracking-wider">شروع بدون ریسک</span>
              </div>
              <h2 className="mt-4 text-2xl text-display sm:text-3xl">{t('business.pricing.title')}</h2>
              <p className="mt-4 max-w-3xl text-md leading-8 text-muted">
                {t('business.pricing.body')}
              </p>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <BadgeCheck className="size-4 text-primary" aria-hidden="true" />
                  دورهٔ آزمایشی رایگان
                </span>
                <span className="flex items-center gap-2">
                  <BadgeCheck className="size-4 text-primary" aria-hidden="true" />
                  مشاهدهٔ تعرفه پیش از پرداخت
                </span>
              </div>
            </div>
            <Link to="/business/register" className={primaryCtaClass}>
              رایگان شروع کنید
              {/* RTL-native: ArrowLeft indicates forward in Persian layouts. */}
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20" aria-labelledby="faq-heading">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[0.65fr_1.35fr]">
          <div>
            <p className="text-xs font-bold tracking-wider text-primary">پرسش‌های پیش از شروع</p>
            <h2 id="faq-heading" className="mt-3 text-2xl text-display sm:text-3xl">
              جواب روشن، پیش از تصمیم
            </h2>
            <p className="mt-4 text-muted">
              سؤال دیگری دارید؟{' '}
              <Link to="/contact" className="inline-flex min-h-10 items-center font-semibold text-primary">
                با پشتیبانی فارسی آرا صحبت کنید.
              </Link>
            </p>
          </div>
          <div className="border-t border-border">
            {FAQS.map((faq) => (
              <FAQItem key={faq.question} {...faq} />
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-primary py-16 text-primary-contrast sm:py-20">
        <div className="relative mx-auto grid max-w-5xl gap-6 px-4 text-center sm:gap-8">
          <h2 className="text-2xl font-display leading-display sm:text-4xl">
            رزرو بعدی می‌تواند بدون تماس تلفنی ثبت شود
          </h2>
          <p className="mx-auto max-w-2xl text-md leading-8 opacity-90">
            لینک رزرو اختصاصی، تقویم و مدیریت روزانه را از همین امروز یک‌جا داشته باشید.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/business/register"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary-contrast px-7 font-bold text-primary no-underline shadow-2 hover:opacity-90"
            >
              {t('business.hero.primaryCta')}
              {/* RTL-native: ArrowLeft indicates forward in Persian layouts. */}
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm opacity-90">
            <span className="flex items-center gap-2">
              <Headphones className="size-4" aria-hidden="true" />
              پشتیبانی فارسی
            </span>
            <span className="flex items-center gap-2">
              <CalendarDays className="size-4" aria-hidden="true" />
              رزرو آنلاین ۲۴ ساعته
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

export default BusinessLanding;
