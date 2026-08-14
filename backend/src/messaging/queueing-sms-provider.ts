import type { SmsProvider, SmsDeliveryResult } from '../auth/sms-provider.interface.js';
import type { RabbitMqSmsPublisher } from './sms-queue.js';

/**
 * An {@link SmsProvider} that makes SMS reliable by publishing each message to a
 * durable RabbitMQ queue (publisher confirms + persistent messages) instead of
 * sending it inline. A separate worker consumes the queue and performs the
 * actual provider delivery with retry + dead-lettering.
 *
 * Drop-in: it implements `SmsProvider`, so `AuthService`/`NotificationService`
 * are unchanged — a `{ ok: true }` here means "durably accepted for guaranteed
 * delivery". If the broker is momentarily unreachable, it **falls back to a
 * direct send** through the real provider so an SMS is never lost.
 */
export class QueueingSmsProvider implements SmsProvider {
  private readonly publisher: RabbitMqSmsPublisher;
  private readonly fallback: SmsProvider;

  constructor(publisher: RabbitMqSmsPublisher, fallback: SmsProvider) {
    this.publisher = publisher;
    this.fallback = fallback;
  }

  async send(phone: string, message: string): Promise<SmsDeliveryResult> {
    const queued = await this.publisher.publish({ to: phone, message });
    if (queued) {
      return { ok: true, providerId: 'rabbitmq' };
    }
    // Broker unavailable — deliver directly so the message is not dropped.
    return this.fallback.send(phone, message);
  }
}
