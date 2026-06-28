import { BookingFlow } from '../booking-flow.js';
import type { BookingEngine, ConfirmationNotifier } from '../booking-flow.js';
import type { BookingRequest, BookingResult } from '../../scheduling/scheduling-engine.js';
import type { Appointment } from '@prisma/client';

/**
 * BookingFlow tests (Requirement 4.1, 4.4 / original R12.1).
 *
 * The booking lifecycle now has an admin-approval step: book() creates a
 * `pending` booking and notifies NO ONE; the customer confirmation is dispatched
 * only on approve(), and a rejection notice on reject(). The held->confirmed
 * payment path (confirm()) is unchanged. Uses in-memory fakes so no DB is needed.
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
  approveCalls: string[];
  rejectCalls: string[];
} {
  const bookCalls: BookingRequest[] = [];
  const confirmCalls: string[] = [];
  const approveCalls: string[] = [];
  const rejectCalls: string[] = [];
  return {
    bookCalls,
    confirmCalls,
    approveCalls,
    rejectCalls,
    async book(req) {
      bookCalls.push(req);
      return result;
    },
    async confirmHeld(appointmentId) {
      confirmCalls.push(appointmentId);
      return fakeAppointment(appointmentId);
    },
    async approve(appointmentId) {
      approveCalls.push(appointmentId);
      return fakeAppointment(appointmentId);
    },
    async reject(appointmentId) {
      rejectCalls.push(appointmentId);
      return fakeAppointment(appointmentId);
    },
  };
}

function makeNotifier(impl?: (id: string) => Promise<void>): ConfirmationNotifier & {
  confirmations: string[];
  rejections: string[];
} {
  const confirmations: string[] = [];
  const rejections: string[] = [];
  return {
    confirmations,
    rejections,
    async sendConfirmation(appointmentId) {
      confirmations.push(appointmentId);
      if (impl) {
        await impl(appointmentId);
      }
    },
    async sendRejection(appointmentId) {
      rejections.push(appointmentId);
      if (impl) {
        await impl(appointmentId);
      }
    },
  };
}

describe('BookingFlow', () => {
  describe('book()', () => {
    it('returns a pending result and does NOT notify the customer (awaits admin approval)', async () => {
      const engine = makeEngine({
        status: 'pending',
        appointment: fakeAppointment('appt-1'),
      });
      const notifier = makeNotifier();
      const flow = new BookingFlow({
        schedulingEngine: engine,
        notificationService: notifier,
      });

      const result = await flow.book(sampleRequest);

      expect(result).toEqual({ status: 'pending', appointment: { id: 'appt-1' } });
      expect(notifier.confirmations).toEqual([]);
      expect(notifier.rejections).toEqual([]);
    });

    it('does NOT notify when the booking is rejected', async () => {
      const engine = makeEngine({ status: 'rejected', reason: 'no_availability' });
      const notifier = makeNotifier();
      const flow = new BookingFlow({
        schedulingEngine: engine,
        notificationService: notifier,
      });

      const result = await flow.book(sampleRequest);

      expect(result).toEqual({ status: 'rejected', reason: 'no_availability' });
      expect(notifier.confirmations).toEqual([]);
    });

    it('does NOT notify for a held booking (awaits payment first)', async () => {
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
      expect(notifier.confirmations).toEqual([]);
    });

    it('auto-confirms and notifies the customer when the policy approves', async () => {
      const engine = makeEngine({
        status: 'confirmed',
        appointment: fakeAppointment('appt-auto'),
      });
      const notifier = makeNotifier();
      const flow = new BookingFlow({
        schedulingEngine: engine,
        notificationService: notifier,
      });

      const result = await flow.book(sampleRequest);

      expect(result).toEqual({ status: 'confirmed', appointment: { id: 'appt-auto' } });
      expect(notifier.confirmations).toEqual(['appt-auto']);
      expect(notifier.rejections).toEqual([]);
    });
  });

  describe('approve()', () => {
    it('approves the pending booking and sends exactly one confirmation (R4.1)', async () => {
      const engine = makeEngine({ status: 'rejected', reason: 'no_availability' });
      const notifier = makeNotifier();
      const flow = new BookingFlow({
        schedulingEngine: engine,
        notificationService: notifier,
      });

      const appt = await flow.approve('appt-7');

      expect(appt.id).toBe('appt-7');
      expect(engine.approveCalls).toEqual(['appt-7']);
      expect(notifier.confirmations).toEqual(['appt-7']);
      expect(notifier.rejections).toEqual([]);
    });

    it('returns the approved appointment even when the notifier throws (R4.4)', async () => {
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

      const appt = await flow.approve('appt-7');

      expect(appt.id).toBe('appt-7');
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('reject()', () => {
    it('rejects the pending booking and sends exactly one rejection notice', async () => {
      const engine = makeEngine({ status: 'rejected', reason: 'no_availability' });
      const notifier = makeNotifier();
      const flow = new BookingFlow({
        schedulingEngine: engine,
        notificationService: notifier,
      });

      const appt = await flow.reject('appt-8');

      expect(appt.id).toBe('appt-8');
      expect(engine.rejectCalls).toEqual(['appt-8']);
      expect(notifier.rejections).toEqual(['appt-8']);
      expect(notifier.confirmations).toEqual([]);
    });

    it('does not throw when the rejection notice fails (R4.4)', async () => {
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

      const appt = await flow.reject('appt-8');

      expect(appt.id).toBe('appt-8');
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
      expect(notifier.confirmations).toEqual(['appt-42']);
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
