import { CancellationFlow } from '../cancellation-flow.js';
import type {
  CancellationOps,
  HoldReleaser,
  WaitlistNotify,
} from '../cancellation-flow.js';
import type { Appointment } from '@prisma/client';

/**
 * CancellationFlow tests (Requirement 4.2, 4.3, 4.4 / original R13.4).
 *
 * Uses in-memory fakes for the cancellation service, engine, and waitlist so no
 * database is required.
 */

const SALON_ID = 'salon-1';
const START_AT = new Date('2024-03-15T10:00:00.000Z');
const END_AT = new Date('2024-03-15T11:00:00.000Z');

function fakeCancelledAppointment(id: string): Appointment {
  return {
    id,
    salonId: SALON_ID,
    startAt: START_AT,
    endAt: END_AT,
    status: 'cancelled',
  } as Appointment;
}

function makeCancellation(): CancellationOps & {
  calls: { id: string; windowMinutes?: number; now?: Date }[];
} {
  const calls: { id: string; windowMinutes?: number; now?: Date }[] = [];
  return {
    calls,
    async cancel(appointmentId, cancellationWindowMinutes, now) {
      calls.push({ id: appointmentId, windowMinutes: cancellationWindowMinutes, now });
      return fakeCancelledAppointment(appointmentId);
    },
  };
}

function makeReleaser(count: number): HoldReleaser & { calls: (Date | undefined)[] } {
  const calls: (Date | undefined)[] = [];
  return {
    calls,
    async releaseExpiredHolds(now) {
      calls.push(now);
      return count;
    },
  };
}

function makeWaitlist(
  impl?: () => Promise<void>,
): WaitlistNotify & { calls: { salonId: string; windowStart: Date; windowEnd: Date }[] } {
  const calls: { salonId: string; windowStart: Date; windowEnd: Date }[] = [];
  return {
    calls,
    async notifyOnFree(salonId, windowStart, windowEnd) {
      calls.push({ salonId, windowStart, windowEnd });
      if (impl) {
        await impl();
      }
      return null;
    },
  };
}

describe('CancellationFlow', () => {
  describe('cancel()', () => {
    it('cancels then notifies the waitlist for the freed window (R4.2)', async () => {
      const cancellationService = makeCancellation();
      const schedulingEngine = makeReleaser(0);
      const waitlistService = makeWaitlist();
      const flow = new CancellationFlow({
        cancellationService,
        schedulingEngine,
        waitlistService,
      });

      const appt = await flow.cancel('appt-1');

      expect(appt.id).toBe('appt-1');
      expect(cancellationService.calls).toEqual([
        { id: 'appt-1', windowMinutes: undefined, now: undefined },
      ]);
      expect(waitlistService.calls).toEqual([
        { salonId: SALON_ID, windowStart: START_AT, windowEnd: END_AT },
      ]);
    });

    it('forwards the cancellation window and clock to the cancellation service', async () => {
      const cancellationService = makeCancellation();
      const schedulingEngine = makeReleaser(0);
      const waitlistService = makeWaitlist();
      const flow = new CancellationFlow({
        cancellationService,
        schedulingEngine,
        waitlistService,
      });
      const now = new Date('2024-03-15T09:00:00.000Z');

      await flow.cancel('appt-1', 120, now);

      expect(cancellationService.calls).toEqual([
        { id: 'appt-1', windowMinutes: 120, now },
      ]);
    });

    it('does NOT throw when the waitlist notifier fails (R4.4)', async () => {
      const cancellationService = makeCancellation();
      const schedulingEngine = makeReleaser(0);
      const waitlistService = makeWaitlist(async () => {
        throw new Error('waitlist lookup failed');
      });
      const logger = { error: jest.fn() };
      const flow = new CancellationFlow({
        cancellationService,
        schedulingEngine,
        waitlistService,
        logger,
      });

      const appt = await flow.cancel('appt-1');

      expect(appt.id).toBe('appt-1');
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('releaseExpiredHoldsAndNotify()', () => {
    it('releases expired holds and returns the count', async () => {
      const cancellationService = makeCancellation();
      const schedulingEngine = makeReleaser(3);
      const waitlistService = makeWaitlist();
      const flow = new CancellationFlow({
        cancellationService,
        schedulingEngine,
        waitlistService,
      });
      const now = new Date('2024-03-15T12:00:00.000Z');

      const count = await flow.releaseExpiredHoldsAndNotify(now);

      expect(count).toBe(3);
      expect(schedulingEngine.calls).toEqual([now]);
    });
  });

  describe('notifyWaitlistForWindow()', () => {
    it('notifies the waitlist for a specific freed window (R4.3)', async () => {
      const cancellationService = makeCancellation();
      const schedulingEngine = makeReleaser(0);
      const waitlistService = makeWaitlist();
      const flow = new CancellationFlow({
        cancellationService,
        schedulingEngine,
        waitlistService,
      });

      await flow.notifyWaitlistForWindow(SALON_ID, START_AT, END_AT);

      expect(waitlistService.calls).toEqual([
        { salonId: SALON_ID, windowStart: START_AT, windowEnd: END_AT },
      ]);
    });

    it('swallows waitlist notifier failures (R4.4)', async () => {
      const cancellationService = makeCancellation();
      const schedulingEngine = makeReleaser(0);
      const waitlistService = makeWaitlist(async () => {
        throw new Error('waitlist lookup failed');
      });
      const logger = { error: jest.fn() };
      const flow = new CancellationFlow({
        cancellationService,
        schedulingEngine,
        waitlistService,
        logger,
      });

      await expect(
        flow.notifyWaitlistForWindow(SALON_ID, START_AT, END_AT),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });
});
