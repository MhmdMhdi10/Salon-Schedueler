/**
 * Canonical discovery taxonomy — the SINGLE source of truth for category and
 * city links across the app (implementation contract §"Canonical taxonomy").
 *
 * Every nav / category-rail / city-grid link imports from this module so the
 * header rail, hero rail, footer, 404 page, and discovery surfaces can never
 * drift apart. The discovery surface guarantees `/services/:slug` resolves for
 * all 8 category slugs and `/city/:slug` resolves for all 20 city slugs
 * (cities/categories without demo salons render an honest empty state with an
 * owner-registration CTA — never a 404).
 */

export interface TaxonomyCategory {
  /** ASCII slug — the `/services/:slug` path segment. */
  slug: string;
  /** Persian display label. */
  label: string;
}

export interface TaxonomyCity {
  /** ASCII slug — the `/city/:slug` path segment. */
  slug: string;
  /** Persian display name. */
  name: string;
}

/** The 8 discovery categories, in display order. */
export const DISCOVERY_CATEGORIES: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: 'hair', label: 'آرایش مو' },
  { slug: 'barber', label: 'آرایشگاه مردانه' },
  { slug: 'nails', label: 'ناخن' },
  { slug: 'skin', label: 'مراقبت پوست' },
  { slug: 'brows', label: 'ابرو و مژه' },
  { slug: 'massage', label: 'ماساژ' },
  { slug: 'makeup', label: 'میکاپ' },
  { slug: 'spa', label: 'سلامت و اسپا' },
] as const;

/** The 20 discovery cities, in display order. */
export const DISCOVERY_CITIES: ReadonlyArray<{ slug: string; name: string }> = [
  { slug: 'tehran', name: 'تهران' },
  { slug: 'mashhad', name: 'مشهد' },
  { slug: 'isfahan', name: 'اصفهان' },
  { slug: 'shiraz', name: 'شیراز' },
  { slug: 'karaj', name: 'کرج' },
  { slug: 'tabriz', name: 'تبریز' },
  { slug: 'qom', name: 'قم' },
  { slug: 'ahvaz', name: 'اهواز' },
  { slug: 'rasht', name: 'رشت' },
  { slug: 'urmia', name: 'ارومیه' },
  { slug: 'kerman', name: 'کرمان' },
  { slug: 'yazd', name: 'یزد' },
  { slug: 'qazvin', name: 'قزوین' },
  { slug: 'sari', name: 'ساری' },
  { slug: 'kish', name: 'کیش' },
  { slug: 'bandar-abbas', name: 'بندرعباس' },
  { slug: 'hamedan', name: 'همدان' },
  { slug: 'gorgan', name: 'گرگان' },
  { slug: 'kermanshah', name: 'کرمانشاه' },
  { slug: 'arak', name: 'اراک' },
] as const;
