import type { Appointment, PrismaClient } from '@prisma/client';
import type { BookingFlow } from './booking-flow.js';
import type { CancellationOps } from './cancellation-flow.js';
import {
  RescheduleError,
  type SchedulingEngine,
  type BookingRequest,
  type BookingResult,
} from '../scheduling/scheduling-engine.js';
import type { CreateInboxNotificationInput } from '../inbox/salon-inbox.service.js';

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
  locationType?: BookingRequest['locationType'];
  locationAddress?: string;
  customerNote?: string;
  durationMinutes?: number;
}

export interface RescheduleInput {
  appointmentId: string;
  customerId: string;
  startAt: string;
  preferredStaffId?: string;
  customerNote?: string;
  durationMinutes?: number;
  now?: Date;
}
export interface ManagedRescheduleInput {
  appointmentId: string;
  startAt: string;
  preferredStaffId?: string;
  now?: Date;
}

export interface StaffRescheduleRequest {
  appointmentId: string;
  startAt: string;
  /** Kept for API compatibility; the current workflow only changes time. */
  preferredStaffId?: string;
  requestedByStaffId?: string;
  now?: Date;
}

export interface CustomerRescheduleDecisionInput {
  appointmentId: string;
  customerId: string;
}

export interface PendingReschedule {
  startAt: Date;
  endAt: Date;
  requestedAt: Date;
  requestedBy: string | null;
}

export interface StaffRescheduleResult {
  appointment: Appointment;
  pendingReschedule: PendingReschedule;
}

export interface RescheduleDecisionResult {
  appointment: Appointment;
  decision: 'accepted' | 'rejected';
}

/** Notification port kept small so the application service remains testable. */
export interface RescheduleNotifier {
  sendRescheduleProposal(
    appointmentId: string,
    previousStartAt: Date,
    proposedStartAt: Date,
  ): Promise<void>;
}

/** Durable salon-inbox port used for staff-visible proposal outcomes. */
export interface RescheduleInbox {
  emit(input: CreateInboxNotificationInput): Promise<unknown>;
}

export interface RescheduleResult {
  previousAppointment: Appointment;
  booking: BookingResult;
}

/**
 * Application service for actions that need more than one existing domain
 * capability: staff walk-ins and safe rescheduling. Customer moves still go
 * through BookingFlow, while staff moves are kept as proposals until the
 * customer accepts them.
 */
