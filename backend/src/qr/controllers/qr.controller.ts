import { Router } from 'express';
import type { Services } from '../../http/app.js';
import type { RequireRole } from '../../common/http/require-role.js';
import { asyncRoute } from '../../common/http/route-helpers.js';

/**
 * Owner-panel QR route (Requirements 4.1–4.4). Maps the panel client surface
 * (`qrApi.getSalonQr`) onto the existing {@link QrService}:
 *
 * - GET /salons/:id/qr                 -> { payload, url, salonName }
 * - GET /salons/:id/staff/:staffId/qr  -> { payload, staffName, salonName }
 *
 * The payload is the stable shared-codec encoding of the salon's `qrToken`
 * (rendered as the QR image client-side); `url` is the campaign destination
 * (`/s/:slug?utm_source=qr`). Mounted behind `requireAuth`. The salon-wide QR is
 * gated with `manage_appointments` so Owner and Admin (who both see the «QR و
 * استند» section) may use it while a Stylist is denied (403). The per-stylist QR
 * uses the resource-scoped `view_own_appointments` rule: Owner/Admin may fetch
 * ANY stylist's QR, and a Stylist may fetch ONLY their own (staffId === their own
 * staffMemberId).
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

  // Stylist-scoped QR for the owner panel: a per-staff QR that opens that
  // stylist's booking page pre-selected.
  router.get(
    '/salons/:id/staff/:staffId/qr',
    // Owner/Admin bypass the ownership check; a Stylist may fetch only their own
    // QR (staffId === their own staffMemberId). Resource scoped to the target staff.
    requireRole('view_own_appointments', (req) => ({
      salonId: req.params.id,
      staffMemberId: req.params.staffId,
    })),
    asyncRoute(async (req, res) => {
      const qr = await services.qrService.buildStaffQrResponse(
        req.params.id,
        req.params.staffId,
      );
      res.status(200).json(qr);
    }),
  );

  return router;
}

export class QrController {
  public constructor(
    private readonly services: Services,
    private readonly requireRole: RequireRole,
  ) {}

  public router(): Router {
    return qrRouter(this.services, this.requireRole);
  }
}
