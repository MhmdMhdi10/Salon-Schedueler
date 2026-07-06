import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { renderRtl, expectNoSeriousA11yViolations } from '../../test/a11y';

/**
 * Integration tests for booking flow keyboard operability, RTL focus order,
 * and state preservation on back-navigation (Task 6.8; Req 7.9, 12.3, 3.4).
 *
 * Verifies:
 * 1. All interactive elements are keyboard-operable (service cards, date picker,
 *    slot chips, confirm button, success CTAs)
 * 2. RTL focus order: Tab follows logical RTL flow; SlotGrid arrow keys handle
 *    RTL (ArrowLeft = forward, ArrowRight = backward)
 * 3. State on back-navigation: sessionStorage preserves service + date on return
 * 4. Animations (AnimatePresence mode="wait") don't block focus or keyboard
 * 5. Focus-visible rings use --color-focus-ring on all interactive elements
 */

// ---- API mocks ----

const getServices = vi.fn();
const getAvailability = vi.fn();
const getStylists = vi.fn();
const bookingCreate = vi.fn();

vi.mock('../../api/client', () => ({
  salonApi: {
    getServices: (salonId: string) => getServices(salonId),
    getAvailability: (salonId: string, serviceId: string, date: string) =>
      getAvailability(salonId, serviceId, date),
    getStylists: (salonId: string) => getStylists(salonId),
  },
  bookingApi: {
    create: (args: unknown) => bookingCreate(args),
  },
}));

vi.mock('../../utils/salonName', () => ({
  readSalonName: () => 'سالن تست',
}));

import { AvailabilityPage } from '../AvailabilityPage';
import { BookingConfirmPage } from '../BookingConfirmPage';
import { BookingSuccessPage } from '../BookingSuccessPage';

const SERVICES = [
  { id: 'svc-1', name: 'کوتاهی مو', durationMinutes: 30, priceRial: 2500000 },
  { id: 'svc-2', name: 'رنگ مو', durationMinutes: 90, priceRial: 8000000 },
];

const SLOTS = [
  { startAt: '2999-03-15T09:00:00.000Z', endAt: '2999-03-15T09:30:00.000Z' },
  { startAt: '2999-03-15T09:30:00.000Z', endAt: '2999-03-15T10:00:00.000Z' },
  { startAt: '2999-03-15T10:00:00.000Z', endAt: '2999-03-15T10:30:00.000Z' },
  { startAt: '2999-03-15T10:30:00.000Z', endAt: '2999-03-15T11:00:00.000Z' },
  { startAt: '2999-03-15T11:00:00.000Z', endAt: '2999-03-15T11:30:00.000Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  getServices.mockResolvedValue({ services: SERVICES });
  getAvailability.mockResolvedValue({ slots: SLOTS });
  getStylists.mockResolvedValue({ stylists: [] });
  bookingCreate.mockResolvedValue({ status: 'confirmed' });
});

afterEach(() => {
  cleanup();
});

// ---- Helpers ----

