import { Router } from 'express';
import type { Services } from '../app.js';
import { asyncRoute, validateRequired } from './route-helpers.js';

/**
 * Protected device-token registration route (mounted behind `requireAuth`).
 *
 * The mobile client registers its push token here after authenticating so the
 * Notification_Service can deliver push reminders (original R12.3). The customer
 * id comes from the authenticated principal.
 *
 * - POST /devices/token { token, platform } -> 200 { ok: true }
 */
export function deviceRouter(services: Services): Router {
  const router = Router();

  router.post(
    '/devices/token',
    asyncRoute(async (req, res) => {
      if (!validateRequired(res, req.body, ['token', 'platform'])) {
        return;
      }
      const principal = req.principal!;
      await services.notificationService.registerDeviceToken(
        principal.id,
        req.body.token,
        req.body.platform,
      );
      res.status(200).json({ ok: true });
    }),
  );

  return router;
}
