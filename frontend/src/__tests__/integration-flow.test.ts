import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration tests for the QR-to-booking-to-confirmation path.
 * Requirements: 7.2, 8.1, 9.1, 9.7
 *
 * These tests verify the end-to-end flow:
 * 1. Customer scans QR code → salon resolved
 * 2. Customer views availability → slots returned
 * 3. Customer books a slot → confirmed/held response
 * 4. Customer sees confirmation
 */

// Mock fetch for integration testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('QR-to-Booking-to-Confirmation Integration', () => {
  const salonId = 'salon-123';
  const serviceId = 'service-456';
  const salonToken = 'v1.abc123.checksum';

  it('resolves a QR payload to a salon', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ salon: { id: salonId, name: 'سالن زیبایی' } }),
    });

    const { salonApi } = await import('../api/client');
    const result = await salonApi.resolveQr(salonToken);

    expect(result.salon.id).toBe(salonId);
    expect(result.salon.name).toBe('سالن زیبایی');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/salons/by-qr/'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('fetches availability for a salon service and date', async () => {
    const slots = [
      { startAt: '2024-03-15T09:00:00Z', endAt: '2024-03-15T09:45:00Z' },
      { startAt: '2024-03-15T10:00:00Z', endAt: '2024-03-15T10:45:00Z' },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ slots }),
    });

    const { salonApi } = await import('../api/client');
    const result = await salonApi.getAvailability(salonId, serviceId, '2024-03-15');

    expect(result.slots).toHaveLength(2);
    expect(result.slots[0].startAt).toBe('2024-03-15T09:00:00Z');
  });

  it('books a slot and receives a pending (awaiting-approval) response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'pending',
        appointment: {
          id: 'appt-789',
          salonId,
          serviceId,
          startAt: '2024-03-15T09:00:00Z',
          status: 'pending',
        },
      }),
    });

    const { bookingApi } = await import('../api/client');
    const result = await bookingApi.create({
      salonId,
      serviceId,
      startAt: '2024-03-15T09:00:00Z',
    });

    expect(result.status).toBe('pending');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/appointments'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('handles held booking with payment redirect', async () => {
    const redirectUrl = 'https://zarinpal.com/pg/StartPay/abc123';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'held',
        appointment: { id: 'appt-held-1', status: 'held' },
        paymentRedirectUrl: redirectUrl,
      }),
    });

    const { bookingApi } = await import('../api/client');
    const result = await bookingApi.create({
      salonId,
      serviceId,
      startAt: '2024-03-15T09:00:00Z',
    });

    expect(result.status).toBe('held');
    expect(result.paymentRedirectUrl).toBe(redirectUrl);
  });

  it('handles booking rejection (no availability)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ code: 'BOOKING_NO_AVAILABILITY', message: 'No slots available' }),
    });

    const { bookingApi } = await import('../api/client');

    await expect(
      bookingApi.create({ salonId, serviceId, startAt: '2024-03-15T09:00:00Z' }),
    ).rejects.toThrow();
  });

  it('full flow: QR → availability → booking → success', async () => {
    // Step 1: Resolve QR
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ salon: { id: salonId, name: 'سالن زیبایی' } }),
    });

    const { salonApi, bookingApi } = await import('../api/client');
    const salon = await salonApi.resolveQr(salonToken);
    expect(salon.salon.id).toBe(salonId);

    // Step 2: Get availability
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        slots: [{ startAt: '2024-03-15T09:00:00Z', endAt: '2024-03-15T09:45:00Z' }],
      }),
    });

    const availability = await salonApi.getAvailability(salon.salon.id, serviceId, '2024-03-15');
    expect(availability.slots.length).toBeGreaterThan(0);

    // Step 3: Book the first available slot
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'confirmed',
        appointment: { id: 'appt-final', status: 'confirmed' },
      }),
    });

    const booking = await bookingApi.create({
      salonId: salon.salon.id,
      serviceId,
      startAt: availability.slots[0].startAt,
    });

    // Step 4: Confirm success
    expect(booking.status).toBe('confirmed');
  });
});
