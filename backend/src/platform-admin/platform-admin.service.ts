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

const PLATFORM_STAFF_ROLES = ['Owner', 'Admin', 'Stylist'] as const;
type PlatformStaffRole = (typeof PLATFORM_STAFF_ROLES)[number];
const SUBSCRIPTION_STATUSES = ['trial', 'active', 'grace', 'expired'] as const;
const SUBSCRIPTION_PLANS = ['trial', 'monthly', 'quarterly', 'annual'] as const;
const PAYMENT_STATUSES = ['pending', 'paid', 'refunded', 'retained', 'failed'] as const;

function normalizePhone(value: string): string {
  let phone = value.trim().replace(/[\s()-]/g, '');
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  phone = [...phone].map((digit) => {
    const persianIndex = persianDigits.indexOf(digit);
    if (persianIndex >= 0) return String(persianIndex);
    const arabicIndex = arabicDigits.indexOf(digit);
    return arabicIndex >= 0 ? String(arabicIndex) : digit;
  }).join('');
  if (phone.startsWith('+98')) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith('0098')) phone = `0${phone.slice(4)}`;
  else if (phone.startsWith('98') && phone.length === 12) phone = `0${phone.slice(2)}`;
  return phone;
}

function assertPhone(phone: string): void {
  if (!/^09\d{9}$/.test(phone)) throw new PlatformAdminError('INVALID_STATE', 'Invalid phone');
}

function assertText(value: string, max: number, message: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new PlatformAdminError('INVALID_STATE', message);
  return normalized;
}

