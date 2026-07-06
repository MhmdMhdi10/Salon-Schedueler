import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '../../ui/Tooltip';
import { OwnerSidebar } from '../OwnerSidebar';
import type { OwnerSidebarRole } from '../OwnerSidebar';

/**
 * Unit tests for the OwnerSidebar component (Task 7.1).
 *
 * Covers: role filtering, collapsed/expanded states, accessibility
 * (nav landmark, aria-label, aria-current), toggle button, RTL-aware
 * active indicator, and touch target sizing.
 *
 * Validates: Requirements 8.5, 8.6, 10.6, 12.3
 */

function renderSidebar(props: Partial<React.ComponentProps<typeof OwnerSidebar>> = {}) {
  const defaultProps = {
    collapsed: false,
    onToggle: vi.fn(),
    activeRoute: '/owner/calendar',
    role: 'owner' as OwnerSidebarRole,
  };
  return render(
    <MemoryRouter initialEntries={[props.activeRoute || defaultProps.activeRoute]}>
      <TooltipProvider>
        <OwnerSidebar {...defaultProps} {...props} />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe('OwnerSidebar', () => {
  describe('rendering and nav structure', () => {
    it('renders a nav landmark with Persian aria-label', () => {
      renderSidebar();
      const nav = screen.getByRole('navigation', { name: 'ناوبری داشبورد' });
      expect(nav).toBeInTheDocument();
    });

    it('renders the aside element with aria-label', () => {
      const { container } = renderSidebar();
      // The aside wraps everything (rendered by motion.aside)
      const aside = container.querySelector('[aria-label="ناوبری پنل مدیریت"]');
      expect(aside).toBeInTheDocument();
    });

    it('renders all three nav items for owner role', () => {
      renderSidebar({ role: 'owner' });
      expect(screen.getByText('تقویم')).toBeInTheDocument();
      expect(screen.getByText('آمار')).toBeInTheDocument();
      expect(screen.getByText('تنظیمات')).toBeInTheDocument();
    });

    it('renders all three nav items for admin role', () => {
      renderSidebar({ role: 'admin' });
      expect(screen.getByText('تقویم')).toBeInTheDocument();
      expect(screen.getByText('آمار')).toBeInTheDocument();
      expect(screen.getByText('تنظیمات')).toBeInTheDocument();
    });
  });

  describe('role filtering', () => {
    it('stylist sees only Calendar', () => {
      renderSidebar({ role: 'stylist' });
      expect(screen.getByText('تقویم')).toBeInTheDocument();
      expect(screen.queryByText('آمار')).not.toBeInTheDocument();
      expect(screen.queryByText('تنظیمات')).not.toBeInTheDocument();
    });
  });

  describe('active route indication', () => {
    it('sets aria-current="page" on active link', () => {
      renderSidebar({ activeRoute: '/owner/calendar' });
      const calendarLink = screen.getByRole('link', { name: /تقویم/ });
      expect(calendarLink).toHaveAttribute('aria-current', 'page');
    });

    it('does not set aria-current on non-active links', () => {
      renderSidebar({ activeRoute: '/owner/calendar' });
      const analyticsLink = screen.getByRole('link', { name: /آمار/ });
      expect(analyticsLink).not.toHaveAttribute('aria-current');
    });

    it('renders magenta active indicator bar on active item', () => {
      const { container } = renderSidebar({ activeRoute: '/owner/analytics' });
      // The active indicator is a span with inline-start positioning
      const indicators = container.querySelectorAll('[aria-hidden="true"]');
      // Should have at least one indicator span for the active item
      const activeIndicator = Array.from(indicators).find(
        (el) =>
          el.tagName === 'SPAN' &&
          (el as HTMLElement).style.backgroundColor === 'var(--color-primary)',
      );
      expect(activeIndicator).toBeTruthy();
    });
  });

  describe('collapsed state', () => {
    it('hides text labels when collapsed', () => {
      renderSidebar({ collapsed: true });
      // Labels should not be in the DOM when collapsed
      expect(screen.queryByText('تقویم')).not.toBeInTheDocument();
      expect(screen.queryByText('آمار')).not.toBeInTheDocument();
      expect(screen.queryByText('تنظیمات')).not.toBeInTheDocument();
    });

    it('shows text labels when expanded', () => {
      renderSidebar({ collapsed: false });
      expect(screen.getByText('تقویم')).toBeInTheDocument();
      expect(screen.getByText('آمار')).toBeInTheDocument();
      expect(screen.getByText('تنظیمات')).toBeInTheDocument();
    });
  });

  describe('toggle button', () => {
    it('renders collapse toggle button with appropriate aria-label when expanded', () => {
      renderSidebar({ collapsed: false });
      const toggle = screen.getByRole('button', { name: 'جمع‌کردن ناوبری' });
      expect(toggle).toBeInTheDocument();
    });

    it('renders expand toggle button with appropriate aria-label when collapsed', () => {
      renderSidebar({ collapsed: true });
      const toggle = screen.getByRole('button', { name: 'گسترش ناوبری' });
      expect(toggle).toBeInTheDocument();
    });

    it('calls onToggle when toggle button is clicked', () => {
      const onToggle = vi.fn();
      renderSidebar({ onToggle });
      const toggle = screen.getByRole('button', { name: 'جمع‌کردن ناوبری' });
      fireEvent.click(toggle);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('touch targets', () => {
    it('all nav links meet 44px minimum touch target', () => {
      const { container } = renderSidebar();
      const links = container.querySelectorAll('a');
      links.forEach((link) => {
        expect(link.className).toContain('min-h-[44px]');
        expect(link.className).toContain('min-w-[44px]');
      });
    });

    it('toggle button meets 44px minimum touch target', () => {
      renderSidebar();
      const toggle = screen.getByRole('button', { name: 'جمع‌کردن ناوبری' });
      expect(toggle.className).toContain('min-h-[44px]');
      expect(toggle.className).toContain('min-w-[44px]');
    });

    it('collapsed links still have 44px touch targets', () => {
      const { container } = renderSidebar({ collapsed: true });
      const links = container.querySelectorAll('a');
      links.forEach((link) => {
        expect(link.className).toContain('min-h-[44px]');
        expect(link.className).toContain('min-w-[44px]');
      });
    });
  });

  describe('keyboard accessibility', () => {
    it('links have visible focus styles', () => {
      const { container } = renderSidebar();
      const links = container.querySelectorAll('a');
      links.forEach((link) => {
        expect(link.className).toContain('focus-visible:outline');
      });
    });

    it('toggle button has visible focus styles', () => {
      renderSidebar();
      const toggle = screen.getByRole('button', { name: 'جمع‌کردن ناوبری' });
      expect(toggle.className).toContain('focus-visible:outline');
    });
  });
});
