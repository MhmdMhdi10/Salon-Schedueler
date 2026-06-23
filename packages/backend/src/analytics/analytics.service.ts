import type { PrismaClient } from '@prisma/client';

/**
 * Utilization report for chairs or staff.
 */
export interface UtilizationReport {
  /** Overall utilization ratio clamped to [0, 1] */
  utilization: number;
  /** Total booked minutes in the period */
  bookedMinutes: number;
  /** Total available minutes in the period */
  availableMinutes: number;
}

/**
 * Revenue report for a salon over a period.
 */
export interface RevenueReport {
  /** Total revenue in Iranian Rial (from completed appointments) */
  totalRial: bigint;
  /** Count of completed appointments contributing to revenue */
  appointmentCount: number;
}

/**
 * A time window with concurrent appointment count.
 */
export interface BusiestWindow {
  /** Start of the busiest window */
  startAt: Date;
  /** End of the busiest window */
  endAt: Date;
  /** Maximum number of concurrent appointments */
  concurrentCount: number;
}

/**
 * Window report identifying the busiest time windows.
 */
export interface WindowReport {
  /** The windows with the highest concurrency */
  busiestWindows: BusiestWindow[];
}

/**
 * AnalyticsService computes utilization, revenue, and busiest-window analytics.
 *
 * Requirements: R16.1, R16.2, R16.3, R16.4
 */
export class AnalyticsService {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Compute chair utilization for a salon over a period (R16.1).
   *
   * Utilization = booked time / available time, clamped to [0, 1].
   * Booked time is the sum of occupied intervals for confirmed/completed appointments.
   * Available time is derived from configured working hours for all active chairs.
   */
  async chairUtilization(salonId: string, from: Date, to: Date): Promise<UtilizationReport> {
    // Fetch all active chairs for the salon
    const chairs = await this.prisma.chair.findMany({
      where: { salonId, active: true },
    });

    if (chairs.length === 0) {
      return { utilization: 0, bookedMinutes: 0, availableMinutes: 0 };
    }

    const chairIds = chairs.map((c) => c.id);

    // Calculate available minutes from working hours
    const availableMinutes = await this.computeAvailableMinutes('chair', chairIds, from, to);

    if (availableMinutes === 0) {
      return { utilization: 0, bookedMinutes: 0, availableMinutes: 0 };
    }

    // Calculate booked minutes from appointments
    const bookedMinutes = await this.computeBookedMinutesForChairs(chairIds, from, to);

    const utilization = Math.min(1, Math.max(0, bookedMinutes / availableMinutes));

    return { utilization, bookedMinutes, availableMinutes };
  }

  /**
   * Compute staff utilization for a salon over a period (R16.2).
   *
   * Utilization = booked time / available time, clamped to [0, 1].
   * Booked time is the sum of occupied intervals for confirmed/completed appointments.
   * Available time is derived from configured working hours for all active staff.
   */
  async staffUtilization(salonId: string, from: Date, to: Date): Promise<UtilizationReport> {
    // Fetch all active staff for the salon
    const staff = await this.prisma.staffMember.findMany({
      where: { salonId, active: true },
    });

    if (staff.length === 0) {
      return { utilization: 0, bookedMinutes: 0, availableMinutes: 0 };
    }

    const staffIds = staff.map((s) => s.id);

    // Calculate available minutes from working hours
    const availableMinutes = await this.computeAvailableMinutes('staff', staffIds, from, to);

    if (availableMinutes === 0) {
      return { utilization: 0, bookedMinutes: 0, availableMinutes: 0 };
    }

    // Calculate booked minutes from appointments
    const bookedMinutes = await this.computeBookedMinutesForStaff(staffIds, from, to);

    const utilization = Math.min(1, Math.max(0, bookedMinutes / availableMinutes));

    return { utilization, bookedMinutes, availableMinutes };
  }

  /**
   * Compute total revenue for a salon over a period (R16.3).
   *
   * Revenue = sum of service prices for completed appointments in the period.
   * All amounts are in Iranian Rial.
   */
  async revenue(salonId: string, from: Date, to: Date): Promise<RevenueReport> {
    const completedAppointments = await this.prisma.appointment.findMany({
      where: {
        salonId,
        status: 'completed',
        startAt: { lt: to },
        endAt: { gt: from },
      },
      include: { service: true },
    });

    let totalRial = BigInt(0);
    for (const appt of completedAppointments) {
      totalRial += appt.service.priceRial;
    }

    return {
      totalRial,
      appointmentCount: completedAppointments.length,
    };
  }

