import { normalizeDigits } from '@salon/shared';

/** Iranian mobile pattern: `09` followed by 9 digits (ui-ux §7). */
export const PHONE_PATTERN = /^09\d{9}$/;

/**
 * Normalizes a raw phone entry to the canonical `09xxxxxxxxx` form before
 * validation: localizes Persian/Arabic digits, strips spacing/punctuation, and
 * rewrites the `+98` / `0098` / `98` country-code prefixes to a leading `0`
 * (ui-ux §7). Shared by the OTP login page and the salon-registration wizard so
 * both accept exactly the same pasted formats.
 */
export function normalizePhone(raw: string): string {
  let v = normalizeDigits(raw).replace(/[\s()-]/g, '');
  if (v.startsWith('+98')) v = `0${v.slice(3)}`;
  else if (v.startsWith('0098')) v = `0${v.slice(4)}`;
  else if (v.startsWith('98') && v.length === 12) v = `0${v.slice(2)}`;
  return v;
}
