/**
 * Thin HTTP client over a Firecrawl instance (self-hosted or cloud). Used by the
 * `WebsiteImportService` to scrape a salon's own website and prefill the
 * registration form. Self-hosted Firecrawl needs no API key; the cloud service
 * (api.firecrawl.dev) requires one — both speak the same `/v1/scrape` API.
 *
 * Kept framework-agnostic (a plain `fetch` wrapper) so it is injected by the
 * Composition_Root and trivially faked in tests (Requirement 3.1, 3.4).
 */

export interface FirecrawlScrapeResult {
  /** Page content as markdown (Firecrawl's `markdown` format). */
  markdown: string;
  /** Discovered links on the page (Firecrawl's `links` format). */
  links: string[];
}

export interface FirecrawlClientOptions {
  /** Base URL of the Firecrawl API, e.g. `http://localhost:3002`. No trailing slash. */
  apiUrl: string;
  /** Optional Bearer API key (unneeded for self-hosted). */
  apiKey?: string;
  /** Optional fetch override for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Per-scrape timeout, ms. Defaults to 30s (scraping can be slow). */
  timeoutMs?: number;
}

export class FirecrawlClient {
  private readonly apiUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: FirecrawlClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  /**
   * Scrape a single URL for its markdown + links. Throws on a non-2xx response
   * or when Firecrawl reports `success: false` (the caller maps that to a 502).
   */
  async scrape(url: string): Promise<FirecrawlScrapeResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };
      if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

      const res = await this.fetchImpl(`${this.apiUrl}/v1/scrape`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          url,
          formats: ['markdown', 'links'],
          onlyMainContent: false,
        }),
      });
      if (!res.ok) {
        throw new Error(`firecrawl scrape HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        success?: boolean;
        data?: { markdown?: unknown; links?: unknown };
      };
      if (!json?.success) {
        throw new Error('firecrawl scrape reported failure');
      }
      const markdown = typeof json.data?.markdown === 'string' ? json.data.markdown : '';
      const links = Array.isArray(json.data?.links)
        ? (json.data!.links as unknown[]).flatMap((l) => (typeof l === 'string' ? [l] : []))
        : [];
      return { markdown, links };
    } finally {
      clearTimeout(timer);
    }
  }
}
