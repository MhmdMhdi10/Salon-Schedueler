import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';

/**
 * Bug Condition Exploration Test — OTP Reading-Order Reversal
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * GOAL: Demonstrate that a complete, non-palindrome 4-digit code entered
 * left-to-right (reading order) is submitted to `verifyOtp` in the correct
 * reading order. On the UNFIXED code, the expectation is:
 *
 * - Tests 1–3 (digit order assertions): may PASS in jsdom because jsdom does
 *   NOT compute flex layout direction — DOM source order and "visual" order
 *   coincide regardless of `dir` attributes.
 * - Test 4 (direction guard): verifies the OTP row has cascade-proof LTR
 *   direction so RTL page styles cannot reverse the entered code.
 *
 * This test encodes the EXPECTED correct behavior. Any failure on unfixed code
 * documents the bug condition / cascade vulnerability.
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

/** Advance from the phone step to the OTP step. */
async function advanceToOtp() {
  renderAuth();
  fireEvent.change(screen.getByLabelText('شماره موبایل'), {
    target: { value: VALID_PHONE },
  });
  fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }));
  await screen.findByLabelText('رقم ۱ کد تایید');
}

/**
 * Enters digits by reading-order position (leftmost box `رقم ۱` first →
 * rightmost box `رقم ۴`), firing a `change` event per box. The final digit
 * auto-submits the OTP.
 */
async function enterDigitsInReadingOrderAndSubmit(digits: string[]) {
  const persianLabels = [
    'رقم ۱ کد تایید',
    'رقم ۲ کد تایید',
    'رقم ۳ کد تایید',
    'رقم ۴ کد تایید',
  ];

  for (let i = 0; i < digits.length; i++) {
    const input = screen.getByLabelText(persianLabels[i]);
    fireEvent.change(input, { target: { value: digits[i] } });
  }

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

describe('AuthPage — OTP reading-order bug condition exploration', () => {
  /**
   * Test case 1 (reported screenshot case):
   * Enter `1,3,3,8` leftmost→rightmost; assert verifyOtp is called with
   * the reading-order string '1338'.
   *
   * On unfixed code in a real browser, the submitted value would be '8331'
   * (reversed). In jsdom, this may pass because jsdom ignores flex direction.
   */
  it('case 1: reading-order entry of "1338" submits "1338" (not reversed)', async () => {
    await advanceToOtp();
    await enterDigitsInReadingOrderAndSubmit(['1', '3', '3', '8']);

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith(VALID_PHONE, '1338');
    });
  });

  /**
   * Test case 2 (distinct digits):
   * Enter `1,2,3,4` leftmost→rightmost; assert verifyOtp is called with
   * '1234'.
   *
   * On unfixed code in a real browser, submitted as '4321'.
   */
  it('case 2: reading-order entry of "1234" submits "1234" (not reversed)', async () => {
    await advanceToOtp();
    await enterDigitsInReadingOrderAndSubmit(['1', '2', '3', '4']);

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith(VALID_PHONE, '1234');
    });
  });

  /**
   * Test case 3 (asymmetric edge):
   * Enter `1,0,0,0` leftmost→rightmost; assert verifyOtp is called with
   * '1000'.
   *
   * On unfixed code in a real browser, submitted as '0001'.
   */
  it('case 3: reading-order entry of "1000" submits "1000" (not reversed)', async () => {
    await advanceToOtp();
    await enterDigitsInReadingOrderAndSubmit(['1', '0', '0', '0']);

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith(VALID_PHONE, '1000');
    });
  });

  /**
   * Test case 4 (row-direction guard):
   * Assert the OTP boxes' flex container has BOTH `dir="ltr"` AND an inline
   * `style.direction = 'ltr'` to cascade-proof the left-to-right layout against
   * inherited RTL direction.
   *
   * Both controls must remain in place so inherited RTL styles cannot reverse
   * the OTP row in a browser.
   */
  it('case 4: OTP boxes container has cascade-proof inline direction: ltr', async () => {
    await advanceToOtp();

    // Find the OTP row container — it's the parent flex container of the
    // individual OTP input boxes.
    const firstBox = screen.getByLabelText('رقم ۱ کد تایید');
    const otpRow = firstBox.parentElement!;

    // Assert the `dir` attribute is set to 'ltr'
    expect(otpRow.getAttribute('dir')).toBe('ltr');

    // Assert the inline style includes `direction: ltr` — this is the
    // cascade-proof guard that prevents inherited RTL from flipping the
    // flex layout in the RTL page.
    expect(otpRow.style.direction).toBe('ltr');
  });
});
