import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { SalonProfilePage, buildSalonJsonLd } from '../SalonProfilePage';
import { getSalonProfile, getAllSalonProfiles } from '../../data/salons';
import { expectNoSeriousA11yViolations } from '../../test/a11y';
import { SITE_URL, OG_LOCALE } from '../../components/seo';

/**
 * Tests for the public salon profile at `/s/:slug` (task 5.2; R8.1, R8.3, R8.4,
 * R8.8, R9.1). The profile is the platform's primary indexable discovery
 * surface: it must opt **in** to indexing, carry a single `<h1>`, a clear CTA
 * into the booking funnel, services/hours (Iranian week)/gallery/map/NAP, and
 * emit `BeautySalon` + `Service` (IRR) + `BreadcrumbList` JSON-LD that mirrors
 * the visible content. `aggregateRating` may exist ONLY when the on-page
 * reviews back it (contract §content-honesty). Unknown slugs render a noindex
 * "not found" surface after the QR-resolve attempt settles.
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

    const ctas = getAllByRole('link').filter((a) => a.getAttribute('href')?.includes('/book'));
    expect(ctas.length).toBeGreaterThan(0);
  });

  it('per-service Book buttons preserve the chosen service (?service=)', () => {
    const { getByTestId } = renderProfile();
    const root = getByTestId('salon-profile');
    const salon = getSalonProfile('salon-rose')!;

    const serviceLinks = within(root)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => href.includes('?service='));
    expect(serviceLinks.length).toBe(salon.services.length);
    for (const service of salon.services) {
      expect(serviceLinks).toContain(
        `/salon/${salon.bookingSalonId}/book?service=${encodeURIComponent(service.id)}`,
      );
    }
  });

  it('opts in to indexing with a self-referencing canonical (R8.1, R8.3)', async () => {
    renderProfile();
    await waitFor(() => {
      expect(head('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
      expect(head('link[rel="canonical"]')).toHaveAttribute('href', `${SITE_URL}/s/salon-rose`);
    });
  });

  it('uses the business.business OG type for a salon profile (seo §4)', async () => {
    renderProfile();
    await waitFor(() => {
      expect(head('meta[property="og:type"]')).toHaveAttribute('content', 'business.business');
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

  it('renders services with Rial prices, hours, reviews, map affordance, and NAP', () => {
    const { getByTestId } = renderProfile();
    const root = getByTestId('salon-profile');
    const salon = getSalonProfile('salon-rose')!;

    // Services section names every offering.
    for (const service of salon.services) {
      expect(within(root).getAllByText(service.name).length).toBeGreaterThan(0);
    }

    // Reviews are real, on-page content backing the displayed rating.
    for (const review of salon.reviews ?? []) {
      expect(within(root).getByText(review.body)).toBeInTheDocument();
    }

    // The map loads behind an explicit affordance (no dead placeholder).
    expect(within(root).getByRole('button', { name: /نقشه/ })).toBeInTheDocument();

    // NAP phone link.
    expect(within(root).getByText(salon.telephone)).toBeInTheDocument();
  });

  it('renders the salon gallery (own images) sized, lazy, with Persian alt (R8.8, R9.1)', () => {
    const { getByTestId } = renderProfile();
    const root = getByTestId('salon-profile');
    const salon = getSalonProfile('salon-rose')!;

    const header = root.querySelector('header')!;
    const galleryImgs = Array.from(header.querySelectorAll('img'));
    expect(galleryImgs.length).toBeGreaterThanOrEqual(3);

    const sources = galleryImgs.map((img) => img.getAttribute('src'));
    // The mosaic renders the salon's OWN gallery — never shared stock photos.
    for (const src of sources) {
      expect(salon.gallery.some((image) => image.src === src)).toBe(true);
    }

    for (const [index, img] of galleryImgs.entries()) {
      expect(img).toHaveAttribute('width');
      expect(img).toHaveAttribute('height');
      // First tile is the LCP candidate (eager); the rest stay lazy.
      expect(img.getAttribute('loading')).toBe(index === 0 ? 'eager' : 'lazy');
      expect(img.getAttribute('alt')?.trim()).toBeTruthy();
    }
  });

  it('shows a neutral pending state, then a noindex "not found" for an unknown slug', async () => {
    const { getByTestId, queryByTestId } = renderProfile('does-not-exist');
    expect(queryByTestId('salon-profile')).toBeNull();
    // While the QR-resolve request is in flight there is NO «یافت نشد» flash.
    expect(queryByTestId('salon-not-found')).toBeNull();
    expect(getByTestId('salon-resolving')).toBeInTheDocument();
    // Once the resolve attempt fails, the honest not-found surface appears.
    await waitFor(() => {
      expect(getByTestId('salon-not-found')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(head('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    });
  });

  it('has no serious or critical accessibility violations', async () => {
    const { getByTestId } = renderProfile();
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
    expect((crumb.itemListElement as unknown[]).length).toBe(3);
  });

  it('emits aggregateRating ONLY when on-page reviews back it, and the numbers agree', () => {
    for (const salon of getAllSalonProfiles()) {
      const nodes = buildSalonJsonLd(salon);
      const business = nodes.find(
        (n) => n['@type'] === 'BeautySalon' || n['@type'] === 'HairSalon',
      )!;
      const reviews = salon.reviews ?? [];
      if (reviews.length === 0) {
        expect(business.aggregateRating).toBeUndefined();
        expect(business.review).toBeUndefined();
        continue;
      }
      const agg = business.aggregateRating as Record<string, string>;
      expect(agg).toBeDefined();
      // Displayed/emitted rating must equal the average of the visible reviews.
      const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      expect(Number(agg.ratingValue)).toBeCloseTo(Math.round(average * 10) / 10, 5);
      expect(Number(agg.reviewCount)).toBe(reviews.length);
      expect((business.review as unknown[]).length).toBe(reviews.length);
    }
  });
});

/* ─── Responsive, RTL, SEO indexable, gallery lightbox ─────────────────── */

