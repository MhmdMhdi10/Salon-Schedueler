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
 * Slugs are ASCII / transliterated (`tehran`, `hair`) per seo §6 so the
 * canonical URL is clean. The slug set is anchored to the canonical taxonomy in
 * `data/taxonomy.ts` (implementation contract): every one of the 8
 * `DISCOVERY_CATEGORIES` slugs and all 20 `DISCOVERY_CITIES` slugs resolve here
 * — cities/categories without partner salons render an honest empty state, not
 * a 404. Legacy slugs (`haircut`, `color`) remain as extra entries so old links
 * keep working. The set here mirrors the build-time enumeration in
 * `scripts/discovery.json` (which drives `sitemap.xml` and the prerender step);
 * an entry must exist in both to be both crawlable and renderable. This module
 * is **presentation only** and changes no API contract (R12.6).
 */

import { DISCOVERY_CATEGORIES, DISCOVERY_CITIES } from './taxonomy';
import { getAllSalonProfiles, type SalonProfile } from './salons';

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
   * ASCII slug — the `/services/:type` segment. The 8 canonical slugs come from
   * `taxonomy.ts` (`hair`, `barber`, …); legacy slugs (`haircut`, `color`)
   * remain resolvable but are excluded from link grids.
   */
  slug: string;
  /** Service display name, Persian (e.g. «آرایش مو»). */
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
  /**
   * `SalonService.id` values that belong to this category — the seam between
   * the taxonomy slug (`hair`) and the per-salon service ids (`haircut`,
   * `color`, `keratin`, …). A salon matches when it offers at least one of
   * these ids (and, when `salonCategories` is set, belongs to one of them).
   */
  serviceIds: string[];
  /**
   * Optional salon-category constraint (matches `SalonProfile.category`), e.g.
   * `barber` only lists «آرایشگاه مردانه» even though barbershops share the
   * generic `haircut` service id with women's salons.
   */
  salonCategories?: string[];
  /**
   * Legacy slug kept only so old inbound links resolve; excluded from
   * navigation/link grids (`getServiceTypeSlugs`).
   */
  legacy?: boolean;
}

