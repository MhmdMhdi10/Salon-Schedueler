/**
 * Shared helpers for the UI primitive component tests:
 *
 *  - `renderRtl` mounts a tree inside a `dir="rtl"` container (the app's real
 *    direction) so directional-iconography / mirroring behaviour is exercised
 *    the way it ships.
 *  - `expectNoSeriousA11yViolations` runs axe-core against a container and
 *    asserts — via `vitest-axe`'s `toHaveNoViolations` matcher — that there are
 *    no **serious** or **critical** violations. Minor/moderate findings (e.g.
 *    color-contrast that can't be computed in jsdom) are intentionally ignored
 *    so the gate stays meaningful and stable.
 */
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { expect } from 'vitest';
import type { AxeResults, RunOptions } from 'axe-core';

/** Impact levels that should fail an accessibility assertion. */
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/**
 * Renders `ui` inside a `dir="rtl"` wrapper and returns the RTL container plus
 * the usual Testing Library result. Use the returned `rtlContainer` for axe so
 * the audit sees the directional context.
 */
export function renderRtl(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult & { rtlContainer: HTMLElement } {
  const rtlContainer = document.createElement('div');
  rtlContainer.setAttribute('dir', 'rtl');
  document.body.appendChild(rtlContainer);
  const result = render(ui, { container: rtlContainer, ...options });
  return { ...result, rtlContainer };
}

/**
 * Audits the heading structure inside `container` for the WCAG 2.2 / SEO
 * heading expectations the accessibility pass requires (ui-ux §10, seo §2,
 * R10.3, R3.8):
 *
 *  - **exactly one `<h1>`** describing the page intent, and
 *  - **ordered headings with no skipped levels** (an `<h2>` may be followed by
 *    an `<h3>` but not an `<h5>`).
 *
 * Visually-hidden (`sr-only`) headings count — they are real headings in the
 * accessibility tree. The first heading encountered must be the `<h1>` so the
 * document starts at the top of the outline.
 *
 * Returns the ordered list of heading levels so callers can make extra
 * assertions if needed.
 */
export function expectSingleH1AndOrderedHeadings(container: Element): number[] {
  const headings = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const levels = headings.map((el) => Number(el.tagName[1]));

  // Exactly one <h1>.
  const h1Count = levels.filter((lvl) => lvl === 1).length;
  expect(h1Count, `expected exactly one <h1>, found ${h1Count}`).toBe(1);

  // The outline must open at the <h1> (no heading appears before it).
  if (levels.length > 0) {
    expect(levels[0], 'the first heading on the page must be the <h1>').toBe(1);
  }

  // No skipped levels: each heading is at most one level deeper than the
  // deepest level seen so far.
  let maxSeen = 0;
  for (const lvl of levels) {
    expect(
      lvl,
      `heading level h${lvl} skips a level (previous deepest was h${maxSeen})`,
    ).toBeLessThanOrEqual(maxSeen + 1);
    maxSeen = Math.max(maxSeen, lvl);
  }

  return levels;
}

/**
 * Runs axe against `container` and asserts there are no serious/critical
 * violations. Returns the raw results so callers can make extra assertions.
 *
 * `options` are forwarded to axe-core's run options. Pass e.g.
 * `{ iframes: false }` for trees that contain a lazy map embed: jsdom cannot
 * traverse into an `<iframe>` and axe throws "Respondable target must be a
 * frame in the current window" if it tries.
 */
export async function expectNoSeriousA11yViolations(
  container: Element,
  options?: RunOptions,
): Promise<AxeResults> {
  const results = (await axe(container, options)) as AxeResults;
  const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''));
  // `toHaveNoViolations` is registered on `expect` via `vitest-axe/matchers`
  // in the global test setup. Access it through a small typed shim so this
  // helper type-checks under `moduleResolution: bundler` without depending on
  // the ambient `Vi.Assertion` augmentation being visible here.
  const assertion = expect({
    ...results,
    violations: blocking,
  }) as unknown as { toHaveNoViolations: () => void };
  assertion.toHaveNoViolations();
  return results;
}