  /**
   * Find the busiest time windows for a salon over a period (R16.4).
   *
   * Uses an event-sweep algorithm: for each appointment start/end,
   * track concurrent count and find the maximum.
   */
  async busiestWindows(salonId: string, from: Date, to: Date): Promise<WindowReport> {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        salonId,
        status: { in: ['confirmed', 'completed'] },
        startAt: { lt: to },
        endAt: { gt: from },
      },
      orderBy: { startAt: 'asc' },
    });

    if (appointments.length === 0) {
      return { busiestWindows: [] };
    }

    // Build events: +1 at start, -1 at end
    const events: { time: Date; delta: number }[] = [];
    for (const appt of appointments) {
      // Clamp to period boundaries
      const start = appt.startAt < from ? from : appt.startAt;
      const end = appt.endAt > to ? to : appt.endAt;
      events.push({ time: start, delta: 1 });
      events.push({ time: end, delta: -1 });
    }

    // Sort events by time, with -1 (end) before +1 (start) at same time
    events.sort((a, b) => {
      const timeDiff = a.time.getTime() - b.time.getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.delta - b.delta; // -1 before +1 at same time
    });

    // Sweep to find max concurrency
    let current = 0;
    let maxConcurrent = 0;
    let windowStart: Date | null = null;
    const busiestWindows: BusiestWindow[] = [];

    for (let i = 0; i < events.length; i++) {
      current += events[i].delta;

      if (current > maxConcurrent) {
        maxConcurrent = current;
        windowStart = events[i].time;
        // Clear previous windows since we found a higher max
        busiestWindows.length = 0;
      }

      // When concurrency drops from maxConcurrent, record the window end
      if (current < maxConcurrent && windowStart !== null && busiestWindows.length === 0) {
        // Look ahead for window end
      }
    }

    // Second pass: find all windows that hit maxConcurrent
    if (maxConcurrent > 0) {
      current = 0;
      let inMaxWindow = false;
      let currentWindowStart: Date | null = null;

      for (let i = 0; i < events.length; i++) {
        current += events[i].delta;

        if (current >= maxConcurrent && !inMaxWindow) {
          inMaxWindow = true;
          currentWindowStart = events[i].time;
        } else if (current < maxConcurrent && inMaxWindow) {
          inMaxWindow = false;
          if (currentWindowStart !== null) {
            busiestWindows.push({
              startAt: currentWindowStart,
              endAt: events[i].time,
              concurrentCount: maxConcurrent,
            });
          }
        }
      }

      // If still in max window at end of events
      if (inMaxWindow && currentWindowStart !== null) {
        busiestWindows.push({
          startAt: currentWindowStart,
          endAt: events[events.length - 1].time,
          concurrentCount: maxConcurrent,
        });
      }
    }

    return { busiestWindows };
  }

  /**
   * Compute total available minutes for a set of resources over a period.
   * Uses configured working hours and iterates over each day in the range.
   */
  private async computeAvailableMinutes(
    ownerKind: 'staff' | 'chair',
    ownerIds: string[],
    from: Date,
    to: Date,
  ): Promise<number> {
    const workingHours = await this.prisma.workingHours.findMany({
      where: {
        ownerKind,
        ownerId: { in: ownerIds },
      },
    });

    if (workingHours.length === 0) {
      return 0;
    }

    // Group working hours by owner and weekday
    const hoursMap = new Map<string, Map<number, { startTime: Date; endTime: Date }[]>>();
    for (const wh of workingHours) {
      if (!hoursMap.has(wh.ownerId)) {
        hoursMap.set(wh.ownerId, new Map());
      }
      const ownerMap = hoursMap.get(wh.ownerId)!;
      if (!ownerMap.has(wh.weekday)) {
        ownerMap.set(wh.weekday, []);
      }
      ownerMap.get(wh.weekday)!.push({ startTime: wh.startTime, endTime: wh.endTime });
    }

    let totalMinutes = 0;

    // Iterate over each day in the range
    const currentDay = new Date(from);
    currentDay.setUTCHours(0, 0, 0, 0);

    const endDay = new Date(to);

    while (currentDay < endDay) {
      const weekday = currentDay.getUTCDay();

      for (const ownerId of ownerIds) {
        const ownerMap = hoursMap.get(ownerId);
        if (!ownerMap) continue;

        const dayHours = ownerMap.get(weekday);
        if (!dayHours) continue;

        for (const wh of dayHours) {
          // Convert time-only to absolute timestamp on this day
          const startHour = wh.startTime.getUTCHours();
          const startMinute = wh.startTime.getUTCMinutes();
          const endHour = wh.endTime.getUTCHours();
          const endMinute = wh.endTime.getUTCMinutes();

          const windowStart = new Date(currentDay);
          windowStart.setUTCHours(startHour, startMinute, 0, 0);

          const windowEnd = new Date(currentDay);
          windowEnd.setUTCHours(endHour, endMinute, 0, 0);

          // Clamp to the query period
          const effectiveStart = windowStart < from ? from : windowStart;
          const effectiveEnd = windowEnd > to ? to : windowEnd;

          if (effectiveStart < effectiveEnd) {
            const minutes = (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60);
            totalMinutes += minutes;
          }
        }
      }

      // Advance to next day
      currentDay.setUTCDate(currentDay.getUTCDate() + 1);
    }

    return totalMinutes;
  }

  /**
   * Compute total booked minutes for chairs from confirmed/completed appointments.
   */
  private async computeBookedMinutesForChairs(
    chairIds: string[],
    from: Date,
    to: Date,
  ): Promise<number> {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        chairId: { in: chairIds },
        status: { in: ['confirmed', 'completed'] },
        startAt: { lt: to },
        endAt: { gt: from },
      },
    });

    return this.sumBookedMinutes(appointments, from, to);
  }

  /**
   * Compute total booked minutes for staff from confirmed/completed appointments.
   */
  private async computeBookedMinutesForStaff(
    staffIds: string[],
    from: Date,
    to: Date,
  ): Promise<number> {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        staffMemberId: { in: staffIds },
        status: { in: ['confirmed', 'completed'] },
        startAt: { lt: to },
        endAt: { gt: from },
      },
    });

    return this.sumBookedMinutes(appointments, from, to);
  }

  /**
   * Sum booked minutes from appointments, clamping to period boundaries.
   */
  private sumBookedMinutes(
    appointments: { startAt: Date; endAt: Date }[],
    from: Date,
    to: Date,
  ): number {
    let totalMinutes = 0;

    for (const appt of appointments) {
      const effectiveStart = appt.startAt < from ? from : appt.startAt;
      const effectiveEnd = appt.endAt > to ? to : appt.endAt;

      if (effectiveStart < effectiveEnd) {
        totalMinutes += (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60);
      }
    }

    return totalMinutes;
  }
}
