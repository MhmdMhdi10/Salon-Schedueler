import type { PrismaClient, Appointment } from '@prisma/client';

/**
 * Calendar query input for fetching appointments in a range.
 */
export interface CalendarQuery {
  from: Date;
  to: Date;
}

/**
 * CalendarService provides day/week calendar views per chair and per staff.
 *
 * Returns appointments in a date range reflecting create/modify/cancel from any client.
 * Requirements: R15.1, R15.2, R15.3
 */
export class CalendarService {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get all appointments for a specific chair within a date range (R15.1).
   * Includes held, confirmed, and completed appointments.
   * Excludes cancelled, no_show, and expired since they no longer occupy the chair.
   */
  async getChairCalendar(chairId: string, from: Date, to: Date): Promise<Appointment[]> {
    return this.prisma.appointment.findMany({
      where: {
        chairId,
        status: { in: ['pending', 'held', 'confirmed', 'completed'] },
        startAt: { lt: to },
        endAt: { gt: from },
      },
      orderBy: { startAt: 'asc' },
    });
  }

  /**
   * Get all appointments for a specific staff member within a date range (R15.2).
   * Includes held, confirmed, and completed appointments.
   * Excludes cancelled, no_show, and expired since they no longer occupy the staff.
   */
  async getStaffCalendar(staffId: string, from: Date, to: Date): Promise<Appointment[]> {
    return this.prisma.appointment.findMany({
      where: {
        staffMemberId: staffId,
        status: { in: ['pending', 'held', 'confirmed', 'completed'] },
        startAt: { lt: to },
        endAt: { gt: from },
      },
      orderBy: { startAt: 'asc' },
    });
  }

  /**
   * Get all appointments for a whole salon within a date range (R15.1, R15.2).
   * Used by the RBAC-guarded `GET /salons/:id/calendar` route. Includes held,
   * confirmed, and completed appointments; excludes statuses that no longer occupy
   * a (staff, chair) pair.
   */
  async getSalonCalendar(salonId: string, from: Date, to: Date): Promise<Appointment[]> {
    return this.prisma.appointment.findMany({
      where: {
        salonId,
        status: { in: ['pending', 'held', 'confirmed', 'completed'] },
        startAt: { lt: to },
        endAt: { gt: from },
      },
      orderBy: { startAt: 'asc' },
    });
  }

  /**
   * Get the salon's bookings awaiting admin approval (status 'pending'), oldest
   * request first. Backs the admin approval queue (`GET /salons/:id/pending`)
   * from which an admin approves or rejects each request. Not date-bounded — the
   * queue should surface every outstanding request regardless of appointment time.
   */
  async getPendingAppointments(salonId: string): Promise<Appointment[]> {
    return this.prisma.appointment.findMany({
      where: {
        salonId,
        status: 'pending',
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
