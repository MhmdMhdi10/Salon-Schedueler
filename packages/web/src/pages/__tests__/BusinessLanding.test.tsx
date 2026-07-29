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
 * (`/business/register`) and a marketplace bridge to (`/search`), and
 * preloads an LCP-optimized editorial hero.
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
    expect(root.querySelector('[data-hero-cta="primary"]')).toHaveAttribute(
      'href',
      '/business/register',
    );
  });

  it('routes customers into the marketplace search (/search) (R5.3)', () => {
    const { getByTestId } = renderLanding();
    const root = getByTestId('business-landing');
    const customerLinks = within(root)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/search');
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

  it('renders the editorial hero image and authentic product proof accessibly', () => {
    const { getByTestId } = renderLanding();
    const root = getByTestId('business-landing');
    const hero = within(root)
      .getByRole('heading', {
        level: 1,
      })
      .closest('[data-hero]');
    expect(hero).not.toBeNull();
    expect(
      within(hero as HTMLElement).getByRole('img', {
        name: /مدیر ایرانی سالن زیبایی در حال رسیدگی/,
      }),
    ).toHaveAttribute('src', '/images/business/iranian-salon-owner-at-work.webp');
    expect(
      within(root).getAllByRole('img', { name: /داشبورد|تقویم و داشبورد مدیریت/ }).length,
    ).toBeGreaterThan(0);
    expect(
      within(root).getAllByRole('img', { name: /رزرو.*موبایل|موبایلی رزرو/ }).length,
    ).toBeGreaterThan(0);
  });

  it('submits canonical service and city fields to the existing search route', () => {
    const { getByTestId } = renderLanding();
    const root = getByTestId('business-landing');
    const form = within(root).getByRole('search', { name: 'جست‌وجوی بازار سالن‌های آرا' });
    expect(form).toHaveAttribute('action', '/search');
    expect(form).toHaveAttribute('method', 'get');
    expect(within(form).getByRole('combobox', { name: 'خدمت' })).toHaveAttribute('name', 'q');
    expect(within(form).getByRole('combobox', { name: 'شهر' })).toHaveAttribute('name', 'city');
    expect(root.querySelectorAll('a[href^="/services/"]').length).toBeGreaterThan(0);
    expect(root.querySelectorAll('a[href^="/city/"]').length).toBeGreaterThan(0);
    expect(root.querySelectorAll('details')).toHaveLength(6);
  });

  it('has no serious or critical accessibility violations', async () => {
    const { getByTestId } = renderLanding();
    await expectNoSeriousA11yViolations(getByTestId('business-landing'));
  });
});
