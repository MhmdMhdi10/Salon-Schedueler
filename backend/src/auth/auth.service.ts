import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import type { PrismaClient } from '@prisma/client';
import type { SmsProvider } from './sms-provider.interface.js';

/**
 * JWT token pair returned on successful authentication.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Staff identity claims embedded in a token when the authenticated phone maps
 * to an active staff member. `role` drives the RBAC matrix; `staffMemberId` is
 * used for Stylist "own only" ownership checks; `salonId` lets the owner panel
 * scope every read/write to the staff member's own salon (no hard-coded salon).
 */
interface StaffClaims {
  role: string;
  staffMemberId: string;
  salonId: string;
}

/** Global operator claims. Platform admins are not tenant-scoped staff. */
interface PlatformAdminClaims {
  role: 'PlatformAdmin';
  platformAdminId: string;
}

type TokenClaims = StaffClaims | PlatformAdminClaims;

/**
 * Configuration for the AuthService.
 */
export interface AuthServiceConfig {
  /** Secret used to sign JWT access tokens */
  jwtAccessSecret: string;
  /** Secret used to sign JWT refresh tokens */
  jwtRefreshSecret: string;
  /** Access token expiry in seconds (default 900 = 15min) */
  accessExpirySeconds: number;
  /** Refresh token expiry in seconds (default 604800 = 7 days) */
  refreshExpirySeconds: number;
  /** OTP validity window in seconds (default 120) */
  otpWindowSeconds: number;
  /** Explicit temporary opt-in to return generated OTPs to the web client. */
  devOtpAutoFill: boolean;
}

const DEFAULT_CONFIG: AuthServiceConfig = {
  jwtAccessSecret: process.env['JWT_ACCESS_SECRET'] || 'dev-access-secret',
  jwtRefreshSecret: process.env['JWT_REFRESH_SECRET'] || 'dev-refresh-secret',
  accessExpirySeconds: 900,       // 15 minutes
  refreshExpirySeconds: 604800,   // 7 days
  otpWindowSeconds: 120,
  devOtpAutoFill: false,
};

/**
 * AuthService handles OTP-based authentication for customers.
 *
 * - requestOtp: generates a 6-digit code, hashes it with SHA-256,
 *   invalidates any previous active OTP for the phone, stores the new OTP,
 *   and sends it via SmsProvider.
 *
 * - verifyOtp: finds the latest non-invalidated OTP for the phone,
 *   checks expiry (120s window), verifies the code hash, marks it consumed,
   *   resolves a platform admin or creates/finds the customer, and issues JWT
   *   access + refresh tokens.
 *
 * - refresh: verifies a refresh token and issues a new token pair.
 */
export class AuthService {
  private readonly prisma: PrismaClient;
  private readonly smsProvider: SmsProvider;
  private readonly config: AuthServiceConfig;

  constructor(
    prisma: PrismaClient,
    smsProvider: SmsProvider,
    config: Partial<AuthServiceConfig> = {},
  ) {
    this.prisma = prisma;
    this.smsProvider = smsProvider;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a cryptographically random 6-digit OTP code.
   */
  generateOtpCode(): string {
    // Generate a random integer between 0 and 999999, zero-padded to 6 digits
    const randomBytes = crypto.randomBytes(4);
    const num = randomBytes.readUInt32BE(0) % 1000000;
    return num.toString().padStart(6, '0');
  }

  /**
   * Hash an OTP code using SHA-256.
   */
  hashCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  /**
   * Request a new OTP for the given phone number.
   *
   * 1. Generate a 6-digit code
   * 2. Invalidate any previous unconsumed OTPs for this phone (R1.5)
   * 3. Store the new OTP with a 120-second expiry window
   * 4. Send the code via SmsProvider (R1.1)
   */
  async requestOtp(phone: string): Promise<void>;
  async requestOtp(phone: string, options: { exposeCode: true }): Promise<string | undefined>;
  async requestOtp(
    phone: string,
    options?: { exposeCode?: boolean },
  ): Promise<void | string | undefined> {
    const code = this.generateOtpCode();
    const codeHash = this.hashCode(code);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.otpWindowSeconds * 1000);

    // Invalidate all previous unconsumed OTPs for this phone (R1.5)
    await this.prisma.otp.updateMany({
      where: {
        phone,
        invalidated: false,
        consumedAt: null,
      },
      data: {
        invalidated: true,
      },
    });

    // Store the new OTP
    await this.prisma.otp.create({
      data: {
        phone,
        codeHash,
        issuedAt: now,
        expiresAt,
        invalidated: false,
      },
    });

    // Send the OTP via SMS
    await this.smsProvider.send(
      phone,
      `Your verification code is: ${code}`,
    );

    return options?.exposeCode && this.config.devOtpAutoFill ? code : undefined;
  }

