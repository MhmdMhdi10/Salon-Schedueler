import { useAuth } from './AuthContext';

/**
 * Dev fallback salon id (the docker dev-seed salon, «سالن رز»). Used only when
 * the signed-in principal carries no `salonId` — e.g. an older token issued
 * before the backend embedded it, or local component tests outside a session.
 * In production a real owner token always carries their own salon id.
 */
export const DEFAULT_SALON_ID = '11111111-1111-1111-1111-111111111111';

/**
 * The salon the current owner-panel session operates on.
 *
 * Reads the salon id from the authenticated principal (threaded from the staff
 * JWT), so every owner/admin surface is scoped to the signed-in owner's own
 * salon rather than a hard-coded id. Falls back to {@link DEFAULT_SALON_ID}
 * while the session is still resolving or for tokens without a salon claim.
 */
export function useSalonId(): string {
  const { principal } = useAuth();
  return principal?.salonId ?? DEFAULT_SALON_ID;
}
