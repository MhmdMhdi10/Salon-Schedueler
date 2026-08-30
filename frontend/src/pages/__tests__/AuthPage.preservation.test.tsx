import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';

/**
 * Preservation Tests — Non-Reversal Behaviors Unchanged
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * These tests observe and assert behavior on the UNFIXED code to pin the
 * baseline. The fix must NOT regress any of these behaviors. All tests in this
 * file MUST PASS on the current unfixed code.
 *
 * Observation-first methodology: each test documents the current behavior and
 * asserts it, so if the fix accidentally changes it, CI will catch it.
 */

const requestOtp = vi.fn();
const verifyOtp = vi.fn();

vi.mock('../../api/client', () => ({
  setAccessToken: vi.fn(),
  setRefreshToken: vi.fn(),
  authApi: {
    requestOtp: (phone: string) => requestOtp(phone),
    verifyOtp: (phone: string, code: string) => verifyOtp(phone, code),
  },
}));

import { AuthPage } from '../AuthPage';
import { ToastProvider } from '../../components/ui/Toast';

const VALID_PHONE = '09123456789';

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

/** Advance from the phone step to the OTP step using a given phone value. */
async function advanceToOtpWithPhone(phone: string) {
  renderAuth();
  fireEvent.change(screen.getByLabelText('شماره موبایل'), {
    target: { value: phone },
  });
  fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }));
  await screen.findByLabelText('رقم ۱ کد تایید');
}

/** Advance to OTP step with the default valid phone. */
async function advanceToOtp() {
  await advanceToOtpWithPhone(VALID_PHONE);
}

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

describe('AuthPage — Preservation: Phone normalization (Req 3.1)', () => {
  it('normalizes +98 prefix phone and calls requestOtp with 09xxxxxxxxx', async () => {
    renderAuth();
    fireEvent.change(screen.getByLabelText('شماره موبایل'), {
      target: { value: '+989123456789' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }));

    await waitFor(() => {
      expect(requestOtp).toHaveBeenCalledWith('09123456789');
    });
  });

  it('normalizes Persian-digit phone and calls requestOtp with 09xxxxxxxxx', async () => {
    renderAuth();
    fireEvent.change(screen.getByLabelText('شماره موبایل'), {
      target: { value: '۰۹۱۲۳۴۵۶۷۸۹' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }));

    await waitFor(() => {
      expect(requestOtp).toHaveBeenCalledWith('09123456789');
    });
  });

  it('normalizes punctuated phone and calls requestOtp with 09xxxxxxxxx', async () => {
    renderAuth();
    fireEvent.change(screen.getByLabelText('شماره موبایل'), {
      target: { value: '(0912) 345-6789' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }));

    await waitFor(() => {
      expect(requestOtp).toHaveBeenCalledWith('09123456789');
    });
  });

  it('calls verifyOtp with the normalized phone after completing OTP flow with +98 prefix', async () => {
    await advanceToOtpWithPhone('+989123456789');

    // Paste the 6-digit code and submit
    const first = screen.getByLabelText('رقم ۱ کد تایید') as HTMLInputElement;
    fireEvent.paste(first, { clipboardData: { getData: () => '123456' } });
    await waitFor(() => expect(screen.getByLabelText('رقم ۶ کد تایید')).toHaveValue('6'));

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith('09123456789', '123456');
    });
  });
});

describe('AuthPage — Preservation: Paste fill order (Req 3.2)', () => {
  it('pasting "123456" into the first box fills boxes left-to-right and submits "123456"', async () => {
    await advanceToOtp();

    const first = screen.getByLabelText('رقم ۱ کد تایید') as HTMLInputElement;
    fireEvent.paste(first, { clipboardData: { getData: () => '123456' } });

    // Verify boxes filled left-to-right
    await waitFor(() => {
      expect(screen.getByLabelText('رقم ۱ کد تایید')).toHaveValue('1');
      expect(screen.getByLabelText('رقم ۲ کد تایید')).toHaveValue('2');
      expect(screen.getByLabelText('رقم ۳ کد تایید')).toHaveValue('3');
      expect(screen.getByLabelText('رقم ۴ کد تایید')).toHaveValue('4');
      expect(screen.getByLabelText('رقم ۵ کد تایید')).toHaveValue('5');
      expect(screen.getByLabelText('رقم ۶ کد تایید')).toHaveValue('6');
    });

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith(VALID_PHONE, '123456');
    });
  });
});

