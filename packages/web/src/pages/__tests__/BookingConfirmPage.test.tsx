import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { expectNoSeriousA11yViolations } from '../../test/a11y';

/**
 * Tests for the redesigned booking-confirm page (task 6.4; R4.5, R7.2, R7.5;
 * ui-ux Booking-Confirm recipe, §6, §8, §12). They cover: the summary card
 * (service, Jalali date/time, Rial price, deposit notice), the sticky CTA, the
 * idle → loading → payment-redirect → error states, the abandon warning, the
 * never-fake-success contract, the missing-selection guard, and the preserved
 * `booking-confirm` testID.
 */

const getServices = vi.fn();
const createBooking = vi.fn();

vi.mock('../../api/client', () => ({
  salonApi: {
    getServices: (salonId: string) => getServices(salonId),
  },
  bookingApi: {
    create: (body: unknown) => createBooking(body),
  },
}));

import { BookingConfirmPage } from '../BookingConfirmPage';

const SERVICES = [
  { id: 'svc-1', name: 'کوتاهی مو', durationMinutes: 30, priceRial: 2500000 },
  { id: 'svc-2', name: 'رنگ مو', durationMinutes: 90, priceRial: 8000000 },
];

const SELECTION = { serviceId: 'svc-1', startAt: '2999-03-15T09:30:00.000Z' };

/** Probe that records when the success route is reached. */
function SuccessProbe() {
  return <div>success-page</div>;
}

/** Probe that records when the availability route is reached. */
function AvailabilityProbe() {
  const location = useLocation();
  return <div>availability-page:{location.pathname}</div>;
}

/** Sentinel for "no router state" (deep-link / missing-selection case). */
const NO_STATE = Symbol('no-state');

function renderPage(state: unknown = SELECTION, salonId = 'salon-1') {
  // A string entry carries no router state (the deep-link / missing-selection
  // case); an object entry carries the funnel selection.
  const entry =
    state === NO_STATE
      ? `/salon/${salonId}/book/confirm`
      : { pathname: `/salon/${salonId}/book/confirm`, state };
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/salon/:salonId/book/confirm"
            element={<BookingConfirmPage />}
          />
          <Route path="/salon/:salonId/book" element={<AvailabilityProbe />} />
          <Route path="/booking/success" element={<SuccessProbe />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getServices.mockResolvedValue({ services: SERVICES });
});

afterEach(() => {
  cleanup();
});

describe('BookingConfirmPage — summary', () => {
  it('preserves the booking-confirm testID', async () => {
    renderPage();
    expect(await screen.findByTestId('booking-confirm')).toBeInTheDocument();
  });

  it('summarizes service, Jalali date/time, and Rial price + deposit notice', async () => {
    renderPage();
    // Service name from the (unchanged) services endpoint lookup.
    expect(await screen.findByText('کوتاهی مو')).toBeInTheDocument();
    // Rial price with Persian digits + grouping + unit label.
    expect(screen.getByText(/۲٬۵۰۰٬۰۰۰/)).toBeInTheDocument();
    expect(screen.getByText('ریال')).toBeInTheDocument();
    // Jalali date is rendered as a <time> element (machine ISO + Persian text).
    expect(document.querySelector('time')).toBeInTheDocument();
    // Deposit/payment notice is present.
    expect(
      screen.getByText(/پرداخت از درگاه امن انجام می‌شود/),
    ).toBeInTheDocument();
  });

  it('shows a retry error state when the service detail fails to load', async () => {
    getServices.mockReset();
    getServices
      .mockRejectedValueOnce({})
      .mockResolvedValueOnce({ services: SERVICES });
    renderPage();
    const retry = await screen.findByRole('button', { name: 'تلاش مجدد' });
    retry.click();
    expect(await screen.findByText('کوتاهی مو')).toBeInTheDocument();
  });
});

