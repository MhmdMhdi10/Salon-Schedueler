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

export interface AnalyticsSummary {
  totalAppointments: number;
  pendingAppointments: number;
  heldAppointments: number;
  confirmedAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  expiredAppointments: number;
  uniqueCustomers: number;
  repeatCustomers: number;
  bookedMinutes: number;
  averageDurationMinutes: number;
  averageTicketRial: number;
  serviceValueRial: number;
  paidRial: number;
  retainedRial: number;
  collectedRial: number;
  refundedRial: number;
  pendingPaymentRial: number;
  failedPaymentRial: number;
  cancellationRate: number;
  noShowRate: number;
}

export interface AnalyticsDailyPoint {
  date: string;
  bookings: number;
  completed: number;
  cancelled: number;
  noShow: number;
  revenueRial: number;
  bookedMinutes: number;
}

export interface AnalyticsHourlyPoint {
  hour: number;
  bookings: number;
  completed: number;
  bookedMinutes: number;
}

export interface AnalyticsServiceRow {
  id: string;
  name: string;
  bookings: number;
  completed: number;
  revenueRial: number;
  averageDurationMinutes: number;
}

export interface AnalyticsStaffRow {
  id: string;
  name: string;
  bookings: number;
  completed: number;
  revenueRial: number;
  bookedMinutes: number;
}

export interface AnalyticsSourceRow {
  source: string;
  bookings: number;
  revenueRial: number;
}

/** Campaign arrivals grouped by the UTM source used in salon-owned links. */
export interface AnalyticsCampaignSourceRow {
  source: string;
  scans: number;
}

export interface AnalyticsCampaignScanReport {
  total: number;
  sources: AnalyticsCampaignSourceRow[];
}

/** Customer-level activity for the selected reporting period. */
export interface AnalyticsCustomerRow {
  id: string;
  name: string | null;
  phone: string;
  reservations: number;
  visits: number;
  noShow: number;
  cancelled: number;
  revenueRial: number;
  lastVisitAt: Date | null;
}

export interface AnalyticsComparison {
  totalAppointments: number;
  completedAppointments: number;
  serviceValueRial: number;
  collectedRial: number;
}

interface QrScanEventDelegate {
  findMany(args: {
    where: { salonId: string; createdAt: { gte: Date; lt: Date } };
    select: { source: true };
  }): Promise<Array<{ source: string }>>;
}

export interface AnalyticsDashboardReport {
  utilization: UtilizationReport;
  staffUtilization: UtilizationReport;
  revenue: RevenueReport;
  busiestWindows: BusiestWindow[];
  summary: AnalyticsSummary;
  comparison: AnalyticsComparison;
  daily: AnalyticsDailyPoint[];
  hourly: AnalyticsHourlyPoint[];
  services: AnalyticsServiceRow[];
  staff: AnalyticsStaffRow[];
  sources: AnalyticsSourceRow[];
  campaignScans: AnalyticsCampaignScanReport;
  customers: AnalyticsCustomerRow[];
}

type DashboardAppointment = {
  customerId: string;
  staffMemberId: string;
  serviceId: string;
  startAt: Date;
  endAt: Date;
  status: string;
  source: string;
  customer: { id: string; phone: string; fullName: string | null };
  service: {
    id: string;
    name: string;
    priceRial: bigint;
    durationMin: number;
  };
  staffMember: { id: string; fullName: string };
};

