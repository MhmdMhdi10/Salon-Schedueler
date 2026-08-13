import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { JsonLd, SeoHead, SITE_NAME, SITE_URL } from '../components/seo';
import { BusinessLandingContent as EagerLandingContent } from './BusinessLandingContent';

type LandingVariant =
  | 'business'
  | 'day'
  | 'card'
  | 'heatmap'
  | 'command'
  | 'compare'
  | 'mirror'
  | 'loop'
  | 'backstage'
  | 'funnel'
  | 'checklist';

const VARIANT_DESCRIPTIONS: Record<LandingVariant, string> = {
  business:
    'آرا تقویم، رزرو آنلاین، مشتری‌ها و کمپین معرفی را برای سالن‌های زیبایی ایران در یک فضای فارسی جمع می‌کند.',
  day: 'روز سالن را در یک نگاه ببینید؛ تقویم، رزرو آنلاین و مشتری‌ها را از یک پنل مدیریت کنید.',
  card: 'یک لینک زنده برای سالن بسازید؛ مشتری خدمات و زمان را می‌بیند و بدون نصب اپ رزرو می‌کند.',
  heatmap: 'ساعت‌های خالی، ظرفیت تیم و فرصت‌های درآمدی سالن را واضح‌تر از همیشه ببینید.',
  command:
    'آرا اتاق فرمان سالن شماست؛ کارهای روزانه را سریع انجام دهید و چیزی بین پیام‌ها گم نشود.',
  compare: 'پیام‌های پراکنده را به رزروهای قطعی تبدیل کنید؛ قبل و بعد مدیریت سالن را ببینید.',
  mirror: 'پشت ظاهر آرام سالن، تقویم و مشتری‌ها را حرفه‌ای مدیریت کنید؛ با تجربه‌ای ساده و خوش‌حس.',
  loop: 'مشتری را از اولین نوبت تا مراجعه بعدی همراه کنید؛ سابقه، یادآوری و رزرو در یک چرخه.',
  backstage:
    'مشتری فقط نتیجه را می‌بیند؛ شما پشت‌صحنهٔ سالن، زمان‌ها و پیگیری‌ها را کنترل می‌کنید.',
  funnel: 'بیوی اینستاگرام، QR و پیام‌ها را به یک مسیر کوتاه برای رزرو سالن وصل کنید.',
  checklist: 'در چند دقیقه سالن را آنلاین کنید؛ خدمات، ساعت کاری و لینک رزرو را آماده کنید.',
};

const LEGACY_ALIASES: Record<string, LandingVariant> = {
  full: 'day',
  brand: 'card',
  roi: 'heatmap',
  campaign: 'funnel',
};

const LazyLandingContent = lazy(() =>
  import('./BusinessLandingContent').then((module) => ({ default: module.BusinessLandingContent })),
);
// Keep component tests synchronous; production still gets a real lazy boundary.
const LandingContent = import.meta.env.MODE === 'test' ? EagerLandingContent : LazyLandingContent;

function resolveVariant(value: string | null): LandingVariant {
  if (value && value in LEGACY_ALIASES) return LEGACY_ALIASES[value];
  return value && value in VARIANT_DESCRIPTIONS ? (value as LandingVariant) : 'business';
}

/** Owner-acquisition landing. Use ?variant=...&preview=1 for concept previews. */
export function BusinessLanding() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const variant = resolveVariant(searchParams.get('variant'));
  const preview = searchParams.get('preview') === '1';
  const description = VARIANT_DESCRIPTIONS[variant] ?? t('seo.descriptions.business');

  return (
    <div data-testid="business-landing" data-landing-variant={variant} className="bg-bg text-text">
      <SeoHead title={t('seo.titles.business')} description={description} path="/" index />
      <JsonLd
        data={[
          { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL, inLanguage: 'fa-IR' },
          { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
        ]}
      />
      <Suspense fallback={null}>
        <LandingContent variant={variant} preview={preview} />
      </Suspense>
    </div>
  );
}

export default BusinessLanding;
