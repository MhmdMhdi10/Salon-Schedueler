import { describe, expect, it } from 'vitest';
import { buildQrSvg, encodeQrToSvgPath } from '../qr-svg';

function countDarkModules(path: string): number {
  return path.match(/M\d+ \d+h1v1h-1z/g)?.length ?? 0;
}

describe('owner QR encoder', () => {
  it('keeps every codeword when all blocks have the same length', () => {
    const qr = encodeQrToSvgPath('hello world');

    expect(qr.size).toBe(21);
    // Fixed vector protects version 1-M interleaving from dropping its first ECC byte.
    expect(countDarkModules(qr.path)).toBe(214);
  });

  it('produces a complete, scannable campaign QR matrix', () => {
    const qr = encodeQrToSvgPath('https://book.salon.app/s/v1.salon-token-42.deadbeef');

    expect(qr.size).toBe(33);
    // Fixed vector protects version 4-M interleaving from omitting codewords.
    expect(countDarkModules(qr.path)).toBe(553);
    expect(buildQrSvg('https://book.salon.app/s/v1.salon-token-42.deadbeef')).toContain(
      'viewBox="0 0 41 41"',
    );
  });
});
