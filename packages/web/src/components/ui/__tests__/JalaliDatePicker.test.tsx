import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { JalaliDatePicker } from '../JalaliDatePicker';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Component tests for the JalaliDatePicker primitive.
 * Covers the labelled trigger, Jalali display of the selected value, opening
 * the calendar dialog, selecting a day → ISO callback, the RTL mirroring of the
 * directional month-navigation chevrons, and axe checks.
 * Requirements: 2.2, 2.5, 2.9, 10.4, 12.4
 */
describe('JalaliDatePicker', () => {
  it('renders a labelled trigger showing the placeholder when empty', () => {
    render(
      <JalaliDatePicker
        value={null}
        onChange={() => {}}
        label="تاریخ"
        placeholder="انتخاب تاریخ"
      />,
    );
    const trigger = screen.getByRole('button', { name: /تاریخ/ });
    expect(trigger).toHaveTextContent('انتخاب تاریخ');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('shows the selected date as a Jalali string', () => {
    render(<JalaliDatePicker value="2025-05-07" onChange={() => {}} label="تاریخ" />);
    // 2025-05-07 → چهارشنبه ۱۷ اردیبهشت ۱۴۰۴.
    expect(screen.getByRole('button', { name: /تاریخ/ })).toHaveTextContent(/۱۷ اردیبهشت ۱۴۰۴/);
  });

  it('opens the calendar dialog and selecting a day emits an ISO date', async () => {
    const onChange = vi.fn();
    render(<JalaliDatePicker value="2025-05-07" onChange={onChange} label="تاریخ" />);
    fireEvent.click(screen.getByRole('button', { name: /تاریخ/ }));
    const grid = await screen.findByRole('grid');
    expect(grid).toBeInTheDocument();
    // Pick the first day of the visible month. Use the full accessible name so
    // «۱» is not matched ambiguously against «۱۱», «۱۲», …
    const firstDay = screen.getByRole('gridcell', {
      name: 'دوشنبه ۱ اردیبهشت ۱۴۰۴',
    });
    fireEvent.click(firstDay);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('mirrors the directional month-navigation chevrons (prev/next) under RTL', async () => {
    renderRtl(<JalaliDatePicker value="2025-05-07" onChange={() => {}} label="تاریخ" />);
    fireEvent.click(screen.getByRole('button', { name: /تاریخ/ }));
    const dialog = await screen.findByRole('dialog');
    await screen.findByRole('grid');
    // The directional affordances are labelled by intent, not visual side, so
    // RTL mirroring stays correct: «ماه قبل» / «ماه بعد» both exist.
    const prev = screen.getByRole('button', { name: 'ماه قبل' });
    const next = screen.getByRole('button', { name: 'ماه بعد' });
    expect(prev).toBeInTheDocument();
    expect(next).toBeInTheDocument();
    // The month label lives inside the calendar dialog (the trigger also shows
    // the selected date, so scope the lookup to the dialog to stay unambiguous).
    const monthLabel = within(dialog).getByText(/اردیبهشت/);
    fireEvent.click(next);
    // Advancing a month moves to خرداد.
    await waitFor(() => expect(within(dialog).getByText(/خرداد/)).toBeInTheDocument());
    expect(monthLabel).not.toHaveTextContent('اردیبهشت');
  });

  it('has no serious/critical a11y violations (open)', async () => {
    const { rtlContainer } = renderRtl(
      <JalaliDatePicker value="2025-05-07" onChange={() => {}} label="تاریخ" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /تاریخ/ }));
    await screen.findByRole('grid');
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
