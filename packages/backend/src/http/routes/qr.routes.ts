import { Router } from 'express';
import type { Services } from '../app.js';
import type { RequireRole } from './appointment.routes.js';
import { asyncRoute } from './route-helpers.js';

/**
 * Owner-panel QR route (Requirements 4.1–4.4). Maps the panel client surface
 * (`qrApi.getSalonQr`) onto the existing {@link QrService}:
 *
 * - GET /salons/:id/qr -> { payload, url, salonName }
 *
 * The payload is the stable shared-codec encoding of the salon's `qrToken`
 * (rendered as the QR image client-side); `url` is the campaign destination
 * (`/s/:slug?utm_source=qr`). Mounted behind `requireAuth`; gated with
 * `manage_appointments` so Owner and Admin (who both see the «QR و استند»
 * section) may use it while a Stylist is denied (403).
 */
export function qrRouter(services: Services, requireRole: RequireRole): Router {
  const router = Router();

  router.get(
    '/salons/:id/qr',
    requireRole('manage_appointments'),
    asyncRoute(async (req, res) => {
      const qr = await services.qrService.buildSalonQrResponse(req.params.id);
      res.status(200).json(qr);
    }),
  );

  return router;
}
