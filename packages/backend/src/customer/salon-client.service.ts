import type { PrismaClient } from '@prisma/client';

// Kept structural so the backend can be type-checked against an older generated
// client during incremental deployments; `prisma generate` exposes the same
// delegate once migration 14 is applied.
interface ClientBookDelegate {
  findMany(args: unknown): Promise<
    Array<{
      createdAt: Date;
      customer: { id: string; fullName: string | null; phone: string; noShowCount: number };
    }>
  >;
  upsert(args: unknown): Promise<{ createdAt: Date }>;
}

type PrismaWithClientBook = PrismaClient & { salonClient: ClientBookDelegate };

/** Compact client-book row used by the owner panel. */
export interface SalonClientListItem {
  id: string;
  fullName: string | null;
  phone: string;
  visits: number;
  lastVisitAt: Date | null;
  noShowCount: number;
  createdAt: Date;
}

/**
 * Salon-scoped client book.
 *
 * Customers remain global because one person may book more than one salon;
 * SalonClient is the small join that lets an owner keep a client in their book
 * before that person has an appointment.
 */
export class SalonClientService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(salonId: string, search?: string): Promise<SalonClientListItem[]> {
    const normalizedSearch = search?.trim();
    const clientBook = (this.prisma as PrismaWithClientBook).salonClient;
    const rows = await clientBook.findMany({
      where: {
        salonId,
        ...(normalizedSearch
          ? {
              customer: {
                OR: [
                  { fullName: { contains: normalizedSearch, mode: 'insensitive' } },
                  { phone: { contains: normalizedSearch } },
                ],
              },
            }
          : {}),
      },
      select: {
        createdAt: true,
        customer: {
          select: { id: true, fullName: true, phone: true, noShowCount: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const customerIds = rows.map((row) => row.customer.id);
    const appointments = customerIds.length
      ? await this.prisma.appointment.findMany({
          where: { salonId, customerId: { in: customerIds }, status: 'completed' },
          select: { customerId: true, status: true, startAt: true },
          orderBy: { startAt: 'desc' },
        })
      : [];

    const visits = new Map<string, { count: number; lastVisitAt: Date | null }>();
    for (const appointment of appointments) {
      const current = visits.get(appointment.customerId) ?? { count: 0, lastVisitAt: null };
      // A visit means a completed appointment. Pending/held/confirmed rows are
      // reservations and must not inflate the owner's client history.
      if (appointment.status === 'completed') {
        current.count += 1;
        current.lastVisitAt ??= appointment.startAt;
      }
      visits.set(appointment.customerId, current);
    }

    return rows
      .map((row) => {
        const history = visits.get(row.customer.id) ?? { count: 0, lastVisitAt: null };
        return {
          id: row.customer.id,
          fullName: row.customer.fullName,
          phone: row.customer.phone,
          visits: history.count,
          lastVisitAt: history.lastVisitAt,
          noShowCount: row.customer.noShowCount,
          createdAt: row.createdAt,
        };
      })
      .sort((a, b) => {
        const aDate = a.lastVisitAt?.getTime() ?? a.createdAt.getTime();
        const bDate = b.lastVisitAt?.getTime() ?? b.createdAt.getTime();
        return bDate - aDate;
      });
  }

  async add(
    salonId: string,
    input: { phone: string; fullName: string },
  ): Promise<SalonClientListItem> {
    const customer = await this.prisma.customer.upsert({
      where: { phone: input.phone },
      update: { fullName: input.fullName },
      create: { phone: input.phone, fullName: input.fullName },
      select: { id: true, fullName: true, phone: true, noShowCount: true },
    });

    const relation = await (this.prisma as PrismaWithClientBook).salonClient.upsert({
      where: { salonId_customerId: { salonId, customerId: customer.id } },
      update: {},
      create: { salonId, customerId: customer.id },
      select: { createdAt: true },
    });

    return {
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone,
      visits: 0,
      lastVisitAt: null,
      noShowCount: customer.noShowCount,
      createdAt: relation.createdAt,
    };
  }
}
