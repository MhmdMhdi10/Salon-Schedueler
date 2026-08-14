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
 * Content-honesty invariants (implementation contract §"Content honesty"):
 *  - `rating` / `reviewCount` are **computed from the on-page `reviews`** via
 *    {@link withComputedRating} — a salon can never display a rating that its
 *    visible reviews don't back, and JSON-LD `aggregateRating` is only emitted
 *    when `reviews.length > 0` (asserted in `data/__tests__/salons.test.ts`).
 *  - `bookingSalonId` values follow the fixed UUID table in the implementation
 *    contract §"Booking-data UUID contract" and are seeded by
 *    `docker/db/dev-seed.sql`, so every «رزرو» CTA lands on a bookable salon.
 *
 * Slugs are ASCII / transliterated (`salon-rose`) per seo §6 so the canonical
 * URL is clean and stable. The sitemap/prerender enumeration now reads these
 * live modules via `scripts/site-data.mjs`; the legacy `scripts/salons.json`
 * mirror is kept in sync for documentation.
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
  /** Optional one-line Persian description shown under the service name. */
  description?: string;
  /**
   * Optional category label (Persian) for grouping services into expandable
   * sections on the salon profile (task 5.3, R6.2). When omitted the service
   * appears under a general "all services" group.
   */
  category?: string;
}

/** A gallery image with explicit dimensions (CLS-safe) and Persian alt text. */
export interface GalleryImage {
  /** Fallback `<img src>` — a universally-supported PNG/JPG/SVG. */
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
  /** True when the review came from a completed booking on the platform. */
  verified?: boolean;
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
   * Values follow the implementation contract's fixed UUID table and are
   * seeded by `docker/db/dev-seed.sql`.
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
   * Average customer rating (0–5). NEVER authored by hand — computed from
   * {@link SalonProfile.reviews} by {@link withComputedRating} so the number
   * shown is always backed by visible reviews (contract §content-honesty).
   */
  rating?: number;
  /** Total review count backing {@link SalonProfile.rating} — `reviews.length`. */
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
   * Only real, on-page reviews — never fabricated counts (seo §5).
   */
  reviews?: SalonReview[];
  /** Staff members shown on the salon profile "Team" section. */
  staff?: SalonStaffMember[];
  /**
   * Real, per-salon amenity list (Persian). Rendered only when present — no
   * templated identical amenity blocks across salons (seo §1).
   */
  amenities?: string[];
  /**
   * Booking / cancellation policy lines (Persian), e.g. cancellation window
   * and lateness rules. Rendered as the profile's «قوانین رزرو» block.
   */
  policies?: string[];
}

/**
 * Fills `rating`/`reviewCount` from the profile's own `reviews` so displayed
 * social proof can never drift from the visible reviews (contract
 * §content-honesty). Profiles without reviews get no rating at all.
 */
function withComputedRating(
  profile: Omit<SalonProfile, 'rating' | 'reviewCount'>,
): SalonProfile {
  const reviews = profile.reviews ?? [];
  if (reviews.length === 0) return profile;
  const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  return {
    ...profile,
    rating: Math.round(average * 10) / 10,
    reviewCount: reviews.length,
  };
}

/** Shorthand for a gallery image under `/images/salons/gallery`. */
function galleryImage(file: string, alt: string): GalleryImage {
  return { src: `/images/salons/gallery/${file}`, width: 640, height: 360, alt };
}

/**
 * The public salon profiles, keyed by ASCII slug. Mirrors the build-time slug
 * list consumed by `scripts/site-data.mjs`. Image paths point at assets shipped
 * under `public/` so nothing 404s at runtime.
 */
