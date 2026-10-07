import type { SalonNotification } from '../../api/client';

const CALENDAR = '/owner/calendar';

function calendarDate(payload: SalonNotification['payload']): string | null {
  const raw = payload?.date;
  if (typeof raw !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function calendarDestination(section: string, payload: SalonNotification['payload']): string {
  const date = calendarDate(payload);
  const dateQuery = date ? `?date=${date}&view=day` : '';
  return `${CALENDAR}${dateQuery}#${section}`;
}

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
    return calendarDestination('owner-deposit-receipt-queue', notification.payload);
  }
  if (
    (type.startsWith('booking.') || type.startsWith('appointment.')) &&
    type.includes('pending')
  ) {
    return calendarDestination('owner-approval-queue', notification.payload);
  }
  if (type.startsWith('booking.') || type.startsWith('appointment.') || type.startsWith('walkin.')) {
    return calendarDestination('owner-calendar-content', notification.payload);
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
    return calendarDestination('owner-calendar-content', notification.payload);
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
