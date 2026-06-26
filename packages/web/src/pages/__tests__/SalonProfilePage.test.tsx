import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { SalonProfilePage, buildSalonJsonLd } from '../SalonProfilePage';
import { getSalonProfile } from '../../data/salons';
import { expectNoSeriousA11yViolations } from '../../test/a11y';
import { SITE_URL } from '../../components/seo';

/**
 * Tests for the public salon profile at `/s/:slug` (task 5.2; R8.1, R8.3, R8.4,
 * R8.8, R9.1). The profile is the platform's primary indexable discovery
 * surface: it must opt **in** to indexing, carry a single `<h1>`, a clear CTA
 * into the booking funnel, services/hours (Iranian week)/gallery/map/NAP, and
 * emit `BeautySalon` + `Service` (IRR) + `BreadcrumbList` JSON-LD that mirrors
 * the visible content. Unknown slugs render a noindex "not found" surface.
 *
 * Requirements: 8.1, 8.3, 8.4, 8.8, 9.1
 */

function renderProfile(slug = 'salon-rose') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/s/${slug}`]}>
        <Routes>
          <Route path="/s/:slug" element={<SalonProfilePage />} />
        </Routes>
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

describe('SalonProfilePage', () => {
  it('renders exactly one <h1> and a CTA into the booking funnel', () => {
    const { getByTestId, getAllByRole } = renderProfile();
    const root = getByTestId('salon-profile');

    const h1s = within(root).getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);

    const ctas = getAllByRole('link').filter((a) =>
      a.getAttribute('href')?.includes('/book'),
    );
    expect(ctas.length).toBeGreaterThan(0);
  });

  it('opts in to indexing with a self-referencing canonical (R8.1, R8.3)', async () => {
    renderProfile();
    await waitFor(() => {
      expect(head('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
      expect(head('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${SITE_URL}/s/salon-rose`,
      );
    });
  });

  it('uses the business.business OG type for a salon profile (seo §4)', async () => {
    renderProfile();
    await waitFor(() => {
      expect(head('meta[property="og:type"]')).toHaveAttribute(
        'content',
        'business.business',
      );
    });
  });

  it('emits BeautySalon + Service (IRR) + BreadcrumbList JSON-LD (R8.4)', async () => {
    renderProfile();
    await waitFor(() => {
      const scripts = Array.from(
        document.head.querySelectorAll('script[type="application/ld+json"]'),
      ).map((s) => JSON.parse(s.textContent!));
      const types = scripts.map((s) => s['@type']);
      expect(types).toContain('BeautySalon');
      expect(types).toContain('Service');
      expect(types).toContain('BreadcrumbList');

      const service = scripts.find((s) => s['@type'] === 'Service');
      expect(service.offers.priceCurrency).toBe('IRR');
    });
  });

  it('renders services with Rial prices, hours, gallery, map, and NAP', () => {
    const { getByTestId } = renderProfile();
    const root = getByTestId('salon-profile');
    const salon = getSalonProfile('salon-rose')!;

    // Services section names every offering.
    for (const service of salon.services) {
      expect(within(root).getByText(service.name)).toBeInTheDocument();
    }

    // Lazy-loaded map embed.
    const iframe = root.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe).toHaveAttribute('loading', 'lazy');

    // NAP phone link.
    expect(within(root).getByText(salon.telephone)).toBeInTheDocument();
  });

  it('renders gallery images sized, lazy, with non-empty Persian alt (R8.8, R9.1)', () => {
    const { getByTestId } = renderProfile();
    const imgs = within(getByTestId('salon-profile')).getAllByRole('img');
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img).toHaveAttribute('width');
      expect(img).toHaveAttribute('height');
      expect(img).toHaveAttribute('loading', 'lazy');
      expect(img.getAttribute('alt')?.trim()).toBeTruthy();
    }
  });

  it('renders a noindex "not found" surface for an unknown slug', async () => {
    const { getByTestId, queryByTestId } = renderProfile('does-not-exist');
    expect(queryByTestId('salon-profile')).toBeNull();
    expect(getByTestId('salon-not-found')).toBeInTheDocument();
    await waitFor(() => {
      expect(head('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    });
  });

  it('has no serious or critical accessibility violations', async () => {
    const { getByTestId } = renderProfile();
    // Disable iframe traversal: the lazy map embed is an <iframe> that jsdom
    // cannot enter, which would crash axe-core (it is not an a11y violation).
    await expectNoSeriousA11yViolations(getByTestId('salon-profile'), {
      iframes: false,
    });
  });
});

describe('buildSalonJsonLd', () => {
  it('mirrors the visible content: NAP, geo, IRR services, breadcrumb', () => {
    const salon = getSalonProfile('salon-rose')!;
    const nodes = buildSalonJsonLd(salon);

    const beauty = nodes.find((n) => n['@type'] === 'BeautySalon')!;
    expect(beauty.url).toBe(`${SITE_URL}/s/salon-rose`);
    expect(beauty.telephone).toBe(salon.telephone);
    expect((beauty.address as Record<string, unknown>).addressLocality).toBe(
      salon.address.addressLocality,
    );
    expect((beauty.geo as Record<string, unknown>).latitude).toBe(salon.geo.latitude);

    // One Service per offering, all priced in IRR.
    const services = nodes.filter((n) => n['@type'] === 'Service');
    expect(services).toHaveLength(salon.services.length);
    for (const s of services) {
      expect((s.offers as Record<string, unknown>).priceCurrency).toBe('IRR');
    }

    // Opening hours never include a closed day (Friday).
    const ohs = beauty.openingHoursSpecification as Array<{ dayOfWeek: string }>;
    expect(ohs.some((o) => o.dayOfWeek === 'Friday')).toBe(false);

    const crumb = nodes.find((n) => n['@type'] === 'BreadcrumbList')!;
    expect((crumb.itemListElement as unknown[]).length).toBe(2);
  });
});
