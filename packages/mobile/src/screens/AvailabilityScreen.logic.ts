/**
 * Pure flow logic for the mobile availability/booking screen.
 *
 * Extracted from the React Native component so the
 * services → date → slots → book flow can be tested without a device runtime.
 * Each function wraps the shared API client and returns a structured result
 * instead of throwing, mirroring `AuthScreen.logic.ts` / `QrScanScreen.logic.ts`.
 *
 * Presentation-only task: this introduces no API/contract changes — it calls the
 * existing `salonApi` / `bookingApi` endpoints unchanged.
 *
 * Requirement: 6.4, 7.2, 7.5
 */
import { salonApi, bookingApi } from '../api/client';

/** A bookable service as returned by the salon services endpoint (unchanged contract). */
export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceRial: number;
}

/** A free time slot as returned by the availability endpoint (unchanged contract). */
export interface Slot {
  startAt: string;
  endAt: string;
}

export type LoadServicesResult =
  | { ok: true; services: Service[] }
  | { ok: false; error: string };

export type LoadSlotsResult =
  | { ok: true; slots: Slot[] }
  | { ok: false; error: string };

/**
 * Outcome of a booking attempt. `pending` is a submitted booking awaiting salon
 * admin approval (the customer is notified only once approved); `held` carries a
 * `paymentRedirectUrl` the host hands off to the gateway; `error` never exposes a
 * raw stack/HTTP code.
 */
export type BookingResult =
  | { ok: true; status: 'pending' }
  | { ok: true; status: 'held'; paymentRedirectUrl: string }
  | { ok: false; error: string };

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  return 'خطای ناشناخته';
}

/** Load the salon's bookable services. Never throws. */
export async function loadServices(salonId: string): Promise<LoadServicesResult> {
  try {
    const res = await salonApi.getServices(salonId);
    return { ok: true, services: res.services };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Load available slots for a service on a date (`YYYY-MM-DD`, ISO at the API
 * boundary). Never throws.
 */
export async function loadSlots(
  salonId: string,
  serviceId: string,
  date: string
): Promise<LoadSlotsResult> {
  try {
    const res = await salonApi.getAvailability(salonId, serviceId, date);
    return { ok: true, slots: res.slots };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Create a booking for the selected service/slot. Maps the `held` status to a
 * payment-redirect outcome (the server confirms money — never faked here); a
 * deposit-free booking comes back `pending` (awaiting salon admin approval).
 * Never throws.
 */
export async function createBooking(body: {
  salonId: string;
  serviceId: string;
  startAt: string;
  preferredStaffId?: string;
}): Promise<BookingResult> {
  try {
    const res = await bookingApi.create(body);
    if (res.status === 'held' && typeof res.paymentRedirectUrl === 'string') {
      return { ok: true, status: 'held', paymentRedirectUrl: res.paymentRedirectUrl };
    }
    return { ok: true, status: 'pending' };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
