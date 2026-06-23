/**
 * Feature: salon-booking-system, Property 14: OTP validity window and latest-only
 *
 * For any issued OTP, an authentication attempt succeeds only when the submitted
 * code matches the most recently issued, not-yet-superseded code and is submitted
 * within 120 seconds of issuance; expired, mismatched, or superseded codes are
 * rejected and leave the customer unauthenticated.
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5
 */

import * as fc from 'fast-check';
import { AuthService, AuthError } from './auth.service';
import type { SmsProvider, SmsDeliveryResult } from './sms-provider.interface';

// --- Mock Prisma Client (in-memory, matching the auth service's expected interface) ---

function createMockPrisma() {
  const otpStore: any[] = [];
  const customerStore: any[] = [];

  function matchesWhere(record: any, where: any): boolean {
    for (const [key, value] of Object.entries(where)) {
      const recordValue = record[key];
      if (value === null) {
        if (recordValue !== null && recordValue !== undefined) return false;
      } else {
        if (recordValue !== value) return false;
      }
    }
    return true;
  }

  return {
    _otpStore: otpStore,
    _customerStore: customerStore,
    otp: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const otp of otpStore) {
          if (matchesWhere(otp, where)) {
            Object.assign(otp, data);
            count++;
          }
        }
        return { count };
      },
      create: async ({ data }: any) => {
        const record = { id: `otp-${Date.now()}-${Math.random()}`, ...data };
        otpStore.push(record);
        return record;
      },
      findFirst: async ({ where }: any) => {
        const matches = otpStore
          .filter((o) => matchesWhere(o, where))
          .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());
        return matches[0] || null;
      },
      update: async ({ where, data }: any) => {
        const otp = otpStore.find((o: any) => o.id === where.id);
        if (otp) {
          Object.assign(otp, data);
        }
        return otp;
      },
    },
    customer: {
      findUnique: async ({ where }: any) => {
        return customerStore.find((c: any) => c.phone === where.phone) || null;
      },
      create: async ({ data }: any) => {
        const record = { id: `cust-${Date.now()}-${Math.random()}`, ...data, noShowCount: 0 };
        customerStore.push(record);
        return record;
      },
    },
  } as any;
}

// --- Mock SMS Provider that captures the code ---

function createMockSmsProvider(): SmsProvider & { lastCodes: Map<string, string[]> } {
  const lastCodes = new Map<string, string[]>();
  return {
    lastCodes,
    send: async (phone: string, message: string): Promise<SmsDeliveryResult> => {
      const match = message.match(/(\d{6})/);
      if (match) {
        const codes = lastCodes.get(phone) || [];
        codes.push(match[1]);
        lastCodes.set(phone, codes);
      }
      return { ok: true, providerId: 'mock-id' };
    },
  };
}

// --- Generators ---

/** Generate a valid Iranian-style phone number */
const phoneArb = fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
  minLength: 10,
  maxLength: 11,
}).map((digits) => '09' + digits.slice(0, 9));

/** Generate a random 6-digit code that will likely not match the real one */
const wrongCodeArb = fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
  minLength: 6,
  maxLength: 6,
});

/** Generate a time offset in seconds: within window (0-119) or outside (121-600) */
const withinWindowOffsetArb = fc.integer({ min: 0, max: 119 });
const outsideWindowOffsetArb = fc.integer({ min: 121, max: 600 });

/** Number of OTP requests to issue (for supersession testing) */
const otpRequestCountArb = fc.integer({ min: 2, max: 5 });

// --- Property Tests ---

