import type { PrismaClient } from '@prisma/client';
import { SalonClientService } from './salon-client.service';

function createPrismaMock() {
  return {
    appointment: { findMany: jest.fn() },
    customer: { upsert: jest.fn() },
    salonClient: { findMany: jest.fn(), upsert: jest.fn() },
  } as unknown as PrismaClient & {
    appointment: { findMany: jest.Mock };
    customer: { upsert: jest.Mock };
    salonClient: { findMany: jest.Mock; upsert: jest.Mock };
  };
}

describe('SalonClientService', () => {
  it('counts completed appointments as visits and keeps reservations out of history', async () => {
    const prisma = createPrismaMock();
    const completedAt = new Date('2026-08-01T10:00:00.000Z');
    prisma.salonClient.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
        customer: {
          id: 'customer-1',
          fullName: 'سارا محمدی',
          phone: '09123456789',
          noShowCount: 1,
        },
      },
    ]);
    prisma.appointment.findMany.mockResolvedValue([
      { customerId: 'customer-1', status: 'confirmed', startAt: new Date('2026-08-10T10:00:00.000Z') },
      { customerId: 'customer-1', status: 'completed', startAt: completedAt },
    ]);

    const clients = await new SalonClientService(prisma).list('salon-1');

    expect(clients).toEqual([
      {
        id: 'customer-1',
        fullName: 'سارا محمدی',
        phone: '09123456789',
        visits: 1,
        lastVisitAt: completedAt,
        noShowCount: 1,
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
      },
    ]);
    expect(prisma.salonClient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { salonId: 'salon-1' } }),
    );
  });

  it('upserts a global customer and salon membership', async () => {
    const prisma = createPrismaMock();
    prisma.customer.upsert.mockResolvedValue({
      id: 'customer-2',
      fullName: 'مریم احمدی',
      phone: '09111222333',
      noShowCount: 0,
    });
    const createdAt = new Date('2026-08-10T10:00:00.000Z');
    prisma.salonClient.upsert.mockResolvedValue({ createdAt });

    await new SalonClientService(prisma).add('salon-1', {
      fullName: 'مریم احمدی',
      phone: '09111222333',
    });

    expect(prisma.customer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phone: '09111222333' } }),
    );
    expect(prisma.salonClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { salonId_customerId: { salonId: 'salon-1', customerId: 'customer-2' } },
        create: { salonId: 'salon-1', customerId: 'customer-2' },
      }),
    );
  });
});
