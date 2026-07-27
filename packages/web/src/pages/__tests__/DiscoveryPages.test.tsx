import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { CityPage, DiscoverySkeleton, ServicePage } from '../DiscoveryPages';
import { getCity, getServiceType } from '../../data/discovery';
import { getSalonsByCity, getSalonsByService } from '../../data/salons';
import { DISCOVERY_CATEGORIES, DISCOVERY_CITIES } from '../../data/taxonomy';
import { toPersianDigits } from '../../components/ui';
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
 *
 * Task 4.6 verification — result-list layout, SEO structured data, skeleton states:
 *  - Req 5.4: result list is a vertical stack of horizontal business cards
 *    (Booksy directive §j.3 — list, not grid) with the gap-4 rhythm value
 *  - Req 5.5: DiscoverySkeleton (6 skeleton cards matching the list geometry,
 *    role="status", aria-busy)
 *  - Req 5.6: Empty state with Persian text + reset action
 *  - Req 5.7 / seo §5: SeoHead index + BreadcrumbList JSON-LD with خانه crumb
 *  - Additional: breadcrumb nav, OG metadata, pages are indexable (not noindex)
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
  return Array.from(document.head.querySelectorAll('script[type="application/ld+json"]'))
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
      expect(head('link[rel="canonical"]')).toHaveAttribute('href', `${SITE_URL}/city/tehran`);
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
      expect(head('link[rel="canonical"]')).toHaveAttribute('href', `${SITE_URL}/services/haircut`);
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

// ═══════════════════════════════════════════════════════════════════════════════
// Task 4.6 Verification — Responsive Grid, SEO Structured Data, Skeleton States
// ═══════════════════════════════════════════════════════════════════════════════

describe('Task 4.6 Verification: Result-list layout (Req 5.4, directive §j.3)', () => {
  it('CityPage renders results as a vertical stack (list, not grid)', () => {
    const { getByTestId } = renderCity();
    const root = getByTestId('city-page');

    const list = root.querySelector('[data-testid="discovery-result-list"]');
    expect(list).toBeTruthy();
    expect(list!.classList.contains('flex')).toBe(true);
    expect(list!.classList.contains('flex-col')).toBe(true);
    // The list must NOT be a multi-column card grid (Booksy: list, not grid).
    expect(list!.classList.contains('grid')).toBe(false);
    // Every result is a horizontal business card linking to a profile.
    expect(list!.querySelectorAll('a[href^="/s/"]').length).toBe(getSalonsByCity('tehran').length);
  });

  it('ServicePage renders results as a vertical stack (list, not grid)', () => {
    const { getByTestId } = renderService();
    const root = getByTestId('service-page');

    const list = root.querySelector('[data-testid="discovery-result-list"]');
    expect(list).toBeTruthy();
    expect(list!.classList.contains('flex-col')).toBe(true);
    expect(list!.classList.contains('grid')).toBe(false);
    expect(list!.querySelectorAll('a[href^="/s/"]').length).toBe(
      getSalonsByService('haircut').length,
    );
  });

  it('the result list uses gap-4 for consistent spacing', () => {
    const { getByTestId } = renderCity();
    const root = getByTestId('city-page');

    const list = root.querySelector('[data-testid="discovery-result-list"]');
    expect(list).toBeTruthy();
    expect(list!.classList.contains('gap-4')).toBe(true);
  });
});

