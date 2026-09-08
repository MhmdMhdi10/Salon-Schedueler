import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { CardOrderModel } from '../models/index.js';

export interface CardOrderInput {
  readonly accent?: string;
  readonly template: string;
  readonly quantity: number;
  readonly contactName: string;
  readonly phone: string;
  readonly province: string;
  readonly city: string;
  readonly address: string;
  readonly postalCode: string;
  readonly notes?: string;
  readonly printSpecs?: Record<string, unknown>;
}

export class CardOrderService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(salonId: string, input: CardOrderInput): Promise<CardOrderModel> {
    const orderNumber = `CARD-${randomUUID().slice(0, 8).toUpperCase()}`;
    const row = await this.prisma.cardOrder.create({
      data: {
        orderNumber,
        salonId,
        template: input.template,
        accent: input.accent ?? 'default',
        quantity: input.quantity,
        contactName: input.contactName,
        phone: input.phone,
        address: input.address,
        notes: input.notes ?? null,
        printSpecs: {
          ...(input.printSpecs ?? {}),
          deliveryLocation: {
            province: input.province,
            city: input.city,
            postalCode: input.postalCode,
          },
        } as Prisma.InputJsonObject,
      },
    });
    return { orderId: row.orderNumber, status: row.status };
  }

  async list(query: { status?: string; salonId?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.trunc(query.limit ?? 20)));
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.salonId ? { salonId: query.salonId } : {}),
    };
    const [total, quantityTotal, orders] = await Promise.all([
      this.prisma.cardOrder.count({ where }),
      this.prisma.cardOrder.aggregate({ where, _sum: { quantity: true } }),
      this.prisma.cardOrder.findMany({
        where,
        include: { salon: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      orders: orders.map((order) => ({
        ...order,
        quantity: order.quantity,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      })),
      page: { page, limit, total, pageCount: Math.max(1, Math.ceil(total / limit)) },
      summary: { orderCount: total, pieceCount: quantityTotal._sum.quantity ?? 0 },
    };
  }

  async updateStatus(id: string, status: string, adminId: string, note?: string) {
    const row = await this.prisma.cardOrder.update({
      where: { id },
      data: {
        status,
        handledByAdminId: adminId,
        ...(note === undefined ? {} : { notes: note }),
      },
      include: { salon: { select: { id: true, name: true } } },
    });
    return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }
}
