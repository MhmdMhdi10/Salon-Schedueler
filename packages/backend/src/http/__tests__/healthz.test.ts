import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { createApp, type CreatedApp } from '../../composition-root.js';

/**
 * Builds the real app via the Composition_Root and drives it with supertest.
 * No database or network is required: /healthz and the /api/me stub do not query
 * the database, and the Prisma client connects lazily.
 */
describe('HTTP bootstrap (createApp)', () => {
  const TEST_ACCESS_SECRET = 'test-access-secret';
  let created: CreatedApp;

  beforeAll(() => {
    created = createApp({ jwtAccessSecret: TEST_ACCESS_SECRET });
  });

  afterAll(async () => {
    await created.prisma.$disconnect();
  });

  describe('GET /healthz', () => {
    it('returns 200 with { status: "ok" }', async () => {
      const res = await request(created.app).get('/healthz');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('auth is applied by default on protected routes (R2.3, R2.8)', () => {
    it('returns 401 UNAUTHORIZED when no token is provided', async () => {
      const res = await request(created.app).get('/api/me');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHORIZED' });
    });

    it('returns 401 UNAUTHORIZED for an invalid token', async () => {
      const res = await request(created.app)
        .get('/api/me')
        .set('Authorization', 'Bearer not-a-real-jwt');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHORIZED' });
    });

    it('attaches the principal for a valid access token', async () => {
      const token = jwt.sign(
        { sub: 'customer-123', type: 'access' },
        TEST_ACCESS_SECRET,
        { expiresIn: 60 },
      );
      const res = await request(created.app)
        .get('/api/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.principal.id).toBe('customer-123');
      // Customer tokens carry no staff role.
      expect(res.body.principal.role).toBeUndefined();
    });
  });

  describe('RBAC enforces the authorization matrix (R2.4)', () => {
    const signStaff = (claims: Record<string, unknown>): string =>
      jwt.sign(claims, TEST_ACCESS_SECRET, { expiresIn: 60 });

    it('denies a customer (no staff role) with 403 FORBIDDEN', async () => {
      const token = signStaff({ sub: 'customer-1' });
      const res = await request(created.app)
        .get('/api/admin/ping')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN' });
    });

    it('denies a Stylist attempting to configure with 403 FORBIDDEN', async () => {
      const token = signStaff({ sub: 'staff-1', role: 'Stylist', staffMemberId: 'staff-1' });
      const res = await request(created.app)
        .get('/api/admin/ping')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN' });
    });

    it('allows an Owner to configure', async () => {
      const token = signStaff({ sub: 'owner-1', role: 'Owner' });
      const res = await request(created.app)
        .get('/api/admin/ping')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });
});