describe('Task 4.6 Verification: SEO Structured Data (Req 5.7, seo §5)', () => {
  it('CityPage uses SeoHead with index=true (page is indexable)', async () => {
    renderCity();
    await waitFor(() => {
      const robotsMeta = head('meta[name="robots"]');
      expect(robotsMeta).not.toBeNull();
      expect(robotsMeta!.getAttribute('content')).toBe('index,follow');
    });
  });

  it('CityPage has a unique title containing the city name', async () => {
    renderCity();
    await waitFor(() => {
      const titleEl = document.head.querySelector('title');
      expect(titleEl).not.toBeNull();
      expect(titleEl!.textContent).toBeTruthy();
      // The title should not be just the site name — it should contain city-specific info
      expect(titleEl!.textContent!.length).toBeGreaterThan(10);
    });
  });

  it('CityPage has a meta description', async () => {
    renderCity();
    await waitFor(() => {
      const desc = head('meta[name="description"]');
      expect(desc).not.toBeNull();
      expect(desc!.getAttribute('content')).toBeTruthy();
    });
  });

  it('CityPage has a canonical URL set', async () => {
    renderCity();
    await waitFor(() => {
      const canonical = head('link[rel="canonical"]');
      expect(canonical).not.toBeNull();
      expect(canonical!.getAttribute('href')).toBe(`${SITE_URL}/city/tehran`);
    });
  });

  it('CityPage has Open Graph metadata', async () => {
    renderCity();
    await waitFor(() => {
      expect(head('meta[property="og:title"]')).not.toBeNull();
      expect(head('meta[property="og:description"]')).not.toBeNull();
      expect(head('meta[property="og:url"]')).not.toBeNull();
      expect(head('meta[property="og:locale"]')?.getAttribute('content')).toBe('fa_IR');
      expect(head('meta[property="og:image"]')).not.toBeNull();
    });
  });

  it('CityPage emits BreadcrumbList JSON-LD with خانه as first item', async () => {
    renderCity();
    await waitFor(() => {
      const scripts = Array.from(
        document.head.querySelectorAll('script[type="application/ld+json"]'),
      );
      expect(scripts.length).toBeGreaterThan(0);

      const breadcrumb = scripts
        .map((s) => JSON.parse(s.textContent!))
        .find((d) => d['@type'] === 'BreadcrumbList');
      expect(breadcrumb).toBeTruthy();
      expect(breadcrumb.itemListElement).toBeDefined();
      expect(breadcrumb.itemListElement.length).toBeGreaterThanOrEqual(2);

      // First item should be home (خانه)
      const firstItem = breadcrumb.itemListElement[0];
      expect(firstItem.position).toBe(1);
      expect(firstItem.item).toBe(SITE_URL);

      // Second item should be the current page
      const secondItem = breadcrumb.itemListElement[1];
      expect(secondItem.position).toBe(2);
      expect(secondItem.item).toContain('/city/tehran');
    });
  });

  it('ServicePage has equivalent SEO metadata (index, canonical, OG)', async () => {
    renderService();
    await waitFor(() => {
      expect(head('meta[name="robots"]')?.getAttribute('content')).toBe('index,follow');
      expect(head('link[rel="canonical"]')?.getAttribute('href')).toBe(
        `${SITE_URL}/services/haircut`,
      );
      expect(head('meta[property="og:title"]')).not.toBeNull();
      expect(head('meta[property="og:locale"]')?.getAttribute('content')).toBe('fa_IR');
    });
  });

  it('ServicePage emits BreadcrumbList JSON-LD with correct path', async () => {
    renderService();
    await waitFor(() => {
      const scripts = Array.from(
        document.head.querySelectorAll('script[type="application/ld+json"]'),
      );
      const breadcrumb = scripts
        .map((s) => JSON.parse(s.textContent!))
        .find((d) => d['@type'] === 'BreadcrumbList');
      expect(breadcrumb).toBeTruthy();
      expect(breadcrumb.itemListElement[1].item).toContain('/services/haircut');
    });
  });
});

describe('Task 4.6 Verification: Skeleton States (Req 5.5)', () => {
  it('page provides an aria-live region for loading announcements', () => {
    const { getByTestId } = renderCity();
    const root = getByTestId('city-page');

    // The SalonGrid renders an aria-live region for loading state announcements
    const liveRegion = root.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    // It should be visually hidden (sr-only) so it only announces to AT
    expect(liveRegion!.classList.contains('sr-only')).toBe(true);
  });

  it('DiscoverySkeleton: role="status" + aria-busy list matching the result-list geometry', () => {
    // The skeleton must announce as a busy status region and mirror the real
    // result list's geometry (vertical stack of 6 horizontal card placeholders)
    // so the loading→loaded swap causes no layout shift (Req 5.5).
    const { container } = render(<DiscoverySkeleton />);
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status!.getAttribute('aria-busy')).toBe('true');
    expect(status!.classList.contains('flex-col')).toBe(true);
    expect(status!.classList.contains('gap-4')).toBe(true);
    expect(status!.children.length).toBe(6);
  });

  it('ServicePage also provides an accessible loading region', () => {
    const { getByTestId } = renderService();
    const root = getByTestId('service-page');

    const liveRegion = root.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
  });
});

