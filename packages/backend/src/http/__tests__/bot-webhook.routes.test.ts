import request from 'supertest';
import { buildApp, type Services } from '../app.js';
import { Authorizer } from '../../auth/index.js';

/**
 * Route-level tests for the public bot webhook endpoints
 * (POST /api/bots/telegram/:secret and /api/bots/bale/:secret), driven with
 * supertest against `buildApp` using a faked `botService` so NO database is
 * required (Requirements 1.1, 1.6, 8.1).
 *
 * Contract:
 * - valid secret → 200 and `botService.handleUpdate(platform, body)` invoked.
 * - invalid/missing secret → 403 and NOT dispatched.
 * - internal processing failure → still 200 (no retry storms).
 */

const TEST_ACCESS_SECRET = 'test-access-secret';
const WEBHOOK_SECRET = 'super-secret-path';

function makeServices() {
  return {
    botService: {
      handleUpdate: jest.fn().mockResolvedValue(true),
    },
    authorizer: new Authorizer(),
  };
}

type FakeServices = ReturnType<typeof makeServices>;

function buildTestApp(fake: FakeServices, secret: string | undefined = WEBHOOK_SECRET) {
  return buildApp({
    services: fake as unknown as Services,
    jwtAccessSecret: TEST_ACCESS_SECRET,
    botWebhookSecret: secret,
  });
}

describe('POST /api/bots/:platform/:secret (public bot webhooks)', () => {
  let fake: FakeServices;
  let app: ReturnType<typeof buildTestApp>;

  beforeEach(() => {
    fake = makeServices();
    app = buildTestApp(fake);
  });

  it('returns 200 and dispatches the Telegram update on a valid secret', async () => {
    const body = { message: { chat: { id: 42 }, text: 'سلام' } };
    const res = await request(app)
      .post(`/api/bots/telegram/${WEBHOOK_SECRET}`)
      .send(body);

    expect(res.status).toBe(200);
    expect(fake.botService.handleUpdate).toHaveBeenCalledTimes(1);
    expect(fake.botService.handleUpdate).toHaveBeenCalledWith('telegram', body);
  });

  it('returns 200 and dispatches the Bale update on a valid secret', async () => {
    const body = { callback_query: { data: 'svc:1', message: { chat: { id: 7 } } } };
    const res = await request(app)
      .post(`/api/bots/bale/${WEBHOOK_SECRET}`)
      .send(body);

    expect(res.status).toBe(200);
    expect(fake.botService.handleUpdate).toHaveBeenCalledWith('bale', body);
  });

  it('rejects an invalid secret with 403 and does NOT dispatch', async () => {
    const res = await request(app)
      .post('/api/bots/telegram/wrong-secret')
      .send({ message: { chat: { id: 1 } } });

    expect(res.status).toBe(403);
    expect(fake.botService.handleUpdate).not.toHaveBeenCalled();
  });

  it('rejects with 403 when no webhook secret is configured', async () => {
    const appNoSecret = buildTestApp(fake, undefined);
    const res = await request(appNoSecret)
      .post('/api/bots/telegram/anything')
      .send({ message: { chat: { id: 1 } } });

    expect(res.status).toBe(403);
    expect(fake.botService.handleUpdate).not.toHaveBeenCalled();
  });

  it('still returns 200 when internal processing fails (no retry storms)', async () => {
    fake.botService.handleUpdate.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app)
      .post(`/api/bots/telegram/${WEBHOOK_SECRET}`)
      .send({ message: { chat: { id: 1 } } });

    expect(res.status).toBe(200);
    expect(fake.botService.handleUpdate).toHaveBeenCalledTimes(1);
  });
});
