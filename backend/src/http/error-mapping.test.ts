import type { Response } from 'express';
import { sendDomainError } from './error-mapping.js';
import { SubscriptionDomainError } from '../subscription/subscription.service.js';

function responseStub(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('sendDomainError', () => {
  const previousQuietMode = process.env.E2E_QUIET_LOGS;

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousQuietMode === undefined) delete process.env.E2E_QUIET_LOGS;
    else process.env.E2E_QUIET_LOGS = previousQuietMode;
  });

  it('keeps unexpected internal errors observable outside quiet E2E runs', () => {
    delete process.env.E2E_QUIET_LOGS;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = responseStub();

    sendDomainError(response, new Error('unexpected failure'));

    expect(errorSpy).toHaveBeenCalledWith('[http] unhandled domain error:', expect.any(Error));
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ code: 'INTERNAL' });
  });

  it('does not print expected 500 branch stacks during quiet Cucumber runs', () => {
    process.env.E2E_QUIET_LOGS = 'true';
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = responseStub();

    sendDomainError(response, new Error('expected branch failure'));

    expect(errorSpy).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ code: 'INTERNAL' });
  });

  it('maps subscription catalogue and three-month-window errors to stable conflicts', () => {
    const response = responseStub();

    sendDomainError(response, new SubscriptionDomainError('SUBSCRIPTION_WINDOW_LIMIT_REACHED'));

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({ code: 'SUBSCRIPTION_WINDOW_LIMIT_REACHED' });
  });
});
