import type { PrismaClient, WorkingHours, DayOff, ChairUnavailable, Holiday } from '@prisma/client';

/**
 * Input shape for configuring a single working-hours block.
 */
export interface WorkingHoursInput {
  weekday: number; // 0 (Sunday) – 6 (Saturday)
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
}

/**
 * AvailabilityConfig manages schedule configuration for staff members,
 * chairs, and salon-level holidays.
 *
 * - Working hours (weekly recurring) for staff and chairs (R4.1, R4.2)
 * - Days off for staff members (R4.1)
 * - Unavailable periods for chairs (R4.2)
 * - Salon holidays (R4.3)
 *
 * All mutating operations are owner-guarded at the API layer;
 * this service focuses on persistence logic.
 */
export class AvailabilityConfig {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Replace all working hours for a staff member or chair (R4.1, R4.2).
   *
   * Deletes existing entries for the owner and creates the new set
   * in a single transaction (replace semantics).
   */
  async setWorkingHours(
    ownerKind: 'staff' | 'chair',
    ownerId: string,
    hours: WorkingHoursInput[],
  ): Promise<WorkingHours[]> {
    return this.prisma.$transaction(async (tx) => {
      // Remove all existing working hours for this owner
      await tx.workingHours.deleteMany({
        where: { ownerKind, ownerId },
      });

      // Create new entries
      if (hours.length === 0) {
        return [];
      }

      await tx.workingHours.createMany({
        data: hours.map((h) => ({
          ownerKind,
          ownerId,
          weekday: h.weekday,
          startTime: parseTime(h.startTime),
          endTime: parseTime(h.endTime),
        })),
      });

      // Return the newly created records
      return tx.workingHours.findMany({
        where: { ownerKind, ownerId },
      });
    });
  }

  /**
   * Retrieve configured working hours for a staff member or chair.
   */
  async getWorkingHours(ownerKind: 'staff' | 'chair', ownerId: string): Promise<WorkingHours[]> {
    return this.prisma.workingHours.findMany({
      where: { ownerKind, ownerId },
    });
  }

  /**
   * Add a day off / availability block for a staff member (R4.1). With no time
   * window it blocks the WHOLE day; with both `startTime` and `endTime` (HH:mm)
   * it blocks only that part of `onDate` for THIS stylist (a partial-day block).
   * Mirrors {@link addHoliday}; the scheduling engine carves it out per-staff.
   */
  async addDayOff(
    staffMemberId: string,
    onDate: string,
    startTime?: string | null,
    endTime?: string | null,
  ): Promise<DayOff> {
    const partial =
      typeof startTime === 'string' &&
      startTime !== '' &&
      typeof endTime === 'string' &&
      endTime !== '';
    return this.prisma.dayOff.create({
      // Cast: the checked-in Prisma client may predate the additive
      // start_time/end_time columns; the entrypoint regenerates before build.
      data: {
        staffMemberId,
        onDate: new Date(onDate),
        ...(partial
          ? { startTime: parseTime(startTime as string), endTime: parseTime(endTime as string) }
          : {}),
      } as never,
    });
  }

  /**
   * Remove a day off by its ID.
   */
  async removeDayOff(dayOffId: string): Promise<void> {
    await this.prisma.dayOff.delete({
      where: { id: dayOffId },
    });
  }

  /**
   * Remove a staff member's day-off/block, but only when it belongs to that
   * staff member (so a stylist can never delete another's via a guessed id).
   * Returns true when a row was deleted.
   */
  async removeDayOffForStaff(dayOffId: string, staffMemberId: string): Promise<boolean> {
    const result = await this.prisma.dayOff.deleteMany({
      where: { id: dayOffId, staffMemberId },
    });
    return result.count > 0;
  }

  /**
   * Retrieve all days off for a staff member.
   */
  async getDaysOff(staffMemberId: string): Promise<DayOff[]> {
    return this.prisma.dayOff.findMany({
      where: { staffMemberId },
    });
  }

