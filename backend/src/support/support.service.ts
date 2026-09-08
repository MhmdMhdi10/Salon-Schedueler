import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export type SupportTicketInput = {
  reporterId?: string;
  reporterStaffId?: string;
  reporterRole?: string;
  salonId?: string;
  page?: string;
  action?: string;
  message: string;
  errorCode?: string;
  requestId?: string;
  userAgent?: string;
  browser?: string;
  device?: string;
  screenshot?: {
    name: string;
    mime: 'image/jpeg' | 'image/png' | 'image/webp';
    data: Buffer;
  };
};

const publicTicket = (row: any, includeScreenshot = false) => ({
  id: row.id,
  ticketNumber: row.ticketNumber,
  reporterRole: row.reporterRole,
  page: row.page,
  action: row.action,
  message: row.message,
  errorCode: row.errorCode,
  requestId: row.requestId,
  userAgent: row.userAgent,
  browser: row.browser,
  device: row.device,
  reporter: row.reporter ? { id: row.reporter.id, fullName: row.reporter.fullName, phone: row.reporter.phone } : null,
  reporterStaff: row.reporterStaff ? { id: row.reporterStaff.id, fullName: row.reporterStaff.fullName, phone: row.reporterStaff.phone } : null,
  salon: row.salon ? { id: row.salon.id, name: row.salon.name } : null,
  assignedAdmin: row.assignedAdmin ? { id: row.assignedAdmin.id, fullName: row.assignedAdmin.fullName } : null,
  status: row.status,
  priority: row.priority,
  resolution: row.resolution,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  resolvedAt: row.resolvedAt?.toISOString() ?? null,
  ...(includeScreenshot && row.screenshotData
    ? {
        screenshot: {
          name: row.screenshotName,
          mime: row.screenshotMime,
          size: row.screenshotSize,
          dataBase64: row.screenshotData.toString('base64'),
        },
      }
    : { screenshot: row.screenshotName ? { name: row.screenshotName, mime: row.screenshotMime, size: row.screenshotSize } : null }),
});

export class SupportTicketService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: SupportTicketInput) {
    const ticketNumber = `ARA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const row = await this.prisma.supportTicket.create({
      data: {
        ticketNumber,
        reporterId: input.reporterId ?? null,
        reporterStaffId: input.reporterStaffId ?? null,
        reporterRole: input.reporterRole ?? null,
        salonId: input.salonId ?? null,
        page: input.page ?? null,
        action: input.action ?? null,
        message: input.message,
        errorCode: input.errorCode ?? null,
        requestId: input.requestId ?? null,
        userAgent: input.userAgent ?? null,
        browser: input.browser ?? null,
        device: input.device ?? null,
        screenshotName: input.screenshot?.name ?? null,
        screenshotMime: input.screenshot?.mime ?? null,
        screenshotSize: input.screenshot?.data.length ?? null,
        screenshotData: input.screenshot?.data ?? null,
      },
    });
    return publicTicket(row);
  }

  async listMine(input: { reporterId?: string; reporterStaffId?: string; limit?: number }) {
    const rows = await this.prisma.supportTicket.findMany({
      where: {
        ...(input.reporterId ? { reporterId: input.reporterId } : {}),
        ...(input.reporterStaffId ? { reporterStaffId: input.reporterStaffId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(50, Math.max(1, input.limit ?? 20)),
    });
    return rows.map((row) => publicTicket(row));
  }

  async listAll(input: { status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 20)));
    const where = input.status ? { status: input.status } : {};
    const [total, rows] = await Promise.all([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.findMany({
        where,
        include: {
          reporter: { select: { id: true, fullName: true, phone: true } },
          reporterStaff: { select: { id: true, fullName: true, phone: true } },
          salon: { select: { id: true, name: true } },
          assignedAdmin: { select: { id: true, fullName: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      tickets: rows.map((row) => publicTicket(row)),
      page: { page, limit, total, pageCount: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async get(id: string, includeScreenshot = false) {
    const row = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, fullName: true, phone: true } },
        reporterStaff: { select: { id: true, fullName: true, phone: true } },
        salon: { select: { id: true, name: true } },
        assignedAdmin: { select: { id: true, fullName: true } },
      },
    });
    return row ? publicTicket(row, includeScreenshot) : null;
  }

  async update(
    id: string,
    input: { status?: string; priority?: string; resolution?: string; assignedAdminId?: string | null },
  ) {
    const resolved = input.status === 'resolved' || input.status === 'closed';
    const row = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.resolution !== undefined ? { resolution: input.resolution || null } : {}),
        ...(input.assignedAdminId !== undefined ? { assignedAdminId: input.assignedAdminId } : {}),
        ...(resolved ? { resolvedAt: new Date() } : input.status ? { resolvedAt: null } : {}),
      },
    });
    return publicTicket(row);
  }
}
