import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OwnerShell, OWNER_CONTENT_ID, ownerNavForRole } from '..';
import { ThemeProvider } from '../../theme';
import '../../../i18n';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';
import type { OwnerRole } from '../../../api/client';

/**
 * Tests for the owner panel shell (task 5.1; R2.1, R2.3, R2.9, R2.10): header
 * with salon name + theme toggle + sign-out, a single <main>, role-filtered
 * navigation (Owner/Admin full panel, Stylist limited), and the owner
 * data-shell marker distinguishing it from the customer/admin shells.
 */

function renderOwner(
  props: Partial<React.ComponentProps<typeof OwnerShell>> = {},
  initialPath = '/owner/calendar',
) {
  const {
    role = 'Owner',
    onSignOut = vi.fn(),
    children = <h1>تقویم</h1>,
    ...rest
  } = props;
  return render(
    <ThemeProvider defaultTheme="light">
      <MemoryRouter initialEntries={[initialPath]}>
        <div dir="rtl" lang="fa">
          <OwnerShell role={role} onSignOut={onSignOut} {...rest}>
            {children}
          </OwnerShell>
        </div>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('OwnerShell', () => {
  it('exposes a single <main> with the owner content id', () => {
    renderOwner();
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', OWNER_CONTENT_ID);
    expect(mains[0]).toHaveAttribute('tabindex', '-1');
  });

  it('renders the salon name in the header when provided', () => {
    renderOwner({ salonName: 'سالن رز' });
    expect(screen.getByRole('link', { name: 'سالن رز' })).toBeInTheDocument();
  });

  it('renders a sign-out control that calls onSignOut', async () => {
    const onSignOut = vi.fn();
    renderOwner({ onSignOut });
    const signOut = screen.getByTestId('owner-sign-out');
    signOut.click();
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('marks the owner data-shell so it is distinct from the customer/admin shells', () => {
    const { container } = renderOwner();
    expect(container.querySelector('[data-shell="owner"]')).toBeInTheDocument();
  });

  it('shows the full panel navigation for an Owner', () => {
    renderOwner({ role: 'Owner' });
    // Each destination appears in both the side nav and the bottom tab bar.
    expect(
      screen.getAllByRole('link', { name: 'تنظیمات سالن' }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole('link', { name: 'اشتراک من' }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole('link', { name: 'QR و استند' }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole('link', { name: 'بارکد من' }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('hides configuration from a Stylist (RBAC, R2.5)', () => {
    renderOwner({ role: 'Stylist' });
    // Stylist sees their own calendar and personal QR — nothing else.
    expect(
      screen.getAllByRole('link', { name: 'تقویم' }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole('link', { name: 'بارکد من' }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.queryByRole('link', { name: 'تنظیمات سالن' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'آمار' }),
    ).not.toBeInTheDocument();
  });

  it('marks the active route with aria-current="page"', () => {
    renderOwner({ role: 'Owner' }, '/owner/subscription');
    const current = screen.getAllByRole('link', { name: 'اشتراک من' });
    expect(
      current.some((el) => el.getAttribute('aria-current') === 'page'),
    ).toBe(true);
  });

  it('renders a mobile bottom tab bar', () => {
    renderOwner({ role: 'Owner' });
    const tabBar = screen.getByTestId('owner-tab-bar');
    expect(
      within(tabBar).getByRole('link', { name: 'تقویم' }),
    ).toBeInTheDocument();
  });

  it('has no serious/critical a11y violations in RTL', async () => {
    const { rtlContainer } = renderRtl(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter initialEntries={['/owner/calendar']}>
          <OwnerShell role="Owner" salonName="سالن رز" onSignOut={vi.fn()}>
            <h1>تقویم</h1>
          </OwnerShell>
        </MemoryRouter>
      </ThemeProvider>,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

describe('ownerNavForRole (RBAC matrix)', () => {
  const roles: OwnerRole[] = ['Owner', 'Admin', 'Stylist'];

  it.each(roles)('returns at least the calendar destination for %s', (role) => {
    const nav = ownerNavForRole(role);
    expect(nav.some((item) => item.to === '/owner/calendar')).toBe(true);
  });

  it('grants Owner every destination', () => {
    const nav = ownerNavForRole('Owner');
    expect(nav.map((i) => i.to)).toEqual([
      '/owner/calendar',
      '/owner/analytics',
      '/owner/config',
      '/owner/subscription',
      '/owner/qr',
      '/owner/my-qr',
    ]);
  });

  it('denies Admin the configuration destination but allows analytics', () => {
    const nav = ownerNavForRole('Admin');
    const paths = nav.map((i) => i.to);
    expect(paths).toContain('/owner/analytics');
    expect(paths).not.toContain('/owner/config');
  });

  it('limits Stylist to calendar and their personal QR', () => {
    const nav = ownerNavForRole('Stylist');
    expect(nav.map((i) => i.to)).toEqual(['/owner/calendar', '/owner/my-qr']);
  });
});