describe('BookingConfirmPage — missing selection guard', () => {
  it('shows an empty state with a way back when no selection is present', async () => {
    renderPage(NO_STATE);
    expect(await screen.findByTestId('booking-confirm')).toBeInTheDocument();
    const back = screen.getByRole('button', { name: 'بازگشت به انتخاب زمان' });
    back.click();
    expect(
      await screen.findByText(/availability-page:\/salon\/salon-1\/book/),
    ).toBeInTheDocument();
  });
});

describe('BookingConfirmPage — confirm states', () => {
  it('navigates to success when the booking is accepted (pending, awaiting approval)', async () => {
    createBooking.mockResolvedValue({ status: 'pending' });
    renderPage();
    const cta = await screen.findByRole('button', { name: 'تایید رزرو' });
    await waitFor(() => expect(cta).not.toBeDisabled());
    cta.click();
    expect(await screen.findByText('success-page')).toBeInTheDocument();
    expect(createBooking).toHaveBeenCalledWith({ salonId: 'salon-1', ...SELECTION });
  });

  it('shows the explicit payment-redirect state and hands off to the gateway', async () => {
    const original = window.location;
    const assigned: string[] = [];
    // Replace location with a writable href stub so the redirect is observable.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...original,
        set href(url: string) {
          assigned.push(url);
        },
        get href() {
          return assigned[assigned.length - 1] ?? '';
        },
      },
    });

    createBooking.mockResolvedValue({
      status: 'held',
      paymentRedirectUrl: 'https://zarinpal.example/pay/abc',
    });

    try {
      renderPage();
      const cta = await screen.findByRole('button', { name: 'تایید رزرو' });
      await waitFor(() => expect(cta).not.toBeDisabled());
      cta.click();

      // Explicit redirect surface appears (never a fake success).
      expect(
        await screen.findByText('در حال انتقال به درگاه پرداخت...'),
      ).toBeInTheDocument();
      // And the gateway hand-off happened.
      await waitFor(() =>
        expect(assigned).toContain('https://zarinpal.example/pay/abc'),
      );
      // Success route was NOT reached — money is server-confirmed only.
      expect(screen.queryByText('success-page')).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: original,
      });
    }
  });

  it('shows a retry error state when booking creation fails', async () => {
    createBooking.mockRejectedValueOnce({}).mockResolvedValueOnce({
      status: 'pending',
    });
    renderPage();
    const cta = await screen.findByRole('button', { name: 'تایید رزرو' });
    await waitFor(() => expect(cta).not.toBeDisabled());
    cta.click();

    const retry = await screen.findByRole('button', { name: 'تلاش مجدد' });
    retry.click();
    expect(await screen.findByText('success-page')).toBeInTheDocument();
  });

  it('does not navigate to success on an unexpected status (no fake success)', async () => {
    createBooking.mockResolvedValue({ status: 'rejected' });
    renderPage();
    const cta = await screen.findByRole('button', { name: 'تایید رزرو' });
    await waitFor(() => expect(cta).not.toBeDisabled());
    cta.click();
    expect(
      await screen.findByText('ثبت رزرو ناموفق بود'),
    ).toBeInTheDocument();
    expect(screen.queryByText('success-page')).not.toBeInTheDocument();
  });
});

describe('BookingConfirmPage — abandon warning', () => {
  it('arms a beforeunload guard while the booking is in flight', async () => {
    // Keep the create promise pending so the page stays in the submitting state.
    let resolveCreate: (v: unknown) => void = () => {};
    createBooking.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderPage();
    const cta = await screen.findByRole('button', { name: 'تایید رزرو' });
    await waitFor(() => expect(cta).not.toBeDisabled());
    cta.click();

    await waitFor(() =>
      expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function)),
    );
    resolveCreate({ status: 'pending' });
    addSpy.mockRestore();
  });
});

describe('BookingConfirmPage — accessibility', () => {
  it('has no serious or critical a11y violations', async () => {
    renderPage();
    await screen.findByText('کوتاهی مو');
    await expectNoSeriousA11yViolations(await screen.findByTestId('booking-confirm'));
  });
});
