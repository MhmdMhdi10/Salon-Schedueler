import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { ConfigurationPage } from './ConfigurationPage';
import { adminApi, salonApi, ApiError } from '../../api/client';

/**
 * Component tests for the admin ConfigurationPage.
 * Verifies the staff/chairs/services lists are wired to the API client and
 * that loading -> data and loading -> error transitions are surfaced.
 * Requirements: 7.1, 7.5
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
      getStaff: vi.fn(),
      getChairs: vi.fn(),
    },
    salonApi: {
      getServices: vi.fn(),
    },
    approvalPolicyApi: {
      get: vi.fn().mockResolvedValue({ autoApprove: false, staff: [] }),
      setSalon: vi.fn().mockResolvedValue({ ok: true, autoApprove: false }),
      setStaff: vi.fn().mockResolvedValue({ ok: true, autoApprove: null }),
    },
    brandAccentApi: {
      get: vi.fn().mockResolvedValue({ brandAccent: null }),
      set: vi.fn().mockResolvedValue({ ok: true, brandAccent: null }),
    },
  };
});

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
});

afterEach(() => {
  cleanup();
});

describe('ConfigurationPage', () => {
  it('shows a loading state and then renders staff, chairs, and services from the API', async () => {
    const staffD = deferred<{ staff: unknown[] }>();
    const chairsD = deferred<{ chairs: unknown[] }>();
    const servicesD =
      deferred<{ services: Array<{ id: string; name: string; durationMinutes: number; priceRial: number }> }>();

    vi.mocked(adminApi.getStaff).mockReturnValue(staffD.promise);
    vi.mocked(adminApi.getChairs).mockReturnValue(chairsD.promise);
    vi.mocked(salonApi.getServices).mockReturnValue(servicesD.promise);

    render(
      <HelmetProvider>
        <MemoryRouter>
          <ConfigurationPage salonId="salon-9" />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.getByTestId('config-loading')).toBeTruthy();
    expect(adminApi.getStaff).toHaveBeenCalledWith('salon-9');
    expect(adminApi.getChairs).toHaveBeenCalledWith('salon-9');
    expect(salonApi.getServices).toHaveBeenCalledWith('salon-9');

    staffD.resolve({ staff: [{ id: 's1', name: 'سارا' }, { id: 's2', name: 'Mina' }] });
    chairsD.resolve({ chairs: [{ id: 'c1', name: 'Chair 1' }] });
    servicesD.resolve({
      services: [{ id: 'sv1', name: 'Haircut', durationMinutes: 30, priceRial: 500000 }],
    });

    await waitFor(() => expect(screen.getByTestId('staff-list')).toBeTruthy());
    expect(screen.getByText('سارا')).toBeTruthy();
    expect(screen.getByText('Mina')).toBeTruthy();
    expect(screen.getByText('Chair 1')).toBeTruthy();
    expect(screen.getByText(/Haircut/)).toBeTruthy();
    expect(screen.queryByTestId('config-loading')).toBeNull();
  });

  it('shows an error state when a list fails to load', async () => {
    const staffD = deferred<{ staff: unknown[] }>();
    vi.mocked(adminApi.getStaff).mockReturnValue(staffD.promise);
    vi.mocked(adminApi.getChairs).mockResolvedValue({ chairs: [] });
    vi.mocked(salonApi.getServices).mockResolvedValue({ services: [] });

    render(
      <HelmetProvider>
        <MemoryRouter>
          <ConfigurationPage salonId="salon-9" />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.getByTestId('config-loading')).toBeTruthy();

    staffD.reject(new ApiError(500, 'SERVER_ERROR', 'Server boom'));

    await waitFor(() => expect(screen.getByTestId('config-error')).toBeTruthy());
    expect(screen.getByText('Server boom')).toBeTruthy();
    expect(screen.queryByTestId('staff-list')).toBeNull();
  });

  it('renders per-section empty states and supports inline add', async () => {
    vi.mocked(adminApi.getStaff).mockResolvedValue({ staff: [] });
    vi.mocked(adminApi.getChairs).mockResolvedValue({ chairs: [] });
    vi.mocked(salonApi.getServices).mockResolvedValue({ services: [] });

    render(
      <HelmetProvider>
        <MemoryRouter>
          <ConfigurationPage salonId="salon-9" />
        </MemoryRouter>
      </HelmetProvider>
    );

    await waitFor(() => expect(screen.getByTestId('staff-list')).toBeTruthy());

    // Empty-state copy from the catalog is shown for each section.
    expect(screen.getByText('هنوز کارمندی ثبت نشده')).toBeTruthy();
    expect(screen.getByText('هنوز صندلی‌ای ثبت نشده')).toBeTruthy();

    // Inline add: typing a staff name and submitting appends a list item.
    const nameInput = screen.getByLabelText('نام کارمند');
    fireEvent.change(nameInput, { target: { value: 'سارا' } });
    fireEvent.click(screen.getByRole('button', { name: 'افزودن کارمند' }));

    await waitFor(() =>
      expect(within(screen.getByTestId('staff-list')).getByText('سارا')).toBeTruthy()
    );
  });

  it('shows the Rial price for services with grouped Persian digits', async () => {
    vi.mocked(adminApi.getStaff).mockResolvedValue({ staff: [] });
    vi.mocked(adminApi.getChairs).mockResolvedValue({ chairs: [] });
    vi.mocked(salonApi.getServices).mockResolvedValue({
      services: [{ id: 'sv1', name: 'کوتاهی مو', durationMinutes: 30, priceRial: 500000 }],
    });

    render(
      <HelmetProvider>
        <MemoryRouter>
          <ConfigurationPage salonId="salon-9" />
        </MemoryRouter>
      </HelmetProvider>
    );

    await waitFor(() => expect(screen.getByTestId('services-list')).toBeTruthy());
    // ۵۰۰٬۰۰۰ ریال — Persian digits + grouping + unit.
    expect(screen.getByText(/۵۰۰٬۰۰۰/)).toBeTruthy();
  });

  it('confirms a destructive delete and offers an undo toast', async () => {
    vi.mocked(adminApi.getStaff).mockResolvedValue({
      staff: [{ id: 's1', name: 'سارا' }],
    });
    vi.mocked(adminApi.getChairs).mockResolvedValue({ chairs: [] });
    vi.mocked(salonApi.getServices).mockResolvedValue({ services: [] });

    render(
      <HelmetProvider>
        <MemoryRouter>
          <ConfigurationPage salonId="salon-9" />
        </MemoryRouter>
      </HelmetProvider>
    );

    await waitFor(() =>
      expect(within(screen.getByTestId('staff-list')).getByText('سارا')).toBeTruthy()
    );

    // Destructive action requires confirmation (ui-ux §1 forgiveness).
    fireEvent.click(screen.getByRole('button', { name: 'حذف سارا' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'حذف' }));

    // Item removed, and an undo toast («بازگردانی») is offered.
    await waitFor(() =>
      expect(within(screen.getByTestId('staff-list')).queryByText('سارا')).toBeNull()
    );
    const undo = await screen.findByRole('button', { name: 'بازگردانی' });

    // Undo restores the item.
    fireEvent.click(undo);
    await waitFor(() =>
      expect(within(screen.getByTestId('staff-list')).getByText('سارا')).toBeTruthy()
    );
  });
});
