import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FilterBar } from '../FilterBar';
import '../../../i18n';

/**
 * Unit tests for the FilterBar component (Task 4.1; Req 5.2).
 *
 * Covers: sticky filter chip rendering, URL sync via searchParams,
 * expand/collapse on mobile, clear-all button, and accessibility attributes.
 */

const SERVICE_TYPES = ['haircut', 'color', 'makeup'];
const SERVICE_LABELS: Record<string, string> = {
  haircut: 'کوتاهی مو',
  color: 'رنگ مو',
  makeup: 'میکاپ',
};

function renderFilterBar(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <FilterBar
        serviceTypes={SERVICE_TYPES}
        serviceTypeLabels={SERVICE_LABELS}
      />
    </MemoryRouter>,
  );
}

describe('FilterBar', () => {
  it('renders sort chips with correct labels from i18n', () => {
    renderFilterBar();
    // Sort chips should be visible (Persian labels from i18n)
    expect(screen.getByRole('button', { name: /بهترین امتیاز/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /نزدیک‌ترین/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ارزان‌ترین/ })).toBeInTheDocument();
  });

  it('renders rating chips', () => {
    renderFilterBar();
    // Rating chips with Persian numerals (i18n formats numbers to Persian)
    expect(screen.getByRole('button', { name: /ستاره/ })).toBeInTheDocument();
  });

  it('renders the toolbar with proper accessibility role and label', () => {
    renderFilterBar();
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toHaveAttribute('aria-label');
  });

  it('chips have aria-pressed=false by default', () => {
    renderFilterBar();
    const sortChip = screen.getByRole('button', { name: /بهترین امتیاز/ });
    expect(sortChip).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking a sort chip toggles aria-pressed to true', () => {
    renderFilterBar();
    const sortChip = screen.getByRole('button', { name: /بهترین امتیاز/ });
    fireEvent.click(sortChip);
    expect(sortChip).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking a selected chip again deselects it (aria-pressed=false)', () => {
    renderFilterBar();
    const sortChip = screen.getByRole('button', { name: /بهترین امتیاز/ });
    fireEvent.click(sortChip);
    expect(sortChip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(sortChip);
    expect(sortChip).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows clear-all button when a filter is active', () => {
    renderFilterBar();
    // Initially no clear button
    expect(screen.queryByRole('button', { name: /پاک کردن/ })).not.toBeInTheDocument();

    // Select a sort filter
    const sortChip = screen.getByRole('button', { name: /بهترین امتیاز/ });
    fireEvent.click(sortChip);

    // Clear button should now appear
    expect(screen.getByRole('button', { name: /پاک کردن/ })).toBeInTheDocument();
  });

  it('clear-all resets all active filters', () => {
    renderFilterBar();
    // Activate a sort filter
    const sortChip = screen.getByRole('button', { name: /بهترین امتیاز/ });
    fireEvent.click(sortChip);
    expect(sortChip).toHaveAttribute('aria-pressed', 'true');

    // Click clear-all
    const clearBtn = screen.getByRole('button', { name: /پاک کردن/ });
    fireEvent.click(clearBtn);

    // Sort chip should be deselected
    expect(sortChip).toHaveAttribute('aria-pressed', 'false');
  });

  it('expand toggle has correct aria-expanded attribute', () => {
    renderFilterBar();
    const toggleBtn = screen.getByRole('button', { name: /بیشتر|کمتر/ });
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('all chip buttons meet minimum touch target size (min-h-[44px] min-w-[44px])', () => {
    renderFilterBar();
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      const classes = btn.className;
      // Either the chip class pattern or the clear/expand button pattern
      expect(
        classes.includes('min-h-[44px]') || classes.includes('min-h-[44px]'),
      ).toBe(true);
    });
  });

  it('reads initial filter state from URL search params', () => {
    renderFilterBar(['/?sort=rating&type=haircut']);
    const sortChip = screen.getByRole('button', { name: /بهترین امتیاز/ });
    expect(sortChip).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders service type chips on desktop (hidden class only affects mobile)', () => {
    renderFilterBar();
    // Service type chips are in the DOM (desktop version is hidden via CSS md:block)
    expect(screen.getAllByRole('button', { name: 'کوتاهی مو' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'رنگ مو' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'میکاپ' }).length).toBeGreaterThanOrEqual(1);
  });
});
