import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { consumeSmsQueue, SMS_RETRY_QUEUE } from './sms-queue';
import type { SmsDeliveryStore } from './sms-delivery-store';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function message(attempts: number): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify({ id: 'job-1', to: '09123456789', message: 'test' })),
    properties: { headers: { 'x-attempts': attempts } },
  } as unknown as ConsumeMessage;
}

function verificationMessage(attempts: number, checks = 0): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify({ id: 'job-1', to: '09123456789', message: 'test', verifyProviderId: 'provider-1', statusChecks: checks })),
    properties: { headers: { 'x-attempts': attempts } },
  } as unknown as ConsumeMessage;
}

function templateMessage(attempts: number): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify({ id: 'job-1', to: '09123456789', message: '', template: { bodyId: 123, args: ['1234'] } })),
    properties: { headers: { 'x-attempts': attempts } },
  } as unknown as ConsumeMessage;
}

it('confirms retry before ack and records acceptance on the second attempt', async () => {
  let consumer: ((message: ConsumeMessage | null) => void) | undefined;
  const calls: string[] = [];
  const channel = {
    assertExchange: jest.fn().mockResolvedValue(undefined),
    assertQueue: jest.fn().mockResolvedValue(undefined),
    bindQueue: jest.fn().mockResolvedValue(undefined),
    prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn(async (_queue, callback) => { consumer = callback; return { consumerTag: 'test' }; }),
    sendToQueue: jest.fn(() => { calls.push('publish retry'); return true; }),
    waitForConfirms: jest.fn(async () => { calls.push('confirm retry'); }),
    ack: jest.fn(() => { calls.push('ack'); }),
    nack: jest.fn(),
  } as unknown as ConfirmChannel;
  const store = { update: jest.fn().mockResolvedValue(undefined), recordAttempt: jest.fn().mockResolvedValue(undefined) } as unknown as SmsDeliveryStore;
  const provider = { send: jest.fn().mockResolvedValueOnce({ ok: false, error: 'timeout' }).mockResolvedValueOnce({ ok: true, providerId: 'provider-1' }) };
  await consumeSmsQueue(channel, provider, { maxAttempts: 3, retryDelayMs: 1000 }, { log: jest.fn(), error: jest.fn() }, store);

  consumer!(message(0));
  await flush();
  expect(channel.sendToQueue).toHaveBeenCalledWith(SMS_RETRY_QUEUE, expect.any(Buffer), expect.objectContaining({ headers: expect.objectContaining({ 'x-attempts': 1 }) }));
  expect(calls).toEqual(['publish retry', 'confirm retry', 'ack']);
  expect(store.update).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'retrying', attempts: 1 }));
  expect(store.recordAttempt).toHaveBeenCalledWith('job-1', 1, { ok: false, error: 'timeout' });

  consumer!(message(1));
  await flush();
  expect(provider.send).toHaveBeenCalledTimes(2);
  expect(store.update).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'accepted', attempts: 2, providerId: 'provider-1' }));
  expect(store.recordAttempt).toHaveBeenCalledWith('job-1', 2, { ok: true, providerId: 'provider-1' });
  expect(channel.ack).toHaveBeenCalledTimes(2);
});

it('dead letters after the configured attempt limit', async () => {
  let consumer: ((message: ConsumeMessage | null) => void) | undefined;
  const channel = {
    assertExchange: jest.fn().mockResolvedValue(undefined), assertQueue: jest.fn().mockResolvedValue(undefined),
    bindQueue: jest.fn().mockResolvedValue(undefined), prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn(async (_queue, callback) => { consumer = callback; return { consumerTag: 'test' }; }),
    sendToQueue: jest.fn(), waitForConfirms: jest.fn(), ack: jest.fn(), nack: jest.fn(),
  } as unknown as ConfirmChannel;
  const store = { update: jest.fn().mockResolvedValue(undefined), recordAttempt: jest.fn().mockResolvedValue(undefined) } as unknown as SmsDeliveryStore;
  await consumeSmsQueue(channel, { send: async () => ({ ok: false as const, error: 'rejected' }) }, { maxAttempts: 2 }, { log: jest.fn(), error: jest.fn() }, store);
  consumer!(message(1));
  await flush();
  expect(store.update).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'failed', attempts: 2 }));
  expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  expect(channel.sendToQueue).not.toHaveBeenCalled();
});

