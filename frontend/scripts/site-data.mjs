/**
 * Build-time bridge from the app's TypeScript data modules to the Node build
 * scripts (sitemap + prerender), so the crawlable route set is enumerated from
 * the SAME source of truth the pages render from and can never drift
 * (seo §7/§8; implementation contract §"Canonical taxonomy"):
 *
 *   - `src/data/salons.ts`    → every public `/s/:slug` profile (Persian name,
 *                               tagline, NAP, services) — no more English
 *                               `slugToName()` fallbacks in shipped titles.
 *   - `src/data/taxonomy.ts`  → the canonical 8 categories + 20 cities that the
 *                               discovery surface guarantees to resolve.
 *   - `src/data/discovery.ts` → hand-written Persian intros for the discovery
 *                               pages (used as meta descriptions when present)
 *                               plus any legacy service slugs kept alive.
 *
 * The TS modules are bundled with esbuild (already a transitive dependency via
 * Vite) into an in-memory ESM module and imported through a `data:` URL — no
 * on-disk temp files, no duplicate JSON list to hand-maintain. The legacy
 * `scripts/salons.json` / `scripts/discovery.json` files remain only as inert
 * documentation of the old mechanism; nothing reads them at build time anymore.
 *
 * Pure merge helpers are exported for unit tests
 * (`scripts/__tests__/site-data.test.ts` asserts parity with the TS modules).
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DATA = resolve(HERE, '../src/data');

/**
 * Bundle a TypeScript module from `src/data/` to ESM in memory and import it.
 * The data modules are dependency-free by design (presentation-only data), so
 * the bundle is tiny and synchronous to produce.
 *
 * esbuild is imported lazily (not at module scope): the pure string-building
 * exports of prerender.mjs / generate-sitemap.mjs are unit-tested under
 * vitest's jsdom environment, and esbuild's module-init invariant check
 * rejects jsdom's TextEncoder. Only real build runs (node) reach this import.
 */
export async function importDataModule(fileName) {
  const { buildSync } = await import('esbuild');
  const entry = resolve(SRC_DATA, fileName);
  const result = buildSync({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  const encoded = Buffer.from(code, 'utf-8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

/**
 * Map a full `SalonProfile` (src/data/salons.ts) to the flat entry the sitemap
 * and prerender steps consume. Only real, on-page data is carried — the
 * prerendered title/description/JSON-LD mirror the live page's `<SeoHead>`
 * (`title={salon.name} description={salon.tagline}`) so crawler HTML and
 * hydrated HTML agree (seo §5/§11).
 */
export function salonToRouteEntry(profile) {
  return {
    slug: profile.slug,
    name: profile.name,
    description: profile.tagline || profile.description,
    citySlug: profile.citySlug,
    telephone: profile.telephone,
    priceRange: profile.priceRange,
    address: profile.address,
    geo: profile.geo,
    openingHours: profile.openingHours,
    image: profile.coverUrl || profile.gallery?.[0]?.src,
    services: (profile.services || []).map((s) => ({
      name: s.name,
      price: s.priceRial,
    })),
  };
}

/**
 * Merge the canonical taxonomy list with the discovery module's richer entries:
 * taxonomy order wins (all canonical slugs present, in display order), each
 * enriched with the hand-written `intro` when discovery.ts has one; extra
 * discovery slugs not in the taxonomy (legacy `haircut`/`color`) are appended
 * so an existing indexable URL never silently drops out of the sitemap.
 */
export function mergeRouteLists(taxonomyEntries, discoveryEntries) {
  const bySlug = new Map(discoveryEntries.map((e) => [e.slug, e]));
  const merged = taxonomyEntries.map((entry) => {
    const rich = bySlug.get(entry.slug);
    return {
      slug: entry.slug,
      name: entry.name ?? entry.label,
      description: rich?.intro,
    };
  });
  const canonical = new Set(taxonomyEntries.map((e) => e.slug));
  for (const extra of discoveryEntries) {
    if (!canonical.has(extra.slug)) {
      merged.push({ slug: extra.slug, name: extra.name, description: extra.intro });
    }
  }
  return merged;
}

/**
 * Load the complete crawlable route data from the app source:
 * `{ salons, cities, serviceTypes }` — salons from salons.ts, cities/services
 * from taxonomy.ts (canonical) merged with discovery.ts (copy + legacy slugs).
 */
export async function loadSiteData() {
  const [salonsMod, discoveryMod, taxonomyMod] = await Promise.all([
    importDataModule('salons.ts'),
    importDataModule('discovery.ts'),
    importDataModule('taxonomy.ts'),
  ]);

  const salons = salonsMod.getAllSalonProfiles().map(salonToRouteEntry);

  const discoveryCities = discoveryMod
    .getCitySlugs()
    .map((slug) => discoveryMod.getCity(slug));
  const discoveryServices = discoveryMod
    .getServiceTypeSlugs()
    .map((slug) => discoveryMod.getServiceType(slug));

  const cities = mergeRouteLists(taxonomyMod.DISCOVERY_CITIES, discoveryCities);
  const serviceTypes = mergeRouteLists(
    taxonomyMod.DISCOVERY_CATEGORIES,
    discoveryServices,
  );

  return { salons, cities, serviceTypes };
}
