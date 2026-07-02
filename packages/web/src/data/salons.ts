/**
 * Presentation-only public salon-profile data (task 5.2; R8.1, R8.3, R8.4,
 * R8.8, R9.1).
 *
 * This module is the single source of truth for the **visible** content of a
 * public salon profile (`/s/:slug`) *and* the JSON-LD that mirrors it, so the
 * NAP block on the page and the `BeautySalon`/`Service` structured data stay
 * byte-for-byte consistent (seo §5, §11 — "keep NAP identical across page,
 * JSON-LD, and off-site listings"). It is **presentation only**: it carries no
 * authenticated data and changes no API contract (R12.6).
 *
 * Slugs are ASCII / transliterated (`salon-rose`) per seo §6 so the canonical
 * URL is clean and stable. The set here matches the build-time slug enumeration
 * in `scripts/salons.json` (which drives `sitemap.xml` and the prerender step);
 * a salon must exist in both to be both crawlable (sitemap/prerender) and
 * renderable (this module). New salons are not indexable until the next build —
 * the documented caveat in `scripts/prerender.mjs`.
 *
 * Opening hours follow the **Iranian week** (Saturday is the first working day,
 * Friday the weekend — seo §11). Hours are stored once and rendered Saturday-
 * first on the page while the JSON-LD `openingHoursSpecification` uses the
 * schema.org English day names.
 */

/** schema.org day-of-week tokens, used in `openingHoursSpecification`. */
export type SchemaDay =
  | 'Saturday'
  | 'Sunday'
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday';

/**
 * The Iranian working week in display order: Saturday first, Friday (the
 * weekend) last. Used to render the hours table and to order the JSON-LD spec.
 */
export const IRANIAN_WEEK_ORDER: readonly SchemaDay[] = [
  'Saturday',
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
] as const;

/** Persian label for each schema.org day token (for the visible hours table). */
export const PERSIAN_DAY_LABEL: Record<SchemaDay, string> = {
  Saturday: 'شنبه',
  Sunday: 'یکشنبه',
  Monday: 'دوشنبه',
  Tuesday: 'سه‌شنبه',
  Wednesday: 'چهارشنبه',
  Thursday: 'پنجشنبه',
  Friday: 'جمعه',
};

/** One day's opening hours. `closed` days carry no `opens`/`closes`. */
export interface OpeningHours {
  day: SchemaDay;
  /** `HH:mm`, 24-hour. Omitted when `closed`. */
  opens?: string;
  /** `HH:mm`, 24-hour. Omitted when `closed`. */
  closes?: string;
  /** True when the salon is closed that day (e.g. Friday weekend). */
  closed?: boolean;
}

/** A single offered service, priced in Iranian Rial (the machine unit). */
export interface SalonService {
  /** Stable id (also used as a React key). */
  id: string;
  /** Persian service name as customers search it (e.g. «کوتاهی مو»). */
  name: string;
  /** Duration in minutes. */
  durationMinutes: number;
  /** Price in Iranian Rial (machine value; rendered via `<Money>`). */
  priceRial: number;
}

/**
 * A single customer review shown on the profile (marketplace "social proof",
 * Booksy-style). Presentation-only demo content — mirrored into the page's
 * `AggregateRating`/`Review` JSON-LD so the structured data only ever marks up
 * what is visible on the page (seo §5 — never fabricate rich-result reviews for
 * content that is not shown).
 */
export interface SalonReview {
  /** Stable id (also used as a React key). */
  id: string;
  /** Reviewer display name, Persian (e.g. «سارا محمدی»). */
  author: string;
  /** Star rating 1–5 (integer for display). */
  rating: number;
  /** ISO instant the review was published (rendered Jalali on the page). */
  date: string;
  /** The review text, Persian. */
  body: string;
  /** Optional service the review is about, Persian (e.g. «رنگ مو»). */
  service?: string;
}

/**
 * A bookable team member surfaced on the profile ("meet the team", Booksy-
 * style). Presentation-only; avatars render as initials so no per-person image
 * assets are required and the profile's image contract stays clean.
 */
export interface SalonStaff {
  /** Stable id (also used as a React key). */
  id: string;
  /** Full name, Persian (e.g. «مینا رضایی»). */
  name: string;
  /** Role / specialty, Persian (e.g. «متخصص رنگ»). */
  role: string;
}

