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
  /**
   * Optional category label (Persian) for grouping services into expandable
   * sections on the salon profile (task 5.3, R6.2). When omitted the service
   * appears under a general "all services" group.
   */
  category?: string;
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

/** A customer review shown on the salon profile. */
export interface SalonReview {
  /** Unique id (React key). */
  id: string;
  /** Reviewer display name, Persian. */
  author: string;
  /** Numeric rating 0–5 for this review. */
  rating: number;
  /** Review body text, Persian. */
  body: string;
  /** ISO date string for display (converted to Jalali on render). */
  date: string;
  /** Optional service name this review relates to. */
  service?: string;
}

/** A staff member displayed on the salon profile team section. */
export interface SalonStaffMember {
  /** Unique id (React key). */
  id: string;
  /** Display name, Persian. */
  name: string;
  /** Role / title, Persian (e.g. «آرایشگر ارشد»). */
  role: string;
  /** Optional avatar URL. */
  avatarUrl?: string;
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
  /** Precise coordinates. */
  geo: SalonGeo;
  /** Opening hours (stored once; rendered Iranian-week order). */
  openingHours: OpeningHours[];
  /** Offered services, priced in Rial. */
  services: SalonService[];
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
  /**
   * Average customer rating (0–5) shown as Booksy-style social proof on
   * discovery surfaces and the profile header. Optional; omitted when the salon
   * has no aggregated reviews yet.
   */
  rating?: number;
  /** Total customer review count backing {@link SalonProfile.rating}. */
  reviewCount?: number;
  /**
   * Cover image URL used as the card thumbnail on discovery surfaces (a
   * square-ish or 16:9 optimized asset). Falls back to the first gallery image
   * when absent.
   */
  coverUrl?: string;
  /**
   * Optional category label (Persian) used in the hero header as an eyebrow
   * (e.g. «سالن زیبایی زنانه»). Defaults to a generic salon label when absent.
   */
  category?: string;
  /**
   * Customer reviews surfaced on the salon profile (task 5.4; R6.3).
   * Only real, on-page reviews — never fabricated (seo §5).
   */
  reviews?: SalonReview[];
  /**
   * Staff members shown on the salon profile "Team" section.
   */
  staff?: SalonStaffMember[];
}

/**
 * The public salon profiles, keyed by ASCII slug. Mirrors the build-time slug
 * list in `scripts/salons.json`. Image paths point at assets shipped under
 * `public/` so nothing 404s at runtime.
 */
