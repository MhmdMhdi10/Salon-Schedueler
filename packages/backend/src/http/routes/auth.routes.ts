import { Router } from 'express';
import type { Services } from '../app.js';
import { asyncRoute, validateRequired } from './route-helpers.js';
import {
  createRateLimit,
  phoneRateLimitKey,
} from '../middleware/rate-limit.js';

/**
 * Auth routes (public — no token required). Maps to `AuthService` and reuses the
 * stable error codes via `mapDomainError` (Requirement 2.2, 2.5 / original R1).
 *
 * - POST /auth/otp/request  { phone }            -> 200 { ok: true, devOtp? }
 * - POST /auth/otp/verify   { phone, code }      -> 200 { accessToken, refreshToken }
 * - POST /auth/refresh      { refreshToken }     -> 200 { accessToken, refreshToken }
 *
 * Error mapping (via mapDomainError): OTP_EXPIRED -> 401 OTP_EXPIRED;
 * OTP_MISMATCH / NO_OTP -> 401 OTP_INVALID; INVALID_TOKEN -> 401 INVALID_TOKEN.
 */
export function authRouter(services: Services): Router {
  const router = Router();

  const otpRequestIpLimit = createRateLimit({
    name: 'otp-request-ip',
    // SMS cost is additionally bounded per phone below. A wider IP window
    // keeps shared offices and the automated onboarding matrix from colliding
    // while still stopping request floods.
    max: 60,
    windowMs: 60_000,
  });
  const otpRequestPhoneLimit = createRateLimit({
    name: 'otp-request-phone',
    max: 5,
    windowMs: 10 * 60_000,
    keyGenerator: phoneRateLimitKey,
  });
  const otpVerifyIpLimit = createRateLimit({
    name: 'otp-verify-ip',
    // Keep brute-force protection per phone below; this IP cap accounts for
    // shared offices and multi-user onboarding from one network.
    max: 40,
    windowMs: 10 * 60_000,
  });
  const otpVerifyPhoneLimit = createRateLimit({
    name: 'otp-verify-phone',
    max: 10,
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
      const devOtp = await services.authService.requestOtp(req.body.phone, { exposeCode: true });
      res.status(200).json(devOtp ? { ok: true, devOtp } : { ok: true });
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
      res.status(200).json(tokens);
    }),
  );

  router.post(
    '/auth/refresh',
    refreshLimit,
    asyncRoute(async (req, res) => {
      if (!validateRequired(res, req.body, ['refreshToken'])) {
        return;
      }
      const tokens = await services.authService.refresh(req.body.refreshToken);
      res.status(200).json(tokens);
    }),
  );

  return router;
}
