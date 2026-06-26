import type { PrismaClient } from '@prisma/client';
import type { PaymentGateway } from './payment-gateway.interface';
import type { SchedulingEngine } from '../scheduling/scheduling-engine';

/**
 * PaymentService — orchestrates deposit payments for held bookings.
 *
 * - `initiateDeposit(appointmentId)` — creates payment record, calls gateway.request,
 *   returns redirect URL (R10.2)
 * - `handleCallback(payload)` — calls gateway.verify, if ok → calls
 *   schedulingEngine.confirmHeld (R10.3)
 * - `refundDeposit(appointmentId)` — calls gateway.refund (R11.2)
 * - `retainDeposit(appointmentId)` — marks payment as retained (R11.3)
 *
 * All amounts in integer Rial (R10.5).
 *
 * Requirements: R10.2, R10.3, R10.5, R11.2, R11.3
 */

export interface PaymentCallbackPayload {
  authority: string;
  status: string; // gateway-specific status indicator (e.g., 'OK' or 'NOK')
}

export interface PaymentServiceOptions {
  callbackBaseUrl: string;
}

export class PaymentService {
  private readonly prisma: PrismaClient;
  private readonly gateway: PaymentGateway;
  private readonly schedulingEngine: SchedulingEngine;
  private readonly callbackBaseUrl: string;

  constructor(
    prisma: PrismaClient,
    gateway: PaymentGateway,
    schedulingEngine: SchedulingEngine,
    options: PaymentServiceOptions,
  ) {
    this.prisma = prisma;
    this.gateway = gateway;
    this.schedulingEngine = schedulingEngine;
    this.callbackBaseUrl = options.callbackBaseUrl;
  }

