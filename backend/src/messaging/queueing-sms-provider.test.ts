import { QueueingSmsProvider, TrackingOtpProvider } from './queueing-sms-provider';
import type { RabbitMqSmsPublisher } from './sms-queue';
import type { SmsDeliveryStore } from './sms-delivery-store';

it('records legacy OTP acceptance without storing its code', async () => {
  const store = {
    create: jest.fn().mockResolvedValue(undefined),
    recordAttempt: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  } as unknown as SmsDeliveryStore;
  const provider = { sendOtp: jest.fn().mockResolvedValue({ ok: true, providerId: 'legacy', code: '1234' }) };

  const result = await new TrackingOtpProvider(provider, store).sendOtp('09123456789');

  expect(result).toEqual({ ok: true, providerId: 'legacy', code: '1234' });
  expect(store.create).toHaveBeenCalledWith(expect.any(String), '09123456789', 1);
  const deliveryId = (store.create as jest.Mock).mock.calls[0][0];
  expect(store.recordAttempt).toHaveBeenCalledWith(deliveryId, 1, { ok: true, providerId: 'legacy' });
  expect(store.update).toHaveBeenCalledWith(deliveryId, { status: 'accepted', attempts: 1, providerId: 'legacy' });
  expect((store.recordAttempt as jest.Mock).mock.calls[0][2]).not.toHaveProperty('code');
});

it('shows one attempt when the broker is down and direct delivery fails', async () => {
  const publisher = { maxAttempts: 5, publish: jest.fn().mockResolvedValue(false) } as unknown as RabbitMqSmsPublisher;
  const store = {
    create: jest.fn().mockResolvedValue(undefined),
    recordAttempt: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  } as unknown as SmsDeliveryStore;
  const fallback = { send: jest.fn().mockResolvedValue({ ok: false, error: 'provider unavailable' }) };

  const result = await new QueueingSmsProvider(publisher, fallback, store).send('09123456789', 'hello');

  expect(result).toEqual({ ok: false, error: 'provider unavailable' });
  const deliveryId = (store.create as jest.Mock).mock.calls[0][0];
  expect(store.update).toHaveBeenCalledWith(deliveryId, {
    status: 'failed', attempts: 1, maxAttempts: 1, error: 'provider unavailable',
  });
});
