import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from '../../../components/theme';
import '../../../i18n';

/**
 * Component tests for the owner-panel «QR و استند» page (task 5.4; R4.1, R4.3).
 * They cover the behaviours the task calls out:
 *
 *  1. **QR image** — the stable salon QR payload renders as an `<img>` with a
 *     meaningful Persian `alt`.
 *  2. **Campaign URL** — the `/s/:slug?utm_source=qr` destination is shown as
 *     selectable, copyable text, and the copy action writes it to the clipboard.
 *  3. **Print action** — the print button triggers `window.print()`, and the
 *     print-only standee (large QR + salon name + scan invitation) is present.
 *  4. **Data states** — skeleton while loading, error + retry.
 *
 * The axe pass is task 5.5.
 */

const getSalonQr = vi.fn();
const getStaffQr = vi.fn();
const getStylists = vi.fn();

vi.mock('../../../api/client', () => {
  class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }
  return {
    ApiError,
    qrApi: {
      getSalonQr: (...args: unknown[]) => getSalonQr(...args),
      getStaffQr: (...args: unknown[]) => getStaffQr(...args),
    },
    salonApi: {
      getStylists: (...args: unknown[]) => getStylists(...args),
    },
  };
});

import { OwnerQrPage } from '../QrPage';

const QR_RESPONSE = {
  payload: 'https://book.salon.app/s/v1.salon-token-42.deadbeef',
  url: 'https://book.salon.app/s/salon-rose?utm_source=qr',
  salonName: 'سالن رز',
};

function renderPage() {
  return render(
    <HelmetProvider>
      <ThemeProvider defaultTheme="light">
        <div dir="rtl" lang="fa" className="app-root">
          <MemoryRouter initialEntries={['/owner/qr']}>
            <OwnerQrPage />
          </MemoryRouter>
        </div>
      </ThemeProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getStylists.mockResolvedValue({ stylists: [] });
  getStaffQr.mockResolvedValue({
    payload: 'https://book.salon.app/s/v1s.staff-1.salon-token-42.cafebabe',
    staffName: 'زهرا',
    salonName: 'سالن رز',
  });
});

afterEach(() => {
  cleanup();
});

describe('OwnerQrPage — load + data states (R4.1)', () => {
  it('preserves the owner-qr-page testID', async () => {
    getSalonQr.mockResolvedValue(QR_RESPONSE);
    renderPage();
    expect(await screen.findByTestId('owner-qr-page')).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    getSalonQr.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByTestId('qr-loading')).toBeInTheDocument();
  });

  it('shows an error + retry when loading fails, then recovers', async () => {
    getSalonQr.mockRejectedValueOnce(new Error('network'));
    renderPage();

    const errorState = await screen.findByTestId('qr-error');
    expect(errorState).toBeInTheDocument();

    getSalonQr.mockResolvedValue(QR_RESPONSE);
    fireEvent.click(screen.getByRole('button', { name: 'تلاش مجدد' }));
    expect(await screen.findByTestId('qr-card')).toBeInTheDocument();
  });
});

describe('OwnerQrPage — QR image (R4.1)', () => {
  beforeEach(() => {
    getSalonQr.mockResolvedValue(QR_RESPONSE);
  });

  it('renders the QR as an image with a meaningful Persian alt', async () => {
    renderPage();
    const img = (await screen.findByTestId('qr-image')) as HTMLImageElement;
    // Meaningful, salon-specific Persian alt (not empty/decorative).
    expect(img).toHaveAttribute('alt', expect.stringContaining('سالن رز'));
    expect(img.getAttribute('alt')).toContain('کد QR');
    // The QR is generated client-side into an SVG data URI.
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  });
});

describe('OwnerQrPage — campaign URL (R4.3)', () => {
  beforeEach(() => {
    getSalonQr.mockResolvedValue(QR_RESPONSE);
  });

  it('shows the campaign URL as selectable text', async () => {
    renderPage();
    const url = await screen.findByTestId('qr-url');
    expect(url).toHaveTextContent(
      'https://book.salon.app/s/salon-rose?utm_source=qr',
    );
    // Bidi-isolated LTR run so the URL renders correctly inside the RTL layout.
    expect(url.tagName.toLowerCase()).toBe('bdi');
    expect(url).toHaveAttribute('dir', 'ltr');
  });

  it('copies the campaign URL to the clipboard and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderPage();
    await screen.findByTestId('qr-url');

    fireEvent.click(screen.getByTestId('qr-copy'));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'https://book.salon.app/s/salon-rose?utm_source=qr',
      ),
    );
    // The live region announces the copy result.
    await waitFor(() =>
      expect(screen.getByTestId('qr-copy-status')).toHaveTextContent('کپی شد'),
    );
  });
});

describe('OwnerQrPage — print action + standee (R4.3)', () => {
  beforeEach(() => {
    getSalonQr.mockResolvedValue(QR_RESPONSE);
  });

  it('triggers window.print() when the print button is clicked', async () => {
    const print = vi.fn();
    Object.defineProperty(window, 'print', { configurable: true, value: print });

    renderPage();
    await screen.findByTestId('qr-card');

    fireEvent.click(screen.getByTestId('qr-print'));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('renders the printable standee with the salon name and scan invitation', async () => {
    renderPage();
    const standee = await screen.findByTestId('qr-standee');
    expect(standee).toHaveTextContent('سالن رز');
    expect(standee).toHaveTextContent('برای رزرو اسکن کنید');
    // The standee carries its own QR image too.
    expect(screen.getByTestId('qr-standee-image')).toBeInTheDocument();
  });
});
