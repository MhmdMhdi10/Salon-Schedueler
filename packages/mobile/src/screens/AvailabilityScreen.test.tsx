import { AvailabilityScreen, AVAILABILITY_SCREEN } from './AvailabilityScreen';
import { loadServices, loadSlots, createBooking } from './AvailabilityScreen.logic';

/**
 * Tests for the mobile AvailabilityScreen.
 * Verifies the services → slots → book flow calls the shared API client,
 * surfaces success/held/error outcomes, and that the screen exports a real
 * component while preserving the AVAILABILITY_SCREEN route-name constant.
 * Requirement: 6.4, 7.2, 7.5
 */

const mockFetch = jest.fn();

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function errorResponse(status: number, body: unknown) {
  return { ok: false, status, json: async () => body };
}

beforeEach(() => {
  mockFetch.mockReset();
  (global as { fetch: unknown }).fetch = mockFetch;
});

describe('AvailabilityScreen component export', () => {
  it('exports a real function component and preserves the route name', () => {
    expect(typeof AvailabilityScreen).toBe('function');
    expect(AVAILABILITY_SCREEN).toBe('AvailabilityScreen');
  });
});

describe('AvailabilityScreen booking flow logic', () => {
  it('loadServices calls the services endpoint and returns the list', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({
        services: [{ id: 'svc-1', name: 'کوتاهی مو', durationMinutes: 30, priceRial: 2500000 }],
      })
    );

    const result = await loadServices('salon-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.services).toHaveLength(1);
      expect(result.services[0].name).toBe('کوتاهی مو');
    }
    const [url, options] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/salons/salon-1/services');
    expect(options.method).toBe('GET');
  });

  it('loadServices returns a structured error when the request fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

    const result = await loadServices('salon-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Network request failed');
    }
  });

  it('loadSlots calls the availability endpoint with service and date', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({ slots: [{ startAt: '2025-05-07T10:00:00Z', endAt: '2025-05-07T10:30:00Z' }] })
    );

    const result = await loadSlots('salon-1', 'svc-1', '2025-05-07');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.slots).toHaveLength(1);
    }
    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/salons/salon-1/availability');
    expect(String(url)).toContain('serviceId=svc-1');
    expect(String(url)).toContain('date=2025-05-07');
  });

  it('createBooking reports a confirmed booking', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ status: 'confirmed', appointment: { id: 'a-1' } }));

    const result = await createBooking({
      salonId: 'salon-1',
      serviceId: 'svc-1',
      startAt: '2025-05-07T10:00:00Z',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe('confirmed');
    }
    const [url, options] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/appointments');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      salonId: 'salon-1',
      serviceId: 'svc-1',
      startAt: '2025-05-07T10:00:00Z',
    });
  });

  it('createBooking surfaces a held booking with its payment redirect url', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({ status: 'held', paymentRedirectUrl: 'https://pay.example/abc' })
    );

    const result = await createBooking({
      salonId: 'salon-1',
      serviceId: 'svc-1',
      startAt: '2025-05-07T10:00:00Z',
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.status === 'held') {
      expect(result.paymentRedirectUrl).toBe('https://pay.example/abc');
    } else {
      throw new Error('expected a held booking result');
    }
  });

  it('createBooking returns a structured error and never fakes success', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(409, { code: 'SLOT_TAKEN', message: 'slot unavailable' }));

    const result = await createBooking({
      salonId: 'salon-1',
      serviceId: 'svc-1',
      startAt: '2025-05-07T10:00:00Z',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('slot unavailable');
    }
  });
});
