import { describe, expect, it } from 'vitest';
import { formatPriceInput, parsePriceInput } from './price-input';

describe('price entry', () => {
  it('groups Persian and Latin digits as they are typed', () => {
    expect(formatPriceInput('۱۲۳۴۵۶۷')).toBe('1,234,567');
    expect(formatPriceInput('123')).toBe('123');
    expect(formatPriceInput('1234')).toBe('1,234');
    expect(formatPriceInput('۱,۲۳۴')).toBe('1,234');
    expect(parsePriceInput('۱,۲۳۴,۵۶۷')).toBe(1234567);
  });
});
