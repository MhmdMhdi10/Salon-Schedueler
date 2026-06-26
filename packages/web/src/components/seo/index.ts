/**
 * SEO module barrel: the per-route `<head>` and structured-data primitives.
 *
 *  - `SeoHead` — centralizes the title template, meta description, absolute
 *    canonical (single host, params stripped), robots directive, OG/Twitter
 *    tags, and `hreflang`. **Defaults to `noindex`** so routes opt in to
 *    indexing (R8.7).
 *  - `JsonLd` — injects validated schema.org structured data via a
 *    `<script type="application/ld+json">` tag (R8.4).
 *
 * Both manage `<head>` through `react-helmet-async` (wrapped by `HelmetProvider`
 * in `App.tsx`) so tags are prerender/SSR-safe (seo §3, §5, §8).
 *
 * See `.kiro/steering/seo-skills.md` for the governing standards.
 */
export { SeoHead } from './SeoHead';
export type { SeoHeadProps } from './SeoHead';

export {
  JsonLd,
  normalizeJsonLdNode,
  serializeJsonLd,
} from './JsonLd';
export type { JsonLdProps, JsonLdNode } from './JsonLd';

export {
  SITE_NAME,
  SITE_URL,
  OG_LOCALE,
  HTML_LANG,
  TITLE_TEMPLATE_SUFFIX,
  DEFAULT_OG_IMAGE,
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
  absoluteCanonical,
} from './config';
