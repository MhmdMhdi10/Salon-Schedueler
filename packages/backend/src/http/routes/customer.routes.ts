import { Router } from 'express';
import type { Services } from '../app.js';
import { asyncRoute } from './route-helpers.js';

/**
 * Customer self-service routes. The authenticated principal is the only source
 * of the customer id so a customer can never ask for another customer's data.
 */
export function customerRouter(services: Services): Router {
  const router = Router();

  /** GET /customers/me/profile -> { customer } */
  router.get(
    '/customers/me/profile',
    asyncRoute(async (req, res) => {
      const customer = await services.customerService.getProfile(req.principal!.id);
      if (!customer) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      res.status(200).json({ customer });
    }),
  );

  /** PATCH /customers/me/profile — name is collected after OTP, once per customer. */
  router.patch(
    '/customers/me/profile',
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
      if (fullName.length < 2 || fullName.length > 120) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'fullName' });
        return;
      }
      const customer = await services.customerService.updateProfile(req.principal!.id, fullName);
      res.status(200).json({ customer });
    }),
  );

  /** GET /customers/me/appointments -> { appointments } */
  router.get(
    '/customers/me/appointments',
    asyncRoute(async (req, res) => {
      const appointments = await services.customerService.getHistory(req.principal!.id);
      res.status(200).json({ appointments });
    }),
  );

  /** GET /customers/me/waitlist -> { waitlist } */
  router.get(
    '/customers/me/waitlist',
    asyncRoute(async (req, res) => {
      const waitlist = await services.waitlistService.getCustomerEntries(req.principal!.id);
      res.status(200).json({ waitlist });
    }),
  );

  /** DELETE /waitlist/:id — customer-owned cancellation. */
  router.delete(
    '/waitlist/:id',
    asyncRoute(async (req, res) => {
      const entry = await services.waitlistService.getEntry(req.params.id);
      if (!entry) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      if (entry.customerId !== req.principal!.id) {
        res.status(403).json({ code: 'FORBIDDEN' });
        return;
      }
      const cancelled = await services.waitlistService.cancelEntry(entry.id);
      res.status(200).json({ waitlist: cancelled });
    }),
  );

  return router;
}