/**
 * Hand-written per-city copy keyed by taxonomy slug. Every taxonomy city MUST
 * have an entry here (asserted by `data/__tests__/discovery.test.ts`).
 */
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
  mashhad: {
    slug: 'mashhad',
    name: 'مشهد',
    region: 'خراسان رضوی',
    intro: 'سالن‌های زیبایی مشهد را مقایسه کنید و نوبت خدمات مو، ناخن و پوست را آنلاین بگیرید.',
    body: 'مشهد دومین شهر بزرگ ایران است و محله‌هایی مانند احمدآباد، سجاد و هاشمیه از قطب‌های اصلی سالن‌های زیبایی شهر به‌شمار می‌روند. با گسترش آرا در مشهد، رزرو آنلاین نوبت بدون تماس تلفنی و با قیمت شفاف در دسترس سالن‌ها و مشتریان این شهر قرار می‌گیرد.',
    neighborhoods: ['احمدآباد', 'سجاد', 'هاشمیه', 'وکیل‌آباد', 'قاسم‌آباد'],
  },
  isfahan: {
    slug: 'isfahan',
    name: 'اصفهان',
    region: 'اصفهان',
    intro: 'رزرو آنلاین نوبت سالن‌های زیبایی اصفهان؛ خدمات مو، میکاپ و پوست با قیمت شفاف.',
    body: 'اصفهان از چهارباغ بالا تا مرداویج و ملک‌شهر سالن‌های زیبایی شناخته‌شده‌ای دارد و سبک کار سالن‌های این شهر در میکاپ مجلسی و شینیون زبانزد است. آرا رزرو نوبت این سالن‌ها را آنلاین و بدون پیام و تماس رفت‌وبرگشتی ممکن می‌کند.',
    neighborhoods: ['چهارباغ بالا', 'مرداویج', 'جلفا', 'ملک‌شهر', 'خانه اصفهان'],
  },
  shiraz: {
    slug: 'shiraz',
    name: 'شیراز',
    region: 'فارس',
    intro: 'سالن‌های زیبایی شیراز را ببینید و نوبت کوتاهی مو، ناخن و میکاپ را آنلاین رزرو کنید.',
    body: 'در شیراز محله‌های معالی‌آباد، قصرالدشت و فرهنگ‌شهر مرکز سالن‌های زیبایی فعال شهر هستند. با آرا می‌توانید خدمات و قیمت سالن‌های همکار در شیراز را مقایسه کنید و زمان دلخواهتان را در چند ثانیه ثبت کنید.',
    neighborhoods: ['معالی‌آباد', 'قصرالدشت', 'ستارخان', 'زرهی', 'فرهنگ‌شهر'],
  },
  karaj: {
    slug: 'karaj',
    name: 'کرج',
    region: 'البرز',
    intro: 'رزرو آنلاین نوبت آرایشگاه و سالن زیبایی در کرج؛ مقایسه خدمات و قیمت‌ها.',
    body: 'کرج با محله‌هایی مانند گوهردشت، عظیمیه و مهرشهر بازار بزرگی از سالن‌های زیبایی زنانه و مردانه دارد. آرا نوبت‌دهی این سالن‌ها را آنلاین می‌کند تا بدون تماس تلفنی، خدمت و ساعت دلخواهتان را انتخاب کنید.',
    neighborhoods: ['گوهردشت', 'عظیمیه', 'مهرشهر', 'جهانشهر', 'فردیس'],
  },
  tabriz: {
    slug: 'tabriz',
    name: 'تبریز',
    region: 'آذربایجان شرقی',
    intro: 'سالن‌های زیبایی تبریز؛ رزرو آنلاین نوبت خدمات مو، پوست و میکاپ با قیمت شفاف.',
    body: 'تبریز در محله‌های ولیعصر، آبرسان و ائل‌گلی سالن‌های زیبایی پرطرفداری دارد و مشتریان این شهر به کیفیت خدمات سخت‌گیرند. با پیوستن سالن‌های تبریز به آرا، رزرو نوبت آنلاین و شفافیت قیمت به این بازار می‌آید.',
    neighborhoods: ['ولیعصر', 'آبرسان', 'ائل‌گلی', 'باغمیشه', 'رشدیه'],
  },
  qom: {
    slug: 'qom',
    name: 'قم',
    region: 'قم',
    intro: 'رزرو آنلاین نوبت سالن‌های زیبایی قم؛ خدمات مو و پوست بدون تماس تلفنی.',
    body: 'در قم محله‌های صفائیه، زنبیل‌آباد و پردیسان بیشترین تراکم سالن‌های زیبایی را دارند. آرا به سالن‌های قم امکان می‌دهد نوبت‌هایشان را آنلاین مدیریت کنند و به مشتریان، انتخاب زمان بدون پیام و تماس رفت‌وبرگشتی می‌دهد.',
    neighborhoods: ['صفائیه', 'زنبیل‌آباد', 'پردیسان', 'سالاریه', 'بلوار امین'],
  },
  ahvaz: {
    slug: 'ahvaz',
    name: 'اهواز',
    region: 'خوزستان',
    intro: 'سالن‌های زیبایی اهواز را مقایسه کنید و نوبت میکاپ، مو و ناخن را آنلاین بگیرید.',
    body: 'کیانپارس و زیتون کارمندی شناخته‌شده‌ترین محله‌های سالن‌های زیبایی اهواز هستند و میکاپ مجلسی در این شهر بازار پررونقی دارد. آرا رزرو نوبت سالن‌های همکار اهواز را ساده و آنلاین می‌کند.',
    neighborhoods: ['کیانپارس', 'زیتون کارمندی', 'گلستان', 'کوروش', 'پادادشهر'],
  },
  rasht: {
    slug: 'rasht',
    name: 'رشت',
    region: 'گیلان',
    intro: 'رزرو آنلاین نوبت آرایشگاه و سالن زیبایی در رشت؛ خدمات و قیمت شفاف.',
    body: 'رشت با محوریت گلسار و منظریه سالن‌های زیبایی فعالی دارد و سبک خدمات مو و پوست در این شهر همیشه به‌روز است. با آرا سالن‌های رشت نوبت‌دهی آنلاین را به مشتریان خود ارائه می‌دهند.',
    neighborhoods: ['گلسار', 'منظریه', 'بلوار انصاری', 'خیابان معلم', 'بلوار دیلمان'],
  },
  urmia: {
    slug: 'urmia',
    name: 'ارومیه',
    region: 'آذربایجان غربی',
    intro: 'سالن‌های زیبایی ارومیه؛ رزرو آنلاین نوبت خدمات مو، ناخن و پوست.',
    body: 'در ارومیه خیابان دانشکده و شیخ‌تپه مرکز اصلی سالن‌های زیبایی شهر هستند. آرا برای سالن‌های ارومیه نوبت‌دهی آنلاین، یادآوری پیامکی و مدیریت تقویم را یک‌جا فراهم می‌کند.',
    neighborhoods: ['خیابان دانشکده', 'شیخ‌تپه', 'والفجر', 'خیام', 'استادان'],
  },
  kerman: {
    slug: 'kerman',
    name: 'کرمان',
    region: 'کرمان',
    intro: 'رزرو آنلاین نوبت سالن‌های زیبایی کرمان؛ مقایسه خدمات و قیمت‌ها.',
    body: 'کرمان در بلوار جمهوری و هفت‌باغ علوی سالن‌های زیبایی رو به رشدی دارد. با آرا، سالن‌های کرمان می‌توانند نوبت‌های خود را آنلاین بفروشند و مشتریان بدون تماس تلفنی زمان دلخواهشان را رزرو کنند.',
    neighborhoods: ['بلوار جمهوری', 'میدان آزادی', 'خیابان شریعتی', 'هفت‌باغ علوی'],
  },
  yazd: {
    slug: 'yazd',
    name: 'یزد',
    region: 'یزد',
    intro: 'سالن‌های زیبایی یزد؛ رزرو آنلاین نوبت خدمات مو و پوست با قیمت شفاف.',
    body: 'صفائیه و آزادشهر از محله‌های اصلی سالن‌های زیبایی یزد هستند. آرا رزرو نوبت سالن‌های همکار یزد را آنلاین می‌کند تا انتخاب خدمت، تاریخ و ساعت تنها چند ثانیه طول بکشد.',
    neighborhoods: ['صفائیه', 'آزادشهر', 'بلوار طالقانی', 'امام‌شهر'],
  },
  qazvin: {
    slug: 'qazvin',
    name: 'قزوین',
    region: 'قزوین',
    intro: 'رزرو آنلاین نوبت آرایشگاه و سالن زیبایی در قزوین.',
    body: 'قزوین با محله‌هایی مانند خیام و پونک سالن‌های زیبایی فعالی دارد و به تهران و کرج نزدیک است. با آرا سالن‌های قزوین نوبت‌دهی آنلاین و یادآوری خودکار نوبت را به مشتریان ارائه می‌دهند.',
    neighborhoods: ['خیام', 'فردوسی', 'پونک', 'مینودر', 'ملاصدرا'],
  },
  sari: {
    slug: 'sari',
    name: 'ساری',
    region: 'مازندران',
    intro: 'سالن‌های زیبایی ساری؛ رزرو آنلاین نوبت خدمات مو، میکاپ و ناخن.',
    body: 'ساری مرکز مازندران است و بلوار خزر و طبرستان بیشترین سالن‌های زیبایی شهر را در خود جای داده‌اند. آرا برای سالن‌های ساری رزرو آنلاین و مدیریت نوبت را یکپارچه می‌کند.',
    neighborhoods: ['بلوار خزر', 'بلوار طالقانی', 'طبرستان', 'میدان امام'],
  },
  kish: {
    slug: 'kish',
    name: 'کیش',
    region: 'هرمزگان',
    intro: 'رزرو آنلاین نوبت سالن‌های زیبایی جزیره کیش؛ خدمات لوکس با قیمت شفاف.',
    body: 'کیش مقصد سفر و مراسم است و سالن‌های زیبایی جزیره در نوبنیاد و صدف به میکاپ و شینیون مجلسی شهرت دارند. آرا رزرو نوبت این سالن‌ها را برای ساکنان و مسافران آنلاین می‌کند.',
    neighborhoods: ['نوبنیاد', 'صدف', 'میرمهنا', 'مرکز شهر'],
  },
  'bandar-abbas': {
    slug: 'bandar-abbas',
    name: 'بندرعباس',
    region: 'هرمزگان',
    intro: 'سالن‌های زیبایی بندرعباس؛ رزرو آنلاین نوبت بدون تماس تلفنی.',
    body: 'گلشهر و آزادشهر مرکز سالن‌های زیبایی بندرعباس هستند. با آرا سالن‌های بندرعباس نوبت‌دهی آنلاین را راه می‌اندازند و مشتریان زمان دلخواهشان را بدون منتظر ماندن پشت تلفن ثبت می‌کنند.',
    neighborhoods: ['گلشهر', 'آزادشهر', 'سورو', 'بلوار ساحلی'],
  },
  hamedan: {
    slug: 'hamedan',
    name: 'همدان',
    region: 'همدان',
    intro: 'رزرو آنلاین نوبت سالن‌های زیبایی همدان؛ مقایسه خدمات و قیمت‌ها.',
    body: 'در همدان خیابان بوعلی و سعیدیه محور اصلی سالن‌های زیبایی شهر هستند. آرا به سالن‌های همدان کمک می‌کند نوبت‌هایشان را آنلاین مدیریت کنند و به مشتریان انتخاب شفاف خدمت و قیمت می‌دهد.',
    neighborhoods: ['خیابان بوعلی', 'بلوار ارم', 'سعیدیه', 'استادان'],
  },
  gorgan: {
    slug: 'gorgan',
    name: 'گرگان',
    region: 'گلستان',
    intro: 'سالن‌های زیبایی گرگان؛ رزرو آنلاین نوبت خدمات مو و پوست.',
    body: 'گرگان با محله‌های ناهارخوران و گرگان‌پارس سالن‌های زیبایی رو به رشدی دارد. آرا رزرو نوبت سالن‌های همکار گرگان را آنلاین و بدون تماس تلفنی ممکن می‌کند.',
    neighborhoods: ['ناهارخوران', 'گرگان‌پارس', 'بلوار صیاد شیرازی', 'عدالت'],
  },
  kermanshah: {
    slug: 'kermanshah',
    name: 'کرمانشاه',
    region: 'کرمانشاه',
    intro: 'رزرو آنلاین نوبت آرایشگاه و سالن زیبایی در کرمانشاه.',
    body: 'کرمانشاه در الهیه و ۲۲ بهمن سالن‌های زیبایی شناخته‌شده‌ای دارد. با آرا سالن‌های کرمانشاه نوبت‌دهی آنلاین را به مشتریان ارائه می‌دهند و تقویم کاری‌شان را یک‌جا مدیریت می‌کنند.',
    neighborhoods: ['الهیه', 'طاق‌بستان', 'فرهنگیان', '۲۲ بهمن'],
  },
  arak: {
    slug: 'arak',
    name: 'اراک',
    region: 'مرکزی',
    intro: 'سالن‌های زیبایی اراک؛ رزرو آنلاین نوبت با قیمت و خدمات شفاف.',
    body: 'اراک مرکز استان مرکزی است و شهرک گردو و خیابان امام خمینی از مراکز اصلی سالن‌های زیبایی شهر به‌شمار می‌روند. آرا رزرو نوبت سالن‌های همکار اراک را ساده، آنلاین و بدون تماس تلفنی می‌کند.',
    neighborhoods: ['شهرک گردو', 'خیابان امام خمینی', 'سنجان', 'دانشگاه'],
  },
};

