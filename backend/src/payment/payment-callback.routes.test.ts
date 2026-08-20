import express from 'express';
import request from 'supertest';
import type { Services } from '../http/app.js';
import { paymentCallbackRouter } from './controllers/payment.controller.js';

function makeApp() {
  const services = {
    paymentService: {
      handleCallback: jest.fn().mockResolvedValue({ confirmed: true }),
    },
    notificationService: {
      sendConfirmation: jest.fn().mockResolvedValue(undefined),
      sendSalonBookingNotice: jest.fn().mockResolvedValue(undefined),
    },
  };
  const app = express();
  app.use(express.json());
  app.use(paymentCallbackRouter(services as unknown as Services));
  return { app, services };
}

describe('payment callback route', () => {
  it('accepts Zibal GET callbacks and maps trackId/success to verification', async () => {
    const { app, services } = makeApp();

    const response = await request(app).get(
      '/payments/callback?trackId=15966442233311&success=1&status=2&orderId=appt-1',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ confirmed: true });
    expect(services.paymentService.handleCallback).toHaveBeenCalledWith({
      authority: '15966442233311',
      status: '100',
    });
    expect(services.notificationService.sendConfirmation).toHaveBeenCalledWith('appt-1');
  });

  it('marks a failed Zibal callback without attempting confirmation', async () => {
    const { app, services } = makeApp();
    services.paymentService.handleCallback.mockResolvedValueOnce({ confirmed: false });

    const response = await request(app).get(
      '/payments/callback?trackId=15966442233311&success=0&status=3',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ confirmed: false });
    expect(services.paymentService.handleCallback).toHaveBeenCalledWith({
      authority: '15966442233311',
      status: '0',
    });
    expect(services.notificationService.sendConfirmation).not.toHaveBeenCalled();
  });

  it('keeps legacy POST callback parameters working', async () => {
    const { app, services } = makeApp();

    const response = await request(app)
      .post('/payments/callback')
      .send({ Authority: 'legacy-authority', Status: 'OK' });

    expect(response.status).toBe(200);
    expect(services.paymentService.handleCallback).toHaveBeenCalledWith({
      authority: 'legacy-authority',
      status: '100',
    });
  });
});
