#!/usr/bin/env node
/**
 * Scrape Booksy's marketing + business-profile surfaces with a self-hosted
 * Firecrawl instance and distill the result into a Booksy design reference that
 * grounds the web redesign.
 *
 *   # 1) start self-hosted Firecrawl (see .env.firecrawl.example)
 *   docker compose -f docker/firecrawl-compose.yml --env-file .env.firecrawl up -d
 *
 *   # 2) run this script
 *   node scripts/scrape-booksy.mjs
 *
 * Output:
 *   packages/web/docs/booksy-design-reference.json  — structured layout/copy
 *   packages/web/docs/booksy-design-reference.md   — human-readable summary
 *
 * The script is robust to Firecrawl being down or Booksy blocking the scrape:
 * when no usable content comes back it writes a curated Booksy-UX reference
 * (the canonical patterns Booksy uses across markets) so the redesign is always
 * grounded, and records `source: 'firecrawl' | 'fallback'` so the provenance is
 * explicit. Self-hosted Firecrawl has no Fire-engine anti-bot, so Booksy may 403
 * the scrape — the fallback exists precisely for that case.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(REPO_ROOT, 'packages/web/docs');

const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL ?? 'http://localhost:3002';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY ?? '';

/** Booksy surfaces whose layout/copy we want as a design reference. */
const TARGETS = [
  { kind: 'marketing-home', url: 'https://booksy.com/en-us' },
  {
    kind: 'search-results',
    url: 'https://booksy.com/en-us/search/haircut/tehran',
  },
  {
    kind: 'business-profile',
    url: 'https://booksy.com/en-us/biz/salon-rose/12345',
  },
];

/**
 * Call the self-hosted Firecrawl `/v1/scrape` endpoint for one URL, asking for
 * markdown + links so we can read both the visible copy and the link graph.
 * Returns `{ markdown, links }` or `null` when the scrape yields nothing useful.
 */
async function scrape(url) {
  const body = JSON.stringify({
    url,
    formats: ['markdown', 'links'],
    onlyMainContent: false,
  });
  const headers = { 'content-type': 'application/json' };
  if (FIRECRAWL_API_KEY) headers.authorization = `Bearer ${FIRECRAWL_API_KEY}`;

  const res = await fetch(`${FIRECRAWL_API_URL}/v1/scrape`, {
    method: 'POST',
    headers,
    body,
  });
  if (!res.ok) {
    throw new Error(`scrape ${url} -> HTTP ${res.status}`);
  }
  const json = await res.json();
  if (!json?.success) {
    throw new Error(`scrape ${url} -> firecrawl reported failure`);
  }
  const data = json.data ?? {};
  const markdown = typeof data.markdown === 'string' ? data.markdown : '';
  const links = Array.isArray(data.links) ? data.links : [];
  if (!markdown && links.length === 0) return null;
  return { markdown, links };
}

/** Whether scraped content looks usable (not a bare block page). */
function looksBlocked(result) {
  if (!result) return true;
  const md = result.markdown.toLowerCase();
  if (md.length < 200) return true;
  return /access denied|forbidden|enable javascript|captcha|are you a robot/i.test(md);
}

/**
 * The curated fallback Booksy-UX reference: the canonical patterns Booksy uses
 * across markets (home hero search, category circles, "popular professionals"
 * cards with rating + from-price + Book button, 3-step how-it-works, app promo;
 * search results with filter chips + result list + map toggle). Used only when
 * Firecrawl is unavailable or Booksy blocked the scrape.
 */
function curatedFallback() {
  return {
    source: 'fallback',
    capturedAt: new Date().toISOString(),
    surfaces: [
      {
        kind: 'marketing-home',
        url: TARGETS[0].url,
        layout: [
          'full-bleed hero with a background image + a centered, prominent search bar',
          'search bar: two pill inputs (service + location) + a solid primary "Search" button on the inline-end',
          'category circles row directly under the hero: circular icon emblem + label, horizontally scrollable on mobile',
          'popular professionals: salon cards (cover photo, name, star rating + review count, category, address, "from $X" price, "Book" button)',
          'how it works: 3 numbered steps (choose service / pick time / confirm) with icons',
          'app-download promo band with app store badges + a QR',
          'trust strip: ratings, number of bookings, "available 24/7"',
        ],
        copy: {
          heroTitle: 'Book trusted beauty pros, instantly',
          heroSubtitle: 'Search and book appointments at top salons near you.',
          searchServicePlaceholder: 'Service or salon name',
          searchLocationPlaceholder: 'City or neighborhood',
          searchSubmit: 'Search',
          categoriesTitle: 'Popular categories',
          featuredTitle: 'Popular professionals near you',
          howItWorksTitle: 'How Booksy works',
          appPromoTitle: 'Get the Booksy app',
        },
      },
      {
        kind: 'search-results',
        url: TARGETS[1].url,
        layout: [
          'sticky results header: result count + sort control (Recommended / Top rated / Price)',
          'filter chip row: open now, next available, price range, reviews, map view toggle',
          'result list: one card per salon — cover thumbnail (inline-start), name, rating + reviews, category, address, "from $X", a prominent "Book" button (inline-end)',
          'map toggle button swaps the list for a map with pinned salon cards',
          'mobile: filters collapse into a bottom sheet opened by a "Filters" chip',
        ],
        copy: {
          resultsLabel: '{{count}} places near you',
          sortLabel: 'Sort',
          filterOpenNow: 'Open now',
          filterNextAvailable: 'Next available',
          filterPrice: 'Price',
          filterReviews: 'Reviews',
          viewMap: 'Map',
          viewList: 'List',
          book: 'Book',
        },
      },
      {
        kind: 'business-profile',
        url: TARGETS[2].url,
        layout: [
          'storefront hero: cover gallery + salon name + rating + category + address',
          'sticky inline-booking rail (desktop) / sticky bottom "Book" bar (mobile): service picker → date → time → confirm',
          'services list with name, duration, price, and a "Book" affordance per row',
          'team members row (avatar + name + role)',
          'reviews list with author, rating, date, text',
          'gallery, opening hours, NAP, map embed',
        ],
      },
    ],
  };
}

