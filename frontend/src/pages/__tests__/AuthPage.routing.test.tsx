import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '../../i18n';

const { authState, refreshAuth, requestOtp, verifyOtp, setAccessToken } = vi.hoisted(() => ({
  authState: {
    status: 'anonymous' as 'anonymous' | 'authenticated',
    role: undefined as string | undefined,
    principal: null as { role?: string; salonId?: string } | null,
  },
  refreshAuth: vi.fn(),
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
  setAccessToken: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  setAccessToken: (token: string) => setAccessToken(token),
  authApi: {
    requestOtp: (phone: string) => requestOtp(phone),
    verifyOtp: (phone: string, code: string) => verifyOtp(phone, code),
  },
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    status: authState.status,
    role: authState.role,
    principal: authState.principal,
    refresh: () => refreshAuth(),
  }),
}));

import { AuthPage } from '../AuthPage';
import { ToastProvider } from '../../components/ui/Toast';

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="current-location">
      {JSON.stringify({ pathname: location.pathname, state: location.state })}
    </output>
  );
}

function renderAuth(initialEntry: string | { pathname: string; state?: unknown } = '/auth') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ToastProvider>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/business/register" element={<div>salon-registration-route</div>} />
            <Route path="/owner" element={<div>owner-panel-route</div>} />
            <Route path="/account" element={<div>customer-account-route</div>} />
            <Route path="/salon/:salonId/book/confirm" element={<div>booking-confirm-route</div>} />
            <Route path="/salon/:salonId/waitlist" element={<div>waitlist-route</div>} />
          </Routes>
          <LocationProbe />
        </ToastProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

async function completeOtpLogin() {
  fireEvent.change(screen.getByLabelText('شماره موبایل'), {
    target: { value: '09123456789' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }));
  await screen.findByLabelText('رقم ۱ کد تایید');

  for (const [index, digit] of ['1', '2', '3', '4'].entries()) {
    fireEvent.change(screen.getByLabelText(`رقم ${['۱', '۲', '۳', '۴'][index]} کد تایید`), {
      target: { value: digit },
    });
  }

  await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith('09123456789', '1234'));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/auth');
  authState.status = 'anonymous';
  authState.role = undefined;
  authState.principal = null;
  requestOtp.mockResolvedValue({ ok: true });
  verifyOtp.mockResolvedValue({ accessToken: 'access-token' });
  refreshAuth.mockResolvedValue(null);
});

afterEach(() => cleanup());

describe('salon sign-in destination', () => {
  it('returns a signed-in customer to their account when intent is not specified', () => {
    authState.status = 'authenticated';
    authState.principal = { role: undefined };
    renderAuth('/auth');

    expect(screen.getByText('customer-account-route')).toBeInTheDocument();
  });

  it('sends a signed-in customer to onboarding only for explicit salon intent', () => {
    authState.status = 'authenticated';
    authState.principal = { role: undefined };
    renderAuth('/auth?intent=salon');

    expect(screen.getByText('salon-registration-route')).toBeInTheDocument();
  });

  it('sends a first-time salon login to onboarding when returning from the salon PWA route', async () => {
    renderAuth({ pathname: '/auth', state: { returnTo: '/owner/calendar' } });

    await completeOtpLogin();
    expect(await screen.findByText('salon-registration-route')).toBeInTheDocument();

    const location = JSON.parse(screen.getByTestId('current-location').textContent ?? '{}');
    expect(location.pathname).toBe('/business/register');
    expect(location.state).toEqual({ ownerPhone: '09123456789' });
  });

  it('opens the owner panel only when the refreshed session has a salon context', async () => {
    refreshAuth.mockResolvedValue({ id: 'owner-1', role: 'Owner', salonId: 'salon-1' });
    renderAuth();

    await completeOtpLogin();
    expect(await screen.findByText('owner-panel-route')).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('current-location').textContent ?? '{}').pathname).toBe(
      '/owner',
    );
  });

  it('keeps a genuine booking return in the booking funnel', async () => {
    const returnState = { serviceId: 'service-1', startAt: '2999-03-15T09:30:00.000Z' };
    renderAuth({
      pathname: '/auth',
      state: { returnTo: '/salon/salon-1/book/confirm', returnState },
    });

    await completeOtpLogin();
    expect(await screen.findByText('booking-confirm-route')).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('current-location').textContent ?? '{}')).toEqual({
      pathname: '/salon/salon-1/book/confirm',
      state: { ...returnState, autoConfirm: true },
    });
  });

  it('returns a waitlist sign-in to its selected salon and service', async () => {
    const returnState = { serviceId: 'service-1', date: '2999-03-15' };
    renderAuth({
      pathname: '/auth',
      state: { returnTo: '/salon/salon-1/waitlist', returnState },
    });

    await completeOtpLogin();
    expect(await screen.findByText('waitlist-route')).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('current-location').textContent ?? '{}')).toEqual({
      pathname: '/salon/salon-1/waitlist',
      state: returnState,
    });
  });
});