/** A gallery image with explicit dimensions (CLS-safe) and Persian alt text. */
export interface GalleryImage {
  /** Fallback `<img src>` — a universally-supported PNG/JPG. */
  src: string;
  /** Fallback responsive candidate set for the `<img>` itself (optional). */
  srcSet?: string;
  /**
   * Modern-format responsive candidate sets (task 11.2; R9.5). Served before
   * the PNG/JPG fallback via `<picture>` `<source>`s, most-compressed first.
   */
  avifSrcSet?: string;
  webpSrcSet?: string;
  width: number;
  height: number;
  /** Meaningful Persian alt (seo §2), e.g. «نمونه کار رنگ مو در سالن رز». */
  alt: string;
}

/** Name / Address / Phone block — the canonical NAP for page + JSON-LD. */
export interface SalonAddress {
  /** Street address line, Persian. */
  streetAddress: string;
  /** City / locality, Persian (e.g. «تهران»). */
  addressLocality: string;
  /** Region / province, Persian (e.g. «تهران»). */
  addressRegion: string;
  /** ISO country code. */
  addressCountry: string;
}

/** Precise coordinates for the map embed and JSON-LD `geo`. */
export interface SalonGeo {
  latitude: number;
  longitude: number;
}

/**
 * Off-page booking/contact channels a customer can use besides the on-page
 * funnel: the platform web app/site and the salon's chat bots (Bale + Telegram,
 * the two Iranian-market messengers this platform integrates). All optional and
 * presentation-only; rendered as external links on the profile.
 */
export interface SalonChannels {
  /** The platform web app / marketing site (internal route or absolute URL). */
  website?: string;
  /** Bale bot deep link (Iranian messenger). */
  bale?: string;
  /** Telegram bot deep link. */
  telegram?: string;
}

/** A full public salon profile. */
export interface SalonProfile {
  /** ASCII / transliterated slug — the `/s/:slug` path segment. */
  slug: string;
  /** Display name, Persian (e.g. «سالن رز»). */
  name: string;
  /**
   * Optional configured display name used as the primary brand mark (R4.5).
   * Falls back to `name` when absent.
   */
  displayName?: string;
  /** Optional salon logo shown beside the brand mark (R4.5). */
  logoUrl?: string;
  /**
   * The booking-funnel salon id this profile links to. The CTA navigates into
   * `/salon/:salonId/book`; the public slug and the internal id are kept
   * separate (the slug never leaks an internal id into an indexable URL).
   */
  bookingSalonId: string;
  /**
   * ASCII city slug this salon belongs to — the `/city/:city` discovery page
   * segment (e.g. `tehran`). Links the salon into its city discovery surface
   * without leaking the Persian locality name into the URL (seo §6). Must match
   * a `City.slug` in `data/discovery.ts`.
   */
  citySlug: string;
  /** One-line Persian intro used in the lead paragraph and meta description. */
  tagline: string;
  /** Longer Persian description (kept to a readable measure on the page). */
  description: string;
  /** Neighborhood / area, Persian (e.g. «ولنجک») — used in the `<h1>`. */
  neighborhood: string;
  /** Canonical NAP address. */
  address: SalonAddress;
  /** Telephone in international format (e.g. `+98-21-1234-5678`). */
  telephone: string;
  /** schema.org `priceRange` indicator (e.g. `$$`). */
  priceRange: string;
  /**
   * Short category label, Persian (e.g. «آرایشگاه زنانه») — shown on the
   * profile hero and on marketplace salon cards (Booksy-style).
   */
  category?: string;
  /**
   * Average customer rating (1–5, one decimal, e.g. `4.8`) shown on the hero
   * and salon cards. Mirrored into the profile's `AggregateRating` JSON-LD.
   */
  rating?: number;
  /** Total number of reviews behind `rating` (mirrored into JSON-LD). */
  reviewCount?: number;
  /** Precise coordinates. */
  geo: SalonGeo;
  /** Opening hours (stored once; rendered Iranian-week order). */
  openingHours: OpeningHours[];
  /** Offered services, priced in Rial. */
  services: SalonService[];
  /** Bookable team members surfaced on the profile ("meet the team"). */
  staff?: SalonStaff[];
  /** Customer reviews surfaced on the profile (mirrored into JSON-LD). */
  reviews?: SalonReview[];
  /** Gallery images (sized, lazy, Persian alt). */
  gallery: GalleryImage[];
  /**
   * Lazy-loaded map embed URL (Neshan/Balad — Iranian map platforms, seo §11).
   * Rendered in a `loading="lazy"` iframe so it never blocks first paint.
   */
  mapEmbedUrl: string;
  /** Absolute OG/Twitter image for this salon (1200×630). */
  ogImage?: string;
  /** Off-page booking channels (web app/site, Bale + Telegram bots). */
  channels?: SalonChannels;
  /**
   * Optional Brand_Accent key (from the curated `ACCENTS`) for the storefront
   * (signature-ui-system R4.1/R4.2). Lets a prerendered `/s/:slug` profile carry
   * its accent without a DB round-trip; `undefined` = the signature default.
   */
  brandAccent?: string;
}

