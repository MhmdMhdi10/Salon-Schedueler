import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from '../../../components/theme';
import { ToastProvider } from '../../../components/ui';
import '../../../i18n';

const listClients = vi.fn();
const addClient = vi.fn();
const getSalonQr = vi.fn();

vi.mock('../../../auth/useSalonId', () => ({
  useSalonId: () => 'salon-1',
}));

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
    clientBookApi: {
      list: (...args: unknown[]) => listClients(...args),
      add: (...args: unknown[]) => addClient(...args),
    },
    qrApi: {
      getSalonQr: (...args: unknown[]) => getSalonQr(...args),
    },
  };
});

import { OwnerClientsPage } from '../OwnerClientsPage';
import { OwnerMarketingPage } from '../OwnerMarketingPage';

function renderPage(page: React.ReactNode, path: string) {
  return render(
    <HelmetProvider>
      <ThemeProvider defaultTheme="light">
        <ToastProvider>
          <div dir="rtl" lang="fa" className="app-root">
            <MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>
          </div>
        </ToastProvider>
      </ThemeProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listClients.mockResolvedValue({
    clients: [
      {
        id: 'client-1',
        fullName: 'سارا محمدی',
        phone: '09123456789',
        visits: 3,
        lastVisitAt: '2026-08-01T10:00:00.000Z',
        noShowCount: 0,
        createdAt: '2026-07-01T10:00:00.000Z',
      },
    ],
  });
  addClient.mockResolvedValue({
    client: {
      id: 'client-2',
      fullName: 'مریم احمدی',
      phone: '09111222333',
      visits: 0,
      lastVisitAt: null,
      noShowCount: 0,
      createdAt: '2026-08-10T10:00:00.000Z',
    },
  });
  getSalonQr.mockResolvedValue({
    payload: 'https://book.salon.app/s/v1.salon-1.deadbeef',
    url: 'https://book.salon.app/s/salon-1?utm_source=qr',
    salonName: 'سالن آرا',
  });
});

afterEach(() => cleanup());

describe('OwnerClientsPage', () => {
  it('loads a salon-scoped client list', async () => {
    renderPage(<OwnerClientsPage />, '/owner/clients');

    expect(await screen.findByText('سارا محمدی')).toBeInTheDocument();
    expect(listClients).toHaveBeenCalledWith('salon-1', undefined);
    expect(screen.getByTestId('owner-client-list')).toHaveTextContent('۳ مراجعه');
  });

  it('adds a client through the short owner form', async () => {
    renderPage(<OwnerClientsPage />, '/owner/clients');
    await screen.findByText('سارا محمدی');

    fireEvent.click(screen.getByRole('button', { name: 'مشتری جدید' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('مثلاً سارا محمدی'), {
      target: { value: 'مریم احمدی' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('۰۹۱۲۳۴۵۶۷۸۹'), {
      target: { value: '09111222333' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'افزودن مشتری' }));

    await waitFor(() =>
      expect(addClient).toHaveBeenCalledWith('salon-1', {
        fullName: 'مریم احمدی',
        phone: '09111222333',
      }),
    );
  });
});

describe('OwnerMarketingPage', () => {
  it('shows one reusable booking link and the next setup actions', async () => {
    renderPage(<OwnerMarketingPage />, '/owner/marketing');

    expect(await screen.findByText('همین را در بیو بگذار')).toBeInTheDocument();
    expect(screen.getByText('https://book.salon.app/s/salon-1?utm_source=qr')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ساخت QR و استند/ })).toHaveAttribute('href', '/owner/qr');
    expect(getSalonQr).toHaveBeenCalledWith('salon-1');
  });
});
