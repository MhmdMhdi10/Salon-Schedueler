import { extractSalonDraft, WebsiteImportService } from './website-import.service.js';
import { FirecrawlClient } from './firecrawl-client.js';

/**
 * Unit tests for the Firecrawl-backed website import. The pure extraction
 * function ({@link extractSalonDraft}) is the heuristic heart of the feature and
 * is tested with no network; the service's `enabled`/`importFromUrl` wiring is
 * tested with a faked client (Requirement 12.6).
 */

const MARKDOWN = [
  '# سالن رز',
  '',
  'به سالن رز خوش آمدید.',
  'آدرس: ولنجک، خیابان نمونه، پلاک ۱۰',
  'تلفن: 02112345678',
  '',
  '## خدمات',
  '- کوتاهی مو 250,000 تومان',
  '- رنگ مو 8,500,000 ریال',
  '- میکاپ 12,000,000 تومان',
].join('\n');

const LINKS = [
  'https://salon-rose.example/img/cover.png',
  'https://salon-rose.example/img/team.jpg',
  'https://salon-rose.example/about',
  'https://salon-rose.example/img/cover.png', // duplicate
  'mailto:info@salon-rose.example',
];

describe('extractSalonDraft (pure heuristic extraction)', () => {
  const draft = extractSalonDraft(MARKDOWN, LINKS);

  it('recovers the salon name from the first H1', () => {
    expect(draft.salonName).toBe('سالن رز');
  });

  it('recovers the phone (Latin-digit normalized, stripped of separators)', () => {
    expect(draft.phone).toBe('02112345678');
  });

  it('recovers the address, dropping the "آدرس:" prefix', () => {
    expect(draft.address).toBe('ولنجک، خیابان نمونه، پلاک ۱۰');
  });

  it('recovers priced services and converts تومان -> ریال (×10)', () => {
    expect(draft.services.length).toBe(3);
    const haircut = draft.services.find((s) => s.name.includes('کوتاهی'));
    expect(haircut).toBeDefined();
    // 250,000 تoman -> 2,500,000 rial
    expect(haircut?.priceRial).toBe(2_500_000);
    const color = draft.services.find((s) => s.name.includes('رنگ'));
    expect(color?.priceRial).toBe(8_500_000); // already ریال
  });

  it('collects only absolute http(s) image URLs, deduped', () => {
    expect(draft.galleryImageUrls).toEqual([
      'https://salon-rose.example/img/cover.png',
      'https://salon-rose.example/img/team.jpg',
    ]);
  });

  it('returns empty optional fields (not undefined) when nothing matches', () => {
    const empty = extractSalonDraft('hello world', []);
    expect(empty.salonName).toBeUndefined();
    expect(empty.phone).toBeUndefined();
    expect(empty.address).toBeUndefined();
    expect(empty.services).toEqual([]);
    expect(empty.galleryImageUrls).toEqual([]);
  });
});

describe('WebsiteImportService wiring', () => {
  it('reports disabled when no Firecrawl client is injected', async () => {
    const service = new WebsiteImportService();
    expect(service.enabled).toBe(false);
    expect(await service.importFromUrl('https://x.example')).toBeNull();
  });

  it('scrapes via the injected client and distills the draft', async () => {
    const fakeClient = {
      scrape: jest.fn().mockResolvedValue({ markdown: MARKDOWN, links: LINKS }),
    } as unknown as FirecrawlClient;
    const service = new WebsiteImportService({ client: fakeClient });
    expect(service.enabled).toBe(true);

    const draft = await service.importFromUrl('https://salon-rose.example');
    expect(fakeClient.scrape).toHaveBeenCalledWith('https://salon-rose.example');
    expect(draft?.salonName).toBe('سالن رز');
    expect(draft?.services.length).toBe(3);
  });
});