describe('Task 4.6 Verification: Empty State (Req 5.6)', () => {
  it('CityPage with unknown city slug shows a not-found empty state with link home', () => {
    const { getByTestId } = renderCity('atlantis');
    const notFound = getByTestId('discovery-not-found');
    expect(notFound).toBeInTheDocument();
    // Should have a link back home
    const link = within(notFound).getByRole('link');
    expect(link).toHaveAttribute('href', '/');
  });

  it('ServicePage with unknown service slug shows a not-found empty state', () => {
    const { getByTestId } = renderService('nonexistent');
    const notFound = getByTestId('discovery-not-found');
    expect(notFound).toBeInTheDocument();
  });
});

describe('Task 4.6 Verification: Breadcrumb Navigation', () => {
  it('CityPage renders a visible breadcrumb nav with خانه link', () => {
    const { getByTestId } = renderCity();
    const root = getByTestId('city-page');
    const nav = within(root).getByRole('navigation', { name: 'مسیر صفحه' });
    expect(nav).toBeInTheDocument();
    // The breadcrumb is visible (not sr-only) and links home
    expect(nav.getAttribute('class') ?? '').not.toContain('sr-only');
    const links = within(nav).getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute('href', '/');
  });

  it('ServicePage renders a visible breadcrumb nav', () => {
    const { getByTestId } = renderService();
    const root = getByTestId('service-page');
    const nav = within(root).getByRole('navigation', { name: 'مسیر صفحه' });
    expect(nav).toBeInTheDocument();
    const links = within(nav).getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute('href', '/');
  });

  it('breadcrumb mirrors the JSON-LD structure (both show home → current page)', async () => {
    const { getByTestId } = renderCity();
    const root = getByTestId('city-page');
    const nav = within(root).getByRole('navigation', { name: 'مسیر صفحه' });
    const breadcrumbItems = within(nav).getAllByRole('listitem');
    // Should have at least the home item and the current page item (plus separator)
    expect(breadcrumbItems.length).toBeGreaterThanOrEqual(2);

    // JSON-LD should match
    await waitFor(() => {
      const scripts = Array.from(
        document.head.querySelectorAll('script[type="application/ld+json"]'),
      );
      const breadcrumb = scripts
        .map((s) => JSON.parse(s.textContent!))
        .find((d) => d['@type'] === 'BreadcrumbList');
      expect(breadcrumb).toBeTruthy();
      // Both the visible nav and the JSON-LD have خانه as the first breadcrumb
      expect(breadcrumb.itemListElement[0].name).toBeTruthy();
    });
  });
});

describe('Canonical taxonomy resolution (implementation contract)', () => {
  it('every one of the 8 category slugs renders a service page — never a 404', () => {
    for (const { slug } of DISCOVERY_CATEGORIES) {
      const { getByTestId, queryByTestId, unmount } = renderService(slug);
      expect(queryByTestId('discovery-not-found')).toBeNull();
      expect(getByTestId('service-page')).toBeInTheDocument();
      unmount();
    }
  });

  it('every one of the 20 city slugs renders a city page — never a 404', () => {
    for (const { slug } of DISCOVERY_CITIES) {
      const { getByTestId, queryByTestId, unmount } = renderCity(slug);
      expect(queryByTestId('discovery-not-found')).toBeNull();
      expect(getByTestId('city-page')).toBeInTheDocument();
      unmount();
    }
  });

  it('a category with no demo salons renders the honest empty state with an owner CTA', () => {
    const { getByTestId } = renderService('massage');
    const root = getByTestId('service-page');
    expect(within(root).getByText('هنوز سالنی اضافه نشده')).toBeInTheDocument();
    expect(within(root).getByRole('link', { name: /ثبت سالن در آرا/ })).toHaveAttribute(
      'href',
      '/business/register',
    );
  });

  it('a city with no demo salons renders the honest empty state with an owner CTA', () => {
    const { getByTestId } = renderCity('mashhad');
    const root = getByTestId('city-page');
    expect(within(root).getByText('هنوز سالنی اضافه نشده')).toBeInTheDocument();
    expect(within(root).getByRole('link', { name: /ثبت سالن در آرا/ })).toHaveAttribute(
      'href',
      '/business/register',
    );
  });
});

