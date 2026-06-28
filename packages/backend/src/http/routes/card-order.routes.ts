import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { asyncRoute, validateRequired } from './route-helpers.js';
import type { RequireRole } from './appointment.routes.js';

/**
 * Printed-card order intake for the owner panel «سفارش کارت چاپی» surface.
 *
 * - POST /api/salons/:id/card-orders  (RBAC: manage_appointments)
 *
 * The salon orders professionally printed QR cards/banners (the same custom
 * design previewed in the panel). This endpoint validates and acknowledges the
 * order with a tracking id; payment, printing and shipping are handled out of
 * band (a fulfilment back-office), so it never claims more than "received".
 */
export function cardOrderRouter(requireRole: RequireRole): Router {
  const router = Router();

  router.post(
    '/salons/:id/card-orders',
    requireRole('manage_appointments'),
    asyncRoute(async (req, res) => {
      if (
        !validateRequired(res, req.body, [
          'template',
          'quantity',
          'contactName',
          'phone',
          'address',
        ])
      ) {
        return;
      }

      // A short, human-friendly tracking id. Fulfilment is out of band.
      const orderId = `CARD-${randomUUID().slice(0, 8).toUpperCase()}`;
      res.status(201).json({ orderId, status: 'received' });
    }),
  );

  return router;
}
