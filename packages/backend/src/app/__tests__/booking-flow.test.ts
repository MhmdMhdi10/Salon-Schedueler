import { BookingFlow } from '../booking-flow.js';
import type { BookingEngine, ConfirmationNotifier } from '../booking-flow.js';
import type { BookingRequest, BookingResult } from '../../scheduling/scheduling-engine.js';
import type { Appointment } from '@prisma/client';

/**
 * BookingFlow tests (Requirement 4.1, 4.4 / original R12.1).
 *
 * Uses in-memory fakes for the engine and notifier so no database is required.
 */

const sampleRequest: BookingRequest = {
  salonId: 'salon-1',
  serviceId: 'service-1',
  startAt: '2024-03-15T10:00:00.000Z',
  customerId: 'customer-1',
  source: 'web',
};

/** A minimal Appointment stand-in — only `id` is read by the flow. */
function fakeAppointment(id: string): Appointment {
  return { id } as Appointment;
}

function makeEngine(result: BookingResult): BookingEngine & {
  bookCalls: BookingRequest[];
  confirmCalls: string[];
} {
  const bookCalls: BookingRequest[] = [];
  const confirmCalls: string[] = [];
  return {
    bookCalls,
    confirmCalls,
    async book(req) {
      bookCalls.push(req);
      return result;
    },
    async confirmHeld(appointmentId) {
      confirmCalls.push(appointmentId);
      return fakeAppointment(appointmentId);
    },
  };
}

function makeNotifier(impl?: (id: string) => Promise<void>): ConfirmationNotifier & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    async sendConfirmation(appointmentId) {
      calls.push(appointmentId);
      if (impl) {
        await impl(appointmentId);
      }
    },
  };
}

describe('BookingFlow', () => {
  describe('book()', () => {
    it('sends exactly one confirmation when the booking is confirmed (R4.1)', async () => {
      const engine = makeEngine({
        status: 'confirmed',
        appointment: fakeAppointment('appt-1'),
      });
      const notifier = makeNotifier();
      const flow = new BookingFlow({
        schedulingEngine: engine,
        notificationService: notifier,
      });

      const result = await flow.book(sampleRequest);

      expect(result).toEqual({ status: 'confirmed', appointment: { id: 'appt-1' } });
      expect(notifier.calls).toEqual(['appt-1']);
    });

    it('does NOT send a confirmation when the booking is rejected (R4.1)', async () => {
      const engine = makeEngine({ status: 'rejected', reason: 'no_availability' });
      const notifier = makeNotifier();
      const flow = new BookingFlow({
        schedulingEngine: engine,
        notificationService: notifier,
      });

      const result = await flow.book(sampleRequest);

      expect(result).toEqual({ status: 'rejected', reason: 'no_availability' });
      expect(notifier.calls).toEqual([]);
    });

    it('does NOT send a confirmation for a held booking (awaits payment first)', async () => {
      const engine = makeEngine({
        status: 'held',
        appointment: fakeAppointment('appt-held'),
        payment: { paymentId: 'pay-1', redirectUrl: '/pay/1' },
      });
      const notifier = makeNotifier();
      const flow = new BookingFlow({
        schedulingEngine: engine,
        notificationService: notifier,
      });

      const result = await flow.book(sampleRequest);

      expect(result.status).toBe('held');
      expect(notifier.calls).toEqual([]);
    });

    it('returns the confirmed result unchanged even when the notifier throws (R4.4)', async () => {
      const engine = makeEngine({
        status: 'confirmed',
        appointment: fakeAppointment('appt-1'),
      });
      const notifier = makeNotifier(async () => {
        throw new Error('SMS provider down');
      });
      const logger = { error: jest.fn() };
      const flow = new BookingFlow({
        schedulingEngine: engine,
        notificationService: notifier,
        logger,
      });

      const result = await flow.book(sampleRequest);

      expect(result).toEqual({ status: 'confirmed', appointment: { id: 'appt-1' } });
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('confirm()', () => {
    it('confirms the held appointment and sends a confirmation (R4.1)', async () => {
      const engine = makeEngine({ status: 'rejected', reason: 'no_availability' });
      const notifier = makeNotifier();
      const flow = new BookingFlow({
        schedulingEngine: engine,
        notificationService: notifier,
      });

      const appt = await flow.confirm('appt-42');

      expect(appt.id).toBe('appt-42');
      expect(engine.confirmCalls).toEqual(['appt-42']);
      expect(notifier.calls).toEqual(['appt-42']);
    });

    it('does not throw when the notifier fails after confirming (R4.4)', async () => {
      const engine = makeEngine({ status: 'rejected', reason: 'no_availability' });
      const notifier = makeNotifier(async () => {
        throw new Error('SMS provider down');
      });
      const logger = { error: jest.fn() };
      const flow = new BookingFlow({
        schedulingEngine: engine,
        notificationService: notifier,
        logger,
      });

      const appt = await flow.confirm('appt-42');

      expect(appt.id).toBe('appt-42');
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });
});