describe('SalonProfilePage — Responsive behavior', () => {
  it('photo mosaic header uses the directive heights (h-64, sm:h-80) with a 2×2 lead tile', () => {
    const { getByTestId } = renderProfile();
    const root = getByTestId('salon-profile');
    const header = root.querySelector('header');
    expect(header).not.toBeNull();
    const mosaic = header!.querySelector('.grid');
    expect(mosaic).not.toBeNull();
    const cls = mosaic!.getAttribute('class') ?? '';
    expect(cls).toContain('h-64');
    expect(cls).toContain('sm:h-80');
    expect(cls).toContain('rounded-2xl');
    // Lead tile spans 2×2 (directive §j.1).
    const lead = mosaic!.querySelector('.col-span-2.row-span-2');
    expect(lead).not.toBeNull();
  });

  it('content has no horizontal overflow — max-w-container constrains the page', () => {
    const { getByTestId } = renderProfile();
    const root = getByTestId('salon-profile');
    const cls = root.getAttribute('class') ?? '';
    expect(cls).toContain('max-w-container');
  });

  it('the booking CTA never disappears: sticky bar below lg, sidebar from lg', () => {
    const { getByTestId } = renderProfile();
    const root = getByTestId('salon-profile');

    // Sticky bottom bar: hidden from lg up (where the sidebar takes over) —
    // NOT md:hidden, which left tablets with no CTA at all.
    const stickyBar = root.querySelector('.fixed.inset-x-0.bottom-0');
    expect(stickyBar).not.toBeNull();
    const stickyClasses = stickyBar!.getAttribute('class') ?? '';
    expect(stickyClasses).toContain('lg:hidden');
    expect(stickyClasses).not.toContain('md:hidden');
    // Safe-area aware (steering §5): bottom padding clears the home indicator.
    expect(stickyClasses).toContain('safe-area-inset-bottom');
    expect(stickyBar!.querySelector('a[href*="/book"]')).not.toBeNull();

    // The sidebar booking card appears exactly where the bar hides.
    const aside = root.querySelector('aside');
    expect(aside).not.toBeNull();
    expect(aside!.getAttribute('class') ?? '').toContain('lg:block');
  });
});

describe('SalonProfilePage — RTL correctness', () => {
  it('layout uses logical properties — no physical left/right positioning classes', () => {
    const { getByTestId } = renderProfile();
    const root = getByTestId('salon-profile');
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/\bleft-\d/);
      expect(cls).not.toMatch(/\bright-\d/);
      expect(cls).not.toContain('text-left');
    }
  });

  it('renders a visible breadcrumb with the ‹ separator and a home link', () => {
    const { getByTestId } = renderProfile();
    const root = getByTestId('salon-profile');
    const breadcrumb = root.querySelector('nav[aria-label]');
    expect(breadcrumb).not.toBeNull();
    expect(breadcrumb!.textContent).toContain('‹');
    // Not sr-only — the breadcrumb is a visible wayfinding affordance.
    expect(breadcrumb!.getAttribute('class') ?? '').not.toContain('sr-only');
    const homeLink = within(breadcrumb as HTMLElement).getAllByRole('link')[0];
    expect(homeLink).toHaveAttribute('href', '/');
  });
});