/**
 * Category pages keyed by slug. The 8 canonical taxonomy slugs plus resolvable
 * legacy slugs (`haircut`, `color`). Labels for the canonical entries mirror
 * `DISCOVERY_CATEGORIES` (asserted in tests).
 */
const SERVICE_TYPES: Record<string, ServiceType> = {
  hair: {
    slug: 'hair',
    name: 'آرایش مو',
    intro:
      'سالن‌های آرایش مو را مقایسه کنید؛ کوتاهی، رنگ، کراتین و شینیون با قیمت شفاف و رزرو آنلاین.',
    body: 'آرایش مو گسترده‌ترین خدمت سالن‌های زیبایی است: از کوتاهی و رنگ تا کراتین، احیا و شینیون مجلسی. سالن‌های همکار ما خدمات مو را با شرح، مدت‌زمان و قیمت مشخص ارائه می‌دهند تا پیش از رزرو دقیقاً بدانید چه چیزی دریافت می‌کنید.',
    includes: ['مشاوره فرم و سلامت مو', 'کوتاهی و رنگ تخصصی', 'کراتین، احیا و شینیون'],
    serviceIds: ['haircut', 'color', 'keratin', 'chignon', 'haircare'],
    salonCategories: ['سالن زیبایی زنانه'],
  },
  barber: {
    slug: 'barber',
    name: 'آرایشگاه مردانه',
    intro: 'آرایشگاه‌های مردانه را با نمونه‌کار و قیمت مقایسه کنید و نوبت اصلاح را آنلاین بگیرید.',
    body: 'آرایشگاه‌های مردانه همکار ما اصلاح مو و ریش، فید و اسکین‌فید و گریم داماد را با نوبت‌دهی آنلاین ارائه می‌دهند. به‌جای منتظر ماندن در صف، ساعت دقیق را رزرو کنید و سر وقت روی صندلی بنشینید.',
    includes: ['اصلاح مو و فید', 'اصلاح و طراحی ریش', 'گریم و آماده‌سازی داماد'],
    serviceIds: [],
    salonCategories: ['آرایشگاه مردانه'],
  },
  nails: {
    slug: 'nails',
    name: 'ناخن',
    intro:
      'خدمات ناخن — کاشت، ترمیم، مانیکور و پدیکور — را با قیمت شفاف مقایسه و آنلاین رزرو کنید.',
    body: 'خدمات ناخن به ظرافت و بهداشت بالا نیاز دارد. سالن‌های همکار ما کاشت و ترمیم ناخن، مانیکور و پدیکور را با مواد استاندارد و ابزار ضدعفونی‌شده انجام می‌دهند. مدل و زمان دلخواهتان را انتخاب کنید و نوبت را آنلاین ثبت کنید.',
    includes: ['کاشت و ترمیم ناخن', 'مانیکور و پدیکور', 'طراحی و ژلیش'],
    serviceIds: ['nails', 'manicure', 'pedicure'],
  },
  skin: {
    slug: 'skin',
    name: 'مراقبت پوست',
    intro: 'پاکسازی و مراقبت تخصصی پوست در سالن‌های معتبر؛ مشاوره، خدمات و رزرو آنلاین.',
    body: 'سلامت پوست با مراقبت منظم به‌دست می‌آید. سالن‌های همکار ما پاکسازی عمقی، هیدرودرمی و روتین‌های مراقبتی را متناسب با نوع پوست شما ارائه می‌دهند. نوع خدمت را ببینید، قیمت را مقایسه کنید و زمان مناسب را آنلاین رزرو کنید.',
    includes: ['آنالیز و مشاوره پوست', 'پاکسازی عمقی صورت', 'هیدرودرمی و ماسک تخصصی'],
    serviceIds: ['facial', 'skincare'],
  },
  brows: {
    slug: 'brows',
    name: 'ابرو و مژه',
    intro: 'اصلاح و طراحی ابرو، لیفت و اکستنشن مژه در سالن‌های معتبر؛ رزرو آنلاین نوبت.',
    body: 'فرم ابرو قاب چهره است. سالن‌های همکار ما اصلاح و طراحی ابرو متناسب با چهره و خدمات مژه را با متخصصان باتجربه ارائه می‌دهند. پیش از مراجعه، خدمت و زمان دلخواهتان را آنلاین انتخاب کنید.',
    includes: ['طراحی ابرو متناسب چهره', 'اصلاح با بند و موم', 'لیفت و اکستنشن مژه'],
    serviceIds: ['brows', 'lashes'],
  },
  massage: {
    slug: 'massage',
    name: 'ماساژ',
    intro: 'ماساژ ریلکسی و درمانی در مراکز معتبر؛ به‌زودی با رزرو آنلاین در آرا.',
    body: 'ماساژ حرفه‌ای خستگی عضلات را می‌گیرد و کیفیت خواب و تمرکز را بهتر می‌کند. مراکز ماساژ همکار به‌تدریج به آرا می‌پیوندند تا رزرو جلسه ریلکسی یا درمانی هم مانند بقیه خدمات، آنلاین و شفاف باشد.',
    includes: ['ماساژ ریلکسی سوئدی', 'ماساژ بافت عمقی', 'ماساژ سنگ داغ'],
    serviceIds: ['massage'],
  },
  makeup: {
    slug: 'makeup',
    name: 'میکاپ',
    intro: 'میکاپ عروس و مجلسی توسط میکاپ‌آرتیست‌های حرفه‌ای؛ مقایسه و رزرو آنلاین نوبت.',
    body: 'میکاپ تخصصی برای مراسم و مناسبت‌ها به مهارت و محصولات باکیفیت نیاز دارد. سالن‌های همکار ما میکاپ مجلسی و عروس را با مشاوره چهره ارائه می‌دهند. زمان مناسب را انتخاب و نوبت خود را آنلاین ثبت کنید.',
    includes: ['مشاوره چهره و پوست', 'پاکسازی و آماده‌سازی', 'اجرای میکاپ مجلسی یا عروس'],
    serviceIds: ['makeup', 'bridal-makeup', 'groom'],
  },
  spa: {
    slug: 'spa',
    name: 'سلامت و اسپا',
    intro: 'خدمات اسپا و آرامش — سونا، جکوزی و پکیج‌های مراقبتی؛ به‌زودی در آرا.',
    body: 'اسپا ترکیبی از مراقبت پوست، ماساژ و آرامش است. مجموعه‌های اسپا و سلامت به‌تدریج به شبکه آرا اضافه می‌شوند تا بتوانید پکیج‌های مراقبتی را ببینید، قیمت‌ها را مقایسه کنید و جلسه‌تان را آنلاین رزرو کنید.',
    includes: ['پکیج‌های مراقبت و آرامش', 'سونا و جکوزی', 'ماساژ و مراقبت پوست'],
    serviceIds: ['spa'],
  },
  // ── Legacy slugs — old inbound links keep resolving (seo §6). ──
  haircut: {
    slug: 'haircut',
    name: 'کوتاهی مو',
    intro:
      'سالن‌های کوتاهی مو را با قیمت و زمان شفاف مقایسه کنید و نوبت دلخواهتان را آنلاین رزرو کنید.',
    body: 'کوتاهی مو یکی از پرتقاضاترین خدمات سالن‌های زیبایی است. سالن‌های همکار ما کوتاهی تخصصی متناسب با فرم صورت و سبک دلخواه شما را ارائه می‌دهند. خدمت، تاریخ و زمان را انتخاب کنید و نوبت خود را در چند ثانیه ثبت کنید.',
    includes: ['مشاوره فرم مو', 'شستشو و کوتاهی', 'حالت‌دهی و سشوار'],
    serviceIds: ['haircut'],
    legacy: true,
  },
  color: {
    slug: 'color',
    name: 'رنگ مو',
    intro: 'رنگ مو حرفه‌ای در سالن‌های معتبر شهر؛ قیمت‌ها را ببینید و نوبت آنلاین بگیرید.',
    body: 'رنگ مو از انتخاب پالت تا اجرای تخصصی، نیازمند تجربه و رنگ باکیفیت است. سالن‌های همکار ما رنگ، هایلایت و مش را با مشاوره رنگ ارائه می‌دهند. پیش از مراجعه، خدمت و زمان دلخواهتان را آنلاین رزرو کنید.',
    includes: ['مشاوره و انتخاب رنگ', 'رنگ یا هایلایت', 'مراقبت و تثبیت رنگ'],
    serviceIds: ['color'],
    legacy: true,
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

/**
 * Canonical (non-legacy) service-type slugs in taxonomy display order — the
 * set used for link grids and filter chips.
 */
export function getServiceTypeSlugs(): string[] {
  return DISCOVERY_CATEGORIES.map((c) => c.slug);
}

/** Every resolvable service-type slug, including legacy aliases. */
export function getAllServiceTypeSlugs(): string[] {
  return Object.keys(SERVICE_TYPES);
}

/** All known city slugs, in taxonomy display order. */
export function getCitySlugs(): string[] {
  return DISCOVERY_CITIES.map((c) => c.slug);
}

/**
 * Salons matching a category page: offers at least one of the category's
 * `serviceIds` (when set) and belongs to one of its `salonCategories` (when
 * set). Barbershops match `barber` purely by salon category; `hair` requires
 * both a hair service and a women's-salon category so barbershops offering
 * `haircut` don't leak in.
 */
export function getSalonsForServiceType(type: ServiceType): SalonProfile[] {
  return getAllSalonProfiles().filter((salon) => {
    if (type.salonCategories && !type.salonCategories.includes(salon.category ?? '')) {
      return false;
    }
    if (type.serviceIds.length === 0) return Boolean(type.salonCategories);
    return salon.services.some((svc) => type.serviceIds.includes(svc.id));
  });
}
