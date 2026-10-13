import { loadConfig } from './config';

it('requires positive integer SMS retry settings', () => {
  expect(loadConfig({}).smsQueueMaxAttempts).toBe(5);
  expect(loadConfig({ SMS_QUEUE_MAX_ATTEMPTS: '3', SMS_QUEUE_RETRY_DELAY_MS: '15000' }).smsQueueRetryDelayMs).toBe(15000);
  expect(() => loadConfig({ SMS_QUEUE_MAX_ATTEMPTS: '0' })).toThrow('SMS_QUEUE_MAX_ATTEMPTS');
  expect(() => loadConfig({ SMS_QUEUE_RETRY_DELAY_MS: 'NaN' })).toThrow('SMS_QUEUE_RETRY_DELAY_MS');
});
