import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlotGrid, SlotChip, type SlotItem } from '../SlotGrid';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Component tests for SlotGrid / SlotChip.
 * Covers the five slot states (with non-selectable states disabled),
 * Persian-digit labels, selection wiring, aria-selected, RTL-aware arrow-key
 * navigation, and axe checks.
 * Requirements: 2.2, 2.6, 2.9, 10.4, 12.4
 */
describe('SlotChip', () => {
  it('localizes the label to Persian digits and announces the state', () => {
    render(<SlotChip state="available" label="09:30" />);
    // Accessible name = «۰۹:۳۰، آزاد».
    const chip = screen.getByRole('gridcell', { name: /۰۹:۳۰/ });
    expect(chip).toHaveAccessibleName(/آزاد/);
    expect(chip).not.toBeDisabled();
  });

  it.each([
    ['held', 'در انتظار'],
    ['full', 'تکمیل'],
    ['past', 'گذشته'],
  ] as const)('non-selectable state %s is disabled', (state, word) => {
    render(<SlotChip state={state} label="10:00" />);
    const chip = screen.getByRole('gridcell', { name: new RegExp(word) });
    expect(chip).toBeDisabled();
  });

  it('selected state sets aria-selected=true', () => {
    render(<SlotChip state="selected" label="11:00" />);
    expect(screen.getByRole('gridcell')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('SlotGrid', () => {
  const slots: SlotItem[] = [
    { id: 's1', label: '09:00', state: 'available' },
    { id: 's2', label: '09:30', state: 'selected' },
    { id: 's3', label: '10:00', state: 'full' },
    { id: 's4', label: '10:30', state: 'available' },
  ];

  it('renders a labelled grid and selects an available slot', () => {
    const onSelect = vi.fn();
    render(<SlotGrid slots={slots} onSelect={onSelect} ariaLabel="زمان‌های موجود" />);
    expect(screen.getByRole('grid', { name: 'زمان‌های موجود' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('gridcell', { name: /۰۹:۰۰/ }));
    expect(onSelect).toHaveBeenCalledWith('s1');
  });

  it('does not fire onSelect for non-selectable slots', () => {
    const onSelect = vi.fn();
    render(<SlotGrid slots={slots} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('gridcell', { name: /۱۰:۰۰/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('RTL arrow keys move focus: ArrowLeft advances, ArrowRight goes back', () => {
    const onSelect = vi.fn();
    const { rtlContainer } = renderRtl(
      <SlotGrid slots={slots} onSelect={onSelect} ariaLabel="زمان‌ها" />,
    );
    const cells = screen.getAllByRole('gridcell');
    // The selected chip (index 1) owns the initial tab stop.
    cells[1].focus();
    expect(cells[1]).toHaveFocus();
    // ArrowLeft advances to the next chip (visual flow under RTL).
    fireEvent.keyDown(rtlContainer.querySelector('[role="grid"]')!, {
      key: 'ArrowLeft',
    });
    expect(cells[2]).toHaveFocus();
    // ArrowRight goes back.
    fireEvent.keyDown(rtlContainer.querySelector('[role="grid"]')!, {
      key: 'ArrowRight',
    });
    expect(cells[1]).toHaveFocus();
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(
      <SlotGrid slots={slots} ariaLabel="زمان‌های موجود" />,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