function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
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

  async listPlatformAdmins(query: PlatformListQuery) {
    const { page, limit, skip } = pageOf(query);
    const where: any = {};
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { role: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.status === 'active') where.active = true;
    if (query.status === 'inactive') where.active = false;
    const [total, rows] = await Promise.all([
      this.prisma.platformAdmin.count({ where }),
      this.prisma.platformAdmin.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          phone: true,
          fullName: true,
          role: true,
          active: true,
          createdAt: true,
          lastLoginAt: true,
          _count: { select: { auditLogs: true, assignedSupportTickets: true } },
        },
      }),
    ]);
    return {
      data: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        lastLoginAt: isoOrNull(row.lastLoginAt),
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  async createPlatformAdmin(input: { phone: string; fullName: string; role?: string; active?: boolean }, adminId: string) {
    const phone = normalizePhone(input.phone);
    assertPhone(phone);
    const fullName = assertText(input.fullName, 120, 'Invalid admin name');
    const role = assertText(input.role ?? 'operator', 60, 'Invalid admin role');
    const admin = await this.prisma.platformAdmin.create({
      data: {
        id: randomUUID(),
        phone,
        fullName,
        role,
        active: input.active !== false,
      },
    });
    await this.recordAudit(adminId, 'platform-admin.create', 'platform_admin', admin.id, { role });
    return {
      id: admin.id,
      phone: admin.phone,
      fullName: admin.fullName,
      role: admin.role,
      active: admin.active,
      createdAt: admin.createdAt.toISOString(),
      lastLoginAt: isoOrNull(admin.lastLoginAt),
    };
  }

  async updatePlatformAdmin(
    id: string,
    patch: { phone?: string; fullName?: string; role?: string; active?: boolean },
    actorId: string,
  ) {
    const current = await this.prisma.platformAdmin.findUnique({ where: { id } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Platform admin not found');
    if (patch.active === false && id === actorId) {
      throw new PlatformAdminError('INVALID_STATE', 'You cannot deactivate your own account');
    }
    if (patch.active === false && current.active) {
      const activeCount = await this.prisma.platformAdmin.count({ where: { active: true } });
      if (activeCount <= 1) throw new PlatformAdminError('INVALID_STATE', 'At least one active platform admin is required');
    }
    const phone = patch.phone === undefined ? undefined : normalizePhone(patch.phone);
    if (phone !== undefined) assertPhone(phone);
    const admin = await this.prisma.platformAdmin.update({
      where: { id },
      data: {
        ...(phone !== undefined ? { phone } : {}),
        ...(patch.fullName !== undefined ? { fullName: assertText(patch.fullName, 120, 'Invalid admin name') } : {}),
        ...(patch.role !== undefined ? { role: assertText(patch.role, 60, 'Invalid admin role') } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });
    await this.recordAudit(actorId, 'platform-admin.update', 'platform_admin', id, { fields: Object.keys(patch) });
    return {
      id: admin.id,
      phone: admin.phone,
      fullName: admin.fullName,
      role: admin.role,
      active: admin.active,
      createdAt: admin.createdAt.toISOString(),
      lastLoginAt: isoOrNull(admin.lastLoginAt),
    };
  }

  /** Platform-admin delete is an auditable, reversible deactivation. */
  async deletePlatformAdmin(id: string, actorId: string) {
    return this.updatePlatformAdmin(id, { active: false }, actorId);
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
        bookingStartOffsetDays: true,
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

  async updateSalon(
    id: string,
    patch: {
      name?: string;
      timezone?: string;
      businessType?: string | null;
      brandAccent?: string | null;
      workMode?: string;
      autoApprove?: boolean;
      bookingWindowDays?: number;
      bookingStartOffsetDays?: number;
      active?: boolean;
    },
    adminId: string,
  ) {
    const current = await this.prisma.salon.findUnique({ where: { id } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Salon not found');
    if (patch.bookingWindowDays !== undefined && (!Number.isInteger(patch.bookingWindowDays) || patch.bookingWindowDays < 0 || patch.bookingWindowDays > 365)) {
      throw new PlatformAdminError('INVALID_STATE', 'Invalid booking window');
    }
    if (
      patch.bookingStartOffsetDays !== undefined &&
      (!Number.isInteger(patch.bookingStartOffsetDays) ||
        patch.bookingStartOffsetDays < 0 ||
        patch.bookingStartOffsetDays > 1)
    ) {
      throw new PlatformAdminError('INVALID_STATE', 'Invalid booking start offset');
    }
    const currentBookingWindowDays = current.bookingWindowDays as number;
    const currentBookingStartOffsetDays = (current as { bookingStartOffsetDays?: number }).bookingStartOffsetDays ?? 0;
    const nextBookingWindowDays = patch.bookingWindowDays ?? currentBookingWindowDays;
    const nextBookingStartOffsetDays = patch.bookingStartOffsetDays ?? currentBookingStartOffsetDays;
    if (nextBookingStartOffsetDays > nextBookingWindowDays) {
      throw new PlatformAdminError('INVALID_STATE', 'Invalid booking start offset');
    }
    const salon = await this.prisma.salon.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: assertText(patch.name, 160, 'Invalid salon name') } : {}),
        ...(patch.timezone !== undefined ? { timezone: assertText(patch.timezone, 80, 'Invalid timezone') } : {}),
        ...(patch.businessType !== undefined ? { businessType: patch.businessType?.trim() || null } : {}),
        ...(patch.brandAccent !== undefined ? { brandAccent: patch.brandAccent?.trim() || null } : {}),
        ...(patch.workMode !== undefined ? { workMode: patch.workMode as any } : {}),
        ...(patch.autoApprove !== undefined ? { autoApprove: patch.autoApprove } : {}),
        ...(patch.bookingWindowDays !== undefined ? { bookingWindowDays: patch.bookingWindowDays } : {}),
        ...(patch.bookingStartOffsetDays !== undefined ? { bookingStartOffsetDays: patch.bookingStartOffsetDays } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });
    await this.recordAudit(adminId, 'salon.update', 'salon', id, { fields: Object.keys(patch), active: salon.active });
    return { id: salon.id, name: salon.name, timezone: salon.timezone, active: salon.active };
  }

  /** Keep salon history intact: archiving disables booking without cascading deletes. */
  async archiveSalon(id: string, adminId: string) {
    return this.updateSalon(id, { active: false }, adminId);
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
      case 'platform-admins':
        record = await this.prisma.platformAdmin.findUnique({
          where: { id },
          include: {
            _count: { select: { auditLogs: true, assignedSupportTickets: true } },
          },
        });
        break;
      case 'services':
        record = await this.prisma.service.findUnique({
          where: { id },
          include: {
            salon: { select: { id: true, name: true, active: true } },
            serviceStaff: { include: { staffMember: { select: { id: true, fullName: true, role: true, active: true } } } },
            serviceEquipment: { include: { equipment: { select: { id: true, name: true } } } },
          },
        });
        break;
      case 'chairs':
        record = await this.prisma.chair.findUnique({
          where: { id },
          include: {
            salon: { select: { id: true, name: true, active: true } },
            assignedStaff: { select: { id: true, fullName: true, role: true, active: true } },
            mobileStaff: { select: { id: true, fullName: true, role: true, active: true } },
          },
        });
        break;
      case 'equipment':
        record = await this.prisma.equipment.findUnique({
          where: { id },
          include: {
            salon: { select: { id: true, name: true, active: true } },
            chairEquipment: { include: { chair: { select: { id: true, name: true, active: true } } } },
            serviceEquipment: { include: { service: { select: { id: true, name: true, deletedAt: true } } } },
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
    const where: any = {};
    if (query.search) {
      where.OR = [
        { phone: { contains: query.search } },
        { fullName: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.status === 'active') where.active = true;
    if (query.status === 'blocked') {
      where.active = false;
      where.deletedAt = null;
    }
    if (query.status === 'deleted') where.deletedAt = { not: null };
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
          active: true,
          deletedAt: true,
          _count: { select: { appointments: true, waitlistEntries: true } },
        },
      }),
    ]);
    return {
      data: rows.map((row) => ({ ...row, deletedAt: isoOrNull(row.deletedAt) })),
      meta: pageMeta(page, limit, total),
    };
  }

  async createCustomer(input: { phone: string; fullName?: string | null }, adminId: string) {
    const phone = normalizePhone(input.phone);
    assertPhone(phone);
    const customer = await this.prisma.customer.create({
      data: {
        id: randomUUID(),
        phone,
        fullName: input.fullName?.trim() || null,
        active: true,
        deletedAt: null,
      },
    });
    await this.recordAudit(adminId, 'customer.create', 'customer', customer.id);
    return this.getCustomerRow(customer.id);
  }

  async updateCustomer(id: string, patch: { phone?: string; fullName?: string | null }, adminId: string) {
    const current = await this.prisma.customer.findUnique({ where: { id } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Customer not found');
    const phone = patch.phone === undefined ? undefined : normalizePhone(patch.phone);
    if (phone !== undefined) assertPhone(phone);
    await this.prisma.customer.update({
      where: { id },
      data: {
        ...(phone !== undefined ? { phone } : {}),
        ...(patch.fullName !== undefined ? { fullName: patch.fullName?.trim() || null } : {}),
      },
    });
    await this.recordAudit(adminId, 'customer.update', 'customer', id, { fields: Object.keys(patch) });
    return this.getCustomerRow(id);
  }

  async setCustomerActive(id: string, active: boolean, adminId: string) {
    const current = await this.prisma.customer.findUnique({ where: { id }, select: { active: true, deletedAt: true } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Customer not found');
    const customer = await this.prisma.customer.update({
      where: { id },
      data: { active, ...(active ? { deletedAt: null } : {}) },
    });
    await this.recordAudit(adminId, active ? 'customer.unblock' : 'customer.block', 'customer', id, {
      previousActive: current.active,
      previousDeletedAt: isoOrNull(current.deletedAt),
      active,
    });
    return this.getCustomerRow(customer.id);
  }

  /** Soft-delete and deactivate a customer, retaining all legal/financial history. */
  async deleteCustomer(id: string, adminId: string) {
    const current = await this.prisma.customer.findUnique({ where: { id }, select: { active: true, deletedAt: true } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Customer not found');
    const customer = await this.prisma.customer.update({
      where: { id },
      data: { active: false, deletedAt: new Date() },
    });
    await this.recordAudit(adminId, 'customer.delete', 'customer', id, {
      previousActive: current.active,
      previousDeletedAt: isoOrNull(current.deletedAt),
      softDelete: true,
    });
    return this.getCustomerRow(customer.id);
  }

  private async getCustomerRow(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        fullName: true,
        noShowCount: true,
        active: true,
        deletedAt: true,
        _count: { select: { appointments: true, waitlistEntries: true } },
      },
    });
    if (!customer) throw new PlatformAdminError('NOT_FOUND', 'Customer not found');
    return { ...customer, deletedAt: isoOrNull(customer.deletedAt) };
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
    if (query.status === 'inactive' || query.status === 'blocked') {
      where.active = false;
      where.deletedAt = null;
    }
    if (query.status === 'deleted') where.deletedAt = { not: null };
    if (['Owner', 'Admin', 'Stylist'].includes(query.status ?? '')) where.role = query.status;
    const [total, rows] = await Promise.all([
      this.prisma.staffMember.count({ where }),
      this.prisma.staffMember.findMany({
        where,
        orderBy: { fullName: 'asc' },
        skip,
        take: limit,
        select: { id: true, fullName: true, phone: true, role: true, active: true, deletedAt: true, salon: { select: { id: true, name: true } } },
      }),
    ]);
    return { data: rows.map((row) => ({ ...row, deletedAt: isoOrNull(row.deletedAt) })), meta: pageMeta(page, limit, total) };
  }

  async createStaff(input: { salonId: string; fullName: string; role: string; phone?: string | null }, adminId: string) {
    const salon = await this.prisma.salon.findUnique({ where: { id: input.salonId }, select: { id: true } });
    if (!salon) throw new PlatformAdminError('NOT_FOUND', 'Salon not found');
    if (!PLATFORM_STAFF_ROLES.includes(input.role as PlatformStaffRole)) {
      throw new PlatformAdminError('INVALID_STATE', 'Invalid staff role');
    }
    const phone = input.phone ? normalizePhone(input.phone) : null;
    if (phone) assertPhone(phone);
    const staff = await this.prisma.staffMember.create({
      data: {
        id: randomUUID(),
        salonId: input.salonId,
        fullName: assertText(input.fullName, 120, 'Invalid staff name'),
        role: input.role as PlatformStaffRole,
        phone,
        active: true,
        deletedAt: null,
      },
      select: { id: true, fullName: true, phone: true, role: true, active: true, deletedAt: true, salon: { select: { id: true, name: true } } },
    });
    await this.recordAudit(adminId, 'staff.create', 'staff', staff.id, { salonId: staff.salon.id, role: staff.role });
    return { ...staff, deletedAt: isoOrNull(staff.deletedAt) };
  }

  async updateStaff(
    id: string,
    patch: { fullName?: string; role?: string; phone?: string | null; active?: boolean },
    adminId: string,
  ) {
    const current = await this.prisma.staffMember.findUnique({ where: { id }, select: { salonId: true, role: true, active: true, deletedAt: true } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Staff member not found');
    if (patch.role !== undefined && !PLATFORM_STAFF_ROLES.includes(patch.role as PlatformStaffRole)) {
      throw new PlatformAdminError('INVALID_STATE', 'Invalid staff role');
    }
    const nextRole = (patch.role ?? current.role) as PlatformStaffRole;
    const nextActive = patch.active ?? current.active;
    if (current.role === 'Owner' && current.active && (nextRole !== 'Owner' || !nextActive)) {
      await this.assertOwnerCanLeave(current.salonId, id);
    }
    const phone = patch.phone === undefined ? undefined : patch.phone ? normalizePhone(patch.phone) : null;
    if (phone) assertPhone(phone);
    const staff = await this.prisma.staffMember.update({
      where: { id },
      data: {
        ...(patch.fullName !== undefined ? { fullName: assertText(patch.fullName, 120, 'Invalid staff name') } : {}),
        ...(patch.role !== undefined ? { role: nextRole } : {}),
        ...(patch.phone !== undefined ? { phone } : {}),
        ...(patch.active !== undefined ? { active: nextActive, deletedAt: nextActive ? null : new Date() } : {}),
      },
      select: { id: true, fullName: true, phone: true, role: true, active: true, deletedAt: true, salon: { select: { id: true, name: true } } },
    });
    await this.recordAudit(adminId, 'staff.update', 'staff', id, { fields: Object.keys(patch), salonId: current.salonId });
    return { ...staff, deletedAt: isoOrNull(staff.deletedAt) };
  }

  async deleteStaff(id: string, adminId: string) {
    const current = await this.prisma.staffMember.findUnique({ where: { id }, select: { salonId: true, role: true, active: true } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Staff member not found');
    if (current.role === 'Owner' && current.active) await this.assertOwnerCanLeave(current.salonId, id);
    const staff = await this.prisma.staffMember.update({
      where: { id },
      data: { active: false, deletedAt: new Date() },
      select: { id: true, active: true, deletedAt: true },
    });
    await this.recordAudit(adminId, 'staff.delete', 'staff', id, { salonId: current.salonId, softDelete: true });
    return { ...staff, deletedAt: isoOrNull(staff.deletedAt) };
  }

  private async assertOwnerCanLeave(salonId: string, staffId: string): Promise<void> {
    const remainingOwners = await this.prisma.staffMember.count({
      where: { salonId, role: 'Owner', active: true, id: { not: staffId } },
    });
    if (remainingOwners < 1) throw new PlatformAdminError('INVALID_STATE', 'LAST_OWNER_REQUIRED');
  }

  async listServices(query: PlatformListQuery) {
    const { page, limit, skip } = pageOf(query);
    const where: any = {};
    if (query.salonId) where.salonId = query.salonId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { salon: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.status === 'active') where.deletedAt = null;
    if (query.status === 'deleted') where.deletedAt = { not: null };
    const [total, rows] = await Promise.all([
      this.prisma.service.count({ where }),
      this.prisma.service.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        select: {
          id: true,
          salonId: true,
          name: true,
          durationMin: true,
          durationMode: true,
          minDurationMin: true,
          maxDurationMin: true,
          bufferMin: true,
          priceRial: true,
          requiresDeposit: true,
          depositRial: true,
          depositType: true,
          depositPercent: true,
          approvalStaffId: true,
          deletedAt: true,
          salon: { select: { id: true, name: true } },
          _count: { select: { appointments: true, serviceStaff: true } },
        },
      }),
    ]);
    return {
      data: rows.map((row) => ({
        ...row,
        priceRial: rial(row.priceRial),
        depositRial: row.depositRial == null ? null : rial(row.depositRial),
        deletedAt: isoOrNull(row.deletedAt),
      })),
      meta: pageMeta(page, limit, total),
    };
  }

  async createService(
    input: {
      salonId: string;
      name: string;
      durationMinutes: number;
      durationMode?: string;
      minDurationMinutes?: number | null;
      maxDurationMinutes?: number | null;
      bufferMinutes?: number;
      priceRial?: number;
      requiresDeposit?: boolean;
      depositRial?: number | null;
      depositType?: string;
      depositPercent?: number | null;
    },
    adminId: string,
  ) {
    await this.assertSalonExists(input.salonId);
    const service = await this.prisma.service.create({
      data: {
        id: randomUUID(),
        salonId: input.salonId,
        name: assertText(input.name, 160, 'Invalid service name'),
        durationMin: input.durationMinutes,
        durationMode: input.durationMode === 'variable' ? 'variable' : 'fixed',
        minDurationMin: input.minDurationMinutes ?? null,
        maxDurationMin: input.maxDurationMinutes ?? null,
        bufferMin: input.bufferMinutes ?? 0,
        priceRial: BigInt(input.priceRial ?? 0),
        requiresDeposit: input.requiresDeposit === true,
        depositRial: input.depositRial == null ? null : BigInt(input.depositRial),
        depositType: input.depositType === 'percentage' ? 'percentage' : 'fixed',
        depositPercent: input.depositPercent ?? null,
      },
    });
    const staff = await this.prisma.staffMember.findMany({
      where: { salonId: input.salonId, active: true, role: { in: ['Owner', 'Stylist'] } },
      select: { id: true },
    });
    if (staff.length) {
      await this.prisma.serviceStaff.createMany({
        data: staff.map((member) => ({ serviceId: service.id, staffMemberId: member.id })),
        skipDuplicates: true,
      });
    }
    await this.recordAudit(adminId, 'service.create', 'service', service.id, { salonId: input.salonId });
    return this.getServiceRecord(service.id);
  }

  async updateService(
    id: string,
    patch: {
      name?: string;
      durationMinutes?: number;
      durationMode?: string;
      minDurationMinutes?: number | null;
      maxDurationMinutes?: number | null;
      bufferMinutes?: number;
      priceRial?: number;
      requiresDeposit?: boolean;
      depositRial?: number | null;
      depositType?: string;
      depositPercent?: number | null;
      active?: boolean;
    },
    adminId: string,
  ) {
    const current = await this.prisma.service.findUnique({ where: { id } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Service not found');
    const service = await this.prisma.service.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: assertText(patch.name, 160, 'Invalid service name') } : {}),
        ...(patch.durationMinutes !== undefined ? { durationMin: patch.durationMinutes } : {}),
        ...(patch.durationMode !== undefined ? { durationMode: patch.durationMode } : {}),
        ...(patch.minDurationMinutes !== undefined ? { minDurationMin: patch.minDurationMinutes } : {}),
        ...(patch.maxDurationMinutes !== undefined ? { maxDurationMin: patch.maxDurationMinutes } : {}),
        ...(patch.bufferMinutes !== undefined ? { bufferMin: patch.bufferMinutes } : {}),
        ...(patch.priceRial !== undefined ? { priceRial: BigInt(patch.priceRial) } : {}),
        ...(patch.requiresDeposit !== undefined ? { requiresDeposit: patch.requiresDeposit } : {}),
        ...(patch.depositRial !== undefined ? { depositRial: patch.depositRial == null ? null : BigInt(patch.depositRial) } : {}),
        ...(patch.depositType !== undefined ? { depositType: patch.depositType } : {}),
        ...(patch.depositPercent !== undefined ? { depositPercent: patch.depositPercent } : {}),
        ...(patch.active !== undefined ? { deletedAt: patch.active ? null : new Date() } : {}),
      },
    });
    await this.recordAudit(adminId, 'service.update', 'service', id, { fields: Object.keys(patch), salonId: current.salonId });
    return this.getServiceRecord(service.id);
  }

  async deleteService(id: string, adminId: string) {
    const current = await this.prisma.service.findUnique({ where: { id }, select: { salonId: true } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Service not found');
    const service = await this.prisma.service.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.recordAudit(adminId, 'service.delete', 'service', id, { salonId: current.salonId, softDelete: true });
    return { id: service.id, active: service.deletedAt === null };
  }

  private async getServiceRecord(id: string) {
    const row = await this.prisma.service.findUnique({
      where: { id },
      select: {
        id: true,
        salonId: true,
        name: true,
        durationMin: true,
        durationMode: true,
        minDurationMin: true,
        maxDurationMin: true,
        bufferMin: true,
        priceRial: true,
        requiresDeposit: true,
        depositRial: true,
        depositType: true,
        depositPercent: true,
        approvalStaffId: true,
        deletedAt: true,
        salon: { select: { id: true, name: true } },
        _count: { select: { appointments: true, serviceStaff: true } },
      },
    });
    if (!row) throw new PlatformAdminError('NOT_FOUND', 'Service not found');
    return { ...row, priceRial: rial(row.priceRial), depositRial: row.depositRial == null ? null : rial(row.depositRial), deletedAt: isoOrNull(row.deletedAt) };
  }

  async listChairs(query: PlatformListQuery) {
    return this.listSimpleSalonResource('chair', query);
  }

  async createChair(input: { salonId: string; name: string; kind?: string }, adminId: string) {
    await this.assertSalonExists(input.salonId);
    const chair = await this.prisma.chair.create({
      data: { id: randomUUID(), salonId: input.salonId, name: assertText(input.name, 100, 'Invalid chair name'), kind: input.kind === 'mobile' ? 'mobile' : 'physical' },
      select: { id: true, salonId: true, name: true, kind: true, active: true, deletedAt: true, salon: { select: { id: true, name: true } } },
    });
    await this.recordAudit(adminId, 'chair.create', 'chair', chair.id, { salonId: input.salonId });
    return { ...chair, deletedAt: isoOrNull(chair.deletedAt) };
  }

  async updateChair(id: string, patch: { name?: string; active?: boolean }, adminId: string) {
    const current = await this.prisma.chair.findUnique({ where: { id }, select: { salonId: true } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Chair not found');
    const chair = await this.prisma.chair.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: assertText(patch.name, 100, 'Invalid chair name') } : {}),
        ...(patch.active !== undefined ? { active: patch.active, deletedAt: patch.active ? null : new Date() } : {}),
      },
      select: { id: true, salonId: true, name: true, kind: true, active: true, deletedAt: true, salon: { select: { id: true, name: true } } },
    });
    await this.recordAudit(adminId, 'chair.update', 'chair', id, { fields: Object.keys(patch), salonId: current.salonId });
    return { ...chair, deletedAt: isoOrNull(chair.deletedAt) };
  }

  async deleteChair(id: string, adminId: string) {
    return this.updateChair(id, { active: false }, adminId);
  }

  async listEquipment(query: PlatformListQuery) {
    return this.listSimpleSalonResource('equipment', query);
  }

  async createEquipment(input: { salonId: string; name: string }, adminId: string) {
    await this.assertSalonExists(input.salonId);
    const equipment = await this.prisma.equipment.create({
      data: { id: randomUUID(), salonId: input.salonId, name: assertText(input.name, 100, 'Invalid equipment name') },
      select: { id: true, salonId: true, name: true, deletedAt: true, salon: { select: { id: true, name: true } } },
    });
    await this.recordAudit(adminId, 'equipment.create', 'equipment', equipment.id, { salonId: input.salonId });
    return { ...equipment, active: equipment.deletedAt === null, deletedAt: isoOrNull(equipment.deletedAt) };
  }

  async updateEquipment(id: string, patch: { name?: string; active?: boolean }, adminId: string) {
    const current = await this.prisma.equipment.findUnique({ where: { id }, select: { salonId: true } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Equipment not found');
    const equipment = await this.prisma.equipment.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: assertText(patch.name, 100, 'Invalid equipment name') } : {}),
        ...(patch.active !== undefined ? { deletedAt: patch.active ? null : new Date() } : {}),
      },
      select: { id: true, salonId: true, name: true, deletedAt: true, salon: { select: { id: true, name: true } } },
    });
    await this.recordAudit(adminId, 'equipment.update', 'equipment', id, { fields: Object.keys(patch), salonId: current.salonId });
    return { ...equipment, active: equipment.deletedAt === null, deletedAt: isoOrNull(equipment.deletedAt) };
  }

  async deleteEquipment(id: string, adminId: string) {
    return this.updateEquipment(id, { active: false }, adminId);
  }

  private async listSimpleSalonResource(resource: 'chair' | 'equipment', query: PlatformListQuery) {
    const { page, limit, skip } = pageOf(query);
    const where: any = {};
    if (query.salonId) where.salonId = query.salonId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { salon: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.status === 'active') where.deletedAt = null;
    if (query.status === 'deleted') where.deletedAt = { not: null };
    const delegate: any = resource === 'chair' ? this.prisma.chair : this.prisma.equipment;
    const [total, rows] = await Promise.all([
      delegate.count({ where }),
      delegate.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        select: resource === 'chair'
          ? { id: true, salonId: true, name: true, kind: true, active: true, deletedAt: true, salon: { select: { id: true, name: true } } }
          : { id: true, salonId: true, name: true, deletedAt: true, salon: { select: { id: true, name: true } } },
      } as any),
    ]);
    return {
      data: rows.map((row: any) => ({ ...row, active: resource === 'chair' ? row.active : row.deletedAt === null, deletedAt: isoOrNull(row.deletedAt) })),
      meta: pageMeta(page, limit, total),
    };
  }

  private async assertSalonExists(id: string): Promise<void> {
    const salon = await this.prisma.salon.findUnique({ where: { id }, select: { id: true } });
    if (!salon) throw new PlatformAdminError('NOT_FOUND', 'Salon not found');
  }

  async setStaffActive(id: string, active: boolean, adminId: string) {
    const current = await this.prisma.staffMember.findUnique({ where: { id }, select: { active: true, salonId: true, role: true } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Staff member not found');
    if (!active && current.active && current.role === 'Owner') await this.assertOwnerCanLeave(current.salonId, id);
    const staff = await this.prisma.staffMember.update({ where: { id }, data: { active, deletedAt: null } });
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
          customerNote: true,
          locationType: true,
          locationAddress: true,
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

  async updateAppointment(
    id: string,
    patch: { customerNote?: string | null; locationType?: string; locationAddress?: string | null },
    adminId: string,
  ) {
    const current = await this.prisma.appointment.findUnique({ where: { id }, select: { salonId: true } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Appointment not found');
    if (patch.locationType !== undefined && !['salon', 'customer'].includes(patch.locationType)) {
      throw new PlatformAdminError('INVALID_STATE', 'Invalid appointment location');
    }
    if (patch.locationType === 'customer' && !patch.locationAddress?.trim()) {
      throw new PlatformAdminError('INVALID_STATE', 'Customer location requires an address');
    }
    const appointment = await this.prisma.appointment.update({
      where: { id },
      data: {
        ...(patch.customerNote !== undefined ? { customerNote: patch.customerNote?.trim() || null } : {}),
        ...(patch.locationType !== undefined ? { locationType: patch.locationType as any } : {}),
        ...(patch.locationAddress !== undefined ? { locationAddress: patch.locationAddress?.trim() || null } : {}),
      },
    });
    await this.recordAudit(adminId, 'appointment.update', 'appointment', id, { fields: Object.keys(patch), salonId: current.salonId });
    return appointment;
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

  async updateSubscription(
    id: string,
    patch: { status?: string; planKind?: string; expiresAt?: Date; graceUntil?: Date | null },
    adminId: string,
  ) {
    const current = await this.prisma.subscription.findUnique({ where: { id }, select: { salonId: true, status: true, planKind: true, expiresAt: true, graceUntil: true } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Subscription not found');
    if (patch.status !== undefined && !SUBSCRIPTION_STATUSES.includes(patch.status as (typeof SUBSCRIPTION_STATUSES)[number])) {
      throw new PlatformAdminError('INVALID_STATE', 'Invalid subscription status');
    }
    if (patch.planKind !== undefined && !SUBSCRIPTION_PLANS.includes(patch.planKind as (typeof SUBSCRIPTION_PLANS)[number])) {
      throw new PlatformAdminError('INVALID_STATE', 'Invalid subscription plan');
    }
    if (patch.expiresAt && patch.expiresAt.getTime() < 0) throw new PlatformAdminError('INVALID_STATE', 'Invalid subscription expiry');
    const subscription = await this.prisma.subscription.update({
      where: { id },
      data: {
        ...(patch.status !== undefined ? { status: patch.status as any } : {}),
        ...(patch.planKind !== undefined ? { planKind: patch.planKind as any } : {}),
        ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
        ...(patch.graceUntil !== undefined ? { graceUntil: patch.graceUntil } : {}),
      },
      select: { id: true, status: true, planKind: true, startedAt: true, expiresAt: true, graceUntil: true, salon: { select: { id: true, name: true, active: true } } },
    });
    await this.recordAudit(adminId, 'subscription.update', 'subscription', id, { fields: Object.keys(patch), salonId: current.salonId });
    return { ...subscription, startedAt: subscription.startedAt.toISOString(), expiresAt: subscription.expiresAt.toISOString(), graceUntil: isoOrNull(subscription.graceUntil) };
  }

  /** Subscription delete is represented as immediate expiry, preserving billing history. */
  async deleteSubscription(id: string, adminId: string) {
    return this.updateSubscription(id, { status: 'expired', expiresAt: new Date(), graceUntil: null }, adminId);
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

  /**
   * Payment edits are restricted to reconciliation status and always require
   * the source ledger (`appointment` or `subscription`) because both tables
   * intentionally use independent ids. Raw deletion is never allowed.
   */
  async updatePayment(id: string, kind: 'appointment' | 'subscription', status: string, adminId: string) {
    if (!PAYMENT_STATUSES.includes(status as (typeof PAYMENT_STATUSES)[number])) {
      throw new PlatformAdminError('INVALID_STATE', 'Invalid payment status');
    }
    let salonId: string | undefined;
    if (kind === 'appointment') {
      const current = await this.prisma.payment.findUnique({ where: { id }, select: { appointment: { select: { salonId: true } } } });
      if (!current) throw new PlatformAdminError('NOT_FOUND', 'Payment not found');
      salonId = current.appointment.salonId;
      await this.prisma.payment.update({ where: { id }, data: { status: status as any } });
    } else {
      const current = await this.prisma.subscriptionPayment.findUnique({ where: { id }, select: { subscription: { select: { salonId: true } } } });
      if (!current) throw new PlatformAdminError('NOT_FOUND', 'Payment not found');
      salonId = current.subscription.salonId;
      await this.prisma.subscriptionPayment.update({ where: { id }, data: { status: status as any } });
    }
    await this.recordAudit(adminId, 'payment.reconcile', 'payment', id, { kind, status, salonId });
    return { id, kind, status };
  }

  async deletePayment(_id: string, _kind: 'appointment' | 'subscription', _adminId: string): Promise<never> {
    throw new PlatformAdminError('INVALID_STATE', 'FINANCIAL_LEDGER_IMMUTABLE');
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

  async updateWaitlist(id: string, patch: { status?: string; windowStart?: Date; windowEnd?: Date }, adminId: string) {
    const current = await this.prisma.waitlistEntry.findUnique({ where: { id }, select: { salonId: true, status: true } });
    if (!current) throw new PlatformAdminError('NOT_FOUND', 'Waitlist entry not found');
    const allowed = ['waiting', 'notified', 'fulfilled', 'cancelled'];
    if (patch.status !== undefined && !allowed.includes(patch.status)) throw new PlatformAdminError('INVALID_STATE', 'Invalid waitlist status');
    if (patch.windowStart && patch.windowEnd && patch.windowStart >= patch.windowEnd) throw new PlatformAdminError('INVALID_STATE', 'Invalid waitlist window');
    const entry = await this.prisma.waitlistEntry.update({
      where: { id },
      data: {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.windowStart !== undefined ? { windowStart: patch.windowStart } : {}),
        ...(patch.windowEnd !== undefined ? { windowEnd: patch.windowEnd } : {}),
      },
    });
    await this.recordAudit(adminId, 'waitlist.update', 'waitlist', id, { fields: Object.keys(patch), salonId: current.salonId });
    return { ...entry, windowStart: entry.windowStart.toISOString(), windowEnd: entry.windowEnd.toISOString(), createdAt: entry.createdAt.toISOString() };
  }

  async deleteWaitlist(id: string, adminId: string) {
    return this.updateWaitlist(id, { status: 'cancelled' }, adminId);
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