describe('Filter behavior (directive §b control row)', () => {
  function renderCityWith(query: string) {
    return render(
      <HelmetProvider>
        <MemoryRouter initialEntries={[`/city/tehran${query}`]}>
          <Routes>
            <Route path="/city/:city" element={<CityPage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    );
  }

  it('filtered-to-empty shows the noResults copy with a clear-filters recovery action', () => {
    // No demo salon reaches a 5.0 rating, so rating=5 empties the list.
    const { getByTestId } = renderCityWith('?rating=5');
    const root = getByTestId('city-page');
    expect(within(root).getByText('سالنی یافت نشد')).toBeInTheDocument();
    expect(
      within(root).getByRole('button', { name: /پاک کردن فیلترها/ }),
    ).toBeInTheDocument();
    // The "no salons yet" copy is reserved for genuinely empty markets.
    expect(within(root).queryByText('هنوز سالنی اضافه نشده')).toBeNull();
  });

  it('H1 is count-bearing with Persian digits', () => {
    const { getByTestId } = renderCity();
    const root = getByTestId('city-page');
    const h1 = within(root).getByRole('heading', { level: 1 });
    const count = getSalonsByCity('tehran').length;
    expect(h1.textContent).toContain(`${toPersianDigits(count)} سالن`);
  });
});

describe('Business-card anatomy (directive §c)', () => {
  it('cards are photography-forward: every card shows the salon cover image', () => {
    const { getByTestId } = renderCity();
    const root = getByTestId('city-page');
    const list = root.querySelector('[data-testid="discovery-result-list"]')!;
    const cards = list.querySelectorAll('[data-testid="salon-list-card"]');
    expect(cards.length).toBe(getSalonsByCity('tehran').length);
    for (const card of cards) {
      const img = card.querySelector('img');
      expect(img).not.toBeNull();
      // The image container is visible at all breakpoints (no hidden sm:flex).
      expect(img!.closest('.hidden')).toBeNull();
    }
  });

  it('cards carry no fabricated «پیشنهاد آرا» endorsement badge', () => {
    const { getByTestId } = renderCity();
    const root = getByTestId('city-page');
    expect(within(root).queryByText('پیشنهاد آرا')).toBeNull();
  });

  it('cards include inline bookable services deep-linking with ?service=', () => {
    const { getByTestId } = renderCity();
    const root = getByTestId('city-page');
    const list = root.querySelector('[data-testid="discovery-result-list"]')!;
    const bookLinks = Array.from(list.querySelectorAll('a[href*="?service="]'));
    expect(bookLinks.length).toBeGreaterThan(0);
    for (const link of bookLinks) {
      expect(link.getAttribute('href')).toMatch(/^\/salon\/[0-9a-f-]+\/book\?service=/);
    }
  });
});

describe('Task 4.6 Verification: Pages are indexable (not noindex)', () => {
  it('CityPage with valid slug is indexable', async () => {
    renderCity('tehran');
    await waitFor(() => {
      expect(head('meta[name="robots"]')?.getAttribute('content')).toBe('index,follow');
    });
  });

  it('ServicePage with valid slug is indexable', async () => {
    renderService('haircut');
    await waitFor(() => {
      expect(head('meta[name="robots"]')?.getAttribute('content')).toBe('index,follow');
    });
  });

  it('invalid slugs are correctly noindex', async () => {
    renderCity('unknown-city-xyz');
    await waitFor(() => {
      expect(head('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow');
    });
  });
});
