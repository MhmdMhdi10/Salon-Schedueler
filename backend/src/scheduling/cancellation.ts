import type { PrismaClient, Appointment } from '@prisma/client';
import type { PaymentService } from '../payment/services/index.js';

/**
 * CancellationService — handles appointment cancellation and no-show marking.
 *
 * - `cancel(appointmentId, cancellationWindowMinutes?)` — changes status to 'cancelled',
 *   releases staff and chair, and handles deposit refund/retain based on cancellation window.
 *   (R11.1, R11.2, R11.3)
 * - `markNoShow(appointmentId)` — changes status to 'no_show', releases staff and chair,
 *   and increments the customer's no-show count.
 *   (R11.4)
 *
 * Requirements: R11.1, R11.2, R11.3, R11.4
 */

export interface CancellationServiceOptions {
  /** Default cancellation window in minutes before appointment start. Default: 60 */
  defaultCancellationWindowMinutes?: number;
}

export interface RefundProof {
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  data: Buffer;
}

export interface CancellationDetails {
  actor?: 'customer' | 'staff' | 'system';
  kind?: 'standard' | 'emergency' | 'rejected';
  reason?: string;
  refundProof?: RefundProof;
  refundDueHours?: number;
}

/** A future appointment cannot be recorded as a customer no-show. */
export class AppointmentNotStartedError extends Error {
  constructor() {
    super('APPOINTMENT_NOT_STARTED');
    this.name = 'AppointmentNotStartedError';
  }
}

export class CancellationService {
  private readonly prisma: PrismaClient;
  private readonly paymentService: PaymentService;
  private readonly defaultCancellationWindowMinutes: number;

  constructor(
    prisma: PrismaClient,
    paymentService: PaymentService,
    options?: CancellationServiceOptions,
  ) {
    this.prisma = prisma;
    this.paymentService = paymentService;
    this.defaultCancellationWindowMinutes =
      options?.defaultCancellationWindowMinutes ?? 60;
  }

  /**
   * Cancel an appointment.
   *
   * - Changes the appointment status to 'cancelled', which drops it from the exclusion
   *   constraints and frees both staff and chair for the time window (R11.1).
   * - If a deposit was paid and cancellation is BEFORE the Cancellation_Window,
   *   refunds the deposit (R11.2).
   * - If a deposit was paid and cancellation is WITHIN the Cancellation_Window,
   *   retains the deposit (R11.3).
   *
   * @param appointmentId - The ID of the appointment to cancel
   * @param cancellationWindowMinutes - Override for the cancellation window (defaults to configured value)
   * @param now - Current time (allows injection for testing)
   * @returns The cancelled appointment
   */
  async cancel(
    appointmentId: string,
    cancellationWindowMinutes?: number,
    now: Date = new Date(),
    details?: CancellationDetails,
  ): Promise<Appointment> {
    const windowMinutes =
      cancellationWindowMinutes ?? this.defaultCancellationWindowMinutes;

    // Fetch the appointment
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new Error(`Appointment ${appointmentId} not found`);
    }

    if (
      appointment.status !== 'pending' &&
      appointment.status !== 'confirmed' &&
      appointment.status !== 'held'
    ) {
      throw new Error(
        `Appointment ${appointmentId} cannot be cancelled: current status is '${appointment.status}'`,
      );
    }