describe('SalonProfilePage — SEO indexable', () => {
  it('OG metadata includes locale fa_IR, title, and description', async () => {
    const salon = getSalonProfile('salon-rose')!;
    renderProfile();
    await waitFor(() => {
      expect(head('meta[property="og:locale"]')).toHaveAttribute('content', OG_LOCALE);
      expect(head('meta[property="og:title"]')).not.toBeNull();
      expect(head('meta[property="og:title"]')!.getAttribute('content')).toContain(salon.name);
    });
  });

  it('OG image is present for the salon profile', async () => {
    renderProfile();
    await waitFor(() => {
      const ogImage = head('meta[property="og:image"]');
      expect(ogImage).not.toBeNull();
      expect(ogImage!.getAttribute('content')).toBeTruthy();
    });
  });

  it('JSON-LD includes BeautySalon, Service, and BreadcrumbList types', () => {
    const salon = getSalonProfile('salon-rose')!;
    const nodes = buildSalonJsonLd(salon);
    const types = nodes.map((n) => n['@type']);
    expect(types).toContain('BeautySalon');
    expect(types).toContain('Service');
    expect(types).toContain('BreadcrumbList');
  });

  it('uses HairSalon type for barbershops (آرایشگاه مردانه)', () => {
    const salon = getSalonProfile('shahin-barbershop')!;
    const nodes = buildSalonJsonLd(salon);
    const types = nodes.map((n) => n['@type']);
    expect(types).toContain('HairSalon');
    expect(types).not.toContain('BeautySalon');
    const service = nodes.find((n) => n['@type'] === 'Service')!;
    expect((service.provider as Record<string, unknown>)['@type']).toBe('HairSalon');
  });

  it('the single <h1> contains the salon name', () => {
    const { getByTestId } = renderProfile();
    const root = getByTestId('salon-profile');
    const salon = getSalonProfile('salon-rose')!;
    const h1 = within(root).getByRole('heading', { level: 1 });
    expect(h1.textContent).toContain(salon.displayName ?? salon.name);
  });

  it('the h1 precedes every h2 in DOM order (logical heading structure)', () => {
    const { getByTestId } = renderProfile();
    const root = getByTestId('salon-profile');
    const headings = Array.from(root.querySelectorAll('h1, h2'));
    expect(headings.length).toBeGreaterThan(1);
    expect(headings[0].tagName.toLowerCase()).toBe('h1');
  });
});

describe('SalonProfilePage — Gallery lightbox', () => {
  it('«نمایش همه تصاویر» opens a dialog with the accessible carousel', async () => {
    const { getByTestId, getByRole } = renderProfile();
    const root = getByTestId('salon-profile');
    const salon = getSalonProfile('salon-rose')!;

    const openButton = within(root).getByRole('button', { name: /نمایش همه تصاویر/ });
    fireEvent.click(openButton);

    // Radix dialog portal: full ARIA carousel pattern inside a modal.
    const dialog = await waitFor(() => getByRole('dialog'));
    const carousel = dialog.querySelector('[role="region"][aria-roledescription="carousel"]');
    expect(carousel).not.toBeNull();

    const tabs = within(dialog).getAllByRole('tab');
    expect(tabs).toHaveLength(salon.gallery.length);
    expect(within(dialog).getByLabelText('تصویر قبلی')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('تصویر بعدی')).toBeInTheDocument();
  });

  it('tapping a mosaic tile opens the lightbox at that image', async () => {
    const { getByTestId, getByRole } = renderProfile();
    const root = getByTestId('salon-profile');
    const salon = getSalonProfile('salon-rose')!;

    // The second tile opens the lightbox with the second slide selected.
    const tile = within(root).getByRole('button', { name: salon.gallery[1].alt });
    fireEvent.click(tile);

    const dialog = await waitFor(() => getByRole('dialog'));
    const tabs = within(dialog).getAllByRole('tab');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('Escape closes the lightbox (Radix modal contract)', async () => {
    const { getByTestId, getByRole, queryByRole } = renderProfile();
    const root = getByTestId('salon-profile');

    fireEvent.click(within(root).getByRole('button', { name: /نمایش همه تصاویر/ }));
    const dialog = await waitFor(() => getByRole('dialog'));

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => {
      expect(queryByRole('dialog')).toBeNull();
    });
  });
});
