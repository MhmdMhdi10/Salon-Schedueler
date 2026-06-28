import type { Appointment } from '@prisma/client';
import type { BookingRequest, BookingResult } from '../scheduling/scheduling-engine.js';
import { safelyNotify, type Logger } from './safely-notify.js';

/**
 * The scheduling capability BookingFlow needs. `SchedulingEngine` satisfies this
 * structurally, but the narrow interface keeps the flow decoupled and trivially
 * fakeable in tests.
 */
export interface BookingEngine {
  book(req: BookingRequest): Promise<BookingResult>;
  confirmHeld(appointmentId: string): Promise<Appointment>;
  approve(appointmentId: string): Promise<Appointment>;
  reject(appointmentId: string): Promise<Appointment>;
}

/**
 * The customer-notification capability BookingFlow needs. `NotificationService`
 * satisfies this structurally.
 */
export interface ConfirmationNotifier {
  sendConfirmation(appointmentId: string): Promise<void>;
  sendRejection(appointmentId: string): Promise<void>;
}

/** Constructor dependencies for {@link BookingFlow}. */
export interface BookingFlowDeps {
  schedulingEngine: BookingEngine;
  notificationService: ConfirmationNotifier;
  logger?: Logger;
}

/**
 * BookingFlow — the cross-service orchestration the domain intentionally does not
 * own. A new booking is created as `pending` (awaiting salon admin approval) and
 * the customer is NOT notified yet. The confirmation notification is dispatched
 * only when an admin approves the booking ({@link approve}); a rejection
 * dispatches a rejection notice ({@link reject}). Deposit bookings are still
 * confirmed via {@link confirm} from the payment path.
 *
 * It wraps `SchedulingEngine` so the engine stays framework-agnostic and its
 * existing unit/property tests remain valid (Requirement 4.5). A notification
 * delivery failure is logged but never rolls back the appointment state change
 * (Requirement 4.4).
 */
export class BookingFlow {
  private readonly schedulingEngine: BookingEngine;
  private readonly notificationService: ConfirmationNotifier;
  private readonly logger: Logger;

  constructor(deps: BookingFlowDeps) {
    this.schedulingEngine = deps.schedulingEngine;
    this.notificationService = deps.notificationService;
    this.logger = deps.logger ?? console;
  }

  /**
   * Book an appointment. A deposit-free booking is created as `pending`
   * (awaiting admin approval — the customer is notified on {@link approve}) UNLESS
   * the salon/stylist approval policy auto-approves it, in which case it is
   * `confirmed` and the customer is notified immediately here (best-effort). A
   * deposit booking is `held` (confirmed later via {@link confirm} from the
   * payment path); a rejected booking found no slot.
   *
   * Requirements: 4.1, 4.4 (original R12.1)
   */
  async book(req: BookingRequest): Promise<BookingResult> {
    const result = await this.schedulingEngine.book(req);
    if (result.status === 'confirmed') {
      await this.safelyNotify(() =>
        this.notificationService.sendConfirmation(result.appointment.id),
      );
    }
    return result;
  }

  /**
   * Approve a pending booking (salon admin action): transition it to `confirmed`
   * and dispatch the customer confirmation notification (best-effort). A delivery
   * failure is logged but never rolls back the approval (Requirement 4.4).
   */
  async approve(appointmentId: string): Promise<Appointment> {
    const appointment = await this.schedulingEngine.approve(appointmentId);
    await this.safelyNotify(() =>
      this.notificationService.sendConfirmation(appointment.id),
    );
    return appointment;
  }

  /**
   * Reject a pending booking (salon admin action): transition it to `cancelled`
   * and notify the customer that the request was declined (best-effort). A
   * delivery failure is logged but never rolls back the rejection (Requirement 4.4).
   */
  async reject(appointmentId: string): Promise<Appointment> {
    const appointment = await this.schedulingEngine.reject(appointmentId);
    await this.safelyNotify(() =>
      this.notificationService.sendRejection(appointment.id),
    );
    return appointment;
  }

  /**
   * Confirm a previously held appointment (called from the payment callback path,
   * original R10.3) and dispatch a confirmation notification (best-effort).
   *
   * Requirements: 4.1, 4.4 (original R12.1)
   */
  async confirm(appointmentId: string): Promise<Appointment> {
    const appointment = await this.schedulingEngine.confirmHeld(appointmentId);
    await this.safelyNotify(() =>
      this.notificationService.sendConfirmation(appointment.id),
    );
    return appointment;
  }

  /**
   * Run a notification side effect so a failure is logged but never rolls back the
   * confirmed booking (Requirement 4.4).
   */
  private safelyNotify(fn: () => Promise<unknown>): Promise<void> {
    return safelyNotify(fn, this.logger);
  }
}
