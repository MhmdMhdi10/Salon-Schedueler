import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  CreditCard,
  Headphones,
  MapPin,
  Megaphone,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  UserRound,
  Users,
} from 'lucide-react';
import { JsonLd, SeoHead, SITE_NAME, SITE_URL } from '../components/seo';
import { cn } from '../components/ui';
import { DISCOVERY_CATEGORIES, DISCOVERY_CITIES } from '../data/taxonomy';

const WORKFLOW = [
  {
    icon: Search,
    number: '۰۱',
    title: 'در جست‌وجوی مشتری دیده شوید',
    body: 'پروفایل، خدمات و نمونه‌کارهای شما در بازار آرا جلوی چشم مشتری‌های همان شهر قرار می‌گیرد.',
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
    question: 'چطور در جست‌وجوی مشتری‌ها دیده می‌شوم؟',
    answer:
      'با تکمیل پروفایل عمومی، خدمات و شهر، سالن شما در بازار آرا و نتایج مرتبط قابل کشف می‌شود. اطلاعات دقیق‌تر، انتخاب مشتری را ساده‌تر می‌کند.',
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
 * Owner-acquisition landing at `/business`.
 *
 * Editorial, image-led persuasion meets real product and marketplace proof.
 * Essential content renders statically; motion is progressive decoration only.
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
            <div className="mb-5 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-primary">
              <span className="h-px w-10 bg-primary" aria-hidden="true" />
              {t('business.hero.eyebrow')}
            </div>
            <h1 className="max-w-xl text-3xl font-display leading-hero tracking-tight sm:text-4xl lg:text-5xl">
              {t('business.hero.title')}
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
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Link>
              <Link to="/auth" data-cta="secondary" className={secondaryCtaClass}>
                {t('business.hero.secondaryCta')}
              </Link>
            </div>
            <Link
              to="/search"
              className="mt-5 inline-flex items-center gap-2 rounded-sm text-sm font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary"
            >
              <Search className="size-4" aria-hidden="true" />
              {t('business.hero.customerLink')}
            </Link>
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
                className="h-full w-full object-cover"
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
              مشتری شما را پیدا و رزرو می‌کند؛ شما همه‌چیز را در داشبورد آرا مدیریت می‌کنید.
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
                از اولین جست‌وجو تا بازگشت دوبارهٔ مشتری
              </h2>
            </div>
            <p className="max-w-2xl text-md leading-8 text-muted lg:justify-self-end">
              آرا فقط یک دفتر نوبت دیجیتال نیست؛ مسیر پیدا شدن، رزرو و ساختن رابطه‌ای ماندگار
              با مشتری را به یک جریان ساده تبدیل می‌کند.
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

      <section className="bg-surface py-20" aria-labelledby="marketplace-heading">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div className="lg:sticky lg:top-24">
              <div className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-contrast">
                <MapPin className="size-5" aria-hidden="true" />
              </div>
              <p className="mt-6 text-xs font-bold tracking-wider text-primary">بازار مشتریان آرا</p>
              <h2 id="marketplace-heading" className="mt-3 text-2xl text-display sm:text-3xl">
                اینجا همان‌جایی است که مشتری تازه شما را پیدا می‌کند
              </h2>
              <p className="mt-5 max-w-xl text-md leading-8 text-muted">
                همین حالا مثل یک مشتری جست‌وجو کنید. آرا سالن‌ها را بر اساس خدمت و شهر در
                دسترس قرار می‌دهد و مسیر رزرو را کوتاه می‌کند.
              </p>

              <form
                action="/search"
                method="get"
                role="search"
                aria-label="جست‌وجوی بازار سالن‌های آرا"
                className="mt-8 grid gap-3 rounded-lg border border-border bg-elevated p-4 shadow-1 sm:grid-cols-2"
              >
                <label className="grid gap-2 text-sm font-semibold">
                  خدمت
                  <select
                    name="q"
                    defaultValue=""
                    className="min-h-12 w-full rounded-md border border-border bg-bg px-3 text-text outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <option value="">همهٔ خدمات</option>
                    {DISCOVERY_CATEGORIES.map((category) => (
                      <option key={category.slug} value={category.label}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  شهر
                  <select
                    name="city"
                    defaultValue=""
                    className="min-h-12 w-full rounded-md border border-border bg-bg px-3 text-text outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <option value="">همهٔ شهرها</option>
                    {DISCOVERY_CITIES.map((city) => (
                      <option key={city.slug} value={city.slug}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className={cn(primaryCtaClass, 'sm:col-span-2')}>
                  <Search className="size-4" aria-hidden="true" />
                  جست‌وجوی سالن‌ها
                </button>
              </form>

              <Link to="/business/register" className="mt-5 inline-flex items-center gap-2 font-bold text-primary">
                کسب‌وکار من هم اینجا باشد
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="rounded-xl border border-border bg-elevated p-5 shadow-1 sm:p-7">
              <div className="mb-4 flex items-center justify-between border-b border-border pb-4">
                <span className="font-bold">جست‌وجوهای محبوب بازار آرا</span>
                <Link to="/search" className="text-sm font-semibold text-primary">
                  دیدن همه
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {DISCOVERY_CATEGORIES.slice(0, 6).map((category, index) => (
                  <Link
                    key={category.slug}
                    to={`/services/${category.slug}`}
                    className="group flex min-h-20 items-center justify-between gap-4 border-b border-border px-1 py-4 no-underline transition-colors hover:text-primary"
                  >
                    <span>
                      <span className="block text-xs font-bold text-muted">
                        خدمت {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="mt-1 block font-bold">{category.label}</span>
                    </span>
                    <ArrowLeft
                      className="size-5 text-primary transition-transform group-hover:-translate-x-1"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
              </div>
              <div className="mt-7">
                <p className="text-xs font-bold tracking-wider text-muted">شهرهای پرجست‌وجو</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {DISCOVERY_CITIES.slice(0, 6).map((city) => (
                    <Link
                      key={city.slug}
                      to={`/city/${city.slug}`}
                      className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-semibold no-underline transition-colors hover:border-primary hover:text-primary"
                    >
                      {city.name}
                    </Link>
                  ))}
                </div>
              </div>
              <p className="mt-7 border-t border-border pt-5 text-sm leading-7 text-muted">
                پس از تکمیل پروفایل، خدمت و شهر شما هم از همین مسیرها برای مشتری قابل کشف
                می‌شود.
              </p>
            </div>
          </div>
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
              <Link to="/contact" className="font-semibold text-primary">
                با پشتیبانی فارسی آرا صحبت کنید.
              </Link>
            </p>
          </div>
          <div className="border-t border-border">
            {FAQS.map(({ question, answer }) => (
              <details key={question} className="group border-b border-border">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 font-bold marker:content-none">
                  {question}
                  <span
                    className="text-xl font-normal text-primary transition-transform duration-fast group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-3xl pb-6 text-sm leading-8 text-muted">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-primary py-20 text-primary-contrast">
        <Sparkles
          className="absolute -top-8 start-[8%] size-40 opacity-10"
          aria-hidden="true"
          strokeWidth={0.7}
        />
        <div className="relative mx-auto grid max-w-5xl gap-8 px-4 text-center">
          <h2 className="text-2xl font-display sm:text-4xl">
            مشتری بعدی آمادهٔ رزرو است؛ سالن شما چطور؟
          </h2>
          <p className="mx-auto max-w-2xl text-md leading-8 opacity-90">
            ویترین آنلاین، رزرو ۲۴ ساعته و مدیریت روزانه را از همین امروز یک‌جا داشته باشید.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/business/register"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary-contrast px-7 font-bold text-primary no-underline shadow-2 hover:opacity-90"
            >
              ثبت رایگان کسب‌وکار
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
            <Link
              to="/search"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-primary-contrast/40 px-7 font-bold text-primary-contrast no-underline hover:bg-primary-contrast/10"
            >
              <Search className="size-4" aria-hidden="true" />
              دیدن بازار آرا
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
