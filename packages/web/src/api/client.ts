/**
 * API client for the Salon Booking System backend.
 * Handles auth tokens, request/response, and error mapping.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Storage key for the long-lived refresh token. The access token is kept only
 * in memory (above) so it never lands in storage; the refresh token is the one
 * piece persisted so a page reload can re-bootstrap a session (task 5.1).
 */
export const REFRESH_TOKEN_KEY = 'refreshToken';

/** Persist (or clear) the refresh token used to bootstrap a session on reload. */
export function setRefreshToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  } catch {
    // Storage can throw in private-mode/SSR; a missing refresh token simply
    // means the user must sign in again — never surface (or log) the token.
  }
}

/** Read the persisted refresh token, if any. */
export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Bootstrap the in-memory access token from a stored refresh token on app load
 * so a page refresh keeps the owner signed in (task 5.1; R2.2).
 *
 * Returns `true` when a session was restored. On any failure (no stored token,
 * expired/invalid refresh) it clears the stale token and returns `false` so the
 * caller can route to the OTP login. Tokens are never logged.
 */
export async function bootstrapAuth(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const result = await authApi.refresh(refreshToken);
    setAccessToken(result.accessToken);
    // Refresh tokens may rotate on use; persist the latest so the next reload
    // can bootstrap again.
    setRefreshToken(result.refreshToken);
    return true;
  } catch {
    setAccessToken(null);
    setRefreshToken(null);
    return false;
  }
}

/**
 * Clear the current session: drop the in-memory access token and remove the
 * persisted refresh token (sign-out, task 5.1).
 */
export function signOut(): void {
  setAccessToken(null);
  setRefreshToken(null);
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(response.status, error.code || 'UNKNOWN', error.message);
  }

  return response.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Auth endpoints
export const authApi = {
  requestOtp: (phone: string) => request<void>('/auth/otp/request', { method: 'POST', body: { phone } }),
  verifyOtp: (phone: string, code: string) =>
    request<{ accessToken: string; refreshToken: string }>('/auth/otp/verify', { method: 'POST', body: { phone, code } }),
  refresh: (refreshToken: string) =>
    request<{ accessToken: string; refreshToken: string }>('/auth/refresh', { method: 'POST', body: { refreshToken } }),
};

/** The authenticated principal as returned by `GET /me` (mirrors the backend `Principal`). */
export type OwnerRole = 'Owner' | 'Admin' | 'Stylist';

export interface Principal {
  id: string;
  role: OwnerRole;
  staffMemberId?: string;
}

// Authenticated identity endpoint — derives the current principal (and its
// role) from the access token so the owner panel can gate by RBAC (task 5.1).
export const meApi = {
  getMe: () => request<{ principal: Principal }>('/me'),
};

// Salon endpoints
export const salonApi = {
  resolveQr: (payload: string) => request<{ salon: { id: string; name: string } }>(`/salons/by-qr/${encodeURIComponent(payload)}`),
  getAvailability: (salonId: string, serviceId: string, date: string) =>
    request<{ slots: Array<{ startAt: string; endAt: string }> }>(`/salons/${salonId}/availability?serviceId=${serviceId}&date=${date}`),
  getServices: (salonId: string) => request<{ services: Array<{ id: string; name: string; durationMinutes: number; priceRial: number }> }>(`/salons/${salonId}/services`),
};

// Booking endpoints
export const bookingApi = {
  create: (body: { salonId: string; serviceId: string; startAt: string; preferredStaffId?: string }) =>
    request<{ status: string; appointment?: unknown; paymentRedirectUrl?: string }>('/appointments', { method: 'POST', body }),
  cancel: (appointmentId: string) => request<void>(`/appointments/${appointmentId}/cancel`, { method: 'POST' }),
};

// Payment endpoints
export const paymentApi = {
  initiate: (appointmentId: string) =>
    request<{ redirectUrl: string }>('/payments/initiate', { method: 'POST', body: { appointmentId } }),
};

// ─── Subscription ──────────────────────────────────────────────────────────
// Owner-panel subscription surface (task 5.3; R3.1, R3.8, R3.9, R2.1). Mirrors
// the backend `SubscriptionService` (tasks 3.x): the effective status (with
// expiry/grace already applied), the configurable IRR-priced plans, and the
// purchase hand-off that returns a payment-gateway redirect URL. Money flows
// are confirmed by the server — the panel never fakes activation; it only
// reads status and hands off to the gateway.

/** Effective subscription status (expiry/grace already applied server-side). */
export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'expired';

