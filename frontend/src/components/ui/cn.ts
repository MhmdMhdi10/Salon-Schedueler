/**
 * Tiny className combiner: filters falsy values and joins with a space.
 *
 * Kept dependency-free (no `clsx`) so the primitive layer stays lean. Accepts
 * the common conditional-class shapes: strings, falsy values, and arrays.
 */
export type ClassValue = string | number | bigint | null | false | undefined | ClassValue[];

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      const nested = cn(...value);
      if (nested) out.push(nested);
    } else {
      out.push(String(value));
    }
  }
  return out.join(' ');
}
