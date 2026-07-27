import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { NotFoundPage } from '../NotFoundPage';
import { DISCOVERY_CATEGORIES } from '../../data/taxonomy';

/**
 * Catch-all 404 page (route contract): noindex, one h1, search-first recovery
 * that submits to `/search?q=…`, a home link, and category links that come
 * from the canonical taxonomy (so a 404 can never link to another 404).
 */

afterEach(cleanup);

function renderAt(path = '/definitely/not/a/route') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<NotFoundPage />} />
          <Route path="/search" element={<p data-testid="search-route">نتایج</p>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('NotFoundPage', () => {
  it('emits noindex,follow (a soft-404 must never be indexed)', async () => {
    renderAt();
    await waitFor(() =>
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex,follow',
      ),
    );
  });

  it('renders exactly one h1 and a home link', () => {
    renderAt();
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(screen.getByRole('link', { name: /بازگشت به خانه/ })).toHaveAttribute('href', '/');
  });

  it('links every canonical category to its /services/:slug page', () => {
    renderAt();
    for (const { slug, label } of DISCOVERY_CATEGORIES) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute(
        'href',
        `/services/${slug}`,
      );
    }
  });

  it('submitting the search form navigates to /search with the query', () => {
    renderAt();
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'ناخن' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(screen.getByTestId('search-route')).toBeInTheDocument();
  });
});
