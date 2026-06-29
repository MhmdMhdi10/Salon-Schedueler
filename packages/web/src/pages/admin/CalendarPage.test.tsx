import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { CalendarPage } from './CalendarPage';
import { adminApi, ApiError } from '../../api/client';
import type { OwnerRole } from '../../api/client';

/**
 * Component tests for the admin CalendarPage.
 * Verifies appointments are fetched via the calendar endpoint, the day/week
 * toggle refetches, and loading/error states are surfaced.
 * Requirements: 7.2, 7.5
 */

vi.mock('../../api/client', () => {
  class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }
  return {
    ApiError,
    adminApi: {
      getCalendar: vi.fn(),
      approveAppointment: vi.fn(),
      rejectAppointment: vi.fn(),
    },
  };
});

// `useAuth` drives the manage_appointments affordances. The default is an
// anonymous session (role undefined → no approve/reject), which is what the
// pre-existing cases rely on; the new cases override it per test.
const mockGetRole = vi.fn(() => undefined as OwnerRole | undefined);
vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ role: mockGetRole() }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default to an anonymous session so the existing cases render no
  // management buttons; the approve/reject cases opt in to a manager role.
  mockGetRole.mockReturnValue(undefined);
});

afterEach(() => {
  cleanup();
});

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <CalendarPage salonId="salon-2" />
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('CalendarPage', () => {
  it('shows loading then renders appointments fetched for the day view', async () => {
    const calD = deferred<{ appointments: unknown[] }>();
    vi.mocked(adminApi.getCalendar).mockReturnValue(calD.promise);

    renderPage();

    expect(screen.getByTestId('calendar-loading')).toBeTruthy();
    expect(adminApi.getCalendar).toHaveBeenCalledWith(
      'salon-2',
      expect.any(String),
      expect.any(String),
      'day'
    );

    calD.resolve({
      appointments: [
        { id: 'a1', startAt: '2024-03-15T09:00:00Z', endAt: '2024-03-15T09:45:00Z', serviceName: 'Haircut', status: 'confirmed' },
      ],
    });

    await waitFor(() => expect(screen.getByTestId('calendar-appointments')).toBeTruthy());
    expect(screen.getByText(/Haircut/)).toBeTruthy();
  });

  it('refetches with the week view when the week tab is selected', async () => {
    vi.mocked(adminApi.getCalendar).mockResolvedValue({ appointments: [] });

    renderPage();

    await waitFor(() => expect(screen.getByTestId('calendar-appointments')).toBeTruthy());

    // The day/week toggle is a Radix Tabs trigger, which activates on
    // mousedown/keyboard/focus (not a bare click). Fire mousedown to select the
    // week tab — the original intent (selecting "هفته" refetches the week view)
    // is preserved.
    fireEvent.mouseDown(screen.getByText('هفته'));

    await waitFor(() =>
      expect(adminApi.getCalendar).toHaveBeenCalledWith(
        'salon-2',
        expect.any(String),
        expect.any(String),
        'week'
      )
    );
  });

  it('shows an error state when the calendar fails to load', async () => {
    const calD = deferred<{ appointments: unknown[] }>();
    vi.mocked(adminApi.getCalendar).mockReturnValue(calD.promise);

    renderPage();

    expect(screen.getByTestId('calendar-loading')).toBeTruthy();

    calD.reject(new ApiError(403, 'FORBIDDEN', 'Not allowed'));

    await waitFor(() => expect(screen.getByTestId('calendar-error')).toBeTruthy());
    // R5.6: error description is a user-friendly Persian message, never raw API codes
    expect(screen.getByTestId('calendar-error').textContent).toContain('اتصال به سرور برقرار نشد');
  });
});

/** A pending appointment placed at 10:00 local today (visible in the day grid). */
function pendingAppointment() {
  const start = new Date();
  start.setHours(10, 0, 0, 0);
  return {
    id: 'appt-7',
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 45 * 60_000).toISOString(),
    serviceName: 'رنگ مو',
    staffName: 'زهرا',
    status: 'pending',
  };
}

describe('CalendarPage — approve/reject (manage_appointments)', () => {
  it('shows approve/reject on a pending appointment and refetches after approving (Owner)', async () => {
    mockGetRole.mockReturnValue('Owner');
    vi.mocked(adminApi.getCalendar).mockResolvedValue({
      appointments: [pendingAppointment()],
    });
    vi.mocked(adminApi.approveAppointment).mockResolvedValue({
      status: 'confirmed',
      appointment: {},
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId('calendar-appointments')).toBeTruthy(),
    );

    const approveBtn = await screen.findByRole('button', { name: 'تأیید' });
    expect(screen.getByRole('button', { name: 'رد' })).toBeTruthy();

    const callsBefore = vi.mocked(adminApi.getCalendar).mock.calls.length;
    fireEvent.click(approveBtn);

    await waitFor(() =>
      expect(adminApi.approveAppointment).toHaveBeenCalledWith('appt-7'),
    );
    // On success the calendar refetches so the new status is reflected.
    await waitFor(() =>
      expect(
        vi.mocked(adminApi.getCalendar).mock.calls.length,
      ).toBeGreaterThan(callsBefore),
    );
  });

  it.each(['Stylist', undefined] as const)(
    'hides approve/reject for non-managers (role=%s)',
    async (role) => {
      mockGetRole.mockReturnValue(role);
      vi.mocked(adminApi.getCalendar).mockResolvedValue({
        appointments: [pendingAppointment()],
      });

      renderPage();

      await waitFor(() =>
        expect(screen.getByTestId('calendar-appointments')).toBeTruthy(),
      );
      expect(screen.queryByRole('button', { name: 'تأیید' })).toBeNull();
    },
  );
});
