import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MobileDatePicker } from '../MobileDatePicker';

/**
 * Component tests for MobileDatePicker — the responsive wrapper that renders
 * JalaliDatePicker as a bottom-sheet on mobile (< 768px) and as a popover on
 * desktop (>= 768px).
 *
 * Validates: Requirements 7.3, 10.2, 11.5
 */

type MediaQueryListener = (e: { matches: boolean }) => void;

/** Mocks `window.matchMedia` to report a given viewport match state. */
function stubMatchMedia(mobile: boolean) {
  const listeners = new Set<MediaQueryListener>();
  const mql = {
    matches: mobile,
    media: '(max-width: 767px)',
    onchange: null,
    addEventListener: (_event: string, cb: MediaQueryListener) => {
      listeners.add(cb);
    },
    removeEventListener: (_event: string, cb: MediaQueryListener) => {
      listeners.delete(cb);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mql) as unknown as typeof window.matchMedia);
  return {
    /** Simulate a viewport change to update the matches state. */
    setMobile: (value: boolean) => {
      mql.matches = value;
      listeners.forEach((cb) => cb({ matches: value }));
    },
  };
}

describe('MobileDatePicker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the JalaliDatePicker trigger with label and placeholder', () => {
    stubMatchMedia(false);
    render(
      <MobileDatePicker
        value={null}
        onChange={() => {}}
        label="تاریخ"
        placeholder="انتخاب تاریخ"
      />,
    );
    const trigger = screen.getByRole('button', { name: /تاریخ/ });
    expect(trigger).toHaveTextContent('انتخاب تاریخ');
  });

  it('opens a popover calendar on desktop (>= 768px)', async () => {
    stubMatchMedia(false);
    render(<MobileDatePicker value="2025-05-07" onChange={() => {}} label="تاریخ" />);
    fireEvent.click(screen.getByRole('button', { name: /تاریخ/ }));
    // On desktop, the calendar opens in a Radix Popover (role="dialog")
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // The calendar grid should be visible inside the dialog
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('opens a bottom-sheet dialog on mobile (< 768px)', async () => {
    stubMatchMedia(true);
    render(<MobileDatePicker value="2025-05-07" onChange={() => {}} label="تاریخ" />);
    fireEvent.click(screen.getByRole('button', { name: /تاریخ/ }));
    // On mobile, the calendar opens in a Sheet (also role="dialog" via Radix Dialog)
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // The Sheet renders with aria-modal="true"
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // The calendar grid is present
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('passes onChange through and emits ISO date on selection', async () => {
    stubMatchMedia(false);
    const onChange = vi.fn();
    render(<MobileDatePicker value="2025-05-07" onChange={onChange} label="تاریخ" />);
    fireEvent.click(screen.getByRole('button', { name: /تاریخ/ }));
    await screen.findByRole('grid');
    // Pick the first day of the visible month
    const firstDay = screen.getByRole('gridcell', {
      name: 'دوشنبه ۱ اردیبهشت ۱۴۰۴',
    });
    fireEvent.click(firstDay);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('forwards min/max date constraints', async () => {
    stubMatchMedia(false);
    // Set min to 2025-05-10 — days before it should be disabled
    render(
      <MobileDatePicker value="2025-05-10" onChange={() => {}} label="تاریخ" min="2025-05-10" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /تاریخ/ }));
    await screen.findByRole('grid');
    // First day of the month (2025-04-21, 1 Ordibehesht) should be disabled
    const firstDay = screen.getByRole('gridcell', {
      name: 'دوشنبه ۱ اردیبهشت ۱۴۰۴',
    });
    expect(firstDay).toBeDisabled();
  });

  it('displays selected date in Jalali format', () => {
    stubMatchMedia(false);
    render(<MobileDatePicker value="2025-05-07" onChange={() => {}} label="تاریخ" />);
    // 2025-05-07 → ۱۷ اردیبهشت ۱۴۰۴
    expect(screen.getByRole('button', { name: /تاریخ/ })).toHaveTextContent(/۱۷ اردیبهشت ۱۴۰۴/);
  });
});