/**
 * The public salon profiles, keyed by ASCII slug. Mirrors the build-time slug
 * list in `scripts/salons.json`. Image paths point at assets shipped under
 * `public/` so nothing 404s at runtime.
 */
const SALON_PROFILES: Record<string, SalonProfile> = {
  'salon-rose': {
    slug: 'salon-rose',
    name: 'سالن رز',
    // Real seeded salon UUID (docker/db/dev-seed.sql) so the booking funnel
    // hits an existing DB row. The public slug stays ASCII for clean URLs; the
    // internal id is the dev salon's fixed UUID.
    bookingSalonId: '11111111-1111-1111-1111-111111111111',
    citySlug: 'tehran',
    tagline: 'رزرو آنلاین نوبت کوتاهی، رنگ و میکاپ در سالن رز.',
    description:
      'سالن زیبایی رز در ولنجک تهران با کادری حرفه‌ای، خدمات کوتاهی، رنگ و مراقبت مو و میکاپ تخصصی را با نوبت‌دهی آنلاین ارائه می‌دهد. خدمت، تاریخ و زمان دلخواهتان را انتخاب کنید و نوبت خود را در چند ثانیه ثبت کنید.',
    neighborhood: 'ولنجک',
    address: {
      streetAddress: 'ولنجک، خیابان نمونه، پلاک ۱۰',
      addressLocality: 'تهران',
      addressRegion: 'تهران',
      addressCountry: 'IR',
    },
    telephone: '+98-21-1234-5678',
    priceRange: '$$',
    category: 'آرایشگاه و سالن زیبایی زنانه',
    rating: 4.8,
    reviewCount: 124,
    geo: { latitude: 35.8, longitude: 51.4 },
    openingHours: [
      { day: 'Saturday', opens: '10:00', closes: '20:00' },
      { day: 'Sunday', opens: '10:00', closes: '20:00' },
      { day: 'Monday', opens: '10:00', closes: '20:00' },
      { day: 'Tuesday', opens: '10:00', closes: '20:00' },
      { day: 'Wednesday', opens: '10:00', closes: '20:00' },
      { day: 'Thursday', opens: '10:00', closes: '18:00' },
      { day: 'Friday', closed: true },
    ],
    services: [
      { id: 'haircut', name: 'کوتاهی مو', durationMinutes: 45, priceRial: 2500000 },
      { id: 'color', name: 'رنگ مو', durationMinutes: 120, priceRial: 8500000 },
      { id: 'makeup', name: 'میکاپ', durationMinutes: 90, priceRial: 12000000 },
    ],
    staff: [
      { id: 'mina', name: 'مینا رضایی', role: 'متخصص رنگ و مش' },
      { id: 'sara', name: 'سارا محمدی', role: 'کوتاهی و حالت‌دهی' },
      { id: 'niloo', name: 'نیلوفر کریمی', role: 'میکاپ‌آرتیست' },
    ],
    reviews: [
      {
        id: 'r1',
        author: 'الهام ت.',
        rating: 5,
        date: '2025-05-18T10:00:00.000Z',
        service: 'رنگ مو',
        body: 'رنگ مویم دقیقاً همان چیزی شد که می‌خواستم. مینا واقعاً حرفه‌ای بود و محیط سالن هم تمیز و آرام بود.',
      },
      {
        id: 'r2',
        author: 'مریم ک.',
        rating: 5,
        date: '2025-04-30T10:00:00.000Z',
        service: 'میکاپ',
        body: 'برای میکاپ عروسی رفتم و عالی بود. رزرو آنلاین هم خیلی راحت بود و سر وقت پذیرش شدم.',
      },
      {
        id: 'r3',
        author: 'زهرا ن.',
        rating: 4,
        date: '2025-04-12T10:00:00.000Z',
        service: 'کوتاهی مو',
        body: 'کوتاهی مو خوب بود و به سلیقه‌ام توجه کردند. کمی منتظر ماندم ولی در کل راضی بودم.',
      },
    ],
    gallery: [
      {
        src: '/hero/hero-1280.png',
        srcSet: '/hero/hero-640.png 640w, /hero/hero-1280.png 1280w',
        avifSrcSet: '/hero/hero-640.avif 640w, /hero/hero-1280.avif 1280w',
        webpSrcSet: '/hero/hero-640.webp 640w, /hero/hero-1280.webp 1280w',
        width: 1280,
        height: 720,
        alt: 'نمای داخلی سالن زیبایی رز',
      },
      {
        src: '/og/default.jpg',
        avifSrcSet: '/og/default.avif 1200w',
        webpSrcSet: '/og/default.webp 1200w',
        width: 1200,
        height: 630,
        alt: 'نمونه کار رنگ و کوتاهی مو در سالن رز',
      },
    ],
    // Neshan map embed (Iranian map platform, seo §11), lazy-loaded on the page.
    mapEmbedUrl: 'https://neshan.org/maps/iframe/@35.8,51.4,15z',
    ogImage: '/og/default.jpg',
    // Off-page booking channels. Replace the bot handles with the salon's real
    // Bale/Telegram bots; `website` points at the platform home (the public app).
    channels: {
      website: '/',
      bale: 'https://ble.ir/salon_rose_bot',
      telegram: 'https://t.me/salon_rose_bot',
    },
    // Storefront Brand_Accent (signature-ui-system R4.2): the warm rose accent
    // suits «سالن رز» and tints the prerendered profile via <TenantTheme>.
    brandAccent: 'rose',
  },
  'salon-noor': {
    slug: 'salon-noor',
    name: 'سالن نور',
    // Demo storefront — points its booking CTA at the same seeded dev salon so
    // the funnel works end-to-end from any demo profile.
    bookingSalonId: '11111111-1111-1111-1111-111111111111',
    citySlug: 'tehran',
    tagline: 'رنگ، کوتاهی و کاشت ناخن با کادر حرفه‌ای در زعفرانیه تهران.',
    description:
      'سالن زیبایی نور در زعفرانیه تهران، خدمات رنگ و مش، کوتاهی تخصصی و کاشت ناخن را با نوبت‌دهی آنلاین ارائه می‌دهد. خدمت دلخواهتان را انتخاب کنید و نوبت خود را در چند ثانیه رزرو کنید.',
    neighborhood: 'زعفرانیه',
    address: {
      streetAddress: 'زعفرانیه، خیابان نمونه، پلاک ۲۴',
      addressLocality: 'تهران',
      addressRegion: 'تهران',
      addressCountry: 'IR',
    },
    telephone: '+98-21-2345-6789',
    priceRange: '$$$',
    category: 'آرایشگاه زنانه و ناخن',
    rating: 4.6,
    reviewCount: 89,
    geo: { latitude: 35.81, longitude: 51.42 },
    openingHours: [
      { day: 'Saturday', opens: '09:00', closes: '21:00' },
      { day: 'Sunday', opens: '09:00', closes: '21:00' },
      { day: 'Monday', opens: '09:00', closes: '21:00' },
      { day: 'Tuesday', opens: '09:00', closes: '21:00' },
      { day: 'Wednesday', opens: '09:00', closes: '21:00' },
      { day: 'Thursday', opens: '09:00', closes: '19:00' },
      { day: 'Friday', closed: true },
    ],
    services: [
      { id: 'haircut', name: 'کوتاهی مو', durationMinutes: 40, priceRial: 2200000 },
      { id: 'color', name: 'رنگ و مش', durationMinutes: 150, priceRial: 9500000 },
      { id: 'nails', name: 'کاشت ناخن', durationMinutes: 90, priceRial: 4500000 },
    ],
    staff: [
      { id: 'roya', name: 'رویا احمدی', role: 'متخصص رنگ و بالیاژ' },
      { id: 'shirin', name: 'شیرین موسوی', role: 'طراح و کاشت ناخن' },
    ],
    reviews: [
      {
        id: 'r1',
        author: 'نگار ص.',
        rating: 5,
        date: '2025-05-02T10:00:00.000Z',
        service: 'رنگ و مش',
        body: 'بالیاژم فوق‌العاده شد و دقیقاً طبق عکسی که نشان دادم اجرا کردند. حتماً دوباره می‌روم.',
      },
      {
        id: 'r2',
        author: 'پریسا م.',
        rating: 4,
        date: '2025-03-21T10:00:00.000Z',
        service: 'کاشت ناخن',
        body: 'کاشت ناخن تمیز و باکیفیت بود. رزرو اینترنتی هم کار را خیلی راحت کرد.',
      },
    ],
    gallery: [
      {
        src: '/og/default.jpg',
        avifSrcSet: '/og/default.avif 1200w',
        webpSrcSet: '/og/default.webp 1200w',
        width: 1200,
        height: 630,
        alt: 'نمای داخلی سالن زیبایی نور',
      },
      {
        src: '/hero/hero-1280.png',
        srcSet: '/hero/hero-640.png 640w, /hero/hero-1280.png 1280w',
        avifSrcSet: '/hero/hero-640.avif 640w, /hero/hero-1280.avif 1280w',
        webpSrcSet: '/hero/hero-640.webp 640w, /hero/hero-1280.webp 1280w',
        width: 1280,
        height: 720,
        alt: 'نمونه کار رنگ و مش در سالن نور',
      },
    ],
    mapEmbedUrl: 'https://neshan.org/maps/iframe/@35.81,51.42,15z',
    ogImage: '/og/default.jpg',
    channels: {
      website: '/',
      telegram: 'https://t.me/salon_noor_bot',
    },
    brandAccent: 'violet',
  },
  'salon-aria': {
    slug: 'salon-aria',
    name: 'سالن آریا',
    bookingSalonId: '11111111-1111-1111-1111-111111111111',
    citySlug: 'tehran',
    tagline: 'میکاپ، کوتاهی و مراقبت پوست در فضایی آرام در سعادت‌آباد.',
    description:
      'سالن زیبایی آریا در سعادت‌آباد تهران، میکاپ مجلسی و عروس، کوتاهی و حالت‌دهی مو و پاکسازی و مراقبت پوست را با نوبت‌دهی آنلاین ارائه می‌دهد. زمان دلخواهتان را انتخاب و نوبت خود را ثبت کنید.',
    neighborhood: 'سعادت‌آباد',
    address: {
      streetAddress: 'سعادت‌آباد، بلوار نمونه، پلاک ۵',
      addressLocality: 'تهران',
      addressRegion: 'تهران',
      addressCountry: 'IR',
    },
    telephone: '+98-21-3456-7890',
    priceRange: '$$',
    category: 'آرایشگاه، میکاپ و اسپا',
    rating: 4.9,
    reviewCount: 213,
    geo: { latitude: 35.78, longitude: 51.37 },
    openingHours: [
      { day: 'Saturday', opens: '10:00', closes: '20:00' },
      { day: 'Sunday', opens: '10:00', closes: '20:00' },
      { day: 'Monday', opens: '10:00', closes: '20:00' },
      { day: 'Tuesday', opens: '10:00', closes: '20:00' },
      { day: 'Wednesday', opens: '10:00', closes: '20:00' },
      { day: 'Thursday', opens: '10:00', closes: '20:00' },
      { day: 'Friday', closed: true },
    ],
    services: [
      { id: 'haircut', name: 'کوتاهی و حالت‌دهی', durationMinutes: 45, priceRial: 2800000 },
      { id: 'makeup', name: 'میکاپ مجلسی', durationMinutes: 90, priceRial: 13500000 },
      { id: 'skin', name: 'پاکسازی پوست', durationMinutes: 60, priceRial: 3900000 },
    ],
    staff: [
      { id: 'darya', name: 'دریا حسینی', role: 'میکاپ‌آرتیست ارشد' },
      { id: 'tara', name: 'تارا اکبری', role: 'متخصص پوست' },
      { id: 'nazanin', name: 'نازنین رحیمی', role: 'کوتاهی و حالت‌دهی' },
    ],
    reviews: [
      {
        id: 'r1',
        author: 'آیدا ر.',
        rating: 5,
        date: '2025-05-25T10:00:00.000Z',
        service: 'میکاپ مجلسی',
        body: 'بهترین میکاپی که تا حالا داشتم. ماندگاری عالی و برخورد فوق‌العاده صمیمی. پیشنهاد می‌کنم.',
      },
      {
        id: 'r2',
        author: 'سمیرا خ.',
        rating: 5,
        date: '2025-05-10T10:00:00.000Z',
        service: 'پاکسازی پوست',
        body: 'بعد از پاکسازی پوستم واقعاً شفاف شد و مشاوره‌ی خوبی هم برای مراقبت گرفتم.',
      },
      {
        id: 'r3',
        author: 'مهسا ب.',
        rating: 5,
        date: '2025-04-19T10:00:00.000Z',
        service: 'کوتاهی و حالت‌دهی',
        body: 'محیط آرام و تمیزی داشت و کوتاهی مو دقیق و طبق سلیقه‌ام انجام شد.',
      },
    ],
    gallery: [
      {
        src: '/hero/hero-1280.png',
        srcSet: '/hero/hero-640.png 640w, /hero/hero-1280.png 1280w',
        avifSrcSet: '/hero/hero-640.avif 640w, /hero/hero-1280.avif 1280w',
        webpSrcSet: '/hero/hero-640.webp 640w, /hero/hero-1280.webp 1280w',
        width: 1280,
        height: 720,
        alt: 'نمای داخلی سالن زیبایی آریا',
      },
      {
        src: '/og/default.jpg',
        avifSrcSet: '/og/default.avif 1200w',
        webpSrcSet: '/og/default.webp 1200w',
        width: 1200,
        height: 630,
        alt: 'نمونه کار میکاپ مجلسی در سالن آریا',
      },
    ],
    mapEmbedUrl: 'https://neshan.org/maps/iframe/@35.78,51.37,15z',
    ogImage: '/og/default.jpg',
    channels: {
      website: '/',
      bale: 'https://ble.ir/salon_aria_bot',
      telegram: 'https://t.me/salon_aria_bot',
    },
    brandAccent: 'teal',
  },
  'brooklyn-barber': {
    slug: 'brooklyn-barber',
    name: 'بروکلین باربرشاپ',
    // Demo storefront — reuses the seeded dev salon for a working booking CTA.
    bookingSalonId: '11111111-1111-1111-1111-111111111111',
    citySlug: 'tehran',
    tagline: 'فِید، اصلاح ریش و کوتاهی مردانه به سبک خیابانی نیویورک؛ با تیمی از باربرهای حرفه‌ای.',
    description:
      'بروکلین باربرشاپ یک باربرشاپ مردانه به سبک نیویورک در قلب تهران است: فِید و کوتاهی مردانه، فرم و اصلاح ریش و شیو با حوله داغ، در فضایی گرم با موسیقی و قهوه. تیم ما از باربرهای باتجربه تشکیل شده، از جمله آرش، آرتیست فِید و خالکوبی. خدمت دلخواهت را انتخاب کن و نوبتت را در چند ثانیه رزرو کن.',
    neighborhood: 'جردن',
    address: {
      streetAddress: 'جردن، خیابان نمونه، پلاک ۱۸',
      addressLocality: 'تهران',
      addressRegion: 'تهران',
      addressCountry: 'IR',
    },
    telephone: '+98-21-8899-0011',
    priceRange: '$$$',
    category: 'باربرشاپ و آرایشگاه مردانه',
    rating: 4.9,
    reviewCount: 342,
    geo: { latitude: 35.77, longitude: 51.42 },
    openingHours: [
      { day: 'Saturday', opens: '11:00', closes: '22:00' },
      { day: 'Sunday', opens: '11:00', closes: '22:00' },
      { day: 'Monday', opens: '11:00', closes: '22:00' },
      { day: 'Tuesday', opens: '11:00', closes: '22:00' },
      { day: 'Wednesday', opens: '11:00', closes: '22:00' },
      { day: 'Thursday', opens: '11:00', closes: '23:00' },
      { day: 'Friday', opens: '14:00', closes: '22:00' },
    ],
    services: [
      { id: 'haircut', name: 'فِید و کوتاهی مردانه', durationMinutes: 40, priceRial: 1800000 },
      { id: 'beard', name: 'فرم و اصلاح ریش', durationMinutes: 25, priceRial: 900000 },
      { id: 'shave', name: 'شیو با حوله داغ', durationMinutes: 30, priceRial: 1200000 },
      { id: 'combo', name: 'پکیج کامل (مو + ریش)', durationMinutes: 60, priceRial: 2500000 },
    ],
    staff: [
      { id: 'arash', name: 'آرش رستمی', role: 'مستر باربر • فِید و آرتیست تتو' },
      { id: 'sam', name: 'سام کریمی', role: 'متخصص ریش و شیو کلاسیک' },
      { id: 'daniel', name: 'دنیل مرادی', role: 'باربر و طراح خط ریش' },
    ],
    reviews: [
      {
        id: 'r1',
        author: 'کیان م.',
        rating: 5,
        date: '2025-05-28T10:00:00.000Z',
        service: 'فِید و کوتاهی مردانه',
        body: 'آرش، همون باربری که کل بازوش خالکوبیه، بهترین فِیدی که تا حالا داشتم رو زد. دقیقاً حس یه باربرشاپ واقعی نیویورک رو داشت.',
      },
      {
        id: 'r2',
        author: 'پویا ن.',
        rating: 5,
        date: '2025-05-12T10:00:00.000Z',
        service: 'شیو با حوله داغ',
        body: 'شیو با حوله داغ عالی بود، فضا و موزیک هم فوق‌العاده. همون وایب باحالی که دنبالش بودم.',
      },
      {
        id: 'r3',
        author: 'رضا آ.',
        rating: 4,
        date: '2025-04-20T10:00:00.000Z',
        service: 'پکیج کامل (مو + ریش)',
        body: 'کوتاهی و ریش هر دو تمیز و حرفه‌ای انجام شد. کمی شلوغ بود ولی کاملاً ارزشش را داشت.',
      },
    ],
    gallery: [
      {
        src: '/hero/hero-1280.png',
        srcSet: '/hero/hero-640.png 640w, /hero/hero-1280.png 1280w',
        avifSrcSet: '/hero/hero-640.avif 640w, /hero/hero-1280.avif 1280w',
        webpSrcSet: '/hero/hero-640.webp 640w, /hero/hero-1280.webp 1280w',
        width: 1280,
        height: 720,
        alt: 'فضای داخلی بروکلین باربرشاپ به سبک نیویورک',
      },
      {
        src: '/og/default.jpg',
        avifSrcSet: '/og/default.avif 1200w',
        webpSrcSet: '/og/default.webp 1200w',
        width: 1200,
        height: 630,
        alt: 'باربر در حال زدن فِید مو در بروکلین باربرشاپ',
      },
    ],
    mapEmbedUrl: 'https://neshan.org/maps/iframe/@35.77,51.42,15z',
    ogImage: '/og/default.jpg',
    channels: {
      website: '/',
      telegram: 'https://t.me/brooklyn_barber_bot',
      bale: 'https://ble.ir/brooklyn_barber_bot',
    },
    // Moody "night" accent (dark slate) tints the storefront for a cool,
    // urban New-York-barbershop vibe via <TenantTheme> — no global palette change.
    brandAccent: 'night',
  },
};

