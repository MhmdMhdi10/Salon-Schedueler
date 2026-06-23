import type { PrismaClient } from '@prisma/client';
import type {
  NotificationRepository,
  NotificationLogEntry,
  AppointmentInfo,
  DeviceTokenInfo,
} from '../notifications/notification.service.js';
import type { SmsProvider } from '../auth/sms-provider.interface.js';
import type {
  WaitlistRepository,
  WaitlistNotifier,
  WaitlistEntry,
  JoinWaitlistInput,
} from '../waitlist/waitlist.service.js';
import type {
  CustomerRepository,
  AppointmentRecord,
  CustomerNote,
  StaffRef,
} from '../customer/customer.service.js';

/**
 * Prisma-backed implementations of the domain service ports.
 *
 * The domain services (NotificationService, WaitlistService, CustomerService)
 * depend on repository/notifier interfaces rather than Prisma directly, so these
 * adapters connect those ports to the database. They are constructed only by the
 * Composition_Root (Requirement 3.1).
 */

// ─── NotificationRepository ──────────────────────────────────────────────────

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAppointment(appointmentId: string): Promise<AppointmentInfo | null> {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { customer: true, service: true, staffMember: true },
    });
    if (!appt) {
      return null;
    }
    return {
      id: appt.id,
      customerId: appt.customerId,
      customerPhone: appt.customer.phone,
      customerName: appt.customer.fullName ?? undefined,
      serviceName: appt.service.name,
      startAt: appt.startAt,
      staffName: appt.staffMember.fullName,
    };
  }

  async findDeviceTokens(customerId: string): Promise<DeviceTokenInfo[]> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { customerId },
    });
    return tokens.map((t) => ({
      token: t.token,
      platform: t.platform,
      pushEnabled: t.pushEnabled,
    }));
  }

  async findAppointmentsInReminderWindow(
    now: Date,
    reminderLeadTimeMinutes: number,
  ): Promise<AppointmentInfo[]> {
    const windowEnd = new Date(now.getTime() + reminderLeadTimeMinutes * 60 * 1000);
    const appts = await this.prisma.appointment.findMany({
      where: {
        status: 'confirmed',
        startAt: { gte: now, lt: windowEnd },
      },
      include: { customer: true, service: true, staffMember: true },
    });
    return appts.map((appt) => ({
      id: appt.id,
      customerId: appt.customerId,
      customerPhone: appt.customer.phone,
      customerName: appt.customer.fullName ?? undefined,
      serviceName: appt.service.name,
      startAt: appt.startAt,
      staffName: appt.staffMember.fullName,
    }));
  }

  async logNotification(
    entry: Omit<NotificationLogEntry, 'id' | 'createdAt'>,
  ): Promise<NotificationLogEntry> {
    const row = await this.prisma.notificationLog.create({
      data: {
        appointmentId: entry.appointmentId,
        channel: entry.channel,
        status: entry.status,
        error: entry.error,
      },
    });
    return {
      id: row.id,
      appointmentId: row.appointmentId,
      channel: row.channel as NotificationLogEntry['channel'],
      status: row.status as NotificationLogEntry['status'],
      error: row.error,
      createdAt: row.createdAt,
    };
  }

  async registerDeviceToken(
    customerId: string,
    token: string,
    platform: string,
  ): Promise<void> {
    await this.prisma.deviceToken.create({
      data: { customerId, token, platform },
    });
  }
}

// ─── WaitlistRepository ──────────────────────────────────────────────────────

function toWaitlistEntry(row: {
  id: string;
  salonId: string;
  customerId: string;
  serviceId: string;
  windowStart: Date;
  windowEnd: Date;
  status: string;
  createdAt: Date;
}): WaitlistEntry {
  return {
    id: row.id,
    salonId: row.salonId,
    customerId: row.customerId,
    serviceId: row.serviceId,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    status: row.status as WaitlistEntry['status'],
    createdAt: row.createdAt,
  };
}

