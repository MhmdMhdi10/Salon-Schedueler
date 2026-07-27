import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import fc from 'fast-check';
import '../../i18n';
import { MarketingHome } from '../MarketingHome';
import { BusinessLanding } from '../BusinessLanding';
import { SITE_URL } from '../../components/seo';

/**
 * Property 21: Marketing routes are indexable with unique metadata.
 *
 * For `/` and `/business`, assert:
 *  1. The page is indexable (robots = index,follow; no noindex)
 *  2. Has a unique non-empty `<title>`
 *  3. Has a unique non-empty `<meta name="description">`
 *  4. Has a canonical link (`<link rel="canonical">`)
 *  5. Has Open Graph tags (og:title, og:description, og:url at minimum)
 *  6. Titles and descriptions are DIFFERENT between the two pages (unique)
 *
 * **Validates: Requirements 3.5**
 */

function head(selector: string): Element | null {
  return document.head.querySelector(selector);
}

afterEach(() => {
  cleanup();
});

describe('Property 21: Marketing routes are indexable with unique metadata', () => {
  describe('MarketingHome (/) is indexable with complete metadata', () => {
    function renderHome() {
      return render(
        <HelmetProvider>
          <MemoryRouter initialEntries={['/']}>
            <MarketingHome />
          </MemoryRouter>
        </HelmetProvider>,
      );
    }

    it('is marked indexable (robots = index,follow)', async () => {
      renderHome();
      await waitFor(() => {
        expect(head('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
      });
    });

    it('has a non-empty title', async () => {
      renderHome();
      await waitFor(() => {
        expect(document.title.trim().length).toBeGreaterThan(0);
      });
    });

    it('has a non-empty meta description', async () => {
      renderHome();
      await waitFor(() => {
        const desc = head('meta[name="description"]')?.getAttribute('content');
        expect(desc).toBeTruthy();
        expect(desc!.trim().length).toBeGreaterThan(0);
      });
    });

    it('has a canonical link', async () => {
      renderHome();
      await waitFor(() => {
        const canonical = head('link[rel="canonical"]');
        expect(canonical).not.toBeNull();
        expect(canonical!.getAttribute('href')).toBe(SITE_URL);
      });
    });

    it('has Open Graph tags (og:title, og:description, og:url)', async () => {
      renderHome();
      await waitFor(() => {
        const ogTitle = head('meta[property="og:title"]')?.getAttribute('content');
        const ogDesc = head('meta[property="og:description"]')?.getAttribute('content');
        const ogUrl = head('meta[property="og:url"]')?.getAttribute('content');
        expect(ogTitle).toBeTruthy();
        expect(ogTitle!.trim().length).toBeGreaterThan(0);
        expect(ogDesc).toBeTruthy();
        expect(ogDesc!.trim().length).toBeGreaterThan(0);
        expect(ogUrl).toBeTruthy();
        expect(ogUrl!.trim().length).toBeGreaterThan(0);
      });
    });
  });

  describe('BusinessLanding (/business) is indexable with complete metadata', () => {
    function renderBusiness() {
      return render(
        <HelmetProvider>
          <MemoryRouter initialEntries={['/business']}>
            <BusinessLanding />
          </MemoryRouter>
        </HelmetProvider>,
      );
    }

    it('is marked indexable (robots = index,follow)', async () => {
      renderBusiness();
      await waitFor(() => {
        expect(head('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
      });
    });

    it('has a non-empty title', async () => {
      renderBusiness();
      await waitFor(() => {
        expect(document.title.trim().length).toBeGreaterThan(0);
      });
    });

    it('has a non-empty meta description', async () => {
      renderBusiness();
      await waitFor(() => {
        const desc = head('meta[name="description"]')?.getAttribute('content');
        expect(desc).toBeTruthy();
        expect(desc!.trim().length).toBeGreaterThan(0);
      });
    });

    it('has a canonical link containing /business', async () => {
      renderBusiness();
      await waitFor(() => {
        const canonical = head('link[rel="canonical"]');
        expect(canonical).not.toBeNull();
        expect(canonical!.getAttribute('href')).toContain('/business');
      });
    });

    it('has Open Graph tags (og:title, og:description, og:url)', async () => {
      renderBusiness();
      await waitFor(() => {
        const ogTitle = head('meta[property="og:title"]')?.getAttribute('content');
        const ogDesc = head('meta[property="og:description"]')?.getAttribute('content');
        const ogUrl = head('meta[property="og:url"]')?.getAttribute('content');
        expect(ogTitle).toBeTruthy();
        expect(ogTitle!.trim().length).toBeGreaterThan(0);
        expect(ogDesc).toBeTruthy();
        expect(ogDesc!.trim().length).toBeGreaterThan(0);
        expect(ogUrl).toBeTruthy();
        expect(ogUrl!.trim().length).toBeGreaterThan(0);
      });
    });
  });

  describe('metadata uniqueness between marketing routes', () => {
    /**
     * Since react-helmet-async manages head state globally within a single
     * HelmetProvider, we render both pages together using two separate
     * providers to capture their metadata independently. Here we gather the
     * page-specific title props and description props from i18n, verifying
     * the pages configure distinct values.
     */

    it('titles are distinct between / and /business', async () => {
      // Clear stale title from previous tests
      document.title = '';

      // Render home first, capture title
      render(
        <HelmetProvider>
          <MemoryRouter initialEntries={['/']}>
            <MarketingHome />
          </MemoryRouter>
        </HelmetProvider>,
      );
      let homeTitle = '';
      await waitFor(() => {
        // Wait until Helmet actually sets a new title (not stale from prior tests)
        expect(document.title).not.toBe('');
        homeTitle = document.title;
      });
      cleanup();

      // Reset title between renders so we detect the new value
      document.title = '';

      // Render business, capture title
      render(
        <HelmetProvider>
          <MemoryRouter initialEntries={['/business']}>
            <BusinessLanding />
          </MemoryRouter>
        </HelmetProvider>,
      );
      let businessTitle = '';
      await waitFor(() => {
        expect(document.title).not.toBe('');
        businessTitle = document.title;
      });

      expect(homeTitle).not.toBe(businessTitle);
    });

    it('meta descriptions are distinct between / and /business', async () => {
      // Render home first, capture description
      render(
        <HelmetProvider>
          <MemoryRouter initialEntries={['/']}>
            <MarketingHome />
          </MemoryRouter>
        </HelmetProvider>,
      );
      let homeDesc = '';
      await waitFor(() => {
        const desc = head('meta[name="description"]')?.getAttribute('content');
        expect(desc).toBeTruthy();
        homeDesc = desc!;
      });
      cleanup();

      // Render business, capture description
      render(
        <HelmetProvider>
          <MemoryRouter initialEntries={['/business']}>
            <BusinessLanding />
          </MemoryRouter>
        </HelmetProvider>,
      );
      let businessDesc = '';
      await waitFor(() => {
        const desc = head('meta[name="description"]')?.getAttribute('content');
        expect(desc).toBeTruthy();
        businessDesc = desc!;
      });

      expect(homeDesc).not.toBe(businessDesc);
    });

    it('canonical URLs are distinct between / and /business', async () => {
      // Render home first, capture canonical
      render(
        <HelmetProvider>
          <MemoryRouter initialEntries={['/']}>
            <MarketingHome />
          </MemoryRouter>
        </HelmetProvider>,
      );
      let homeCanonical = '';
      await waitFor(() => {
        const el = head('link[rel="canonical"]');
        expect(el).not.toBeNull();
        homeCanonical = el!.getAttribute('href')!;
      });
      cleanup();

      // Render business, capture canonical
      render(
        <HelmetProvider>
          <MemoryRouter initialEntries={['/business']}>
            <BusinessLanding />
          </MemoryRouter>
        </HelmetProvider>,
      );
      let businessCanonical = '';
      await waitFor(() => {
        const el = head('link[rel="canonical"]');
        expect(el).not.toBeNull();
        businessCanonical = el!.getAttribute('href')!;
      });

      expect(homeCanonical).not.toBe(businessCanonical);
    });
  });

  describe('property-based: marketing metadata is always complete', () => {
    it('for any marketing route, all metadata fields are present and indexable', async () => {
      const marketingRoutes = fc.constantFrom('/' as const, '/business' as const);

      await fc.assert(
        fc.asyncProperty(marketingRoutes, async (route) => {
          const Component = route === '/' ? MarketingHome : BusinessLanding;
          render(
            <HelmetProvider>
              <MemoryRouter initialEntries={[route]}>
                <Component />
              </MemoryRouter>
            </HelmetProvider>,
          );

          await waitFor(() => {
            // Indexable — no noindex
            const robots = head('meta[name="robots"]')?.getAttribute('content');
            expect(robots).toBe('index,follow');
          });

          // Non-empty title
          expect(document.title.trim().length).toBeGreaterThan(0);

          // Non-empty description
          const desc = head('meta[name="description"]')?.getAttribute('content');
          expect(desc).toBeTruthy();
          expect(desc!.trim().length).toBeGreaterThan(0);

          // Canonical present and on the site host
          const canonical = head('link[rel="canonical"]')?.getAttribute('href');
          expect(canonical).toBeTruthy();
          expect(canonical).toContain(SITE_URL);

          // Open Graph tags
          const ogTitle = head('meta[property="og:title"]')?.getAttribute('content');
          expect(ogTitle).toBeTruthy();
          expect(ogTitle!.trim().length).toBeGreaterThan(0);

          const ogDesc = head('meta[property="og:description"]')?.getAttribute('content');
          expect(ogDesc).toBeTruthy();
          expect(ogDesc!.trim().length).toBeGreaterThan(0);

          const ogUrl = head('meta[property="og:url"]')?.getAttribute('content');
          expect(ogUrl).toBeTruthy();
          expect(ogUrl!.trim().length).toBeGreaterThan(0);

          cleanup();
        }),
        { numRuns: 20 },
      );
    });
  });
});