/** Distill a single Firecrawl result into a compact reference entry. */
function distill(target, result) {
  // Pull the first ~40 non-empty lines as a layout sketch; collect link anchors.
  const lines = result.markdown
    .split('\n')
    .map((l) => l.replace(/[#>*_`]/g, '').trim())
    .filter((l) => l.length > 0)
    .slice(0, 40);
  const anchors = result.links
    .map((l) => (typeof l === 'string' ? l : l?.url))
    .filter(Boolean)
    .slice(0, 60);
  return {
    kind: target.kind,
    url: target.url,
    markdownSketch: lines,
    links: anchors,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let reference;

  try {
    console.log(`→ scraping Booksy via Firecrawl at ${FIRECRAWL_API_URL}`);
    const surfaces = [];
    let anyUsable = false;
    for (const target of TARGETS) {
      try {
        const result = await scrape(target.url);
        if (looksBlocked(result)) {
          console.log(`  ✗ ${target.kind}: blocked/empty`);
          surfaces.push({ kind: target.kind, url: target.url, blocked: true });
          continue;
        }
        anyUsable = true;
        surfaces.push(distill(target, result));
        console.log(`  ✓ ${target.kind}: ${result.markdown.length} chars`);
      } catch (err) {
        console.log(`  ✗ ${target.kind}: ${err.message}`);
        surfaces.push({
          kind: target.kind,
          url: target.url,
          error: err.message,
        });
      }
    }
    reference = anyUsable
      ? { source: 'firecrawl', capturedAt: new Date().toISOString(), surfaces }
      : curatedFallback();
  } catch (err) {
    console.log(`✗ Firecrawl unavailable (${err.message}); using curated reference.`);
    reference = curatedFallback();
  }

  const jsonPath = resolve(OUT_DIR, 'booksy-design-reference.json');
  const mdPath = resolve(OUT_DIR, 'booksy-design-reference.md');
  await writeFile(jsonPath, JSON.stringify(reference, null, 2) + '\n', 'utf8');

  const lines = [
    '# Booksy design reference',
    '',
    `Source: **${reference.source}**  `,
    `Captured: ${reference.capturedAt}`,
    '',
    'Provenance: scraped from booksy.com via self-hosted Firecrawl when the',
    'scrape succeeds (`source: firecrawl`); a curated Booksy-UX reference is',
    'written when Firecrawl is unavailable or Booksy blocks the scrape',
    '(`source: fallback`). See `scripts/scrape-booksy.mjs`.',
    '',
  ];
  for (const s of reference.surfaces) {
    lines.push(`## ${s.kind}`, '', `URL: ${s.url}`, '');
    if (s.layout) {
      lines.push('Layout patterns:');
      for (const l of s.layout) lines.push(`- ${l}`);
      lines.push('');
    }
    if (s.copy) {
      lines.push('Copy:');
      for (const [k, v] of Object.entries(s.copy)) lines.push(`- ${k}: ${v}`);
      lines.push('');
    }
    if (s.markdownSketch) {
      lines.push('Markdown sketch (first lines):');
      for (const l of s.markdownSketch) lines.push(`> ${l}`);
      lines.push('');
    }
    if (s.blocked) lines.push('_Blocked / empty — see fallback._', '');
    if (s.error) lines.push(`_Error: ${s.error}_`, '');
  }
  await writeFile(mdPath, lines.join('\n') + '\n', 'utf8');

  console.log(`✓ wrote ${jsonPath}`);
  console.log(`✓ wrote ${mdPath} (source: ${reference.source})`);
}

main().catch((err) => {
  console.error('scrape-booksy failed:', err);
  process.exit(1);
});
