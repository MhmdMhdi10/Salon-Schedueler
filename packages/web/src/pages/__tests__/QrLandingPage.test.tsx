import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { expectNoSeriousA11yViolations } from '../../test/a11y';

/**
 * Tests for the redesigned QR landing page (task 6.2; R4.3, R2.3; ui-ux
 * QR-landing recipe, §6). They cover: the resolving skeleton, the resolved
 * salon header + «انتخاب خدمت» CTA into the funnel, the two DISTINCT error
 * states (malformed payload vs unregistered salon), and the preserved
 * `qr-landing` testID.
 */

const resolveQr = vi.fn();

vi.mock('../../api/client', () => ({
  salonApi: {
    resolveQr: (payload: string) => resolveQr(payload),
  },
}));

import { QrLandingPage } from '../QrLandingPage';

/** Renders the page at a `/qr/:payload` route, capturing navigation targets. */
function renderQr(payload = 'abc123') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/qr/${payload}`]}>
        <Routes>
          <Route path="/qr/:payload" element={<QrLandingPage />} />
          <Route path="/salon/:salonId/book" element={<div>booking-funnel</div>} />
          <Route path="/" element={<div>home</div>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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

  it('preserves the qr-landing testID and shows the salon identity', async () => {
    renderQr();
    expect(await screen.findByTestId('qr-landing')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'سالن رز' })).toBeInTheDocument();
  });

  it('offers the «انتخاب خدمت» CTA that begins the funnel', async () => {
    renderQr();
    const cta = await screen.findByRole('button', { name: 'انتخاب خدمت' });
    cta.click();
    expect(await screen.findByText('booking-funnel')).toBeInTheDocument();
  });

  it('has no serious or critical a11y violations', async () => {
    const { findByTestId } = renderQr();
    await expectNoSeriousA11yViolations(await findByTestId('qr-landing'));
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
