import { AnalyticsService } from './analytics.service';

/**
 * Unit Tests — AnalyticsService
 *
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4
 */

describe('AnalyticsService', () => {
  describe('chairUtilization', () => {
    it('returns 0 when no chairs exist', async () => {
      const mockPrisma = {
        chair: { findMany: jest.fn().mockResolvedValue([]) },
      } as any;

      const service = new AnalyticsService(mockPrisma);
      const result = await service.chairUtilization(
        'salon-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      expect(result.utilization).toBe(0);
      expect(result.bookedMinutes).toBe(0);
      expect(result.availableMinutes).toBe(0);
    });

    it('returns 0 when no working hours are configured', async () => {
      const mockPrisma = {
        chair: { findMany: jest.fn().mockResolvedValue([{ id: 'chair-1', salonId: 'salon-1', active: true }]) },
        workingHours: { findMany: jest.fn().mockResolvedValue([]) },
      } as any;

      const service = new AnalyticsService(mockPrisma);
      const result = await service.chairUtilization(
        'salon-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      expect(result.utilization).toBe(0);
      expect(result.availableMinutes).toBe(0);
    });

    it('computes correct utilization ratio when chair is partially booked', async () => {
      // Chair available 09:00-17:00 (480 min) on Friday (weekday 5)
      // 2024-03-15 is a Friday
      const mockPrisma = {
        chair: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'chair-1', salonId: 'salon-1', active: true },
          ]),
        },
        workingHours: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'wh-1',
              ownerKind: 'chair',
              ownerId: 'chair-1',
              weekday: 5, // Friday
              startTime: new Date('1970-01-01T09:00:00.000Z'),
              endTime: new Date('1970-01-01T17:00:00.000Z'),
            },
          ]),
        },
        appointment: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'appt-1',
              chairId: 'chair-1',
              startAt: new Date('2024-03-15T10:00:00Z'),
              endAt: new Date('2024-03-15T11:00:00Z'), // 60 minutes
              status: 'completed',
            },
            {
              id: 'appt-2',
              chairId: 'chair-1',
              startAt: new Date('2024-03-15T14:00:00Z'),
              endAt: new Date('2024-03-15T15:00:00Z'), // 60 minutes
              status: 'confirmed',
            },
          ]),
        },
      } as any;

      const service = new AnalyticsService(mockPrisma);
      const result = await service.chairUtilization(
        'salon-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      // Available: 480 min, Booked: 120 min
      expect(result.availableMinutes).toBe(480);
      expect(result.bookedMinutes).toBe(120);
      expect(result.utilization).toBeCloseTo(120 / 480);
    });

    it('clamps utilization to 1 when booked exceeds available', async () => {
      // This could happen with stale working hours or edge cases
      const mockPrisma = {
        chair: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'chair-1', salonId: 'salon-1', active: true },
          ]),
        },
        workingHours: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'wh-1',
              ownerKind: 'chair',
              ownerId: 'chair-1',
              weekday: 5,
              startTime: new Date('1970-01-01T10:00:00.000Z'),
              endTime: new Date('1970-01-01T11:00:00.000Z'), // Only 60 min available
            },
          ]),
        },
        appointment: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'appt-1',
              chairId: 'chair-1',
              startAt: new Date('2024-03-15T09:00:00Z'),
              endAt: new Date('2024-03-15T12:00:00Z'), // 180 min booked
              status: 'completed',
            },
          ]),
        },
      } as any;

      const service = new AnalyticsService(mockPrisma);
      const result = await service.chairUtilization(
        'salon-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      expect(result.utilization).toBe(1);
    });
  });

  describe('staffUtilization', () => {
    it('returns 0 when no staff exist', async () => {
      const mockPrisma = {
        staffMember: { findMany: jest.fn().mockResolvedValue([]) },
      } as any;

      const service = new AnalyticsService(mockPrisma);
      const result = await service.staffUtilization(
        'salon-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      expect(result.utilization).toBe(0);
      expect(result.bookedMinutes).toBe(0);
      expect(result.availableMinutes).toBe(0);
    });

    it('computes correct utilization ratio', async () => {
      const mockPrisma = {
        staffMember: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'staff-1', salonId: 'salon-1', active: true },
          ]),
        },
        workingHours: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'wh-1',
              ownerKind: 'staff',
              ownerId: 'staff-1',
              weekday: 5,
              startTime: new Date('1970-01-01T09:00:00.000Z'),
              endTime: new Date('1970-01-01T17:00:00.000Z'),
            },
          ]),
        },
        appointment: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'appt-1',
              staffMemberId: 'staff-1',
              startAt: new Date('2024-03-15T09:00:00Z'),
              endAt: new Date('2024-03-15T13:00:00Z'), // 240 min
              status: 'confirmed',
            },
          ]),
        },
      } as any;

      const service = new AnalyticsService(mockPrisma);
      const result = await service.staffUtilization(
        'salon-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      expect(result.availableMinutes).toBe(480);
      expect(result.bookedMinutes).toBe(240);
      expect(result.utilization).toBeCloseTo(0.5);
    });
  });

  describe('revenue', () => {
    it('returns 0 when no completed appointments exist', async () => {
      const mockPrisma = {
        appointment: { findMany: jest.fn().mockResolvedValue([]) },
      } as any;

      const service = new AnalyticsService(mockPrisma);
      const result = await service.revenue(
        'salon-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      expect(result.totalRial).toBe(BigInt(0));
      expect(result.appointmentCount).toBe(0);
    });

    it('sums prices from completed appointments in Rial', async () => {
      const mockPrisma = {
        appointment: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'appt-1',
              status: 'completed',
              startAt: new Date('2024-03-15T10:00:00Z'),
              endAt: new Date('2024-03-15T11:00:00Z'),
              service: { priceRial: BigInt(500000) },
            },
            {
              id: 'appt-2',
              status: 'completed',
              startAt: new Date('2024-03-15T14:00:00Z'),
              endAt: new Date('2024-03-15T15:00:00Z'),
              service: { priceRial: BigInt(300000) },
            },
          ]),
        },
      } as any;

      const service = new AnalyticsService(mockPrisma);
      const result = await service.revenue(
        'salon-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      expect(result.totalRial).toBe(BigInt(800000));
      expect(result.appointmentCount).toBe(2);
    });

    it('only includes completed appointments (not confirmed or held)', async () => {
      const mockPrisma = {
        appointment: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as any;

      const service = new AnalyticsService(mockPrisma);
      await service.revenue(
        'salon-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      const call = mockPrisma.appointment.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('completed');
    });
  });

  describe('busiestWindows', () => {
    it('returns empty when no appointments exist', async () => {
      const mockPrisma = {
        appointment: { findMany: jest.fn().mockResolvedValue([]) },
      } as any;

      const service = new AnalyticsService(mockPrisma);
      const result = await service.busiestWindows(
        'salon-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      expect(result.busiestWindows).toEqual([]);
    });

    it('identifies the window with maximum concurrent appointments', async () => {
      const mockPrisma = {
        appointment: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'appt-1',
              startAt: new Date('2024-03-15T10:00:00Z'),
              endAt: new Date('2024-03-15T11:00:00Z'),
              status: 'confirmed',
            },
            {
              id: 'appt-2',
              startAt: new Date('2024-03-15T10:30:00Z'),
              endAt: new Date('2024-03-15T11:30:00Z'),
              status: 'confirmed',
            },
            {
              id: 'appt-3',
              startAt: new Date('2024-03-15T10:30:00Z'),
              endAt: new Date('2024-03-15T11:00:00Z'),
              status: 'completed',
            },
            // Isolated appointment - lower concurrency
            {
              id: 'appt-4',
              startAt: new Date('2024-03-15T14:00:00Z'),
              endAt: new Date('2024-03-15T15:00:00Z'),
              status: 'confirmed',
            },
          ]),
        },
      } as any;

      const service = new AnalyticsService(mockPrisma);
      const result = await service.busiestWindows(
        'salon-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      expect(result.busiestWindows.length).toBeGreaterThanOrEqual(1);
      // Max concurrency should be 3 (appt 1, 2, 3 overlap at 10:30)
      expect(result.busiestWindows[0].concurrentCount).toBe(3);
    });

    it('only considers confirmed and completed appointments', async () => {
      const mockPrisma = {
        appointment: { findMany: jest.fn().mockResolvedValue([]) },
      } as any;

      const service = new AnalyticsService(mockPrisma);
      await service.busiestWindows(
        'salon-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      const call = mockPrisma.appointment.findMany.mock.calls[0][0];
      expect(call.where.status.in).toEqual(['confirmed', 'completed']);
    });

    it('handles a single appointment as the busiest window with count 1', async () => {
      const mockPrisma = {
        appointment: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'appt-1',
              startAt: new Date('2024-03-15T10:00:00Z'),
              endAt: new Date('2024-03-15T11:00:00Z'),
              status: 'confirmed',
            },
          ]),
        },
      } as any;

      const service = new AnalyticsService(mockPrisma);
      const result = await service.busiestWindows(
        'salon-1',
        new Date('2024-03-15T00:00:00Z'),
        new Date('2024-03-16T00:00:00Z'),
      );

      expect(result.busiestWindows.length).toBe(1);
      expect(result.busiestWindows[0].concurrentCount).toBe(1);
    });
  });

  describe('dashboard', () => {
    it('returns operational, financial, customer, and performance breakdowns', async () => {
      const appointment = {
        customerId: 'customer-1',
        staffMemberId: 'staff-1',
        serviceId: 'service-1',
        startAt: new Date('2024-03-15T10:00:00Z'),
        endAt: new Date('2024-03-15T11:00:00Z'),
        status: 'completed',
        source: 'web',
        customer: { id: 'customer-1', phone: '09120000000', fullName: 'سارا محمدی' },
        service: {
          id: 'service-1',
          name: 'کوتاهی مو',
          priceRial: 1_500_000n,
          durationMin: 60,
        },
        staffMember: { id: 'staff-1', fullName: 'فاطمه' },
      };
      const mockPrisma = {
        appointment: { findMany: jest.fn().mockResolvedValue([appointment]) },
        payment: {
          findMany: jest.fn().mockResolvedValue([{ amountRial: 1_500_000n, status: 'paid' }]),
        },
        salon: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Tehran' }) },
        chair: { findMany: jest.fn().mockResolvedValue([]) },
        staffMember: { findMany: jest.fn().mockResolvedValue([]) },
      } as any;

      const service = new AnalyticsService(mockPrisma);
      const result = await service.dashboard(
        'salon-1',
        new Date('2024-03-01T00:00:00Z'),
        new Date('2024-04-01T00:00:00Z'),
      );

      expect(result.summary.completedAppointments).toBe(1);
      expect(result.summary.uniqueCustomers).toBe(1);
      expect(result.summary.collectedRial).toBe(1_500_000);
      expect(result.services[0]).toMatchObject({ name: 'کوتاهی مو', bookings: 1 });
      expect(result.staff[0]).toMatchObject({ name: 'فاطمه', completed: 1 });
      expect(result.sources[0]).toMatchObject({ source: 'web', bookings: 1 });
      expect(result.customers[0]).toMatchObject({
        name: 'سارا محمدی',
        phone: '09120000000',
        reservations: 1,
        visits: 1,
      });
      expect(result.daily.some((row) => row.bookings === 1)).toBe(true);
      // 10:00Z is 13:30 in the salon's Asia/Tehran timezone.
      expect(result.hourly.find((row) => row.hour === 13)?.bookings).toBe(1);
    });
  });
});
