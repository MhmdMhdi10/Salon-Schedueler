import type { Prisma, PrismaClient } from '@prisma/client';

export type CustomerNotificationInput = {
  customerId: string;
  appointmentId?: string;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
};

export interface CustomerNotificationHub {
  broadcastCustomer(customerId: string, event: unknown): void;
}

const toDto = (row: any) => ({
  id: row.id,
  appointmentId: row.appointmentId,
  type: row.type,
  title: row.title,
  body: row.body,
  payload: row.payload,
  readAt: row.readAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export class CustomerNotificationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly hub?: CustomerNotificationHub,
  ) {}

  async create(input: CustomerNotificationInput) {
    const row = await this.prisma.customerNotification.create({
      data: {
        customerId: input.customerId,
        appointmentId: input.appointmentId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload ? (input.payload as Prisma.InputJsonObject) : undefined,
      },
    });
    const notification = toDto(row);
    try {
      this.hub?.broadcastCustomer(input.customerId, notification);
    } catch {
      // Durable notification state must survive a transient socket failure.
    }
    return notification;
  }

  async list(customerId: string, limit = 50) {
    const rows = await this.prisma.customerNotification.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(100, Math.max(1, limit)),
    });
    return rows.map(toDto);
  }

  async markRead(customerId: string, id: string) {
    const result = await this.prisma.customerNotification.updateMany({
      where: { id, customerId },
      data: { readAt: new Date() },
    });
    return result.count > 0;
  }

  async markAllRead(customerId: string) {
    const result = await this.prisma.customerNotification.updateMany({
      where: { customerId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }
}