  /**
   * Add an unavailable period for a chair (R4.2).
   */
  async addChairUnavailable(
    chairId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<ChairUnavailable> {
    return this.prisma.chairUnavailable.create({
      data: {
        chairId,
        periodStart,
        periodEnd,
      },
    });
  }

  /**
   * Remove a chair unavailable period by its ID.
   */
  async removeChairUnavailable(id: string): Promise<void> {
    await this.prisma.chairUnavailable.delete({
      where: { id },
    });
  }

  /**
   * Retrieve all unavailable periods for a chair.
   */
  async getChairUnavailable(chairId: string): Promise<ChairUnavailable[]> {
    return this.prisma.chairUnavailable.findMany({
      where: { chairId },
    });
  }

  /**
   * Add a salon closure (R4.3). With no time window it closes the WHOLE day (a
   * classic holiday); with both `startTime` and `endTime` (HH:mm) it blocks only
   * that part of `onDate` (a partial-day closure / hour-range block). The times
   * share the WorkingHours nominal clock and are enforced by the scheduling
   * engine (getAvailability + book).
   */
  async addHoliday(
    salonId: string,
    onDate: string,
    startTime?: string | null,
    endTime?: string | null,
  ): Promise<Holiday> {
    const partial =
      typeof startTime === 'string' &&
      startTime !== '' &&
      typeof endTime === 'string' &&
      endTime !== '';
    return this.prisma.holiday.create({
      // Cast: the checked-in Prisma client may predate the additive
      // start_time/end_time columns; the entrypoint regenerates before build.
      data: {
        salonId,
        onDate: new Date(onDate),
        ...(partial
          ? { startTime: parseTime(startTime as string), endTime: parseTime(endTime as string) }
          : {}),
      } as never,
    });
  }

  /**
   * Remove a salon holiday by its ID.
   */
  async removeHoliday(holidayId: string): Promise<void> {
    await this.prisma.holiday.delete({
      where: { id: holidayId },
    });
  }

  /**
   * Retrieve all closures for a salon, soonest date first.
   */
  async getHolidays(salonId: string): Promise<Holiday[]> {
    return this.prisma.holiday.findMany({
      where: { salonId },
      orderBy: { onDate: 'asc' },
    });
  }

  /**
   * Read the salon's effective approval-policy configuration for the owner UI:
   * the salon-level default plus every staff member's optional override (null =
   * inherit). Backs the RBAC-guarded `GET /salons/:id/approval-policy` route
   * (configure_salon). Throws if the salon does not exist.
   */
  async getApprovalPolicy(salonId: string): Promise<{
    autoApprove: boolean;
    staff: Array<{
      id: string;
      fullName: string | null;
      role: string;
      autoApprove: boolean | null;
      manageOwnAvailability: boolean;
    }>;
  }> {
    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
      select: { autoApprove: true },
    });
    if (!salon) {
      throw new Error('Salon not found');
    }
    const staff = (await this.prisma.staffMember.findMany({
      where: { salonId },
      // Cast: manageOwnAvailability is an additive column; the checked-in client
      // may predate it (the entrypoint regenerates before build).
      select: {
        id: true,
        fullName: true,
        role: true,
        autoApprove: true,
        manageOwnAvailability: true,
      } as never,
      orderBy: { fullName: 'asc' },
    })) as unknown as Array<{
      id: string;
      fullName: string | null;
      role: string;
      autoApprove: boolean | null;
      manageOwnAvailability: boolean;
    }>;
    return { autoApprove: salon.autoApprove, staff };
  }

  /**
   * Set the salon's default booking-approval policy (true = auto-confirm new
   * bookings, false = require manual admin approval).
   */
  async setSalonAutoApprove(salonId: string, autoApprove: boolean): Promise<void> {
    await this.prisma.salon.update({
      where: { id: salonId },
      data: { autoApprove },
    });
  }

  /**
   * Set (or clear) a stylist's approval-policy override. `null` inherits the
   * salon default; `true`/`false` overrides it for that stylist.
   */
  async setStaffAutoApprove(staffMemberId: string, autoApprove: boolean | null): Promise<void> {
    await this.prisma.staffMember.update({
      where: { id: staffMemberId },
      data: { autoApprove },
    });
  }

  /**
   * Grant or revoke a stylist's permission to manage their OWN availability
   * (block their own day or hours). Salon-controlled; Owner-only at the API
   * layer (`POST /staff/:id/manage-availability`, configure_salon).
   */
  async setStaffManageOwnAvailability(staffMemberId: string, allowed: boolean): Promise<void> {
    await this.prisma.staffMember.update({
      where: { id: staffMemberId },
      // Cast: additive column; the checked-in client may predate it.
      data: { manageOwnAvailability: allowed } as never,
    });
  }

  /**
   * Read a staff member's salonId + self-availability grant. Used to authorize
   * stylist self-service availability changes (must be their own staff record
   * AND the salon must have granted the permission). Null when not found.
   */
  async getStaffAvailabilityContext(
    staffMemberId: string,
  ): Promise<{ salonId: string; manageOwnAvailability: boolean } | null> {
    const staff = (await this.prisma.staffMember.findUnique({
      where: { id: staffMemberId },
      select: { salonId: true, manageOwnAvailability: true } as never,
    })) as unknown as { salonId: string; manageOwnAvailability?: boolean } | null;
    if (!staff) return null;
    return {
      salonId: staff.salonId,
      manageOwnAvailability: staff.manageOwnAvailability === true,
    };
  }

  /**
   * Set (or clear) the salon's storefront Brand_Accent key (signature-ui-system
   * R4.1). `null` clears the accent so the storefront falls back to the signature
   * default palette; a non-null value is an opaque accent key (e.g. "rose")
   * resolved client-side. Mirrors {@link setSalonAutoApprove}; owner-guarded at
   * the API layer (`POST /salons/:id/brand-accent`, configure_salon).
   */
  async setSalonBrandAccent(salonId: string, brandAccent: string | null): Promise<void> {
    await this.prisma.salon.update({
      where: { id: salonId },
      data: { brandAccent },
    });
  }
}

/**
 * Parse an "HH:mm" time string into a Date object with time-only semantics.
 * Prisma's @db.Time is stored as a Date with date portion at epoch (1970-01-01).
 */
function parseTime(time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const d = new Date('1970-01-01T00:00:00.000Z');
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}
