import type { FirecrawlClient } from './firecrawl-client.js';
import type { SalonWebsiteDraft, ImportedService } from '@salon/shared';

/**
 * WebsiteImportService — imports a salon draft (name, phone, address, services,
 * gallery) from the salon's own website by scraping it with Firecrawl. Used by
 * the public registration wizard to prefill the form (Requirement 12.6:
 * presentation-only ingestion; the owner reviews before submit).
 *
 * Framework-agnostic: constructed by the Composition_Root with a `FirecrawlClient`
 * (real when `FIRECRAWL_API_URL` is set), and trivially faked in tests. When no
 * Firecrawl is configured the service reports `enabled === false` and the route
 * returns 503 IMPORT_DISABLED so the wizard degrades to manual entry.
 *
 * The extraction itself is a pure function of `(markdown, links)` so it can be
 * unit-tested without any network — see {@link extractSalonDraft}.
 */

export interface WebsiteImportServiceOptions {
  /** The Firecrawl client. When absent, the feature is disabled. */
  client?: FirecrawlClient;
}

export class WebsiteImportService {
  private readonly client?: FirecrawlClient;

  constructor(options: WebsiteImportServiceOptions = {}) {
    this.client = options.client;
  }

  /** True when a Firecrawl instance is configured and the feature is usable. */
  get enabled(): boolean {
    return this.client !== undefined;
  }

  /**
   * Scrape `url` and return the recovered salon draft, or `null` when the
   * feature is disabled. Throws on Firecrawl errors so the route can map them.
   */
  async importFromUrl(url: string): Promise<SalonWebsiteDraft | null> {
    if (!this.client) return null;
    const { markdown, links } = await this.client.scrape(url);
    return extractSalonDraft(markdown, links);
  }
}

/**
 * Image extensions we treat as gallery/cover candidates.
 * distinctiveness-ok: file-extension literals are data, not styles.
 */
const IMAGE_EXT = /\.(png|jpe?g|webp|avif|gif|svg)$/i; // distinctiveness-ok: data, not style

/**
 * Iranian phone patterns (mobile + landline). Matched against Latin-digit
 * normalized text. Captures the first plausible phone on the page.
 */
const PHONE_RE = /(?:\+98|0)?9\d{9}|0\d{2,3}-?\d{6,8}|0\d{9,10}/;

/** Persian street/address keywords that mark an address line. */
const ADDRESS_KEYWORDS =
  /آدرس|خیابان|کوچه|خیابان|میدان|بن‌بست|پلاک| street|st\.|avenue|ave\.|blvd/i;

/**
 * A price token: a comma-grouped number (`8,500,000` / `250,000`) or a plain
 * digit run, optionally suffixed by ریال / تومان / $ / toman / rial. The
 * leading digit group may be 1–3 digits so `8,500,000` (a single leading
 * digit) matches as a whole rather than being clipped to `500,000`.
 */
const PRICE_RE = /(\d{1,3}(?:,\d{3})+|\d{3,})(?:\s*(ریال|تومان|toman|rial|\$|dollars?))?/i;

/** Eastern-Arabic / Persian digit → Latin (so heuristics match Persian prices). */
function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));
}

/**
 * Pure extraction: distill a Firecrawl markdown dump + link list into a salon
 * draft. Best-effort and heuristic — every field is optional and the owner
 * confirms the result in the registration wizard (Requirement 12.6). Exported so
 * the heuristics are unit-testable without any network.
 */
export function extractSalonDraft(markdown: string, links: string[]): SalonWebsiteDraft {
  const lines = markdown.split('\n');

  // Salon name: the first markdown H1 (`# Title`); fall back to the <title>-ish
  // first non-empty line if there is no H1. Trim markdown emphasis.
  const h1 = lines.map((l) => l.trim()).find((l) => /^#\s+\S/.test(l));
  const salonName = h1
    ? h1.replace(/^#\s+/, '').replace(/[*_`]/g, '').trim().slice(0, 120)
    : undefined;

  // Phone: first match against Latin-digit-normalized text (so «۰۲۱...» matches).
  const phoneMatch = toLatinDigits(markdown).match(PHONE_RE);
  const phone = phoneMatch?.[0].replace(/[\s-]/g, '').slice(0, 40);

  // Address: the first line that reads like an address, with the keyword prefix
  // stripped (e.g. «آدرس: ...»).
  const addressLine = lines
    .map((l) => l.trim())
    .find((l) => l.length > 4 && l.length < 300 && ADDRESS_KEYWORDS.test(l));
  const address = addressLine
    ? addressLine
        .replace(/^[^:：]*[:：]\s*/, '')
        .replace(/[*_`]/g, '')
        .trim()
        .slice(0, 300)
    : undefined;

  // Services: lines that look like a priced menu row ("کوتاهی مو ۲۵۰,۰۰۰ تومان").
  // A currency unit (ریال / تومان / $ / toman / rial) is REQUIRED so that a bare
  // digit run (a phone number, a chair count, a year) is never misread as a
  // priced service. The owner can add unitless services manually in the wizard.
  // Persian digits are normalized first so «۲۵۰,۰۰۰ تومان» matches the price regex.
  const services: ImportedService[] = [];
  for (const raw of lines) {
    if (services.length >= 50) break;
    const line = toLatinDigits(raw.trim());
    if (line.length < 3 || line.length > 200) continue;
    const m = line.match(PRICE_RE);
    if (!m || !m[2]) continue;
    const priceDigits = m[1].replace(/,/g, '');
    const priceNum = Number(priceDigits);
    if (!Number.isFinite(priceNum) || priceNum <= 0) continue;
    const unit = m[2].toLowerCase();
    // Convert تومان → ریال (×10) when the unit is toman; leave $ as-is-ish.
    const priceRial = unit.startsWith('تومان') || /toman/.test(unit) ? priceNum * 10 : priceNum;
    const name = line
      .replace(PRICE_RE, '')
      .replace(/[*_`|•\-–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    if (name.length < 2) continue;
    services.push({ name, priceRial });
  }

  // Gallery: absolute http(s) image URLs from the link graph, deduped.
  const seen = new Set<string>();
  const galleryImageUrls: string[] = [];
  for (const l of links) {
    if (galleryImageUrls.length >= 20) break;
    if (!/^https?:\/\//i.test(l) || !IMAGE_EXT.test(l)) continue;
    if (seen.has(l)) continue;
    seen.add(l);
    galleryImageUrls.push(l);
  }

  // Drop undefined fields so the response only carries recovered data.
  const draft: SalonWebsiteDraft = {
    services,
    galleryImageUrls,
  };
  if (salonName) draft.salonName = salonName;
  if (phone) draft.phone = phone;
  if (address) draft.address = address;
  return draft;
}
