import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { BusinessLanding } from '../BusinessLanding';
import { expectNoSeriousA11yViolations } from '../../test/a11y';

/**
 * Tests for the owner-acquisition marketing landing at `/business`
 * (task 6.1; R5.1, R5.2, R5.3, R5.4, R5.5, R5.6).
 *
 * The landing is a standalone, indexable, owner-focused surface: it opts **in**
 * to indexing, emits a unique title/description + canonical + WebSite/Organization
 * JSON-LD, carries a single `<h1>`, routes its primary CTA to owner sign-up
 * (`/owner`) and a secondary CTA to the customer booking funnel (`/`), and
 * preloads an LCP-optimized hero.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

function renderLanding() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/business']}>
        <BusinessLanding />
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

describe('BusinessLanding', () => {
  it('renders the hero with exactly one <h1> (R5.1)', () => {
    const { getByTestId } = renderLanding();
    const root = getByTestId('business-landing');
    const h1s = within(root).getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
  });

  it('routes the primary CTA to salon registration (/business/register) (R5.2)', () => {
    const { getByTestId } = renderLanding();
    const root = getByTestId('business-landing');
    const registerLinks = within(root)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/business/register');
    expect(registerLinks.length).toBeGreaterThan(0);
  });

  it('routes a secondary CTA to the customer booking funnel (/) (R5.3)', () => {
    const { getByTestId } = renderLanding();
    const root = getByTestId('business-landing');
    const customerLinks = within(root)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/');
    expect(customerLinks.length).toBeGreaterThan(0);
  });

  it('opts in to indexing with index,follow (R5.4, R5.5)', async () => {
    renderLanding();
    await waitFor(() => {
      expect(head('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
    });
  });

  it('emits a unique title, description, and self-referencing canonical (R5.4)', async () => {
    renderLanding();
    await waitFor(() => {
      expect(document.title).toContain('آرا');
      expect(head('meta[name="description"]')?.getAttribute('content')).toBeTruthy();
      expect(head('link[rel="canonical"]')?.getAttribute('href')).toContain('/business');
    });
  });

  it('injects WebSite + Organization JSON-LD (R5.4; seo §5)', async () => {
    renderLanding();
    await waitFor(() => {
      const scripts = Array.from(
        document.head.querySelectorAll('script[type="application/ld+json"]'),
      ).map((s) => JSON.parse(s.textContent!));
      const types = scripts.map((s) => s['@type']);
      expect(types).toContain('WebSite');
      expect(types).toContain('Organization');
    });
  });

  it('matches the reference business hero: centered copy on a mint field', () => {
    const { getByTestId } = renderLanding();
    const hero = within(getByTestId('business-landing'))
      .getByRole('heading', {
        level: 1,
      })
      .closest('[data-hero]');
    expect(hero).not.toBeNull();
    expect(hero!.className).toContain('bg-accent/10');
    expect(hero!.querySelector('img')).toBeNull();
  });

  it('has no serious or critical accessibility violations', async () => {
    const { getByTestId } = renderLanding();
    await expectNoSeriousA11yViolations(getByTestId('business-landing'));
  });
});
