import request from 'supertest';
import { buildApp, type Services } from '../app.js';
import { Authorizer } from '../../auth/index.js';

/**
 * Route-level tests for the public website-import endpoint
 * (POST /api/import/website), driven with supertest against `buildApp` using a
 * faked `websiteImportService` so NO Firecrawl instance and NO database are
 * required (Requirement 12.6).
 */

const TEST_ACCESS_SECRET = 'test-access-secret';

type FakeImport = { enabled: boolean; importFromUrl: jest.Mock };

/** Build a minimal `Services` with only the import service faked (the import
 *  route touches no other service). Mirrors the salon-scan route test pattern. */
function buildTestApp(importService: FakeImport) {
  const services = {
    websiteImportService: importService,
    authorizer: new Authorizer(),
  } as unknown as Services;
  return buildApp({
    services,
    jwtAccessSecret: TEST_ACCESS_SECRET,
  });
}

describe('POST /api/import/website', () => {
  it('returns 200 with the recovered draft when Firecrawl is enabled', async () => {
    const draft = { salonName: 'سالن رز', services: [], galleryImageUrls: [] };
    const fake: FakeImport = {
      enabled: true,
      importFromUrl: jest.fn().mockResolvedValue(draft),
    };
    const app = buildTestApp(fake);

    const res = await request(app)
      .post('/api/import/website')
      .send({ url: 'https://salon-rose.example' });

    expect(res.status).toBe(200);
    expect(res.body.draft).toEqual(draft);
    expect(fake.importFromUrl).toHaveBeenCalledWith('https://salon-rose.example');
  });

  it('returns 503 IMPORT_DISABLED when Firecrawl is not configured', async () => {
    const fake: FakeImport = { enabled: false, importFromUrl: jest.fn() };
    const app = buildTestApp(fake);

    const res = await request(app)
      .post('/api/import/website')
      .send({ url: 'https://salon-rose.example' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('IMPORT_DISABLED');
    expect(fake.importFromUrl).not.toHaveBeenCalled();
  });

  it('returns 502 IMPORT_FAILED when the scrape throws', async () => {
    const fake: FakeImport = {
      enabled: true,
      importFromUrl: jest.fn().mockRejectedValue(new Error('firecrawl HTTP 503')),
    };
    const app = buildTestApp(fake);

    const res = await request(app)
      .post('/api/import/website')
      .send({ url: 'https://salon-rose.example' });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('IMPORT_FAILED');
  });

  it('returns 400 VALIDATION_ERROR for a non-URL body', async () => {
    const fake: FakeImport = { enabled: true, importFromUrl: jest.fn() };
    const app = buildTestApp(fake);

    const res = await request(app).post('/api/import/website').send({ url: 'not-a-url' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.field).toBe('url');
  });

  it('rejects a non-http(s) URL (ftp is not allowed)', async () => {
    const fake: FakeImport = { enabled: true, importFromUrl: jest.fn() };
    const app = buildTestApp(fake);

    const res = await request(app)
      .post('/api/import/website')
      .send({ url: 'ftp://salon-rose.example' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
