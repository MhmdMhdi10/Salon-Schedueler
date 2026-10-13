import type { SmsProvider, SmsTemplateProvider, SmsDeliveryResult } from '../auth/sms-provider.interface.js';
import type { OtpProvider, OtpDeliveryResult } from '../auth/otp-provider.interface.js';
import type { RabbitMqSmsPublisher } from './sms-queue.js';
import { randomUUID } from 'node:crypto';
import type { SmsDeliveryStore } from './sms-delivery-store.js';

/**
 * An {@link SmsProvider} that makes SMS reliable by publishing each message to a
 * durable RabbitMQ queue (publisher confirms + persistent messages) instead of
 * sending it inline. A separate worker consumes the queue and performs the
 * actual provider delivery with retry + dead-lettering.
 *
 * Drop-in: it implements `SmsProvider`, so `AuthService`/`NotificationService`
 * are unchanged — a `{ ok: true, queued: true }` here means the broker durably
 * accepted the job; final handset delivery remains provider dependent.
 * If the broker is momentarily unreachable, it **falls back to a
 * direct send** through the real provider so an SMS is never lost.
 */
export class QueueingSmsProvider implements SmsProvider {
  private readonly publisher: RabbitMqSmsPublisher;
  private readonly fallback: SmsProvider;
  private readonly store?: SmsDeliveryStore;

  constructor(publisher: RabbitMqSmsPublisher, fallback: SmsProvider, store?: SmsDeliveryStore) {
    this.publisher = publisher;
    this.fallback = fallback;
    this.store = store;
  }

  async send(phone: string, message: string, options?: { expiresAt?: Date }): Promise<SmsDeliveryResult> {
    const id = randomUUID();
    let tracked = false;
    if (this.store) {
      try {
        await this.store.create(id, phone, this.publisher.maxAttempts);
        tracked = true;
      } catch (error) {
        console.error('[sms-queue] delivery record could not be created', error);
      }
    }
    const queued = await this.publisher.publish({ id: tracked ? id : undefined, to: phone, message, expiresAt: options?.expiresAt?.toISOString() });
    if (queued) {
      return { ok: true, providerId: 'rabbitmq', queued: true };
    }
    // Broker unavailable — deliver directly so the message is not dropped.
    let result: SmsDeliveryResult;
    try {
      result = await this.fallback.send(phone, message);
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (tracked && this.store) {
      try {
        await this.store.recordAttempt(id, 1, result);
        await this.store.update(id, result.ok
          ? { status: 'accepted', attempts: 1, maxAttempts: 1, providerId: result.providerId }
          : { status: 'failed', attempts: 1, maxAttempts: 1, error: result.error });
      } catch (error) {
        // Reporting must never turn an accepted provider response into a retry.
        console.error('[sms-queue] direct delivery could not be recorded', error);
      }
    }
    return result;
  }
}

/** Queue shared-template messages, including OTPs, through the same tracked worker. */
export class QueueingTemplateProvider implements SmsTemplateProvider, OtpProvider {
  constructor(
    private readonly publisher: RabbitMqSmsPublisher,
    private readonly fallback: SmsTemplateProvider,
    private readonly otpBodyId: number,
    private readonly store?: SmsDeliveryStore,
  ) {}

  async sendOtp(phone: string, code?: string, options?: { expiresAt?: Date }): Promise<OtpDeliveryResult> {
    if (!code || !/^\d{4}$/.test(code)) return { ok: false, error: 'OTP code must contain exactly 4 digits' };
    const result = await this.queueTemplate(phone, this.otpBodyId, [code], options?.expiresAt);
    return result.ok ? { ...result, code } : result;
  }

  async sendTemplate(phone: string, bodyId: number, args: string[]): Promise<SmsDeliveryResult> {
    return this.queueTemplate(phone, bodyId, args);
  }

  private async queueTemplate(phone: string, bodyId: number, args: string[], expiresAt?: Date): Promise<SmsDeliveryResult> {
    if (!Number.isInteger(bodyId) || bodyId <= 0 || !Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
      return { ok: false, error: 'Invalid SMS template request' };
    }
    const id = randomUUID();
    let tracked = false;
    if (this.store) {
      try {
        await this.store.create(id, phone, this.publisher.maxAttempts);
        tracked = true;
      } catch (error) {
        console.error('[sms-queue] template delivery record could not be created', error);
      }
    }
    const queued = await this.publisher.publish({ id: tracked ? id : undefined, to: phone, message: '', template: { bodyId, args }, expiresAt: expiresAt?.toISOString() });
    if (queued) return { ok: true, providerId: 'rabbitmq', queued: true };

    let result: SmsDeliveryResult;
    try {
      result = await this.fallback.sendTemplate(phone, bodyId, args);
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (tracked && this.store) {
      try {
        await this.store.recordAttempt(id, 1, result);
        await this.store.update(id, result.ok
          ? { status: 'accepted', attempts: 1, maxAttempts: 1, providerId: result.providerId }
          : { status: 'failed', attempts: 1, maxAttempts: 1, error: result.error });
      } catch (error) {
        console.error('[sms-queue] direct template delivery could not be recorded', error);
      }
    }
    return result;
  }
}

/** Record legacy provider-generated OTPs without retaining their codes. */
export class TrackingOtpProvider implements OtpProvider {
  constructor(private readonly provider: OtpProvider, private readonly store: SmsDeliveryStore) {}

  async sendOtp(phone: string, code?: string, options?: { expiresAt?: Date }): Promise<OtpDeliveryResult> {
    const id = randomUUID();
    let tracked = false;
    try {
      await this.store.create(id, phone, 1);
      tracked = true;
    } catch (error) {
      console.error('[sms-queue] legacy OTP record could not be created', error);
    }
    let result: OtpDeliveryResult;
    try {
      result = await this.provider.sendOtp(phone, code, options);
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (tracked) {
      try {
        await this.store.recordAttempt(id, 1, result.ok
          ? { ok: true, providerId: result.providerId }
          : { ok: false, error: result.error });
        await this.store.update(id, result.ok
          ? { status: 'accepted', attempts: 1, providerId: result.providerId }
          : { status: 'failed', attempts: 1, error: result.error });
      } catch (error) {
        console.error('[sms-queue] legacy OTP result could not be recorded', error);
      }
    }
    return result;
  }
}
