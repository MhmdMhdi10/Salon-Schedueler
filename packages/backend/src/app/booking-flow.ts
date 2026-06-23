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
}

/**
 * The confirmation capability BookingFlow needs. `NotificationService` satisfies
 * this structurally.
 */
export interface ConfirmationNotifier {
  sendConfirmation(appointmentId: string): Promise<void>;
}

/** Constructor dependencies for {@link BookingFlow}. */
export interface BookingFlowDeps {
  schedulingEngine: BookingEngine;
  notificationService: ConfirmationNotifier;
  logger?: Logger;
}

/**
 * BookingFlow — the cross-service orchestration the domain intentionally does not
 * own: "after a booking is confirmed, send a confirmation" (Requirement 4.1,
 * original R12.1).
 *
 * It wraps `SchedulingEngine` so the engine stays framework-agnostic and its
 * existing unit/property tests remain valid (Requirement 4.5). A confirmation
 * delivery failure is logged but never rolls back the confirmed appointment
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
   * Book an appointment. On a deposit-free confirmation, dispatch a confirmation
   * notification (best-effort). Held and rejected results are returned unchanged;
   * held bookings are confirmed later via {@link confirm} from the payment path.
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
