import type { QrParseResult } from '../types/domain.js';

// ---------- CRC32 (table-based, no external dependency) ----------

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  CRC32_TABLE[i] = crc >>> 0;
}

function crc32(input: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < input.length; i++) {
    const byte = input.charCodeAt(i) & 0xff;
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------- Constants ----------

/**
 * Default deep-link base for salon QR payloads. Used when no explicit base is
 * supplied to {@link encodeSalonQr} / {@link parseSalonQr}. Deployments (or dev)
 * can override the base (e.g. to a LAN IP origin) by passing it explicitly.
 */
export const QR_BASE_URL = 'https://book.salon.app/s/';
const QR_VERSION = 'v1';

// ---------- Public API ----------

/**
 * Encodes a salon token into a versioned deep link with CRC32 checksum.
 *
 * Format: `<baseUrl>v1.<token>.<hex-checksum>` (default base
 * `https://book.salon.app/s/`). The base is configurable so non-production
 * environments can issue scannable links pointing at a LAN IP / dev origin;
 * `parseSalonQr` must be called with the same base to round-trip.
 */
export function encodeSalonQr(salonToken: string, baseUrl: string = QR_BASE_URL): string {
  const body = `${QR_VERSION}.${salonToken}`;
  const checksum = crc32(body).toString(16).padStart(8, '0');
  return `${baseUrl}${body}.${checksum}`;
}

/**
 * Parses a QR payload, returning the salon token or a malformed result.
 *
 * Validates the URL prefix (`baseUrl`, default `https://book.salon.app/s/`),
 * version, and CRC32 checksum. Pass the same base that was used to encode.
 */
export function parseSalonQr(payload: string, baseUrl: string = QR_BASE_URL): QrParseResult {
  // Must start with the expected base URL
  if (!payload.startsWith(baseUrl)) {
    return { kind: 'malformed' };
  }

  const path = payload.slice(baseUrl.length);

  // Expected structure: v1.<token>.<8-hex-checksum>
  // The checksum is always the last 8 hex characters after the final dot.
  const lastDotIndex = path.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return { kind: 'malformed' };
  }

  const body = path.slice(0, lastDotIndex);
  const checksumHex = path.slice(lastDotIndex + 1);

  // Checksum must be exactly 8 hex characters
  if (!/^[0-9a-f]{8}$/.test(checksumHex)) {
    return { kind: 'malformed' };
  }

  // Verify CRC32
  const expectedCrc = crc32(body);
  const actualCrc = parseInt(checksumHex, 16);
  if (expectedCrc !== actualCrc) {
    return { kind: 'malformed' };
  }

  // Body must start with "v1."
  if (!body.startsWith(`${QR_VERSION}.`)) {
    return { kind: 'malformed' };
  }

  const salonToken = body.slice(QR_VERSION.length + 1);

  // Token must be non-empty
  if (salonToken.length === 0) {
    return { kind: 'malformed' };
  }

  return { kind: 'ok', salonToken };
}