export class AppointmentManagementService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly bookingFlow: BookingFlow,
    private readonly cancellationService: CancellationOps,
    private readonly schedulingEngine: SchedulingEngine,
    private readonly notificationService?: RescheduleNotifier,
    private readonly inboxService?: RescheduleInbox,
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
      ...(input.locationType ? { locationType: input.locationType } : {}),
      ...(input.locationAddress ? { locationAddress: input.locationAddress } : {}),
      ...(input.customerNote ? { customerNote: input.customerNote } : {}),
      ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
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
    if (existing.pendingRescheduleStartAt) {
      throw new RescheduleError('RESCHEDULE_PROPOSAL_PENDING');
    }

    const nextStart = this.parseAndValidateRescheduleStart(
      existing,
      input.startAt,
      input.now,
    );

    const result = await this.bookingFlow.book({
      salonId: existing.salonId,
      serviceId: existing.serviceId,
      startAt: nextStart.toISOString(),
      customerId: existing.customerId,
      preferredStaffId: input.preferredStaffId,
      source: existing.source as BookingRequest['source'],
      ...(existing.locationType && existing.locationType !== 'salon'
        ? {
            locationType: existing.locationType as BookingRequest['locationType'],
            locationAddress: existing.locationAddress ?? undefined,
          }
        : {}),
      ...(existing.durationMinOverride != null
        ? { durationMinutes: existing.durationMinOverride }
        : {}),
    });
    if (result.status === 'rejected') {
      throw new BookingConflictError();
    }

    // Book the replacement first; only then release the old slot. If allocation
    // fails, the original appointment is untouched and the customer can retry.
    const previousAppointment = await this.cancellationService.cancel(existing.id);
    return { previousAppointment, booking: result };
  }

  /**
   * Store a staff-requested move without releasing the current slot. The
   * customer must accept the proposal before SchedulingEngine moves the live
   * appointment.
   */
  async requestRescheduleForStaff(input: StaffRescheduleRequest): Promise<StaffRescheduleResult> {
    const existing = await this.prisma.appointment.findUnique({
      where: { id: input.appointmentId },
    });
    if (!existing) {
      throw new RescheduleError('APPOINTMENT_NOT_FOUND');
    }
    if (!['pending', 'held', 'confirmed'].includes(existing.status)) {
      throw new RescheduleError('APPOINTMENT_NOT_MOVABLE');
    }
    if (existing.pendingRescheduleStartAt) {
      throw new RescheduleError('RESCHEDULE_PROPOSAL_PENDING');
    }

    const proposedStartAt = this.parseAndValidateRescheduleStart(
      existing,
      input.startAt,
      input.now,
    );
    const durationMs = Math.max(existing.endAt.getTime() - existing.startAt.getTime(), 0);
    const pendingReschedule: PendingReschedule = {
      startAt: proposedStartAt,
      endAt: new Date(proposedStartAt.getTime() + durationMs),
      requestedAt: new Date(),
      requestedBy: input.requestedByStaffId ?? null,
    };
    const appointment = await this.prisma.appointment.update({
      where: { id: existing.id },
      data: {
        pendingRescheduleStartAt: pendingReschedule.startAt,
        pendingRescheduleEndAt: pendingReschedule.endAt,
        pendingRescheduleRequestedAt: pendingReschedule.requestedAt,
        pendingRescheduleRequestedBy: pendingReschedule.requestedBy,
      },
    });

    await this.notifyStaffProposal(existing, pendingReschedule.startAt);
    return { appointment, pendingReschedule };
  }

  /** Customer accepts the pending staff proposal and moves the live booking. */
  async acceptReschedule(
    input: CustomerRescheduleDecisionInput,
  ): Promise<RescheduleDecisionResult> {
    const existing = await this.prisma.appointment.findUnique({
      where: { id: input.appointmentId },
    });
    if (!existing || existing.customerId !== input.customerId) {
      throw new RescheduleError('APPOINTMENT_NOT_FOUND');
    }
    if (!['pending', 'held', 'confirmed'].includes(existing.status)) {
      throw new RescheduleError('APPOINTMENT_NOT_MOVABLE');
    }
    if (!existing.pendingRescheduleStartAt) {
      throw new RescheduleError('RESCHEDULE_PROPOSAL_NOT_FOUND');
    }

    try {
      this.assertRescheduleWindow(existing, existing.pendingRescheduleStartAt, new Date());
    } catch (error) {
      if (error instanceof RescheduleError && error.code === 'RESCHEDULE_DEADLINE_PASSED') {
        await this.clearPendingReschedule(existing.id);
      }
      throw error;
    }

    // The engine re-checks hours, resource ownership, closures, and conflicts
    // at acceptance time. A race with a new booking therefore leaves the old
    // appointment untouched and returns a stable conflict.
    const appointment = await this.schedulingEngine.reschedule({
      appointmentId: existing.id,
      startAt: existing.pendingRescheduleStartAt.toISOString(),
      allowPendingProposal: true,
    });
    await this.notifyStaffDecision(appointment, 'accepted');
    return { appointment, decision: 'accepted' };
  }

  /** Customer rejects the proposal; the original appointment remains active. */
  async rejectReschedule(
    input: CustomerRescheduleDecisionInput,
  ): Promise<RescheduleDecisionResult> {
    const existing = await this.prisma.appointment.findUnique({
      where: { id: input.appointmentId },
    });
    if (!existing || existing.customerId !== input.customerId) {
      throw new RescheduleError('APPOINTMENT_NOT_FOUND');
    }
    if (!['pending', 'held', 'confirmed'].includes(existing.status)) {
      throw new RescheduleError('APPOINTMENT_NOT_MOVABLE');
    }
    if (!existing.pendingRescheduleStartAt) {
      throw new RescheduleError('RESCHEDULE_PROPOSAL_NOT_FOUND');
    }

    const appointment = await this.clearPendingReschedule(existing.id);
    await this.notifyStaffDecision(appointment, 'rejected');
    return { appointment, decision: 'rejected' };
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
    if (existing.pendingRescheduleStartAt) {
      throw new RescheduleError('RESCHEDULE_PROPOSAL_PENDING');
    }
    this.parseAndValidateRescheduleStart(existing, input.startAt, input.now);

    const result = await this.bookingFlow.book({
      salonId: existing.salonId,
      serviceId: existing.serviceId,
      startAt: input.startAt,
      customerId: existing.customerId,
      preferredStaffId: input.preferredStaffId,
      source: existing.source as BookingRequest['source'],
      ...(existing.locationType && existing.locationType !== 'salon'
        ? {
            locationType: existing.locationType as BookingRequest['locationType'],
            locationAddress: existing.locationAddress ?? undefined,
          }
        : {}),
      ...(existing.durationMinOverride != null
        ? { durationMinutes: existing.durationMinOverride }
        : {}),
    });
    if (result.status === 'rejected') {
      throw new BookingConflictError();
    }

    const previousAppointment = await this.cancellationService.cancel(existing.id);
    return { previousAppointment, booking: result };
  }

  private parseAndValidateRescheduleStart(
    existing: Appointment,
    value: string,
    now?: Date,
  ): Date {
    const proposedStartAt = new Date(value);
    if (Number.isNaN(proposedStartAt.getTime())) {
      throw new RescheduleError('RESCHEDULE_INVALID_START');
    }
    this.assertRescheduleWindow(existing, proposedStartAt, now ?? new Date());
    return proposedStartAt;
  }

  private assertRescheduleWindow(existing: Appointment, proposedStartAt: Date, now: Date): void {
    if (
      existing.startAt.getTime() <= now.getTime() ||
      proposedStartAt.getTime() <= now.getTime()
    ) {
      throw new RescheduleError('RESCHEDULE_DEADLINE_PASSED');
    }
    if (existing.startAt.getTime() === proposedStartAt.getTime()) {
      throw new RescheduleError('RESCHEDULE_SAME_START');
    }
  }

  private async clearPendingReschedule(appointmentId: string): Promise<Appointment> {
    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        pendingRescheduleStartAt: null,
        pendingRescheduleEndAt: null,
        pendingRescheduleRequestedAt: null,
        pendingRescheduleRequestedBy: null,
      },
    });
  }

  private async notifyStaffProposal(
    appointment: Appointment,
    proposedStartAt: Date,
  ): Promise<void> {
    try {
      await this.notificationService?.sendRescheduleProposal(
        appointment.id,
        appointment.startAt,
        proposedStartAt,
      );
    } catch {
      // Notification delivery must never undo a saved proposal.
    }
    try {
      await this.inboxService?.emit({
        salonId: appointment.salonId,
        audience: 'all-staff',
        staffMemberId: appointment.staffMemberId,
        type: 'appointment.reschedule.requested',
        title: 'تغییر زمان نوبت',
        body: 'پیشنهاد تغییر زمان برای مشتری ارسال شد؛ زمان فعلی تا پاسخ او برقرار است.',
        payload: {
          appointmentId: appointment.id,
          customerId: appointment.customerId,
          date: proposedStartAt.toISOString(),
        },
      });
    } catch {
      // The database state remains authoritative if realtime/durable inbox is unavailable.
    }
  }

  private async notifyStaffDecision(
    appointment: Appointment,
    decision: 'accepted' | 'rejected',
  ): Promise<void> {
    try {
      await this.inboxService?.emit({
        salonId: appointment.salonId,
        audience: 'all-staff',
        staffMemberId: appointment.staffMemberId,
        type: `appointment.reschedule.${decision}`,
        title: decision === 'accepted' ? 'تغییر زمان تأیید شد' : 'تغییر زمان رد شد',
        body:
          decision === 'accepted'
            ? 'مشتری تغییر زمان را تأیید کرد؛ نوبت با زمان جدید ثبت شد.'
            : 'مشتری پیشنهاد تغییر زمان را رد کرد؛ نوبت در زمان قبلی باقی ماند.',
        payload: {
          appointmentId: appointment.id,
          customerId: appointment.customerId,
          date: appointment.startAt.toISOString(),
        },
      });
    } catch {
      // Inbox delivery is best-effort and cannot roll back the customer decision.
    }
  }
}