export class PrismaWaitlistRepository implements WaitlistRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: JoinWaitlistInput): Promise<WaitlistEntry> {
    const row = await this.prisma.waitlistEntry.create({
      data: {
        salonId: input.salonId,
        customerId: input.customerId,
        serviceId: input.serviceId,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        status: 'waiting',
      },
    });
    return toWaitlistEntry(row);
  }

  async findWaiting(
    salonId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<WaitlistEntry[]> {
    // Overlap: entry.windowStart < windowEnd AND entry.windowEnd > windowStart.
    const rows = await this.prisma.waitlistEntry.findMany({
      where: {
        salonId,
        status: 'waiting',
        windowStart: { lt: windowEnd },
        windowEnd: { gt: windowStart },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toWaitlistEntry);
  }

  async findById(id: string): Promise<WaitlistEntry | null> {
    const row = await this.prisma.waitlistEntry.findUnique({ where: { id } });
    return row ? toWaitlistEntry(row) : null;
  }

  async updateStatus(
    id: string,
    status: WaitlistEntry['status'],
  ): Promise<WaitlistEntry> {
    const row = await this.prisma.waitlistEntry.update({
      where: { id },
      data: { status },
    });
    return toWaitlistEntry(row);
  }

  async findCustomerPhone(customerId: string): Promise<string | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { phone: true },
    });
    return customer?.phone ?? null;
  }

  async findServiceName(serviceId: string): Promise<string | null> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { name: true },
    });
    return service?.name ?? null;
  }
}

// ─── WaitlistNotifier ────────────────────────────────────────────────────────

/**
 * Notifies a waitlisted customer that a slot freed by sending an SMS through the
 * configured SMS provider.
 */
export class PrismaWaitlistNotifier implements WaitlistNotifier {
  constructor(private readonly smsProvider: SmsProvider) {}

  async notifyWaitlistCustomer(phone: string, serviceName: string): Promise<void> {
    await this.smsProvider.send(
      phone,
      `یک نوبت برای ${serviceName} آزاد شد. برای رزرو اقدام کنید.`,
    );
  }
}

// ─── CustomerRepository ──────────────────────────────────────────────────────

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(
    customerId: string,
  ): Promise<{ id: string; preferredStaffId: string | null } | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, preferredStaffId: true },
    });
    return customer ?? null;
  }

  async getAppointments(customerId: string): Promise<AppointmentRecord[]> {
    const appts = await this.prisma.appointment.findMany({
      where: { customerId },
      orderBy: { startAt: 'desc' },
    });
    return appts.map((appt) => ({
      id: appt.id,
      salonId: appt.salonId,
      serviceId: appt.serviceId,
      staffMemberId: appt.staffMemberId,
      chairId: appt.chairId,
      startAt: appt.startAt,
      endAt: appt.endAt,
      status: appt.status,
      source: appt.source,
      createdAt: appt.createdAt,
    }));
  }

  async createNote(
    customerId: string,
    authorId: string | null,
    body: string,
  ): Promise<CustomerNote> {
    const note = await this.prisma.customerNote.create({
      data: { customerId, authorId, body },
    });
    return {
      id: note.id,
      customerId: note.customerId,
      authorId: note.authorId,
      body: note.body,
      createdAt: note.createdAt,
    };
  }

  async getNotes(customerId: string): Promise<CustomerNote[]> {
    const notes = await this.prisma.customerNote.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    return notes.map((note) => ({
      id: note.id,
      customerId: note.customerId,
      authorId: note.authorId,
      body: note.body,
      createdAt: note.createdAt,
    }));
  }

  async getPreferredStaff(customerId: string): Promise<StaffRef | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { preferredStaff: true },
    });
    if (!customer?.preferredStaff) {
      return null;
    }
    return {
      id: customer.preferredStaff.id,
      fullName: customer.preferredStaff.fullName,
      role: customer.preferredStaff.role,
    };
  }

  async setPreferredStaff(customerId: string, staffId: string | null): Promise<void> {
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { preferredStaffId: staffId },
    });
  }
}
