import { Router } from 'express';
import type { Services } from '../app.js';
import { asyncRoute, validateRequired } from './route-helpers.js';

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

  router.post(
    '/auth/otp/request',
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
