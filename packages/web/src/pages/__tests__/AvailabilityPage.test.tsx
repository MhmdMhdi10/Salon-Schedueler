import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { expectNoSeriousA11yViolations } from '../../test/a11y';

/**
 * Tests for the redesigned availability page (task 6.3; R4.4, R7.2, R7.5, R7.8,
 * R2.3; ui-ux Availability recipe, §6, §7, §11). They cover: the service
 * selector with Rial price, the Jalali date picker replacing the native date
 * input, the slot grid's skeleton → empty → populated states, the preserved
 * `availability-page` testID, and the selection-state-on-back behavior.
 */

const getServices = vi.fn();
const getAvailability = vi.fn();

vi.mock('../../api/client', () => ({
  salonApi: {
    getServices: (salonId: string) => getServices(salonId),
    getAvailability: (salonId: string, serviceId: string, date: string) =>
      getAvailability(salonId, serviceId, date),
  },
}));

import { AvailabilityPage } from '../AvailabilityPage';

const SERVICES = [
  { id: 'svc-1', name: 'کوتاهی مو', durationMinutes: 30, priceRial: 2500000 },
  { id: 'svc-2', name: 'رنگ مو', durationMinutes: 90, priceRial: 8000000 },
];

const SLOTS = [
  { startAt: '2999-03-15T09:00:00.000Z', endAt: '2999-03-15T09:30:00.000Z' },
  { startAt: '2999-03-15T10:00:00.000Z', endAt: '2999-03-15T10:30:00.000Z' },
];

/** Captures the location passed to the confirm route so navigation state is testable. */
let lastConfirmState: unknown;
function ConfirmProbe() {
  const location = useLocation();
  lastConfirmState = location.state;
  return <div>confirm-page</div>;
}