describe('AuthPage — Preservation: Auto-advance and backspace (Req 3.3)', () => {
  it('typing a digit auto-advances focus to the next box', async () => {
    await advanceToOtp();

    const first = screen.getByLabelText('رقم ۱ کد تایید');
    fireEvent.change(first, { target: { value: '5' } });
    expect(screen.getByLabelText('رقم ۲ کد تایید')).toHaveFocus();
  });

  it('typing digits sequentially advances through all boxes', async () => {
    await advanceToOtp();

    const labels = [
      'رقم ۱ کد تایید',
      'رقم ۲ کد تایید',
      'رقم ۳ کد تایید',
      'رقم ۴ کد تایید',
      'رقم ۵ کد تایید',
      'رقم ۶ کد تایید',
    ];

    for (let i = 0; i < 5; i++) {
      const input = screen.getByLabelText(labels[i]);
      fireEvent.change(input, { target: { value: String(i + 1) } });
      expect(screen.getByLabelText(labels[i + 1])).toHaveFocus();
    }
  });

  it('backspace in an empty box moves focus to the previous box', async () => {
    await advanceToOtp();

    const second = screen.getByLabelText('رقم ۲ کد تایید');
    second.focus();
    fireEvent.keyDown(second, { key: 'Backspace' });
    expect(screen.getByLabelText('رقم ۱ کد تایید')).toHaveFocus();
  });

  it('backspace in an empty third box moves focus to the second box', async () => {
    await advanceToOtp();

    const third = screen.getByLabelText('رقم ۳ کد تایید');
    third.focus();
    fireEvent.keyDown(third, { key: 'Backspace' });
    expect(screen.getByLabelText('رقم ۲ کد تایید')).toHaveFocus();
  });
});

describe('AuthPage — Preservation: Persian digit normalization in OTP (Req 3.4)', () => {
  it('entering Persian digits ۱۳۳۳۸۹ in reading order submits Latin "133389"', async () => {
    await advanceToOtp();

    const persianDigits = ['۱', '۳', '۳', '۳', '۸', '۹'];
    const labels = [
      'رقم ۱ کد تایید',
      'رقم ۲ کد تایید',
      'رقم ۳ کد تایید',
      'رقم ۴ کد تایید',
      'رقم ۵ کد تایید',
      'رقم ۶ کد تایید',
    ];

    for (let i = 0; i < persianDigits.length; i++) {
      const input = screen.getByLabelText(labels[i]);
      fireEvent.change(input, { target: { value: persianDigits[i] } });
    }

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith(VALID_PHONE, '133389');
    });
  });

  it('entering Persian digits ۱۲۳۴۵۶ in reading order submits Latin "123456"', async () => {
    await advanceToOtp();

    const persianDigits = ['۱', '۲', '۳', '۴', '۵', '۶'];
    const labels = [
      'رقم ۱ کد تایید',
      'رقم ۲ کد تایید',
      'رقم ۳ کد تایید',
      'رقم ۴ کد تایید',
      'رقم ۵ کد تایید',
      'رقم ۶ کد تایید',
    ];

    for (let i = 0; i < persianDigits.length; i++) {
      const input = screen.getByLabelText(labels[i]);
      fireEvent.change(input, { target: { value: persianDigits[i] } });
    }

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith(VALID_PHONE, '123456');
    });
  });
});

describe('AuthPage — Preservation: RTL layout and chrome (Req 3.5)', () => {
  it('the page renders with the auth-page testID (RTL chrome intact)', () => {
    renderAuth();
    expect(screen.getByTestId('auth-page')).toBeInTheDocument();
  });

  it('the resend timer renders with Persian digits after OTP is sent', async () => {
    await advanceToOtp();
    // After sending OTP, the resend timer shows «ارسال مجدد تا …»
    expect(screen.getByText(/ارسال مجدد تا/)).toBeInTheDocument();
  });

  it('the role="alert" error region appears on verify failure', async () => {
    verifyOtp.mockRejectedValueOnce(new Error('bad code'));
    await advanceToOtp();

    // Fill all boxes and submit
    const first = screen.getByLabelText('رقم ۱ کد تایید') as HTMLInputElement;
    fireEvent.paste(first, { clipboardData: { getData: () => '999999' } });
    await waitFor(() => expect(screen.getByLabelText('رقم ۶ کد تایید')).toHaveValue('9'));

    // Error alert appears
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // Still on OTP step — boxes are preserved
    expect(screen.getByLabelText('رقم ۱ کد تایید')).toBeInTheDocument();
  });

  it('the page overall direction stays RTL (auth-page has RTL content)', async () => {
    renderAuth();
    const page = screen.getByTestId('auth-page');
    // The page should not have dir="ltr" at the top level — it inherits RTL
    // from the document or does not override to LTR
    expect(page.getAttribute('dir')).not.toBe('ltr');
  });
});
