import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { MarketingHome } from '../MarketingHome';
import { expectNoSeriousA11yViolations } from '../../test/a11y';
import { SITE_URL } from '../../components/seo';

/**
 * Tests for the public marketing home at `/` (task 5.1; R8.1, R8.2, R8.3, R8.8,
 * R9.1, R9.4). The home is the platform's primary indexable surface: it must
 * opt **in** to indexing, emit unique title/description + canonical + JSON-LD,
 * carry a single `<h1>` and crawlable trust/legal links. The hero uses a CSS
 * gradient background (no image dependency) for a NYC noir aesthetic.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.8, 9.1, 9.4
 */

function renderHome() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/']}>
        <MarketingHome />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

function head(selector: string): Element | null {
  return document.head.querySelector(selector);
}

afterEach(() => {
  cleanup();
});

describe('MarketingHome', () => {
  it('renders the hero with exactly one <h1> and a primary CTA into the funnel', async () => {
    const { getByTestId, getAllByRole } = renderHome();
    const root = getByTestId('marketing-home');

    const h1s = within(root).getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);

    // Primary CTA links to the auth/booking entry point.
    const ctas = getAllByRole('link').filter(
      (a) => a.getAttribute('href') === '/auth',
    );
    expect(ctas.length).toBeGreaterThan(0);
  });

  it('opts in to indexing with index,follow (R8.2, R8.7)', async () => {
    renderHome();
    await waitFor(() => {
      expect(head('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
    });
  });

  it('emits a unique title, description, and self-referencing home canonical (R8.2, R8.3)', async () => {
    renderHome();
    await waitFor(() => {
      expect(document.title).toContain('رزرو سالن');
      expect(head('meta[name="description"]')?.getAttribute('content')).toBeTruthy();
      // The home canonical collapses to the bare host.
      expect(head('link[rel="canonical"]')).toHaveAttribute('href', SITE_URL);
    });
  });

  it('injects WebSite + Organization JSON-LD (R8.3; seo §5)', async () => {
    renderHome();
    await waitFor(() => {
      const scripts = Array.from(
        document.head.querySelectorAll('script[type="application/ld+json"]'),
      ).map((s) => JSON.parse(s.textContent!));
      const types = scripts.map((s) => s['@type']);
      expect(types).toContain('WebSite');
      expect(types).toContain('Organization');
    });
  });

  it('renders the hero as a light marketplace section (no image, search-focused)', () => {
    const { getByTestId } = renderHome();
    // The hero uses bg-bg (light warm cream) and contains a search form.
    const root = getByTestId('marketing-home');
    const heroSection = root.querySelector('section');
    expect(heroSection).not.toBeNull();
    expect(heroSection!.className).toContain('bg-bg');
    // No hero image — the search bar is the primary interaction.
    const heroImg = heroSection!.querySelector('img');
    expect(heroImg).toBeNull();
    // Has a search form
    const form = heroSection!.querySelector('form');
    expect(form).not.toBeNull();
  });

  it('hero search button and icons are marked aria-hidden where decorative', () => {
    const { getByTestId } = renderHome();
    const root = getByTestId('marketing-home');
    const heroSection = root.querySelector('section');
    const decorativeLayers = heroSection!.querySelectorAll('[aria-hidden="true"]');
    // At least the search icon is decorative
    expect(decorativeLayers.length).toBeGreaterThanOrEqual(1);
  });

  it('exposes crawlable trust/legal links (R8.8)', () => {
    const { getAllByRole } = renderHome();
    const hrefs = getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(
      expect.arrayContaining(['/about', '/contact', '/privacy', '/terms']),
    );
  });

  it('has no serious or critical accessibility violations', async () => {
    const { getByTestId } = renderHome();
    await expectNoSeriousA11yViolations(getByTestId('marketing-home'));
  });
});
