import { Helmet } from 'react-helmet-async';
import {
  SITE_NAME,
  SITE_URL,
  OG_LOCALE,
  TITLE_TEMPLATE_SUFFIX,
  DEFAULT_OG_IMAGE,
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
  absoluteCanonical,
} from './config';

/**
 * `<SeoHead>` — the single, centralized `<head>` manager for every route
 * (seo §3, §4, §6; design "Head / meta strategy"; R8.2, R8.3, R8.6, R8.7).
 *
 * It emits, in one place, the things that are easy to get wrong per page:
 *  - **Title template** «{صفحه} | رزرو سالن» (kept ≤ ~60 chars by callers).
 *  - **Meta description** (unique, natural Persian, ~120–155 chars).
 *  - **Absolute canonical** on the single site host, with tracking params
 *    stripped (via {@link absoluteCanonical}).
 *  - **Robots directive** — see the noindex default below.
 *  - **Open Graph + Twitter** card tags, with `og:locale=fa_IR` and a 1200×630
 *    image.
 *  - **`hreflang`** self-reference (`fa`, `fa-IR`) + `x-default` → home.
 *
 * ## Why the default is `noindex` (R8.7, the safety property)
 *
 * The default robots directive is **`noindex,follow`**. Pages must explicitly
 * opt **in** to indexing by passing `index`. This inverts the risk: a newly
 * added private route (a new admin page, a new funnel step) that simply renders
 * `<SeoHead title="…" />` and forgets about SEO is **noindex by omission** and
 * can never leak into the index. Only the handful of genuinely public surfaces
 * (marketing home, salon profiles, discovery, legal) pass `index`, and those
 * also land in the sitemap.
 *
 * `<head>` management goes through `react-helmet-async` so the tags are
 * prerender/SSR-safe — they can be serialized into the initial HTML of the
 * public routes (seo §8) rather than only applied after hydration.
 */
export interface SeoHeadProps {
  /**
   * The page name placed before the template suffix, e.g.
   * «سالن رز، آرایشگاه زنانه ولنجک تهران» → «… | رزرو سالن». When omitted, the
   * bare site name is used as the title.
   */
  title?: string;
  /** Unique meta description (~120–155 chars), natural Persian. */
  description?: string;
  /**
   * Whether this route may be indexed. **Defaults to `false`** so pages opt in
   * to indexing (R8.7). `true` → `index,follow`; `false` → `noindex,follow`.
   */
  index?: boolean;
  /**
   * The route path used to build the absolute canonical and the `hreflang`
   * self-reference (e.g. `/s/salon-rose`). When omitted, the current
   * `window.location.pathname` is used. Query/hash are always stripped.
   */
  path?: string;
  /**
   * Explicit absolute canonical override. When provided it wins over `path`
   * (still normalized: single host, params stripped). Use when a page canonical
   * differs from its own URL (e.g. paginated or filtered views).
   */
  canonical?: string;
  /** Open Graph `og:type`. `website` for most pages; `business.business` for salon profiles. */
  ogType?: string;
  /** Absolute OG/Twitter image URL (1200×630). Defaults to the branded site image. */
  image?: string;
  /** Extra head children (e.g. `<JsonLd>` or page-specific preloads). */
  children?: React.ReactNode;
}

/** Resolve the canonical-source path, preferring an explicit value. */
function resolvePath(path?: string): string {
  if (path != null) return path;
  if (typeof window !== 'undefined' && window.location) {
    return window.location.pathname + window.location.search;
  }
  return '/';
}

export function SeoHead({
  title,
  description,
  index = false,
  path,
  canonical,
  ogType = 'website',
  image = DEFAULT_OG_IMAGE,
  children,
}: SeoHeadProps) {
  const fullTitle = title ? `${title}${TITLE_TEMPLATE_SUFFIX}` : SITE_NAME;
  const canonicalUrl = canonical
    ? absoluteCanonical(canonical)
    : absoluteCanonical(resolvePath(path));
  const robots = index ? 'index,follow' : 'noindex,follow';
  const homeUrl = SITE_URL;

  return (
    <Helmet prioritizeSeoTags>
      <html lang="fa" dir="rtl" />
      <title>{fullTitle}</title>
      {description != null && <meta name="description" content={description} />}
      <meta name="robots" content={robots} />
      <link rel="canonical" href={canonicalUrl} />

      {/* International SEO: single-locale Persian self-reference + x-default (seo §6). */}
      <link rel="alternate" hrefLang="fa" href={canonicalUrl} />
      <link rel="alternate" hrefLang="fa-IR" href={canonicalUrl} />
      <link rel="alternate" hrefLang="x-default" href={homeUrl} />

      {/* Open Graph (seo §4). */}
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content={OG_LOCALE} />
      <meta property="og:title" content={fullTitle} />
      {description != null && <meta property="og:description" content={description} />}
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content={String(OG_IMAGE_WIDTH)} />
      <meta property="og:image:height" content={String(OG_IMAGE_HEIGHT)} />

      {/* Twitter card (seo §4). */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description != null && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={image} />

      {children}
    </Helmet>
  );
}
