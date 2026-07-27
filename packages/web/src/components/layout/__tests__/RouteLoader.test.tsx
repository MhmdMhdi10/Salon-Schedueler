import { describe, it, expect } from 'vitest';
import { lazy, Suspense } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { RouteLoader, ROUTE_LOADER_TESTID } from '..';
import '../../../i18n';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Tests for the route-level loading UI used as the `<Suspense>` fallback while
 * lazily-loaded route chunks download.
 * Requirements: 3.7, 9.3
 */

describe('RouteLoader', () => {
  it('renders a polite, busy live region with an accessible name', () => {
    render(<RouteLoader />);
    const loader = screen.getByTestId(ROUTE_LOADER_TESTID);
    expect(loader).toHaveAttribute('role', 'status');
    expect(loader).toHaveAttribute('aria-busy', 'true');
    expect(loader).toHaveAttribute('aria-live', 'polite');
    expect(loader).toHaveAccessibleName('در حال بارگذاری صفحه...');
  });

  it('reserves layout with a min-height so there is no layout shift (CLS)', () => {
    render(<RouteLoader />);
    const loader = screen.getByTestId(ROUTE_LOADER_TESTID);
    // The reserved-space utility keeps the loader's footprint close to the
    // routed page it replaces.
    expect(loader.className).toContain('min-h-[60vh]');
  });

  it('exposes the loader as the Suspense fallback and then swaps in the route', async () => {
    const LazyPage = lazy(() =>
      Promise.resolve({
        default: () => <p data-testid="lazy-page">صفحه</p>,
      }),
    );

    render(
      <Suspense fallback={<RouteLoader />}>
        <LazyPage />
      </Suspense>,
    );

    // Fallback shows first.
    expect(screen.getByTestId(ROUTE_LOADER_TESTID)).toBeInTheDocument();

    // Then the resolved chunk replaces it.
    await waitFor(() => expect(screen.getByTestId('lazy-page')).toBeInTheDocument());
    expect(screen.queryByTestId(ROUTE_LOADER_TESTID)).not.toBeInTheDocument();
  });

  it('marks the decorative skeleton blocks as hidden from assistive tech', () => {
    render(<RouteLoader />);
    const loader = screen.getByTestId(ROUTE_LOADER_TESTID);
    const hidden = within(loader)
      .getAllByRole('generic', { hidden: true })
      .filter((el) => el.getAttribute('aria-hidden') === 'true');
    expect(hidden.length).toBeGreaterThan(0);
  });

  it('has no serious/critical a11y violations in RTL', async () => {
    const { rtlContainer } = renderRtl(<RouteLoader />);
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