const SALON_PROFILES: Record<string, SalonProfile> = {
  'salon-maryam': withComputedRating({
    slug: 'salon-maryam',
    name: 'سالن مریم',
    bookingSalonId: 'aa000001-0000-4000-8000-000000000001',
    citySlug: 'tehran',
    tagline: 'رزرو آنلاین خدمات زیبایی در سالن مریم، سعادت‌آباد.',
    description:
      'سالن زیبایی مریم در سعادت‌آباد تهران با تیمی مجرب خدمات رنگ، کراتین و مراقبت از مو را ارائه می‌دهد. تخصص اصلی سالن، رنگ و احیای موهای آسیب‌دیده است و پیش از هر خدمت، مشاوره کوتاه رایگان انجام می‌شود.',
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
      {
        id: 'color',
        name: 'رنگ مو',
        durationMinutes: 120,
        priceRial: 7500000,
        description: 'رنگ کامل با مشاوره انتخاب پالت متناسب با پوست و سبک شما.',
        category: 'خدمات مو',
      },
      {
        id: 'keratin',
        name: 'کراتین مو',
        durationMinutes: 180,
        priceRial: 15000000,
        description: 'صافی و احیای موهای آسیب‌دیده با مواد استاندارد و ضمانت.',
        category: 'خدمات مو',
      },
      {
        id: 'haircut',
        name: 'کوتاهی مو',
        durationMinutes: 45,
        priceRial: 2000000,
        description: 'کوتاهی متناسب با فرم صورت، همراه با سشوار و حالت‌دهی.',
        category: 'خدمات مو',
      },
    ],
    gallery: [
      {
        src: '/images/salons/salon-card-1-640w.webp',
        width: 640,
        height: 360,
        alt: 'نمای داخلی سالن زیبایی مریم',
      },
      galleryImage('salon-maryam-1.svg', 'میز کار رنگ مو در سالن مریم'),
      galleryImage('salon-maryam-2.svg', 'نمونه کار رنگ و لایت مو در سالن مریم'),
      galleryImage('salon-maryam-3.svg', 'اتاق کراتین و احیای مو در سالن مریم'),
      galleryImage('salon-maryam-4.svg', 'فضای انتظار سالن مریم در سعادت‌آباد'),
    ],
    mapEmbedUrl: 'https://neshan.org/maps/iframe/@35.78,51.37,15z',
    coverUrl: '/images/salons/salon-card-1-640w.webp',
    category: 'سالن زیبایی زنانه',
    reviews: [
      {
        id: 'maryam-r1',
        author: 'نگار موسوی',
        rating: 5,
        body: 'رنگی که می‌خواستم دقیقاً همونی شد که تو مشاوره قول داده بودن. موهام اصلاً آسیب ندید.',
        date: '2026-06-18',
        service: 'رنگ مو',
        verified: true,
      },
      {
        id: 'maryam-r2',
        author: 'الهام کاظمی',
        rating: 4,
        body: 'کراتین خیلی خوب بود و هنوز بعد از دو ماه موهام صافه. فقط کمی بیشتر از زمان اعلام‌شده طول کشید.',
        date: '2026-05-30',
        service: 'کراتین مو',
        verified: true,
      },
      {
        id: 'maryam-r3',
        author: 'شیوا رستمی',
        rating: 5,
        body: 'کوتاهی تمیز و حرفه‌ای. خانم رضوی قبل از قیچی زدن کامل توضیح داد چه مدلی به صورتم می‌آد.',
        date: '2026-05-09',
        service: 'کوتاهی مو',
        verified: true,
      },
      {
        id: 'maryam-r4',
        author: 'مهسا قنبری',
        rating: 4,
        body: 'محیط تمیز و آرام. رزرو آنلاین هم راحت بود و سر وقت کارم شروع شد.',
        date: '2026-04-21',
      },
      {
        id: 'maryam-r5',
        author: 'پگاه شکوهی',
        rating: 5,
        body: 'برای بار سوم اومدم و هر بار راضی‌تر از قبل. رنگ‌کارشون واقعاً کارش را بلده.',
        date: '2026-03-14',
        service: 'رنگ مو',
        verified: true,
      },
    ],
    staff: [
      { id: 'maryam-s1', name: 'مریم رضوی', role: 'مدیر و رنگ‌کار ارشد' },
      { id: 'maryam-s2', name: 'آیدا شریفی', role: 'آرایشگر و کراتین‌کار' },
    ],
    amenities: ['اینترنت بی‌سیم رایگان', 'پرداخت با کارت', 'مشاوره رایگان رنگ', 'نوبت‌دهی آنلاین'],
    policies: [
      'لغو رایگان تا ۲۴ ساعت پیش از زمان نوبت.',
      'در صورت تأخیر بیش از ۱۵ دقیقه، ممکن است نوبت به مشتری بعدی داده شود.',
    ],
  }),
  'shahin-barbershop': withComputedRating({
    slug: 'shahin-barbershop',
    name: 'آرایشگاه شاهین',
    bookingSalonId: 'aa000002-0000-4000-8000-000000000002',
    citySlug: 'tehran',
    tagline: 'آرایشگاه مردانه شاهین، بهترین خدمات اصلاح و پیرایش در یوسف‌آباد.',
    description:
      'آرایشگاه شاهین در یوسف‌آباد با بیش از ده سال تجربه، خدمات اصلاح مو و ریش، فید و اسکین‌فید حرفه‌ای ارائه می‌دهد. نوبت‌ها آنلاین ثبت می‌شوند تا بدون معطلی در صف، سر ساعت روی صندلی بنشینید.',
    neighborhood: 'یوسف‌آباد',
    address: {
      streetAddress: 'یوسف‌آباد، خیابان بیست‌وسوم، پلاک ۱۲',
      addressLocality: 'تهران',
      addressRegion: 'تهران',
      addressCountry: 'IR',
    },
    telephone: '+98-21-3333-4444',
    priceRange: '$',
    geo: { latitude: 35.73, longitude: 51.4 },
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
      {
        id: 'haircut',
        name: 'اصلاح مو',
        durationMinutes: 30,
        priceRial: 1500000,
        description: 'اصلاح کلاسیک یا فید و اسکین‌فید، با شست‌وشو و حالت‌دهی.',
        category: 'خدمات مو',
      },
      {
        id: 'beard',
        name: 'اصلاح ریش',
        durationMinutes: 20,
        priceRial: 1000000,
        description: 'اصلاح و طراحی خط ریش با تیغ و حوله گرم.',
        category: 'خدمات صورت',
      },
    ],
    gallery: [
      {
        src: '/images/salons/salon-card-2-640w.webp',
        width: 640,
        height: 360,
        alt: 'نمای داخلی آرایشگاه شاهین',
      },
      galleryImage('shahin-barbershop-1.svg', 'صندلی و میز کار آرایشگاه شاهین'),
      galleryImage('shahin-barbershop-2.svg', 'نمونه کار فید مو در آرایشگاه شاهین'),
      galleryImage('shahin-barbershop-3.svg', 'اصلاح ریش با حوله گرم در آرایشگاه شاهین'),
      galleryImage('shahin-barbershop-4.svg', 'فضای انتظار آرایشگاه شاهین در یوسف‌آباد'),
    ],
    mapEmbedUrl: 'https://neshan.org/maps/iframe/@35.73,51.40,15z',
    coverUrl: '/images/salons/salon-card-2-640w.webp',
    category: 'آرایشگاه مردانه',
    reviews: [
      {
        id: 'shahin-r1',
        author: 'امیر حسینی',
        rating: 5,
        body: 'بهترین فیدی که تا حالا زدم. شاهین دقیق و سریع کار می‌کنه و نوبت آنلاین یعنی صفر معطلی.',
        date: '2026-06-25',
        service: 'اصلاح مو',
        verified: true,
      },
      {
        id: 'shahin-r2',
        author: 'رضا نادری',
        rating: 4,
        body: 'اصلاح ریش تمیز بود و خط ریش را عالی درآورد. قیمت هم منصفانه است.',
        date: '2026-06-02',
        service: 'اصلاح ریش',
        verified: true,
      },
      {
        id: 'shahin-r3',
        author: 'سامان عبدی',
        rating: 4,
        body: 'محیط مرتب و صمیمی. فقط آخر هفته‌ها کمی شلوغ می‌شود؛ حتماً از قبل نوبت بگیرید.',
        date: '2026-05-17',
      },
      {
        id: 'shahin-r4',
        author: 'فرزاد کریمی',
        rating: 5,
        body: 'ده سال مشتری‌ام و هنوز جایی بهتر پیدا نکرده‌ام. پیشنهادش می‌کنم.',
        date: '2026-04-05',
        service: 'اصلاح مو',
        verified: true,
      },
      {
        id: 'shahin-r5',
        author: 'پویا شریفی',
        rating: 4,
        body: 'سر وقت شروع شد و نتیجه همانی بود که خواسته بودم.',
        date: '2026-03-22',
      },
    ],
    staff: [{ id: 'shahin-s1', name: 'شاهین قاسمی', role: 'آرایشگر و مؤسس' }],
    amenities: ['پرداخت با کارت', 'چای و قهوه رایگان', 'ابزار ضدعفونی‌شده برای هر مشتری'],
    policies: [
      'لغو رایگان تا ۳ ساعت پیش از زمان نوبت.',
      'در صورت تأخیر بیش از ۱۰ دقیقه، نوبت به مشتری بعدی داده می‌شود.',
    ],
  }),
  'salon-niloofar': withComputedRating({
    slug: 'salon-niloofar',
    name: 'سالن نیلوفر',
    bookingSalonId: 'aa000003-0000-4000-8000-000000000003',
    citySlug: 'tehran',
    tagline: 'سالن زیبایی نیلوفر، خدمات تخصصی ناخن و پوست در جردن.',
    description:
      'سالن نیلوفر در جردن تهران با متخصصان حرفه‌ای، خدمات کاشت ناخن، مانیکور و پاکسازی پوست صورت ارائه می‌دهد. مواد مصرفی استاندارد و ابزار یک‌بارمصرف یا ضدعفونی‌شده، اصل اول این سالن است.',
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
      {
        id: 'nails',
        name: 'کاشت ناخن',
        durationMinutes: 90,
        priceRial: 5000000,
        description: 'کاشت پودری یا ژلی با فرم دلخواه و طراحی ساده.',
        category: 'خدمات ناخن',
      },
      {
        id: 'manicure',
        name: 'مانیکور',
        durationMinutes: 60,
        priceRial: 3000000,
        description: 'مانیکور کلاسیک با لاک یا ژلیش، همراه با ماساژ دست.',
        category: 'خدمات ناخن',
      },
      {
        id: 'facial',
        name: 'پاکسازی صورت',
        durationMinutes: 75,
        priceRial: 4500000,
        description: 'پاکسازی عمقی با آنالیز پوست و ماسک اختصاصی.',
        category: 'خدمات پوست',
      },
    ],
    gallery: [
      {
        src: '/images/salons/salon-card-3-640w.webp',
        width: 640,
        height: 360,
        alt: 'نمونه کار کاشت ناخن در سالن نیلوفر',
      },
      galleryImage('salon-niloofar-1.svg', 'میز کار ناخن در سالن نیلوفر'),
      galleryImage('salon-niloofar-2.svg', 'نمونه کار ژلیش و طراحی ناخن در سالن نیلوفر'),
      galleryImage('salon-niloofar-3.svg', 'اتاق پاکسازی پوست سالن نیلوفر'),
      galleryImage('salon-niloofar-4.svg', 'فضای داخلی سالن نیلوفر در جردن'),
    ],
    mapEmbedUrl: 'https://neshan.org/maps/iframe/@35.77,51.42,15z',
    coverUrl: '/images/salons/salon-card-3-640w.webp',
    category: 'سالن زیبایی زنانه',
    reviews: [
      {
        id: 'niloofar-r1',
        author: 'غزل احمدی',
        rating: 5,
        body: 'کاشت ناخنم فوق‌العاده شد و بعد از سه هفته هنوز مثل روز اول است. بهداشت ابزار هم عالی بود.',
        date: '2026-06-28',
        service: 'کاشت ناخن',
        verified: true,
      },
      {
        id: 'niloofar-r2',
        author: 'ترانه ملکی',
        rating: 5,
        body: 'پاکسازی صورت با آنالیز شروع شد و برنامه مراقبت خانگی هم دادند. پوستم واقعاً شفاف‌تر شده.',
        date: '2026-06-10',
        service: 'پاکسازی صورت',
        verified: true,
      },
      {
        id: 'niloofar-r3',
        author: 'آتنا رحیمی',
        rating: 5,
        body: 'وقت‌شناس و دقیق. مانیکور و ژلیش دقیقاً همان طرحی شد که نشان داده بودم.',
        date: '2026-05-24',
        service: 'مانیکور',
        verified: true,
      },
      {
        id: 'niloofar-r4',
        author: 'یاسمن فرجی',
        rating: 4,
        body: 'کیفیت کار عالی است، فقط قیمت‌ها کمی بالاتر از میانگین محله است. ارزشش را دارد.',
        date: '2026-04-30',
      },
      {
        id: 'niloofar-r5',
        author: 'درسا نیک‌نام',
        rating: 5,
        body: 'مینا جان برای پوست حساس من بهترین برنامه را چید. حتماً برمی‌گردم.',
        date: '2026-04-02',
        service: 'پاکسازی صورت',
        verified: true,
      },
    ],
    staff: [
      { id: 'niloofar-s1', name: 'نیلوفر صادقی', role: 'مدیر و کارشناس ناخن' },
      { id: 'niloofar-s2', name: 'مینا جلالی', role: 'کارشناس پوست' },
    ],
    amenities: [
      'ابزار یک‌بارمصرف و ضدعفونی‌شده',
      'اینترنت بی‌سیم رایگان',
      'پرداخت با کارت',
      'جای پارک در نزدیکی سالن',
    ],
    policies: [
      'لغو رایگان تا ۲۴ ساعت پیش از زمان نوبت.',
      'برای خدمات کاشت، ۱۰ دقیقه زودتر از زمان نوبت حاضر شوید.',
    ],
  }),
  'arash-studio': withComputedRating({
    slug: 'arash-studio',
    name: 'استودیو آرش',
    bookingSalonId: 'aa000004-0000-4000-8000-000000000004',
    citySlug: 'tehran',
    tagline: 'استودیو آرش، خدمات حرفه‌ای گریم داماد و آرایش مردانه در ونک.',
    description:
      'استودیو آرش در ونک تهران با سبک مدرن، خدمات اصلاح مو، گریم داماد و مراقبت پوست مردانه ارائه می‌دهد. برای مراسم، پکیج کامل داماد با تست گریم پیش از روز مراسم انجام می‌شود.',
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
      {
        id: 'haircut',
        name: 'اصلاح مو',
        durationMinutes: 40,
        priceRial: 2500000,
        description: 'اصلاح مدرن با مشاوره فرم صورت و حالت‌دهی نهایی.',
        category: 'خدمات مو',
      },
      {
        id: 'groom',
        name: 'گریم داماد',
        durationMinutes: 120,
        priceRial: 8000000,
        description: 'پکیج کامل داماد شامل اصلاح، گریم و تثبیت برای عکاسی.',
        category: 'گریم',
      },
      {
        id: 'skincare',
        name: 'پاکسازی پوست مردانه',
        durationMinutes: 60,
        priceRial: 4000000,
        description: 'پاکسازی و مراقبت پوست مخصوص آقایان.',
        category: 'مراقبت پوست',
      },
    ],
    gallery: [
      {
        src: '/images/salons/salon-card-4-640w.webp',
        width: 640,
        height: 360,
        alt: 'فضای داخلی استودیو آرش',
      },
      galleryImage('arash-studio-1.svg', 'میز گریم استودیو آرش'),
      galleryImage('arash-studio-2.svg', 'نمونه کار گریم داماد در استودیو آرش'),
      galleryImage('arash-studio-3.svg', 'صندلی اصلاح استودیو آرش'),
      galleryImage('arash-studio-4.svg', 'نمای ورودی استودیو آرش در ونک'),
    ],
    mapEmbedUrl: 'https://neshan.org/maps/iframe/@35.76,51.41,15z',
    coverUrl: '/images/salons/salon-card-4-640w.webp',
    category: 'آرایشگاه مردانه',
    reviews: [
      {
        id: 'arash-r1',
        author: 'کیان صابری',
        rating: 5,
        body: 'گریم روز مراسم عالی بود؛ تو عکس‌ها کاملاً طبیعی افتاده. تست قبل از مراسم خیالم را راحت کرد.',
        date: '2026-06-20',
        service: 'گریم داماد',
        verified: true,
      },
      {
        id: 'arash-r2',
        author: 'مهدی توکلی',
        rating: 4,
        body: 'اصلاح مو دقیق و مطابق سلیقه‌ام بود. فضای استودیو هم خیلی شیک است.',
        date: '2026-05-28',
        service: 'اصلاح مو',
        verified: true,
      },
      {
        id: 'arash-r3',
        author: 'بهنام رفیعی',
        rating: 4,
        body: 'پاکسازی پوست خوب بود و توصیه‌های بعدش هم مفید. رزرو آنلاین راحت انجام شد.',
        date: '2026-05-03',
        service: 'پاکسازی پوست مردانه',
      },
      {
        id: 'arash-r4',
        author: 'علی مرادی',
        rating: 5,
        body: 'برای عروسی برادرم هر دو از خدمات داماد استفاده کردیم؛ هر دو راضی بودیم.',
        date: '2026-03-19',
        service: 'گریم داماد',
        verified: true,
      },
    ],
    staff: [{ id: 'arash-s1', name: 'آرش کمالی', role: 'گریمور و آرایشگر ارشد' }],
    amenities: ['پرداخت با کارت', 'تست گریم پیش از مراسم', 'اینترنت بی‌سیم رایگان'],
    policies: [
      'لغو رایگان تا ۴۸ ساعت پیش از نوبت گریم داماد و ۱۲ ساعت برای سایر خدمات.',
      'برای نوبت گریم، هماهنگی زمان مراسم را هنگام رزرو در یادداشت بنویسید.',
    ],
  }),
  'salon-parisa': withComputedRating({
    slug: 'salon-parisa',
    name: 'سالن پریسا',
    bookingSalonId: 'aa000005-0000-4000-8000-000000000005',
    citySlug: 'tehran',
    tagline: 'سالن پریسا، خدمات لوکس زیبایی و میکاپ عروس در الهیه.',
    description:
      'سالن پریسا در الهیه تهران با فضایی مدرن و لوکس، خدمات میکاپ عروس، شینیون و مراقبت از مو ارائه می‌دهد. پکیج عروس شامل جلسه مشاوره و تست میکاپ پیش از مراسم است.',
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
      {
        id: 'bridal-makeup',
        name: 'میکاپ عروس',
        durationMinutes: 180,
        priceRial: 25000000,
        description: 'میکاپ تخصصی عروس با تست پیش از مراسم و تثبیت طولانی.',
        category: 'آرایش صورت',
      },
      {
        id: 'chignon',
        name: 'شینیون',
        durationMinutes: 90,
        priceRial: 10000000,
        description: 'شینیون مجلسی متناسب با مدل لباس و میکاپ.',
        category: 'خدمات مو',
      },
      {
        id: 'haircare',
        name: 'مراقبت و تقویت مو',
        durationMinutes: 60,
        priceRial: 6000000,
        description: 'ماسک و ویتامینه تخصصی برای موهای رنگ‌شده و آسیب‌دیده.',
        category: 'خدمات مو',
      },
    ],
    gallery: [
      {
        src: '/images/salons/salon-card-5-640w.webp',
        width: 640,
        height: 360,
        alt: 'نمای داخلی سالن پریسا',
      },
      galleryImage('salon-parisa-1.svg', 'اتاق میکاپ عروس سالن پریسا'),
      galleryImage('salon-parisa-2.svg', 'نمونه کار شینیون مجلسی در سالن پریسا'),
      galleryImage('salon-parisa-3.svg', 'فضای لوکس پذیرش سالن پریسا'),
      galleryImage('salon-parisa-4.svg', 'میز کار مراقبت مو در سالن پریسا'),
    ],
    mapEmbedUrl: 'https://neshan.org/maps/iframe/@35.79,51.43,15z',
    coverUrl: '/images/salons/salon-card-5-640w.webp',
    category: 'سالن زیبایی زنانه',
    reviews: [
      {
        id: 'parisa-r1',
        author: 'رها سلطانی',
        rating: 5,
        body: 'میکاپ عروسی‌ام بی‌نقص بود و تا آخر شب دست نخورد. جلسه تست واقعاً استرسم را کم کرد.',
        date: '2026-06-15',
        service: 'میکاپ عروس',
        verified: true,
      },
      {
        id: 'parisa-r2',
        author: 'نیلوفر برومند',
        rating: 5,
        body: 'شینیون دقیقاً با مدل لباسم هماهنگ شد. تیم حرفه‌ای و خوش‌برخورد.',
        date: '2026-05-31',
        service: 'شینیون',
        verified: true,
      },
      {
        id: 'parisa-r3',
        author: 'ساناز اکبری',
        rating: 4,
        body: 'ویتامینه مو نتیجه خوبی داشت. فضای سالن آرام و لوکس است؛ قیمت‌ها متناسب با کیفیت.',
        date: '2026-05-08',
        service: 'مراقبت و تقویت مو',
      },
      {
        id: 'parisa-r4',
        author: 'مریم زند',
        rating: 5,
        body: 'برای مراسم نامزدی میکاپ و شینیون کردم؛ همه از نتیجه تعریف کردند.',
        date: '2026-04-12',
        service: 'میکاپ عروس',
        verified: true,
      },
      {
        id: 'parisa-r5',
        author: 'آیدا معتمدی',
        rating: 4,
        body: 'رزرو آنلاین و یادآوری پیامکی خیلی کمک کرد. کیفیت کار بالاست.',
        date: '2026-03-27',
      },
    ],
    staff: [
      { id: 'parisa-s1', name: 'پریسا نعمتی', role: 'مدیر و میکاپ‌آرتیست' },
      { id: 'parisa-s2', name: 'شبنم راد', role: 'شینیون‌کار ارشد' },
    ],
    amenities: [
      'اتاق اختصاصی عروس',
      'تست میکاپ پیش از مراسم',
      'پرداخت با کارت',
      'اینترنت بی‌سیم رایگان',
      'جای پارک اختصاصی',
    ],
    policies: [
      'رزرو میکاپ عروس با پیش‌پرداخت قطعی می‌شود و تا ۷ روز پیش از مراسم قابل لغو است.',
      'سایر خدمات تا ۲۴ ساعت پیش از نوبت قابل لغو هستند.',
    ],
  }),
  'salon-rose': withComputedRating({
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
      {
        id: 'haircut',
        name: 'کوتاهی مو',
        durationMinutes: 45,
        priceRial: 2500000,
        description: 'کوتاهی تخصصی با مشاوره فرم صورت و سشوار.',
        category: 'خدمات مو',
      },
      {
        id: 'color',
        name: 'رنگ مو',
        durationMinutes: 120,
        priceRial: 8500000,
        description: 'رنگ، هایلایت یا مش با مشاوره پالت رنگ.',
        category: 'خدمات مو',
      },
      {
        id: 'makeup',
        name: 'میکاپ',
        durationMinutes: 90,
        priceRial: 12000000,
        description: 'میکاپ مجلسی متناسب با مراسم و سلیقه شما.',
        category: 'آرایش صورت',
      },
    ],
    gallery: [
      {
        src: '/images/salons/salon-card-6-640w.webp',
        width: 640,
        height: 360,
        alt: 'نمای داخلی سالن زیبایی رز',
      },
      galleryImage('salon-rose-1.svg', 'میز کار رنگ و کوتاهی مو در سالن رز'),
      galleryImage('salon-rose-2.svg', 'نمونه کار رنگ مو در سالن رز'),
      galleryImage('salon-rose-3.svg', 'اتاق میکاپ سالن رز'),
      galleryImage('salon-rose-4.svg', 'فضای انتظار سالن رز در ولنجک'),
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
    coverUrl: '/images/salons/salon-card-6-640w.webp',
    category: 'سالن زیبایی زنانه',
    reviews: [
      {
        id: 'rose-r1',
        author: 'سارا محمدی',
        rating: 5,
        body: 'رنگ و کوتاهی را با هم انجام دادم؛ نتیجه عالی بود و همه‌چیز سر وقت پیش رفت.',
        date: '2026-06-22',
        service: 'رنگ مو',
        verified: true,
      },
      {
        id: 'rose-r2',
        author: 'هانیه کریمی',
        rating: 5,
        body: 'میکاپ مجلسی خیلی طبیعی و شیک شد. رزرو آنلاین هم بدون یک تماس تلفنی انجام شد.',
        date: '2026-06-05',
        service: 'میکاپ',
        verified: true,
      },
      {
        id: 'rose-r3',
        author: 'نازنین رحمانی',
        rating: 4,
        body: 'کوتاهی تمیز و مطابق عکس نمونه. فضای سالن دلباز و تمیز است.',
        date: '2026-05-19',
        service: 'کوتاهی مو',
        verified: true,
      },
      {
        id: 'rose-r4',
        author: 'مینا عزیزی',
        rating: 5,
        body: 'یادآوری پیامکی نوبت خیلی کاربردی بود. کیفیت رنگ هم بعد از یک ماه هنوز خوب مانده.',
        date: '2026-04-28',
        service: 'رنگ مو',
      },
      {
        id: 'rose-r5',
        author: 'فاطمه نوری',
        rating: 5,
        body: 'برخورد پرسنل عالی، قیمت‌ها شفاف و بدون هزینه پنهان. حتماً دوباره می‌آیم.',
        date: '2026-04-03',
        verified: true,
      },
    ],
    staff: [{ id: 'rose-s1', name: 'سارا محمدی', role: 'مدیر و آرایشگر ارشد' }],
    amenities: [
      'اینترنت بی‌سیم رایگان',
      'پرداخت با کارت',
      'جای پارک در نزدیکی سالن',
      'نوبت‌دهی آنلاین ۲۴ ساعته',
    ],
    policies: [
      'لغو رایگان تا ۲۴ ساعت پیش از زمان نوبت.',
      'در صورت تأخیر بیش از ۱۵ دقیقه، ممکن است نوبت جابه‌جا شود.',
    ],
  }),
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
 * Canonical discovery categories (`data/taxonomy.ts` slugs) expanded to the
 * granular `SalonService.id`s the demo catalog uses, so `/services/hair` etc.
 * surface every salon offering a matching treatment. Categories absent here
 * (brows / massage / spa) have no demo salons yet and render the honest empty
 * state with an owner-registration CTA (contract §canonical-taxonomy).
 */
const CATEGORY_SERVICE_IDS: Readonly<Record<string, readonly string[]>> = {
  hair: ['haircut', 'color', 'keratin', 'haircare', 'chignon'],
  barber: ['beard', 'groom'],
  nails: ['nails', 'manicure'],
  skin: ['facial', 'skincare'],
  makeup: ['makeup', 'bridal-makeup'],
};

/**
 * Public profiles offering a service matching `serviceType` — either a direct
 * `SalonService.id` (legacy slugs like `haircut`) or a canonical taxonomy
 * category expanded via {@link CATEGORY_SERVICE_IDS}.
 */
export function getSalonsByService(serviceType: string | undefined): SalonProfile[] {
  if (!serviceType) return [];
  const key = serviceType.trim();
  const ids = new Set([key, ...(CATEGORY_SERVICE_IDS[key] ?? [])]);
  return getAllSalonProfiles().filter((s) => s.services.some((svc) => ids.has(svc.id)));
}
