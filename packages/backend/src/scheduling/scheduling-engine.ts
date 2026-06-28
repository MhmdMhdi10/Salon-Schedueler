import type { PrismaClient, Appointment } from '@prisma/client';
import {
  generateCandidateStarts,
  intervalsOverlap,
  computeOccupancyEnd,
} from '@salon/shared';

/**
 * Query input for availability computation.
 */
export interface AvailabilityQuery {
  salonId: string;
  serviceId: string;
  date: string; // ISO date in salon timezone (e.g., '2024-03-15')
  granularityMinutes?: number; // default 15
}

/**
 * A bookable time slot.
 */
export interface TimeSlot {
  startAt: string; // ISO datetime
  endAt: string; // ISO datetime (start + duration + buffer)
}

/**
 * Input for creating a booking.
 * Requirements: R9, R13.1, R14.3
 */
export interface BookingRequest {
  salonId: string;
  serviceId: string;
  startAt: string; // ISO datetime
  customerId: string;
  preferredStaffId?: string; // R14.3
  source: 'web' | 'mobile' | 'walkin' | 'bot'; // R13.1 (+ 'bot' for in-chat booking, Requirement 1.6)
}

/**
 * Result of a booking attempt.
 */
export type BookingResult =
  | { status: 'pending'; appointment: Appointment } // R9.1, R9.7 — awaiting admin approval
  | { status: 'confirmed'; appointment: Appointment } // auto-approved (salon/stylist policy)
  | { status: 'held'; appointment: Appointment; payment: { paymentId: string; redirectUrl: string } } // R10.1, R10.2
  | { status: 'rejected'; reason: 'no_availability' | 'slot_unavailable' }; // R9.2, R9.6

/**
 * Configuration options for SchedulingEngine.
 */
export interface SchedulingEngineOptions {
  /** Hold period in seconds for deposit-required services. Default: 900 (15 minutes) */
  holdPeriodSeconds?: number;
}

/** Maximum number of insert retries when exclusion constraint violations occur */
const MAX_BOOKING_RETRIES = 3;

/** Default hold period: 15 minutes (900 seconds) */
const DEFAULT_HOLD_PERIOD_SECONDS = 900;

/**
 * SchedulingEngine computes availability for a salon's services.
 *
 * The `getAvailability` method implements the availability algorithm (R8):
 * 1. Resolve qualified staff (service_staff ∩ working hours ∩ ¬day-off ∩ ¬holiday)
 * 2. Resolve compatible chairs (equipment match ∩ working hours ∩ ¬unavailable ∩ ¬holiday)
 * 3. Walk candidate starts at granularity intervals
 * 4. Emit slots where at least one free staff AND one free chair exist
 * 5. Return [] if no (staff, chair) pair is ever simultaneously free
 */
export class SchedulingEngine {
  private readonly prisma: PrismaClient;
  private readonly holdPeriodSeconds: number;

  constructor(prisma: PrismaClient, options?: SchedulingEngineOptions) {
    this.prisma = prisma;
    this.holdPeriodSeconds = options?.holdPeriodSeconds ?? DEFAULT_HOLD_PERIOD_SECONDS;
  }

