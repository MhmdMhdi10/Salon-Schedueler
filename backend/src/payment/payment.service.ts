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

export type DepositMethod = 'gateway' | 'card_transfer';

export interface PendingManualReceipt {
  appointmentId: string;
  receiptId: string;
  amountRial: number;
  uploadedAt: Date;
  appointmentStatus: string;
  startAt: Date;
  endAt: Date;
  serviceName: string;
  customerName: string | null;
  customerPhone: string;
  staffName: string;
  depositReceiptStatus: 'pending';
}

export interface DepositInitiation {
  paymentId: string;
  method: DepositMethod;
  amountRial: number;
  redirectUrl?: string;
  cardNumber?: string;
  cardHolder?: string;
  bankName?: string;
}

export interface DepositOverview {
  required: boolean;
  method: DepositMethod | null;
  amountRial: number | null;
  appointmentStatus: string;
  holdExpiresAt: Date | null;
  cardNumber: string | null;
  cardHolder: string | null;
  bankName: string | null;
  paymentStatus: string | null;
  receiptStatus: string | null;
  receiptId: string | null;
  receiptUploadedAt: Date | null;
}

export interface ManualReceiptFile {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  status: string;
  data: Buffer;
}

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const RECEIPT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
  async initiateDeposit(appointmentId: string): Promise<DepositInitiation> {
    // Fetch the appointment and service
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        service: true,
        salon: {
          select: {
            depositMethod: true,
            depositCardNumber: true,
            depositCardHolder: true,
            depositBankName: true,
          },
        },
      },
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
    const salonSettings = appointment.salon ?? {
      depositMethod: 'card_transfer',
      depositCardNumber: null,
      depositCardHolder: null,
      depositBankName: null,
    };
    // Online gateway checkout is disabled for deposits until the next release.
    const method: DepositMethod = 'card_transfer';

    if (method === 'card_transfer') {
      if (!salonSettings.depositCardNumber || !salonSettings.depositCardHolder) {
        throw new Error('DEPOSIT_CARD_NOT_CONFIGURED');
      }
      const existing = await this.prisma.payment.findFirst({
        where: { appointmentId, gateway: 'card_transfer', status: 'pending' },
        orderBy: { createdAt: 'desc' },
      });
      const payment = existing ?? await this.prisma.payment.create({
        data: {
          appointmentId,
          amountRial: BigInt(amountRial),
          status: 'pending',
          gateway: 'card_transfer',
        },
      });
      return {
        paymentId: payment.id,
        method,
        amountRial,
        cardNumber: salonSettings.depositCardNumber,
        cardHolder: salonSettings.depositCardHolder,
        bankName: salonSettings.depositBankName ?? undefined,
      };
    }

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
      orderId: appointmentId,
    });

    // Update payment record with authority
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { authority },
    });

    return { paymentId: payment.id, method, amountRial, redirectUrl };
  }

  /** Read deposit state without exposing receipt bytes. */
  async getDepositOverview(appointmentId: string): Promise<DepositOverview> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        service: { select: { requiresDeposit: true, depositRial: true } },
        salon: {
          select: {
            depositMethod: true,
            depositCardNumber: true,
            depositCardHolder: true,
            depositBankName: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true },
        },
        depositReceipt: {
          select: { id: true, status: true, uploadedAt: true },
        },
      },
    });
    if (!appointment) throw new Error('APPOINTMENT_NOT_FOUND');
    return {
      required: appointment.service.requiresDeposit === true,
      method: appointment.service.requiresDeposit
        ? 'card_transfer'
        : null,
      amountRial: appointment.service.depositRial == null ? null : Number(appointment.service.depositRial),
      appointmentStatus: appointment.status,
      holdExpiresAt: appointment.holdExpiresAt,
      cardNumber: appointment.salon.depositCardNumber,
      cardHolder: appointment.salon.depositCardHolder,
      bankName: appointment.salon.depositBankName,
      paymentStatus: appointment.payments[0]?.status ?? null,
      receiptStatus: appointment.depositReceipt?.status ?? null,
      receiptId: appointment.depositReceipt?.id ?? null,
      receiptUploadedAt: appointment.depositReceipt?.uploadedAt ?? null,
    };
  }

  /** Store or replace a customer's manual-transfer receipt. */
  async uploadManualReceipt(
    appointmentId: string,
    input: { fileName: string; mimeType: string; dataBase64: string },
  ): Promise<{ receiptId: string; status: string }> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        service: { select: { requiresDeposit: true, depositRial: true } },
        salon: { select: { depositMethod: true } },
      },
    });
    if (!appointment) throw new Error('APPOINTMENT_NOT_FOUND');
    if (appointment.status !== 'held') throw new Error('DEPOSIT_HOLD_EXPIRED');
    if (!appointment.service.requiresDeposit || appointment.salon.depositMethod !== 'card_transfer') {
      throw new Error('MANUAL_DEPOSIT_NOT_ENABLED');
    }
    if (!RECEIPT_MIME_TYPES.has(input.mimeType)) throw new Error('DEPOSIT_RECEIPT_TYPE_INVALID');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.dataBase64) || input.dataBase64.length > 7_200_000) {
      throw new Error('DEPOSIT_RECEIPT_INVALID');
    }
    const data = Buffer.from(input.dataBase64, 'base64');
    if (data.length === 0 || data.length > MAX_RECEIPT_BYTES || !this.hasImageSignature(data, input.mimeType)) {
      throw new Error('DEPOSIT_RECEIPT_INVALID');
    }
    const fileName = input.fileName.trim().replace(/[^\w.\- ]/g, '').slice(0, 120) || 'receipt';
    const payment = await this.ensureManualPayment(appointmentId, Number(appointment.service.depositRial));
    const existing = await this.prisma.depositReceipt.findUnique({ where: { appointmentId } });
    const receipt = existing
      ? await this.prisma.depositReceipt.update({
          where: { appointmentId },
          data: {
            paymentId: payment.id,
            amountRial: payment.amountRial,
            status: 'pending',
            fileName,
            mimeType: input.mimeType,
            sizeBytes: data.length,
            data,
            note: null,
            uploadedAt: new Date(),
            reviewedAt: null,
            reviewedBy: null,
          },
        })
      : await this.prisma.depositReceipt.create({
          data: {
            appointmentId,
            paymentId: payment.id,
            salonId: appointment.salonId,
            amountRial: payment.amountRial,
            status: 'pending',
            fileName,
            mimeType: input.mimeType,
            sizeBytes: data.length,
            data,
          },
        });
    return { receiptId: receipt.id, status: receipt.status };
  }

  /** Return receipt metadata + bytes after the caller has passed route RBAC. */
  async getManualReceiptFile(appointmentId: string): Promise<ManualReceiptFile | null> {
    const receipt = await this.prisma.depositReceipt.findUnique({ where: { appointmentId } });
    if (!receipt) return null;
    return {
      id: receipt.id,
      fileName: receipt.fileName,
      mimeType: receipt.mimeType,
      sizeBytes: receipt.sizeBytes,
      uploadedAt: receipt.uploadedAt,
      status: receipt.status,
      data: Buffer.from(receipt.data),
    };
  }

  /** List receipt metadata that still needs an owner/admin decision. */
  async listPendingManualReceipts(salonId: string): Promise<PendingManualReceipt[]> {
    const receipts = await this.prisma.depositReceipt.findMany({
      where: { salonId, status: 'pending' },
      include: {
        appointment: {
          select: {
            id: true,
            startAt: true,
            endAt: true,
            status: true,
            service: { select: { name: true } },
            customer: { select: { fullName: true, phone: true } },
            staffMember: { select: { fullName: true } },
          },
        },
      },
      orderBy: { uploadedAt: 'asc' },
    });
    return receipts.map((receipt) => ({
      appointmentId: receipt.appointment.id,
      receiptId: receipt.id,
      amountRial: Number(receipt.amountRial),
      uploadedAt: receipt.uploadedAt,
      appointmentStatus: receipt.appointment.status,
      startAt: receipt.appointment.startAt,
      endAt: receipt.appointment.endAt,
      serviceName: receipt.appointment.service.name,
      customerName: receipt.appointment.customer.fullName,
      customerPhone: receipt.appointment.customer.phone,
      staffName: receipt.appointment.staffMember.fullName,
      depositReceiptStatus: 'pending',
    }));
  }

  /** Approve or reject a pending manual receipt. */
  async reviewManualReceipt(
    appointmentId: string,
    decision: 'approved' | 'rejected',
    reviewerId: string,
    note?: string,
  ): Promise<{ status: string; appointmentStatus: string }> {
    const receipt = await this.prisma.depositReceipt.findUnique({
      where: { appointmentId },
      include: { appointment: true, payment: true },
    });
    if (!receipt) throw new Error('DEPOSIT_RECEIPT_NOT_FOUND');
    if (receipt.status !== 'pending') throw new Error('DEPOSIT_RECEIPT_ALREADY_REVIEWED');
    if (decision === 'rejected') {
      const reviewed = await this.prisma.$transaction(async (tx) => {
        const result = await tx.depositReceipt.updateMany({
          where: { id: receipt.id, status: 'pending' },
          data: {
            status: 'rejected',
            note: note?.trim() || null,
            reviewedAt: new Date(),
            reviewedBy: reviewerId,
          },
        });
        if (result.count !== 1) return false;
        if (receipt.paymentId) {
          await tx.payment.update({ where: { id: receipt.paymentId }, data: { status: 'failed' } });
        }
        return true;
      });
      if (!reviewed) throw new Error('DEPOSIT_RECEIPT_ALREADY_REVIEWED');
      return { status: 'rejected', appointmentStatus: receipt.appointment.status };
    }

    const now = new Date();
    try {
      const reviewResult = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.depositReceipt.updateMany({
          where: { id: receipt.id, status: 'pending' },
          data: {
            status: 'approved',
            note: note?.trim() || null,
            reviewedAt: now,
            reviewedBy: reviewerId,
          },
        });
        if (claimed.count !== 1) return 'already_reviewed' as const;

        const result = await tx.appointment.updateMany({
          where: {
            id: appointmentId,
            status: 'held',
            holdExpiresAt: { gt: now },
          },
          data: { status: 'confirmed', holdExpiresAt: null },
        });
        if (result.count !== 1) throw new Error('MANUAL_DEPOSIT_HOLD_EXPIRED');
        if (receipt.paymentId) {
          await tx.payment.update({
            where: { id: receipt.paymentId },
            data: { status: 'paid', refId: `card-transfer:${receipt.id}` },
          });
        }
        return 'approved' as const;
      });
      if (reviewResult === 'already_reviewed') {
        throw new Error('DEPOSIT_RECEIPT_ALREADY_REVIEWED');
      }
      return { status: 'approved', appointmentStatus: 'confirmed' };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'MANUAL_DEPOSIT_HOLD_EXPIRED') throw error;
      const expired = await this.prisma.$transaction(async (tx) => {
        const result = await tx.depositReceipt.updateMany({
          where: { id: receipt.id, status: 'pending' },
          data: { status: 'expired', note: 'مهلت پرداخت به پایان رسیده است.', reviewedAt: now, reviewedBy: reviewerId },
        });
        if (result.count !== 1) return false;
        if (receipt.paymentId) {
          await tx.payment.update({ where: { id: receipt.paymentId }, data: { status: 'failed' } });
        }
        return true;
      });
      if (!expired) throw new Error('DEPOSIT_RECEIPT_ALREADY_REVIEWED');
      return { status: 'expired', appointmentStatus: 'expired' };
    }
  }

  private async ensureManualPayment(appointmentId: string, amountRial: number) {
    const existing = await this.prisma.payment.findFirst({
      where: { appointmentId, gateway: 'card_transfer', status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    return existing ?? this.prisma.payment.create({
      data: { appointmentId, amountRial: BigInt(amountRial), status: 'pending', gateway: 'card_transfer' },
    });
  }

  private hasImageSignature(data: Buffer, mimeType: string): boolean {
    if (mimeType === 'image/jpeg') return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    if (mimeType === 'image/png') return data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    return data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
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

    // Card transfers cannot be refunded through the online gateway. Keep the
    // financial record explicit; the salon handles the actual bank transfer.
    if (payment.gateway === 'card_transfer') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'refunded' },
      });
      return;
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
    if (name.toLowerCase().includes('zibal')) return 'zibal';
    return 'unknown';
  }
}
