import { toPersianDigits, normalizeDigits, PERSIAN_DIGITS } from './index';

describe('toPersianDigits', () => {
  it('localizes ASCII digits to Persian numerals', () => {
    expect(toPersianDigits('0123456789')).toBe('۰۱۲۳۴۵۶۷۸۹');
  });

  it('accepts a number and keeps separators untouched', () => {
    expect(toPersianDigits(1404)).toBe('۱۴۰۴');
    expect(toPersianDigits('09:30')).toBe('۰۹:۳۰');
    expect(toPersianDigits('۱۴۰۴/۰۲/۱۷')).toBe('۱۴۰۴/۰۲/۱۷');
  });

  it('leaves non-digit characters in place', () => {
    expect(toPersianDigits('abc-12')).toBe('abc-۱۲');
  });

  it('exposes the digit map indexed by ASCII value', () => {
    expect(PERSIAN_DIGITS[0]).toBe('۰');
    expect(PERSIAN_DIGITS[9]).toBe('۹');
  });
});

describe('normalizeDigits', () => {
  it('normalizes Persian digits to ASCII', () => {
    expect(normalizeDigits('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789');
  });

  it('normalizes Eastern-Arabic digits to ASCII', () => {
    expect(normalizeDigits('٠٩١٢')).toBe('0912');
  });

  it('leaves ASCII digits and separators untouched', () => {
    expect(normalizeDigits('0912-345')).toBe('0912-345');
  });

  it('round-trips with toPersianDigits for ASCII digit strings', () => {
    const ascii = '0987654321';
    expect(normalizeDigits(toPersianDigits(ascii))).toBe(ascii);
  });
});
