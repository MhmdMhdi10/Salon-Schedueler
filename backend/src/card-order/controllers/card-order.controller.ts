import { Router } from 'express';
import type { Services } from '../../http/app.js';
import { asyncRoute } from '../../common/http/route-helpers.js';
import type { RequireRole } from '../../common/http/require-role.js';
import { normalizeDigits } from '@salon/shared';

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
export function cardOrderRouter(services: Services, requireRole: RequireRole): Router {
  const router = Router();

  router.post(
    '/salons/:id/card-orders',
    requireRole('manage_appointments', (req) => ({ salonId: req.params.id })),
    asyncRoute(async (req, res) => {
      const body = req.body as Record<string, unknown>;
      const template = body.template;
      const quantity = Number(body.quantity);
      const contactName = typeof body.contactName === 'string' ? body.contactName.trim() : '';
      const phone = normalizeDigits(typeof body.phone === 'string' ? body.phone : '').replace(/[\s()-]/g, '');
      const province = typeof body.province === 'string' ? body.province.trim() : '';
      const city = typeof body.city === 'string' ? body.city.trim() : '';
      const address = typeof body.address === 'string' ? body.address.trim() : '';
      const postalCode = normalizeDigits(
        typeof body.postalCode === 'string' ? body.postalCode : '',
      ).replace(/\D/g, '');
      if (template !== 'card' && template !== 'banner') {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'template' });
        return;
      }
      if (![50, 100, 250, 500, 1000].includes(quantity)) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'quantity' });
        return;
      }
      if (contactName.length < 2 || contactName.length > 120) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'contactName' });
        return;
      }
      if (!/^09\d{9}$/.test(phone)) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'phone' });
        return;
      }
      if (province.length < 1 || province.length > 80) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'province' });
        return;
      }
      if (city.length < 1 || city.length > 80) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'city' });
        return;
      }
      if (address.length < 5 || address.length > 500) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'address' });
        return;
      }
      if (!/^\d{10}$/.test(postalCode)) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'postalCode' });
        return;
      }
      const notes = typeof body.notes === 'string' ? body.notes.trim() : undefined;
      if (notes && notes.length > 1000) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'notes' });
        return;
      }
      const order = await services.cardOrderService.create(req.params.id, {
        template,
        accent: typeof body.accent === 'string' ? body.accent.trim().slice(0, 40) : undefined,
        quantity,
        contactName,
        phone,
        province,
        city,
        address,
        postalCode,
        notes,
        printSpecs:
          body.printSpecs && typeof body.printSpecs === 'object'
            ? (body.printSpecs as Record<string, unknown>)
            : undefined,
      });
      await services.salonInboxService.emit({
        salonId: req.params.id,
        audience: 'owner',
        type: 'card-order.created',
        title: 'سفارش کارت جدید',
        body: `سفارش ${order.orderId} برای ${quantity} عدد ثبت شد.`,
        payload: { orderId: order.orderId },
      });
      res.status(201).json(order);
    }),
  );

  return router;
}

export class CardOrderController {
  public constructor(
    private readonly services: Services,
    private readonly requireRole: RequireRole,
  ) {}

  public router(): Router {
    return cardOrderRouter(this.services, this.requireRole);
  }
}
