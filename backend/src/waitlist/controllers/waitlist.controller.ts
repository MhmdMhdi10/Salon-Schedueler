import { Router } from 'express';
import type { Services } from '../../http/app.js';
import { asyncRoute, validateRequired } from '../../common/http/route-helpers.js';
import {
  createRateLimit,
  principalOrIpRateLimitKey,
} from '../../http/middleware/rate-limit.js';

const MAX_WAITLIST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Customer waitlist entry point for a selected day with no available slots. */
export function waitlistRouter(services: Services): Router {
  const router = Router();
  const joinLimit = createRateLimit({
    name: 'waitlist-join',
    max: 10,
    windowMs: 10 * 60_000,
    keyGenerator: principalOrIpRateLimitKey,
  });

  router.post(
    '/salons/:id/waitlist',
    joinLimit,
    asyncRoute(async (req, res) => {
      if (!validateRequired(res, req.body, ['serviceId', 'windowStart', 'windowEnd'])) return;

      const windowStart = new Date(String(req.body.windowStart));
      const windowEnd = new Date(String(req.body.windowEnd));
      if (
        Number.isNaN(windowStart.getTime()) ||
        Number.isNaN(windowEnd.getTime()) ||
        windowEnd <= windowStart ||
        windowEnd.getTime() - windowStart.getTime() > MAX_WAITLIST_WINDOW_MS
      ) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'windowEnd' });
        return;
      }

      const servicesForSalon = await services.serviceCatalog.listServices(req.params.id);
      if (!servicesForSalon.some((service) => service.id === String(req.body.serviceId))) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }

      const bookingWindowDays = await services.availabilityConfig.getBookingWindowDays(req.params.id);
      const now = Date.now();
      const latestAllowed = now + (Math.max(0, bookingWindowDays) + 1) * 24 * 60 * 60 * 1000;
      // A day-level waitlist intentionally starts at local midnight, which is
      // usually already in the past by the time a customer joins. Only the end
      // of the requested window must still be in the future.
      if (windowEnd.getTime() <= now || windowEnd.getTime() > latestAllowed) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'windowEnd' });
        return;
      }

      const entry = await services.waitlistService.joinWaitlist({
        salonId: req.params.id,
        customerId: req.principal!.id,
        serviceId: String(req.body.serviceId),
        windowStart,
        windowEnd,
      });
      res.status(201).json({ waitlist: entry });
    }),
  );

  return router;
}

export class WaitlistController {
  public constructor(private readonly services: Services) {}

  public router(): Router {
    return waitlistRouter(this.services);
  }
}
