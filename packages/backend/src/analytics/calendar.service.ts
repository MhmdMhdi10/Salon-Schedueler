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
   *
   * Each row is enriched with the related service name, customer full name, and
   * staff member full name so the calendar UI can label bookings without extra
   * round-trips. The return type is inferred as the enriched Prisma row type.
   */
  async getStaffCalendar(staffId: string, from: Date, to: Date) {
    return this.prisma.appointment.findMany({
      where: {
        staffMemberId: staffId,
        status: { in: ['pending', 'held', 'confirmed', 'completed'] },
        startAt: { lt: to },
        endAt: { gt: from },
      },
      include: {
        service: { select: { name: true } },
        customer: { select: { fullName: true } },
        staffMember: { select: { fullName: true } },
      },
      orderBy: { startAt: 'asc' },
    });
  }

  /**
   * Get all appointments for a whole salon within a date range (R15.1, R15.2).
   * Used by the RBAC-guarded `GET /salons/:id/calendar` route. Includes held,
   * confirmed, and completed appointments; excludes statuses that no longer occupy
   * a (staff, chair) pair.
   *
   * Each row is enriched with the related service name, customer full name, and
   * staff member full name so the calendar UI can label bookings and group by
   * staff. The return type is inferred as the enriched Prisma row type.
   */
  async getSalonCalendar(salonId: string, from: Date, to: Date) {
    return this.prisma.appointment.findMany({
      where: {
        salonId,
        status: { in: ['pending', 'held', 'confirmed', 'completed'] },
        startAt: { lt: to },
        endAt: { gt: from },
      },
      include: {
        service: { select: { name: true } },
        customer: { select: { fullName: true } },
        staffMember: { select: { fullName: true } },
      },
      orderBy: { startAt: 'asc' },
    });
  }

  /**
   * Get the salon's bookings awaiting admin approval (status 'pending'), oldest
   * request first. Backs the approval queue (`GET /salons/:id/pending`). When
   * `staffMemberId` is provided the queue is scoped to that stylist's own
   * requests (R2.5) — Owner/Admin pass no scope and see the whole salon. Not
   * date-bounded — the queue surfaces every outstanding request.
   *
   * Enriched with the service name, customer full name, and staff member full
   * name so the approvals UI can label each request without extra round-trips.
   */
  async getPendingAppointments(salonId: string, staffMemberId?: string) {
    return this.prisma.appointment.findMany({
      where: {
        salonId,
        status: 'pending',
        ...(staffMemberId ? { staffMemberId } : {}),
      },
      include: {
        service: { select: { name: true } },
        customer: { select: { fullName: true } },
        staffMember: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Read a single appointment by id (or null). Used by the approve/reject routes
   * to authorize the caller against the appointment's owner before acting.
   */
  async getAppointmentById(id: string): Promise<Appointment | null> {
    return this.prisma.appointment.findUnique({ where: { id } });
  }
}
