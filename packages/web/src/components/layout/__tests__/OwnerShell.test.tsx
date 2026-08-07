import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OwnerShell, OWNER_CONTENT_ID, OWNER_THEME_STORAGE_KEY, ownerNavForRole } from '..';
import { ThemeProvider } from '../../theme';
import { TooltipProvider } from '../../ui/Tooltip';
import '../../../i18n';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';
import type { OwnerRole } from '../../../api/client';

/**
 * Tests for the reworked owner panel shell (task 7.3; Req 8.5):
 * - Desktop (lg+): uses OwnerSidebar with collapsible navigation
 * - Mobile (<lg): uses OwnerBottomTabs with fixed bottom bar
 * - Responsive switching via useMediaQuery
 * - Header with salon name + theme toggle + sign-out
 * - Single <main> landmark
 * - Role-filtered navigation (Owner/Admin full panel, Stylist limited)
 * - Sidebar collapsed state persisted to localStorage
 */

// ─── matchMedia mock ──────────────────────────────────────────────────────────

let mediaQueryMatches = false;

function mockMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: mediaQueryMatches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  mediaQueryMatches = false;
  mockMatchMedia();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderOwner(
  props: Partial<React.ComponentProps<typeof OwnerShell>> = {},
  initialPath = '/owner/calendar',
  defaultTheme: 'light' | 'dark' = 'light',
) {
  const { role = 'Owner', onSignOut = vi.fn(), children = <h1>تقویم</h1>, ...rest } = props;
  return render(
    <ThemeProvider defaultTheme={defaultTheme}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <div dir="rtl" lang="fa">
            <OwnerShell role={role} onSignOut={onSignOut} {...rest}>
              {children}
            </OwnerShell>
          </div>
        </MemoryRouter>
      </TooltipProvider>
    </ThemeProvider>,
  );
}

function renderDesktop(
  props: Partial<React.ComponentProps<typeof OwnerShell>> = {},
  initialPath = '/owner/calendar',
) {
  mediaQueryMatches = true;
  mockMatchMedia();
  return renderOwner(props, initialPath);
}

// ─── Core Shell Tests ─────────────────────────────────────────────────────────

