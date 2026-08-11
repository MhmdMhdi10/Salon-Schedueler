/**
 * Vitest global setup for component tests.
 *
 * Registers two matcher families on `expect`:
 *  - `@testing-library/jest-dom` DOM matchers (e.g. `toBeDisabled`,
 *    `toHaveAttribute`) via the dedicated vitest entry.
 *  - `vitest-axe` accessibility matcher (`toHaveNoViolations`) so component
 *    tests can assert no serious/critical axe violations.
 *
 * Wired via `vite.config.ts` → `test.setupFiles`. Living under `src/` keeps it
 * inside the tsconfig `rootDir` so `tsc` type-checks it during the build.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as axeMatchers from 'vitest-axe/matchers';
import 'vitest-axe/extend-expect';

expect.extend(axeMatchers);

// jsdom lacks a few browser globals that Radix primitives (Dialog, Tooltip,
// Select, Popover) rely on. Provide minimal no-op shims so they can mount.
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserver;
}

// IntersectionObserver is used by the infinite scroll hook and scroll-reveal
// animations. Provide a no-op shim so tests can mount components using it.
if (!('IntersectionObserver' in globalThis)) {
  class IntersectionObserver {
    constructor(private _cb: IntersectionObserverCallback) {}
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    get root(): Element | null {
      return null;
    }
    get rootMargin(): string {
      return '';
    }
    get thresholds(): ReadonlyArray<number> {
      return [];
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    IntersectionObserver;
}

type MatchMediaFn = (query: string) => MediaQueryList;

if (!('matchMedia' in window)) {
  (window as unknown as { matchMedia: MatchMediaFn }).matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as MatchMediaFn;
}

// Radix Select uses these layout APIs that jsdom does not implement.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Pragmatic drag and drop uses this hit-testing API while resolving the
// active drop target. jsdom does not implement layout hit testing.
if (!document.elementsFromPoint) {
  document.elementsFromPoint = () => [];
}

// Unmount React trees between tests so DOM state never leaks across cases.
afterEach(() => {
  cleanup();
});
