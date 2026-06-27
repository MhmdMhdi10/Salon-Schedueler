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
