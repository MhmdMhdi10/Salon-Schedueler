import { AuthService, AuthError } from './auth.service';
import type { SmsProvider, SmsDeliveryResult } from './sms-provider.interface';
import * as jwt from 'jsonwebtoken';

// --- Mock Prisma Client ---

function createMockPrisma() {
  const otpStore: any[] = [];
  const customerStore: any[] = [];
  const staffStore: any[] = [];

  /**
   * Helper to match Prisma-style where clauses against a record.
   * Handles `null` matching both `null` and `undefined` (like Prisma does).
   */
  function matchesWhere(record: any, where: any): boolean {
    for (const [key, value] of Object.entries(where)) {
      const recordValue = record[key];
      if (value === null) {
        // Prisma treats null filter as "field is null" (matches undefined/null)
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
    _staffStore: staffStore,
    otp: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const otp of otpStore) {
          if (matchesWhere(otp, where)) {
            Object.assign(otp, data);
            count++;
          }
        }
        return { count };
      }),
      create: jest.fn(async ({ data }: any) => {
        const record = { id: `otp-${Date.now()}-${Math.random()}`, ...data };
        otpStore.push(record);
        return record;
      }),
      findFirst: jest.fn(async ({ where, orderBy }: any) => {
        const matches = otpStore
          .filter((o) => matchesWhere(o, where))
          .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());
        return matches[0] || null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const otp = otpStore.find((o) => o.id === where.id);
        if (otp) {
          Object.assign(otp, data);
        }
        return otp;
      }),
    },
    customer: {
      findUnique: jest.fn(async ({ where }: any) => {
        return customerStore.find((c) => c.phone === where.phone) || null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const record = { id: `cust-${Date.now()}`, ...data, noShowCount: 0 };
        customerStore.push(record);
        return record;
      }),
    },
    staffMember: {
      // Returns the first active staff member matching the phone, mirroring
      // `findFirst({ where: { phone, active: true } })`. Default store is empty
      // so plain-customer logins resolve to no staff (roleless token).
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          staffStore.find(
            (s) =>
              s.phone === where.phone &&
              (where.active === undefined || s.active === where.active),
          ) || null
        );
      }),
    },
  } as any;
}

// --- Mock SMS Provider ---

function createMockSmsProvider(): SmsProvider & { calls: Array<{ phone: string; message: string }> } {
  const calls: Array<{ phone: string; message: string }> = [];
  return {
    calls,
    send: jest.fn(async (phone: string, message: string): Promise<SmsDeliveryResult> => {
      calls.push({ phone, message });
      return { ok: true, providerId: 'mock-provider-id' };
    }),
  };
}

// --- Tests ---

