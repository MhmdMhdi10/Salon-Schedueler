/**
 * Availability and booking screen for mobile.
 * Requirements: 8.1, 9.7
 *
 * Flow:
 * 1. Select service from salon's service list
 * 2. Select date (Jalali calendar picker)
 * 3. Fetch available slots via salonApi.getAvailability
 * 4. Select a time slot
 * 5. Confirm booking via bookingApi.create
 * 6. Handle payment redirect if held status
 */
export const AVAILABILITY_SCREEN = 'AvailabilityScreen';
