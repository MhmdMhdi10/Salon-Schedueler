import type { Prisma, SalonNotification, PrismaClient } from '@prisma/client';

/**
 * Audience scope for a salon inbox notification. Determines which
 * connected admin clients receive the realtime push, and which rows
 * are returned by the inbox list endpoint for a given principal.
 */
export type InboxAudience = 'owner' | 'admin' | 'stylist' | 'all-staff';

/**
 * The shape of a notification's structured payload — opaque box of
 * optional references the UI uses to deep-link (e.g. tap a pending
 * booking row → jump to the calendar on that date).
 */
export interface InboxPayload {
  appointmentId?: string;
  orderId?: string;
  staffMemberId?: string;
  customerId?: string;
  date?: string;
  [key: string]: unknown;
}

/**
 * Minimal shape delivered over the WS channel — the row plus the
 * freshly-assigned server `id` so the client can dedupe / track read state.
 */
export interface InboxEvent {
  id: string;
  salonId: string;
  audience: InboxAudience;
  staffMemberId: string | null;
  type: string;
  title: string;
  body: string;
  payload: InboxPayload | null;
  readAt: string | null;
  createdAt: string;
}

export interface CreateInboxNotificationInput {
  salonId: string;
  audience?: InboxAudience;
  staffMemberId?: string | null;
  type: string;
  title: string;
  body: string;
  payload?: InboxPayload | null;
}

/**
 * Hub is the pluggable realtime broadcaster. The HTTP process keeps an
 * in-memory map of salon sc-rooms; an honest farm deployment would use
 * Redis pub/sub instead. Both implement the same port.
 */
export interface InboxHub {
  broadcast(
    salonId: string,
    audience: InboxAudience,
    staffMemberId: string | null,
    event: InboxEvent,
  ): void;
}

export class NullInboxHub implements InboxHub {
  broadcast() {
    // No-op; tests can swap an in-memory capture here.
  }
}

/**
 * SalonInboxService persists durable inbox notifications and emits a
 * transient copy via the attached {@link InboxHub}.
 *
 * The durable row is read by the dashboard inbox UI; the hub event is
 * delivered live to connected admin web clients (see the WS route).
 *
 * Notifications are best-effort — a hub failure never rolls back the
 * persisted row. The whole transaction lives on the HTTP process for now.
 */
export class SalonInboxService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly hub: InboxHub = new NullInboxHub(),
  ) {}

  private visibilityWhere(
    salonId: string,
    opts: { staffMemberId?: string; role: string; onlyUnread?: boolean },
  ): Prisma.SalonNotificationWhereInput {
    const base: Prisma.SalonNotificationWhereInput = {
      salonId,
      ...(opts.onlyUnread ? { readAt: null } : {}),
    };
    if (opts.role === 'Owner' || opts.role === 'Admin' || opts.role === 'PlatformAdmin')
      return base;

    return {
      ...base,
      OR: [
        { audience: 'all-staff' },
        ...(opts.staffMemberId ? [{ staffMemberId: opts.staffMemberId }] : []),
      ],
    };
  }

  /**
   * Create + persist a notification, then fan-out the live event. Best-effort
   * delivery; a hub exception is swallowed and logged — the row is already
   * saved so the inbox list endpoint will show it on the next poll.
   */
  async emit(input: CreateInboxNotificationInput): Promise<SalonNotification> {
    const row = await this.prisma.salonNotification.create({
      data: {
        salonId: input.salonId,
        audience: input.audience ?? 'owner',
        staffMemberId: input.staffMemberId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: (input.payload ?? null) as any,
      },
    });
    const event: InboxEvent = {
      id: row.id,
      salonId: row.salonId,
      audience: row.audience as InboxAudience,
      staffMemberId: row.staffMemberId,
      type: row.type,
      title: row.title,
      body: row.body,
      payload: (row.payload as InboxPayload | null) ?? null,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
    try {
      this.hub.broadcast(row.salonId, event.audience, event.staffMemberId, event);
    } catch {
      // swallow — realtime is best-effort; row is durable for inbox list
    }
    return row;
  }

  /**
   * List inbox notifications visible to the caller. Owner/Admin see all
   * salon-scoped rows; a Stylist sees only `audience='all-staff'` rows
   * + rows explicitly targeted to their staffMemberId.
   */
  async listForSalon(
    salonId: string,
    opts: {
      staffMemberId?: string;
      role: string;
      onlyUnread?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<SalonNotification[]> {
    const limit = opts.limit ?? 50;
    return this.prisma.salonNotification.findMany({
      where: this.visibilityWhere(salonId, opts),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: Math.max(0, opts.offset ?? 0),
      take: limit,
    });
  }

  /** Count all visible rows for the active filter, for server-side pagination. */
  async countForSalon(
    salonId: string,
    opts: { staffMemberId?: string; role: string; onlyUnread?: boolean },
  ): Promise<number> {
    return this.prisma.salonNotification.count({
      where: this.visibilityWhere(salonId, opts),
    });
  }

  /**
   * Mark a single notification read only when it is visible to caller. The
   * notification id is not a sufficient authorization boundary: it must also
   * match the caller's salon and audience scope.
   */
  async markRead(
    notificationId: string,
    opts: { salonId?: string; staffMemberId?: string; role: string },
  ): Promise<SalonNotification | null> {
    try {
      const row = await this.prisma.salonNotification.findUnique({
        where: { id: notificationId },
      });
      if (!row || !opts.salonId || row.salonId !== opts.salonId) return null;

      const visible =
        opts.role === 'Owner' || opts.role === 'Admin' || opts.role === 'PlatformAdmin'
          ? true
          : opts.role === 'Stylist' &&
            (row.audience === 'all-staff' || row.staffMemberId === opts.staffMemberId);
      if (!visible) return null;

      return await this.prisma.salonNotification.update({
        where: { id: notificationId },
        data: { readAt: new Date() },
      });
    } catch {
      return null;
    }
  }

  /**
   * Mark every unread notification visible to the caller as read.
   * Returns the count of rows affected.
   */
  async markAllRead(
    salonId: string,
    opts: { staffMemberId?: string; role: string },
  ): Promise<number> {
    const where =
      opts.role === 'Owner' || opts.role === 'Admin' || opts.role === 'PlatformAdmin'
        ? { salonId, readAt: null }
        : {
            salonId,
            readAt: null,
            OR: [
              { audience: 'all-staff' as const },
              { staffMemberId: opts.staffMemberId ?? undefined },
            ],
          };
    const result = await this.prisma.salonNotification.updateMany({
      where,
      data: { readAt: new Date() },
    });
    return result.count;
  }

  /** Count unread notifications for the caller — used by the badge. */
  async countUnread(
    salonId: string,
    opts: { staffMemberId?: string; role: string },
  ): Promise<number> {
    return this.countForSalon(salonId, { ...opts, onlyUnread: true });
  }
}
