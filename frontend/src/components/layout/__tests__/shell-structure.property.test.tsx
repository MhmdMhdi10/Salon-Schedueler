/**
 * Property 12: Every page has exactly one h1 and the required landmarks.
 *
 * Feature: ara-redesign, Property 12: exactly one h1 + required landmarks
 * **Validates: Goal 17**
 *
 * For any rendered page (public, customer, or owner), the document contains
 * exactly one `<h1>`, headings in non-skipping order, and the `header`, `nav`,
 * `main`, and `footer` landmarks. A skip link targets the main content region.
 *
 * This test exercises each shell variant (AppShell, FunnelShell, OwnerShell,
 * AdminShell) with a child `<h1>` to simulate a real page rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell, MAIN_CONTENT_ID } from '..';
import { FunnelShell, FUNNEL_CONTENT_ID } from '..';
import { OwnerShell, OWNER_CONTENT_ID } from '..';
import { AdminShell, ADMIN_CONTENT_ID } from '..';
import { ThemeProvider } from '../../theme';
import { TooltipProvider } from '../../ui/Tooltip';
import '../../../i18n';
import {
  renderRtl,
  expectSingleH1AndOrderedHeadings,
  expectNoSeriousA11yViolations,
} from '../../../test/a11y';

// ─── matchMedia mock for OwnerShell responsive logic ──────────────────────────

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  localStorage.clear();
});

// ─── Shell render helpers ─────────────────────────────────────────────────────

function renderAppShell() {
  return renderRtl(
    <ThemeProvider defaultTheme="light">
      <MemoryRouter>
        <AppShell>
          <h1>صفحه اصلی</h1>
          <h2>خدمات</h2>
          <p>محتوای صفحه</p>
        </AppShell>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

function renderFunnelShell() {
  return renderRtl(
    <ThemeProvider defaultTheme="light">
      <MemoryRouter>
        <FunnelShell currentStep="service" salonName="سالن رز">
          <h1>انتخاب خدمت</h1>
          <h2>لیست خدمات</h2>
        </FunnelShell>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

function renderOwnerShell() {
  return renderRtl(
    <ThemeProvider defaultTheme="light">
      <TooltipProvider>
        <MemoryRouter initialEntries={['/owner/calendar']}>
          <OwnerShell role="Owner" salonName="سالن رز" onSignOut={vi.fn()}>
            <h1>تقویم</h1>
            <h2>نمای روزانه</h2>
          </OwnerShell>
        </MemoryRouter>
      </TooltipProvider>
    </ThemeProvider>,
  );
}

function renderAdminShell() {
  return renderRtl(
    <ThemeProvider defaultTheme="light">
      <MemoryRouter initialEntries={['/admin/calendar']}>
        <AdminShell>
          <h1>تقویم</h1>
          <h2>نوبت‌های امروز</h2>
        </AdminShell>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

// ─── Property 12 tests ────────────────────────────────────────────────────────

describe('Property 12: shell structure — landmarks + h1 + skip link', () => {
  describe('AppShell', () => {
    it('contains exactly one <h1> with ordered headings', () => {
      const { rtlContainer } = renderAppShell();
      expectSingleH1AndOrderedHeadings(rtlContainer);
    });

    it('has header, nav, main, and footer landmarks', () => {
      renderAppShell();
      expect(screen.getByRole('banner')).toBeInTheDocument();
      const navs = screen.getAllByRole('navigation');
      expect(navs.length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByRole('main')).toHaveLength(1);
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    });

    it('has a skip link targeting the main content region', () => {
      renderAppShell();
      const skip = screen.getByRole('link', { name: 'رفتن به محتوای اصلی' });
      expect(skip).toHaveAttribute('href', `#${MAIN_CONTENT_ID}`);
      const main = screen.getByRole('main');
      expect(main).toHaveAttribute('id', MAIN_CONTENT_ID);
      expect(main).toHaveAttribute('tabindex', '-1');
    });

    it('has no serious/critical axe violations', async () => {
      const { rtlContainer } = renderAppShell();
      await expectNoSeriousA11yViolations(rtlContainer);
    });
  });

  describe('FunnelShell', () => {
    it('contains exactly one <h1> with ordered headings', () => {
      const { rtlContainer } = renderFunnelShell();
      expectSingleH1AndOrderedHeadings(rtlContainer);
    });

    it('has header, nav, and main landmarks', () => {
      renderFunnelShell();
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getAllByRole('main')).toHaveLength(1);
    });

    it('main has the funnel content id and is focusable', () => {
      renderFunnelShell();
      const main = screen.getByRole('main');
      expect(main).toHaveAttribute('id', FUNNEL_CONTENT_ID);
      expect(main).toHaveAttribute('tabindex', '-1');
    });

    it('has no serious/critical axe violations', async () => {
      const { rtlContainer } = renderFunnelShell();
      await expectNoSeriousA11yViolations(rtlContainer);
    });
  });

  describe('OwnerShell', () => {
    it('contains exactly one <h1> with ordered headings', () => {
      const { rtlContainer } = renderOwnerShell();
      expectSingleH1AndOrderedHeadings(rtlContainer);
    });

    it('has header and main landmarks', () => {
      renderOwnerShell();
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getAllByRole('main')).toHaveLength(1);
    });

    it('has a skip link targeting the owner content region', () => {
      renderOwnerShell();
      const skip = screen.getByRole('link', { name: 'رفتن به محتوای اصلی' });
      expect(skip).toHaveAttribute('href', `#${OWNER_CONTENT_ID}`);
      const main = screen.getByRole('main');
      expect(main).toHaveAttribute('id', OWNER_CONTENT_ID);
      expect(main).toHaveAttribute('tabindex', '0');
    });

    it('has no serious/critical axe violations', async () => {
      const { rtlContainer } = renderOwnerShell();
      await expectNoSeriousA11yViolations(rtlContainer);
    });
  });

  describe('AdminShell', () => {
    it('contains exactly one <h1> with ordered headings', () => {
      const { rtlContainer } = renderAdminShell();
      expectSingleH1AndOrderedHeadings(rtlContainer);
    });

    it('has header, nav, and main landmarks', () => {
      renderAdminShell();
      expect(screen.getByRole('banner')).toBeInTheDocument();
      // AdminShell has both a desktop side nav and a mobile bottom tab nav
      const navs = screen.getAllByRole('navigation');
      expect(navs.length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByRole('main')).toHaveLength(1);
    });

    it('has a skip link targeting the admin content region', () => {
      renderAdminShell();
      const skip = screen.getByRole('link', { name: 'رفتن به محتوای اصلی' });
      expect(skip).toHaveAttribute('href', `#${ADMIN_CONTENT_ID}`);
      const main = screen.getByRole('main');
      expect(main).toHaveAttribute('id', ADMIN_CONTENT_ID);
      expect(main).toHaveAttribute('tabindex', '-1');
    });

    it('has no serious/critical axe violations', async () => {
      const { rtlContainer } = renderAdminShell();
      await expectNoSeriousA11yViolations(rtlContainer);
    });
  });
});
