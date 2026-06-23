import * as fc from 'fast-check';
import { encodeSalonQr, parseSalonQr } from './index';

// Feature: salon-booking-system, Property 11: QR payload round-trip and malformed detection

const QR_BASE_URL = 'https://book.salon.app/s/';

describe('Property 11: QR payload round-trip and malformed detection', () => {
  /**
   * Validates: Requirements 7.1, 7.3, 7.5
   *
   * For any non-empty string token, parseSalonQr(encodeSalonQr(token)) recovers
   * the original token with kind 'ok'.
   */
  it('round-trip: encode then parse recovers the original token', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (token) => {
        const encoded = encodeSalonQr(token);
        const result = parseSalonQr(encoded);
        expect(result).toEqual({ kind: 'ok', salonToken: token });
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 7.1, 7.3, 7.5
   *
   * For any string that doesn't start with the expected base URL prefix,
   * parseSalonQr returns {kind:'malformed'}.
   */
  it('malformed detection: strings without the base URL prefix are malformed', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.startsWith(QR_BASE_URL)),
        (payload) => {
          const result = parseSalonQr(payload);
          expect(result).toEqual({ kind: 'malformed' });
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 7.1, 7.3, 7.5
   *
   * For any valid-looking URL with a corrupted checksum (last hex digit flipped),
   * parseSalonQr returns {kind:'malformed'}.
   */
  it('malformed detection: valid-looking URLs with corrupted checksums are malformed', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (token) => {
        const encoded = encodeSalonQr(token);
        // Corrupt the checksum by flipping the last hex character
        const lastChar = encoded[encoded.length - 1];
        const flipped = lastChar === '0' ? '1' : '0';
        const corrupted = encoded.slice(0, -1) + flipped;
        const result = parseSalonQr(corrupted);
        expect(result).toEqual({ kind: 'malformed' });
      }),
      { numRuns: 100 },
    );
  });
});