function renderPage(salonId = 'salon-1') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/salon/${salonId}/book`]}>
        <Routes>
          <Route path="/salon/:salonId/book" element={<AvailabilityPage />} />
          <Route path="/salon/:salonId/book/confirm" element={<ConfirmProbe />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

/**
 * Opens the Jalali picker and selects today's day cell (enabled, since today is
 * the inclusive lower bound). Avoids matching on digits that also appear in the
 * year label.
 */
async function pickToday() {
  screen.getByRole('button', { name: /انتخاب تاریخ/ }).click();
  const grid = await screen.findByRole('grid');
  const today = grid.querySelector<HTMLButtonElement>('[aria-current="date"]');
  if (!today) throw new Error('today cell not found in calendar');
  today.click();
}

beforeEach(() => {
  vi.clearAllMocks();
  lastConfirmState = undefined;
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('AvailabilityPage — service selector', () => {
  beforeEach(() => {
    getServices.mockResolvedValue({ services: SERVICES });
    getAvailability.mockResolvedValue({ slots: [] });
  });

  it('preserves the availability-page testID', async () => {
    renderPage();
    expect(await screen.findByTestId('availability-page')).toBeInTheDocument();
  });

  it('lists services with their Rial price (Persian digits + ریال)', async () => {
    renderPage();
    expect(await screen.findByText('کوتاهی مو')).toBeInTheDocument();
    // 2,500,000 rendered with Persian digits + grouping + unit label.
    expect(screen.getByText(/۲٬۵۰۰٬۰۰۰/)).toBeInTheDocument();
    expect(screen.getAllByText('ریال').length).toBeGreaterThan(0);
  });

  it('shows a retry error state when services fail to load', async () => {
    getServices.mockReset();
    getServices.mockRejectedValueOnce({}).mockResolvedValueOnce({ services: SERVICES });
    renderPage();
    const retry = await screen.findByRole('button', { name: 'تلاش مجدد' });
    retry.click();
    expect(await screen.findByText('کوتاهی مو')).toBeInTheDocument();
  });
});

describe('AvailabilityPage — date picker', () => {
  beforeEach(() => {
    getServices.mockResolvedValue({ services: SERVICES });
    getAvailability.mockResolvedValue({ slots: [] });
  });

  it('uses the Jalali date picker (no native date input)', async () => {
    const { container } = renderPage();
    await screen.findByTestId('availability-page');
    // The native <input type="date"> is gone; a labelled trigger replaces it.
    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(
      screen.getByRole('button', { name: /انتخاب تاریخ/ }),
    ).toBeInTheDocument();
  });
});

describe('AvailabilityPage — slot grid states', () => {
  it('shows skeleton slots while availability loads, then the empty card', async () => {
    getServices.mockResolvedValue({ services: SERVICES });
    let resolveSlots: (v: { slots: typeof SLOTS }) => void = () => {};
    getAvailability.mockImplementation(
      () => new Promise((resolve) => {
        resolveSlots = resolve as typeof resolveSlots;
      }),
    );
    renderPage();

    // Pick a service and a date so availability is requested.
    const service = await screen.findByText('کوتاهی مو');
    service.click();
    await pickToday();

    // Loading: skeleton grid announced as busy.
    expect(await screen.findByLabelText('در حال یافتن زمان‌های خالی...')).toBeInTheDocument();

    // Resolve to no slots → empty card with the steering-mandated copy.
    resolveSlots({ slots: [] });
    expect(
      await screen.findByText('این روز نوبت خالی ندارد، روز دیگری انتخاب کنید'),
    ).toBeInTheDocument();
  });

  it('renders populated slot chips and advances to confirm on select', async () => {
    getServices.mockResolvedValue({ services: SERVICES });
    getAvailability.mockResolvedValue({ slots: SLOTS });
    renderPage();

    (await screen.findByText('کوتاهی مو')).click();
    await pickToday();

    // The slot grid renders one selectable chip per free slot.
    const grid = await screen.findByRole('grid', { name: 'زمان‌های موجود' });
    const chips = within(grid).getAllByRole('gridcell');
    expect(chips.length).toBe(SLOTS.length);

    chips[0].click();
    expect(await screen.findByText('confirm-page')).toBeInTheDocument();
    expect(lastConfirmState).toMatchObject({ serviceId: 'svc-1', startAt: SLOTS[0].startAt });
  });
});

describe('AvailabilityPage — selection state on back', () => {
  beforeEach(() => {
    getServices.mockResolvedValue({ services: SERVICES });
    getAvailability.mockResolvedValue({ slots: SLOTS });
  });

  it('restores the service + date from a prior session selection', async () => {
    // Simulate a returning customer: a prior selection persisted for this salon.
    window.sessionStorage.setItem(
      'booking-selection:salon-1',
      JSON.stringify({ serviceId: 'svc-2', date: '2999-03-15' }),
    );
    renderPage();

    // The previously chosen service radio is checked again.
    const radio = await screen.findByRole('radio', { name: 'رنگ مو' });
    expect(radio).toBeChecked();

    // And availability is requested for the restored service + date.
    await waitFor(() =>
      expect(getAvailability).toHaveBeenCalledWith('salon-1', 'svc-2', '2999-03-15'),
    );
  });

  it('persists the selection when a slot is chosen', async () => {
    renderPage();
    (await screen.findByText('کوتاهی مو')).click();
    await pickToday();

    const grid = await screen.findByRole('grid', { name: 'زمان‌های موجود' });
    within(grid).getAllByRole('gridcell')[0].click();

    const stored = window.sessionStorage.getItem('booking-selection:salon-1');
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string)).toMatchObject({ serviceId: 'svc-1' });
  });
});

describe('AvailabilityPage — accessibility', () => {
  it('has no serious or critical a11y violations', async () => {
    getServices.mockResolvedValue({ services: SERVICES });
    getAvailability.mockResolvedValue({ slots: [] });
    const { findByTestId } = renderPage();
    await expectNoSeriousA11yViolations(await findByTestId('availability-page'));
  });
});