  /**
   * Verify an OTP code for the given phone number.
   *
   * 1. Find the latest non-invalidated OTP for the phone
   * 2. Check if it has expired (120s window) (R1.3)
   * 3. Check if the code hash matches (R1.4)
   * 4. Mark the OTP as consumed (R1.2)
   * 5. Resolve a global platform admin, or find/create the customer
   * 6. Issue JWT access and refresh tokens
   */
  async verifyOtp(phone: string, code: string): Promise<AuthTokens> {
    // Find the latest non-invalidated, unconsumed OTP for this phone
    const otp = await this.prisma.otp.findFirst({
      where: {
        phone,
        invalidated: false,
        consumedAt: null,
      },
      orderBy: {
        issuedAt: 'desc',
      },
    });

    if (!otp) {
      throw new AuthError('NO_OTP', 'No active OTP found for this phone number');
    }

    // Check expiry (R1.3)
    const now = new Date();
    if (now > otp.expiresAt) {
      throw new AuthError('OTP_EXPIRED', 'OTP has expired. Please request a new one.');
    }

    // Check code match (R1.4)
    const codeHash = this.hashCode(code);
    if (codeHash !== otp.codeHash) {
      throw new AuthError('OTP_MISMATCH', 'Invalid OTP code');
    }

    // Mark as consumed (R1.2)
    await this.prisma.otp.update({
      where: { id: otp.id },
      data: { consumedAt: now },
    });

    // Platform admin identities live outside the customer/staff tenant model.
    // Check them before creating a customer row so an operator phone never
    // pollutes customer analytics or receives customer-scoped behavior.
    const platformAdmin = await this.findPlatformAdminByPhone(phone);
    if (platformAdmin) {
      await this.updatePlatformAdminLogin(platformAdmin.id);
      return this.issueTokens(platformAdmin.id, {
        role: 'PlatformAdmin',
        platformAdminId: platformAdmin.id,
      });
    }

    // Find or create customer
    const customer = await this.findOrCreateCustomer(phone);

    // If this phone also belongs to an active staff member, mint a staff token
    // carrying their role + staffMemberId so the RBAC matrix applies; otherwise
    // a plain customer token (no role) is issued.
    const staff = await this.findStaffClaimsByPhone(phone);

    // Issue tokens
    return this.issueTokens(customer.id, staff);
  }

  /**
   * Refresh authentication tokens using a valid refresh token.
   * Verifies the refresh token and issues a new access + refresh token pair,
   * carrying forward any staff role/staffMemberId claims it holds so a staff
   * session keeps its RBAC role across refreshes.
   */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: jwt.JwtPayload;
    try {
      const decoded = jwt.verify(refreshToken, this.config.jwtRefreshSecret, {
        algorithms: ['HS256'],
      });
      if (
        typeof decoded === 'string' ||
        decoded.type !== 'refresh' ||
        typeof decoded.sub !== 'string'
      ) {
        throw new AuthError('INVALID_TOKEN', 'Invalid refresh token');
      }
      payload = decoded;
    } catch (err) {
      if (err instanceof AuthError) {
        throw err;
      }
      throw new AuthError('INVALID_TOKEN', 'Invalid or expired refresh token');
    }

    const subjectId = payload.sub as string;
    const rawRole = (payload as Record<string, unknown>).role;
    const platformAdminId =
      typeof payload.platformAdminId === 'string' ? payload.platformAdminId : undefined;

    // Refresh claims are untrusted session state. Re-resolve global admin
    // identity from the database so deactivated operators lose access without
    // waiting for an old refresh token to expire.
    if (rawRole === 'PlatformAdmin' || platformAdminId) {
      if (!platformAdminId || platformAdminId !== subjectId) {
        throw new AuthError('INVALID_TOKEN', 'Invalid refresh token');
      }
      const admin = await this.findPlatformAdminById(platformAdminId);
      if (!admin) {
        throw new AuthError('INVALID_TOKEN', 'Invalid or inactive refresh identity');
      }
      return this.issueTokens(admin.id, {
        role: 'PlatformAdmin',
        platformAdminId: admin.id,
      });
    }