  /**
   * Compute available time slots for a service on a given date.
   *
   * Requirements: R4.4, R4.5, R6.2, R6.3, R8.1, R8.2, R8.3, R8.4
   */
  async getAvailability(query: AvailabilityQuery): Promise<TimeSlot[]> {
    const { salonId, serviceId, date, granularityMinutes = 15 } = query;

    // 1. Fetch the service details
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        serviceStaff: true,
        serviceEquipment: true,
      },
    });

    if (!service || service.salonId !== salonId) {
      return [];
    }

    const durationMin = service.durationMin;
    const bufferMin = service.bufferMin;
    const requiredEquipmentIds = service.serviceEquipment.map((se) => se.equipmentId);

    // 2. Check if date is a salon holiday (R4.5)
    const targetDate = new Date(date + 'T00:00:00Z');
    const isHoliday = await this.prisma.holiday.findFirst({
      where: {
        salonId,
        onDate: targetDate,
      },
    });

    if (isHoliday) {
      return []; // R4.5: exclude holidays from availability
    }

    // 3. Resolve qualified staff set (R6.2)
    const qualifiedStaffIds = service.serviceStaff.map((ss) => ss.staffMemberId);
    if (qualifiedStaffIds.length === 0) {
      return []; // No staff can perform this service
    }

    // Fetch the staff members (only active ones)
    const qualifiedStaff = await this.prisma.staffMember.findMany({
      where: {
        id: { in: qualifiedStaffIds },
        salonId,
        active: true,
      },
    });

    if (qualifiedStaff.length === 0) {
      return [];
    }

    // 4. Filter staff by working hours on target weekday (R4.4)
    const weekday = targetDate.getUTCDay(); // 0=Sun, 6=Sat

    const staffWorkingHours = await this.prisma.workingHours.findMany({
      where: {
        ownerKind: 'staff',
        ownerId: { in: qualifiedStaff.map((s) => s.id) },
        weekday,
      },
    });

    // Group working hours by staff id
    const staffHoursMap = new Map<string, { startTime: Date; endTime: Date }[]>();
    for (const wh of staffWorkingHours) {
      const existing = staffHoursMap.get(wh.ownerId) ?? [];
      existing.push({ startTime: wh.startTime, endTime: wh.endTime });
      staffHoursMap.set(wh.ownerId, existing);
    }

    // Staff with working hours on this day (those without hours are excluded per R4.4)
    const staffWithHours = qualifiedStaff.filter((s) => staffHoursMap.has(s.id));

    if (staffWithHours.length === 0) {
      return [];
    }

    // 5. Filter staff by days off (R4.4)
    const daysOff = await this.prisma.dayOff.findMany({
      where: {
        staffMemberId: { in: staffWithHours.map((s) => s.id) },
        onDate: targetDate,
      },
    });

    const staffOnDayOff = new Set(daysOff.map((d) => d.staffMemberId));
    const availableStaff = staffWithHours.filter((s) => !staffOnDayOff.has(s.id));

    if (availableStaff.length === 0) {
      return [];
    }

    // 6. Resolve compatible chair set (R6.3)
    let compatibleChairs;
    if (requiredEquipmentIds.length === 0) {
      // No equipment required: all active chairs in salon are compatible
      compatibleChairs = await this.prisma.chair.findMany({
        where: { salonId, active: true },
      });
    } else {
      // Find chairs that have ALL required equipment
      compatibleChairs = await this.findChairsWithAllEquipment(salonId, requiredEquipmentIds);
    }

    if (compatibleChairs.length === 0) {
      return [];
    }

    // 7. Filter chairs by working hours on target weekday (R4.2)
    const chairWorkingHours = await this.prisma.workingHours.findMany({
      where: {
        ownerKind: 'chair',
        ownerId: { in: compatibleChairs.map((c) => c.id) },
        weekday,
      },
    });

    const chairHoursMap = new Map<string, { startTime: Date; endTime: Date }[]>();
    for (const wh of chairWorkingHours) {
      const existing = chairHoursMap.get(wh.ownerId) ?? [];
      existing.push({ startTime: wh.startTime, endTime: wh.endTime });
      chairHoursMap.set(wh.ownerId, existing);
    }

    const chairsWithHours = compatibleChairs.filter((c) => chairHoursMap.has(c.id));

    if (chairsWithHours.length === 0) {
      return [];
    }

    // 8. Filter chairs by unavailability periods (R4.2)
    const chairUnavailable = await this.prisma.chairUnavailable.findMany({
      where: {
        chairId: { in: chairsWithHours.map((c) => c.id) },
      },
    });

    // Group unavailability by chair
    const chairUnavailableMap = new Map<string, { periodStart: Date; periodEnd: Date }[]>();
    for (const cu of chairUnavailable) {
      const existing = chairUnavailableMap.get(cu.chairId) ?? [];
      existing.push({ periodStart: cu.periodStart, periodEnd: cu.periodEnd });
      chairUnavailableMap.set(cu.chairId, existing);
    }

    // 9. Fetch existing appointments for the date (held/confirmed only)
    const dayStart = new Date(date + 'T00:00:00Z');
    const dayEnd = new Date(date + 'T23:59:59.999Z');

    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        salonId,
        // 'pending' (awaiting admin approval) reserves the slot just like 'held'
        // (awaiting payment) and 'confirmed', so it must hide the slot from
        // availability — mirroring the DB exclusion constraints.
        status: { in: ['pending', 'held', 'confirmed'] },
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
        OR: [
          { staffMemberId: { in: availableStaff.map((s) => s.id) } },
          { chairId: { in: chairsWithHours.map((c) => c.id) } },
        ],
      },
    });

    // Group appointments by staff and chair
    const staffAppointments = new Map<string, { start: Date; end: Date }[]>();
    const chairAppointments = new Map<string, { start: Date; end: Date }[]>();

    for (const appt of existingAppointments) {
      // Staff appointments
      const staffAppts = staffAppointments.get(appt.staffMemberId) ?? [];
      staffAppts.push({ start: appt.startAt, end: appt.endAt });
      staffAppointments.set(appt.staffMemberId, staffAppts);

      // Chair appointments
      const chairAppts = chairAppointments.get(appt.chairId) ?? [];
      chairAppts.push({ start: appt.startAt, end: appt.endAt });
      chairAppointments.set(appt.chairId, chairAppts);
    }

    // 10. Walk candidate starts and check availability
    const slots: TimeSlot[] = [];

    // Collect all unique working-hour windows across staff and chairs
    // to determine the overall day window for candidate generation
    const allStaffWindows = this.getAbsoluteWindows(staffHoursMap, availableStaff.map((s) => s.id), date);
    const allChairWindows = this.getAbsoluteWindows(chairHoursMap, chairsWithHours.map((c) => c.id), date);

    // The overall window is the union of all windows for candidate generation
    const overallStart = this.getEarliestStart(allStaffWindows, allChairWindows);
    const overallEnd = this.getLatestEnd(allStaffWindows, allChairWindows);

    if (!overallStart || !overallEnd || overallStart >= overallEnd) {
      return [];
    }

    // Generate candidate starts across the overall window
    const candidates = generateCandidateStarts(
      overallStart,
      overallEnd,
      durationMin,
      bufferMin,
      granularityMinutes,
    );

    // For each candidate start, check if any staff + any chair are simultaneously free
    for (const candidateStart of candidates) {
      const candidateEnd = computeOccupancyEnd(candidateStart, durationMin, bufferMin);
      const candidateInterval = { start: candidateStart, end: candidateEnd };

      // Check if at least one qualified staff is free for this interval
      const staffFree = this.isAnyStaffFree(
        availableStaff.map((s) => s.id),
        staffHoursMap,
        staffAppointments,
        candidateStart,
        candidateEnd,
        date,
      );

      if (!staffFree) {
        continue; // R8.2: all qualified staff busy
      }

      // Check if at least one compatible chair is free for this interval
      const chairFree = this.isAnyChairFree(
        chairsWithHours.map((c) => c.id),
        chairHoursMap,
        chairAppointments,
        chairUnavailableMap,
        candidateStart,
        candidateEnd,
        date,
      );

      if (!chairFree) {
        continue; // R8.3: all compatible chairs busy
      }

      // R8.1: emit the slot
      slots.push({
        startAt: candidateStart.toISOString(),
        endAt: candidateEnd.toISOString(),
      });
    }

    return slots; // R8.4: if empty, no pair was free
  }

  /**
   * Book an appointment for a service at a given time.
   *
   * Implements the booking algorithm (R9, R13.1):
   * 1. Fetch service details
   * 2. Compute occupancy interval [startAt, startAt + duration + buffer)
   * 3. Find qualified staff available at that interval
   * 4. Find compatible chairs available at that interval
   * 5. If preferredStaffId is provided and qualified+free, prioritize them (R14.3)
   * 6. Try to insert appointment with bounded retries (max 3) catching exclusion violations
   * 7. Return confirmed appointment or rejected reason
   *
   * Requirements: R9.1, R9.2, R9.6, R9.7, R13.1
   */
  async book(req: BookingRequest): Promise<BookingResult> {
    const { salonId, serviceId, startAt: startAtISO, customerId, preferredStaffId, source } = req;

    // 1. Fetch service details
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        serviceStaff: true,
        serviceEquipment: true,
        // The salon's default approval policy (auto-confirm vs manual).
        salon: { select: { autoApprove: true } },
      },
    });

    if (!service || service.salonId !== salonId) {
      return { status: 'rejected', reason: 'no_availability' };
    }

    // 2. Compute the occupancy interval
    const startAt = new Date(startAtISO);
    const endAt = computeOccupancyEnd(startAt, service.durationMin, service.bufferMin);
    const date = startAtISO.slice(0, 10); // Extract ISO date portion

    // 3. Check if date is a salon holiday
    const targetDate = new Date(date + 'T00:00:00Z');
    const isHoliday = await this.prisma.holiday.findFirst({
      where: { salonId, onDate: targetDate },
    });

    if (isHoliday) {
      return { status: 'rejected', reason: 'no_availability' };
    }

    // 4. Resolve qualified staff (service_staff ∩ active ∩ working hours ∩ ¬day-off)
    const qualifiedStaffIds = service.serviceStaff.map((ss) => ss.staffMemberId);
    if (qualifiedStaffIds.length === 0) {
      return { status: 'rejected', reason: 'no_availability' };
    }

    const qualifiedStaff = await this.prisma.staffMember.findMany({
      where: {
        id: { in: qualifiedStaffIds },
        salonId,
        active: true,
      },
    });

    if (qualifiedStaff.length === 0) {
      return { status: 'rejected', reason: 'no_availability' };
    }

    // Filter by working hours on the target weekday
    const weekday = targetDate.getUTCDay();
    const staffWorkingHours = await this.prisma.workingHours.findMany({
      where: {
        ownerKind: 'staff',
        ownerId: { in: qualifiedStaff.map((s) => s.id) },
        weekday,
      },
    });

    const staffHoursMap = new Map<string, { startTime: Date; endTime: Date }[]>();
    for (const wh of staffWorkingHours) {
      const existing = staffHoursMap.get(wh.ownerId) ?? [];
      existing.push({ startTime: wh.startTime, endTime: wh.endTime });
      staffHoursMap.set(wh.ownerId, existing);
    }

    const staffWithHours = qualifiedStaff.filter((s) => staffHoursMap.has(s.id));
    if (staffWithHours.length === 0) {
      return { status: 'rejected', reason: 'no_availability' };
    }

    // Filter by days off
    const daysOff = await this.prisma.dayOff.findMany({
      where: {
        staffMemberId: { in: staffWithHours.map((s) => s.id) },
        onDate: targetDate,
      },
    });
    const staffOnDayOff = new Set(daysOff.map((d) => d.staffMemberId));
    const availableStaff = staffWithHours.filter((s) => !staffOnDayOff.has(s.id));

    if (availableStaff.length === 0) {
      return { status: 'rejected', reason: 'no_availability' };
    }

    // 5. Resolve compatible chairs (equipment match ∩ active ∩ working hours ∩ ¬unavailable)
    const requiredEquipmentIds = service.serviceEquipment.map((se) => se.equipmentId);
    let compatibleChairs;
    if (requiredEquipmentIds.length === 0) {
      compatibleChairs = await this.prisma.chair.findMany({
        where: { salonId, active: true },
      });
    } else {
      compatibleChairs = await this.findChairsWithAllEquipment(salonId, requiredEquipmentIds);
    }

    if (compatibleChairs.length === 0) {
      return { status: 'rejected', reason: 'no_availability' };
    }

    // Filter chairs by working hours
    const chairWorkingHours = await this.prisma.workingHours.findMany({
      where: {
        ownerKind: 'chair',
        ownerId: { in: compatibleChairs.map((c) => c.id) },
        weekday,
      },
    });

    const chairHoursMap = new Map<string, { startTime: Date; endTime: Date }[]>();
    for (const wh of chairWorkingHours) {
      const existing = chairHoursMap.get(wh.ownerId) ?? [];
      existing.push({ startTime: wh.startTime, endTime: wh.endTime });
      chairHoursMap.set(wh.ownerId, existing);
    }

    const chairsWithHours = compatibleChairs.filter((c) => chairHoursMap.has(c.id));
    if (chairsWithHours.length === 0) {
      return { status: 'rejected', reason: 'no_availability' };
    }

    // Filter chairs by unavailability periods
    const chairUnavailable = await this.prisma.chairUnavailable.findMany({
      where: { chairId: { in: chairsWithHours.map((c) => c.id) } },
    });

    const chairUnavailableMap = new Map<string, { periodStart: Date; periodEnd: Date }[]>();
    for (const cu of chairUnavailable) {
      const existing = chairUnavailableMap.get(cu.chairId) ?? [];
      existing.push({ periodStart: cu.periodStart, periodEnd: cu.periodEnd });
      chairUnavailableMap.set(cu.chairId, existing);
    }

    // 6. Fetch existing appointments overlapping the interval
    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        salonId,
        status: { in: ['held', 'confirmed'] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        OR: [
          { staffMemberId: { in: availableStaff.map((s) => s.id) } },
          { chairId: { in: chairsWithHours.map((c) => c.id) } },
        ],
      },
    });

    const staffAppointments = new Map<string, { start: Date; end: Date }[]>();
    const chairAppointments = new Map<string, { start: Date; end: Date }[]>();

    for (const appt of existingAppointments) {
      const staffAppts = staffAppointments.get(appt.staffMemberId) ?? [];
      staffAppts.push({ start: appt.startAt, end: appt.endAt });
      staffAppointments.set(appt.staffMemberId, staffAppts);

      const chairAppts = chairAppointments.get(appt.chairId) ?? [];
      chairAppts.push({ start: appt.startAt, end: appt.endAt });
      chairAppointments.set(appt.chairId, chairAppts);
    }

    // 7. Build candidate (staff, chair) pairs
    const freeStaff = this.getFreeStaffIds(
      availableStaff.map((s) => s.id),
      staffHoursMap,
      staffAppointments,
      startAt,
      endAt,
      date,
    );

    const freeChairs = this.getFreeChairIds(
      chairsWithHours.map((c) => c.id),
      chairHoursMap,
      chairAppointments,
      chairUnavailableMap,
      startAt,
      endAt,
      date,
    );

    if (freeStaff.length === 0 || freeChairs.length === 0) {
      return { status: 'rejected', reason: 'no_availability' }; // R9.2
    }

    // 8. If preferredStaffId is provided and in free set, prioritize (R14.3)
    if (preferredStaffId && freeStaff.includes(preferredStaffId)) {
      const idx = freeStaff.indexOf(preferredStaffId);
      if (idx > 0) {
        freeStaff.splice(idx, 1);
        freeStaff.unshift(preferredStaffId);
      }
    }

    // 9. Build ordered candidate pairs
    const candidatePairs: { staffId: string; chairId: string }[] = [];
    for (const staffId of freeStaff) {
      for (const chairId of freeChairs) {
        candidatePairs.push({ staffId, chairId });
      }
    }

    // 10. Try to insert with bounded retries (R9.5, R9.6)
    for (let attempt = 0; attempt < Math.min(candidatePairs.length, MAX_BOOKING_RETRIES); attempt++) {
      const { staffId, chairId } = candidatePairs[attempt];

      try {
        // R10.1: If service requires deposit, create as 'held' with hold_expires_at.
        // Otherwise create as 'pending' — the booking awaits salon admin approval
        // before it becomes 'confirmed' and the customer is notified. Both states
        // reserve the slot via the no-overlap exclusion constraints.
        const requiresDeposit = service.requiresDeposit === true;
        const now = new Date();
        const holdExpiresAt = requiresDeposit
          ? new Date(now.getTime() + this.holdPeriodSeconds * 1000)
          : null;
        // Approval policy: a per-stylist override (if set) wins over the salon
        // default. Auto-approve confirms the booking immediately; otherwise it is
        // created 'pending' for manual admin approval. Deposit-required services
        // are always 'held' until payment, regardless of the approval policy.
        const chosenStaff = availableStaff.find((s) => s.id === staffId);
        const effectiveAutoApprove =
          chosenStaff?.autoApprove ?? service.salon?.autoApprove ?? false;
        const appointmentStatus = requiresDeposit
          ? 'held'
          : effectiveAutoApprove
            ? 'confirmed'
            : 'pending';

        const appointment = await this.prisma.appointment.create({
          data: {
            salonId,
            customerId,
            staffMemberId: staffId,
            chairId,
            serviceId,
            startAt,
            endAt,
            status: appointmentStatus,
            // The checked-in generated Prisma client can be stale and may not
            // yet include the additive `bot` value in its `ApptSource` type even
            // though the DB enum has it (migration 00000002). Cast through
            // `unknown` so this compiles against a stale client while still
            // persisting the real runtime value (e.g. 'bot').
            source: source as unknown as 'web',
            holdExpiresAt,
          },
        });

        if (requiresDeposit) {
          // R10.1, R10.2: Return held appointment with payment placeholder
          return {
            status: 'held',
            appointment,
            payment: {
              paymentId: `pay_${appointment.id}`,
              redirectUrl: `/payments/deposit/${appointment.id}`,
            },
          };
        }

        // Auto-approved -> 'confirmed' (the customer is notified by BookingFlow);
        // otherwise 'pending' until an admin approves.
        return appointmentStatus === 'confirmed'
          ? { status: 'confirmed', appointment }
          : { status: 'pending', appointment };
      } catch (error: any) {
        // Check if this is a PostgreSQL exclusion constraint violation
        // Prisma wraps it as a unique constraint violation (P2002) or raw database error
        if (this.isExclusionViolation(error)) {
          // R9.5/R9.6: Retry with next candidate pair
          continue;
        }
        // Unexpected error — rethrow
        throw error;
      }
    }

    // All retries exhausted — R9.6
    return { status: 'rejected', reason: 'slot_unavailable' };
  }

  /**
   * Release all expired holds by flipping status from 'held' to 'expired'.
   * Runs as a worker — updates all rows where status='held' AND hold_expires_at <= now
   * in a single atomic updateMany.
   *
   * Requirements: R10.4
   *
   * @param now - The current time (allows injection for testing)
   * @returns The count of released appointments
   */
  async releaseExpiredHolds(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.appointment.updateMany({
      where: {
        status: 'held',
        holdExpiresAt: { lte: now },
      },
      data: {
        status: 'expired',
      },
    });

    return result.count;
  }

  /**
   * Confirm a held appointment after successful payment verification.
   * Transitions the appointment from 'held' to 'confirmed'.
   *
   * Requirements: R10.3
   *
   * @param appointmentId - The ID of the held appointment to confirm
   * @returns The confirmed appointment
   * @throws Error if appointment not found or not in 'held' status
   */
  async confirmHeld(appointmentId: string): Promise<Appointment> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new Error(`Appointment ${appointmentId} not found`);
    }

    if (appointment.status !== 'held') {
      throw new Error(
        `Appointment ${appointmentId} cannot be confirmed: current status is '${appointment.status}', expected 'held'`,
      );
    }

    const confirmed = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'confirmed',
        holdExpiresAt: null,
      },
    });

    return confirmed;
  }

  /**
   * Approve a pending appointment (salon admin action). Transitions the
   * appointment from 'pending' to 'confirmed'. The slot was already reserved at
   * booking time (the exclusion constraints cover 'pending'), so approval cannot
   * introduce a double-booking. The customer confirmation notification is sent by
   * the application-layer BookingFlow.approve, not here.
   *
   * @param appointmentId - The ID of the pending appointment to approve
   * @returns The confirmed appointment
   * @throws Error if appointment not found or not in 'pending' status
   */
  async approve(appointmentId: string): Promise<Appointment> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new Error(`Appointment ${appointmentId} not found`);
    }

    if (appointment.status !== 'pending') {
      throw new Error(
        `Appointment ${appointmentId} cannot be approved: current status is '${appointment.status}', expected 'pending'`,
      );
    }

    const confirmed = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'confirmed',
        holdExpiresAt: null,
      },
    });

    return confirmed;
  }

  /**
   * Reject a pending appointment (salon admin action). Transitions the
   * appointment from 'pending' to 'cancelled', which drops it from the exclusion
   * constraints and frees the staff member and chair for the time window. The
   * customer rejection notification is sent by BookingFlow.reject, not here.
   *
   * @param appointmentId - The ID of the pending appointment to reject
   * @returns The cancelled appointment
   * @throws Error if appointment not found or not in 'pending' status
   */
  async reject(appointmentId: string): Promise<Appointment> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new Error(`Appointment ${appointmentId} not found`);
    }

    if (appointment.status !== 'pending') {
      throw new Error(
        `Appointment ${appointmentId} cannot be rejected: current status is '${appointment.status}', expected 'pending'`,
      );
    }

    const cancelled = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'cancelled',
        holdExpiresAt: null,
      },
    });

    return cancelled;
  }

  /**
   * Determine if a Prisma error represents a PostgreSQL exclusion constraint violation.
   * Prisma maps exclusion violations to P2002 (unique constraint) errors.
   */
  private isExclusionViolation(error: any): boolean {
    // Prisma PrismaClientKnownRequestError with code P2002
    if (error?.code === 'P2002') {
      return true;
    }
    // Raw database error with PostgreSQL exclusion violation (23P01)
    if (error?.code === '23P01') {
      return true;
    }
    // Check nested meta for constraint names
    if (error?.meta?.target?.includes('no_staff_overlap') ||
      error?.meta?.target?.includes('no_chair_overlap')) {
      return true;
    }
    // Prisma surfaces a PostgreSQL exclusion violation (e.g. a lost booking race)
    // as a PrismaClientUnknownRequestError: there is no top-level `code`, and the
    // PostgreSQL error code (23P01) / constraint name appear only in the message.
    // Detect those so the loser of a race retries and ultimately returns
    // 'rejected' instead of throwing. These constraints now also cover 'pending'.
    const message = typeof error?.message === 'string' ? error.message : '';
    if (
      message.includes('23P01') ||
      message.includes('no_staff_overlap') ||
      message.includes('no_chair_overlap') ||
      message.toLowerCase().includes('exclusion constraint')
    ) {
      return true;
    }
    return false;
  }

  /**
   * Get the list of staff IDs that are free for the given interval.
   */
  private getFreeStaffIds(
    staffIds: string[],
    staffHoursMap: Map<string, { startTime: Date; endTime: Date }[]>,
    staffAppointments: Map<string, { start: Date; end: Date }[]>,
    candidateStart: Date,
    candidateEnd: Date,
    date: string,
  ): string[] {
    const freeIds: string[] = [];
    for (const staffId of staffIds) {
      const hours = staffHoursMap.get(staffId) ?? [];

      const fitsInWindow = hours.some((wh) => {
        const windowStart = this.timeToAbsolute(wh.startTime, date);
        const windowEnd = this.timeToAbsolute(wh.endTime, date);
        return candidateStart >= windowStart && candidateEnd <= windowEnd;
      });

      if (!fitsInWindow) continue;

      const appointments = staffAppointments.get(staffId) ?? [];
      const hasOverlap = appointments.some((appt) =>
        intervalsOverlap(
          { start: candidateStart, end: candidateEnd },
          { start: appt.start, end: appt.end },
        ),
      );

      if (!hasOverlap) {
        freeIds.push(staffId);
      }
    }
    return freeIds;
  }

  /**
   * Get the list of chair IDs that are free for the given interval.
   */
  private getFreeChairIds(
    chairIds: string[],
    chairHoursMap: Map<string, { startTime: Date; endTime: Date }[]>,
    chairAppointments: Map<string, { start: Date; end: Date }[]>,
    chairUnavailableMap: Map<string, { periodStart: Date; periodEnd: Date }[]>,
    candidateStart: Date,
    candidateEnd: Date,
    date: string,
  ): string[] {
    const freeIds: string[] = [];
    for (const chairId of chairIds) {
      const hours = chairHoursMap.get(chairId) ?? [];

      const fitsInWindow = hours.some((wh) => {
        const windowStart = this.timeToAbsolute(wh.startTime, date);
        const windowEnd = this.timeToAbsolute(wh.endTime, date);
        return candidateStart >= windowStart && candidateEnd <= windowEnd;
      });

      if (!fitsInWindow) continue;

      const unavailPeriods = chairUnavailableMap.get(chairId) ?? [];
      const isUnavailable = unavailPeriods.some((period) =>
        intervalsOverlap(
          { start: candidateStart, end: candidateEnd },
          { start: period.periodStart, end: period.periodEnd },
        ),
      );

      if (isUnavailable) continue;

      const appointments = chairAppointments.get(chairId) ?? [];
      const hasOverlap = appointments.some((appt) =>
        intervalsOverlap(
          { start: candidateStart, end: candidateEnd },
          { start: appt.start, end: appt.end },
        ),
      );

      if (!hasOverlap) {
        freeIds.push(chairId);
      }
    }
    return freeIds;
  }

  /**
   * Check if any staff member is free for the given interval.
   * A staff member is free if:
   * - Their working hours contain the entire interval
   * - They have no overlapping held/confirmed appointments
   */
  private isAnyStaffFree(
    staffIds: string[],
    staffHoursMap: Map<string, { startTime: Date; endTime: Date }[]>,
    staffAppointments: Map<string, { start: Date; end: Date }[]>,
    candidateStart: Date,
    candidateEnd: Date,
    date: string,
  ): boolean {
    for (const staffId of staffIds) {
      const hours = staffHoursMap.get(staffId) ?? [];

      // Check if interval fits within any working-hours window
      const fitsInWindow = hours.some((wh) => {
        const windowStart = this.timeToAbsolute(wh.startTime, date);
        const windowEnd = this.timeToAbsolute(wh.endTime, date);
        return candidateStart >= windowStart && candidateEnd <= windowEnd;
      });

      if (!fitsInWindow) {
        continue;
      }

      // Check for appointment overlaps
      const appointments = staffAppointments.get(staffId) ?? [];
      const hasOverlap = appointments.some((appt) =>
        intervalsOverlap(
          { start: candidateStart, end: candidateEnd },
          { start: appt.start, end: appt.end },
        ),
      );

      if (!hasOverlap) {
        return true; // Found a free staff member
      }
    }
    return false;
  }

  /**
   * Check if any chair is free for the given interval.
   * A chair is free if:
   * - Its working hours contain the entire interval
   * - It has no overlapping held/confirmed appointments
   * - It's not in an unavailability period
   */
  private isAnyChairFree(
    chairIds: string[],
    chairHoursMap: Map<string, { startTime: Date; endTime: Date }[]>,
    chairAppointments: Map<string, { start: Date; end: Date }[]>,
    chairUnavailableMap: Map<string, { periodStart: Date; periodEnd: Date }[]>,
    candidateStart: Date,
    candidateEnd: Date,
    date: string,
  ): boolean {
    for (const chairId of chairIds) {
      const hours = chairHoursMap.get(chairId) ?? [];

      // Check if interval fits within any working-hours window
      const fitsInWindow = hours.some((wh) => {
        const windowStart = this.timeToAbsolute(wh.startTime, date);
        const windowEnd = this.timeToAbsolute(wh.endTime, date);
        return candidateStart >= windowStart && candidateEnd <= windowEnd;
      });

      if (!fitsInWindow) {
        continue;
      }

      // Check for unavailability periods
      const unavailPeriods = chairUnavailableMap.get(chairId) ?? [];
      const isUnavailable = unavailPeriods.some((period) =>
        intervalsOverlap(
          { start: candidateStart, end: candidateEnd },
          { start: period.periodStart, end: period.periodEnd },
        ),
      );

      if (isUnavailable) {
        continue;
      }

      // Check for appointment overlaps
      const appointments = chairAppointments.get(chairId) ?? [];
      const hasOverlap = appointments.some((appt) =>
        intervalsOverlap(
          { start: candidateStart, end: candidateEnd },
          { start: appt.start, end: appt.end },
        ),
      );

      if (!hasOverlap) {
        return true; // Found a free chair
      }
    }
    return false;
  }

  /**
   * Find chairs in a salon that have ALL required equipment.
   */
  private async findChairsWithAllEquipment(
    salonId: string,
    requiredEquipmentIds: string[],
  ): Promise<{ id: string; salonId: string; name: string; active: boolean }[]> {
    // Find chairs that have all required equipment
    const chairs = await this.prisma.chair.findMany({
      where: { salonId, active: true },
      include: { chairEquipment: true },
    });

    return chairs.filter((chair) => {
      const chairEquipIds = new Set(chair.chairEquipment.map((ce) => ce.equipmentId));
      return requiredEquipmentIds.every((eqId) => chairEquipIds.has(eqId));
    });
  }

  /**
   * Convert working hours (time-only Date objects stored at epoch)
   * to absolute timestamps on the target date.
   */
  private getAbsoluteWindows(
    hoursMap: Map<string, { startTime: Date; endTime: Date }[]>,
    ids: string[],
    date: string,
  ): { start: Date; end: Date }[] {
    const windows: { start: Date; end: Date }[] = [];
    for (const id of ids) {
      const hours = hoursMap.get(id) ?? [];
      for (const wh of hours) {
        windows.push({
          start: this.timeToAbsolute(wh.startTime, date),
          end: this.timeToAbsolute(wh.endTime, date),
        });
      }
    }
    return windows;
  }

  /**
   * Convert a time-only Date (epoch-based, UTC hours/minutes) to an
   * absolute timestamp on the given date.
   */
  private timeToAbsolute(time: Date, date: string): Date {
    const hours = time.getUTCHours();
    const minutes = time.getUTCMinutes();
    return new Date(`${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000Z`);
  }

  /**
   * Get the earliest start from all windows.
   */
  private getEarliestStart(
    staffWindows: { start: Date; end: Date }[],
    chairWindows: { start: Date; end: Date }[],
  ): Date | null {
    const allStarts = [
      ...staffWindows.map((w) => w.start),
      ...chairWindows.map((w) => w.start),
    ];
    if (allStarts.length === 0) return null;
    return new Date(Math.min(...allStarts.map((d) => d.getTime())));
  }

  /**
   * Get the latest end from all windows.
   */
  private getLatestEnd(
    staffWindows: { start: Date; end: Date }[],
    chairWindows: { start: Date; end: Date }[],
  ): Date | null {
    const allEnds = [
      ...staffWindows.map((w) => w.end),
      ...chairWindows.map((w) => w.end),
    ];
    if (allEnds.length === 0) return null;
    return new Date(Math.max(...allEnds.map((d) => d.getTime())));
  }
}