describe('OwnerShell', () => {
  it('exposes a single <main> with the owner content id', () => {
    renderOwner();
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', OWNER_CONTENT_ID);
    expect(mains[0]).toHaveAttribute('tabindex', '0');
  });

  it('renders the salon name in the header when provided', () => {
    renderOwner({ salonName: 'سالن رز' });
    expect(screen.getByRole('link', { name: 'سالن رز' })).toBeInTheDocument();
  });

  it('renders a sign-out control that calls onSignOut', () => {
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
});

// ─── Mobile View Tests (default — useMediaQuery returns false) ────────────────

describe('OwnerShell — mobile (<lg)', () => {
  it('renders the OwnerBottomTabs component', () => {
    renderOwner({ role: 'Owner' });
    const tabBar = screen.getByTestId('owner-bottom-tabs');
    expect(tabBar).toBeInTheDocument();
  });

  it('shows tabs for Calendar, Analytics, and Config', () => {
    renderOwner({ role: 'Owner' });
    const tabBar = screen.getByTestId('owner-bottom-tabs');
    expect(within(tabBar).getByRole('link', { name: 'تقویم' })).toBeInTheDocument();
    expect(within(tabBar).getByRole('link', { name: 'آمار' })).toBeInTheDocument();
    expect(within(tabBar).getByRole('link', { name: 'تنظیمات سالن' })).toBeInTheDocument();
  });

  it('does NOT render the sidebar on mobile', () => {
    renderOwner({ role: 'Owner' });
    // The sidebar uses aria-label="ناوبری پنل مدیریت"
    expect(screen.queryByLabelText('ناوبری پنل مدیریت')).not.toBeInTheDocument();
  });

  it('marks the active tab with aria-current="page"', () => {
    renderOwner({ role: 'Owner' }, '/owner/calendar');
    const tabBar = screen.getByTestId('owner-bottom-tabs');
    const calendarBtn = within(tabBar).getByRole('link', { name: 'تقویم' });
    expect(calendarBtn).toHaveAttribute('aria-current', 'page');
  });

  it('adds bottom padding to main for bottom tabs clearance', () => {
    renderOwner({ role: 'Owner' });
    const main = screen.getByRole('main');
    expect(main.className).toContain(
      'pb-[calc(var(--space-10)+var(--space-3)+env(safe-area-inset-bottom))]',
    );
  });
});

// ─── Desktop View Tests (useMediaQuery returns true for lg+) ──────────────────

describe('OwnerShell — desktop (lg+)', () => {
  it('renders the OwnerSidebar on desktop', () => {
    renderDesktop({ role: 'Owner' });
    expect(screen.getByLabelText('ناوبری پنل مدیریت')).toBeInTheDocument();
  });

  it('does NOT render OwnerBottomTabs on desktop', () => {
    renderDesktop({ role: 'Owner' });
    expect(screen.queryByTestId('owner-bottom-tabs')).not.toBeInTheDocument();
  });

  it('shows the full sidebar navigation for an Owner', () => {
    renderDesktop({ role: 'Owner' });
    const sidebar = screen.getByLabelText('ناوبری پنل مدیریت');
    // Owner should see calendar, analytics, and config in sidebar
    expect(within(sidebar).getByRole('link', { name: 'تقویم' })).toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: 'آمار' })).toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: 'تنظیمات سالن' })).toBeInTheDocument();
  });

  it('hides configuration and analytics from a Stylist (RBAC)', () => {
    renderDesktop({ role: 'Stylist' });
    const sidebar = screen.getByLabelText('ناوبری پنل مدیریت');
    // Stylist never sees configuration or analytics
    expect(within(sidebar).getByRole('link', { name: 'تقویم' })).toBeInTheDocument();
    expect(within(sidebar).queryByRole('link', { name: 'تنظیمات سالن' })).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole('link', { name: 'آمار' })).not.toBeInTheDocument();
  });

  it('marks the active route with aria-current="page" in sidebar', () => {
    renderDesktop({ role: 'Owner' }, '/owner/analytics');
    const sidebar = screen.getByLabelText('ناوبری پنل مدیریت');
    const analyticsLink = within(sidebar).getByRole('link', { name: 'آمار' });
    expect(analyticsLink).toHaveAttribute('aria-current', 'page');
  });

  it('persists sidebar collapsed state to localStorage', () => {
    renderDesktop({ role: 'Owner' });
    const toggleBtn = screen.getByLabelText('گسترش ناوبری');
    fireEvent.click(toggleBtn);
    expect(localStorage.getItem('owner-sidebar-collapsed')).toBe('false');
  });

  it('restores collapsed state from localStorage', () => {
    localStorage.setItem('owner-sidebar-collapsed', 'true');
    renderDesktop({ role: 'Owner' });
    // When collapsed, the expand button label should be visible
    expect(screen.getByLabelText('گسترش ناوبری')).toBeInTheDocument();
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

describe('OwnerShell — accessibility', () => {
  it('has no serious/critical a11y violations in RTL (mobile)', async () => {
    const { rtlContainer } = renderRtl(
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <MemoryRouter initialEntries={['/owner/calendar']}>
            <OwnerShell role="Owner" salonName="سالن رز" onSignOut={vi.fn()}>
              <h1>تقویم</h1>
            </OwnerShell>
          </MemoryRouter>
        </TooltipProvider>
      </ThemeProvider>,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

// ─── ownerNavForRole (pure utility — unchanged) ───────────────────────────────

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
      '/owner/qr',
      '/owner/config',
      '/owner/transactions',
      '/owner/notifications',
      '/owner/subscription',
      '/owner/my-qr',
    ]);
  });

  it('denies Admin the configuration destination but allows analytics', () => {
    const nav = ownerNavForRole('Admin');
    const paths = nav.map((i) => i.to);
    expect(paths).toContain('/owner/analytics');
    expect(paths).not.toContain('/owner/config');
  });

  it('limits Stylist to calendar, notifications, and their personal QR', () => {
    const nav = ownerNavForRole('Stylist');
    expect(nav.map((i) => i.to)).toEqual([
      '/owner/calendar',
      '/owner/notifications',
      '/owner/my-qr',
    ]);
  });
});

// ─── Unified app/owner theme ─────────────────────────────────────────────────

describe('OwnerShell — unified theme', () => {
  it('defaults to data-theme="light" on first visit (no stored preference)', () => {
    const { container } = renderOwner();
    const shell = container.querySelector('[data-shell="owner"]');
    expect(shell).toHaveAttribute('data-theme', 'light');
  });

  it('follows the active global dark theme', () => {
    const { container } = renderOwner({}, '/owner/calendar', 'dark');
    const shell = container.querySelector('[data-shell="owner"]');
    expect(shell).toHaveAttribute('data-theme', 'dark');
  });

  it('respects stored owner-theme="light" preference', () => {
    localStorage.setItem(OWNER_THEME_STORAGE_KEY, 'light');
    const { container } = renderOwner();
    const shell = container.querySelector('[data-shell="owner"]');
    expect(shell).toHaveAttribute('data-theme', 'light');
  });

  it('toggles from light to dark and persists to the shared theme key', () => {
    const { container } = renderOwner();
    const shell = container.querySelector('[data-shell="owner"]');
    expect(shell).toHaveAttribute('data-theme', 'light');

    const toggle = screen.getByTestId('owner-theme-toggle');
    fireEvent.click(toggle);

    expect(shell).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem(OWNER_THEME_STORAGE_KEY)).toBe('dark');
  });

  it('toggles back from dark to light', () => {
    const { container } = renderOwner({}, '/owner/calendar', 'dark');
    const shell = container.querySelector('[data-shell="owner"]');
    expect(shell).toHaveAttribute('data-theme', 'dark');

    const toggle = screen.getByTestId('owner-theme-toggle');
    fireEvent.click(toggle);

    expect(shell).toHaveAttribute('data-theme', 'light');
    expect(localStorage.getItem(OWNER_THEME_STORAGE_KEY)).toBe('light');
  });

  it('updates the main app theme key when toggling', () => {
    localStorage.setItem('salon-theme', 'light');
    renderOwner();

    const toggle = screen.getByTestId('owner-theme-toggle');
    fireEvent.click(toggle);

    expect(localStorage.getItem('salon-theme')).toBe('dark');
  });
});
