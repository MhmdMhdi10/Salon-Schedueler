import type { Appointment } from '@prisma/client';
import { safelyNotify, type Logger } from './safely-notify.js';

/**
 * The cancellation capability CancellationFlow needs. `CancellationService`
 * satisfies this structurally.
 */
export interface CancellationOps {
  cancel(
    appointmentId: string,
    cancellationWindowMinutes?: number,
    now?: Date,
  ): Promise<Appointment>;
}

/**
 * The hold-release capability CancellationFlow needs. `SchedulingEngine` satisfies
 * this structurally.
 */
export interface HoldReleaser {
  releaseExpiredHolds(now?: Date): Promise<number>;
}

/**
 * The waitlist-notify capability CancellationFlow needs. `WaitlistService`
 * satisfies this structurally (its `notifyOnFree` returns the notified entry or
 * null; the flow ignores the return value).
 */
export interface WaitlistNotify {
  notifyOnFree(salonId: string, windowStart: Date, windowEnd: Date): Promise<unknown>;
}

/**
 * The customer-notify capability CancellationFlow needs to tell the booked
 * customer their appointment was cancelled (e.g. a stylist cancelled the slot).
 * `NotificationService` satisfies this structurally (its `sendCancellation` is
 * best-effort and never throws).
 */
export interface CustomerCancellationNotify {
  sendCancellation(appointmentId: string): Promise<void>;
}

/** Constructor dependencies for {@link CancellationFlow}. */
export interface CancellationFlowDeps {
  cancellationService: CancellationOps;
  schedulingEngine: HoldReleaser;
  waitlistService: WaitlistNotify;
  /**
   * Optional customer notifier. When provided, a successful cancellation sends
   * the booked customer an SMS (best-effort). Optional so existing callers/tests
   * that don't need it keep working.
   */
  notificationService?: CustomerCancellationNotify;
  logger?: Logger;
}

/**
 * CancellationFlow — the cross-service orchestration the domain intentionally does
 * not own: "after a (Staff_Member, Chair) pair frees, notify the waitlist head"
 * (Requirement 4.2/4.3, original R13.4).
 *
 * It wraps `CancellationService` and `SchedulingEngine` so both stay
 * framework-agnostic (Requirement 4.5). A waitlist-notification failure is logged
 * but never rolls back the cancellation or the resource release (Requirement 4.4).
 */
export class CancellationFlow {
  private readonly cancellationService: CancellationOps;
  private readonly schedulingEngine: HoldReleaser;
  private readonly waitlistService: WaitlistNotify;
  private readonly notificationService?: CustomerCancellationNotify;
  private readonly logger: Logger;

  constructor(deps: CancellationFlowDeps) {
    this.cancellationService = deps.cancellationService;
    this.schedulingEngine = deps.schedulingEngine;
    this.waitlistService = deps.waitlistService;
    this.notificationService = deps.notificationService;
    this.logger = deps.logger ?? console;
  }

  /**
   * Cancel an appointment, then (best-effort) notify the booked customer that
   * their appointment was cancelled and notify the waitlist head for the freed
   * window. Neither notification can roll back the cancellation — a failure in
   * either is logged and swallowed (Requirement 4.4). The cancellation is
   * returned unchanged.
   *
   * Requirements: 4.2, 4.4 (original R13.4)
   */
  async cancel(
    appointmentId: string,
    cancellationWindowMinutes?: number,
    now?: Date,
  ): Promise<Appointment> {
    const appointment = await this.cancellationService.cancel(
      appointmentId,
      cancellationWindowMinutes,
      now,
    );
    // Tell the booked customer their slot was cancelled (best-effort). This is
    // the path a stylist/admin cancellation flows through, so the customer is
    // always informed by SMS.
    if (this.notificationService) {
      const notifier = this.notificationService;
      await safelyNotify(() => notifier.sendCancellation(appointment.id), this.logger);
    }
    await this.notifyWaitlistForWindow(
      appointment.salonId,
      appointment.startAt,
      appointment.endAt,
    );
    return appointment;
  }

  /**
   * Release all expired holds and return the count of released appointments.
   *
   * `SchedulingEngine.releaseExpiredHolds` returns only a count, not the freed
   * windows, so per-window waitlist notification cannot be derived here without
   * fabricating data. The worker that enumerates freed windows calls
   * {@link notifyWaitlistForWindow} for each one; this method keeps the release
   * itself simple and correct (Requirement 4.3, original R13.4).
   *
   * @returns The number of holds released.
   */
  async releaseExpiredHoldsAndNotify(now?: Date): Promise<number> {
    return this.schedulingEngine.releaseExpiredHolds(now);
  }

  /**
   * Notify the waitlist head that a (Staff_Member, Chair) pair freed for a window
   * (best-effort). Used after a cancellation and by the hold-expiry worker for each
   * freed window (Requirement 4.2/4.3, original R13.4).
   */
  async notifyWaitlistForWindow(
    salonId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<void> {
    await safelyNotify(
      () => this.waitlistService.notifyOnFree(salonId, startAt, endAt),
      this.logger,
    );
  }
}
