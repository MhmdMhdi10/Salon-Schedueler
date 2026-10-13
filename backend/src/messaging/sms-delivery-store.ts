import type { PrismaClient } from '@prisma/client';

/** Operational state for each outbound SMS. Message bodies and OTPs stay out of this table. */
export class SmsDeliveryStore {
  constructor(private readonly prisma: PrismaClient) {}

  async create(id: string, phone: string, maxAttempts: number): Promise<void> {
    await this.prisma.smsDelivery.create({ data: { id, phone, maxAttempts } });
  }

  async update(id: string, data: {
    status: 'queued' | 'sending' | 'retrying' | 'accepted' | 'delivered' | 'failed';
    attempts?: number;
    maxAttempts?: number;
    providerId?: string | null;
    error?: string | null;
    nextRetryAt?: Date | null;
  }): Promise<void> {
    await this.prisma.smsDelivery.update({ where: { id }, data });
  }

  async recordAttempt(id: string, number: number, outcome: { ok: true; providerId: string } | { ok: false; error: string }): Promise<void> {
    await this.prisma.smsDeliveryAttempt.create({ data: {
      deliveryId: id,
      number,
      status: outcome.ok ? 'accepted' : 'failed',
      providerId: outcome.ok ? outcome.providerId : null,
      error: outcome.ok ? null : outcome.error,
    } });
  }
}