it('checks carrier delivery and retries only a confirmed carrier failure', async () => {
  let consumer: ((message: ConsumeMessage | null) => void) | undefined;
  const channel = {
    assertExchange: jest.fn().mockResolvedValue(undefined), assertQueue: jest.fn().mockResolvedValue(undefined),
    bindQueue: jest.fn().mockResolvedValue(undefined), prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn(async (_queue, callback) => { consumer = callback; return { consumerTag: 'test' }; }),
    sendToQueue: jest.fn(), waitForConfirms: jest.fn().mockResolvedValue(undefined), ack: jest.fn(), nack: jest.fn(),
  } as unknown as ConfirmChannel;
  const store = { update: jest.fn().mockResolvedValue(undefined), recordAttempt: jest.fn().mockResolvedValue(undefined) } as unknown as SmsDeliveryStore;
  const provider = {
    send: jest.fn().mockResolvedValue({ ok: true, providerId: 'provider-1' }),
    getDeliveryStatus: jest.fn().mockResolvedValueOnce('failed').mockResolvedValueOnce('delivered'),
  };
  await consumeSmsQueue(channel, provider, { maxAttempts: 3, retryDelayMs: 1000 }, { log: jest.fn(), error: jest.fn() }, store);

  consumer!(verificationMessage(1));
  await flush();
  expect(provider.send).not.toHaveBeenCalled();
  expect(store.update).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'retrying', attempts: 1 }));
  expect(channel.sendToQueue).toHaveBeenCalledWith(SMS_RETRY_QUEUE, expect.any(Buffer), expect.objectContaining({ headers: expect.objectContaining({ 'x-attempts': 1 }) }));

  consumer!(message(1));
  await flush();
  expect(provider.send).toHaveBeenCalledTimes(1);
  expect(channel.sendToQueue).toHaveBeenCalledTimes(2);
  expect(store.update).toHaveBeenCalledWith('job-1', expect.objectContaining({
    status: 'accepted', providerId: 'provider-1', nextRetryAt: expect.any(Date),
  }));

  consumer!(verificationMessage(2));
  await flush();
  expect(store.update).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'delivered' }));
  expect(provider.send).toHaveBeenCalledTimes(1);
});

it('ends a scheduled status check if the provider no longer exposes delivery reports', async () => {
  let consumer: ((message: ConsumeMessage | null) => void) | undefined;
  const channel = {
    assertExchange: jest.fn().mockResolvedValue(undefined), assertQueue: jest.fn().mockResolvedValue(undefined),
    bindQueue: jest.fn().mockResolvedValue(undefined), prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn(async (_queue, callback) => { consumer = callback; return { consumerTag: 'test' }; }),
    ack: jest.fn(), nack: jest.fn(),
  } as unknown as ConfirmChannel;
  const store = { update: jest.fn().mockResolvedValue(undefined) } as unknown as SmsDeliveryStore;
  const provider = { send: jest.fn() };
  await consumeSmsQueue(channel, provider, {}, { log: jest.fn(), error: jest.fn() }, store);

  consumer!(verificationMessage(1));
  await flush();
  expect(store.update).toHaveBeenCalledWith('job-1', { status: 'accepted', nextRetryAt: null });
  expect(channel.ack).toHaveBeenCalledTimes(1);
  expect(provider.send).not.toHaveBeenCalled();
});