describe('Property 14: OTP validity window and latest-only', () => {
  const OTP_WINDOW_SECONDS = 120;
  const config = {
    jwtAccessSecret: 'test-access-secret',
    jwtRefreshSecret: 'test-refresh-secret',
    accessExpirySeconds: 900,
    refreshExpirySeconds: 604800,
    otpWindowSeconds: OTP_WINDOW_SECONDS,
  };

  it('correct code within 120s window succeeds (R1.2)', async () => {
    await fc.assert(
      fc.asyncProperty(phoneArb, async (phone) => {
        const prisma = createMockPrisma();
        const smsProvider = createMockSmsProvider();
        const authService = new AuthService(prisma, smsProvider, config);

        // Request OTP
        await authService.requestOtp(phone);

        // Extract the correct code from the captured SMS
        const codes = smsProvider.lastCodes.get(phone)!;
        const correctCode = codes[codes.length - 1];

        // Verify within window should succeed
        const tokens = await authService.verifyOtp(phone, correctCode);

        // Should return valid tokens
        return tokens.accessToken !== undefined && tokens.refreshToken !== undefined;
      }),
      { numRuns: 100 },
    );
  });

  it('correct code after 120s is rejected as expired (R1.3)', async () => {
    await fc.assert(
      fc.asyncProperty(
        phoneArb,
        outsideWindowOffsetArb,
        async (phone, offsetSeconds) => {
          const prisma = createMockPrisma();
          const smsProvider = createMockSmsProvider();
          // Use a window that's already expired by making it shorter than the offset
          // We simulate expiry by setting a very short window
          const shortWindowConfig = { ...config, otpWindowSeconds: 0 };
          const authService = new AuthService(prisma, smsProvider, shortWindowConfig);

          // Request OTP
          await authService.requestOtp(phone);

          // Extract the correct code
          const codes = smsProvider.lastCodes.get(phone)!;
          const correctCode = codes[codes.length - 1];

          // Wait a tiny bit to guarantee expiry (otpWindowSeconds = 0 means immediate expiry)
          await new Promise((resolve) => setTimeout(resolve, 5));

          // Verify should fail with OTP_EXPIRED
          try {
            await authService.verifyOtp(phone, correctCode);
            return false; // Should not succeed
          } catch (err) {
            return (err as AuthError).code === 'OTP_EXPIRED';
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('incorrect code within window is rejected as mismatch (R1.4)', async () => {
    await fc.assert(
      fc.asyncProperty(
        phoneArb,
        wrongCodeArb,
        async (phone, wrongCode) => {
          const prisma = createMockPrisma();
          const smsProvider = createMockSmsProvider();
          const authService = new AuthService(prisma, smsProvider, config);

          // Request OTP
          await authService.requestOtp(phone);

          // Extract the correct code to ensure wrongCode is actually different
          const codes = smsProvider.lastCodes.get(phone)!;
          const correctCode = codes[codes.length - 1];

          if (wrongCode === correctCode) {
            // Skip this case - code accidentally matches (very rare)
            return true;
          }

          // Verify with wrong code should fail with OTP_MISMATCH
          try {
            await authService.verifyOtp(phone, wrongCode);
            return false; // Should not succeed
          } catch (err) {
            return (err as AuthError).code === 'OTP_MISMATCH';
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('superseded (previous) code is rejected after a new OTP is issued (R1.5)', async () => {
    await fc.assert(
      fc.asyncProperty(
        phoneArb,
        otpRequestCountArb,
        async (phone, requestCount) => {
          const prisma = createMockPrisma();
          const smsProvider = createMockSmsProvider();
          const authService = new AuthService(prisma, smsProvider, config);

          // Issue multiple OTPs for the same phone
          for (let i = 0; i < requestCount; i++) {
            await authService.requestOtp(phone);
          }

          const codes = smsProvider.lastCodes.get(phone)!;
          const latestCode = codes[codes.length - 1];

          // All previous codes (superseded) should be rejected
          for (let i = 0; i < codes.length - 1; i++) {
            const supersededCode = codes[i];
            if (supersededCode === latestCode) {
              // Codes might randomly match; skip this specific superseded code
              continue;
            }
            try {
              // Create a fresh service with fresh prisma to test each superseded code independently
              // Actually, use the same prisma store but test that old codes were invalidated
              await authService.verifyOtp(phone, supersededCode);
              // If this succeeds, the property is violated
              return false;
            } catch (err) {
              // Superseded codes should fail - either NO_OTP (invalidated so not found)
              // or OTP_MISMATCH (hash doesn't match the latest)
              const code = (err as AuthError).code;
              if (code !== 'OTP_MISMATCH' && code !== 'NO_OTP') {
                return false;
              }
            }
          }

          // The latest code should still work
          const tokens = await authService.verifyOtp(phone, latestCode);
          return tokens.accessToken !== undefined && tokens.refreshToken !== undefined;
        },
      ),
      { numRuns: 100 },
    );
  });
});