const SALON_PROFILES: Record<string, SalonProfile> = {
  'salon-maryam': {
    slug: 'salon-maryam',
    name: 'سالن مریم',
    bookingSalonId: '22222222-2222-2222-2222-222222222222',
    citySlug: 'tehran',
    tagline: 'رزرو آنلاین خدمات زیبایی در سالن مریم، سعادت‌آباد.',
    description:
      'سالن زیبایی مریم در سعادت‌آباد تهران با تیمی مجرب خدمات رنگ، کراتین و مراقبت از مو را ارائه می‌دهد.',
    neighborhood: 'سعادت‌آباد',
    address: {
      streetAddress: 'سعادت‌آباد، بلوار دریا، پلاک ۴۵',
      addressLocality: 'تهران',
      addressRegion: 'تهران',
      addressCountry: 'IR',
    },
    telephone: '+98-21-2222-3333',
    priceRange: '$$',
    geo: { latitude: 35.78, longitude: 51.37 },
    openingHours: [
      { day: 'Saturday', opens: '09:00', closes: '21:00' },
      { day: 'Sunday', opens: '09:00', closes: '21:00' },
      { day: 'Monday', opens: '09:00', closes: '21:00' },
      { day: 'Tuesday', opens: '09:00', closes: '21:00' },
      { day: 'Wednesday', opens: '09:00', closes: '21:00' },
      { day: 'Thursday', opens: '09:00', closes: '18:00' },
      { day: 'Friday', closed: true },
    ],
    services: [
      { id: 'color', name: 'رنگ مو', durationMinutes: 120, priceRial: 7500000, category: 'خدمات مو' },
      { id: 'keratin', name: 'کراتین مو', durationMinutes: 180, priceRial: 15000000, category: 'خدمات مو' },
      { id: 'haircut', name: 'کوتاهی مو', durationMinutes: 45, priceRial: 2000000, category: 'خدمات مو' },
    ],
    gallery: [
      {
        src: '/images/salons/salon-card-1-640w.webp',
        width: 640,
        height: 360,
        alt: 'نمای داخلی سالن زیبایی مریم',
      },
    ],
    mapEmbedUrl: 'https://neshan.org/maps/iframe/@35.78,51.37,15z',
    rating: 4.6,
    reviewCount: 87,
    coverUrl: '/images/salons/salon-card-1-640w.webp',
    category: 'سالن زیبایی زنانه',
  },
  'shahin-barbershop': {
    slug: 'shahin-barbershop',
    name: 'آرایشگاه شاهین',
    bookingSalonId: '33333333-3333-3333-3333-333333333333',
    citySlug: 'tehran',
    tagline: 'آرایشگاه مردانه شاهین، بهترین خدمات اصلاح و پیرایش در یوسف‌آباد.',
    description:
      'آرایشگاه شاهین در یوسف‌آباد با بیش از ده سال تجربه، خدمات اصلاح مو و ریش، فید و اسکین‌فید حرفه‌ای ارائه می‌دهد.',
    neighborhood: 'یوسف‌آباد',
    address: {
      streetAddress: 'یوسف‌آباد، خیابان بیست‌وسوم، پلاک ۱۲',
      addressLocality: 'تهران',
      addressRegion: 'تهران',
      addressCountry: 'IR',
    },
    telephone: '+98-21-3333-4444',
    priceRange: '$',
    geo: { latitude: 35.73, longitude: 51.40 },
    openingHours: [
      { day: 'Saturday', opens: '08:00', closes: '22:00' },
      { day: 'Sunday', opens: '08:00', closes: '22:00' },
      { day: 'Monday', opens: '08:00', closes: '22:00' },
      { day: 'Tuesday', opens: '08:00', closes: '22:00' },
      { day: 'Wednesday', opens: '08:00', closes: '22:00' },
      { day: 'Thursday', opens: '08:00', closes: '20:00' },
      { day: 'Friday', closed: true },
    ],
    services: [
      { id: 'haircut', name: 'اصلاح مو', durationMinutes: 30, priceRial: 1500000, category: 'خدمات مو' },
      { id: 'beard', name: 'اصلاح ریش', durationMinutes: 20, priceRial: 1000000, category: 'خدمات صورت' },
    ],
    gallery: [
      {
        src: '/images/salons/salon-card-2-640w.webp',
        width: 640,
        height: 360,
        alt: 'نمای داخلی آرایشگاه شاهین',
      },
    ],
    mapEmbedUrl: 'https://neshan.org/maps/iframe/@35.73,51.40,15z',
    rating: 4.3,
    reviewCount: 52,
    coverUrl: '/images/salons/salon-card-2-640w.webp',
    category: 'آرایشگاه مردانه',
  },
  'salon-niloofar': {
    slug: 'salon-niloofar',
    name: 'سالن نیلوفر',
    bookingSalonId: '44444444-4444-4444-4444-444444444444',
    citySlug: 'tehran',
    tagline: 'سالن زیبایی نیلوفر، خدمات تخصصی ناخن و پوست در جردن.',
    description:
      'سالن نیلوفر در جردن تهران با متخصصان حرفه‌ای، خدمات کاشت ناخن، مانیکور و پاکسازی پوست صورت ارائه می‌دهد.',
    neighborhood: 'جردن',
    address: {
      streetAddress: 'جردن، خیابان گلفام، پلاک ۸',
      addressLocality: 'تهران',
      addressRegion: 'تهران',
      addressCountry: 'IR',
    },
    telephone: '+98-21-4444-5555',
    priceRange: '$$$',
    geo: { latitude: 35.77, longitude: 51.42 },
    openingHours: [
      { day: 'Saturday', opens: '10:00', closes: '20:00' },
      { day: 'Sunday', opens: '10:00', closes: '20:00' },
      { day: 'Monday', opens: '10:00', closes: '20:00' },
      { day: 'Tuesday', opens: '10:00', closes: '20:00' },
      { day: 'Wednesday', opens: '10:00', closes: '20:00' },
      { day: 'Thursday', opens: '10:00', closes: '17:00' },
      { day: 'Friday', closed: true },
    ],
    services: [
      { id: 'nails', name: 'کاشت ناخن', durationMinutes: 90, priceRial: 5000000, category: 'خدمات ناخن' },
      { id: 'manicure', name: 'مانیکور', durationMinutes: 60, priceRial: 3000000, category: 'خدمات ناخن' },
      { id: 'facial', name: 'پاکسازی صورت', durationMinutes: 75, priceRial: 4500000, category: 'خدمات پوست' },
    ],
    gallery: [
      {
        src: '/images/salons/salon-card-3-640w.webp',
        width: 640,
        height: 360,
        alt: 'نمونه کار کاشت ناخن در سالن نیلوفر',
      },
    ],
    mapEmbedUrl: 'https://neshan.org/maps/iframe/@35.77,51.42,15z',
    rating: 4.9,
    reviewCount: 198,
    coverUrl: '/images/salons/salon-card-3-640w.webp',
    category: 'سالن زیبایی زنانه',
  },
  'arash-studio': {
    slug: 'arash-studio',
    name: 'استودیو آرش',
    bookingSalonId: '55555555-5555-5555-5555-555555555555',
    citySlug: 'tehran',
    tagline: 'استودیو آرش، خدمات حرفه‌ای گریم داماد و آرایش مردانه در ونک.',
    description:
      'استودیو آرش در ونک تهران با سبک مدرن، خدمات اصلاح مو، گریم داماد و مراقبت پوست مردانه ارائه می‌دهد.',
    neighborhood: 'ونک',
    address: {
      streetAddress: 'ونک، خیابان ملاصدرا، پلاک ۳۰',
      addressLocality: 'تهران',
      addressRegion: 'تهران',
      addressCountry: 'IR',
    },
    telephone: '+98-21-5555-6666',
    priceRange: '$$',
    geo: { latitude: 35.76, longitude: 51.41 },
    openingHours: [
      { day: 'Saturday', opens: '10:00', closes: '21:00' },
      { day: 'Sunday', opens: '10:00', closes: '21:00' },
      { day: 'Monday', opens: '10:00', closes: '21:00' },
      { day: 'Tuesday', opens: '10:00', closes: '21:00' },
      { day: 'Wednesday', opens: '10:00', closes: '21:00' },
      { day: 'Thursday', opens: '10:00', closes: '19:00' },
      { day: 'Friday', closed: true },
    ],
    services: [
      { id: 'haircut', name: 'اصلاح مو', durationMinutes: 40, priceRial: 2500000, category: 'خدمات مو' },
      { id: 'groom', name: 'گریم داماد', durationMinutes: 120, priceRial: 8000000, category: 'گریم' },
      { id: 'skincare', name: 'پاکسازی پوست مردانه', durationMinutes: 60, priceRial: 4000000, category: 'مراقبت پوست' },
    ],
    gallery: [
      {
        src: '/images/salons/salon-card-4-640w.webp',
        width: 640,
        height: 360,
        alt: 'فضای داخلی استودیو آرش',
      },
    ],
    mapEmbedUrl: 'https://neshan.org/maps/iframe/@35.76,51.41,15z',
    rating: 4.5,
    reviewCount: 34,
    coverUrl: '/images/salons/salon-card-4-640w.webp',
    category: 'آرایشگاه مردانه',
  },
  'salon-parisa': {
    slug: 'salon-parisa',
    name: 'سالن پریسا',
    bookingSalonId: '66666666-6666-6666-6666-666666666666',
    citySlug: 'tehran',
    tagline: 'سالن پریسا، خدمات لوکس زیبایی و میکاپ عروس در الهیه.',
    description:
      'سالن پریسا در الهیه تهران با فضایی مدرن و لوکس، خدمات میکاپ عروس، شینیون و مراقبت از مو ارائه می‌دهد.',
    neighborhood: 'الهیه',
    address: {
      streetAddress: 'الهیه، خیابان فرشته، پلاک ۲۲',
      addressLocality: 'تهران',
      addressRegion: 'تهران',
      addressCountry: 'IR',
    },
    telephone: '+98-21-6666-7777',
    priceRange: '$$$',
    geo: { latitude: 35.79, longitude: 51.43 },
    openingHours: [
      { day: 'Saturday', opens: '09:00', closes: '20:00' },
      { day: 'Sunday', opens: '09:00', closes: '20:00' },
      { day: 'Monday', opens: '09:00', closes: '20:00' },
      { day: 'Tuesday', opens: '09:00', closes: '20:00' },
      { day: 'Wednesday', opens: '09:00', closes: '20:00' },
      { day: 'Thursday', opens: '09:00', closes: '17:00' },
      { day: 'Friday', closed: true },
    ],
    services: [
      { id: 'bridal-makeup', name: 'میکاپ عروس', durationMinutes: 180, priceRial: 25000000, category: 'آرایش صورت' },
      { id: 'chignon', name: 'شینیون', durationMinutes: 90, priceRial: 10000000, category: 'خدمات مو' },
      { id: 'haircare', name: 'مراقبت و تقویت مو', durationMinutes: 60, priceRial: 6000000, category: 'خدمات مو' },
    ],
    gallery: [
      {
        src: '/images/salons/salon-card-5-640w.webp',
        width: 640,
        height: 360,
        alt: 'نمای داخلی سالن پریسا',
      },
    ],
    mapEmbedUrl: 'https://neshan.org/maps/iframe/@35.79,51.43,15z',
    rating: 4.7,
    reviewCount: 156,
    coverUrl: '/images/salons/salon-card-5-640w.webp',
    category: 'سالن زیبایی زنانه',
  },
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
      { id: 'haircut', name: 'کوتاهی مو', durationMinutes: 45, priceRial: 2500000, category: 'خدمات مو' },
      { id: 'color', name: 'رنگ مو', durationMinutes: 120, priceRial: 8500000, category: 'خدمات مو' },
      { id: 'makeup', name: 'میکاپ', durationMinutes: 90, priceRial: 12000000, category: 'آرایش صورت' },
    ],
    gallery: [
      {
        src: '/images/salons/salon-card-6-640w.webp',
        width: 640,
        height: 360,
        alt: 'نمای داخلی سالن زیبایی رز',
      },
      {
        src: '/og/default.svg',
        width: 1200,
        height: 630,
        alt: 'نمونه کار رنگ و کوتاهی مو در سالن رز',
      },
    ],
    // Neshan map embed (Iranian map platform, seo §11), lazy-loaded on the page.
    mapEmbedUrl: 'https://neshan.org/maps/iframe/@35.8,51.4,15z',
    ogImage: '/og/default.svg',
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
    rating: 4.8,
    reviewCount: 124,
    coverUrl: '/images/salons/salon-card-6-640w.webp',
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
