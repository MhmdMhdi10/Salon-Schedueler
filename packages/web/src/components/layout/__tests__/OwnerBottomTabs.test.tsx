import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OwnerBottomTabs } from '..';
import '../../../i18n';

/**
 * Unit tests for OwnerBottomTabs (Task 7.2; Req 8.5, 8.6, 10.6).
 *
 * Covers: tab rendering with Persian labels, active tab detection from the
 * route, nav landmark with aria-label, aria-current="page" on the active tab,
 * compact icon-only layout, touch target sizing (≥ 64px), indicator presence
 * on active tab, navigation
 * on click, and safe-area-inset-bottom respect.
 */

const mockedNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

function renderTabs(initialPath = '/owner/calendar') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <div dir="rtl" lang="fa">
        <OwnerBottomTabs />
      </div>
    </MemoryRouter>,
  );
}

describe('OwnerBottomTabs', () => {
  beforeEach(() => {
    mockedNavigate.mockClear();
  });

  it('renders a nav landmark with Persian aria-label', () => {
    renderTabs();
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveAttribute('aria-label', 'ناوبری پنل');
  });

  it('renders three tabs with Persian labels', () => {
    renderTabs();
    expect(screen.getByText('تقویم')).toBeInTheDocument();
    expect(screen.getByText('آمار')).toBeInTheDocument();
    expect(screen.getByText('تنظیمات سالن')).toBeInTheDocument();
  });

  it('uses the compact QR label in the tab bar', () => {
    renderTabs();
    expect(screen.getByText('QR')).toBeInTheDocument();
  });

  it('sets aria-current="page" on the active tab based on route', () => {
    renderTabs('/owner/analytics');
    const buttons = screen.getAllByRole('link');
    // Calendar tab (index 0) — not active
    expect(buttons[0]).not.toHaveAttribute('aria-current');
    // Analytics tab (index 1) — active
    expect(buttons[1]).toHaveAttribute('aria-current', 'page');
    // Config tab (index 3) — not active
    expect(buttons[3]).not.toHaveAttribute('aria-current');
  });

  it('highlights the calendar tab when on /owner/calendar', () => {
    renderTabs('/owner/calendar');
    const buttons = screen.getAllByRole('link');
    expect(buttons[0]).toHaveAttribute('aria-current', 'page');
  });

  it('highlights the config tab when on a config sub-route', () => {
    renderTabs('/owner/config/services');
    const buttons = screen.getAllByRole('link');
    expect(buttons[3]).toHaveAttribute('aria-current', 'page');
  });

  it('navigates to the correct route when a tab is clicked', () => {
    renderTabs('/owner/calendar');
    const buttons = screen.getAllByRole('link');
    // Click analytics tab
    fireEvent.click(buttons[1]);
    expect(buttons[1]).toHaveAttribute('aria-current', 'page');
  });

  it('keeps compact icon-only tabs with at least 64px touch targets', () => {
    const { container } = renderTabs();
    const buttons = container.querySelectorAll('a');
    buttons.forEach((btn) => {
      expect(btn.className).toContain('min-h-[64px]');
      expect(btn.className).toContain('gap-0');
      expect(btn.querySelector('svg')).toHaveClass('h-6', 'w-6');
    });
  });

  it('renders the animated indicator on the active tab', () => {
    const { container } = renderTabs('/owner/analytics');
    // The indicator is a motion.span with the bg-primary class
    const indicator = container.querySelector('[class*="bg-primary"]');
    expect(indicator).toBeInTheDocument();
  });

  it('opens the glass overflow sheet', () => {
    renderTabs();
    fireEvent.click(screen.getByRole('button', { name: 'بیشتر' }));
    expect(document.querySelector('.owner-more-sheet')).toBeInTheDocument();
    expect(document.querySelector('.owner-more-item')).toBeInTheDocument();
  });

  it('respects safe-area-inset-bottom via padding class', () => {
    renderTabs();
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('pb-[env(safe-area-inset-bottom)]');
  });

  it('applies custom className to the nav element', () => {
    render(
      <MemoryRouter initialEntries={['/owner/calendar']}>
        <div dir="rtl" lang="fa">
          <OwnerBottomTabs className="custom-class" />
        </div>
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('custom-class');
  });

  it('has data-testid for integration testing', () => {
    renderTabs();
    expect(screen.getByTestId('owner-bottom-tabs')).toBeInTheDocument();
  });
});
