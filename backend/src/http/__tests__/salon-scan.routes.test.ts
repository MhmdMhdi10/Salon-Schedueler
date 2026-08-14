import request from 'supertest';
import { buildApp, type Services } from '../app.js';
import { Authorizer } from '../../auth/index.js';

/**
 * Route-level tests for the public campaign-arrival scan endpoint
 * (POST /api/salons/:id/scan), driven with supertest against `buildApp` using a
 * faked `qrService` so NO database is required (Requirements 4.4, 4.5).
 *
 * A request carrying the campaign source param records a `QrScanEvent` via
 * `qrService.recordScan`; a request with no source param records nothing.
 */

const TEST_ACCESS_SECRET = 'test-access-secret';

function makeServices() {
  return {
    qrService: {
      recordScan: jest.fn().mockResolvedValue(undefined),
    },
    authorizer: new Authorizer(),
  };
}

type FakeServices = ReturnType<typeof makeServices>;

function buildTestApp(fake: FakeServices) {
  return buildApp({
    services: fake as unknown as Services,
    jwtAccessSecret: TEST_ACCESS_SECRET,
  });
}

describe('POST /api/salons/:id/scan (public campaign-arrival counting)', () => {
  let fake: FakeServices;
  let app: ReturnType<typeof buildTestApp>;

  beforeEach(() => {
    fake = makeServices();
    app = buildTestApp(fake);
  });

  it('records a QrScanEvent with the campaign source from utm_source query param', async () => {
    const res = await request(app)
      .post('/api/salons/salon-1/scan')
      .query({ utm_source: 'qr' });
    expect(res.status).toBe(204);
    expect(fake.qrService.recordScan).toHaveBeenCalledTimes(1);
    expect(fake.qrService.recordScan).toHaveBeenCalledWith('salon-1', 'qr');
  });

  it('records a QrScanEvent when the source is provided via the JSON body', async () => {
    const res = await request(app)
      .post('/api/salons/salon-2/scan')
      .send({ utm_source: 'instagram' });
    expect(res.status).toBe(204);
    expect(fake.qrService.recordScan).toHaveBeenCalledWith('salon-2', 'instagram');
  });

  it('accepts the alternate `source` param name', async () => {
    const res = await request(app)
      .post('/api/salons/salon-3/scan')
      .query({ source: 'receipt' });
    expect(res.status).toBe(204);
    expect(fake.qrService.recordScan).toHaveBeenCalledWith('salon-3', 'receipt');
  });

  it('does NOT record when no campaign source param is present', async () => {
    const res = await request(app).post('/api/salons/salon-1/scan');
    expect(res.status).toBe(204);
    expect(fake.qrService.recordScan).not.toHaveBeenCalled();
  });

  it('does NOT record when the source param is empty/blank', async () => {
    const res = await request(app)
      .post('/api/salons/salon-1/scan')
      .query({ utm_source: '   ' });
    expect(res.status).toBe(204);
    expect(fake.qrService.recordScan).not.toHaveBeenCalled();
  });
});
