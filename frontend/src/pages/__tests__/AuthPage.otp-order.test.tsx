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
 * GOAL: Demonstrate that a complete, non-palindrome 6-digit code entered
 * left-to-right (reading order) is submitted to `verifyOtp` in the correct
 * reading order. On the UNFIXED code, the expectation is:
 *
 * - Tests 1–3 (digit order assertions): may PASS in jsdom because jsdom does
 *   NOT compute flex layout direction — DOM source order and "visual" order
 *   coincide regardless of `dir` attributes.
 * - Test 4 (direction guard): SHOULD FAIL because the OTP row container has
 *   `dir="ltr"` but does NOT have an inline `style.direction = 'ltr'` — the
 *   cascade-proof guard is missing, confirming the RTL vulnerability.
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
 * rightmost box `رقم ۶`), firing a `change` event per box. The final digit
 * auto-submits the OTP.
 */
async function enterDigitsInReadingOrderAndSubmit(digits: string[]) {
  const persianLabels = [
    'رقم ۱ کد تایید',
    'رقم ۲ کد تایید',
    'رقم ۳ کد تایید',
    'رقم ۴ کد تایید',
    'رقم ۵ کد تایید',
    'رقم ۶ کد تایید',
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
   * Enter `1,3,3,3,8,9` leftmost→rightmost; assert verifyOtp is called with
   * the reading-order string '133389'.
   *
   * On unfixed code in a real browser, the submitted value would be '983331'
   * (reversed). In jsdom, this may pass because jsdom ignores flex direction.
   */
  it('case 1: reading-order entry of "133389" submits "133389" (not reversed)', async () => {
    await advanceToOtp();
    await enterDigitsInReadingOrderAndSubmit(['1', '3', '3', '3', '8', '9']);

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith(VALID_PHONE, '133389');
    });
  });

  /**
   * Test case 2 (distinct digits):
   * Enter `1,2,3,4,5,6` leftmost→rightmost; assert verifyOtp is called with
   * '123456'.
   *
   * On unfixed code in a real browser, submitted as '654321'.
   */
  it('case 2: reading-order entry of "123456" submits "123456" (not reversed)', async () => {
    await advanceToOtp();
    await enterDigitsInReadingOrderAndSubmit(['1', '2', '3', '4', '5', '6']);

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith(VALID_PHONE, '123456');
    });
  });

  /**
   * Test case 3 (asymmetric edge):
   * Enter `1,0,0,0,0,0` leftmost→rightmost; assert verifyOtp is called with
   * '100000'.
   *
   * On unfixed code in a real browser, submitted as '000001'.
   */
  it('case 3: reading-order entry of "100000" submits "100000" (not reversed)', async () => {
    await advanceToOtp();
    await enterDigitsInReadingOrderAndSubmit(['1', '0', '0', '0', '0', '0']);

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith(VALID_PHONE, '100000');
    });
  });

  /**
   * Test case 4 (row-direction guard):
   * Assert the OTP boxes' flex container has BOTH `dir="ltr"` AND an inline
   * `style.direction = 'ltr'` to cascade-proof the left-to-right layout against
   * inherited RTL direction.
   *
   * On UNFIXED code, the container has `dir="ltr"` but does NOT have
   * `style={{ direction: 'ltr' }}` — this test SHOULD FAIL, confirming the
   * cascade vulnerability that causes the digit reversal in real browsers.
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
    // flex layout. On unfixed code, this assertion SHOULD FAIL because
    // only the `dir` attribute is present (which can be defeated by
    // CSS cascade in a real RTL browser).
    expect(otpRow.style.direction).toBe('ltr');
  });
});
