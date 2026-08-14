import { useEffect, useState } from 'react';

/**
 * Reactive media query hook. Returns `true` when the viewport matches the
 * supplied CSS media query string (e.g. `(max-width: 767px)`). The value
 * updates live when the viewport changes (resize, device rotation).
 *
 * SSR-safe — returns `false` when `window.matchMedia` is unavailable.
 */
export function useMediaQuery(query: string): boolean {
  // Lazy-initialize from the live media query so the FIRST render already has
  // the correct value — initializing to `false` and correcting in an effect
  // made every desktop consumer (e.g. the owner shell) paint the mobile layout
  // for a frame on hard loads (visible layout jump / CLS). Still SSR-safe.
  const [matches, setMatches] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();

    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return matches;
}
