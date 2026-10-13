import { normalizeDigits } from '@salon/shared';

/** Group digits while typing; values remain display strings until submission. */
export function formatPriceInput(value: string): string {
  const digits = normalizeDigits(value).replace(/\D/g, '');
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
}

export function parsePriceInput(value: string): number {
  return Number(normalizeDigits(value).replace(/\D/g, '')) || 0;
}
