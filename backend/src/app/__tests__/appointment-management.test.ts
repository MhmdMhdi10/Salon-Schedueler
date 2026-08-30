import type { Appointment, PrismaClient } from '@prisma/client';
import {
  AppointmentManagementService,
  type RescheduleInbox,
  type RescheduleNotifier,
} from '../appointment-management.js';
import type { BookingFlow } from '../booking-flow.js';
import type { CancellationOps } from '../cancellation-flow.js';
import type { SchedulingEngine } from '../../scheduling/scheduling-engine.js';

const APPOINTMENT_ID = 'appointment-1';
const CUSTOMER_ID = 'customer-1';
const OLD_START = new Date('2099-03-15T10:00:00.000Z');
const NEW_START = new Date('2099-03-15T12:00:00.000Z');
const NOW = new Date('2099-03-15T09:00:00.000Z');

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: APPOINTMENT_ID,
    salonId: 'salon-1',
    customerId: CUSTOMER_ID,
    serviceId: 'service-1',
    staffMemberId: 'staff-1',
    chairId: 'chair-1',
    startAt: OLD_START,
    endAt: new Date('2099-03-15T11:00:00.000Z'),
    status: 'confirmed',
    pendingRescheduleStartAt: null,
    pendingRescheduleEndAt: null,
    pendingRescheduleRequestedAt: null,
    pendingRescheduleRequestedBy: null,
    ...overrides,
  } as Appointment;
}

function makeService(initial = makeAppointment()) {
  let appointment = initial;
  const findUnique = jest.fn(async () => appointment);
  const update = jest.fn(async ({ data }: { data: Partial<Appointment> }) => {
    appointment = { ...appointment, ...data } as Appointment;
    return appointment;
  });
  const prisma = {
    appointment: { findUnique, update },
  } as unknown as PrismaClient;
  const scheduler = {
    reschedule: jest.fn(
      async ({
        startAt,
        allowPendingProposal,
      }: {
        startAt: string;
        allowPendingProposal?: boolean;
      }) => {
        appointment = {
          ...appointment,
          startAt: new Date(startAt),
          endAt: new Date(new Date(startAt).getTime() + 60 * 60 * 1000),
          ...(allowPendingProposal
            ? {
                pendingRescheduleStartAt: null,
                pendingRescheduleEndAt: null,
                pendingRescheduleRequestedAt: null,
                pendingRescheduleRequestedBy: null,
              }
            : {}),
        } as Appointment;
        return appointment;
      },
    ),
  } as unknown as SchedulingEngine;
  const cancellation = { cancel: jest.fn() } as unknown as CancellationOps;
  const bookingFlow = {} as BookingFlow;
  const notifier = {
    sendRescheduleProposal: jest.fn(),
  } as unknown as RescheduleNotifier;
  const inbox = { emit: jest.fn() } as unknown as RescheduleInbox;
  const service = new AppointmentManagementService(
    prisma,
    bookingFlow,
    cancellation,
    scheduler,
    notifier,
    inbox,
  );

  return {
    service,
    findUnique,
    update,
    scheduler,
    cancellation,
    notifier,
    inbox,
    getAppointment: () => appointment,
  };
}

describe('AppointmentManagementService reschedule proposals', () => {
  it('keeps the live appointment and notifies the customer when staff proposes a move', async () => {
    const ctx = makeService();

    const result = await ctx.service.requestRescheduleForStaff({
      appointmentId: APPOINTMENT_ID,
      startAt: NEW_START.toISOString(),
      requestedByStaffId: 'staff-1',
      now: NOW,
    });

    expect(result.appointment.startAt).toEqual(OLD_START);
    expect(result.pendingReschedule.startAt).toEqual(NEW_START);
    expect(result.pendingReschedule.endAt).toEqual(new Date('2099-03-15T13:00:00.000Z'));
    expect(ctx.cancellation.cancel).not.toHaveBeenCalled();
    expect(ctx.scheduler.reschedule).not.toHaveBeenCalled();
    expect(ctx.notifier.sendRescheduleProposal).toHaveBeenCalledWith(
      APPOINTMENT_ID,
      OLD_START,
      NEW_START,
    );
    expect(ctx.inbox.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'appointment.reschedule.requested',
        payload: expect.objectContaining({ appointmentId: APPOINTMENT_ID }),
      }),
    );
  });

  it('moves the appointment only after customer acceptance and clears the proposal', async () => {
    const ctx = makeService();
    await ctx.service.requestRescheduleForStaff({
      appointmentId: APPOINTMENT_ID,
      startAt: NEW_START.toISOString(),
      now: NOW,
    });

    const result = await ctx.service.acceptReschedule({
      appointmentId: APPOINTMENT_ID,
      customerId: CUSTOMER_ID,
    });

    expect(result.decision).toBe('accepted');
    expect(ctx.scheduler.reschedule).toHaveBeenCalledWith({
      appointmentId: APPOINTMENT_ID,
      startAt: NEW_START.toISOString(),
      allowPendingProposal: true,
    });
    expect(result.appointment.startAt).toEqual(NEW_START);
    expect(result.appointment.pendingRescheduleStartAt).toBeNull();
    expect(ctx.getAppointment().pendingRescheduleStartAt).toBeNull();
  });

  it('rejects a proposal without changing the live appointment', async () => {
    const ctx = makeService();
    await ctx.service.requestRescheduleForStaff({
      appointmentId: APPOINTMENT_ID,
      startAt: NEW_START.toISOString(),
      now: NOW,
    });

    const result = await ctx.service.rejectReschedule({
      appointmentId: APPOINTMENT_ID,
      customerId: CUSTOMER_ID,
    });

    expect(result.decision).toBe('rejected');
    expect(result.appointment.startAt).toEqual(OLD_START);
    expect(result.appointment.pendingRescheduleStartAt).toBeNull();
    expect(ctx.scheduler.reschedule).not.toHaveBeenCalled();
  });

  it('rejects a staff proposal once the original or target time has arrived', async () => {
    const ctx = makeService();

    await expect(
      ctx.service.requestRescheduleForStaff({
        appointmentId: APPOINTMENT_ID,
        startAt: NEW_START.toISOString(),
        now: new Date('2099-03-15T10:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'RESCHEDULE_DEADLINE_PASSED' });
    expect(ctx.update).not.toHaveBeenCalled();
  });
});
