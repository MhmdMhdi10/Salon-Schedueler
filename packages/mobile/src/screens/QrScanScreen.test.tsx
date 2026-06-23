import { QrScanScreen, QR_SCAN_SCREEN } from './QrScanScreen';
import { resolveScannedQr } from './QrScanScreen.logic';

/**
 * Tests for the mobile QrScanScreen.
 * Verifies the QR resolve flow calls the API client, distinguishes malformed
 * vs unregistered outcomes, handles success/error, and that the screen exports
 * a real component.
 * Requirement: 7.4, 7.5
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

describe('QrScanScreen component export', () => {
  it('exports a real function component and a route name', () => {
    expect(typeof QrScanScreen).toBe('function');
    expect(QR_SCAN_SCREEN).toBe('QrScanScreen');
  });
});

describe('QrScanScreen resolve flow logic', () => {
  it('resolves a valid payload to a salon by calling the QR endpoint', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ salon: { id: 'salon-1', name: 'سالن زیبایی' } }));

    const result = await resolveScannedQr('v1.abc123.checksum');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.salon).toEqual({ id: 'salon-1', name: 'سالن زیبایی' });
    }
    const [url, options] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/salons/by-qr/');
    expect(options.method).toBe('GET');
  });

  it('reports a malformed payload distinctly', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(400, { code: 'QR_MALFORMED', message: 'malformed' }));

    const result = await resolveScannedQr('garbage');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('malformed');
      expect(result.message).toBe('کد QR نامعتبر است');
    }
  });

  it('reports an unregistered salon distinctly', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(404, { code: 'QR_UNREGISTERED', message: 'unregistered' }));

    const result = await resolveScannedQr('v1.unknown.checksum');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unregistered');
      expect(result.message).toBe('سالن یافت نشد');
    }
  });

  it('reports a generic error when the network request fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

    const result = await resolveScannedQr('v1.abc123.checksum');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('error');
      expect(result.message).toBe('Network request failed');
    }
  });
});
