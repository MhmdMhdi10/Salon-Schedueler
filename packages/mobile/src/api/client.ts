/**
 * API client for the Salon Booking System backend (React Native).
 * Handles auth tokens, request/response, and error mapping.
 *
 * The base URL is configuration-driven (Requirement 6.1) and read from
 * `src/config.ts` rather than being hard-coded to a production host.
 */
import { API_BASE_URL } from '../config';

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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Auth-Client': 'mobile',
    ...options.headers,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: 'Request failed' })) as Record<string, unknown>;
    throw new ApiError(response.status, String(errorBody.code || 'UNKNOWN'), String(errorBody.message || 'Request failed'));
  }

  return response.json() as Promise<T>;
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
  requestOtp: (phone: string) =>
    request<{ otpLength?: number }>('/auth/otp/request', {
      method: 'POST',
      body: { phone },
    }),
  verifyOtp: (phone: string, code: string) =>
    request<{ accessToken: string; refreshToken: string }>('/auth/otp/verify', { method: 'POST', body: { phone, code } }),
  refresh: (refreshToken: string) =>
    request<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    }),
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
};

// Push token registration
export const pushApi = {
  registerToken: (token: string, platform: string) =>
    request<void>('/devices/token', { method: 'POST', body: { token, platform } }),
};
