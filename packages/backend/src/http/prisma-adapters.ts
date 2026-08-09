import type { PrismaClient } from '@prisma/client';
import type {
  NotificationRepository,
  NotificationLogEntry,
  AppointmentInfo,
  DeviceTokenInfo,
} from '../notifications/notification.service.js';
import {
  DEFAULT_SMS_SETTINGS,
  type SmsNotificationEvent,
} from '../notifications/notification-settings.service.js';
import type {
  BotChannelRepository,
  BotChatRef,
  BotRecipient,
} from '../notifications/bot-channel.js';
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
  CustomerProfile,
  StaffRef,
} from '../customer/customer.service.js';

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

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
      include: { customer: true, service: true, staffMember: true, salon: true },
    });
    if (!appt) {
      return null;
    }
    return {
      id: appt.id,
      salonId: appt.salonId,
      salonName: appt.salon.name,
      customerId: appt.customerId,
      customerPhone: appt.customer.phone,
      customerName: appt.customer.fullName ?? undefined,
      serviceName: appt.service.name,
      startAt: appt.startAt,
      staffName: appt.staffMember.fullName,
      staffMemberId: appt.staffMemberId,
    };
  }

  async findSalonSmsRecipients(salonId: string): Promise<string[]> {
    const owners = await this.prisma.staffMember.findMany({
      where: {
        salonId,
        role: 'Owner',
        active: true,
        phone: { not: null },
      },
      select: { phone: true },
    });
    return owners.flatMap((owner) => (owner.phone ? [owner.phone] : []));
  }

  async findSmsRecipientsForAppointment(
    appointmentId: string,
    event: SmsNotificationEvent,
  ): Promise<string[]> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { salonId: true, staffMemberId: true },
    });
    if (!appointment) return [];

    const settingsRow = await this.prisma.salonSmsSettings.findUnique({
      where: { salonId: appointment.salonId },
    });
    const settings = settingsRow ?? { ...DEFAULT_SMS_SETTINGS };
    const ownerEnabled = settings[`owner${capitalize(event)}` as keyof typeof settings] === true;
    const stylistEnabled = settings[`stylist${capitalize(event)}` as keyof typeof settings] === true;
    const recipients: string[] = [];

    if (ownerEnabled) {
      const owners = await this.prisma.staffMember.findMany({
        where: {
          salonId: appointment.salonId,
          role: 'Owner',
          active: true,
          phone: { not: null },
        },
        select: { phone: true },
      });
      recipients.push(...owners.flatMap((owner) => (owner.phone ? [owner.phone] : [])));
    }

    if (stylistEnabled) {
      const assigned = await this.prisma.staffMember.findFirst({
        where: {
          id: appointment.staffMemberId,
          salonId: appointment.salonId,
          role: { in: ['Owner', 'Stylist'] },
          active: true,
          phone: { not: null },
        },
        select: { phone: true },
      });
      if (assigned?.phone) recipients.push(assigned.phone);
    }

    return [...new Set(recipients)];
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
      include: { customer: true, service: true, staffMember: true, salon: true },
    });
    return appts.map((appt) => ({
      id: appt.id,
      salonId: appt.salonId,
      salonName: appt.salon.name,
      customerId: appt.customerId,
      customerPhone: appt.customer.phone,
      customerName: appt.customer.fullName ?? undefined,
      serviceName: appt.service.name,
      startAt: appt.startAt,
      staffName: appt.staffMember.fullName,
      staffMemberId: appt.staffMemberId,
    }));
  }

  async logNotification(
    entry: Omit<NotificationLogEntry, 'id' | 'createdAt'>,
  ): Promise<NotificationLogEntry> {
    // The checked-in generated client may predate the additive `type` column.
    // Keep this adapter runnable during rolling deploys; the migration supplies
    // the database default for older callers.
    const row = await (
      this.prisma.notificationLog as unknown as {
        create(args: {
          data: {
            appointmentId: string | null;
            type: string;
            channel: string;
            status: string;
            error: string | null;
          };
        }): Promise<{
          id: string;
          appointmentId: string | null;
          type?: string;
          channel: string;
          status: string;
          error: string | null;
          createdAt: Date;
        }>;
      }
    ).create({
      data: {
        appointmentId: entry.appointmentId,
        type: entry.type ?? 'generic',
        channel: entry.channel,
        status: entry.status,
        error: entry.error,
      },
    });
    return {
      id: row.id,
      appointmentId: row.appointmentId,
      type: row.type as NotificationLogEntry['type'],
      channel: row.channel as NotificationLogEntry['channel'],
      status: row.status as NotificationLogEntry['status'],
      error: row.error,
      createdAt: row.createdAt,
    };
  }

  async hasSentNotification(
    appointmentId: string,
    type: NonNullable<NotificationLogEntry['type']>,
    channel: NotificationLogEntry['channel'],
  ): Promise<boolean> {
    const row = await (
      this.prisma.notificationLog as unknown as {
        findFirst(args: {
          where: { appointmentId: string; type: string; channel: string; status: string };
          select: { id: true };
        }): Promise<{ id: string } | null>;
      }
    ).findFirst({
      where: { appointmentId, type, channel, status: 'sent' },
      select: { id: true },
    });
    return Boolean(row);
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

// ─── BotChannelRepository ────────────────────────────────────────────────────

/**
 * Prisma-backed `BotChannelRepository`. Resolves a recipient's linked `BotChat`
 * (keyed by customer or staff member) and persists `NotificationLog` rows for
 * bot/SMS delivery attempts (Requirements 1.9, 1.10).
 */
export class PrismaBotChannelRepository implements BotChannelRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBotChat(recipient: BotRecipient): Promise<BotChatRef | null> {
    const where =
      recipient.kind === 'customer'
        ? { customerId: recipient.customerId }
        : { staffMemberId: recipient.staffMemberId };
    // The generated client may lag the schema; cast through unknown so this
    // compiles against a stale client while still hitting the real delegate
    // (mirrors the narrow-cast pattern in qr.service.ts / subscription.service.ts).
    const chat = await (
      this.prisma as unknown as {
        botChat: {
          findFirst(args: {
            where: { customerId: string } | { staffMemberId: string };
            orderBy: { linkedAt: 'desc' };
            select: { platform: true; chatId: true };
          }): Promise<{ platform: string; chatId: string } | null>;
        };
      }
    ).botChat.findFirst({
      where,
      orderBy: { linkedAt: 'desc' },
      select: { platform: true, chatId: true },
    });
    if (!chat) {
      return null;
    }
    return { platform: chat.platform as BotChatRef['platform'], chatId: chat.chatId };
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

  async findActiveForCustomer(input: JoinWaitlistInput): Promise<WaitlistEntry | null> {
    const row = await this.prisma.waitlistEntry.findFirst({
      where: {
        salonId: input.salonId,
        customerId: input.customerId,
        serviceId: input.serviceId,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        status: { in: ['waiting', 'notified'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    return row ? toWaitlistEntry(row) : null;
  }

  async findByCustomer(customerId: string): Promise<WaitlistEntry[]> {
    const rows = await this.prisma.waitlistEntry.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toWaitlistEntry);
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

  async getProfile(customerId: string): Promise<CustomerProfile | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, phone: true, fullName: true, noShowCount: true },
    });
    return customer ?? null;
  }

  async updateProfile(customerId: string, fullName: string): Promise<CustomerProfile> {
    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: { fullName },
      select: { id: true, phone: true, fullName: true, noShowCount: true },
    });
    return customer;
  }

  async getAppointments(customerId: string): Promise<AppointmentRecord[]> {
    const appts = await this.prisma.appointment.findMany({
      where: { customerId },
      include: {
        salon: { select: { name: true } },
        service: { select: { name: true } },
        staffMember: { select: { fullName: true } },
      },
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
      salonName: appt.salon.name,
      serviceName: appt.service.name,
      staffName: appt.staffMember.fullName,
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
