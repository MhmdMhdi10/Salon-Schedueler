import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { CityPage, ServicePage } from '../DiscoveryPages';
import { getCity, getServiceType } from '../../data/discovery';
import { getSalonsByCity, getSalonsByService } from '../../data/salons';
import { expectNoSeriousA11yViolations } from '../../test/a11y';
import { SITE_URL } from '../../components/seo';

/**
 * Tests for the public discovery pages — `/city/:city` and `/services/:type`
 * (task 5.3; R8.1, R8.4, R8.8; seo §1). These local/category pages must opt
 * **in** to indexing, carry a single `<h1>`, real differentiated content
 * (intro/body + matching salons, not a thin template), crawlable links to each
 * `/s/:slug` profile, and a `BreadcrumbList` JSON-LD. Unknown slugs render a
 * noindex "not found" surface.
 *
 * Requirements: 8.1, 8.4, 8.8
 */

function renderCity(slug = 'tehran') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/city/${slug}`]}>
        <Routes>
          <Route path="/city/:city" element={<CityPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

function renderService(slug = 'haircut') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/services/${slug}`]}>
        <Routes>
          <Route path="/services/:type" element={<ServicePage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

function head(selector: string): Element | null {
  return document.head.querySelector(selector);
}

function jsonLdTypes(): string[] {
  return Array.from(
    document.head.querySelectorAll('script[type="application/ld+json"]'),
  )
    .map((s) => JSON.parse(s.textContent!))
    .map((s) => s['@type']);
}

afterEach(() => {
  cleanup();
});

describe('CityPage (/city/:city)', () => {
  it('renders exactly one <h1> and a real city body (not thin)', () => {
    const { getByTestId } = renderCity();
    const root = getByTestId('city-page');
    expect(within(root).getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const city = getCity('tehran')!;
    expect(within(root).getByText(city.body)).toBeInTheDocument();
    // Neighborhoods are surfaced as real differentiated content (seo §11).
    for (const n of city.neighborhoods) {
      expect(within(root).getByText(n)).toBeInTheDocument();
    }
  });

  it('opts in to indexing with a self-referencing canonical (R8.1)', async () => {
    renderCity();
    await waitFor(() => {
      expect(head('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
      expect(head('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${SITE_URL}/city/tehran`,
      );
    });
  });

  it('emits a BreadcrumbList JSON-LD (R8.4)', async () => {
    renderCity();
    await waitFor(() => expect(jsonLdTypes()).toContain('BreadcrumbList'));
  });

  it('links to each matching salon profile with descriptive text (R8.8)', () => {
    const { getByTestId } = renderCity();
    const root = getByTestId('city-page');
    const salons = getSalonsByCity('tehran');
    expect(salons.length).toBeGreaterThan(0);
    const hrefs = within(root)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    for (const salon of salons) {
      expect(hrefs).toContain(`/s/${salon.slug}`);
    }
  });

  it('renders a noindex "not found" surface for an unknown city', async () => {
    const { getByTestId, queryByTestId } = renderCity('atlantis');
    expect(queryByTestId('city-page')).toBeNull();
    expect(getByTestId('discovery-not-found')).toBeInTheDocument();
    await waitFor(() => {
      expect(head('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    });
  });

  it('has no serious or critical accessibility violations', async () => {
    const { getByTestId } = renderCity();
    await expectNoSeriousA11yViolations(getByTestId('city-page'));
  });
});

describe('ServicePage (/services/:type)', () => {
  it('renders exactly one <h1>, the service body, and what it includes', () => {
    const { getByTestId } = renderService();
    const root = getByTestId('service-page');
    expect(within(root).getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const service = getServiceType('haircut')!;
    expect(within(root).getByText(service.body)).toBeInTheDocument();
    for (const item of service.includes) {
      expect(within(root).getByText(item)).toBeInTheDocument();
    }
  });

  it('opts in to indexing with a self-referencing canonical (R8.1)', async () => {
    renderService();
    await waitFor(() => {
      expect(head('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
      expect(head('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${SITE_URL}/services/haircut`,
      );
    });
  });

  it('emits a BreadcrumbList JSON-LD (R8.4)', async () => {
    renderService();
    await waitFor(() => expect(jsonLdTypes()).toContain('BreadcrumbList'));
  });

  it('links to each matching salon profile (R8.8)', () => {
    const { getByTestId } = renderService();
    const root = getByTestId('service-page');
    const salons = getSalonsByService('haircut');
    expect(salons.length).toBeGreaterThan(0);
    const hrefs = within(root)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    for (const salon of salons) {
      expect(hrefs).toContain(`/s/${salon.slug}`);
    }
  });

  it('renders a noindex "not found" surface for an unknown service', async () => {
    const { getByTestId, queryByTestId } = renderService('nonexistent');
    expect(queryByTestId('service-page')).toBeNull();
    expect(getByTestId('discovery-not-found')).toBeInTheDocument();
    await waitFor(() => {
      expect(head('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    });
  });

  it('has no serious or critical accessibility violations', async () => {
    const { getByTestId } = renderService();
    await expectNoSeriousA11yViolations(getByTestId('service-page'));
  });
});
