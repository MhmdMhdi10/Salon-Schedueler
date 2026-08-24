import { Router } from 'express';
import type { Services } from '../../http/app.js';
import { asyncRoute, validateRequired } from '../../common/http/route-helpers.js';
import {
  createRateLimit,
  phoneRateLimitKey,
} from '../../http/middleware/rate-limit.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from '../auth-cookie.js';

function isMobileClient(req: { get(name: string): string | undefined }): boolean {
  // A browser can forge a custom header from JavaScript, but its fetch still
  // carries browser-origin metadata on these POST requests. Native fetch does
  // not send either header, so this keeps the long-lived token body response
  // out of browser/XSS-triggered requests while preserving the mobile flow.
  const hasBrowserMetadata = Boolean(req.get('Origin') || req.get('Sec-Fetch-Site'));
  return req.get('X-Auth-Client') === 'mobile' && !hasBrowserMetadata;
}

/**
 * Auth routes (public — no token required). Maps to `AuthService` and reuses the
 * stable error codes via `mapDomainError` (Requirement 2.2, 2.5 / original R1).
 *
 * - POST /auth/otp/request  { phone }            -> 200 { ok: true, otpLength, devOtp? }
 * - POST /auth/otp/verify   { phone, code }      -> 200 cookie/body tokens
 * - POST /auth/refresh      cookie/body         -> 200 access token(s)
 * - POST /auth/logout                            -> 204
 *
 * Error mapping (via mapDomainError): OTP_EXPIRED -> 401 OTP_EXPIRED;
 * OTP_MISMATCH / NO_OTP -> 401 OTP_INVALID; INVALID_TOKEN -> 401 INVALID_TOKEN.
 */
export function authRouter(services: Services): Router {
  const router = Router();

  // The dev Cucumber matrix authenticates many isolated actors in one run.
  // Keep production abuse limits unchanged, while allowing the dev container
  // to opt into larger test-only buckets through compose configuration.
  const devLimit = (name: string, fallback: number): number => {
    const configured = Number(process.env[name]);
    return process.env.NODE_ENV === 'development' &&
      Number.isInteger(configured) &&
      configured > 0
      ? configured
      : fallback;
  };

  const otpRequestIpLimit = createRateLimit({
    name: 'otp-request-ip',
    // SMS cost is additionally bounded per phone below. A wider IP window
    // keeps shared offices and the automated onboarding matrix from colliding
    // while still stopping request floods.
    max: devLimit('E2E_OTP_REQUEST_IP_LIMIT', 60),
    windowMs: 60_000,
  });
  const otpRequestPhoneLimit = createRateLimit({
    name: 'otp-request-phone',
    max: devLimit('E2E_OTP_REQUEST_PHONE_LIMIT', 5),
    windowMs: 10 * 60_000,
    keyGenerator: phoneRateLimitKey,
  });
  const otpVerifyIpLimit = createRateLimit({
    name: 'otp-verify-ip',
    // Keep brute-force protection per phone below; this IP cap accounts for
    // shared offices and multi-user onboarding from one network.
    max: devLimit('E2E_OTP_VERIFY_IP_LIMIT', 40),
    windowMs: 10 * 60_000,
  });
  const otpVerifyPhoneLimit = createRateLimit({
    name: 'otp-verify-phone',
    max: devLimit('E2E_OTP_VERIFY_PHONE_LIMIT', 10),
    windowMs: 10 * 60_000,
    keyGenerator: phoneRateLimitKey,
  });
  const refreshLimit = createRateLimit({
    name: 'auth-refresh-ip',
    max: 30,
    windowMs: 60_000,
  });

  router.post(
    '/auth/otp/request',
    otpRequestIpLimit,
    otpRequestPhoneLimit,
    asyncRoute(async (req, res) => {
      if (!validateRequired(res, req.body, ['phone'])) {
        return;
      }
      const result = await services.authService.requestOtpWithDetails(req.body.phone, {
        exposeCode: true,
      });
      res.status(200).json({
        ok: true,
        otpLength: result.otpLength,
        ...(result.devOtp ? { devOtp: result.devOtp } : {}),
      });
    }),
  );

  router.post(
    '/auth/otp/verify',
    otpVerifyIpLimit,
    otpVerifyPhoneLimit,
    asyncRoute(async (req, res) => {
      if (!validateRequired(res, req.body, ['phone', 'code'])) {
        return;
      }
      const tokens = await services.authService.verifyOtp(req.body.phone, req.body.code);
      if (isMobileClient(req)) {
        res.status(200).json(tokens);
        return;
      }
      setRefreshCookie(res, tokens.refreshToken);
      res.status(200).json({ accessToken: tokens.accessToken });
    }),
  );

  router.post(
    '/auth/refresh',
    refreshLimit,
    asyncRoute(async (req, res) => {
      const refreshToken = isMobileClient(req)
        ? req.body?.refreshToken
        : readRefreshCookie(req);
      if (typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
        res.status(400).json({ code: 'VALIDATION_ERROR' });
        return;
      }
      const tokens = await services.authService.refresh(refreshToken);
      if (isMobileClient(req)) {
        res.status(200).json(tokens);
        return;
      }
      setRefreshCookie(res, tokens.refreshToken);
      res.status(200).json({ accessToken: tokens.accessToken });
    }),
  );

  router.post('/auth/logout', (_req, res) => {
    clearRefreshCookie(res);
    res.status(204).end();
  });

  return router;
}

export class AuthController {
  public constructor(private readonly services: Services) {}

  public router(): Router {
    return authRouter(this.services);
  }
}
