import { CalendarService } from './calendar.service';

/**
 * Unit Tests — CalendarService
 *
 * Validates: Requirements 15.1, 15.2, 15.3
 *
 * Tests that per-chair and per-staff calendar endpoints return appointments
 * in range, reflecting create/modify/cancel from any client.
 */

const makeAppointment = (overrides: Partial<any> = {}) => ({
  id: 'appt-1',
  salonId: 'salon-1',
  customerId: 'cust-1',
  staffMemberId: 'staff-1',
  chairId: 'chair-1',
  serviceId: 'svc-1',
  startAt: new Date('2024-03-15T10:00:00.000Z'),
  endAt: new Date('2024-03-15T11:00:00.000Z'),
  status: 'confirmed',
  source: 'web',
  holdExpiresAt: null,
  createdAt: new Date('2024-03-15T08:00:00.000Z'),
  ...overrides,
});

describe('CalendarService', () => {
  describe('getChairCalendar', () => {
    it('returns appointments for a chair within the specified date range', async () => {
      const appointments = [
        makeAppointment({ id: 'appt-1', startAt: new Date('2024-03-15T09:00:00Z'), endAt: new Date('2024-03-15T10:00:00Z') }),
        makeAppointment({ id: 'appt-2', startAt: new Date('2024-03-15T11:00:00Z'), endAt: new Date('2024-03-15T12:00:00Z') }),
      ];

      const mockPrisma = {
        appointment: {
          findMany: jest.fn().mockResolvedValue(appointments),
        },
      } as any;

      const service = new CalendarService(mockPrisma);
      const result = await service.getChairCalendar(
        'chair-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('appt-1');
      expect(result[1].id).toBe('appt-2');

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith({
        where: {
          chairId: 'chair-1',
          status: { in: ['held', 'confirmed', 'completed'] },
          startAt: { lt: new Date('2024-03-16T00:00:00Z') },
          endAt: { gt: new Date('2024-03-15T00:00:00Z') },
        },
        orderBy: { startAt: 'asc' },
      });
    });

    it('excludes cancelled, no_show, and expired appointments', async () => {
      const mockPrisma = {
        appointment: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as any;

      const service = new CalendarService(mockPrisma);
      await service.getChairCalendar(
        'chair-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      const call = mockPrisma.appointment.findMany.mock.calls[0][0];
      expect(call.where.status.in).toEqual(['held', 'confirmed', 'completed']);
      expect(call.where.status.in).not.toContain('cancelled');
      expect(call.where.status.in).not.toContain('no_show');
      expect(call.where.status.in).not.toContain('expired');
    });

    it('returns empty array when no appointments exist in range', async () => {
      const mockPrisma = {
        appointment: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as any;

      const service = new CalendarService(mockPrisma);
      const result = await service.getChairCalendar(
        'chair-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      expect(result).toEqual([]);
    });

    it('orders results by start time ascending', async () => {
      const mockPrisma = {
        appointment: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as any;

      const service = new CalendarService(mockPrisma);
      await service.getChairCalendar(
        'chair-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      const call = mockPrisma.appointment.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ startAt: 'asc' });
    });
  });

  describe('getStaffCalendar', () => {
    it('returns appointments for a staff member within the specified date range', async () => {
      const appointments = [
        makeAppointment({ id: 'appt-1', staffMemberId: 'staff-1' }),
        makeAppointment({ id: 'appt-2', staffMemberId: 'staff-1' }),
      ];

      const mockPrisma = {
        appointment: {
          findMany: jest.fn().mockResolvedValue(appointments),
        },
      } as any;

      const service = new CalendarService(mockPrisma);
      const result = await service.getStaffCalendar(
        'staff-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      expect(result).toHaveLength(2);

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith({
        where: {
          staffMemberId: 'staff-1',
          status: { in: ['held', 'confirmed', 'completed'] },
          startAt: { lt: new Date('2024-03-16T00:00:00Z') },
          endAt: { gt: new Date('2024-03-15T00:00:00Z') },
        },
        orderBy: { startAt: 'asc' },
      });
    });

    it('excludes cancelled, no_show, and expired appointments', async () => {
      const mockPrisma = {
        appointment: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as any;

      const service = new CalendarService(mockPrisma);
      await service.getStaffCalendar(
        'staff-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      const call = mockPrisma.appointment.findMany.mock.calls[0][0];
      expect(call.where.status.in).toEqual(['held', 'confirmed', 'completed']);
    });

    it('returns empty array when no appointments exist in range', async () => {
      const mockPrisma = {
        appointment: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as any;

      const service = new CalendarService(mockPrisma);
      const result = await service.getStaffCalendar(
        'staff-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      expect(result).toEqual([]);
    });

    it('reflects newly created appointments from any source', async () => {
      // Simulates that after a walk-in is created, it appears in the calendar
      const walkInAppt = makeAppointment({ id: 'walkin-1', source: 'walkin', status: 'confirmed' });

      const mockPrisma = {
        appointment: {
          findMany: jest.fn().mockResolvedValue([walkInAppt]),
        },
      } as any;

      const service = new CalendarService(mockPrisma);
      const result = await service.getStaffCalendar(
        'staff-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('walkin');
    });
  });
});
