import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { SearchPage } from '../SearchPage';
import { getAllSalonProfiles } from '../../data/salons';

/**
 * `/search` functional contract (route contract: home hero submits
 * `/search?q=<query>`, empty q allowed):
 *  - empty q lists every demo salon;
 *  - q filters by salon/service text;
 *  - no matches → honest empty state with an owner-registration CTA;
 *  - noindex (search results must not be indexed).
 */

afterEach(cleanup);

function renderSearch(query = '') {
  const path = query ? `/search?q=${encodeURIComponent(query)}` : '/search';
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('SearchPage', () => {
  it('is noindex (search results are never a search target)', async () => {
    renderSearch();
    await waitFor(() =>
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex,follow',
      ),
    );
  });

  it('lists every demo salon when q is empty', () => {
    renderSearch();
    const salons = getAllSalonProfiles();
    expect(salons.length).toBeGreaterThan(0);
    for (const salon of salons) {
      expect(
        screen.getByRole('link', { name: new RegExp(salon.displayName ?? salon.name) }),
      ).toHaveAttribute('href', `/s/${salon.slug}`);
    }
  });

  it('filters the list by the q param', () => {
    const [first] = getAllSalonProfiles();
    renderSearch(first.name);
    // The matching salon is present…
    expect(
      screen.getByRole('link', { name: new RegExp(first.displayName ?? first.name) }),
    ).toBeInTheDocument();
    // …and at least one non-matching salon is filtered out.
    const links = screen.getAllByRole('link');
    const salonLinks = links.filter((l) => l.getAttribute('href')?.startsWith('/s/'));
    expect(salonLinks.length).toBeLessThan(getAllSalonProfiles().length);
  });

  it('renders an honest empty state with an owner-registration CTA when nothing matches', () => {
    renderSearch('zzz-هیچ-نتیجه-ای');
    expect(screen.getByText(/نتیجه‌ای پیدا نشد/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ثبت سالن در آرا/ })).toHaveAttribute(
      'href',
      '/business/register',
    );
  });

  it('re-submitting the form updates the q param and the results', () => {
    renderSearch();
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'zzz-هیچ-نتیجه-ای' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(screen.getByText(/نتیجه‌ای پیدا نشد/)).toBeInTheDocument();
  });
});
