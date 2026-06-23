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

// Admin endpoints
export const adminApi = {
  getCalendar: (salonId: string, from: string, to: string, view: 'day' | 'week') =>
    request<{ appointments: unknown[] }>(`/salons/${salonId}/calendar?from=${from}&to=${to}&view=${view}`),
  getAnalytics: (salonId: string, from: string, to: string) =>
    request<{ utilization: unknown; revenue: unknown; busiestWindows: unknown }>(`/salons/${salonId}/analytics?from=${from}&to=${to}`),
  getStaff: (salonId: string) => request<{ staff: unknown[] }>(`/salons/${salonId}/staff`),
  getChairs: (salonId: string) => request<{ chairs: unknown[] }>(`/salons/${salonId}/chairs`),
};
