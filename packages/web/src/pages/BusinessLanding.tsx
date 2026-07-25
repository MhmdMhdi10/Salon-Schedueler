import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { JsonLd, SeoHead, SITE_NAME, SITE_URL } from '../components/seo';

const BENEFITS = [
  {
    title: 'همیشه رزرو بمانید، بدون رفت‌وبرگشت',
    body: 'مشتری‌ها ۲۴ ساعته رزرو می‌کنند و شما به جای تلفن، روی صندلی و مشتری تمرکز می‌کنید.',
  },
  {
    title: 'از کارهای تکراری خلاص شوید',
    body: 'یادآوری، پرداخت و رزرو مجدد را خودکار کنید تا وقت بیشتری برای کار دلخواهتان داشته باشید.',
  },
  {
    title: 'کسب‌وکاری بسازید که به آن افتخار کنید',
    body: 'با نظر مشتریان، بازاریابی و بازار مشتریان تازه، برند سالن خود را رشد دهید.',
  },
] as const;

const FEATURES = [
  {
    title: 'تقویم و نوبت‌ها',
    body: 'روزتان را با تقویم هوشمند مدیریت کنید؛ ثبت، جابه‌جایی و پیگیری همه نوبت‌ها در یک‌جا.',
  },
  {
    title: 'پرداخت سریع، ساده و امن',
    body: 'پرداخت حضوری یا آنلاین، صدور صورت‌حساب و تسویه سریع‌تر با پرداخت آرا.',
  },
  {
    title: 'ابزارهای بازاریابی داخلی',
    body: 'با یادآوری، پیشنهاد ویژه و لینک رزرو شبکه‌های اجتماعی، تقویمتان را پر کنید.',
  },
  {
    title: 'محافظت در برابر عدم حضور',
    body: 'با بیعانه، قوانین لغو و یادآوری خودکار، نوبت‌های از‌دست‌رفته را کاهش دهید.',
  },
] as const;

const METRICS = [
  ['۳۳۰٬۰۰۰', 'متخصص زیبایی'],
  ['۴۴+ میلیون', 'مشتری'],
  ['۲۰٪ بیشتر', 'رزرو'],
  ['۲۵٪ کاهش', 'عدم حضور'],
] as const;

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
        className="flex min-h-[55vh] items-center bg-accent/10 px-4 py-16 text-center"
      >
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold leading-display sm:text-3xl">
            اپلیکیشن کسب‌وکار برای آرایشگران، استایلیست‌ها و صاحبان سالن
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted">
            چه مستقل کار کنید و چه یک سالن کامل داشته باشید، آرا در هر طرح همه امکانات
            را به شما می‌دهد: زمان‌بندی، پرداخت، بازاریابی مشتری و بازاری از مشتریان
            محلی که دنبال شما هستند.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/business/register"
              data-cta="primary"
              className="inline-flex min-h-12 items-center rounded-md bg-primary px-8 font-semibold text-primary-contrast no-underline shadow-1"
            >
              رایگان شروع کنید
            </Link>
            <Link
              to="/"
              data-cta="secondary"
              className="inline-flex min-h-12 items-center rounded-md border border-text px-8 font-semibold text-primary no-underline"
            >
              مشاهده نسخه مشتری
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-20 md:grid-cols-3">
        {BENEFITS.map((benefit) => (
          <article key={benefit.title}>
            <h2 className="text-xl font-semibold leading-8">{benefit.title}</h2>
            <p className="mt-3 leading-7 text-muted">{benefit.body}</p>
          </article>
        ))}
      </section>

      <section id="features" className="bg-surface py-20">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-center text-xl font-bold">همه امکانات در همه طرح‌ها</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className="rounded-2xl border border-black/10 bg-white p-6"
              >
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-3 leading-7 text-muted">{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-text px-4 py-20 text-bg">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-xl font-bold">آرا به روایت عددها</h2>
          <div className="mt-12 grid grid-cols-2 gap-8 text-center md:grid-cols-4">
            {METRICS.map(([value, label]) => (
              <div key={label}>
                <div className="text-2xl font-medium text-accent">{value}</div>
                <div className="mt-1 text-sm text-white/80">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 text-center">
        <h2 className="text-xl font-bold">آرا برای کسب‌وکار شما</h2>
        <p className="mt-4 text-muted">
          به هزاران متخصص زیبایی بپیوندید که همین حالا با آرا رشد می‌کنند.
        </p>
        <Link
          to="/business/register"
          className="mt-8 inline-flex min-h-12 items-center rounded-md bg-primary px-8 font-semibold text-primary-contrast no-underline"
        >
          رایگان شروع کنید
        </Link>
      </section>
    </div>
  );
}

export default BusinessLanding;
