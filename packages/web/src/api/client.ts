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
let refreshInFlight: Promise<boolean> | null = null;

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

async function request<T>(
  path: string,
  options: RequestOptions = {},
  canRefresh = true,
): Promise<T> {
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

  // Owner sessions commonly stay open longer than the 15-minute access-token
  // lifetime. Refresh once, shared across concurrent requests, then replay the
  // original call. Never retry the refresh endpoint itself.
  if (response.status === 401 && canRefresh && path !== '/auth/refresh' && getRefreshToken()) {
    refreshInFlight ??= bootstrapAuth().finally(() => {
      refreshInFlight = null;
    });
    if (await refreshInFlight) {
      return request<T>(path, options, false);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(response.status, error.code || 'UNKNOWN', error.message);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Auth endpoints
export const authApi = {
  requestOtp: (phone: string) =>
    request<{ ok: boolean; devOtp?: string }>('/auth/otp/request', {
      method: 'POST',
      body: { phone },
    }),
  verifyOtp: (phone: string, code: string) =>
    request<{ accessToken: string; refreshToken: string }>('/auth/otp/verify', {
      method: 'POST',
      body: { phone, code },
    }),
  refresh: (refreshToken: string) =>
    request<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    }),
};

/** The authenticated principal as returned by `GET /me` (mirrors the backend `Principal`). */
export type OwnerRole = 'Owner' | 'Admin' | 'Stylist';
export type PrincipalRole = OwnerRole | PlatformRole;

export interface Principal {
  id: string;
  role?: PrincipalRole;
  staffMemberId?: string;
  /**
   * The salon this staff member belongs to. Lets the owner panel scope every
   * read/write to the caller's own salon instead of a hard-coded id. Present on
   * staff tokens issued after the backend started embedding it; absent for
   * older tokens (callers fall back to the dev default).
   */
  salonId?: string;
  platformAdminId?: string;
}

// Authenticated identity endpoint — derives the current principal (and its
// role) from the access token so the owner panel can gate by RBAC (task 5.1).
export const meApi = {
  getMe: () => request<{ principal: Principal }>('/me'),
};

/** A customer's own booking, enriched for the account calendar. */
export interface CustomerAppointment {
  id: string;
  salonId: string;
  salonName?: string;
  serviceId: string;
  serviceName?: string;
  staffMemberId: string;
  staffName?: string;
  chairId: string;
  startAt: string;
  endAt: string;
  status: string;
  source: string;
  createdAt: string;
}

export interface CustomerWaitlistEntry {
  id: string;
  salonId: string;
  customerId: string;
  serviceId: string;
  windowStart: string;
  windowEnd: string;
  status: 'waiting' | 'notified' | 'fulfilled' | 'cancelled' | string;
  createdAt: string;
}

export interface CustomerProfile {
  id: string;
  phone: string;
  fullName: string | null;
}

/** Customer-only self-service reads. The backend scopes these to the token. */
export const customerApi = {
  getProfile: () => request<{ customer: CustomerProfile }>('/customers/me/profile'),
  updateProfile: (fullName: string) =>
    request<{ customer: CustomerProfile }>('/customers/me/profile', {
      method: 'PATCH',
      body: { fullName },
    }),
  getAppointments: () =>
    request<{ appointments: CustomerAppointment[] }>('/customers/me/appointments'),
  getWaitlist: () =>
    request<{ waitlist: CustomerWaitlistEntry[] }>('/customers/me/waitlist'),
  cancelAppointment: (appointmentId: string) =>
    request<{ status: string; appointment: unknown }>(
      `/appointments/${appointmentId}/cancel`,
      { method: 'POST' },
    ),
  rescheduleAppointment: (appointmentId: string, startAt: string, preferredStaffId?: string) =>
    request<{ status: string; appointment: unknown; previousAppointmentId: string }>(
      `/appointments/${appointmentId}/reschedule`,
      {
        method: 'POST',
        body: { startAt, ...(preferredStaffId ? { preferredStaffId } : {}) },
      },
    ),
  cancelWaitlist: (entryId: string) =>
    request<{ waitlist: CustomerWaitlistEntry }>(`/waitlist/${entryId}`, {
      method: 'DELETE',
    }),
};

// ─── Customer referral program ───────────────────────────────────────────────
export interface SalonReferral {
  id: string;
  salonId: string | null;
  salonName: string;
  salonPhone: string | null;
  salonInstagram: string | null;
  city: string | null;
  claimToken?: string;
  claimUrl?: string;
  status: string;
  qualifyingBookings: number;
  requiredBookings: number;
  rewardAmountRial: number;
  rewardStatus: string;
  rewardExpiresAt: string | null;
  claimedAt: string | null;
  qualifiedAt: string | null;
  redeemedAt: string | null;
  createdAt: string;
  referrerName?: string | null;
  referrerPhone?: string;
  linkedSalonName?: string | null;
}

export const referralApi = {
  create: (input: {
    salonName: string;
    city: string;
    salonPhone?: string;
    salonInstagram?: string;
  }) => request<{ referral: SalonReferral }>('/referrals', { method: 'POST', body: input }),
  listMine: () => request<{ referrals: SalonReferral[] }>('/customers/me/referrals'),
  getClaimPreview: (token: string) =>
    request<{
      referral: Pick<
        SalonReferral,
        'salonName' | 'city' | 'status' | 'rewardAmountRial' | 'requiredBookings'
      >;
    }>('/referrals/claim/' + encodeURIComponent(token)),
  listSalon: (salonId: string) =>
    request<{ referrals: SalonReferral[] }>('/salons/' + salonId + '/referrals'),
  redeem: (id: string) =>
    request<{ referral: SalonReferral }>('/referrals/' + id + '/redeem', { method: 'POST' }),
};

// ─── Salon registration (public onboarding) ─────────────────────────────────
// Self-service salon sign-up from the marketing landing. Creates the salon, its
// Owner staff member (the `phone` becomes the OTP login that mints an Owner
// token), starts the free trial, and provisions the optional questionnaire
// answers. Only salonName/ownerName/phone are required — the rest is skippable.

/** One service captured in the onboarding questionnaire. */
export interface RegisterSalonServiceInput {
  name: string;
  /** Optional — defaults to 30 min server-side when omitted. */
  durationMinutes?: number;
  /** Optional — defaults to 0 Rial server-side when omitted. */
  priceRial?: number;
}

/** Salon self-registration payload (mirrors the backend `RegisterSalonSchema`). */
export interface RegisterSalonInput {
  salonName: string;
  ownerName: string;
  /** Iranian mobile (Latin digits, `09xxxxxxxxx`) — the OTP login identity. */
  phone: string;
  /** Business category selected at the start of onboarding. */
  businessType?: string;
  /** Skills selected during the first onboarding step. */
  specialties?: string[];
  timezone?: string;
  /** Storefront brand-accent key (optional). */
  brandAccent?: string;
  /** Services to pre-create (optional). */
  services?: RegisterSalonServiceInput[];
  /** Number of chairs to pre-create (optional). */
  chairCount?: number;
  /** Referral token from a customer invite link (optional). */
  referralToken?: string;
}

/** Server acknowledgement of a created salon. */
export interface RegisterSalonResponse {
  salonId: string;
  salonName: string;
}

export const registrationApi = {
  /**
   * Register a new salon. On success the owner signs in via OTP with the same
   * `phone` to enter the panel. A phone already in use surfaces as an
   * `ApiError` with `code === 'PHONE_TAKEN'` (HTTP 409).
   */
  registerSalon: (input: RegisterSalonInput) =>
    request<RegisterSalonResponse>('/register/salon', {
      method: 'POST',
      body: input,
    }),
  /**
   * Pre-flight check: is this phone already registered to a salon owner?
   * Lets the registration wizard flag a duplicate AT the phone field (Step 1)
   * instead of bouncing the user back from Submit at Step 3.
   */
  checkPhone: (phone: string) =>
    request<{ available: boolean }>(`/register/check-phone?phone=${encodeURIComponent(phone)}`),
};

// Salon endpoints
export const salonApi = {
  resolveQr: (payload: string) =>
    request<{
      salon: {
        id: string;
        name: string;
        /**
         * Storefront Brand_Accent key (signature-ui-system R4.1/R4.2) — null /
         * absent means the signature default. Additive: existing callers that
         * only read `{ id, name }` are unaffected.
         */
        brandAccent?: string | null;
      };
      /** Present only for a stylist-scoped QR — the pre-selected staff member. */
      staff?: { id: string; fullName: string | null };
    }>(`/salons/by-qr/${encodeURIComponent(payload)}`),
  /**
   * Free slots for a service on a date. `staffId` (optional) narrows the slots
   * to ones that specific stylist can personally serve — used when the customer
   * picked a stylist so the shown times are genuinely hers (R14.3).
   */
  getAvailability: (salonId: string, serviceId: string, date: string, staffId?: string) =>
    request<{ slots: Array<{ startAt: string; endAt: string }> }>(
      `/salons/${salonId}/availability?serviceId=${serviceId}&date=${date}${
        staffId ? `&staffId=${encodeURIComponent(staffId)}` : ''
      }`,
    ),
  getServices: (salonId: string) =>
    request<{
      services: Array<{
        id: string;
        name: string;
        durationMinutes: number;
        bufferMinutes?: number;
        priceRial: number;
        /** True when booking requires an upfront deposit via the gateway. */
        requiresDeposit?: boolean;
        /** Deposit amount in Rial (present when `requiresDeposit`). */
        depositRial?: number | null;
        /** Owner/Stylist ids qualified to perform this service. */
        staffIds?: string[];
      }>;
    }>(`/salons/${salonId}/services`),
  /**
   * Public list of a salon's bookable stylists (Owner/Stylist roles) for the
   * funnel's stylist picker. Customers can call this without authentication.
   */
  getStylists: (salonId: string) =>
    request<{ stylists: Array<{ id: string; fullName: string | null; role: string }> }>(
      `/salons/${salonId}/stylists`,
    ),
  getBookingPolicy: (salonId: string) =>
    request<{ bookingWindowDays: number }>(`/salons/${salonId}/booking-policy`),
  recordScan: (salonId: string, source: string) =>
    request<void>(`/salons/${salonId}/scan?utm_source=${encodeURIComponent(source)}`, {
      method: 'POST',
    }),
};

// Booking endpoints
export const bookingApi = {
  create: (body: {
    salonId: string;
    serviceId: string;
    startAt: string;
    preferredStaffId?: string;
  }) =>
    request<{ status: string; appointment?: unknown; paymentRedirectUrl?: string }>(
      '/appointments',
      {
        method: 'POST',
        body,
        headers: {
          'Idempotency-Key':
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
      },
    ),
  cancel: (appointmentId: string) =>
    request<{ status: string; appointment: unknown }>(`/appointments/${appointmentId}/cancel`, {
      method: 'POST',
    }),
  reschedule: (appointmentId: string, startAt: string, preferredStaffId?: string) =>
    request<{ status: string; appointment: unknown; previousAppointmentId: string }>(
      `/appointments/${appointmentId}/reschedule`,
      {
        method: 'POST',
        body: { startAt, ...(preferredStaffId ? { preferredStaffId } : {}) },
      },
    ),
};

export const waitlistApi = {
  join: (salonId: string, serviceId: string, windowStart: string, windowEnd: string) =>
    request<{ waitlist: CustomerWaitlistEntry }>(`/salons/${salonId}/waitlist`, {
      method: 'POST',
      body: { serviceId, windowStart, windowEnd },
    }),
};

// Payment endpoints
export const paymentApi = {
  initiate: (appointmentId: string) =>
    request<{ redirectUrl: string }>('/payments/initiate', {
      method: 'POST',
      body: { appointmentId },
    }),
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
  getSalonQr: (salonId: string) => request<SalonQrResponse>(`/salons/${salonId}/qr`),
  /**
   * A stylist-scoped QR (payload + names) that opens that stylist's booking
   * page pre-selected. Lets the owner print a per-stylist code.
   */
  getStaffQr: (salonId: string, staffId: string) =>
    request<{ payload: string; staffName: string; salonName: string }>(
      `/salons/${salonId}/staff/${staffId}/qr`,
    ),
};

// ─── Printed-card orders ───────────────────────────────────────────────────
// Owner-panel «سفارش کارت چاپی» surface: a salon orders professionally printed
// QR cards (the same custom-branded design previewed in the panel). The order
// captures the chosen template/accent + a shipping contact. Activation/payment
// + fulfilment are owned by the server (the panel never fakes acceptance).

/** A printable asset template the salon can order. */
export type CardTemplate = 'card' | 'banner';

/** The order payload sent to the print-fulfilment endpoint. */
export interface CardOrderInput {
  salonId: string;
  /** Which design to print. */
  template: CardTemplate;
  /** The chosen brand-accent key (mirrors the studio swatches). */
  accent: string;
  /** How many printed pieces. */
  quantity: number;
  /** Recipient/contact name. */
  contactName: string;
  /** Contact phone (Iranian mobile). */
  phone: string;
  /** Shipping address. */
  address: string;
  /** Optional free-text notes. */
  notes?: string;
}

/** Server acknowledgement of a received print order. */
export interface CardOrderResponse {
  orderId: string;
  status: string;
}

// Expected backend route (additive): POST /salons/:salonId/card-orders →
// CardOrderResponse, guarded by `manage_appointments` (Owner/Admin).
export const cardOrderApi = {
  create: (body: CardOrderInput) =>
    request<CardOrderResponse>(`/salons/${body.salonId}/card-orders`, {
      method: 'POST',
      body,
    }),
};

// Admin endpoints
export interface SmsSettings {
  ownerBooking: boolean;
  stylistBooking: boolean;
  ownerReminder: boolean;
  stylistReminder: boolean;
  ownerCancellation: boolean;
  stylistCancellation: boolean;
}

export interface CustomerAppointmentRecord {
  id: string;
  salonId: string;
  serviceId: string;
  staffMemberId: string;
  chairId: string;
  startAt: string;
  endAt: string;
  status: string;
  source: string;
  createdAt: string;
  salonName?: string;
  serviceName?: string;
  staffName?: string;
}

export interface AppointmentCustomerOverview {
  customer: {
    id: string;
    phone: string;
    fullName: string | null;
    noShowCount?: number;
  };
  appointments: CustomerAppointmentRecord[];
  notes: Array<{
    id: string;
    customerId: string;
    authorId: string | null;
    body: string;
    createdAt: string;
  }>;
  preferredStaff: { id: string; fullName: string; role: string } | null;
}

export interface OwnerWaitlistEntry {
  id: string;
  salonId: string;
  customerId: string;
  serviceId: string;
  windowStart: string;
  windowEnd: string;
  status: 'waiting' | 'notified' | 'fulfilled' | 'cancelled';
  createdAt: string;
  customerName?: string | null;
  customerPhone?: string | null;
  serviceName?: string | null;
}

export const adminApi = {
  getCalendar: (
    salonId: string,
    from: string,
    to: string,
    view: 'day' | 'week' | 'month' | 'list',
  ) =>
    request<{ appointments: unknown[] }>(
      `/salons/${salonId}/calendar?from=${from}&to=${to}&view=${view}`,
    ),
  getAnalytics: (salonId: string, from: string, to: string) =>
    request<{
      utilization: unknown;
      revenue: unknown;
      busiestWindows: unknown;
      staffUtilization?: unknown;
      summary?: unknown;
      comparison?: unknown;
      daily?: unknown;
      hourly?: unknown;
      services?: unknown;
      staff?: unknown;
      sources?: unknown;
      campaignScans?: unknown;
      customers?: unknown;
    }>(
      `/salons/${salonId}/analytics?from=${from}&to=${to}`,
    ),
  getStaff: (salonId: string) => request<{ staff: SalonStaff[] }>(`/salons/${salonId}/staff`),
  getSmsSettings: (salonId: string) =>
    request<SmsSettings>(`/salons/${salonId}/sms-settings`),
  updateSmsSettings: (salonId: string, patch: Partial<SmsSettings>) =>
    request<SmsSettings>(`/salons/${salonId}/sms-settings`, { method: 'PATCH', body: patch }),
  getChairs: (salonId: string) => request<{ chairs: unknown[] }>(`/salons/${salonId}/chairs`),
  createManualAppointment: (
    salonId: string,
    body: {
      serviceId: string;
      startAt: string;
      phone: string;
      fullName?: string;
      preferredStaffId?: string;
    },
  ) =>
    request<{ status: string; appointment: unknown; paymentRedirectUrl?: string }>(
      `/salons/${salonId}/appointments/manual`,
      { method: 'POST', body },
    ),
  /** The salon's bookings awaiting approval, oldest first (manage_appointments). */
  getPending: (salonId: string) =>
    request<{ appointments: unknown[] }>(`/salons/${salonId}/pending`),
  /** Approve a pending appointment (manage_appointments — Owner/Admin). */
  approveAppointment: (appointmentId: string) =>
    request<{ status: string; appointment: unknown }>(`/appointments/${appointmentId}/approve`, {
      method: 'POST',
    }),
  /** Reject a pending appointment (manage_appointments — Owner/Admin). */
  rejectAppointment: (appointmentId: string) =>
    request<{ status: string; appointment: unknown }>(`/appointments/${appointmentId}/reject`, {
      method: 'POST',
    }),
  /**
   * Cancel a confirmed/held appointment from the calendar. The backend releases
   * the staff + chair, applies the deposit refund/retain policy, and notifies
   * the customer. Authorized for managing staff (Owner/Admin any salon booking;
   * a Stylist only their own) — the route also allows the owning customer for
   * self-service cancellation.
   */
  cancelAppointment: (appointmentId: string) =>
    request<{ status: string; appointment: unknown }>(`/appointments/${appointmentId}/cancel`, {
      method: 'POST',
    }),
  /**
   * Mark a confirmed appointment as a no-show (manage_appointments —
   * Owner/Admin any salon booking; a Stylist only their own). Mirrors the
   * backend `POST /appointments/:id/no-show` route.
   */
  noShowAppointment: (appointmentId: string) =>
    request<{ status: string; appointment: unknown }>(`/appointments/${appointmentId}/no-show`, {
      method: 'POST',
    }),
  rescheduleAppointment: (appointmentId: string, startAt: string, preferredStaffId?: string) =>
    request<{
      status: string;
      appointment: {
        id?: string;
        startAt?: string;
        endAt?: string;
        status?: string;
        staffMemberId?: string;
      } | null;
      previousAppointmentId: string;
      paymentRedirectUrl?: string;
    }>('/appointments/' + appointmentId + '/reschedule-managed', {
      method: 'POST',
      body: { startAt, ...(preferredStaffId ? { preferredStaffId } : {}) },
    }),
  getAppointmentCustomer: (appointmentId: string) =>
    request<AppointmentCustomerOverview>('/appointments/' + appointmentId + '/customer'),
  addCustomerNote: (appointmentId: string, body: string) =>
    request<{ note: AppointmentCustomerOverview['notes'][number] }>(
      '/appointments/' + appointmentId + '/customer-notes',
      { method: 'POST', body: { body } },
    ),
  sendCustomerMessage: (appointmentId: string, message: string) =>
    request<{ status: 'sent' }>('/appointments/' + appointmentId + '/message', {
      method: 'POST',
      body: { message },
    }),
  getWaitlist: (salonId: string, from?: string, to?: string) => {
    const query = new URLSearchParams({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }).toString();
    return request<{ waitlist: OwnerWaitlistEntry[] }>(
      '/salons/' + salonId + '/waitlist' + (query ? '?' + query : ''),
    );
  },

  /** The salon's money transactions (appointment + subscription payments), newest-first. */
  getTransactions: (salonId: string) =>
    request<{ transactions: Transaction[] }>(`/salons/${salonId}/transactions`),
  /** Create a service (Owner only). Deposit fields are optional. */
  createService: (
    salonId: string,
    body: {
      name: string;
      durationMinutes?: number;
      bufferMinutes?: number;
      priceRial?: number;
      requiresDeposit?: boolean;
      depositRial?: number;
    },
  ) =>
    request<{
      service: {
        id: string;
        name: string;
        durationMinutes: number;
        bufferMinutes?: number;
        priceRial: number;
        requiresDeposit: boolean;
        depositRial: number | null;
        staffIds?: string[];
      };
    }>(`/salons/${salonId}/services`, { method: 'POST', body }),
  /** Delete a service (Owner only). */
  deleteService: (salonId: string, serviceId: string) =>
    request<{ ok: boolean }>(`/salons/${salonId}/services/${serviceId}`, {
      method: 'DELETE',
    }),
  updateService: (
    salonId: string,
    serviceId: string,
    body: {
      name?: string;
      durationMinutes?: number;
      bufferMinutes?: number;
      priceRial?: number;
      requiresDeposit?: boolean;
      depositRial?: number | null;
    },
  ) =>
    request<{ service: Record<string, unknown> }>(
      `/salons/${salonId}/services/${serviceId}`,
      { method: 'PATCH', body },
    ),
  setServiceStaff: (salonId: string, serviceId: string, staffIds: string[]) =>
    request<{ staffIds: string[] }>(`/salons/${salonId}/services/${serviceId}/staff`, {
      method: 'PUT',
      body: { staffIds },
    }),
  /** Create a chair (Owner only). */
  createChair: (salonId: string, body: { name: string }) =>
    request<{ chair: { id: string; name: string; active: boolean } }>(`/salons/${salonId}/chairs`, {
      method: 'POST',
      body,
    }),
  /** Remove a chair from future capacity while preserving appointment history. */
  deleteChair: (salonId: string, chairId: string) =>
    request<{ ok: boolean }>(`/salons/${salonId}/chairs/${chairId}`, { method: 'DELETE' }),
  /** Restore or deactivate an existing chair. */
  setChairActive: (salonId: string, chairId: string, active: boolean) =>
    request<{ chair: { id: string; name: string; active: boolean } }>(
      `/salons/${salonId}/chairs/${chairId}`,
      { method: 'PATCH', body: { active } },
    ),
};

// ─── Salon client book ─────────────────────────────────────────────────────

/** A client row shown in the owner panel. */
export interface SalonClient {
  id: string;
  fullName: string | null;
  phone: string;
  visits: number;
  lastVisitAt: string | null;
  noShowCount: number;
  createdAt: string;
}

export const clientBookApi = {
  list: (salonId: string, search?: string) =>
    request<{ clients: SalonClient[] }>(
      `/salons/${salonId}/clients${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    ),
  add: (salonId: string, input: { fullName: string; phone: string }) =>
    request<{ client: SalonClient }>(`/salons/${salonId}/clients`, {
      method: 'POST',
      body: input,
    }),
};

// ─── Platform admin ─────────────────────────────────────────────────────────
// Global operations center. This surface is intentionally separate from
// `adminApi`: the latter is tenant-scoped to one salon; these endpoints require
// a PlatformAdmin JWT and never accept a salon identity from the browser.

export type PlatformRole = 'PlatformAdmin';

export interface PlatformPageMeta {
  page: number;
  limit: number;
  total: number;
  pageCount: number;
}

export interface PlatformPage<T> {
  data: T[];
  meta: PlatformPageMeta;
}

export interface PlatformDashboard {
  metrics: {
    totalSalons: number;
    activeSalons: number;
    suspendedSalons: number;
    totalCustomers: number;
    totalStaff: number;
    totalAppointments: number;
    todayAppointments: number;
    pendingAppointments: number;
    waitingList: number;
    qrScans30d: number;
    revenue30dRial: number;
    pendingPayments: number;
  };
  subscriptions: Record<string, number>;
  trend: Array<{ date: string; appointments: number; qrScans: number }>;
  recentSalons: Array<{
    id: string;
    name: string;
    active: boolean;
    createdAt: string;
    subscription: { status: string; planKind: string; expiresAt: string } | null;
  }>;
}

export interface PlatformSalonRow {
  id: string;
  name: string;
  qrToken: string;
  timezone: string;
  active: boolean;
  createdAt: string;
  owner: { fullName: string; phone: string | null } | null;
  subscription: { status: string; planKind: string; expiresAt: string } | null;
  counts: { staffMembers: number; services: number; appointments: number; waitlistEntries: number; qrScanEvents: number };
}

export interface PlatformCustomerRow {
  id: string;
  phone: string;
  fullName: string | null;
  noShowCount: number;
  _count: { appointments: number; waitlistEntries: number };
}

export interface PlatformStaffRow {
  id: string;
  fullName: string;
  phone: string | null;
  role: string;
  active: boolean;
  salon: { id: string; name: string };
}

export interface PlatformAppointmentRow {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  source: string;
  createdAt: string;
  salon: { id: string; name: string };
  customer: { id: string; fullName: string | null; phone: string };
  staffMember: { id: string; fullName: string };
  service: { id: string; name: string; priceRial: number };
  _count: { payments: number };
}

export interface PlatformSubscriptionRow {
  id: string;
  status: string;
  planKind: string;
  startedAt: string;
  expiresAt: string;
  graceUntil: string | null;
  salon: { id: string; name: string; active: boolean };
}

export interface PlatformPaymentRow {
  id: string;
  kind: 'appointment' | 'subscription';
  amountRial: number;
  status: string;
  gateway: string;
  refId: string | null;
  createdAt: string;
  salon: { id: string; name: string };
  subject: string;
  customer: { fullName: string | null; phone: string } | null;
}

export interface PlatformWaitlistRow {
  id: string;
  status: string;
  windowStart: string;
  windowEnd: string;
  createdAt: string;
  salon: { id: string; name: string };
  customer: { fullName: string | null; phone: string };
  service: { name: string };
}

export interface PlatformQrScanRow {
  id: string;
  source: string;
  createdAt: string;
  salon: { id: string; name: string };
}

export interface PlatformAuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  admin: { id: string; fullName: string; phone: string };
}

export interface PlatformListOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  salonId?: string;
  source?: string;
  from?: string;
  to?: string;
}

export interface PlatformDetailResponse {
  resource: string;
  record: Record<string, unknown> & { id?: string };
}

function platformQuery(options: PlatformListOptions = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const platformAdminApi = {
  getDashboard: () => request<PlatformDashboard>('/platform-admin/dashboard'),
  listSalons: (options?: PlatformListOptions) =>
    request<PlatformPage<PlatformSalonRow>>(`/platform-admin/salons${platformQuery(options)}`),
  getSalon: (id: string) => request<{ salon: Record<string, unknown> }>(`/platform-admin/salons/${id}`),
  getDetail: (resource: string, id: string) =>
    request<PlatformDetailResponse>(`/platform-admin/details/${encodeURIComponent(resource)}/${encodeURIComponent(id)}`),
  setSalonActive: (id: string, active: boolean) =>
    request<{ salon: { id: string; active: boolean } }>(`/platform-admin/salons/${id}/status`, {
      method: 'PATCH',
      body: { active },
    }),
  listCustomers: (options?: PlatformListOptions) =>
    request<PlatformPage<PlatformCustomerRow>>(`/platform-admin/customers${platformQuery(options)}`),
  listStaff: (options?: PlatformListOptions) =>
    request<PlatformPage<PlatformStaffRow>>(`/platform-admin/staff${platformQuery(options)}`),
  setStaffActive: (id: string, active: boolean) =>
    request<{ staff: { id: string; active: boolean } }>(`/platform-admin/staff/${id}/status`, {
      method: 'PATCH',
      body: { active },
    }),
  listAppointments: (options?: PlatformListOptions) =>
    request<PlatformPage<PlatformAppointmentRow>>(`/platform-admin/appointments${platformQuery(options)}`),
  appointmentAction: (id: string, action: 'approve' | 'reject' | 'cancel' | 'no_show' | 'complete') =>
    request<{ appointment: PlatformAppointmentRow }>(`/platform-admin/appointments/${id}/action`, {
      method: 'POST',
      body: { action },
    }),
  listSubscriptions: (options?: PlatformListOptions) =>
    request<PlatformPage<PlatformSubscriptionRow>>(`/platform-admin/subscriptions${platformQuery(options)}`),
  listPayments: (options?: PlatformListOptions) =>
    request<PlatformPage<PlatformPaymentRow>>(`/platform-admin/payments${platformQuery(options)}`),
  listWaitlist: (options?: PlatformListOptions) =>
    request<PlatformPage<PlatformWaitlistRow>>(`/platform-admin/waitlist${platformQuery(options)}`),
  listQrScans: (options?: PlatformListOptions) =>
    request<PlatformPage<PlatformQrScanRow>>(`/platform-admin/qr-scans${platformQuery(options)}`),
  listAuditLogs: (options?: PlatformListOptions) =>
    request<PlatformPage<PlatformAuditRow>>(`/platform-admin/audit-logs${platformQuery(options)}`),
};

/** A single row in the owner-panel transactions ledger. */
export interface Transaction {
  id: string;
  kind: 'appointment' | 'subscription';
  amountRial: number;
  status: string;
  gateway: string;
  refId: string | null;
  createdAt: string;
  /** Service name (appointment) or plan kind (subscription). */
  label: string | null;
}

// ─── Approval policy ───────────────────────────────────────────────────────
// Owner-panel approval-policy surface (auto-confirm vs manual approval). Mirrors
// the backend `AvailabilityConfig` + admin routes: a salon-level default plus an
// optional per-stylist override (null = inherit the salon default).
//   GET  /salons/:salonId/approval-policy  → ApprovalPolicyResponse
//   POST /salons/:salonId/auto-approve     (body { autoApprove })           — salon default
//   POST /staff/:staffId/auto-approve      (body { autoApprove: bool|null }) — stylist override

/** A staff member's approval-policy row in the owner UI. */
export interface ApprovalPolicyStaff {
  id: string;
  fullName: string | null;
  role: string;
  /** null = inherit the salon default; true/false = explicit override. */
  autoApprove: boolean | null;
  /** Whether the salon has granted this stylist self-availability management. */
  manageOwnAvailability: boolean;
}

/** The salon's approval policy (default + per-stylist overrides). */
export interface ApprovalPolicyResponse {
  /** The salon-level default — true auto-confirms new (deposit-free) bookings. */
  autoApprove: boolean;
  staff: ApprovalPolicyStaff[];
}

export const approvalPolicyApi = {
  /** Read the salon default + every stylist's override for the owner UI. */
  get: (salonId: string) => request<ApprovalPolicyResponse>(`/salons/${salonId}/approval-policy`),
  /** Set the salon-level default approval policy. */
  setSalon: (salonId: string, autoApprove: boolean) =>
    request<{ ok: boolean; autoApprove: boolean }>(`/salons/${salonId}/auto-approve`, {
      method: 'POST',
      body: { autoApprove },
    }),
  /** Set (`true`/`false`) or clear (`null` = inherit) a stylist's override. */
  setStaff: (staffId: string, autoApprove: boolean | null) =>
    request<{ ok: boolean; autoApprove: boolean | null }>(`/staff/${staffId}/auto-approve`, {
      method: 'POST',
      body: { autoApprove },
    }),
};

// ─── Brand accent (per-salon storefront theming) ────────────────────────────
// Owner-panel + storefront Brand_Accent surface (signature-ui-system R4.1,
// R4.7). Mirrors the additive backend `Salon.brandAccent` column and its
// public read / owner write routes — a direct analogue of `approvalPolicyApi`:
//   GET  /salons/:salonId/brand          → { brandAccent }            (public read)
//   POST /salons/:salonId/brand-accent   (body { brandAccent: key|null }) (owner write,
//                                          guarded by `configure_salon`)
// `null` = the signature default (no per-tenant accent).

/** Public read of a salon's storefront Brand_Accent (null = signature default). */
export interface BrandAccentResponse {
  /** The salon's Brand_Accent key (from the curated `ACCENTS`), or null. */
  brandAccent: string | null;
  /**
   * The salon's display name (additive): lets a deep-linked funnel show the
   * salon as the primary brand mark without another request (R4.5). May be
   * absent/null for older backends or unknown salons.
   */
  name?: string | null;
}

export const brandAccentApi = {
  /**
   * Read a salon's storefront Brand_Accent so any (anonymous) visitor's funnel
   * can theme itself. `null` = the signature default.
   */
  get: (salonId: string) => request<BrandAccentResponse>(`/salons/${salonId}/brand`),
  /**
   * Set (a curated accent key) or clear (`null` = signature default) the
   * salon's storefront Brand_Accent. Owner-only (`configure_salon`).
   */
  set: (salonId: string, brandAccent: string | null) =>
    request<{ ok: boolean; brandAccent: string | null }>(`/salons/${salonId}/brand-accent`, {
      method: 'POST',
      body: { brandAccent },
    }),
};

// ─── Salon closures (block a full day / an hour-range) ───────────────────────
// Owner-panel availability limits. Mirrors the backend `AvailabilityConfig`
// holiday model + admin routes: a closure is a date that is either fully closed
// (no time window) or partially closed for a [startTime,endTime) window. The
// scheduling engine enforces both (no availability + booking rejected).
//   GET    /salons/:salonId/holidays              → { holidays }
//   POST   /salons/:salonId/holidays              (body { onDate, startTime?, endTime? })
//   DELETE /salons/:salonId/holidays/:holidayId   → { ok }

/** A single salon closure row. */
export interface SalonClosure {
  id: string;
  /** ISO date `YYYY-MM-DD` the closure applies to. */
  onDate: string;
  /** "HH:mm" window start, or `null` for a full-day closure. */
  startTime: string | null;
  /** "HH:mm" window end, or `null` for a full-day closure. */
  endTime: string | null;
}

/** Payload for adding a closure: a full day (omit times) or an hour-range. */
export interface SalonClosureInput {
  onDate: string;
  /** Optional end of a multi-day range (≥ onDate); same window applies daily. */
  toDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export const holidaysApi = {
  /** List the salon's closures (full-day + partial-day), soonest first. */
  list: (salonId: string) => request<{ holidays: SalonClosure[] }>(`/salons/${salonId}/holidays`),
  /** Add a closure. Omit both times for a full-day closure. */
  add: (salonId: string, input: SalonClosureInput) =>
    request<{ holiday: SalonClosure; holidays?: SalonClosure[] }>(`/salons/${salonId}/holidays`, {
      method: 'POST',
      body: input,
    }),
  /** Remove a closure by id. */
  remove: (salonId: string, holidayId: string) =>
    request<{ ok: boolean }>(`/salons/${salonId}/holidays/${holidayId}`, {
      method: 'DELETE',
    }),
};

export interface WeeklyWorkingHour {
  /** JavaScript weekday: Sunday 0 … Saturday 6. */
  weekday: number;
  startTime: string;
  endTime: string;
}

export const workingHoursApi = {
  getSalon: (salonId: string) =>
    request<{ hours: WeeklyWorkingHour[] }>(`/salons/${salonId}/working-hours`),
  setSalon: (salonId: string, hours: WeeklyWorkingHour[]) =>
    request<{ ok: boolean; hours: WeeklyWorkingHour[] }>(`/salons/${salonId}/working-hours`, {
      method: 'PUT',
      body: { hours },
    }),
  getStaff: (salonId: string, staffId: string) =>
    request<{ hours: WeeklyWorkingHour[] }>(
      `/salons/${salonId}/staff/${staffId}/working-hours`,
    ),
  setStaff: (salonId: string, staffId: string, hours: WeeklyWorkingHour[]) =>
    request<{ ok: boolean; hours: WeeklyWorkingHour[] }>(
      `/salons/${salonId}/staff/${staffId}/working-hours`,
      { method: 'PUT', body: { hours } },
    ),
};

export const bookingPolicyApi = {
  get: (salonId: string) =>
    request<{ bookingWindowDays: number }>(`/salons/${salonId}/booking-policy`),
  set: (salonId: string, bookingWindowDays: number) =>
    request<{ ok: boolean; bookingWindowDays: number }>(`/salons/${salonId}/booking-policy`, {
      method: 'PUT',
      body: { bookingWindowDays },
    }),
};

export const emergencyScheduleApi = {
  closeDay: (salonId: string, onDate: string, cancelAppointments: boolean) =>
    request<{ ok: boolean; cancelledCount: number; failedCount: number }>(
      `/salons/${salonId}/emergency-close`,
      { method: 'POST', body: { onDate, cancelAppointments } },
    ),
};

// ─── Per-stylist availability blocks (a stylist's own day / hour-range off) ──
// Distinct from a salon closure: a block affects ONLY that stylist's calendar.
// Owner/Admin may manage any stylist's blocks; a Stylist may manage their OWN
// blocks only when the salon has granted the permission (manageOwnAvailability).
// The block shape mirrors SalonClosure (full-day when both times are null).
//   GET    /staff/:staffId/availability-blocks            → { blocks }
//   POST   /staff/:staffId/availability-blocks            (body { onDate, startTime?, endTime? })
//   DELETE /staff/:staffId/availability-blocks/:blockId   → { ok }
//   POST   /staff/:staffId/manage-availability            (body { allowed })  — Owner-only grant

export const staffAvailabilityApi = {
  /**
   * List a stylist's own availability blocks. For a stylist this succeeds only
   * when the salon has granted them the permission (otherwise 403) — the calendar
   * uses that to decide whether to show the self-block affordance.
   */
  list: (staffId: string) =>
    request<{ blocks: SalonClosure[] }>(`/staff/${staffId}/availability-blocks`),
  /** Add a block for the stylist. Omit both times for a full-day block. */
  add: (staffId: string, input: SalonClosureInput) =>
    request<{ block: SalonClosure; blocks?: SalonClosure[] }>(
      `/staff/${staffId}/availability-blocks`,
      {
        method: 'POST',
        body: input,
      },
    ),
  /** Remove one of the stylist's blocks by id. */
  remove: (staffId: string, blockId: string) =>
    request<{ ok: boolean }>(`/staff/${staffId}/availability-blocks/${blockId}`, {
      method: 'DELETE',
    }),
  /** Owner grant/revoke of a stylist's self-availability permission. */
  setManageOwn: (staffId: string, allowed: boolean) =>
    request<{ ok: boolean; allowed: boolean }>(`/staff/${staffId}/manage-availability`, {
      method: 'POST',
      body: { allowed },
    }),
};

// ─── Staff / user management (add a stylist, admin, or owner) ────────────────
// Owner-only staff CRUD. A staff member has a role (RBAC access) and an optional
// unique login phone: setting the phone lets that person sign in via OTP and
// receive a staff JWT with this role (auth.service findStaffClaimsByPhone). The
// granular permission flags (autoApprove, manageOwnAvailability) are managed by
// the approval-policy + staff-availability surfaces, not here.
//   GET   /salons/:salonId/staff   → { staff }
//   POST  /salons/:salonId/staff   (body { fullName, role, phone? })  → { staff }
//   PATCH /staff/:staffId          (body subset { fullName, role, phone, active }) → { staff }

/** Staff RBAC role. */
export type StaffRole = 'Owner' | 'Admin' | 'Stylist';

/** A salon staff member as the owner UI sees it. */
export interface SalonStaff {
  id: string;
  fullName: string | null;
  role: StaffRole;
  /** OTP login phone, or null (no login). */
  phone: string | null;
  active: boolean;
  /** Approval-policy override (null = inherit the salon default). */
  autoApprove: boolean | null;
  /** Whether the salon granted this stylist self-availability management. */
  manageOwnAvailability: boolean;
}

export interface StaffCreateInput {
  fullName: string;
  role: StaffRole;
  /** Optional unique login phone (`09xxxxxxxxx`); omit for a non-login record. */
  phone?: string | null;
}

export interface StaffUpdateInput {
  fullName?: string;
  role?: StaffRole;
  /** `null`/empty clears the login; a non-empty value sets it (must be unique). */
  phone?: string | null;
  active?: boolean;
}

export const staffApi = {
  /** Add a staff member (Owner only). Returns the created record. */
  create: (salonId: string, input: StaffCreateInput) =>
    request<{ staff: SalonStaff }>(`/salons/${salonId}/staff`, {
      method: 'POST',
      body: input,
    }),
  /** Update a staff member's identity / role / login / active flag (Owner only). */
  update: (staffId: string, patch: StaffUpdateInput) =>
    request<{ staff: SalonStaff }>(`/staff/${staffId}`, {
      method: 'PATCH',
      body: patch,
    }),
};

// ─── Salon Inbox Notifications ───────────────────────────────────────────────
// Owner/dashboard in-app inbox surface. Durable rows persisted on the backend
// (table `salon_notification`); delivered live over the WS channel at
// /ws/inbox?token=. The REST surface below is the durable/query side.

export interface SalonNotification {
  id: string;
  salonId: string;
  audience: string;
  staffMemberId: string | null;
  type: string;
  title: string;
  body: string;
  payload: {
    appointmentId?: string;
    orderId?: string;
    staffMemberId?: string;
    customerId?: string;
    date?: string;
    [key: string]: unknown;
  } | null;
  readAt: string | null;
  createdAt: string;
}

export const inboxApi = {
  list: (salonId: string, opts?: { onlyUnread?: boolean; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (opts?.onlyUnread) params.set('onlyUnread', 'true');
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));
    const qs = params.toString();
    return request<{
      notifications: SalonNotification[];
      total: number;
      limit: number;
      offset: number;
    }>(
      `/salons/${salonId}/notifications${qs ? `?${qs}` : ''}`,
    );
  },
  unreadCount: (salonId: string) =>
    request<{ count: number }>(`/salons/${salonId}/notifications/unread-count`),
  markRead: (id: string) =>
    request<{ notification: SalonNotification }>(`/notifications/${id}/read`, {
      method: 'PATCH',
    }),
  markAllRead: (salonId: string) =>
    request<{ ok: boolean; count: number }>(`/salons/${salonId}/notifications/read-all`, {
      method: 'POST',
    }),
};
