import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminShell, ADMIN_CONTENT_ID } from '..';
import { ThemeProvider } from '../../theme';
import '../../../i18n';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Tests for the admin shell: desktop side nav + breadcrumbs, mobile bottom tab
 * bar (تقویم · آمار · تنظیمات), single <main>, and distinctness from the
 * customer funnel. Requirements: 3.1, 3.2, 3.6
 */

function renderAdmin(
  props: Partial<React.ComponentProps<typeof AdminShell>> = {},
  initialPath = '/admin/calendar',
) {
  const { children = <h1>تقویم</h1>, ...rest } = props;
  return render(
    <ThemeProvider defaultTheme="light">
      <MemoryRouter initialEntries={[initialPath]}>
        <div dir="rtl" lang="fa">
          <AdminShell {...rest}>{children}</AdminShell>
        </div>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('AdminShell', () => {
  it('exposes a single <main> with the admin content id', () => {
    renderAdmin();
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', ADMIN_CONTENT_ID);
    expect(mains[0]).toHaveAttribute('tabindex', '-1');
  });

  it('renders the admin navigation destinations', () => {
    renderAdmin();
    // Both the side nav and bottom tab bar share the same labels, so each
    // destination appears twice (one per navigation surface).
    expect(screen.getAllByRole('link', { name: 'تقویم' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: 'آمار' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: 'تنظیمات' }).length).toBeGreaterThanOrEqual(1);
  });

  it('marks the active route with aria-current="page"', () => {
    renderAdmin({}, '/admin/analytics');
    const current = screen.getAllByRole('link', { name: 'آمار' });
    expect(current.some((el) => el.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('renders a mobile bottom tab bar', () => {
    renderAdmin();
    const tabBar = screen.getByTestId('admin-tab-bar');
    expect(within(tabBar).getByRole('link', { name: 'تقویم' })).toBeInTheDocument();
    expect(within(tabBar).getByRole('link', { name: 'آمار' })).toBeInTheDocument();
    expect(within(tabBar).getByRole('link', { name: 'تنظیمات' })).toBeInTheDocument();
  });

  it('renders desktop breadcrumbs with a dashboard root and current page', () => {
    renderAdmin({
      breadcrumbs: [{ label: 'خدمات', to: '/admin/config' }, { label: 'ویرایش خدمت' }],
    });
    const trail = screen.getByRole('navigation', { name: 'مسیر صفحه' });
    expect(within(trail).getByText('داشبورد')).toBeInTheDocument();
    expect(within(trail).getByText('خدمات')).toBeInTheDocument();
    const current = within(trail).getByText('ویرایش خدمت');
    expect(current).toHaveAttribute('aria-current', 'page');
  });

  it('omits breadcrumbs when none are supplied', () => {
    renderAdmin();
    expect(screen.queryByRole('navigation', { name: 'مسیر صفحه' })).not.toBeInTheDocument();
  });

  it('is structurally distinct from the funnel (admin data-shell marker)', () => {
    const { container } = renderAdmin();
    expect(container.querySelector('[data-shell="admin"]')).toBeInTheDocument();
  });

  it('has no serious/critical a11y violations in RTL', async () => {
    const { rtlContainer } = renderRtl(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter initialEntries={['/admin/config']}>
          <AdminShell breadcrumbs={[{ label: 'خدمات', to: '/admin/config' }]}>
            <h1>تنظیمات</h1>
          </AdminShell>
        </MemoryRouter>
      </ThemeProvider>,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
