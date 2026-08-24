import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { expectNoSeriousA11yViolations } from '../../test/a11y';

/**
 * Tests for the redesigned phone + OTP auth page (task 6.1; R4.1, R4.2, R7.6;
 * ui-ux §7, §10, §11). They cover: the phone step with Iranian-pattern
 * validation + digit normalization, the «کد ارسال شد» send toast, the
 * provider-sized OTP step with auto-advance / paste / backspace, the resend timer in Persian
 * digits, the inline `role="alert"` error that preserves entered data, and the
 * preserved `auth-page` testID.
 */

const requestOtp = vi.fn();
const verifyOtp = vi.fn();
const setAccessToken = vi.fn();

vi.mock('../../api/client', () => ({
  setAccessToken: (token: string | null) => setAccessToken(token),
  setRefreshToken: vi.fn(),
  authApi: {
    requestOtp: (phone: string) => requestOtp(phone),
    verifyOtp: (phone: string, code: string) => verifyOtp(phone, code),
  },
}));

import { AuthPage, normalizePhone } from '../AuthPage';
import { ToastProvider } from '../../components/ui/Toast';

function renderAuth() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/auth']}>
        <ToastProvider>
          <AuthPage />
        </ToastProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

const VALID_PHONE = '09123456789';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  requestOtp.mockResolvedValue(undefined);
  verifyOtp.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('normalizePhone', () => {
  it('passes a canonical 09 number through unchanged', () => {
    expect(normalizePhone('09123456789')).toBe('09123456789');
  });

  it('rewrites +98 / 0098 / 98 prefixes to a leading 0', () => {
    expect(normalizePhone('+989123456789')).toBe('09123456789');
    expect(normalizePhone('00989123456789')).toBe('09123456789');
    expect(normalizePhone('989123456789')).toBe('09123456789');
  });

  it('normalizes Persian digits and strips spacing/punctuation', () => {
    expect(normalizePhone('۰۹۱۲ ۳۴۵ ۶۷۸۹')).toBe('09123456789');
    expect(normalizePhone('(0912) 345-6789')).toBe('09123456789');
  });
});

