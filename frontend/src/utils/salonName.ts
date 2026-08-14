/**
 * Display-only persistence of a resolved salon's name across the booking funnel.
 *
 * The funnel routes carry only the salon **id** (`/salon/:salonId/...`); the
 * human-readable name is resolved once at the QR-landing step. We stash it in
 * `sessionStorage` (scoped per salon, cleared with the session) so the
 * booking-success receipt can show a "where" line without a new API call or any
 * change to the request/response contracts (R4.6 — presentation only).
 *
 * Best-effort throughout: a storage failure (private mode, quota) must never
 * break the funnel, so reads return `null` and writes swallow errors.
 */

function salonNameKey(salonId: string): string {
  return `salon-name:${salonId}`;
}

/** Reads the cached salon name for `salonId`, or `null` when none is stored. */
export function readSalonName(salonId: string | undefined): string | null {
  if (!salonId || typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(salonNameKey(salonId));
  } catch {
    return null;
  }
}

/** Caches the resolved `name` for `salonId` for later funnel steps. */
export function writeSalonName(salonId: string, name: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(salonNameKey(salonId), name);
  } catch {
    // Best-effort persistence; never break the funnel on a storage failure.
  }
}
