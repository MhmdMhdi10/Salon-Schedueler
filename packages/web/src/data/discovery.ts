/**
 * Presentation-only discovery data for the `/city/:city` and `/services/:type`
 * pages (task 5.3; R8.1, R8.4, R8.8; seo §1 "no doorway/thin pages").
 *
 * These pages are local/category discovery surfaces — the queries Iranian users
 * actually search («سالن زیبایی [محله/شهر]», «قیمت کوتاهی مو [شهر]»). The
 * steering standard is explicit (seo §1): city/service pages must carry
 * **genuine, differentiated content** — real cities, real services, real copy —
 * **not templated near-duplicates**. So each city and each service type owns a
 * hand-written Persian `title`, `intro`, and `body`, plus its own keyword-rich
 * heading. The list of matching salons is drawn from the same `data/salons.ts`
 * source that renders the profile pages, so the discovery list and the profile
 * NAP/JSON-LD never drift (seo §5, §11).
 *
 * Slugs are ASCII / transliterated (`tehran`, `haircut`) per seo §6 so the
 * canonical URL is clean. The set here mirrors the build-time enumeration in
 * `scripts/discovery.json` (which drives `sitemap.xml` and the prerender step);
 * an entry must exist in both to be both crawlable and renderable. This module
 * is **presentation only** and changes no API contract (R12.6).
 */

/** A city discovery surface (`/city/:city`). */
export interface City {
  /** ASCII / transliterated slug — the `/city/:city` path segment. */
  slug: string;
  /** City display name, Persian (e.g. «تهران»). */
  name: string;
  /** Province / region, Persian — used in the heading and copy. */
  region: string;
  /** One-line Persian intro used in the lead paragraph and meta description. */
  intro: string;
  /** Longer, differentiated Persian body copy (real, not templated). */
  body: string;
  /**
   * Real neighborhoods in this city, Persian (محله/منطقه) — surfaced as content
   * so the page targets neighborhood-level intent (seo §11) and is not thin.
   */
  neighborhoods: string[];
}

/** A service-type discovery surface (`/services/:type`). */
export interface ServiceType {
  /**
   * ASCII slug — the `/services/:type` segment. Matches `SalonService.id`
   * (e.g. `haircut`, `color`, `makeup`) so salons can be filtered by offering.
   */
  slug: string;
  /** Service display name, Persian (e.g. «کوتاهی مو»). */
  name: string;
  /** One-line Persian intro used in the lead paragraph and meta description. */
  intro: string;
  /** Longer, differentiated Persian body copy (real, not templated). */
  body: string;
  /**
   * What this service typically includes, Persian — concrete, service-specific
   * bullet content so the page carries genuine differentiated value (seo §1).
   */
  includes: string[];
}

const CITIES: Record<string, City> = {
  tehran: {
    slug: 'tehran',
    name: 'تهران',
    region: 'تهران',
    intro:
      'بهترین سالن‌های زیبایی تهران را پیدا کنید و نوبت کوتاهی، رنگ و میکاپ را آنلاین رزرو کنید.',
    body: 'تهران با ده‌ها سالن زیبایی در محله‌هایی مانند ولنجک، زعفرانیه و سعادت‌آباد، گزینه‌های متنوعی برای کوتاهی، رنگ مو و میکاپ ارائه می‌دهد. در این صفحه سالن‌های همکار ما در تهران را با خدمات و قیمت شفاف مشاهده می‌کنید و می‌توانید بدون تماس تلفنی نوبت بگیرید.',
    neighborhoods: ['ولنجک', 'زعفرانیه', 'سعادت‌آباد', 'الهیه', 'پاسداران'],
  },
};

const SERVICE_TYPES: Record<string, ServiceType> = {
  haircut: {
    slug: 'haircut',
    name: 'کوتاهی مو',
    intro:
      'سالن‌های کوتاهی مو را با قیمت و زمان شفاف مقایسه کنید و نوبت دلخواهتان را آنلاین رزرو کنید.',
    body: 'کوتاهی مو یکی از پرتقاضاترین خدمات سالن‌های زیبایی است. سالن‌های همکار ما کوتاهی تخصصی متناسب با فرم صورت و سبک دلخواه شما را ارائه می‌دهند. خدمت، تاریخ و زمان را انتخاب کنید و نوبت خود را در چند ثانیه ثبت کنید.',
    includes: ['مشاوره فرم مو', 'شستشو و کوتاهی', 'حالت‌دهی و سشوار'],
  },
  color: {
    slug: 'color',
    name: 'رنگ مو',
    intro:
      'رنگ مو حرفه‌ای در سالن‌های معتبر شهر؛ قیمت‌ها را ببینید و نوبت آنلاین بگیرید.',
    body: 'رنگ مو از انتخاب پالت تا اجرای تخصصی، نیازمند تجربه و رنگ باکیفیت است. سالن‌های همکار ما رنگ، هایلایت و مش را با مشاوره رنگ ارائه می‌دهند. پیش از مراجعه، خدمت و زمان دلخواهتان را آنلاین رزرو کنید.',
    includes: ['مشاوره و انتخاب رنگ', 'رنگ یا هایلایت', 'مراقبت و تثبیت رنگ'],
  },
  makeup: {
    slug: 'makeup',
    name: 'میکاپ',
    intro:
      'میکاپ عروس و مجلسی توسط میکاپ‌آرتیست‌های حرفه‌ای؛ مقایسه و رزرو آنلاین نوبت.',
    body: 'میکاپ تخصصی برای مراسم و مناسبت‌ها به مهارت و محصولات باکیفیت نیاز دارد. سالن‌های همکار ما میکاپ مجلسی و عروس را با مشاوره چهره ارائه می‌دهند. زمان مناسب را انتخاب و نوبت خود را آنلاین ثبت کنید.',
    includes: ['مشاوره چهره و پوست', 'پاکسازی و آماده‌سازی', 'اجرای میکاپ مجلسی یا عروس'],
  },
};

/** Returns a city by ASCII slug, or `undefined` if unknown. */
export function getCity(slug: string | undefined): City | undefined {
  if (!slug) return undefined;
  return CITIES[slug.trim()];
}

/** Returns a service type by ASCII slug, or `undefined` if unknown. */
export function getServiceType(slug: string | undefined): ServiceType | undefined {
  if (!slug) return undefined;
  return SERVICE_TYPES[slug.trim()];
}

/** All known city slugs (mirrors the sitemap/prerender enumeration). */
export function getCitySlugs(): string[] {
  return Object.keys(CITIES);
}

/** All known service-type slugs (mirrors the sitemap/prerender enumeration). */
export function getServiceTypeSlugs(): string[] {
  return Object.keys(SERVICE_TYPES);
}
