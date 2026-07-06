import { encodeSalonQr, parseSalonQr, QR_BASE_URL } from './index';

describe('QR payload codec', () => {
  describe('encodeSalonQr', () => {
    it('produces a URL with the expected prefix and version', () => {
      const result = encodeSalonQr('abc123');
      expect(result).toMatch(/^https:\/\/book\.salon\.app\/s\/v1\.abc123\.[0-9a-f]{8}$/);
    });

    it('produces deterministic output for the same token', () => {
      const a = encodeSalonQr('token-xyz');
      const b = encodeSalonQr('token-xyz');
      expect(a).toBe(b);
    });

    it('produces different checksums for different tokens', () => {
      const a = encodeSalonQr('token-a');
      const b = encodeSalonQr('token-b');
      expect(a).not.toBe(b);
    });
  });

  describe('parseSalonQr', () => {
    it('round-trips with encodeSalonQr', () => {
      const token = 'my-salon-token-42';
      const payload = encodeSalonQr(token);
      const result = parseSalonQr(payload);
      expect(result).toEqual({ kind: 'ok', salonToken: token });
    });

    it('returns malformed for an empty string', () => {
      expect(parseSalonQr('')).toEqual({ kind: 'malformed' });
    });

    it('returns malformed for a random URL', () => {
      expect(parseSalonQr('https://example.com/foo')).toEqual({ kind: 'malformed' });
    });

    it('returns malformed when the checksum is tampered', () => {
      const payload = encodeSalonQr('test-token');
      // Tamper with the last character of the checksum
      const tampered = payload.slice(0, -1) + (payload.endsWith('0') ? '1' : '0');
      expect(parseSalonQr(tampered)).toEqual({ kind: 'malformed' });
    });

    it('returns malformed when the token is altered but checksum kept', () => {
      const payload = encodeSalonQr('original');
      // Replace token but keep checksum
      const parts = payload.split('.');
      parts[1] = 'altered';
      const altered = parts.join('.');
      expect(parseSalonQr(altered)).toEqual({ kind: 'malformed' });
    });

    it('returns malformed for a payload with no checksum', () => {
      expect(parseSalonQr('https://book.salon.app/s/v1.token')).toEqual({ kind: 'malformed' });
    });

    it('returns malformed when version is wrong', () => {
      // Manually craft a v2 payload with valid checksum for "v2.token"
      expect(parseSalonQr('https://book.salon.app/s/v2.token.00000000')).toEqual({
        kind: 'malformed',
      });
    });

    it('returns malformed when token is empty (v1..checksum)', () => {
      // Encode with an empty-like structure
      expect(parseSalonQr('https://book.salon.app/s/v1..00000000')).toEqual({
        kind: 'malformed',
      });
    });

    it('handles tokens containing dots', () => {
      const token = 'salon.with.dots';
      const payload = encodeSalonQr(token);
      const result = parseSalonQr(payload);
      expect(result).toEqual({ kind: 'ok', salonToken: token });
    });

    it('handles tokens containing special characters', () => {
      const token = 'uuid-4f3a-8b2c-9d1e';
      const payload = encodeSalonQr(token);
      const result = parseSalonQr(payload);
      expect(result).toEqual({ kind: 'ok', salonToken: token });
    });

    it('accepts the bare path segment without the base URL prefix', () => {
      // The campaign URL routes through `/s/:slug`, so resolveQr receives just
      // `v1.<token>.<checksum>` — the codec must not require the full URL.
      const token = 'my-salon-token';
      const full = encodeSalonQr(token);
      const segment = full.slice(QR_BASE_URL.length);
      const result = parseSalonQr(segment);
      expect(result).toEqual({ kind: 'ok', salonToken: token });
    });

    it('accepts the bare path segment with a custom base stripped', () => {
      const token = 'dev-token';
      const base = 'http://localhost:5273/s/';
      const full = encodeSalonQr(token, base);
      const segment = full.slice(base.length);
      const result = parseSalonQr(segment, base);
      expect(result).toEqual({ kind: 'ok', salonToken: token });
    });
  });
});
