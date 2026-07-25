import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from '../../../components/theme';
import '../../../i18n';

/**
 * Tests for the owner calendar's two management affordances added on top of the
 * approve/reject queue:
 *  1. Cancel a confirmed booking from the grid (POST /appointments/:id/cancel),
 *     behind a confirmation dialog.
 *  2. Declare a salon closure (full-day holiday or hour-range) straight from the
 *     calendar — Owner-only — wired to `holidaysApi.add`.
 */

const getCalendar = vi.fn();
const getPending = vi.fn();
const cancelAppointment = vi.fn();
const addHoliday = vi.fn();

vi.mock('../../../api/client', () => ({
  adminApi: {
    getCalendar: (...a: unknown[]) => getCalendar(...a),
    getPending: (...a: unknown[]) => getPending(...a),
    cancelAppointment: (...a: unknown[]) => cancelAppointment(...a),
    approveAppointment: vi.fn(),
    rejectAppointment: vi.fn(),
  },
  holidaysApi: {
    add: (...a: unknown[]) => addHoliday(...a),
    list: vi.fn().mockResolvedValue({ holidays: [] }),
    remove: vi.fn(),
  },
}));

// Auth is mutable so a test can switch the role (the closure affordance is
// Owner-only). `useAuth` reads this object on each render.
interface AuthValue {
  status: string;
  role: string | undefined;
  isStaff: boolean;
  isCustomer: boolean;
  principal: unknown;
  refresh: () => Promise<unknown>;
  signOut: () => void;
}
let authValue: AuthValue;

vi.mock('../../../auth/AuthContext', () => ({
  useAuth: () => authValue,
}));

import { CalendarPage } from '../CalendarPage';

function renderCalendar() {
  return render(
    <HelmetProvider>
      <ThemeProvider defaultTheme="light">
        <MemoryRouter initialEntries={['/owner/calendar']}>
          <CalendarPage salonId="s1" />
        </MemoryRouter>
      </ThemeProvider>
    </HelmetProvider>,
  );
}

/** A confirmed appointment at 10:00 today (lands in the day grid's 10:00 row). */
function confirmedAppt() {
  const start = new Date();
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setHours(11, 0, 0, 0);
  return {
    id: 'a1',
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    status: 'confirmed',
    serviceName: 'کوتاهی مو',
    staffName: 'سارا',
    customerName: 'مینا',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authValue = {
    status: 'authenticated',
    role: 'Owner',
    isStaff: true,
    isCustomer: false,
    principal: { id: 'u1', role: 'Owner' },
    refresh: vi.fn().mockResolvedValue(null),
    signOut: vi.fn(),
  };
});

afterEach(() => cleanup());

describe('CalendarPage — cancel from the grid', () => {
  it('cancels a confirmed booking after confirmation', async () => {
    getPending.mockResolvedValue({ appointments: [] });
    getCalendar.mockResolvedValue({ appointments: [confirmedAppt()] });
    cancelAppointment.mockResolvedValue({ status: 'cancelled', appointment: {} });

    renderCalendar();

    // The cancel affordance lives in the day/week grid; switch to the day view.
    // Radix Tabs activate on mousedown (not a bare click) under jsdom.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'روز' }));

    const cancelBtn = await screen.findByTestId('appt-cancel');
    fireEvent.click(cancelBtn);

    // Destructive action is gated behind a confirmation dialog.
    const confirmBtn = await screen.findByTestId('appt-cancel-confirm');
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(cancelAppointment).toHaveBeenCalledWith('a1'));
  });

  it('does not show a cancel button for non-cancellable (pending handled via reject)', async () => {
    getPending.mockResolvedValue({ appointments: [] });
    getCalendar.mockResolvedValue({
      appointments: [{ ...confirmedAppt(), id: 'p1', status: 'cancelled' }],
    });

    renderCalendar();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'روز' }));

    // A cancelled booking is terminal — no cancel affordance.
    await waitFor(() => expect(getCalendar).toHaveBeenCalled());
    expect(screen.queryByTestId('appt-cancel')).not.toBeInTheDocument();
  });
});

describe('CalendarPage — declare closure', () => {
  it('uses the Jalali (Shamsi) date picker for closures — no native Gregorian input', async () => {
    getPending.mockResolvedValue({ appointments: [] });
    getCalendar.mockResolvedValue({ appointments: [] });

    renderCalendar();

    fireEvent.click(await screen.findByTestId('calendar-declare-closure'));
    await screen.findByText('اعلام تعطیلی یا بستن ساعت');

    // The native Gregorian <input type="date"> is gone; a Jalali picker trigger
    // (role=dialog popup) replaces it so dates are always entered in Shamsi.
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(document.querySelector('button[aria-haspopup="dialog"]')).toBeTruthy();
  });

  it('hides the closure affordance from a Stylist (Owner-only)', async () => {
    authValue = { ...authValue, role: 'Stylist', principal: { id: 'u2', role: 'Stylist' } };
    getPending.mockResolvedValue({ appointments: [] });
    getCalendar.mockResolvedValue({ appointments: [] });

    renderCalendar();

    await screen.findByTestId('calendar-empty');
    expect(screen.queryByTestId('calendar-declare-closure')).not.toBeInTheDocument();
  });
});
