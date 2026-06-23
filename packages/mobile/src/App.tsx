/**
 * Root component for the Salon Booking React Native app.
 * Navigation stack:
 * - AuthScreen: Phone + OTP login
 * - QrScanScreen: Camera QR scan to resolve salon
 * - AvailabilityScreen: Service/date/slot selection and booking
 *
 * Offline: Cached appointments from AppointmentCache.
 * Push: Registers device token on login via pushApi.registerToken.
 */
export { AUTH_SCREEN, QR_SCAN_SCREEN, AVAILABILITY_SCREEN } from './screens';
export { SubmissionOutbox, AppointmentCache } from './offline';

export function App() {
  return null; // React Native component tree requires RN runtime
}

export default App;