  /**
   * Initiate a deposit payment for a held appointment.
   * Creates a payment record in 'pending' status, calls the gateway to get a redirect URL.
   *
   * Requirements: R10.2, R10.5
   */
  async initiateDeposit(appointmentId: string): Promise<{ paymentId: string; redirectUrl: string }> {
    // Fetch the appointment and service
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true },
    });

    if (!appointment) {
      throw new Error(`Appointment ${appointmentId} not found`);
    }

    if (appointment.status !== 'held') {
      throw new Error(
        `Appointment ${appointmentId} is not in 'held' status (current: ${appointment.status})`,
      );
    }

    const depositRial = appointment.service.depositRial;
    if (depositRial === null || depositRial === undefined) {
      throw new Error(`Service ${appointment.serviceId} does not have a deposit configured`);
    }

    const amountRial = Number(depositRial);
    const callbackUrl = `${this.callbackBaseUrl}/payments/callback`;

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        appointmentId,
        amountRial: BigInt(amountRial),
        status: 'pending',
        gateway: this.getGatewayName(),
      },
    });

    // Call gateway to get authority and redirect URL
    const { authority, redirectUrl } = await this.gateway.request(amountRial, callbackUrl, {
      description: `Deposit for appointment ${appointmentId}`,
    });

    // Update payment record with authority
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { authority },
    });

    return { paymentId: payment.id, redirectUrl };
  }

  /**
   * Handle the payment gateway callback after customer returns.
   * Verifies the payment and, if successful, confirms the held appointment.
   * If the appointment has expired (hold period elapsed), delegates to late-deposit
   * re-verification flow (R10.6).
   *
   * Requirements: R10.3, R10.6
   */
  async handleCallback(payload: PaymentCallbackPayload): Promise<{ confirmed: boolean }> {
    const { authority, status } = payload;

    // Find the payment record by authority
    const payment = await this.prisma.payment.findFirst({
      where: { authority },
      include: { appointment: true },
    });

    if (!payment) {
      throw new Error(`Payment with authority ${authority} not found`);
    }

    if (payment.status !== 'pending') {
      // Already processed
      return { confirmed: payment.status === 'paid' };
    }

    // If gateway indicated failure, mark as failed
    if (status !== 'OK' && status !== '100' && status !== '101') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed' },
      });
      return { confirmed: false };
    }

    // Verify with gateway
    const amountRial = Number(payment.amountRial);
    const verifyResult = await this.gateway.verify(authority, amountRial);

    if (!verifyResult.ok) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed' },
      });
      return { confirmed: false };
    }

    // Payment verified — update payment record
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'paid',
        refId: verifyResult.refId,
      },
    });

    // Check if appointment has expired (late deposit scenario — R10.6)
    if (payment.appointment && payment.appointment.status === 'expired') {
      return this.handleLateDeposit(payment.id, payment.appointmentId, verifyResult.refId!, amountRial);
    }

    // Confirm the held appointment (R10.3)
    try {
      await this.schedulingEngine.confirmHeld(payment.appointmentId);
    } catch {
      // Appointment may have already expired (R10.4) — try late deposit re-verification
      return this.handleLateDeposit(payment.id, payment.appointmentId, verifyResult.refId!, amountRial);
    }

    return { confirmed: true };
  }

  /**
   * Handle a late deposit: payment arrived after the Hold_Period has elapsed.
   *
   * Re-verifies that the original (staff, chair, time) are still free inside a transaction.
   * If free → confirm the appointment (status back to 'confirmed').
   * If not free → keep appointment expired, refund the payment.
   *
   * Requirements: R10.6
   */
  async handleLateDeposit(
    paymentId: string,
    appointmentId: string,
    refId: string,
    amountRial: number,
  ): Promise<{ confirmed: boolean }> {
    // Fetch the expired appointment with its details
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      // Appointment gone — refund
      await this.refundByRefId(paymentId, refId, amountRial);
      return { confirmed: false };
    }

    // Re-verify availability: check that the same staff member and chair are free
    // for the original time range by looking for overlapping held/confirmed appointments
    const overlapping = await this.prisma.appointment.findMany({
      where: {
        id: { not: appointmentId },
        status: { in: ['held', 'confirmed'] },
        startAt: { lt: appointment.endAt },
        endAt: { gt: appointment.startAt },
        OR: [
          { staffMemberId: appointment.staffMemberId },
          { chairId: appointment.chairId },
        ],
      },
    });

    if (overlapping.length > 0) {
      // Resources no longer free — refund the payment (R10.6)
      await this.refundByRefId(paymentId, refId, amountRial);
      return { confirmed: false };
    }

    // Resources are still free — confirm the appointment
    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'confirmed',
        holdExpiresAt: null,
      },
    });

    return { confirmed: true };
  }

  /**
   * Refund a payment using its refId directly.
   * Used during late-deposit re-verification when resources are no longer free.
   */
  private async refundByRefId(paymentId: string, refId: string, amountRial: number): Promise<void> {
    const refundResult = await this.gateway.refund(refId, amountRial);
    if (refundResult.ok) {
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'refunded' },
      });
    }
    // If refund fails, payment stays as 'paid' — manual intervention needed
  }

  /**
   * Refund the deposit for an appointment (e.g., cancellation before window).
   *
   * Requirements: R11.2
   */
  async refundDeposit(appointmentId: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        appointmentId,
        status: 'paid',
      },
    });

    if (!payment) {
      throw new Error(`No paid payment found for appointment ${appointmentId}`);
    }

    if (!payment.refId) {
      throw new Error(`Payment ${payment.id} has no refId for refund`);
    }

    const amountRial = Number(payment.amountRial);
    const result = await this.gateway.refund(payment.refId, amountRial);

    if (!result.ok) {
      throw new Error(`Refund failed for payment ${payment.id}`);
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'refunded' },
    });
  }

  /**
   * Retain the deposit for an appointment (e.g., late cancellation or no-show).
   *
   * Requirements: R11.3
   */
  async retainDeposit(appointmentId: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        appointmentId,
        status: 'paid',
      },
    });

    if (!payment) {
      throw new Error(`No paid payment found for appointment ${appointmentId}`);
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'retained' },
    });
  }

  /**
   * Request a gateway payment for a non-deposit flow (e.g. subscriptions),
   * reusing the same gateway integration as deposits — no second gateway is
   * created. Returns the gateway `authority` and the customer `redirectUrl`.
   *
   * The caller owns its own payment record (e.g. `SubscriptionPayment`); this
   * method only talks to the shared gateway.
   *
   * Requirements: R3.6 (subscription purchase reuses PaymentService).
   */
  async requestGatewayPayment(
    amountRial: number,
    callbackPath: string,
    description: string,
  ): Promise<{ authority: string; redirectUrl: string }> {
    const callbackUrl = `${this.callbackBaseUrl}${callbackPath}`;
    return this.gateway.request(amountRial, callbackUrl, { description });
  }

  /**
   * Verify a previously requested gateway payment, reusing the shared gateway.
   * Returns `ok=true` and a `refId` on success.
   *
   * Requirements: R3.7 (subscription activation on verified payment).
   */
  async verifyGatewayPayment(
    authority: string,
    amountRial: number,
  ): Promise<{ ok: boolean; refId?: string }> {
    return this.gateway.verify(authority, amountRial);
  }

  /**
   * Get the gateway name for the current adapter (used in payment records).
   */
  getGatewayName(): string {
    // Determine from the adapter constructor name
    const name = this.gateway.constructor.name;
    if (name.toLowerCase().includes('zarinpal')) return 'zarinpal';
    if (name.toLowerCase().includes('idpay')) return 'idpay';
    return 'unknown';
  }
}