it('retries shared templates through the template provider', async () => {
  let consumer: ((message: ConsumeMessage | null) => void) | undefined;
  const channel = {
    assertExchange: jest.fn().mockResolvedValue(undefined), assertQueue: jest.fn().mockResolvedValue(undefined),
    bindQueue: jest.fn().mockResolvedValue(undefined), prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn(async (_queue, callback) => { consumer = callback; return { consumerTag: 'test' }; }),
    sendToQueue: jest.fn(), waitForConfirms: jest.fn().mockResolvedValue(undefined), ack: jest.fn(), nack: jest.fn(),
  } as unknown as ConfirmChannel;
  const smsProvider = { send: jest.fn() };
  const templateProvider = { sendTemplate: jest.fn().mockResolvedValueOnce({ ok: false, error: 'timeout' }).mockResolvedValueOnce({ ok: true, providerId: 'provider-2' }) };
  const store = { update: jest.fn().mockResolvedValue(undefined), recordAttempt: jest.fn().mockResolvedValue(undefined) } as unknown as SmsDeliveryStore;
  await consumeSmsQueue(channel, smsProvider, { maxAttempts: 3 }, { log: jest.fn(), error: jest.fn() }, store, templateProvider);

  consumer!(templateMessage(0));
  await flush();
  expect(templateProvider.sendTemplate).toHaveBeenCalledWith('09123456789', 123, ['1234']);
  expect(channel.sendToQueue).toHaveBeenCalledWith(SMS_RETRY_QUEUE, expect.any(Buffer), expect.objectContaining({ headers: expect.objectContaining({ 'x-attempts': 1 }) }));

  consumer!(templateMessage(1));
  await flush();
  expect(store.update).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'accepted', attempts: 2, providerId: 'provider-2' }));
  expect(smsProvider.send).not.toHaveBeenCalled();
  expect(channel.ack).toHaveBeenCalledTimes(2);
});

it('dead letters invalid queue payloads without crashing the worker', async () => {
  let consumer: ((message: ConsumeMessage | null) => void) | undefined;
  const channel = {
    assertExchange: jest.fn().mockResolvedValue(undefined), assertQueue: jest.fn().mockResolvedValue(undefined),
    bindQueue: jest.fn().mockResolvedValue(undefined), prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn(async (_queue, callback) => { consumer = callback; return { consumerTag: 'test' }; }),
    ack: jest.fn(), nack: jest.fn(),
  } as unknown as ConfirmChannel;
  const provider = { send: jest.fn() };
  await consumeSmsQueue(channel, provider, {}, { log: jest.fn(), error: jest.fn() });
  consumer!({ content: Buffer.from('null'), properties: { headers: {} } } as unknown as ConsumeMessage);
  await flush();
  expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  expect(provider.send).not.toHaveBeenCalled();
});

it('does not send an OTP after its verification window expires', async () => {
  let consumer: ((message: ConsumeMessage | null) => void) | undefined;
  const channel = {
    assertExchange: jest.fn().mockResolvedValue(undefined), assertQueue: jest.fn().mockResolvedValue(undefined),
    bindQueue: jest.fn().mockResolvedValue(undefined), prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn(async (_queue, callback) => { consumer = callback; return { consumerTag: 'test' }; }),
    ack: jest.fn(), nack: jest.fn(),
  } as unknown as ConfirmChannel;
  const provider = { send: jest.fn() };
  const store = { update: jest.fn().mockResolvedValue(undefined) } as unknown as SmsDeliveryStore;
  await consumeSmsQueue(channel, provider, {}, { log: jest.fn(), error: jest.fn() }, store);

  const expired = message(1);
  expired.content = Buffer.from(JSON.stringify({ id: 'job-1', to: '09123456789', message: '1234', expiresAt: new Date(Date.now() - 1000).toISOString() }));
  consumer!(expired);
  await flush();
  expect(provider.send).not.toHaveBeenCalled();
  expect(store.update).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'failed', attempts: 1 }));
  expect(channel.ack).toHaveBeenCalledWith(expired);
});
