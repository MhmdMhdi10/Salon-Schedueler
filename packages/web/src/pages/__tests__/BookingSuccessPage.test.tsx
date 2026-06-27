import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { expectNoSeriousA11yViolations } from '../../test/a11y';
import { BookingSuccessPage } from '../BookingSuccessPage';

/**
 * Tests for the redesigned booking-success receipt (task 6.5; R4.6, R1.6;
 * ui-ux Booking-Success recipe, §6, §9). They cover: the preserved
 * `booking-success` testID, the success moment copy + icon, the what/when/where
 * summary fed via router state, graceful rendering with no state, and the clear
 * next action that returns home.
 */

const SUMMARY = {
  serviceName: 'کوتاهی مو',
  startAt: '2999-03-15T09:30:00.000Z',
  salonName: 'سالن رز',
};

/** Probe that records when the home route is reached. */
function HomeProbe() {
  return <div>home-page</div>;
}

function renderPage(state: unknown = undefined) {
  const entry =
    state === undefined
      ? '/booking/success'
      : { pathname: '/booking/success', state };
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/booking/success" element={<BookingSuccessPage />} />
          <Route path="/" element={<HomeProbe />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('BookingSuccessPage — success moment', () => {
  it('preserves the booking-success testID', () => {
    renderPage();
    expect(screen.getByTestId('booking-success')).toBeInTheDocument();
  });

  it('shows a "request submitted, awaiting approval" confirmation with a labelled pending icon', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'درخواست رزرو شما ثبت شد' }),
    ).toBeInTheDocument();
    // The animated pending mark is exposed to assistive tech with a label.
    expect(screen.getByRole('img', { name: 'در انتظار تایید سالن' })).toBeInTheDocument();
  });
});

describe('BookingSuccessPage — what/when/where summary', () => {
  it('renders the service, Jalali date/time, and salon when details are present', () => {
    renderPage(SUMMARY);
    // What: the booked service name.
    expect(screen.getByText('کوتاهی مو')).toBeInTheDocument();
    // When: a Jalali <time> element + a localized time.
    expect(document.querySelector('time')).toBeInTheDocument();
    // Where: the salon name.
    expect(screen.getByText('سالن رز')).toBeInTheDocument();
  });

  it('omits the summary card entirely when reached with no details', () => {
    renderPage();
    expect(screen.getByTestId('booking-success')).toBeInTheDocument();
    // No summary section / time element when state is absent.
    expect(document.querySelector('time')).toBeNull();
    expect(screen.queryByText('کوتاهی مو')).not.toBeInTheDocument();
  });
});

describe('BookingSuccessPage — next action', () => {
  it('returns home from the «بازگشت به خانه» action', async () => {
    renderPage(SUMMARY);
    screen.getByRole('button', { name: 'بازگشت به خانه' }).click();
    expect(await screen.findByText('home-page')).toBeInTheDocument();
  });
});

describe('BookingSuccessPage — accessibility', () => {
  it('has no serious or critical a11y violations', async () => {
    renderPage(SUMMARY);
    await expectNoSeriousA11yViolations(screen.getByTestId('booking-success'));
  });
});