    const payment = await this.prisma.payment.findFirst({
      where: { appointmentId: appointment.id, status: 'paid' },
    });
    // R11.1: Change status to 'cancelled' — this releases both staff and chair
    // because the exclusion constraints only apply to 'held' and 'confirmed' statuses.
    const cancelled = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'cancelled' },
    });

    // Handle deposit refund/retain policy (R11.2, R11.3)
    await this.handleDepositPolicy(appointment, windowMinutes, now, details, payment);
    await this.writeCancellation(appointment, details, payment, now);

    return cancelled;
  }

  async recordRejection(appointment: Appointment, reason?: string): Promise<void> {
    const delegate = (this.prisma as any).appointmentCancellation;
    if (!delegate?.upsert) return;
    await delegate.upsert({
      where: { appointmentId: appointment.id },
      create: {
        appointmentId: appointment.id,
        cancelledBy: 'staff',
        kind: 'rejected',
        reason: reason?.trim() || 'درخواست نوبت توسط سالن رد شد.',
        refundStatus: 'not_required',
      },
      update: {
        cancelledBy: 'staff',
        kind: 'rejected',
        reason: reason?.trim() || 'درخواست نوبت توسط سالن رد شد.',
      },
    });
  }

  async getCancellation(appointmentId: string, includeProof = false) {
    const delegate = (this.prisma as any).appointmentCancellation;
    if (!delegate?.findUnique) return null;
    const row = await delegate.findUnique({ where: { appointmentId } });
    if (!row) return null;
    return {
      id: row.id,
      appointmentId: row.appointmentId,
      cancelledBy: row.cancelledBy,
      kind: row.kind,
      reason: row.reason,
      refundStatus: row.refundStatus,
      refundDueAt: row.refundDueAt?.toISOString() ?? null,
      proof: row.proofFileName
        ? {
            fileName: row.proofFileName,
            mimeType: row.proofMimeType,
            sizeBytes: row.proofSizeBytes,
            ...(includeProof && row.proofData
              ? { dataBase64: row.proofData.toString('base64') }
              : {}),
          }
        : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async reportCustomer(input: {
    appointmentId: string;
    reason: string;
    block: boolean;
  }): Promise<void> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: input.appointmentId },
      select: { salonId: true, customerId: true },
    });
    if (!appointment) throw new Error('APPOINTMENT_NOT_FOUND');
    const report = (this.prisma as any).customerModerationReport;
    if (report?.create) {
      await report.create({
        data: {
          salonId: appointment.salonId,
          customerId: appointment.customerId,
          appointmentId: input.appointmentId,
          reason: input.reason,
        },
      });
    }
    if (input.block) {
      const blocks = (this.prisma as any).customerSalonBlock;
      if (blocks?.upsert) {
        await blocks.upsert({
          where: { salonId_customerId: { salonId: appointment.salonId, customerId: appointment.customerId } },
          create: {
            salonId: appointment.salonId,
            customerId: appointment.customerId,
            appointmentId: input.appointmentId,
            reason: input.reason,
            active: true,
          },
          update: { appointmentId: input.appointmentId, reason: input.reason, active: true },
        });
      }
    }
  }

  /**
   * Mark an appointment as a no-show.
   *
   * - Changes the appointment status to 'no_show', which drops it from the exclusion
   *   constraints and frees both staff and chair (R11.4).
   * - Increments the customer's no-show count (R11.4).
   *
   * @param appointmentId - The ID of the appointment to mark as no-show
   * @returns The updated appointment
   */
  async markNoShow(appointmentId: string, now: Date = new Date()): Promise<Appointment> {
    // Fetch the appointment
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new Error(`Appointment ${appointmentId} not found`);
    }

    if (appointment.status !== 'confirmed') {
      throw new Error(
        `Appointment ${appointmentId} cannot be marked as no-show: current status is '${appointment.status}', expected 'confirmed'`,
      );
    }

    if (appointment.startAt.getTime() > now.getTime()) {
      throw new AppointmentNotStartedError();
    }

    // R11.4: Change status to 'no_show' — releases staff and chair
    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'no_show' },
    });

    // R11.4: Increment customer's no-show count
    await this.prisma.customer.update({
      where: { id: appointment.customerId },
      data: { noShowCount: { increment: 1 } },
    });

    return updated;
  }

  /**
   * Determine whether the cancellation is before or within the Cancellation_Window,
   * and invoke the appropriate deposit policy.
   *
   * - If `now + windowMinutes >= appointment.startAt` → within window → retain deposit (R11.3)
   * - If `now + windowMinutes < appointment.startAt` → before window → refund deposit (R11.2)
   */
  private async handleDepositPolicy(
    appointment: Appointment,
    windowMinutes: number,
    now: Date,
    details?: CancellationDetails,
    existingPayment?: { id: string } | null,
  ): Promise<void> {
    // Check if there's a paid deposit for this appointment
    const payment = existingPayment ?? await this.prisma.payment.findFirst({
      where: { appointmentId: appointment.id, status: 'paid' },
    });

    if (!payment) {
      // No paid deposit — nothing to do
      return;
    }

    // Calculate whether we're within the cancellation window
    const windowBoundary = new Date(now.getTime() + windowMinutes * 60 * 1000);
    const isWithinWindow =
      details?.kind === 'emergency' && details.actor === 'staff'
        ? false
        : windowBoundary >= appointment.startAt;

    if (isWithinWindow) {
      // R11.3: Cancellation within the window — retain the deposit
      await this.paymentService.retainDeposit(appointment.id);
    } else {
      // R11.2: Cancellation before the window — refund the deposit
      await this.paymentService.refundDeposit(appointment.id);
    }
  }

  private async writeCancellation(
    appointment: Appointment,
    details: CancellationDetails | undefined,
    payment: { id: string } | null,
    now: Date,
  ): Promise<void> {
    const delegate = (this.prisma as any).appointmentCancellation;
    if (!delegate?.upsert) return;
    const emergency = details?.kind === 'emergency' && details.actor === 'staff';
    const refundDueAt = emergency && payment
      ? new Date(now.getTime() + (details?.refundDueHours ?? 24) * 60 * 60 * 1000)
      : null;
    await delegate.upsert({
      where: { appointmentId: appointment.id },
      create: {
        appointmentId: appointment.id,
        cancelledBy: details?.actor ?? 'customer',
        kind: details?.kind ?? 'standard',
        reason: details?.reason?.trim() || 'نوبت لغو شد.',
        refundStatus: payment
          ? (emergency ? (details?.refundProof ? 'proof_attached' : 'pending') : 'processed')
          : 'not_required',
        refundDueAt,
        proofFileName: details?.refundProof?.fileName ?? null,
        proofMimeType: details?.refundProof?.mimeType ?? null,
        proofSizeBytes: details?.refundProof?.data.length ?? null,
        proofData: details?.refundProof?.data ?? null,
      },
      update: {
        cancelledBy: details?.actor ?? 'customer',
        kind: details?.kind ?? 'standard',
        reason: details?.reason?.trim() || 'نوبت لغو شد.',
        refundStatus: payment
          ? (emergency ? (details?.refundProof ? 'proof_attached' : 'pending') : 'processed')
          : 'not_required',
        refundDueAt,
        proofFileName: details?.refundProof?.fileName ?? null,
        proofMimeType: details?.refundProof?.mimeType ?? null,
        proofSizeBytes: details?.refundProof?.data.length ?? null,
        proofData: details?.refundProof?.data ?? null,
      },
    });
  }
}