describe('AuthPage — phone step', () => {
  it('preserves the auth-page testID', () => {
    renderAuth();
    expect(screen.getByTestId('auth-page')).toBeInTheDocument();
  });

  it('rejects an invalid phone with an inline error and no API call', async () => {
    renderAuth();
    fireEvent.change(screen.getByLabelText('شماره موبایل'), {
      target: { value: '0912' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it('sends the OTP for a valid (normalized) phone and shows the «کد ارسال شد» toast', async () => {
    renderAuth();
    fireEvent.change(screen.getByLabelText('شماره موبایل'), {
      target: { value: '+989123456789' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }));

    await waitFor(() => expect(requestOtp).toHaveBeenCalledWith(VALID_PHONE));
    expect(await screen.findByText('کد تایید ارسال شد')).toBeInTheDocument();
  });

  it('shows a friendly inline error when the request fails, keeping the entered phone', async () => {
    requestOtp.mockRejectedValueOnce(new Error('network'));
    renderAuth();
    const input = screen.getByLabelText('شماره موبایل') as HTMLInputElement;
    fireEvent.change(input, { target: { value: VALID_PHONE } });
    fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(input.value).toBe(VALID_PHONE);
  });
});

describe('AuthPage — OTP step', () => {
  async function advanceToOtp() {
    renderAuth();
    fireEvent.change(screen.getByLabelText('شماره موبایل'), {
      target: { value: VALID_PHONE },
    });
    fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }));
    await screen.findByLabelText('رقم ۱ کد تایید');
  }

  it('renders six single-digit boxes', async () => {
    await advanceToOtp();
    const persianDigits = ['۱', '۲', '۳', '۴', '۵', '۶'];
    for (const d of persianDigits) {
      expect(screen.getByLabelText(`رقم ${d} کد تایید`)).toBeInTheDocument();
    }
  });

  it('renders the provider-reported ten-digit OTP length', async () => {
    requestOtp.mockResolvedValueOnce({ otpLength: 10 });
    await advanceToOtp();

    expect(screen.getByLabelText('رقم ۱۰ کد تایید')).toBeInTheDocument();
    const first = screen.getByLabelText('رقم ۱ کد تایید');
    fireEvent.paste(first, {
      clipboardData: { getData: () => '3741437414' },
    });
    await waitFor(() => expect(screen.getByLabelText('رقم ۱۰ کد تایید')).toHaveValue('4'));
    fireEvent.click(screen.getByRole('button', { name: 'تایید و ورود' }));
    await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith(VALID_PHONE, '3741437414'));
  });

  it('fills a temporary development OTP returned by the API', async () => {
    requestOtp.mockResolvedValueOnce({ devOtp: '123456' });
    await advanceToOtp();

    expect(screen.getByLabelText('رقم ۱ کد تایید')).toHaveValue('1');
    expect(screen.getByLabelText('رقم ۶ کد تایید')).toHaveValue('6');
  });

  it('auto-advances focus to the next box on entry', async () => {
    await advanceToOtp();
    const first = screen.getByLabelText('رقم ۱ کد تایید');
    fireEvent.change(first, { target: { value: '1' } });
    expect(screen.getByLabelText('رقم ۲ کد تایید')).toHaveFocus();
  });

  it('supports full paste of the 6-digit code', async () => {
    await advanceToOtp();
    const first = screen.getByLabelText('رقم ۱ کد تایید') as HTMLInputElement;
    fireEvent.paste(first, {
      clipboardData: { getData: () => '123456' },
    });
    await waitFor(() => expect(screen.getByLabelText('رقم ۶ کد تایید')).toHaveValue('6'));
    fireEvent.click(screen.getByRole('button', { name: 'تایید و ورود' }));
    await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith(VALID_PHONE, '123456'));
  });

  it('moves focus to the previous box on backspace in an empty box', async () => {
    await advanceToOtp();
    const second = screen.getByLabelText('رقم ۲ کد تایید');
    second.focus();
    fireEvent.keyDown(second, { key: 'Backspace' });
    expect(screen.getByLabelText('رقم ۱ کد تایید')).toHaveFocus();
  });

  it('shows an inline role="alert" error on verify failure without leaving the OTP step', async () => {
    verifyOtp.mockRejectedValueOnce(new Error('bad code'));
    await advanceToOtp();
    const first = screen.getByLabelText('رقم ۱ کد تایید') as HTMLInputElement;
    fireEvent.paste(first, { clipboardData: { getData: () => '000000' } });
    await waitFor(() => expect(screen.getByLabelText('رقم ۶ کد تایید')).toHaveValue('0'));
    fireEvent.click(screen.getByRole('button', { name: 'تایید و ورود' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // Still on the OTP step.
    expect(screen.getByLabelText('رقم ۱ کد تایید')).toBeInTheDocument();
  });

  it('disables resend while the Persian-digit timer counts down', async () => {
    await advanceToOtp();
    // Right after sending, the resend cooldown is active: the timer text shows
    // (with Persian digits) and the resend button is not yet available.
    expect(screen.getByText(/ارسال مجدد تا/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ارسال مجدد کد' })).not.toBeInTheDocument();
  });

  it('lets the user go back to the phone step to edit the number', async () => {
    await advanceToOtp();
    fireEvent.click(screen.getByRole('button', { name: 'ویرایش شماره موبایل' }));
    // AnimatePresence mode="wait" plays the OTP step's exit before the phone
    // step re-enters — await the field rather than expecting it synchronously.
    expect(await screen.findByLabelText('شماره موبایل')).toBeInTheDocument();
  });
});

describe('AuthPage — booking return intent', () => {
  /** Probe standing in for the booking-confirm route; surfaces the router state. */
  function ReturnProbe() {
    const location = useLocation();
    return <div>return-page:{JSON.stringify(location.state)}</div>;
  }

  it('routes back to the booking funnel with autoConfirm after OTP verification', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/auth',
              state: {
                returnTo: '/salon/salon-1/book/confirm',
                returnState: {
                  serviceId: 'svc-1',
                  startAt: '2999-03-15T09:30:00.000Z',
                },
              },
            },
          ]}
        >
          <Routes>
            <Route
              path="/auth"
              element={
                <ToastProvider>
                  <AuthPage />
                </ToastProvider>
              }
            />
            <Route path="/salon/:salonId/book/confirm" element={<ReturnProbe />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    );

    // Phone step → request the code.
    fireEvent.change(screen.getByLabelText('شماره موبایل'), {
      target: { value: VALID_PHONE },
    });
    fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }));

    // OTP step → paste the 6 digits and verify.
    const first = await screen.findByLabelText('رقم ۱ کد تایید');
    fireEvent.paste(first, { clipboardData: { getData: () => '123456' } });
    await waitFor(() => expect(screen.getByLabelText('رقم ۶ کد تایید')).toHaveValue('6'));
    fireEvent.click(screen.getByRole('button', { name: 'تایید و ورود' }));

    // Landed back on the booking funnel with the selection + the resume flag.
    const probe = await screen.findByText(/^return-page:/);
    const state = JSON.parse(probe.textContent!.slice('return-page:'.length));
    expect(state.autoConfirm).toBe(true);
    expect(state.serviceId).toBe('svc-1');
    expect(state.startAt).toBe('2999-03-15T09:30:00.000Z');
  });
});

describe('AuthPage — accessibility', () => {
  it('has no serious or critical a11y violations on the phone step', async () => {
    const { getByTestId } = renderAuth();
    await expectNoSeriousA11yViolations(getByTestId('auth-page'));
  });

  it('has no serious or critical a11y violations on the OTP step', async () => {
    const { getByTestId } = renderAuth();
    fireEvent.change(within(getByTestId('auth-page')).getByLabelText('شماره موبایل'), {
      target: { value: VALID_PHONE },
    });
    fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }));
    await screen.findByLabelText('رقم ۱ کد تایید');
    await expectNoSeriousA11yViolations(getByTestId('auth-page'));
  });
});
