import { describe, expect, it } from 'vitest';
import { getNotificationDestination } from '../notificationDestination';

function notification(type: string, payload: Record<string, unknown> | null = null) {
  return { type, payload };
}

describe('getNotificationDestination', () => {
  it('opens pending bookings in approval queue', () => {
    expect(getNotificationDestination(notification('booking.pending'))).toBe(
      '/owner/calendar#owner-approval-queue',
    );
  });

  it('routes other booking events to calendar', () => {
    expect(
      getNotificationDestination(notification('booking.approved', { appointmentId: 'a1' })),
    ).toBe('/owner/calendar#owner-calendar-content');
  });

  it('routes other notification models to their actionable sections', () => {
    expect(getNotificationDestination(notification('order.created'))).toBe(
      '/owner/qr#qr-order-card',
    );
    expect(getNotificationDestination(notification('new.customer'))).toBe('/owner/clients');
    expect(getNotificationDestination(notification('subscription.expiring'))).toBe(
      '/owner/subscription',
    );
    expect(getNotificationDestination(notification('waitlist.available'))).toBe(
      '/owner/calendar#owner-waitlist',
    );
  });

  it('uses payload references for unknown event names', () => {
    expect(
      getNotificationDestination(notification('custom.event', { appointmentId: 'a1' })),
    ).toBe('/owner/calendar#owner-calendar-content');
  });
});
