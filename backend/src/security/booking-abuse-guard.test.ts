import { BookingAbuseError, BookingAbuseGuard } from './booking-abuse-guard.js';

describe('BookingAbuseGuard global customer lifecycle', () => {
  it('rejects bookings from a globally blocked customer before other checks', async () => {
    const prisma = {
      customer: { findUnique: jest.fn().mockResolvedValue({ active: false, deletedAt: null }) },
      customerSalonBlock: { findUnique: jest.fn() },
      appointment: { count: jest.fn(), findFirst: jest.fn() },
    } as any;
    const guard = new BookingAbuseGuard(prisma);

    await expect(guard.check({
      customerId: 'customer-1',
      salonId: 'salon-1',
      serviceId: 'service-1',
      startAt: '2026-09-11T09:00:00.000Z',
      ip: '127.0.0.1',
    })).rejects.toMatchObject<Partial<BookingAbuseError>>({ code: 'CUSTOMER_BLOCKED' });
    expect(prisma.appointment.count).not.toHaveBeenCalled();
  });
});
