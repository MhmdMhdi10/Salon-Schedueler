import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { SubscriptionService } from '../../subscription/index.js';

/**
 * HTTP methods that only read state. Reads are always permitted, even when a
 * salon's subscription is `expired` (Requirement 3.9, Property 8: reads allowed
 * on expired, writes blocked).
 */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Resolves the salonId a request operates on from the request. The default
 * resolver looks in the conventional places used by the panel/owner routes:
 * the `salonId` route param, the generic `id` route param, then `salonId` in
 * the request body. A custom resolver can be supplied for routes that carry
 * the salon reference elsewhere.
 */
export type SalonIdResolver = (req: Request) => string | undefined;

const defaultResolveSalonId: SalonIdResolver = (req) => {
  const fromParams =
    (req.params as Record<string, string | undefined>).salonId ??
    (req.params as Record<string, string | undefined>).id;
  if (fromParams) {
    return fromParams;
  }
  const body = req.body as Record<string, unknown> | undefined;
  const fromBody = body?.salonId;
  return typeof fromBody === 'string' ? fromBody : undefined;
};

/**
 * Build subscription-gating middleware bound to a {@link SubscriptionService}.
 *
 * Mounted on owner/panel routers, it enforces the subscription lifecycle gate
 * (Requirements 3.8, 3.9, Property 8):
 *
 *   - `trial` / `active` / `grace` → the request proceeds (`next()`).
 *   - `expired` → write operations (unsafe HTTP methods) are blocked with
 *     `402 { code: 'SUBSCRIPTION_REQUIRED' }` and the handler is never reached,
 *     so no state change occurs. Read operations (GET/HEAD/OPTIONS) are still
 *     allowed so an expired salon can view its data and reach the renewal flow.
 *
 * Must run after `requireAuth` so `req.principal` is populated; if no principal
 * is present it responds `401 { code: 'UNAUTHORIZED' }`, matching `requireRole`.
 */
export function requireActiveSubscription(
  subscriptionService: Pick<SubscriptionService, 'getStatus'>,
  resolveSalonId: SalonIdResolver = defaultResolveSalonId,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const principal = req.principal;
    if (!principal) {
      // Defensive: requireActiveSubscription should sit behind requireAuth.
      res.status(401).json({ code: 'UNAUTHORIZED' });
      return;
    }

    const salonId = resolveSalonId(req);
    if (!salonId) {
      // Without a salon reference we cannot evaluate the gate; treat it as a
      // bad request rather than silently allowing the operation through.
      res.status(400).json({ code: 'SALON_ID_REQUIRED' });
      return;
    }

    const status = await subscriptionService.getStatus(salonId);

    if (status === 'expired') {
      // Reads stay open on an expired subscription; writes are blocked (R3.9).
      if (SAFE_METHODS.has(req.method.toUpperCase())) {
        next();
        return;
      }
      res.status(402).json({ code: 'SUBSCRIPTION_REQUIRED' });
      return;
    }

    // trial / active / grace are all allowed through.
    next();
  };
}
