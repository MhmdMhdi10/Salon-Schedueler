import type { Request, Response, NextFunction } from 'express';
import { requireActiveSubscription } from './require-subscription.js';
import type { SubscriptionStatus } from '../../subscription/index.js';

/**
 * Unit tests for the subscription-gating middleware (Requirements 3.8, 3.9,
 * Property 8: reads allowed on expired, writes blocked).
 */

interface MockRes {
  statusCode?: number;
  body?: unknown;
  status: jest.Mock;
  json: jest.Mock;
}

function makeRes(): MockRes {
  const res: Partial<MockRes> = {};
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res as MockRes;
  });
  res.json = jest.fn((payload: unknown) => {
    res.body = payload;
    return res as MockRes;
  });
  return res as MockRes;
}

function makeReq(method: string, salonId?: string): Request {
  return {
    method,
    params: salonId ? { salonId } : {},
    body: {},
    principal: { id: 'user-1', role: 'Owner' },
  } as unknown as Request;
}

function makeService(status: SubscriptionStatus) {
  return { getStatus: jest.fn(async () => status) };
}

describe('requireActiveSubscription', () => {
  it('blocks writes (POST) with 402 SUBSCRIPTION_REQUIRED when expired', async () => {
    const service = makeService('expired');
    const mw = requireActiveSubscription(service);
    const req = makeReq('POST', 'salon-1');
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await mw(req, res as unknown as Response, next);

    expect(service.getStatus).toHaveBeenCalledWith('salon-1');
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.body).toEqual({ code: 'SUBSCRIPTION_REQUIRED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows reads (GET) through even when expired', async () => {
    const service = makeService('expired');
    const mw = requireActiveSubscription(service);
    const req = makeReq('GET', 'salon-1');
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await mw(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each(['trial', 'active', 'grace'] as const)(
    'allows writes (POST) through when status is %s',
    async (status) => {
      const service = makeService(status);
      const mw = requireActiveSubscription(service);
      const req = makeReq('POST', 'salon-1');
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await mw(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    },
  );

  it('responds 401 UNAUTHORIZED when no principal is present', async () => {
    const service = makeService('active');
    const mw = requireActiveSubscription(service);
    const req = { method: 'POST', params: {}, body: {} } as unknown as Request;
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await mw(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ code: 'UNAUTHORIZED' });
    expect(next).not.toHaveBeenCalled();
    expect(service.getStatus).not.toHaveBeenCalled();
  });

  it('responds 400 SALON_ID_REQUIRED when no salon can be resolved', async () => {
    const service = makeService('active');
    const mw = requireActiveSubscription(service);
    const req = makeReq('POST');
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await mw(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ code: 'SALON_ID_REQUIRED' });
    expect(next).not.toHaveBeenCalled();
  });
});
