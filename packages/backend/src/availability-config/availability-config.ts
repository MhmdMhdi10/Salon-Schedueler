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
   * Add a day off for a staff member (R4.1).
   */
  async addDayOff(staffMemberId: string, onDate: string): Promise<DayOff> {
    return this.prisma.dayOff.create({
      data: {
        staffMemberId,
        onDate: new Date(onDate),
      },
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
   * Add a salon holiday (R4.3).
   */
  async addHoliday(salonId: string, onDate: string): Promise<Holiday> {
    return this.prisma.holiday.create({
      data: {
        salonId,
        onDate: new Date(onDate),
      },
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
   * Retrieve all holidays for a salon.
   */
  async getHolidays(salonId: string): Promise<Holiday[]> {
    return this.prisma.holiday.findMany({
      where: { salonId },
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
