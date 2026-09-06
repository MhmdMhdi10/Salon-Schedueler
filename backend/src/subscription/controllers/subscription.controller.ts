import { Router } from 'express';
import type { Services } from '../../http/app.js';
import type { RequireRole } from '../../common/http/require-role.js';
import { asyncRoute, validateRequired } from '../../common/http/route-helpers.js';
import type { SubscriptionPlanKind } from '../../subscription/index.js';
import { createRateLimit } from '../../http/middleware/rate-limit.js';
import { isE2EQuietLogs } from '../../common/logging.js';

/** Purchasable (non-trial) plan kinds accepted by POST /subscription/purchase. */
const PAID_PLANS: ReadonlySet<string> = new Set(['monthly', 'quarterly']);

/**
 * Subscription routes for the owner panel (Requirements 3.1, 3.2, 3.4, 3.6,
 * 3.9). Maps the owner-panel client surface (`subscriptionApi`) onto the
 * existing {@link SubscriptionService}:
 *
 * - GET  /subscription/plans          -> { plans: [{ kind, durationDays, priceRial }] }
 * - GET  /salons/:id/subscription     -> { status, planKind, expiresAt }
 * - POST /subscription/purchase        -> { redirectUrl }   (body: { salonId, plan })
 * - GET  /subscriptions/callback       -> processes gateway return, redirects to panel
 *
 * Mounted behind `requireAuth`; gated with `manage_appointments` so Owner and
 * Admin (who both see the «اشتراک» panel section) may use them while a Stylist
 * is denied (403). Monetary amounts are integer Rial carried as `bigint` in the
 * domain and serialized as decimal strings (JSON has no bigint).
 */
export function subscriptionRouter(services: Services, requireRole: RequireRole): Router {
  const router = Router();

  // Only currently purchasable plans are exposed. Legacy annual definitions
  // remain readable inside the domain for existing subscription records.
  router.get(
    '/subscription/plans',
    requireRole('manage_appointments'),
    asyncRoute(async (_req, res) => {
      const getPurchasablePlans = services.subscriptionService.getPurchasablePlans;
      const sourcePlans = getPurchasablePlans
        ? getPurchasablePlans.call(services.subscriptionService)
        : services.subscriptionService
            .getPlans()
            .filter((plan) => PAID_PLANS.has(plan.kind));
      const plans = sourcePlans.map((plan) => ({
        kind: plan.kind,
        durationDays: plan.durationDays,
        // bigint → string: IRR amounts can exceed Number.MAX_SAFE_INTEGER and
        // JSON cannot encode bigint. The client accepts number | string.
        priceRial: plan.priceRial.toString(),
      }));
      res.status(200).json({ plans });
    }),
  );

  // Effective status + expiry for a salon's subscription. A salon with no
  // subscription row reads as `expired` (reads stay open; writes are gated by
  // the subscription middleware elsewhere).
  router.get(
    '/salons/:id/subscription',
    requireRole('manage_appointments'),
    asyncRoute(async (req, res) => {
      const detail = await services.subscriptionService.getStatusResponse(req.params.id);
      if (!detail) {
        res.status(200).json({
          status: 'expired',
          planKind: 'trial',
          expiresAt: new Date(0).toISOString(),
        });
        return;
      }
      res.status(200).json({
        status: detail.status,
        planKind: detail.planKind,
        expiresAt: detail.expiresAt.toISOString(),
      });
    }),
  );

  // Begin a purchase/renewal: returns the payment-gateway redirect URL. The
  // actual activation happens server-side on the gateway callback — never here.
  router.post(
    '/subscription/purchase',
    requireRole('manage_appointments'),
    asyncRoute(async (req, res) => {
      if (!validateRequired(res, req.body, ['salonId', 'plan'])) {
        return;
      }
      const { salonId, plan } = req.body as { salonId: string; plan: string };
      if (!PAID_PLANS.has(plan)) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'plan' });
        return;
      }
      const result = await services.subscriptionService.initiatePurchase(
        salonId,
        plan as SubscriptionPlanKind,
      );
      res.status(200).json(result);
    }),
  );

  return router;
}

export class SubscriptionController {
  public constructor(
    private readonly services: Services,
    private readonly requireRole: RequireRole,
  ) {}

  public router(): Router {
    return subscriptionRouter(this.services, this.requireRole);
  }

  public callbackRouter(): Router {
    return subscriptionCallbackRouter(this.services);
  }
}

/**
 * Public subscription-callback route. The payment gateway redirects the browser
 * here after payment. Finds the pending payment by authority, activates the
 * subscription, then redirects the browser back to the owner panel.
 *
 * GET /subscriptions/callback?trackId=xxx&success=1 → 302 → /owner/subscription
 */
export function subscriptionCallbackRouter(services: Services): Router {
  const router = Router();
  const callbackLimit = createRateLimit({
    name: 'subscription-callback-ip',
    max: 30,
    windowMs: 60_000,
  });

  router.get(
    '/subscriptions/callback',
    callbackLimit,
    asyncRoute(async (req, res) => {
      const authority = (req.query.Authority ??
        req.query.authority ??
        req.query.trackId ??
        req.query.TrackId) as string | undefined;
      const success = (req.query.Success ?? req.query.success) as string | undefined;
      const status = (req.query.Status ?? req.query.status) as string | undefined;
      const isSuccessful =
        success !== undefined
          ? success === '1' || success.toLowerCase() === 'true'
          : ['OK', '100', '101', '201'].includes((status ?? '').toUpperCase());

      if (!authority || !isSuccessful) {
        if (authority && !isSuccessful) {
          try {
            const releasePayment = services.subscriptionService.markPaymentFailedByAuthority;
            if (releasePayment) {
              await releasePayment.call(services.subscriptionService, authority);
            }
          } catch (err) {
            if (!isE2EQuietLogs()) {
              console.error('[subscription-callback] failed-payment cleanup failed:', err);
            }
          }
        }
        res.redirect('/owner/subscription?payment=error');
        return;
      }

      try {
        // Find the subscription payment by authority
        const payment = await services.subscriptionService.findPaymentByAuthority(authority);
        if (!payment) {
          if (!isE2EQuietLogs()) {
            console.error(`[subscription-callback] no payment found for authority=${authority}`);
          }
          res.redirect('/owner/subscription?payment=error');
          return;
        }

        await services.subscriptionService.activateFromPayment(payment.id);
        res.redirect('/owner/subscription?payment=success');
      } catch (err) {
        if (!isE2EQuietLogs()) {
          console.error('[subscription-callback] activation failed:', err);
        }
        res.redirect('/owner/subscription?payment=error');
      }
    }),
  );

  return router;
}
