import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '../../../i18n';

/**
 * Component tests for the per-stylist QR gallery on the owner «QR و استند» page.
 *
 * The gallery fetches the salon's bookable stylists and each one's QR, then runs
 * the full data-surface state set (loading / empty / error+retry / populated)
 * and degrades per-tile when a single stylist's QR fails. These tests cover each
 * of those states plus the SVG download wiring.
 *
 * `../../../api/client` is mocked so `salonApi.getStylists` / `qrApi.getStaffQr`
 * are controllable; `../marketing-assets` is partially mocked so the download
 * helpers are spies while the real `qrImageDataUri` still produces the QR src.
 */

const getStylists = vi.fn();
const getStaffQr = vi.fn();

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
    salonApi: {
      getStylists: (...args: unknown[]) => getStylists(...args),
    },
    qrApi: {
      getStaffQr: (...args: unknown[]) => getStaffQr(...args),
    },
  };
});

vi.mock('../marketing-assets', async (orig) => ({
  ...(await orig<typeof import('../marketing-assets')>()),
  downloadQrSvg: vi.fn(),
  downloadQrPng: vi.fn(),
}));

import { StylistQrGallery } from '../StylistQrGallery';
import { downloadQrSvg } from '../marketing-assets';

function renderGallery() {
  return render(<StylistQrGallery salonId="salon-1" salonName="سالن رز" />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('StylistQrGallery — empty', () => {
  it('shows the empty state and no QR images when the salon has no stylists', async () => {
    getStylists.mockResolvedValue({ stylists: [] });

    renderGallery();

    expect(
      await screen.findByText('هنوز آرایشگری ثبت نشده'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('qr-stylist-image')).not.toBeInTheDocument();
  });
});

describe('StylistQrGallery — success', () => {
  it('renders a QR + name per stylist and downloads the SVG for the clicked tile', async () => {
    getStylists.mockResolvedValue({
      stylists: [
        { id: 's1', fullName: 'زهرا', role: 'Stylist' },
        { id: 's2', fullName: 'مینا', role: 'Stylist' },
      ],
    });
    getStaffQr.mockImplementation((_salonId: string, staffId: string) =>
      Promise.resolve({
        payload: `payload-${staffId}`,
        staffName: staffId,
        salonName: 'سالن رز',
      }),
    );

    renderGallery();

    const images = await screen.findAllByTestId('qr-stylist-image');
    expect(images).toHaveLength(2);
    expect(screen.getByText('زهرا')).toBeInTheDocument();
    expect(screen.getByText('مینا')).toBeInTheDocument();

    // Click the first tile's SVG download → spy called with that stylist's payload.
    const svgButtons = screen.getAllByRole('button', {
      name: 'دانلود QR (SVG)',
    });
    fireEvent.click(svgButtons[0]);
    expect(downloadQrSvg).toHaveBeenCalledTimes(1);
    expect(downloadQrSvg).toHaveBeenCalledWith(
      'payload-s1',
      expect.any(String),
      expect.stringContaining('زهرا'),
    );
  });
});

describe('StylistQrGallery — error + retry', () => {
  it('shows the error state, then renders tiles after retry', async () => {
    getStylists.mockRejectedValueOnce(new Error('network'));
    getStaffQr.mockResolvedValue({
      payload: 'payload-s1',
      staffName: 's1',
      salonName: 'سالن رز',
    });

    renderGallery();

    expect(
      await screen.findByText('ساخت کدهای آرایشگرها ناموفق بود'),
    ).toBeInTheDocument();

    // Recover: getStylists now resolves; «تلاش مجدد» re-runs the fetch.
    getStylists.mockResolvedValue({
      stylists: [{ id: 's1', fullName: 'زهرا', role: 'Stylist' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'تلاش مجدد' }));

    expect(await screen.findByTestId('qr-stylist-image')).toBeInTheDocument();
  });
});

describe('StylistQrGallery — partial failure', () => {
  it('marks a stylist whose QR failed as unavailable with disabled downloads', async () => {
    getStylists.mockResolvedValue({
      stylists: [
        { id: 's1', fullName: 'زهرا', role: 'Stylist' },
        { id: 's2', fullName: 'مینا', role: 'Stylist' },
      ],
    });
    getStaffQr.mockImplementation((_salonId: string, staffId: string) =>
      staffId === 's2'
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({
            payload: `payload-${staffId}`,
            staffName: staffId,
            salonName: 'سالن رز',
          }),
    );

    renderGallery();

    // Only the healthy stylist renders a QR image; the failed one shows the
    // placeholder copy.
    const images = await screen.findAllByTestId('qr-stylist-image');
    expect(images).toHaveLength(1);
    expect(screen.getByText('کد در دسترس نیست')).toBeInTheDocument();

    // The failed tile (second) has both downloads disabled.
    const svgButtons = screen.getAllByRole('button', {
      name: 'دانلود QR (SVG)',
    });
    const pngButtons = screen.getAllByRole('button', {
      name: 'دانلود QR (PNG)',
    });
    expect(svgButtons[1]).toBeDisabled();
    expect(pngButtons[1]).toBeDisabled();
  });
});
