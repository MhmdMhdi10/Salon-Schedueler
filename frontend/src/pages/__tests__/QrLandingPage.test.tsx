import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { expectNoSeriousA11yViolations } from '../../test/a11y';

/**
 * Tests for the QR entry point (R4.3, R2.3; ui-ux QR-landing recipe, §6).
 * They cover: the resolving skeleton, direct navigation to service selection,
 * local salon saving, and the two DISTINCT error states (malformed payload vs
 * unregistered salon).
 */

const resolveQr = vi.fn();

vi.mock('../../api/client', () => ({
  salonApi: {
    resolveQr: (payload: string) => resolveQr(payload),
  },
}));

import { QrLandingPage } from '../QrLandingPage';

function BookingProbe() {
  const location = useLocation();
  return <div>booking-funnel{location.search}</div>;
}

/** Renders the page at a `/qr/:payload` route, capturing navigation targets. */
function renderQr(payload = 'abc123') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/qr/${payload}`]}>
        <Routes>
          <Route path="/qr/:payload" element={<QrLandingPage />} />
          <Route path="/salon/:salonId/book" element={<BookingProbe />} />
          <Route path="/" element={<div>home</div>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('QrLandingPage — resolving', () => {
  it('shows a salon-header skeleton while resolving', async () => {
    // A pending promise keeps the page in the loading state.
    resolveQr.mockReturnValue(new Promise(() => {}));
    renderQr();
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByTestId('qr-landing')).not.toBeInTheDocument();
  });
});

describe('QrLandingPage — resolved', () => {
  beforeEach(() => {
    resolveQr.mockResolvedValue({ salon: { id: 'salon-1', name: 'سالن رز' } });
  });

  it('opens service selection directly after resolving the salon', async () => {
    renderQr();
    expect(await screen.findByText('booking-funnel')).toBeInTheDocument();
  });

  it('saves a successfully scanned salon on this device', async () => {
    renderQr();
    await screen.findByText('booking-funnel');
    expect(localStorage.getItem('ara-saved-salons-v1')).toContain('سالن رز');
  });

  it('keeps stylist-scoped scans in the direct booking URL', async () => {
    resolveQr.mockResolvedValue({
      salon: { id: 'salon-1', name: 'سالن رز' },
      staff: { id: 'staff-1', fullName: 'مریم' },
    });
    renderQr();
    expect(await screen.findByText('booking-funnel?staff=staff-1')).toBeInTheDocument();
  });

  it('has no serious or critical a11y violations in the malformed state', async () => {
    resolveQr.mockRejectedValue({ code: 'QR_MALFORMED' });
    const { findByTestId } = renderQr();
    await expectNoSeriousA11yViolations(await findByTestId('qr-error-malformed'));
  });
});

describe('QrLandingPage — distinct error states', () => {
  it('shows the malformed-payload state for a QR_MALFORMED error', async () => {
    resolveQr.mockRejectedValue({ code: 'QR_MALFORMED' });
    renderQr();
    expect(await screen.findByTestId('qr-error-malformed')).toBeInTheDocument();
    expect(screen.getByText('کد QR نامعتبر است')).toBeInTheDocument();
  });

  it('shows the unregistered-salon state for any other error', async () => {
    resolveQr.mockRejectedValue({ code: 'NOT_FOUND' });
    renderQr();
    expect(await screen.findByTestId('qr-error-unregistered')).toBeInTheDocument();
    expect(screen.getByText('سالن یافت نشد')).toBeInTheDocument();
  });

  it('treats a missing payload as malformed without calling the resolver', async () => {
    // Route the page without a payload segment.
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/qr/']}>
          <Routes>
            <Route path="/qr/:payload?" element={<QrLandingPage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    );
    expect(await screen.findByTestId('qr-error-malformed')).toBeInTheDocument();
    expect(resolveQr).not.toHaveBeenCalled();
  });
});
