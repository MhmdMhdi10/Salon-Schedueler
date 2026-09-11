/** Broadcast customer notification mutations to other account surfaces. */
export const CUSTOMER_NOTIFICATIONS_CHANGED = 'ara-customer-notifications-changed';

export function announceCustomerNotificationsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CUSTOMER_NOTIFICATIONS_CHANGED));
  }
}
