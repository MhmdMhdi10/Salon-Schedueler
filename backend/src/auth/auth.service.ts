import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import type { PrismaClient } from '@prisma/client';
import type { OtpProvider } from './otp-provider.interface.js';
import type { SmsProvider } from './sms-provider.interface.js';
import { MULTI_SALON_MEMBERSHIPS_ENABLED } from '../features.js';

/**
 * JWT token pair returned on successful authentication.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Available staff membership context(s); multi-salon selection is gated. */
  staffContexts?: StaffContext[];
}

/** A salon membership resolved after OTP verification. */
export interface StaffContext {
  staffMemberId: string;
  salonId: string;
  salonName?: string | null;
  fullName?: string | null;
  role: string;
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

/**
 * Global operator claims. A platform admin may also enter the customer and
 * salon panels, so the token carries the matching customer/staff context while
 * keeping `platformAdminId` for the global operations center.
 */
interface PlatformAdminClaims {
  role: 'PlatformAdmin';
  platformAdminId: string;
  staffMemberId?: string;
  salonId?: string;
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
  /** Refresh token expiry in seconds (default 2592000 = 30 days) */
  refreshExpirySeconds: number;
  /** OTP validity window in seconds (default 120) */
  otpWindowSeconds: number;
  /** Explicit temporary opt-in to return generated OTPs to the web client. */
  devOtpAutoFill: boolean;
}

/** Metadata returned to clients after an OTP request. */
export interface OtpRequestDetails {
  /** The fixed number of numeric characters the client must collect. */
  otpLength: 4;
  /** Development-only autofill value. Never returned in production. */
  devOtp?: string;
}

const DEFAULT_CONFIG: AuthServiceConfig = {
  jwtAccessSecret: process.env['JWT_ACCESS_SECRET'] || 'dev-access-secret',
  jwtRefreshSecret: process.env['JWT_REFRESH_SECRET'] || 'dev-refresh-secret',
  accessExpirySeconds: 900, // 15 minutes
  refreshExpirySeconds: 2592000, // 30 days
  otpWindowSeconds: 120,
  devOtpAutoFill: false,
};

const MAX_OTP_ATTEMPTS = 5;
const MAX_AUTH_RATE_LIMIT_BUCKETS = 20_000;

/**
 * AuthService handles OTP-based authentication for customers.
 *
 * - requestOtp: generates an OTP locally, delivers it through the configured
 *   provider (or the regular SMS provider), hashes it with SHA-256, invalidates
 *   any previous active OTP for the phone, and stores the new OTP.
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
  private readonly otpProvider?: OtpProvider;
  private readonly config: AuthServiceConfig;
  private readonly localRateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
  private rateLimitCallCount = 0;

  constructor(
    prisma: PrismaClient,
    smsProvider: SmsProvider,
    config: Partial<AuthServiceConfig> = {},
    otpProvider?: OtpProvider,
  ) {
    this.prisma = prisma;
    this.smsProvider = smsProvider;
    this.otpProvider = otpProvider;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Consume a shared, atomic fixed-window bucket for authentication endpoints.
   * The in-memory path is only for lightweight unit fakes without Prisma raw SQL;
   * application instances use PostgreSQL so replicas share the same limits.
   */
  async consumeRateLimit(
    name: string,
    key: string,
    max: number,
    windowMs: number,
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const bucketKey = crypto.createHash('sha256').update(`${name}:${key}`).digest('hex');
    const prismaWithRawQuery = this.prisma as unknown as {
      $queryRaw?: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
    };
    const queryRaw = prismaWithRawQuery.$queryRaw?.bind(this.prisma);

    if (queryRaw) {
      const rows = await queryRaw<Array<{ count: number; reset_at: Date }>>`
        INSERT INTO "auth_rate_limit_bucket" ("key", "window_started_at", "count")
        VALUES (${bucketKey}, NOW(), 1)
        ON CONFLICT ("key") DO UPDATE SET
          "window_started_at" = CASE
            WHEN "auth_rate_limit_bucket"."window_started_at" + (${windowMs} * INTERVAL '1 millisecond') <= NOW()
              THEN NOW()
            ELSE "auth_rate_limit_bucket"."window_started_at"
          END,
          "count" = CASE
            WHEN "auth_rate_limit_bucket"."window_started_at" + (${windowMs} * INTERVAL '1 millisecond') <= NOW()
              THEN 1
            ELSE LEAST("auth_rate_limit_bucket"."count" + 1, ${max + 1})
          END
        RETURNING "count", "window_started_at" + (${windowMs} * INTERVAL '1 millisecond') AS reset_at
      `;
      const bucket = rows[0];
      if (!bucket) throw new Error('Unable to consume authentication rate-limit bucket');

      this.rateLimitCallCount += 1;
      if (this.rateLimitCallCount % 100 === 0) {
        void queryRaw<Array<{ key: string }>>`
          DELETE FROM "auth_rate_limit_bucket"
          WHERE "window_started_at" < NOW() - INTERVAL '1 day'
          RETURNING "key"
        `.catch(() => undefined);
        void queryRaw<Array<{ token_id_hash: string }>>`
          DELETE FROM "auth_refresh_session"
          WHERE "expires_at" < NOW() - INTERVAL '1 day'
          RETURNING "token_id_hash"
        `.catch(() => undefined);
      }

      const resetAt = new Date(bucket.reset_at).getTime();
      return {
        allowed: bucket.count <= max,
        remaining: Math.max(0, max - bucket.count),
        resetAt,
      };
    }

    const now = Date.now();
    let bucket = this.localRateLimitBuckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.localRateLimitBuckets.set(bucketKey, bucket);
    }
    bucket.count = Math.min(max + 1, bucket.count + 1);
    if (this.localRateLimitBuckets.size > MAX_AUTH_RATE_LIMIT_BUCKETS) {
      for (const [storedKey, storedBucket] of this.localRateLimitBuckets) {
        if (storedBucket.resetAt <= now) this.localRateLimitBuckets.delete(storedKey);
      }
    }
    return {
      allowed: bucket.count <= max,
      remaining: Math.max(0, max - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  /** Verify that an authenticated OTP identity owns the supplied phone. */
  async subjectOwnsPhone(subjectId: string, phone: string): Promise<boolean> {
    const customer = await this.findCustomerById(subjectId);
    return customer?.phone === phone;
  }

  /**
   * Generate a cryptographically random 4-digit OTP code.
   */
  generateOtpCode(): string {
    // Generate a random integer between 0 and 9999, zero-padded to 4 digits
    const randomBytes = crypto.randomBytes(4);
    const num = randomBytes.readUInt32BE(0) % 10000;
    return num.toString().padStart(4, '0');
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
   * 1. Invalidate any previous unconsumed OTPs for this phone (R1.5)
   * 2. Generate a local four-digit code and deliver it through the configured OTP
   *    provider, or send it through the regular SMS provider (R1.1)
   * 3. Store the exact code that the recipient received
   * 4. Return only the code length plus development-only autofill metadata
   */
  async requestOtp(phone: string): Promise<void>;
  async requestOtp(phone: string, options: { exposeCode: true }): Promise<string | undefined>;
  async requestOtp(
    phone: string,
    options?: { exposeCode?: boolean },
  ): Promise<void | string | undefined> {
    const details = await this.requestOtpWithDetails(phone, options);
    return details.devOtp;
  }

  /**
   * Request an OTP and report its fixed four-digit input length. The code itself
   * is returned only when development autofill is enabled.
   */
  async requestOtpWithDetails(
    phone: string,
    options?: { exposeCode?: boolean },
  ): Promise<OtpRequestDetails> {
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

    const generatedCode = this.generateOtpCode();
    let code: string = generatedCode;
    if (this.otpProvider) {
      const delivery = await this.otpProvider.sendOtp(phone, generatedCode, { expiresAt });
      if (!delivery.ok) {
        throw new AuthError('OTP_DELIVERY_FAILED', delivery.error);
      }
      code = delivery.code;
    } else {
      const delivery = await this.smsProvider.send(phone, `Your verification code is: ${code}`, { expiresAt });
      if (!delivery.ok) {
        throw new AuthError('OTP_DELIVERY_FAILED', delivery.error);
      }
    }

    if (!/^\d{4}$/.test(code)) {
      throw new AuthError('OTP_DELIVERY_FAILED', 'OTP provider returned an invalid code');
    }

    // Store the new OTP
    await this.prisma.otp.create({
      data: {
        phone,
        codeHash: this.hashCode(code),
        issuedAt: now,
        expiresAt,
        invalidated: false,
        attemptCount: 0,
      },
    });

    return {
      otpLength: 4,
      ...(options?.exposeCode && this.config.devOtpAutoFill ? { devOtp: code } : {}),
    };
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

    // Check code match. Failed attempts are counted in the database so all API
    // replicas share the same five-guess ceiling for this challenge.
    const codeHash = this.hashCode(code);
    if (codeHash !== otp.codeHash) {
      await this.recordOtpFailure(otp.id, otp.attemptCount ?? 0);
      throw new AuthError('OTP_MISMATCH', 'Invalid OTP code');
    }

    // Atomically consume the challenge so a replay or a concurrent successful
    // request cannot mint more than one authenticated session.
    if (!(await this.consumeOtp(otp.id, now))) {
      throw new AuthError('OTP_MISMATCH', 'Invalid OTP code');
    }

    // Platform admin identities are global, but the shared header can also
    // open the customer and salon panels. Resolve the same customer/staff
    // context for the phone so those panels use the correct subject and salon.
    const platformAdmin = await this.findPlatformAdminByPhone(phone);
    if (platformAdmin) {
      await this.updatePlatformAdminLogin(platformAdmin.id);
      const customer = await this.findOrCreateCustomer(phone, true);
      const staffContexts = await this.findStaffContextsByPhone(phone);
      const staff = staffContexts[0];
      const tokens = await this.issueTokens(customer.id, {
        role: 'PlatformAdmin',
        platformAdminId: platformAdmin.id,
        staffMemberId: staff?.staffMemberId,
        salonId: staff?.salonId,
      });
      return staffContexts.length ? { ...tokens, staffContexts } : tokens;
    }

    // Find or create customer
    const customer = await this.findOrCreateCustomer(phone);

    // If this phone also belongs to an active staff member, mint a staff token
    // carrying their role + staffMemberId so the RBAC matrix applies; otherwise
    // a plain customer token (no role) is issued.
    const staffContexts = await this.findStaffContextsByPhone(phone);
    const staff = staffContexts[0];

    // Issue tokens
    const tokens = await this.issueTokens(customer.id, staff);
    return staffContexts.length ? { ...tokens, staffContexts } : tokens;
  }

  /**
   * Mint a session scoped to an active salon membership for the current
   * customer's phone. Multi-salon selection is rejected while the feature is
   * disabled, so clients cannot switch to another membership.
   */
  async selectStaffContext(subjectId: string, staffMemberId: string): Promise<AuthTokens> {
    const customer = await this.findCustomerById(subjectId);
    if (!customer) throw new AuthError('INVALID_TOKEN', 'Invalid customer context');

    const delegate = (
      this.prisma as unknown as {
        staffMember?: {
          findUnique?: (args: unknown) => Promise<{
            id: string;
            phone: string | null;
            active: boolean;
            role: string;
            salonId: string;
          } | null>;
        };
      }
    ).staffMember;
    if (!delegate?.findUnique) throw new AuthError('INVALID_TOKEN', 'Staff context unavailable');

    const staff = await delegate.findUnique({
      where: { id: staffMemberId },
      select: { id: true, phone: true, active: true, role: true, salonId: true },
    });
    if (!staff || !staff.active || staff.phone !== customer.phone) {
      throw new AuthError('INVALID_TOKEN', 'Staff context is not available for this account');
    }

    const staffContexts = await this.findStaffContextsByPhone(customer.phone);
    if (
      !MULTI_SALON_MEMBERSHIPS_ENABLED &&
      staffContexts[0]?.staffMemberId !== staffMemberId
    ) {
      throw new AuthError('FEATURE_DISABLED', 'Selecting another salon is temporarily disabled');
    }
    const tokens = await this.issueTokens(customer.id, {
      role: staff.role,
      staffMemberId: staff.id,
      salonId: staff.salonId,
    });
    return {
      ...tokens,
      staffContexts,
    };
  }

  /** Return available active salon memberships for the authenticated subject. */
  async getStaffContexts(subjectId: string): Promise<StaffContext[]> {
    const customer = await this.findCustomerById(subjectId);
    return customer ? this.findStaffContextsByPhone(customer.phone) : [];
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
        typeof decoded.sub !== 'string' ||
        typeof decoded.jti !== 'string'
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
    const refreshTokenId = payload.jti;
    if (typeof refreshTokenId !== 'string') {
      throw new AuthError('INVALID_TOKEN', 'Invalid refresh token');
    }

    // Consume the persisted session before minting its replacement. This makes
    // refresh rotation single-use across API replicas and lets logout revoke it.
    const refreshSessionDelegate = (
      this.prisma as unknown as {
        authRefreshSession?: {
          updateMany?: (args: unknown) => Promise<{ count: number }>;
        };
      }
    ).authRefreshSession;
    if (refreshSessionDelegate?.updateMany) {
      const result = await refreshSessionDelegate.updateMany({
        where: {
          tokenIdHash: this.hashRefreshTokenId(refreshTokenId),
          subjectId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });
      if (result.count !== 1) {
        throw new AuthError('INVALID_TOKEN', 'Refresh session is no longer active');
      }
    }

    const subjectId = payload.sub as string;
    const rawRole = (payload as Record<string, unknown>).role;
    const platformAdminId =
      typeof payload.platformAdminId === 'string' ? payload.platformAdminId : undefined;

    // Refresh claims are untrusted session state. Re-resolve global admin
    // identity from the database so deactivated operators lose access without
    // waiting for an old refresh token to expire.
    if (rawRole === 'PlatformAdmin' || platformAdminId) {
      if (!platformAdminId) {
        throw new AuthError('INVALID_TOKEN', 'Invalid refresh token');
      }
      const admin = await this.findPlatformAdminById(platformAdminId);
      if (!admin) {
        throw new AuthError('INVALID_TOKEN', 'Invalid or inactive refresh identity');
      }
      const customer = await this.findOrCreateCustomer(admin.phone, true);
      const staffContexts = await this.findStaffContextsByPhone(admin.phone);
      const staff = staffContexts[0];
      const tokens = await this.issueTokens(customer.id, {
        role: 'PlatformAdmin',
        platformAdminId: admin.id,
        staffMemberId: staff?.staffMemberId,
        salonId: staff?.salonId,
      });
      return staffContexts.length ? { ...tokens, staffContexts } : tokens;
    }

    // Rehydrate customer + staff state on every refresh. Role, salon and staff
    // ids in a JWT must never outlive the active staff record that granted them.
    const customer = await this.findCustomerById(subjectId);
    if (!customer) {
      throw new AuthError('INVALID_TOKEN', 'Invalid or inactive refresh identity');
    }
    const staffContexts = await this.findStaffContextsByPhone(customer.phone);
    const staff = staffContexts[0];
    const tokens = await this.issueTokens(customer.id, staff);
    return staffContexts.length ? { ...tokens, staffContexts } : tokens;
  }

  /** Revoke the refresh session presented when a user logs out. */
  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    let payload: jwt.JwtPayload;
    try {
      const decoded = jwt.verify(refreshToken, this.config.jwtRefreshSecret, {
        algorithms: ['HS256'],
      });
      if (
        typeof decoded === 'string' ||
        decoded.type !== 'refresh' ||
        typeof decoded.sub !== 'string' ||
        typeof decoded.jti !== 'string'
      )
        return;
      payload = decoded;
    } catch {
      return;
    }
    const refreshTokenId = payload.jti;
    if (typeof refreshTokenId !== 'string') return;

    const refreshSessionDelegate = (
      this.prisma as unknown as {
        authRefreshSession?: {
          updateMany?: (args: unknown) => Promise<{ count: number }>;
        };
      }
    ).authRefreshSession;
    if (!refreshSessionDelegate?.updateMany) return;
    await refreshSessionDelegate.updateMany({
      where: {
        tokenIdHash: this.hashRefreshTokenId(refreshTokenId),
        subjectId: payload.sub,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  private hashRefreshTokenId(tokenId: string): string {
    return crypto.createHash('sha256').update(tokenId).digest('hex');
  }

  private async recordOtpFailure(otpId: string, currentAttemptCount: number): Promise<void> {
    const prismaWithRawQuery = this.prisma as unknown as {
      $queryRaw?: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
    };
    const queryRaw = prismaWithRawQuery.$queryRaw?.bind(this.prisma);
    if (queryRaw) {
      const updated = await queryRaw<Array<{ attempt_count: number }>>`
        UPDATE "otp"
        SET "attempt_count" = "attempt_count" + 1,
            "invalidated" = ("attempt_count" + 1 >= ${MAX_OTP_ATTEMPTS})
        WHERE "id" = ${otpId}::uuid
          AND "invalidated" = false
          AND "consumed_at" IS NULL
          AND "expires_at" > NOW()
          AND "attempt_count" < ${MAX_OTP_ATTEMPTS}
        RETURNING "attempt_count"
      `;
      if (!updated.length) {
        throw new AuthError('OTP_MISMATCH', 'OTP challenge is no longer active');
      }
      return;
    }

    // Lightweight in-memory Prisma fakes do not implement atomic SQL updates.
    const nextAttemptCount = currentAttemptCount + 1;
    await this.prisma.otp.updateMany({
      where: { id: otpId, invalidated: false, consumedAt: null },
      data: {
        attemptCount: nextAttemptCount,
        ...(nextAttemptCount >= MAX_OTP_ATTEMPTS ? { invalidated: true } : {}),
      },
    });
  }

  private async consumeOtp(otpId: string, now: Date): Promise<boolean> {
    const prismaWithRawQuery = this.prisma as unknown as {
      $queryRaw?: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
    };
    const queryRaw = prismaWithRawQuery.$queryRaw?.bind(this.prisma);
    if (queryRaw) {
      const consumed = await queryRaw<Array<{ id: string }>>`
        UPDATE "otp"
        SET "consumed_at" = ${now}
        WHERE "id" = ${otpId}::uuid
          AND "invalidated" = false
          AND "consumed_at" IS NULL
          AND "expires_at" > NOW()
          AND "attempt_count" < ${MAX_OTP_ATTEMPTS}
        RETURNING "id"
      `;
      return consumed.length === 1;
    }

    const result = await this.prisma.otp.updateMany({
      where: { id: otpId, invalidated: false, consumedAt: null },
      data: { consumedAt: now },
    });
    return result.count === 1;
  }

  /**
   * Find an existing customer by phone or create a new one.
   */
  private async findOrCreateCustomer(phone: string, allowInactive = false) {
    let customer = await this.prisma.customer.findUnique({
      where: { phone },
    });

    // Platform operators have a separate identity and must remain able to
    // reach their global panel even when their mirrored customer row is
    // moderated. Regular users cannot create a fresh session after block or
    // soft-delete.
    if (!allowInactive && customer && ((customer as { active?: boolean }).active === false || (customer as { deletedAt?: Date | null }).deletedAt)) {
      throw new AuthError('CUSTOMER_BLOCKED', 'Customer account is blocked');
    }

    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { phone },
      });
    }

    return customer;
  }

  private async findCustomerById(id: string): Promise<{ id: string; phone: string } | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: { id: true, phone: true, active: true, deletedAt: true },
    });
    if (!customer || (customer as { active?: boolean }).active === false || (customer as { deletedAt?: Date | null }).deletedAt) return null;
    return customer;
  }

  /**
   * Resolve the staff claims for a phone, or undefined when the phone does not
   * belong to an active staff member. These claims (role + staffMemberId) are
   * embedded in the issued JWTs so the RBAC layer can authorize staff actions.
   */
  private async findStaffClaimsByPhone(phone: string): Promise<StaffClaims | undefined> {
    const context = (await this.findStaffContextsByPhone(phone))[0];
    return context
      ? { role: context.role, staffMemberId: context.staffMemberId, salonId: context.salonId }
      : undefined;
  }

  /** Resolve active memberships, exposing only the first while multi-salon is disabled. */
  private async findStaffContextsByPhone(phone: string): Promise<StaffContext[]> {
    const delegate = (
      this.prisma as unknown as {
        staffMember?: {
          findMany?: (args: unknown) => Promise<
            Array<{
              id: string;
              fullName?: string | null;
              role: string;
              salonId: string;
              salon?: { name?: string | null } | null;
            }
          >>;
          findFirst?: (args: unknown) => Promise<{
            id: string;
            fullName?: string | null;
            role: string;
            salonId: string;
          } | null>;
        };
      }
    ).staffMember;
    if (!delegate) return [];

    if (delegate.findMany) {
      const rows = await delegate.findMany({
        where: { phone, active: true },
        orderBy: { salonId: 'asc' },
        ...(!MULTI_SALON_MEMBERSHIPS_ENABLED ? { take: 1 } : {}),
        select: {
          id: true,
          fullName: true,
          role: true,
          salonId: true,
          salon: { select: { name: true } },
        },
      });
      const contexts = rows.map((row) => ({
        staffMemberId: row.id,
        salonId: row.salonId,
        salonName: row.salon?.name,
        fullName: row.fullName,
        role: row.role,
      }));
      return MULTI_SALON_MEMBERSHIPS_ENABLED ? contexts : contexts.slice(0, 1);
    }

    if (!delegate.findFirst) return [];
    const row = await delegate.findFirst({
      where: { phone, active: true },
      select: { id: true, fullName: true, role: true, salonId: true },
    });
    return row
      ? [{
          staffMemberId: row.id,
          salonId: row.salonId,
          fullName: row.fullName,
          role: row.role,
        }]
      : [];
  }

  /** Resolve an active global operator. Optional delegate keeps older unit-test
   * Prisma fakes compatible while the generated client always provides it. */
  private async findPlatformAdminByPhone(phone: string): Promise<{ id: string } | undefined> {
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
  ): Promise<{ id: string; phone: string } | undefined> {
    const delegate = (
      this.prisma as unknown as {
        platformAdmin?: {
          findUnique?: (
            args: unknown,
          ) => Promise<{ id: string; phone: string; active: boolean } | null>;
        };
      }
    ).platformAdmin;
    if (!delegate?.findUnique) return undefined;
    const admin = await delegate.findUnique({
      where: { id },
      select: { id: true, phone: true, active: true },
    });
    return admin?.active ? { id: admin.id, phone: admin.phone } : undefined;
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
   * Issue a JWT access token (15min) and refresh token (30d).
   *
   * When `staff` claims are supplied (the phone belongs to an active staff
   * member), both tokens carry `role` + `staffMemberId` so the principal built
   * by the auth middleware is subject to the RBAC matrix. Plain customers get a
   * roleless token.
   */
  private async issueTokens(subjectId: string, claims?: TokenClaims): Promise<AuthTokens> {
    const tokenClaims = claims ? { ...claims } : {};
    const refreshTokenId = crypto.randomUUID();

    const accessToken = jwt.sign(
      { sub: subjectId, type: 'access', ...tokenClaims },
      this.config.jwtAccessSecret,
      { expiresIn: this.config.accessExpirySeconds },
    );

    const refreshToken = jwt.sign(
      { sub: subjectId, type: 'refresh', jti: refreshTokenId, ...tokenClaims },
      this.config.jwtRefreshSecret,
      { expiresIn: this.config.refreshExpirySeconds },
    );

    const refreshSessionDelegate = (
      this.prisma as unknown as {
        authRefreshSession?: {
          create?: (args: unknown) => Promise<unknown>;
        };
      }
    ).authRefreshSession;
    if (refreshSessionDelegate?.create) {
      await refreshSessionDelegate.create({
        data: {
          tokenIdHash: this.hashRefreshTokenId(refreshTokenId),
          subjectId,
          expiresAt: new Date(Date.now() + this.config.refreshExpirySeconds * 1000),
        },
      });
    }

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
      | 'OTP_DELIVERY_FAILED'
      | 'CUSTOMER_BLOCKED'
      | 'INVALID_TOKEN'
      | 'FEATURE_DISABLED',
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