/** Returns the public profile for an ASCII slug, or `undefined` if unknown. */
export function getSalonProfile(slug: string | undefined): SalonProfile | undefined {
  if (!slug) return undefined;
  return SALON_PROFILES[slug.trim()];
}

/** All known public slugs (mirrors the sitemap/prerender enumeration). */
export function getSalonSlugs(): string[] {
  return Object.keys(SALON_PROFILES);
}

/** Every public salon profile (presentation-only; for discovery surfaces). */
export function getAllSalonProfiles(): SalonProfile[] {
  return Object.values(SALON_PROFILES);
}

/** Public profiles in a given city (by ASCII city slug), preserving order. */
export function getSalonsByCity(citySlug: string | undefined): SalonProfile[] {
  if (!citySlug) return [];
  const key = citySlug.trim();
  return getAllSalonProfiles().filter((s) => s.citySlug === key);
}

/**
 * Public profiles offering a service whose id matches `serviceType` (the ASCII
 * `/services/:type` segment maps onto `SalonService.id`, e.g. `haircut`).
 */
export function getSalonsByService(serviceType: string | undefined): SalonProfile[] {
  if (!serviceType) return [];
  const key = serviceType.trim();
  return getAllSalonProfiles().filter((s) => s.services.some((svc) => svc.id === key));
}

/**
 * The lowest service price (Rial) offered by a salon, used for the "from …"
 * price shown on marketplace salon cards (Booksy-style). Returns `undefined`
 * for a salon with no services so the card can omit the price cleanly.
 */
export function getMinServicePriceRial(salon: SalonProfile): number | undefined {
  if (!salon.services.length) return undefined;
  return Math.min(...salon.services.map((svc) => svc.priceRial));
}
