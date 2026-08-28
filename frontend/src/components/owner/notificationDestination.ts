import type { SalonNotification } from '../../api/client';

const CALENDAR = '/owner/calendar';

/**
 * Resolve every inbox event to the owner-panel surface that can handle it.
 * Payload references provide a useful fallback for notification types added
 * later without forcing the inbox UI to know their exact names.
 */
export function getNotificationDestination(
  notification: Pick<SalonNotification, 'type' | 'payload'>,
): string {
  const type = notification.type.trim().toLowerCase();

  if (type.includes('deposit') || type.includes('receipt')) {
    return `${CALENDAR}#owner-deposit-receipt-queue`;
  }
  if (
    (type.startsWith('booking.') || type.startsWith('appointment.')) &&
    type.includes('pending')
  ) {
    return `${CALENDAR}#owner-approval-queue`;
  }
  if (type.startsWith('booking.') || type.startsWith('appointment.')) {
    return `${CALENDAR}#owner-calendar-content`;
  }
  if (type.startsWith('waitlist.')) {
    return `${CALENDAR}#owner-waitlist`;
  }
  if (
    type.startsWith('order.') ||
    type.startsWith('card-order.') ||
    type.startsWith('card_order.')
  ) {
    return '/owner/qr#qr-order-card';
  }
  if (type.startsWith('subscription.')) {
    return '/owner/subscription';
  }
  if (
    type.startsWith('customer.') ||
    type === 'new.customer' ||
    type.startsWith('new.customer.')
  ) {
    return '/owner/clients';
  }
  if (type.startsWith('staff.') || type.startsWith('team.')) {
    return '/owner/team';
  }
  if (type.startsWith('payment.') || type.startsWith('transaction.')) {
    return '/owner/transactions';
  }

  if (notification.payload?.appointmentId) {
    return `${CALENDAR}#owner-calendar-content`;
  }
  if (notification.payload?.orderId) {
    return '/owner/qr#qr-order-card';
  }
  if (notification.payload?.customerId) {
    return '/owner/clients';
  }

  // Unknown events still open the durable inbox instead of leaving a dead row.
  return '/owner/notifications';
}