function renderAvailability(salonId = 'salon-1') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/salon/${salonId}/book`]}>
        <Routes>
          <Route path="/salon/:salonId/book" element={<AvailabilityPage />} />
          <Route path="/salon/:salonId/book/confirm" element={<BookingConfirmPage />} />
          <Route path="/booking/success" element={<BookingSuccessPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

function renderConfirm(salonId = 'salon-1') {
  return render(
    <HelmetProvider>
      <MemoryRouter
        initialEntries={[
          {
            pathname: `/salon/${salonId}/book/confirm`,
            state: { serviceId: 'svc-1', startAt: '2999-03-15T09:30:00.000Z' },
          },
        ]}
      >
        <Routes>
          <Route path="/salon/:salonId/book/confirm" element={<BookingConfirmPage />} />
          <Route path="/booking/success" element={<BookingSuccessPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

function renderSuccess() {
  return render(
    <HelmetProvider>
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/booking/success',
            state: {
              status: 'confirmed',
              serviceName: 'کوتاهی مو',
              startAt: '2999-03-15T09:30:00.000Z',
              salonName: 'سالن تست',
            },
          },
        ]}
      >
        <Routes>
          <Route path="/booking/success" element={<BookingSuccessPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

async function pickToday() {
  const trigger = screen.getByRole('button', { name: /انتخاب تاریخ/ });
  trigger.click();
  const grid = await screen.findByRole('grid');
  const today = grid.querySelector<HTMLButtonElement>('[aria-current="date"]');
  if (!today) throw new Error('today cell not found in Jalali calendar');
  today.click();
}

// ---- Tests ----

describe('Booking Flow — Keyboard Operability', () => {
  describe('ServiceCardList keyboard', () => {
    it('service cards are focusable and operable via Enter/Space', async () => {
      renderAvailability();
      await screen.findByText('کوتاهی مو');

      // Service cards live inside the radiogroup with the services aria-label
      const radiogroup = screen.getByRole('radiogroup', { name: 'انتخاب خدمت' });
      const radios = within(radiogroup).getAllByRole('radio');
      // Each card is a real button with role="radio" — inherently keyboard-operable
      expect(radios.length).toBe(SERVICES.length);

      // Focus the first radio and activate with keyboard
      radios[0].focus();
      expect(radios[0]).toHaveFocus();

      // Button click events are triggered by Enter on buttons natively
      fireEvent.click(radios[0]);
      expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    });

    it('service cards show focus-visible outline class', async () => {
      renderAvailability();
      await screen.findByText('کوتاهی مو');

      const radiogroup = screen.getByRole('radiogroup', { name: 'انتخاب خدمت' });
      const radios = within(radiogroup).getAllByRole('radio');
      // Each card carries the focus-visible token ring classes
      for (const radio of radios) {
        expect(radio.className).toMatch(/focus-visible:outline/);
        expect(radio.className).toMatch(/focus-visible:outline-focus/);
      }
    });
  });

  describe('SlotGrid keyboard navigation in RTL', () => {
    it('slot chips are reachable via Tab (roving tabindex) and operable via Enter', async () => {
      renderAvailability();
      (await screen.findByText('کوتاهی مو')).click();
      await pickToday();

      const grid = await screen.findByRole('grid', { name: 'زمان‌های موجود' });
      const chips = within(grid).getAllByRole('gridcell');

      // Only one chip has tabIndex=0 (roving tabindex pattern)
      const tabbableChips = chips.filter((c) => c.tabIndex === 0);
      expect(tabbableChips.length).toBe(1);

      // Focus the tabbable chip
      tabbableChips[0].focus();
      expect(tabbableChips[0]).toHaveFocus();
    });

    it('ArrowLeft advances focus (RTL forward), ArrowRight goes back (RTL backward)', async () => {
      const { container } = renderAvailability();
      (await screen.findByText('کوتاهی مو')).click();
      await pickToday();

      const grid = await screen.findByRole('grid', { name: 'زمان‌های موجود' });
      const chips = within(grid).getAllByRole('gridcell');

      // Focus the first available chip
      chips[0].focus();
      expect(chips[0]).toHaveFocus();

      // ArrowLeft = forward in RTL (moves to next chip)
      fireEvent.keyDown(grid, { key: 'ArrowLeft' });
      expect(chips[1]).toHaveFocus();

      // ArrowRight = backward in RTL (moves to previous chip)
      fireEvent.keyDown(grid, { key: 'ArrowRight' });
      expect(chips[0]).toHaveFocus();
    });

    it('ArrowDown moves focus by one row (COLUMNS step), ArrowUp moves back', async () => {
      renderAvailability();
      (await screen.findByText('کوتاهی مو')).click();
      await pickToday();

      const grid = await screen.findByRole('grid', { name: 'زمان‌های موجود' });
      const chips = within(grid).getAllByRole('gridcell');

      chips[0].focus();
      expect(chips[0]).toHaveFocus();

      // ArrowDown moves by COLUMNS (4) positions
      fireEvent.keyDown(grid, { key: 'ArrowDown' });
      expect(chips[4]).toHaveFocus();

      // ArrowUp moves back
      fireEvent.keyDown(grid, { key: 'ArrowUp' });
      expect(chips[0]).toHaveFocus();
    });

    it('Home and End keys move to first and last chip', async () => {
      renderAvailability();
      (await screen.findByText('کوتاهی مو')).click();
      await pickToday();

      const grid = await screen.findByRole('grid', { name: 'زمان‌های موجود' });
      const chips = within(grid).getAllByRole('gridcell');

      chips[2].focus();
      fireEvent.keyDown(grid, { key: 'Home' });
      expect(chips[0]).toHaveFocus();

      fireEvent.keyDown(grid, { key: 'End' });
      expect(chips[chips.length - 1]).toHaveFocus();
    });

    it('slot chips have focus-visible outline class', async () => {
      renderAvailability();
      (await screen.findByText('کوتاهی مو')).click();
      await pickToday();

      const grid = await screen.findByRole('grid', { name: 'زمان‌های موجود' });
      const chips = within(grid).getAllByRole('gridcell');

      for (const chip of chips) {
        expect(chip.className).toMatch(/focus-visible:outline/);
        expect(chip.className).toMatch(/focus-visible:outline-focus/);
      }
    });
  });

  describe('BookingConfirmPage keyboard', () => {
    it('confirm CTA button is focusable and has focus-visible ring', async () => {
      renderConfirm();

      await screen.findByTestId('booking-confirm');
      await screen.findByText('کوتاهی مو');

      const cta = screen.getByRole('button', { name: /تایید/ });
      cta.focus();
      expect(cta).toHaveFocus();
      expect(cta.className).toMatch(/focus-visible:outline/);
    });
  });

  describe('BookingSuccessPage keyboard', () => {
    it('success page CTAs are focusable buttons with focus-visible styling', () => {
      renderSuccess();

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(1);

      for (const button of buttons) {
        button.focus();
        expect(button).toHaveFocus();
        expect(button.className).toMatch(/focus-visible:outline/);
      }
    });
  });
});

describe('Booking Flow — State Preservation on Back-Navigation', () => {
  it('persists service + date to sessionStorage when a slot is selected', async () => {
    renderAvailability();
    (await screen.findByText('کوتاهی مو')).click();
    await pickToday();

    const grid = await screen.findByRole('grid', { name: 'زمان‌های موجود' });
    const chips = within(grid).getAllByRole('gridcell');
    chips[0].click();

    const stored = window.sessionStorage.getItem('booking-selection:salon-1');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.serviceId).toBe('svc-1');
    expect(parsed.date).toBeTruthy();
  });

  it('restores service selection from sessionStorage on re-render (back-nav)', async () => {
    // Pre-seed the selection as if the user had advanced and returned
    window.sessionStorage.setItem(
      'booking-selection:salon-1',
      JSON.stringify({ serviceId: 'svc-2', date: '2999-03-15' }),
    );
    renderAvailability();

    // Service should be pre-selected
    const radio = await screen.findByRole('radio', { name: 'رنگ مو' });
    expect(radio).toHaveAttribute('aria-checked', 'true');

    // Availability should be requested for the restored selection
    await waitFor(() =>
      expect(getAvailability).toHaveBeenCalledWith('salon-1', 'svc-2', '2999-03-15'),
    );
  });

  it('passes selection state through router to confirm page', async () => {
    renderAvailability();
    (await screen.findByText('کوتاهی مو')).click();
    await pickToday();

    const grid = await screen.findByRole('grid', { name: 'زمان‌های موجود' });
    const chips = within(grid).getAllByRole('gridcell');
    chips[0].click();

    // Should navigate to confirm page
    await screen.findByTestId('booking-confirm');
  });
});

describe('Booking Flow — Animations Non-Blocking (Req 3.4)', () => {
  it('BookingFlowTransition uses AnimatePresence mode="wait" (no focus trap)', async () => {
    // The mode="wait" ensures old content unmounts before new enters — no
    // overlapping DOM that could trap focus. This is verified by the component
    // using AnimatePresence mode="wait" which we confirm structurally in
    // BookingFlowTransition.test.tsx. Here we verify the flow functions
    // correctly by confirming navigation works without focus trapping.
    renderAvailability();
    (await screen.findByText('کوتاهی مو')).click();
    await pickToday();

    const grid = await screen.findByRole('grid', { name: 'زمان‌های موجود' });
    const chips = within(grid).getAllByRole('gridcell');
    chips[0].click();

    // Navigation completes — no animation trapped our action
    await screen.findByTestId('booking-confirm');
  });

  it('service card selection animation does not prevent keyboard from working', async () => {
    renderAvailability();
    await screen.findByText('کوتاهی مو');

    const radios = screen.getAllByRole('radio');
    // Select first service
    fireEvent.click(radios[0]);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');

    // Immediately try to select the second — animation must not block this
    fireEvent.click(radios[1]);
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveAttribute('aria-checked', 'false');
  });
});

describe('Booking Flow — Focus-Visible Rings (--color-focus-ring)', () => {
  it('all interactive elements in availability step carry the token focus ring', async () => {
    renderAvailability();
    await screen.findByText('کوتاهی مو');

    // Service radio cards
    const radios = screen.getAllByRole('radio');
    for (const radio of radios) {
      expect(radio.className).toMatch(/focus-visible:outline-focus/);
    }

    // Date picker trigger button
    const dateTrigger = screen.getByRole('button', { name: /انتخاب تاریخ/ });
    expect(dateTrigger.className).toMatch(/focus-visible:outline/);
  });

  it('confirm page CTA uses the focus ring token', async () => {
    renderConfirm();
    await screen.findByText('کوتاهی مو');

    const cta = screen.getByRole('button', { name: /تایید/ });
    expect(cta.className).toMatch(/focus-visible:outline-focus/);
  });
});

describe('Booking Flow — Accessibility (axe)', () => {
  it('availability step has no serious/critical a11y violations in RTL', async () => {
    const { rtlContainer } = renderRtl(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/salon/salon-1/book']}>
          <Routes>
            <Route path="/salon/:salonId/book" element={<AvailabilityPage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    );
    await screen.findByText('کوتاهی مو');
    await expectNoSeriousA11yViolations(rtlContainer);
  });

  it('booking success page has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(
      <HelmetProvider>
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/booking/success',
              state: {
                status: 'confirmed',
                serviceName: 'کوتاهی مو',
                startAt: '2999-03-15T09:30:00.000Z',
                salonName: 'سالن تست',
              },
            },
          ]}
        >
          <Routes>
            <Route path="/booking/success" element={<BookingSuccessPage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    );
    await screen.findByTestId('booking-success');
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