type DashboardPayment = {
  amountRial: bigint;
  status: string;
};

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

    return { busiestWindows: this.computeBusiestWindows(appointments, from, to) };
  }

  /**
   * Full owner dashboard report. The legacy methods above remain public and
   * unchanged for existing consumers; this additive report gives the owner
   * enough context to make decisions without opening several separate pages.
   */
  async dashboard(salonId: string, from: Date, to: Date): Promise<AnalyticsDashboardReport> {
    const periodMs = Math.max(1, to.getTime() - from.getTime());
    const previousFrom = new Date(from.getTime() - periodMs);
    const previousTo = new Date(from);

    const [
      appointmentsRaw,
      paymentsRaw,
      previousAppointmentsRaw,
      previousPaymentsRaw,
      salon,
      utilization,
      staffUtilization,
      campaignScans,
    ] = await Promise.all([
      this.loadDashboardAppointments(salonId, from, to),
      this.loadDashboardPayments(salonId, from, to),
      this.loadDashboardAppointments(salonId, previousFrom, previousTo),
      this.loadDashboardPayments(salonId, previousFrom, previousTo),
      this.prisma.salon.findUnique({ where: { id: salonId }, select: { timezone: true } }),
      this.chairUtilization(salonId, from, to),
      this.staffUtilization(salonId, from, to),
      this.loadCampaignScans(salonId, from, to),
    ]);

    const appointments = appointmentsRaw as DashboardAppointment[];
    const payments = paymentsRaw as DashboardPayment[];
    const previousAppointments = previousAppointmentsRaw as DashboardAppointment[];
    const previousPayments = previousPaymentsRaw as DashboardPayment[];
    const timezone = salon?.timezone || 'Asia/Tehran';
    const summary = this.buildSummary(appointments, payments, staffUtilization.bookedMinutes);

    return {
      utilization,
      staffUtilization,
      revenue: {
        totalRial: BigInt(Math.round(summary.serviceValueRial)),
        appointmentCount: summary.completedAppointments,
      },
      busiestWindows: this.computeBusiestWindows(
        appointments.filter((appt) => ['confirmed', 'completed'].includes(appt.status)),
        from,
        to,
      ),
      summary,
      comparison: this.buildComparison(previousAppointments, previousPayments),
      daily: this.buildDailySeries(appointments, from, to, timezone),
      hourly: this.buildHourlySeries(appointments, timezone),
      services: this.buildServiceRows(appointments),
      staff: this.buildStaffRows(appointments),
      sources: this.buildSourceRows(appointments),
      campaignScans,
      customers: this.buildCustomerRows(appointments),
    };
  }

  private async loadCampaignScans(
    salonId: string,
    from: Date,
    to: Date,
  ): Promise<AnalyticsCampaignScanReport> {
    const delegate = (this.prisma as unknown as { qrScanEvent?: QrScanEventDelegate }).qrScanEvent;
    // Older test doubles and pre-expansion databases may not expose the delegate.
    // Keep analytics backward-compatible and return an honest empty report.
    if (!delegate) return { total: 0, sources: [] };

    const events = await delegate.findMany({
      where: { salonId, createdAt: { gte: from, lt: to } },
      select: { source: true },
    });
    const counts = new Map<string, number>();
    for (const event of events) {
      const source = event.source.trim() || 'unknown';
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }
    return {
      total: events.length,
      sources: [...counts.entries()]
        .map(([source, scans]) => ({ source, scans }))
        .sort((a, b) => b.scans - a.scans || a.source.localeCompare(b.source)),
    };
  }

  private async loadDashboardAppointments(
    salonId: string,
    from: Date,
    to: Date,
  ): Promise<DashboardAppointment[]> {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        salonId,
        startAt: { lt: to },
        endAt: { gt: from },
      },
      select: {
        customerId: true,
        staffMemberId: true,
        serviceId: true,
        startAt: true,
        endAt: true,
        status: true,
        source: true,
        customer: { select: { id: true, phone: true, fullName: true } },
        service: {
          select: { id: true, name: true, priceRial: true, durationMin: true },
        },
        staffMember: { select: { id: true, fullName: true } },
      },
      orderBy: { startAt: 'asc' },
    });
    return appointments as unknown as DashboardAppointment[];
  }

  private async loadDashboardPayments(
    salonId: string,
    from: Date,
    to: Date,
  ): Promise<DashboardPayment[]> {
    const payments = await this.prisma.payment.findMany({
      where: {
        appointment: {
          salonId,
          startAt: { lt: to },
          endAt: { gt: from },
        },
      },
      select: { amountRial: true, status: true },
    });
    return payments as unknown as DashboardPayment[];
  }

  private buildSummary(
    appointments: DashboardAppointment[],
    payments: DashboardPayment[],
    bookedMinutes: number,
  ): AnalyticsSummary {
    const statusCounts = new Map<string, number>();
    const customerCounts = new Map<string, number>();
    let serviceValueRial = 0;
    let completedDuration = 0;
    let completedCount = 0;

    for (const appointment of appointments) {
      statusCounts.set(appointment.status, (statusCounts.get(appointment.status) ?? 0) + 1);
      if (appointment.status === 'expired') continue;
      customerCounts.set(appointment.customerId, (customerCounts.get(appointment.customerId) ?? 0) + 1);
      if (appointment.status === 'completed') {
        serviceValueRial += Number(appointment.service.priceRial);
        completedDuration += this.durationMinutes(appointment);
        completedCount += 1;
      }
    }

    let paidRial = 0;
    let retainedRial = 0;
    let refundedRial = 0;
    let pendingPaymentRial = 0;
    let failedPaymentRial = 0;
    for (const payment of payments) {
      const amount = Number(payment.amountRial);
      if (!Number.isFinite(amount)) continue;
      if (payment.status === 'paid') paidRial += amount;
      else if (payment.status === 'retained') retainedRial += amount;
      else if (payment.status === 'refunded') refundedRial += amount;
      else if (payment.status === 'pending') pendingPaymentRial += amount;
      else if (payment.status === 'failed') failedPaymentRial += amount;
    }

    const totalAppointments = appointments.filter((appt) => appt.status !== 'expired').length;
    const cancellationDenominator = Math.max(1, totalAppointments);
    const completedOrNoShow = completedCount + (statusCounts.get('no_show') ?? 0);
    const repeatCustomers = [...customerCounts.values()].filter((count) => count > 1).length;

    return {
      totalAppointments,
      pendingAppointments: statusCounts.get('pending') ?? 0,
      heldAppointments: statusCounts.get('held') ?? 0,
      confirmedAppointments: statusCounts.get('confirmed') ?? 0,
      completedAppointments: completedCount,
      cancelledAppointments: statusCounts.get('cancelled') ?? 0,
      noShowAppointments: statusCounts.get('no_show') ?? 0,
      expiredAppointments: statusCounts.get('expired') ?? 0,
      uniqueCustomers: customerCounts.size,
      repeatCustomers,
      bookedMinutes: Math.round(bookedMinutes),
      averageDurationMinutes: completedCount ? Math.round(completedDuration / completedCount) : 0,
      averageTicketRial: completedCount ? Math.round(serviceValueRial / completedCount) : 0,
      serviceValueRial,
      paidRial,
      retainedRial,
      collectedRial: paidRial + retainedRial - refundedRial,
      refundedRial,
      pendingPaymentRial,
      failedPaymentRial,
      cancellationRate: (statusCounts.get('cancelled') ?? 0) / cancellationDenominator,
      noShowRate: completedOrNoShow ? (statusCounts.get('no_show') ?? 0) / completedOrNoShow : 0,
    };
  }

  private buildComparison(
    appointments: DashboardAppointment[],
    payments: DashboardPayment[],
  ): AnalyticsComparison {
    const validAppointments = appointments.filter((appt) => appt.status !== 'expired');
    const completed = validAppointments.filter((appt) => appt.status === 'completed');
    const serviceValueRial = completed.reduce((sum, appt) => sum + Number(appt.service.priceRial), 0);
    let collectedRial = 0;
    for (const payment of payments) {
      const amount = Number(payment.amountRial);
      if (payment.status === 'paid' || payment.status === 'retained') collectedRial += amount;
      if (payment.status === 'refunded') collectedRial -= amount;
    }
    return {
      totalAppointments: validAppointments.length,
      completedAppointments: completed.length,
      serviceValueRial,
      collectedRial,
    };
  }

  private buildDailySeries(
    appointments: DashboardAppointment[],
    from: Date,
    to: Date,
    timezone: string,
  ): AnalyticsDailyPoint[] {
    const rows = new Map<string, AnalyticsDailyPoint>();
    const getRow = (date: string) => {
      const existing = rows.get(date);
      if (existing) return existing;
      const created: AnalyticsDailyPoint = {
        date,
        bookings: 0,
        completed: 0,
        cancelled: 0,
        noShow: 0,
        revenueRial: 0,
        bookedMinutes: 0,
      };
      rows.set(date, created);
      return created;
    };

    for (const appointment of appointments) {
      if (appointment.status === 'expired') continue;
      const row = getRow(this.dateKey(appointment.startAt, timezone));
      row.bookings += 1;
      if (appointment.status === 'completed') {
        row.completed += 1;
        row.revenueRial += Number(appointment.service.priceRial);
      }
      if (appointment.status === 'cancelled') row.cancelled += 1;
      if (appointment.status === 'no_show') row.noShow += 1;
      if (['confirmed', 'completed'].includes(appointment.status)) {
        row.bookedMinutes += this.durationMinutes(appointment, from, to);
      }
    }

    const cursor = new Date(from);
    cursor.setUTCHours(0, 0, 0, 0);
    while (cursor < to) {
      getRow(this.dateKey(cursor, timezone));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  private buildHourlySeries(
    appointments: DashboardAppointment[],
    timezone: string,
  ): AnalyticsHourlyPoint[] {
    const rows = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      bookings: 0,
      completed: 0,
      bookedMinutes: 0,
    }));
    for (const appointment of appointments) {
      if (appointment.status === 'expired') continue;
      const row = rows[this.hourOf(appointment.startAt, timezone)];
      row.bookings += 1;
      if (appointment.status === 'completed') row.completed += 1;
      if (['confirmed', 'completed'].includes(appointment.status)) {
        row.bookedMinutes += this.durationMinutes(appointment);
      }
    }
    return rows;
  }

  private buildServiceRows(appointments: DashboardAppointment[]): AnalyticsServiceRow[] {
    const rows = new Map<string, AnalyticsServiceRow & { durationTotal: number }>();
    for (const appointment of appointments) {
      if (appointment.status === 'expired') continue;
      const service = appointment.service;
      const row = rows.get(service.id) ?? {
        id: service.id,
        name: service.name,
        bookings: 0,
        completed: 0,
        revenueRial: 0,
        averageDurationMinutes: 0,
        durationTotal: 0,
      };
      row.bookings += 1;
      if (appointment.status === 'completed') {
        row.completed += 1;
        row.revenueRial += Number(service.priceRial);
        row.durationTotal += this.durationMinutes(appointment);
      }
      rows.set(service.id, row);
    }
    return [...rows.values()]
      .map(({ durationTotal, ...row }) => ({
        ...row,
        averageDurationMinutes: row.completed ? Math.round(durationTotal / row.completed) : 0,
      }))
      .sort((a, b) => b.bookings - a.bookings || b.revenueRial - a.revenueRial);
  }

  private buildStaffRows(appointments: DashboardAppointment[]): AnalyticsStaffRow[] {
    const rows = new Map<string, AnalyticsStaffRow>();
    for (const appointment of appointments) {
      if (appointment.status === 'expired') continue;
      const staff = appointment.staffMember;
      const row = rows.get(staff.id) ?? {
        id: staff.id,
        name: staff.fullName,
        bookings: 0,
        completed: 0,
        revenueRial: 0,
        bookedMinutes: 0,
      };
      row.bookings += 1;
      if (appointment.status === 'completed') {
        row.completed += 1;
        row.revenueRial += Number(appointment.service.priceRial);
      }
      if (['confirmed', 'completed'].includes(appointment.status)) {
        row.bookedMinutes += this.durationMinutes(appointment);
      }
      rows.set(staff.id, row);
    }
    return [...rows.values()].sort((a, b) => b.bookings - a.bookings || b.revenueRial - a.revenueRial);
  }

  private buildSourceRows(appointments: DashboardAppointment[]): AnalyticsSourceRow[] {
    const rows = new Map<string, AnalyticsSourceRow>();
    for (const appointment of appointments) {
      if (appointment.status === 'expired') continue;
      const row = rows.get(appointment.source) ?? {
        source: appointment.source,
        bookings: 0,
        revenueRial: 0,
      };
      row.bookings += 1;
      if (appointment.status === 'completed') row.revenueRial += Number(appointment.service.priceRial);
      rows.set(appointment.source, row);
    }
    return [...rows.values()].sort((a, b) => b.bookings - a.bookings);
  }

  private buildCustomerRows(appointments: DashboardAppointment[]): AnalyticsCustomerRow[] {
    const rows = new Map<string, AnalyticsCustomerRow>();
    for (const appointment of appointments) {
      if (appointment.status === 'expired') continue;
      const customer = appointment.customer;
      const row = rows.get(customer.id) ?? {
        id: customer.id,
        name: customer.fullName?.trim() || null,
        phone: customer.phone,
        reservations: 0,
        visits: 0,
        noShow: 0,
        cancelled: 0,
        revenueRial: 0,
        lastVisitAt: null,
      };
      row.reservations += 1;
      if (appointment.status === 'completed') {
        row.visits += 1;
        row.revenueRial += Number(appointment.service.priceRial);
        if (!row.lastVisitAt || appointment.startAt > row.lastVisitAt) {
          row.lastVisitAt = appointment.startAt;
        }
      }
      if (appointment.status === 'no_show') row.noShow += 1;
      if (appointment.status === 'cancelled') row.cancelled += 1;
      rows.set(customer.id, row);
    }
    return [...rows.values()].sort(
      (a, b) =>
        b.visits - a.visits ||
        b.reservations - a.reservations ||
        (b.lastVisitAt?.getTime() ?? 0) - (a.lastVisitAt?.getTime() ?? 0),
    );
  }

  private computeBusiestWindows(
    appointments: { startAt: Date; endAt: Date }[],
    from: Date,
    to: Date,
  ): BusiestWindow[] {
    const events: { time: number; delta: number }[] = [];
    for (const appointment of appointments) {
      const start = Math.max(appointment.startAt.getTime(), from.getTime());
      const end = Math.min(appointment.endAt.getTime(), to.getTime());
      if (start < end) {
        events.push({ time: start, delta: 1 }, { time: end, delta: -1 });
      }
    }
    if (events.length === 0) return [];

    const grouped = new Map<number, number>();
    for (const event of events) grouped.set(event.time, (grouped.get(event.time) ?? 0) + event.delta);
    const points = [...grouped.entries()]
      .sort(([a], [b]) => a - b)
      .map(([time, delta]) => ({ time, delta }));

    let current = 0;
    let maxConcurrent = 0;
    for (const point of points) {
      current += point.delta;
      maxConcurrent = Math.max(maxConcurrent, current);
    }
    if (maxConcurrent === 0) return [];

    const busiestWindows: BusiestWindow[] = [];
    current = 0;
    let windowStart: number | null = null;
    for (const point of points) {
      const previous = current;
      current += point.delta;
      if (previous < maxConcurrent && current >= maxConcurrent) windowStart = point.time;
      if (previous >= maxConcurrent && current < maxConcurrent && windowStart !== null) {
        if (windowStart < point.time) {
          busiestWindows.push({
            startAt: new Date(windowStart),
            endAt: new Date(point.time),
            concurrentCount: maxConcurrent,
          });
        }
        windowStart = null;
      }
    }
    if (windowStart !== null && points[points.length - 1].time > windowStart) {
      busiestWindows.push({
        startAt: new Date(windowStart),
        endAt: new Date(points[points.length - 1].time),
        concurrentCount: maxConcurrent,
      });
    }
    return busiestWindows;
  }

  private durationMinutes(appointment: { startAt: Date; endAt: Date }, from?: Date, to?: Date): number {
    const start = Math.max(appointment.startAt.getTime(), from?.getTime() ?? appointment.startAt.getTime());
    const end = Math.min(appointment.endAt.getTime(), to?.getTime() ?? appointment.endAt.getTime());
    return Math.max(0, (end - start) / 60000);
  }

  private dateKey(date: Date, timezone: string): string {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(date);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${values.year}-${values.month}-${values.day}`;
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  private hourOf(date: Date, timezone: string): number {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date);
      const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
      return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 0;
    } catch {
      return date.getUTCHours();
    }
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

  /**
   * List the salon's money transactions — appointment payments + subscription
   * payments — as a unified, newest-first ledger for the owner panel.
   *
   * BigInt amounts are mapped to Number (safe for the serialized JSON sizes
   * in play; Rial amounts fit comfortably within Number.MAX_SAFE_INTEGER).
   * Card-order intake is fulfilment-only and excluded.
   */
  async listTransactions(
    salonId: string,
  ): Promise<{
    id: string;
    kind: 'appointment' | 'subscription';
    amountRial: number;
    status: string;
    gateway: string;
    refId: string | null;
    createdAt: string;
    label: string | null;
  }[]> {
    const [payments, subPayments] = await Promise.all([
      this.prisma.payment.findMany({
        where: { appointment: { salonId } },
        include: {
          appointment: {
            include: { service: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.subscriptionPayment.findMany({
        where: { subscription: { salonId } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

    const tx = [
      ...payments.map((p) => ({
        id: p.id,
        kind: 'appointment' as const,
        amountRial: Number(p.amountRial),
        status: p.status,
        gateway: p.gateway,
        refId: p.refId ?? null,
        createdAt: p.createdAt.toISOString(),
        label: p.appointment?.service?.name ?? null,
      })),
      ...subPayments.map((p) => ({
        id: p.id,
        kind: 'subscription' as const,
        amountRial: Number(p.amountRial),
        status: p.status,
        gateway: p.gateway,
        refId: p.refId ?? null,
        createdAt: p.createdAt.toISOString(),
        label: p.planKind,
      })),
    ];

    tx.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return tx;
  }
}
