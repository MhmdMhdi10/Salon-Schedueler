import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import {
  AboutPage,
  ContactPage,
  PrivacyPage,
  TermsPage,
} from '../LegalPages';
import { expectNoSeriousA11yViolations } from '../../test/a11y';

/**
 * Tests for the public trust & legal pages — `/about`, `/contact`, `/privacy`,
 * `/terms` (task 5.3; R8.1, R8.4, R8.8; seo §1). Each is an indexable content
 * page: it must opt **in** to indexing, carry exactly one `<h1>`, a crawlable
 * home breadcrumb link, and a self-referencing canonical, with no serious a11y
 * violations.
 *
 * Requirements: 8.1, 8.4, 8.8
 */

const PAGES = [
  { name: 'about', testId: 'about-page', Comp: AboutPage, path: '/about' },
  { name: 'contact', testId: 'contact-page', Comp: ContactPage, path: '/contact' },
  { name: 'privacy', testId: 'privacy-page', Comp: PrivacyPage, path: '/privacy' },
  { name: 'terms', testId: 'terms-page', Comp: TermsPage, path: '/terms' },
] as const;

function renderPage(Comp: () => JSX.Element, path: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Comp />
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

describe.each(PAGES)('LegalPage: $name', ({ testId, Comp, path }) => {
  it('renders exactly one <h1>', () => {
    const { getByTestId } = renderPage(Comp, path);
    const h1s = within(getByTestId(testId)).getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
  });

  it('opts in to indexing with a self-referencing canonical (R8.1)', async () => {
    renderPage(Comp, path);
    await waitFor(() => {
      expect(head('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
      expect(head('link[rel="canonical"]')?.getAttribute('href')).toContain(path);
    });
  });

  it('emits a unique title and description (R8.8)', async () => {
    renderPage(Comp, path);
    await waitFor(() => {
      expect(document.title).toContain('آرا');
      expect(head('meta[name="description"]')?.getAttribute('content')?.trim()).toBeTruthy();
    });
  });

  it('exposes a crawlable home breadcrumb link (R8.8)', () => {
    const { getByTestId } = renderPage(Comp, path);
    const hrefs = within(getByTestId(testId))
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/');
  });

  it('has no serious or critical accessibility violations', async () => {
    const { getByTestId } = renderPage(Comp, path);
    await expectNoSeriousA11yViolations(getByTestId(testId));
  });
});
