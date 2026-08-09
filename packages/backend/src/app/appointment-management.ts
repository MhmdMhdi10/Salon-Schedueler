import type { Appointment, PrismaClient } from '@prisma/client';
import type { BookingFlow } from './booking-flow.js';
import type { CancellationOps } from './cancellation-flow.js';
import type { BookingRequest, BookingResult } from '../scheduling/scheduling-engine.js';

export class BookingConflictError extends Error {
  constructor(message = 'Requested appointment slot is unavailable') {
    super(message);
    this.name = 'BookingConflictError';
  }
}
export interface WalkInBookingInput {
  salonId: string;
  serviceId: string;
  startAt: string;
  customerPhone: string;
  customerName?: string;
  preferredStaffId?: string;
}

export interface RescheduleInput {
  appointmentId: string;
  customerId: string;
  startAt: string;
  preferredStaffId?: string;
}
export interface ManagedRescheduleInput {
  appointmentId: string;
  startAt: string;
  preferredStaffId?: string;
}


export interface RescheduleResult {
  previousAppointment: Appointment;
  booking: BookingResult;
}

/**
 * Application service for actions that need more than one existing domain
 * capability: staff walk-ins and safe rescheduling. Slot allocation still goes
 * through SchedulingEngine, so manual bookings cannot bypass staff/chair rules.
 */
export class AppointmentManagementService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly bookingFlow: BookingFlow,
    private readonly cancellationService: CancellationOps,
  ) {}

  async createWalkIn(input: WalkInBookingInput): Promise<BookingResult> {
    const customerName = input.customerName?.trim();
    const customer = await this.prisma.customer.upsert({
      where: { phone: input.customerPhone },
      update: customerName ? { fullName: customerName } : {},
      create: {
        phone: input.customerPhone,
        ...(customerName ? { fullName: customerName } : {}),
      },
    });

    const result = await this.bookingFlow.book({
      salonId: input.salonId,
      serviceId: input.serviceId,
      startAt: input.startAt,
      customerId: customer.id,
      preferredStaffId: input.preferredStaffId,
      source: 'walkin',
    });

    if (result.status === 'rejected') return result;
    // A walk-in is already approved by the staff member who entered it. The
    // scheduler intentionally keeps source=walkin semantics identical to web
    // (pending by default), so perform the approval as a separate transition.
    if (result.status === 'pending') {
      const appointment = await this.bookingFlow.approve(result.appointment.id);
      return { status: 'confirmed', appointment };
    }
    return result;
  }

  async reschedule(input: RescheduleInput): Promise<RescheduleResult> {
    const existing = await this.prisma.appointment.findUnique({
      where: { id: input.appointmentId },
    });
    if (!existing || existing.customerId !== input.customerId) {
      throw new Error('Appointment not found');
    }
    if (!['pending', 'held', 'confirmed'].includes(existing.status)) {
      throw new BookingConflictError('Only active appointments can be rescheduled');
    }

    const result = await this.bookingFlow.book({
      salonId: existing.salonId,
      serviceId: existing.serviceId,
      startAt: input.startAt,
      customerId: existing.customerId,
      preferredStaffId: input.preferredStaffId,
      source: existing.source as BookingRequest['source'],
    });
    if (result.status === 'rejected') {
      throw new BookingConflictError();
    }

    // Book the replacement first; only then release the old slot. If allocation
    // fails, the original appointment is untouched and the customer can retry.
    const previousAppointment = await this.cancellationService.cancel(existing.id);
    return { previousAppointment, booking: result };
  }
  async rescheduleForStaff(input: ManagedRescheduleInput): Promise<RescheduleResult> {
    const existing = await this.prisma.appointment.findUnique({
      where: { id: input.appointmentId },
    });
    if (!existing) {
      throw new Error('Appointment not found');
    }
    if (!['pending', 'held', 'confirmed'].includes(existing.status)) {
      throw new BookingConflictError('Only active appointments can be rescheduled');
    }

    const result = await this.bookingFlow.book({
      salonId: existing.salonId,
      serviceId: existing.serviceId,
      startAt: input.startAt,
      customerId: existing.customerId,
      preferredStaffId: input.preferredStaffId,
      source: existing.source as BookingRequest['source'],
    });
    if (result.status === 'rejected') {
      throw new BookingConflictError();
    }

    const previousAppointment = await this.cancellationService.cancel(existing.id);
    return { previousAppointment, booking: result };
  }
}
