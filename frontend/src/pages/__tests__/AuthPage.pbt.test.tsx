import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import fc from 'fast-check';
import '../../i18n';

/**
 * Property-Based Tests — OTP Reading-Order and Preservation
 *
 * Uses fast-check to verify properties across many generated inputs.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 3.1, 3.2**
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

import { AuthPage, normalizePhone } from '../AuthPage';
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

describe('AuthPage — Property-Based Tests', () => {
  /**
   * Property 1 (fix check): For any generated complete 6-digit code, entering
   * it in reading order (leftmost box first) submits exactly that string to
   * `verifyOtp`.
   *
   * **Validates: Requirements 2.1, 2.2, 2.3**
   */
  it(
    'Property 1: any 6-digit code entered in reading order submits that exact string',
    { timeout: 60_000 },
    async () => {
      const persianLabels = [
        'رقم ۱ کد تایید',
        'رقم ۲ کد تایید',
        'رقم ۳ کد تایید',
        'رقم ۴ کد تایید',
        'رقم ۵ کد تایید',
        'رقم ۶ کد تایید',
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
            minLength: 6,
            maxLength: 6,
          }),
          async (code) => {
            // Reset mocks and DOM between iterations
            vi.clearAllMocks();
            requestOtp.mockResolvedValue(undefined);
            verifyOtp.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
            cleanup();

            // Advance to the OTP step
            await advanceToOtp();

            // Enter digits in reading order (leftmost box first)
            for (let i = 0; i < 6; i++) {
              const input = screen.getByLabelText(persianLabels[i]);
              fireEvent.change(input, { target: { value: code[i] } });
            }

            // The final digit auto-submits the completed OTP.
            await waitFor(() => {
              expect(verifyOtp).toHaveBeenCalledWith(VALID_PHONE, code);
            });
          },
        ),
        { numRuns: 25 },
      );
    },
  );

  /**
   * Property 2 (preservation — paste order): For any generated 6-digit paste
   * string, the boxes fill left-to-right and the submitted value equals the
   * pasted string.
   *
   * **Validates: Requirement 3.2**
   */
  it(
    'Property 2 (paste): any 6-digit paste fills left-to-right and submits pasted string',
    { timeout: 60_000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
            minLength: 6,
            maxLength: 6,
          }),
          async (code) => {
            // Reset mocks and DOM between iterations
            vi.clearAllMocks();
            requestOtp.mockResolvedValue(undefined);
            verifyOtp.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
            cleanup();

            // Advance to the OTP step
            await advanceToOtp();

            // Paste full code into the first box
            const firstBox = screen.getByLabelText('رقم ۱ کد تایید');
            fireEvent.paste(firstBox, {
              clipboardData: { getData: () => code },
            });

            // Verify boxes filled left-to-right
            await waitFor(() => {
              expect(screen.getByLabelText('رقم ۶ کد تایید')).toHaveValue(code[5]);
            });

            // A complete paste auto-submits the OTP.
            await waitFor(() => {
              expect(verifyOtp).toHaveBeenCalledWith(VALID_PHONE, code);
            });
          },
        ),
        { numRuns: 25 },
      );
    },
  );

  /**
   * Property 2 (preservation — phone handling): For any generated valid phone
   * (including +98 / 0098 / Persian-digit variants), the normalized
   * `09xxxxxxxxx` is submitted unchanged to `requestOtp`/`verifyOtp`.
   *
   * **Validates: Requirement 3.1**
   */
  it(
    'Property 2 (phone): any valid phone variant normalizes to 09xxxxxxxxx and is submitted correctly',
    { timeout: 60_000 },
    async () => {
      // Persian digit mapping
      const toPersian = (d: string) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)];

      await fc.assert(
        fc.asyncProperty(
          // Generate 9 random digits after the leading '9' (the initial '0' or prefix is added by the variant)
          fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
            minLength: 9,
            maxLength: 9,
          }),
          // Choose a phone format variant
          fc.constantFrom('plain', '+98', '0098', 'persian'),
          async (nineDigits, variant) => {
            // The canonical form is 09 + <first digit of nineDigits tells which operator> + remaining 8
            const canonical = `09${nineDigits}`;

            // Build the raw phone string based on the variant
            let rawPhone: string;
            switch (variant) {
              case 'plain':
                rawPhone = canonical; // 09xxxxxxxxx
                break;
              case '+98':
                rawPhone = `+989${nineDigits}`; // +989xxxxxxxxx
                break;
              case '0098':
                rawPhone = `00989${nineDigits}`; // 00989xxxxxxxxx
                break;
              case 'persian':
                rawPhone = canonical.split('').map(toPersian).join(''); // ۰۹xxxxxxxxx in Persian digits
                break;
              default:
                rawPhone = canonical;
            }

            // Verify normalizePhone produces the canonical form
            const normalized = normalizePhone(rawPhone);
            expect(normalized).toBe(canonical);

            // Reset mocks and DOM between iterations
            vi.clearAllMocks();
            requestOtp.mockResolvedValue(undefined);
            verifyOtp.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
            cleanup();

            // Render and enter phone
            renderAuth();
            fireEvent.change(screen.getByLabelText('شماره موبایل'), {
              target: { value: rawPhone },
            });
            fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }));

            // Assert requestOtp is called with the normalized canonical phone
            await waitFor(() => {
              expect(requestOtp).toHaveBeenCalledWith(canonical);
            });
          },
        ),
        { numRuns: 25 },
      );
    },
  );
});
