import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from '../../../components/theme';
import '../../../i18n';

/**
 * Component tests for the personal QR page «بارکد من» (R4.1, R2.5).
 *
 * Covers the behaviours the surface promises:
 *  1. **Success** — the stylist's own QR renders as an `<img>` with a Persian
 *     alt, alongside their name and a Share action.
 *  2. **Share** — uses the native share sheet when available, otherwise copies
 *     the booking link to the clipboard.
 *  3. **Download** — the SVG download delegates to the marketing-assets helper.
 *  4. **Unavailable** — an account not linked to a stylist gets an empty state.
 *  5. **Loading** — a skeleton shows while the QR is generated.
 */

const getStaffQr = vi.fn();
const getAuth = vi.fn();

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
      getStaffQr: (...args: unknown[]) => getStaffQr(...args),
    },
  };
});

vi.mock('../../../auth/AuthContext', () => ({
  useAuth: () => getAuth(),
}));

// Partially mock the marketing-assets module: spy the download helpers while
// keeping the real `qrImageDataUri` so the rendered `<img>` is a true data URI.
const downloadQrSvg = vi.fn();
const downloadQrPng = vi.fn();
vi.mock('../marketing-assets', async () => {
  const actual = await vi.importActual<typeof import('../marketing-assets')>('../marketing-assets');
  return {
    ...actual,
    downloadQrSvg: (...args: unknown[]) => downloadQrSvg(...args),
    downloadQrPng: (...args: unknown[]) => downloadQrPng(...args),
  };
});

import { MyQrPage } from '../MyQrPage';

const STAFF_QR = {
  payload: 'https://book.salon.app/s/v1s.staff-9.salon-token-42.cafebabe',
  staffName: 'زهرا',
  salonName: 'سالن رز',
};

function renderPage() {
  return render(
    <HelmetProvider>
      <ThemeProvider defaultTheme="light">
        <div dir="rtl" lang="fa" className="app-root">
          <MyQrPage />
        </div>
      </ThemeProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getAuth.mockReturnValue({
    principal: { id: 'u1', staffMemberId: 'staff-9' },
    role: 'Stylist',
    status: 'authenticated',
  });
  getStaffQr.mockResolvedValue(STAFF_QR);
});

afterEach(() => {
  cleanup();
  // Reset the native share hook so cases don't leak into each other.
  Object.assign(navigator, { share: undefined });
});

describe('MyQrPage — success (R4.1)', () => {
  it('renders the personal QR image, the stylist name, and a Share button', async () => {
    renderPage();

    const img = (await screen.findByTestId('my-qr-image')) as HTMLImageElement;
    expect(img.getAttribute('alt')).toContain('زهرا');
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);

    expect(screen.getByText('زهرا')).toBeInTheDocument();
    expect(screen.getByText('سالن رز')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'اشتراک‌گذاری' })).toBeInTheDocument();
    // The QR is scoped to the signed-in stylist.
    expect(getStaffQr).toHaveBeenCalledWith(expect.any(String), 'staff-9');
  });
});

describe('MyQrPage — share action', () => {
  it('uses the native share sheet when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });

    renderPage();
    await screen.findByTestId('my-qr-image');

    fireEvent.click(screen.getByRole('button', { name: 'اشتراک‌گذاری' }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: STAFF_QR.payload })),
    );
  });

  it('falls back to copying the link when native share is unavailable', async () => {
    Object.assign(navigator, { share: undefined });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderPage();
    await screen.findByTestId('my-qr-image');

    fireEvent.click(screen.getByRole('button', { name: 'اشتراک‌گذاری' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(STAFF_QR.payload));
    await waitFor(() =>
      expect(screen.getByTestId('my-qr-copy-status')).toHaveTextContent('کپی شد'),
    );
  });
});

describe('MyQrPage — download action', () => {
  it('delegates the SVG download to the marketing-assets helper', async () => {
    renderPage();
    await screen.findByTestId('my-qr-image');

    fireEvent.click(screen.getByRole('button', { name: 'دانلود QR (SVG)' }));

    expect(downloadQrSvg).toHaveBeenCalledWith(STAFF_QR.payload, expect.any(String), 'زهرا');
  });
});

describe('MyQrPage — data states', () => {
  it('shows an empty state when the account is not linked to a stylist', async () => {
    getAuth.mockReturnValue({
      principal: { id: 'u1' },
      role: 'Stylist',
      status: 'authenticated',
    });

    renderPage();

    expect(await screen.findByText('بارکد در دسترس نیست')).toBeInTheDocument();
    expect(getStaffQr).not.toHaveBeenCalled();
  });

  it('shows a skeleton while the QR is generated', () => {
    getStaffQr.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByTestId('my-qr-loading')).toBeInTheDocument();
  });
});