describe('AuthService', () => {
  const config = {
    jwtAccessSecret: 'test-access-secret',
    jwtRefreshSecret: 'test-refresh-secret',
    accessExpirySeconds: 900,
    refreshExpirySeconds: 604800,
    otpWindowSeconds: 120,
  };

  let prisma: ReturnType<typeof createMockPrisma>;
  let smsProvider: ReturnType<typeof createMockSmsProvider>;
  let authService: AuthService;

  beforeEach(() => {
    prisma = createMockPrisma();
    smsProvider = createMockSmsProvider();
    authService = new AuthService(prisma, smsProvider, config);
  });

  describe('generateOtpCode', () => {
    it('should generate a 6-digit numeric string', () => {
      const code = authService.generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(code.length).toBe(6);
    });

    it('should generate different codes on subsequent calls', () => {
      const codes = new Set(Array.from({ length: 10 }, () => authService.generateOtpCode()));
      // With random generation, extremely unlikely to get all the same
      expect(codes.size).toBeGreaterThan(1);
    });
  });

  describe('hashCode', () => {
    it('should produce a consistent SHA-256 hex digest', () => {
      const hash1 = authService.hashCode('123456');
      const hash2 = authService.hashCode('123456');
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different codes', () => {
      const hash1 = authService.hashCode('123456');
      const hash2 = authService.hashCode('654321');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('requestOtp', () => {
    it('should invalidate previous OTPs, create a new one, and send SMS (R1.1, R1.5)', async () => {
      const phone = '09123456789';

      await authService.requestOtp(phone);

      // Should have invalidated previous OTPs
      expect(prisma.otp.updateMany).toHaveBeenCalledWith({
        where: { phone, invalidated: false, consumedAt: null },
        data: { invalidated: true },
      });

      // Should have created a new OTP
      expect(prisma.otp.create).toHaveBeenCalledTimes(1);
      const createCall = (prisma.otp.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.phone).toBe(phone);
      expect(createCall.data.codeHash).toMatch(/^[a-f0-9]{64}$/);
      expect(createCall.data.invalidated).toBe(false);

      // Check 120s expiry window
      const issuedAt = createCall.data.issuedAt as Date;
      const expiresAt = createCall.data.expiresAt as Date;
      const diffMs = expiresAt.getTime() - issuedAt.getTime();
      expect(diffMs).toBe(120_000);

      // Should have sent SMS with 6-digit code
      expect(smsProvider.send).toHaveBeenCalledTimes(1);
      expect(smsProvider.calls[0].phone).toBe(phone);
      expect(smsProvider.calls[0].message).toMatch(/\d{6}/);
    });

    it('returns the generated code only when explicit autofill is enabled', async () => {
      const devService = new AuthService(prisma, smsProvider, {
        ...config,
        devOtpAutoFill: true,
      });

      const code = await devService.requestOtp('09123456789', { exposeCode: true });

      expect(code).toMatch(/^\d{6}$/);
      expect(smsProvider.calls[0].message).toContain(code);
    });
  });

  describe('verifyOtp', () => {
    it('should authenticate with correct code within window (R1.2)', async () => {
      const phone = '09123456789';

      // Request OTP first
      await authService.requestOtp(phone);

      // Extract the code from the SMS message
      const smsMessage = smsProvider.calls[0].message;
      const code = smsMessage.match(/(\d{6})/)?.[1];
      expect(code).toBeDefined();

      // Verify the OTP
      const tokens = await authService.verifyOtp(phone, code!);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();

      // Verify the access token
      const decoded = jwt.verify(tokens.accessToken, config.jwtAccessSecret) as jwt.JwtPayload;
      expect(decoded.sub).toBeDefined();
      expect(decoded.type).toBe('access');

      // OTP should be marked as consumed
      expect(prisma.otp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ consumedAt: expect.any(Date) }),
        }),
      );
    });

    it('should reject expired OTP (R1.3)', async () => {
      const phone = '09123456789';

      // Create a service with a very short window to simulate expiry
      const shortService = new AuthService(prisma, smsProvider, {
        ...config,
        otpWindowSeconds: 0, // expires immediately
      });

      await shortService.requestOtp(phone);

      // Extract code
      const smsMessage = smsProvider.calls[0].message;
      const code = smsMessage.match(/(\d{6})/)?.[1]!;

      // Wait a tiny bit to ensure it's expired
      await new Promise((resolve) => setTimeout(resolve, 10));

      await expect(shortService.verifyOtp(phone, code)).rejects.toThrow(AuthError);
      await expect(shortService.verifyOtp(phone, code)).rejects.toMatchObject({
        code: 'OTP_EXPIRED',
      });
    });

    it('should reject mismatched OTP code (R1.4)', async () => {
      const phone = '09123456789';
      await authService.requestOtp(phone);

      await expect(authService.verifyOtp(phone, '000000')).rejects.toThrow(AuthError);
      await expect(authService.verifyOtp(phone, '999999')).rejects.toMatchObject({
        code: 'OTP_MISMATCH',
      });
    });

    it('should reject when no OTP exists', async () => {
      await expect(authService.verifyOtp('09111111111', '123456')).rejects.toThrow(AuthError);
      await expect(authService.verifyOtp('09111111111', '123456')).rejects.toMatchObject({
        code: 'NO_OTP',
      });
    });

    it('should create a new customer if one does not exist', async () => {
      const phone = '09123456789';
      await authService.requestOtp(phone);

      const smsMessage = smsProvider.calls[0].message;
      const code = smsMessage.match(/(\d{6})/)?.[1]!;

      await authService.verifyOtp(phone, code);

      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: { phone },
      });
    });

    it('should find existing customer if one exists', async () => {
      const phone = '09123456789';
      prisma._customerStore.push({ id: 'existing-cust', phone, noShowCount: 0 });

      await authService.requestOtp(phone);

      const smsMessage = smsProvider.calls[0].message;
      const code = smsMessage.match(/(\d{6})/)?.[1]!;

      await authService.verifyOtp(phone, code);

      // Should NOT have created a new customer
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should issue new tokens from a valid refresh token', async () => {
      const phone = '09123456789';
      await authService.requestOtp(phone);

      const smsMessage = smsProvider.calls[0].message;
      const code = smsMessage.match(/(\d{6})/)?.[1]!;

      const tokens = await authService.verifyOtp(phone, code);

      // Use the refresh token to get new tokens
      const newTokens = await authService.refresh(tokens.refreshToken);

      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).toBeDefined();

      // Verify the new tokens are valid JWTs with correct claims
      const decoded = jwt.verify(newTokens.accessToken, config.jwtAccessSecret) as jwt.JwtPayload;
      expect(decoded.sub).toBeDefined();
      expect(decoded.type).toBe('access');

      const decodedRefresh = jwt.verify(newTokens.refreshToken, config.jwtRefreshSecret) as jwt.JwtPayload;
      expect(decodedRefresh.sub).toBe(decoded.sub);
      expect(decodedRefresh.type).toBe('refresh');
    });

    it('should reject an invalid refresh token', async () => {
      await expect(authService.refresh('invalid-token')).rejects.toThrow(AuthError);
      await expect(authService.refresh('invalid-token')).rejects.toMatchObject({
        code: 'INVALID_TOKEN',
      });
    });

    it('should reject a token signed with the wrong secret', async () => {
      const badToken = jwt.sign({ sub: 'fake-id', type: 'refresh' }, 'wrong-secret');
      await expect(authService.refresh(badToken)).rejects.toThrow(AuthError);
    });
  });

  describe('invalidate-previous-on-reissue (R1.5)', () => {
    it('should invalidate previous OTP when a new one is requested', async () => {
      const phone = '09123456789';

      // Request first OTP
      await authService.requestOtp(phone);
      const firstCode = smsProvider.calls[0].message.match(/(\d{6})/)?.[1]!;

      // Request second OTP (should invalidate the first)
      await authService.requestOtp(phone);

      // The first OTP should now be invalidated
      const firstOtp = prisma._otpStore[0];
      expect(firstOtp.invalidated).toBe(true);

      // The first code should no longer work (findFirst won't find it since it's invalidated)
      // Reset findFirst to check the store correctly
      await expect(authService.verifyOtp(phone, firstCode)).rejects.toThrow();
    });
  });
});