/** A subscription plan kind. `trial` is the free starter; the rest are paid. */
export type SubscriptionPlanKind = 'trial' | 'monthly' | 'quarterly' | 'annual';

/** Current subscription snapshot for a salon. */
export interface SubscriptionStatusResponse {
  /** Effective status (`trial` | `active` | `grace` | `expired`). */
  status: SubscriptionStatus;
  /** The plan currently associated with the subscription. */
  planKind: SubscriptionPlanKind;
  /** ISO expiry instant — converted to a Jalali date for display only. */
  expiresAt: string;
}

/** A purchasable/trial plan definition with its configurable IRR price. */
export interface SubscriptionPlan {
  kind: SubscriptionPlanKind;
  /** Plan length in days (display-localized; e.g. «۳۰ روز»). */
  durationDays: number;
  /** Price in Iranian Rial (the machine/storage unit). May arrive as a string. */
  priceRial: number | string;
}

// Expected backend HTTP routes (route wiring belongs to the backend tasks; the
// panel needs the client surface now). Response shapes are additive:
//   GET  /salons/:salonId/subscription  → SubscriptionStatusResponse
//   GET  /subscription/plans            → { plans: SubscriptionPlan[] }
//   POST /subscription/purchase         → { redirectUrl } (body: { salonId, plan })
export const subscriptionApi = {
  /** Current effective status + expiry for the salon's subscription. */
  getStatus: (salonId: string) =>
    request<SubscriptionStatusResponse>(`/salons/${salonId}/subscription`),
  /** The configurable, IRR-priced plans (trial + monthly/quarterly/annual). */
  getPlans: () => request<{ plans: SubscriptionPlan[] }>('/subscription/plans'),
  /**
   * Begin a purchase/renewal for a paid plan. Returns the payment-gateway
   * redirect URL; the caller hands off to it. Activation happens server-side on
   * the payment callback (`activateFromPayment`) — never faked client-side.
   */
  initiatePurchase: (salonId: string, plan: SubscriptionPlanKind) =>
    request<{ redirectUrl: string }>('/subscription/purchase', {
      method: 'POST',
      body: { salonId, plan },
    }),
};

// ─── QR + standee ────────────────────────────────────────────────────────
// Owner-panel QR surface (task 5.4; R4.1, R4.3). Mirrors the backend
// `QrService` (task 4.1): a STABLE per-salon QR payload (derived from the
// salon's `qrToken` via the shared `@salon/shared` codec) plus the campaign
// destination URL (`/s/:slug?utm_source=qr`) used to attribute physical scans.
// The QR payload is stable per salon — generated once, reused forever — so the
// printed standee never goes stale while `qrToken` is unchanged (Property 7).

/** Stable QR payload + campaign URL (+ salon name) for the standee surface. */
export interface SalonQrResponse {
  /**
   * The stable QR payload to render as the QR image — the shared-codec output
   * of the salon's `qrToken` (e.g. `https://book.salon.app/s/v1.<token>.<crc>`).
   */
  payload: string;
  /** Campaign destination shown as copyable text: `/s/:slug?utm_source=qr`. */
  url: string;
  /** Salon display name, shown on the printable standee. */
  salonName: string;
}

// Expected backend HTTP route (route wiring belongs to the backend QR tasks;
// the panel needs the client surface now). Response shape is additive:
//   GET /salons/:salonId/qr → SalonQrResponse
export const qrApi = {
  /**
   * The salon's stable QR payload + campaign URL (+ display name) for the
   * «QR و استند» standee surface. The QR is per-salon and stable (never
   * per-customer); the panel renders the payload as an image client-side.
   */
  getSalonQr: (salonId: string) =>
    request<SalonQrResponse>(`/salons/${salonId}/qr`),
};

// Admin endpoints
export const adminApi = {
  getCalendar: (salonId: string, from: string, to: string, view: 'day' | 'week') =>
    request<{ appointments: unknown[] }>(`/salons/${salonId}/calendar?from=${from}&to=${to}&view=${view}`),
  getAnalytics: (salonId: string, from: string, to: string) =>
    request<{ utilization: unknown; revenue: unknown; busiestWindows: unknown }>(`/salons/${salonId}/analytics?from=${from}&to=${to}`),
  getStaff: (salonId: string) => request<{ staff: unknown[] }>(`/salons/${salonId}/staff`),
  getChairs: (salonId: string) => request<{ chairs: unknown[] }>(`/salons/${salonId}/chairs`),
};
