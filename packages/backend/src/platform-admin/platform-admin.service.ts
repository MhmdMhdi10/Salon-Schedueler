import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export interface PlatformListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  salonId?: string;
  source?: string;
  from?: Date;
  to?: Date;
}

export interface PlatformPageMeta {
  page: number;
  limit: number;
  total: number;
  pageCount: number;
}

export class PlatformAdminError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'INVALID_STATE',
    message: string,
  ) {
    super(message);
    this.name = 'PlatformAdminError';
  }
}

type AuditMetadata = Record<string, unknown>;

function pageOf(query: PlatformListQuery): { page: number; limit: number; skip: number } {
  const page = Number.isFinite(query.page) ? Math.max(1, Math.trunc(query.page!)) : 1;
  const limit = Number.isFinite(query.limit)
    ? Math.min(100, Math.max(1, Math.trunc(query.limit!)))
    : 20;
  return { page, limit, skip: (page - 1) * limit };
}

function pageMeta(page: number, limit: number, total: number): PlatformPageMeta {
  return { page, limit, total, pageCount: Math.max(1, Math.ceil(total / limit)) };
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, jsonSafe(entry)]),
    );
  }
  return value;
}

function rial(value: bigint | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function startOfUtcDay(value: Date): Date {
  const result = new Date(value);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export class PlatformAdminService {
  constructor(private readonly prisma: PrismaClient) {}

  async isActiveAdmin(id: string): Promise<boolean> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
      select: { active: true },
    });
    return admin?.active === true;
  }

  async dashboard() {
    const now = new Date();
    const today = startOfUtcDay(now);
    const thirtyDaysAgo = addUtcDays(today, -29);
    const trendStart = addUtcDays(today, -13);

    const [
      totalSalons,
      activeSalons,
      totalCustomers,
      totalStaff,
      totalAppointments,
      todayAppointments,
      pendingAppointments,
      waitingList,
      subscriptionCounts,
      appointmentRevenue,
      subscriptionRevenue,
      pendingPayments,
      pendingSubscriptionPayments,
      qrScans,
      trendAppointments,
      trendScans,
      recentSalons,
    ] = await Promise.all([
      this.prisma.salon.count(),
      this.prisma.salon.count({ where: { active: true } }),
      this.prisma.customer.count(),
      this.prisma.staffMember.count({ where: { active: true } }),
      this.prisma.appointment.count(),
      this.prisma.appointment.count({ where: { startAt: { gte: today, lt: addUtcDays(today, 1) } } }),
      this.prisma.appointment.count({ where: { status: 'pending' } }),
      this.prisma.waitlistEntry.count({ where: { status: { in: ['waiting', 'notified'] } } }),
      this.prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.payment.aggregate({
        where: { status: 'paid', createdAt: { gte: thirtyDaysAgo } },
        _sum: { amountRial: true },
      }),
      this.prisma.subscriptionPayment.aggregate({
        where: { status: 'paid', createdAt: { gte: thirtyDaysAgo } },
        _sum: { amountRial: true },
      }),
      this.prisma.payment.count({ where: { status: 'pending' } }),
      this.prisma.subscriptionPayment.count({ where: { status: 'pending' } }),
      this.prisma.qrScanEvent.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.appointment.findMany({
        where: { createdAt: { gte: trendStart } },
        select: { createdAt: true },
      }),
      this.prisma.qrScanEvent.findMany({
        where: { createdAt: { gte: trendStart } },
        select: { createdAt: true },
      }),
      this.prisma.salon.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          active: true,
          createdAt: true,
          subscription: { select: { status: true, planKind: true, expiresAt: true } },
        },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const row of subscriptionCounts) counts[row.status] = row._count._all;

    const trend = Array.from({ length: 14 }, (_, index) => {
      const date = addUtcDays(trendStart, index);
      const next = addUtcDays(date, 1);
      return {
        date: date.toISOString().slice(0, 10),
        appointments: trendAppointments.filter((row) => row.createdAt >= date && row.createdAt < next).length,
        qrScans: trendScans.filter((row) => row.createdAt >= date && row.createdAt < next).length,
      };
    });

    return {
      metrics: {
        totalSalons,
        activeSalons,
        suspendedSalons: totalSalons - activeSalons,
        totalCustomers,
        totalStaff,
        totalAppointments,
        todayAppointments,
        pendingAppointments,
        waitingList,
        qrScans30d: qrScans,
        revenue30dRial: rial(appointmentRevenue._sum.amountRial) + rial(subscriptionRevenue._sum.amountRial),
        pendingPayments: pendingPayments + pendingSubscriptionPayments,
      },
      subscriptions: counts,
      trend,
      recentSalons: recentSalons.map((salon) => ({
        ...salon,
        createdAt: salon.createdAt.toISOString(),
        subscription: salon.subscription
          ? { ...salon.subscription, expiresAt: salon.subscription.expiresAt.toISOString() }
          : null,
      })),
    };
  }

  async listSalons(query: PlatformListQuery) {
    const { page, limit, skip } = pageOf(query);
    const where: any = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { qrToken: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.status === 'active') where.active = true;
    if (query.status === 'suspended') where.active = false;
    if (query.status && ['trial', 'active', 'grace', 'expired'].includes(query.status)) {
      where.subscription = { status: query.status };
    }

    const [total, rows] = await Promise.all([
      this.prisma.salon.count({ where }),
      this.prisma.salon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          qrToken: true,
          timezone: true,
          active: true,
          createdAt: true,
          subscription: { select: { status: true, planKind: true, expiresAt: true } },
          staffMembers: {
            where: { role: 'Owner' },
            take: 1,
            select: { fullName: true, phone: true },
          },
          _count: { select: { staffMembers: true, services: true, appointments: true, waitlistEntries: true, qrScanEvents: true } },
        },
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        qrToken: row.qrToken,
        timezone: row.timezone,
        active: row.active,
        createdAt: row.createdAt.toISOString(),
        owner: row.staffMembers[0] ?? null,
        subscription: row.subscription
          ? { ...row.subscription, expiresAt: row.subscription.expiresAt.toISOString() }
          : null,
        counts: row._count,
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  async getSalon(id: string) {
    const salon = await this.prisma.salon.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        qrToken: true,
        timezone: true,
        active: true,
        autoApprove: true,
        bookingWindowDays: true,
        brandAccent: true,
        createdAt: true,
        subscription: { select: { status: true, planKind: true, startedAt: true, expiresAt: true, graceUntil: true } },
        staffMembers: { orderBy: { fullName: 'asc' }, select: { id: true, fullName: true, phone: true, role: true, active: true } },
        _count: { select: { services: true, chairs: true, appointments: true, waitlistEntries: true, qrScanEvents: true } },
      },
    });
    if (!salon) throw new PlatformAdminError('NOT_FOUND', 'Salon not found');
    return {
      ...salon,
      createdAt: salon.createdAt.toISOString(),
      subscription: salon.subscription
        ? {
            ...salon.subscription,
            startedAt: salon.subscription.startedAt.toISOString(),
            expiresAt: salon.subscription.expiresAt.toISOString(),
            graceUntil: iso(salon.subscription.graceUntil),
          }
        : null,
    };
  }

  /**
   * Detail payload used by the TGP-style record file screen. Relations are
   * intentionally bounded so opening a record never turns into an unbounded
   * tenant export.
   */
  async getDetail(resource: string, id: string) {
    let record: unknown;
    switch (resource) {
      case 'salons':
        record = await this.getSalon(id);
        break;
      case 'customers':
        record = await this.prisma.customer.findUnique({
          where: { id },
          include: {
            preferredStaff: { select: { id: true, fullName: true, role: true } },
            appointments: {
              orderBy: { startAt: 'desc' },
              take: 24,
              include: {
                salon: { select: { id: true, name: true } },
                staffMember: { select: { id: true, fullName: true } },
                service: { select: { id: true, name: true, priceRial: true } },
              },
            },
            waitlistEntries: {
              orderBy: { createdAt: 'desc' },
              take: 24,
              include: {
                salon: { select: { id: true, name: true } },
                service: { select: { id: true, name: true } },
              },
            },
            customerNotes: {
              orderBy: { createdAt: 'desc' },
              take: 24,
              include: { author: { select: { id: true, fullName: true } } },
            },
          },
        });
        break;
      case 'staff':
        record = await this.prisma.staffMember.findUnique({
          where: { id },
          include: {
            salon: { select: { id: true, name: true, active: true } },
            serviceStaff: { include: { service: { select: { id: true, name: true } } } },
            appointments: {
              orderBy: { startAt: 'desc' },
              take: 24,
              include: {
                salon: { select: { id: true, name: true } },
                customer: { select: { id: true, fullName: true, phone: true } },
                service: { select: { id: true, name: true } },
              },
            },
          },
        });
        break;
      case 'appointments':
        record = await this.prisma.appointment.findUnique({
          where: { id },
          include: {
            salon: { select: { id: true, name: true, timezone: true, active: true } },
            customer: { select: { id: true, fullName: true, phone: true, noShowCount: true } },
            staffMember: { select: { id: true, fullName: true, role: true, active: true } },
            chair: { select: { id: true, name: true, active: true } },
            service: { select: { id: true, name: true, durationMin: true, bufferMin: true, priceRial: true, requiresDeposit: true, depositRial: true } },
            payments: { orderBy: { createdAt: 'desc' } },
          },
        });
        break;
      case 'subscriptions':
        record = await this.prisma.subscription.findUnique({
          where: { id },
          include: {
            salon: { select: { id: true, name: true, active: true, timezone: true } },
            payments: { orderBy: { createdAt: 'desc' } },
          },
        });
        break;
      case 'payments': {
        const appointmentPayment = await this.prisma.payment.findUnique({
          where: { id },
          include: {
            appointment: {
              include: {
                salon: { select: { id: true, name: true } },
                customer: { select: { id: true, fullName: true, phone: true } },
                staffMember: { select: { id: true, fullName: true } },
                service: { select: { id: true, name: true, priceRial: true } },
              },
            },
          },
        });
        if (appointmentPayment) {
          record = { kind: 'appointment', ...appointmentPayment };
          break;
        }
        const subscriptionPayment = await this.prisma.subscriptionPayment.findUnique({
          where: { id },
          include: {
            subscription: { include: { salon: { select: { id: true, name: true, active: true } } } },
          },
        });
        record = subscriptionPayment ? { kind: 'subscription', ...subscriptionPayment } : null;
        break;
      }
      case 'waitlist':
        record = await this.prisma.waitlistEntry.findUnique({
          where: { id },
          include: {
            salon: { select: { id: true, name: true, active: true } },
            customer: { select: { id: true, fullName: true, phone: true, noShowCount: true } },
            service: { select: { id: true, name: true, durationMin: true, priceRial: true } },
          },
        });
        break;
      case 'qr-scans':
        record = await this.prisma.qrScanEvent.findUnique({
          where: { id },
          include: { salon: { select: { id: true, name: true, active: true, qrToken: true } } },
        });
        break;
      case 'audit-logs':
        record = await this.prisma.platformAuditLog.findUnique({
          where: { id },
          include: { admin: { select: { id: true, fullName: true, phone: true, role: true, active: true } } },
        });
        break;
      default:
        throw new PlatformAdminError('NOT_FOUND', 'Resource not found');
    }
    if (!record) throw new PlatformAdminError('NOT_FOUND', 'Record not found');
    return { resource, record: jsonSafe(record) };
  }

  async setSalonActive(id: string, active: boolean, adminId: string) {
    const current = await this.prisma.salon.findUnique({ where: { id }, select: { active: true } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Salon not found');
    const salon = await this.prisma.salon.update({ where: { id }, data: { active } });
    await this.recordAudit(adminId, active ? 'salon.activate' : 'salon.suspend', 'salon', id, {
      previousActive: current.active,
      active,
    });
    return { id: salon.id, active: salon.active };
  }

  async listCustomers(query: PlatformListQuery) {
    const { page, limit, skip } = pageOf(query);
    const where: any = query.search
      ? {
          OR: [
            { phone: { contains: query.search } },
            { fullName: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          phone: true,
          fullName: true,
          noShowCount: true,
          _count: { select: { appointments: true, waitlistEntries: true } },
        },
      }),
    ]);
    return { data: rows, meta: pageMeta(page, limit, total) };
  }

  async listStaff(query: PlatformListQuery) {
    const { page, limit, skip } = pageOf(query);
    const where: any = {};
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { salon: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.status === 'active') where.active = true;
    if (query.status === 'inactive') where.active = false;
    if (['Owner', 'Admin', 'Stylist'].includes(query.status ?? '')) where.role = query.status;
    const [total, rows] = await Promise.all([
      this.prisma.staffMember.count({ where }),
      this.prisma.staffMember.findMany({
        where,
        orderBy: { fullName: 'asc' },
        skip,
        take: limit,
        select: { id: true, fullName: true, phone: true, role: true, active: true, salon: { select: { id: true, name: true } } },
      }),
    ]);
    return { data: rows, meta: pageMeta(page, limit, total) };
  }

  async setStaffActive(id: string, active: boolean, adminId: string) {
    const current = await this.prisma.staffMember.findUnique({ where: { id }, select: { active: true, salonId: true } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Staff member not found');
    const staff = await this.prisma.staffMember.update({ where: { id }, data: { active } });
    await this.recordAudit(adminId, active ? 'staff.activate' : 'staff.deactivate', 'staff', id, {
      previousActive: current.active,
      active,
      salonId: current.salonId,
    });
    return { id: staff.id, active: staff.active };
  }

  async listAppointments(query: PlatformListQuery) {
    const { page, limit, skip } = pageOf(query);
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.source) where.source = query.source;
    if (query.salonId) where.salonId = query.salonId;
    if (query.from || query.to) where.startAt = { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lt: query.to } : {}) };
    if (query.search) {
      where.OR = [
        { customer: { phone: { contains: query.search } } },
        { customer: { fullName: { contains: query.search, mode: 'insensitive' } } },
        { salon: { name: { contains: query.search, mode: 'insensitive' } } },
        { service: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        orderBy: { startAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          source: true,
          createdAt: true,
          salon: { select: { id: true, name: true } },
          customer: { select: { id: true, fullName: true, phone: true } },
          staffMember: { select: { id: true, fullName: true } },
          service: { select: { id: true, name: true, priceRial: true } },
          _count: { select: { payments: true } },
        },
      }),
    ]);
    return {
      data: rows.map((row) => ({
        ...row,
        startAt: row.startAt.toISOString(),
        endAt: row.endAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        service: { ...row.service, priceRial: rial(row.service.priceRial) },
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  async listSubscriptions(query: PlatformListQuery) {
    const { page, limit, skip } = pageOf(query);
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.search) where.salon = { name: { contains: query.search, mode: 'insensitive' } };
    const [total, rows] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        orderBy: { expiresAt: 'asc' },
        skip,
        take: limit,
        select: { id: true, status: true, planKind: true, startedAt: true, expiresAt: true, graceUntil: true, salon: { select: { id: true, name: true, active: true } } },
      }),
    ]);
    return {
      data: rows.map((row) => ({ ...row, startedAt: row.startedAt.toISOString(), expiresAt: row.expiresAt.toISOString(), graceUntil: iso(row.graceUntil) })),
      meta: pageMeta(page, limit, total),
    };
  }

  async listPayments(query: PlatformListQuery) {
    const { page, limit } = pageOf(query);
    const paymentWhere: any = {};
    const subscriptionPaymentWhere: any = {};
    if (query.status) {
      paymentWhere.status = query.status;
      subscriptionPaymentWhere.status = query.status;
    }
    if (query.salonId) {
      paymentWhere.appointment = { salonId: query.salonId };
      subscriptionPaymentWhere.subscription = { salonId: query.salonId };
    }
    const [appointmentTotal, subscriptionTotal, appointmentRows, subscriptionRows] = await Promise.all([
      this.prisma.payment.count({ where: paymentWhere }),
      this.prisma.subscriptionPayment.count({ where: subscriptionPaymentWhere }),
      this.prisma.payment.findMany({
        where: paymentWhere,
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { id: true, amountRial: true, status: true, gateway: true, refId: true, createdAt: true, appointment: { select: { id: true, salon: { select: { id: true, name: true } }, customer: { select: { fullName: true, phone: true } }, service: { select: { name: true } } } } },
      }),
      this.prisma.subscriptionPayment.findMany({
        where: subscriptionPaymentWhere,
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { id: true, amountRial: true, status: true, gateway: true, refId: true, createdAt: true, planKind: true, subscription: { select: { salon: { select: { id: true, name: true } } } } },
      }),
    ]);
    const rows = [
      ...appointmentRows.map((row) => ({ id: row.id, kind: 'appointment' as const, amountRial: rial(row.amountRial), status: row.status, gateway: row.gateway, refId: row.refId, createdAt: row.createdAt.toISOString(), salon: row.appointment.salon, subject: row.appointment.service.name, customer: row.appointment.customer })),
      ...subscriptionRows.map((row) => ({ id: row.id, kind: 'subscription' as const, amountRial: rial(row.amountRial), status: row.status, gateway: row.gateway, refId: row.refId, createdAt: row.createdAt.toISOString(), salon: row.subscription.salon, subject: row.planKind, customer: null })),
    ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const total = appointmentTotal + subscriptionTotal;
    const start = (page - 1) * limit;
    return { data: rows.slice(start, start + limit), meta: pageMeta(page, limit, total) };
  }

  async listWaitlist(query: PlatformListQuery) {
    const { page, limit, skip } = pageOf(query);
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.salonId) where.salonId = query.salonId;
    if (query.search) {
      where.OR = [
        { customer: { phone: { contains: query.search } } },
        { customer: { fullName: { contains: query.search, mode: 'insensitive' } } },
        { salon: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.waitlistEntry.count({ where }),
      this.prisma.waitlistEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: { id: true, status: true, windowStart: true, windowEnd: true, createdAt: true, salon: { select: { id: true, name: true } }, customer: { select: { fullName: true, phone: true } }, service: { select: { name: true } } },
      }),
    ]);
    return { data: rows.map((row) => ({ ...row, windowStart: row.windowStart.toISOString(), windowEnd: row.windowEnd.toISOString(), createdAt: row.createdAt.toISOString() })), meta: pageMeta(page, limit, total) };
  }

  async listQrScans(query: PlatformListQuery) {
    const { page, limit, skip } = pageOf(query);
    const where: any = {};
    if (query.salonId) where.salonId = query.salonId;
    if (query.search) where.OR = [{ source: { contains: query.search, mode: 'insensitive' } }, { salon: { name: { contains: query.search, mode: 'insensitive' } } }];
    const [total, rows] = await Promise.all([
      this.prisma.qrScanEvent.count({ where }),
      this.prisma.qrScanEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit, select: { id: true, source: true, createdAt: true, salon: { select: { id: true, name: true } } } }),
    ]);
    return { data: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })), meta: pageMeta(page, limit, total) };
  }

  async listAuditLogs(query: PlatformListQuery) {
    const { page, limit, skip } = pageOf(query);
    const where: any = {};
    if (query.search) where.OR = [{ action: { contains: query.search, mode: 'insensitive' } }, { entityType: { contains: query.search, mode: 'insensitive' } }];
    const [total, rows] = await Promise.all([
      this.prisma.platformAuditLog.count({ where }),
      this.prisma.platformAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit, select: { id: true, action: true, entityType: true, entityId: true, metadata: true, createdAt: true, admin: { select: { id: true, fullName: true, phone: true } } } }),
    ]);
    return { data: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })), meta: pageMeta(page, limit, total) };
  }

  async completeAppointment(id: string, adminId: string) {
    const current = await this.prisma.appointment.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Appointment not found');
    if (current.status !== 'confirmed') throw new PlatformAdminError('INVALID_STATE', 'Only confirmed appointments can be completed');
    const appointment = await this.prisma.appointment.update({ where: { id }, data: { status: 'completed' } });
    await this.recordAudit(adminId, 'appointment.complete', 'appointment', id, { previousStatus: current.status });
    return appointment;
  }

  async recordAudit(adminId: string, action: string, entityType: string, entityId?: string, metadata?: AuditMetadata) {
    await this.prisma.platformAuditLog.create({
      data: {
        id: randomUUID(),
        adminId,
        action,
        entityType,
        ...(entityId ? { entityId } : {}),
        ...(metadata ? { metadata: metadata as any } : {}),
      },
    });
  }
}