    // Rehydrate customer + staff state on every refresh. Role, salon and staff
    // ids in a JWT must never outlive the active staff record that granted them.
    const customer = await this.findCustomerById(subjectId);
    if (!customer) {
      throw new AuthError('INVALID_TOKEN', 'Invalid or inactive refresh identity');
    }
    const staff = await this.findStaffClaimsByPhone(customer.phone);
    return this.issueTokens(customer.id, staff);
  }

  /**
   * Find an existing customer by phone or create a new one.
   */
  private async findOrCreateCustomer(phone: string) {
    let customer = await this.prisma.customer.findUnique({
      where: { phone },
    });

    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { phone },
      });
    }

    return customer;
  }

  private async findCustomerById(
    id: string,
  ): Promise<{ id: string; phone: string } | null> {
    return this.prisma.customer.findUnique({
      where: { id },
      select: { id: true, phone: true },
    });
  }

  /**
   * Resolve the staff claims for a phone, or undefined when the phone does not
   * belong to an active staff member. These claims (role + staffMemberId) are
   * embedded in the issued JWTs so the RBAC layer can authorize staff actions.
   */
  private async findStaffClaimsByPhone(
    phone: string,
  ): Promise<StaffClaims | undefined> {
    const staff = await this.prisma.staffMember.findFirst({
      where: { phone, active: true },
      select: { id: true, role: true, salonId: true },
    });
    if (!staff) {
      return undefined;
    }
    return { role: staff.role, staffMemberId: staff.id, salonId: staff.salonId };
  }

  /** Resolve an active global operator. Optional delegate keeps older unit-test
   * Prisma fakes compatible while the generated client always provides it. */
  private async findPlatformAdminByPhone(
    phone: string,
  ): Promise<{ id: string } | undefined> {
    const delegate = (
      this.prisma as unknown as {
        platformAdmin?: {
          findFirst?: (args: unknown) => Promise<{ id: string } | null>;
        };
      }
    ).platformAdmin;
    if (!delegate?.findFirst) return undefined;
    const admin = await delegate.findFirst({
      where: { phone, active: true },
      select: { id: true },
    });
    return admin ?? undefined;
  }

  /** Resolve an active global operator for refresh-token rehydration. */
  private async findPlatformAdminById(
    id: string,
  ): Promise<{ id: string } | undefined> {
    const delegate = (
      this.prisma as unknown as {
        platformAdmin?: {
          findUnique?: (args: unknown) => Promise<{ id: string; active: boolean } | null>;
        };
      }
    ).platformAdmin;
    if (!delegate?.findUnique) return undefined;
    const admin = await delegate.findUnique({
      where: { id },
      select: { id: true, active: true },
    });
    return admin?.active ? { id: admin.id } : undefined;
  }

  /** Update last-login telemetry without making authentication depend on an
   * optional field in old test doubles. */
  private async updatePlatformAdminLogin(id: string): Promise<void> {
    const delegate = (
      this.prisma as unknown as {
        platformAdmin?: {
          update?: (args: unknown) => Promise<unknown>;
        };
      }
    ).platformAdmin;
    if (!delegate?.update) return;
    await delegate.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  /**
   * Issue a JWT access token (15min) and refresh token (7d).
   *
   * When `staff` claims are supplied (the phone belongs to an active staff
   * member), both tokens carry `role` + `staffMemberId` so the principal built
   * by the auth middleware is subject to the RBAC matrix. Plain customers get a
   * roleless token.
   */
  private issueTokens(subjectId: string, claims?: TokenClaims): AuthTokens {
    const tokenClaims = claims ? { ...claims } : {};

    const accessToken = jwt.sign(
      { sub: subjectId, type: 'access', ...tokenClaims },
      this.config.jwtAccessSecret,
      { expiresIn: this.config.accessExpirySeconds },
    );

    const refreshToken = jwt.sign(
      { sub: subjectId, type: 'refresh', ...tokenClaims },
      this.config.jwtRefreshSecret,
      { expiresIn: this.config.refreshExpirySeconds },
    );

    return { accessToken, refreshToken };
  }
}

/**
 * Custom error class for authentication failures.
 */
export class AuthError extends Error {
  constructor(
    public readonly code:
      | 'NO_OTP'
      | 'OTP_EXPIRED'
      | 'OTP_MISMATCH'
      | 'INVALID_TOKEN',
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
