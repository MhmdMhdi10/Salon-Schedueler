import { Router, type RequestHandler } from 'express';
import type { Services } from '../../http/app.js';
import type { RequireRole } from '../../common/http/require-role.js';
import { asyncRoute } from '../../common/http/route-helpers.js';
import { ReferralStateError } from '../../referral/services/index.js';

function unavailable(res: Parameters<RequestHandler>[1]): void {
  res.status(503).json({ code: 'FEATURE_UNAVAILABLE' });
}

export function referralPublicRouter(services: Services): Router {
  const router = Router();
  router.get(
    '/referrals/claim/:token',
    asyncRoute(async (req, res) => {
      if (!services.referralService) {
        unavailable(res);
        return;
      }
      const referral = await services.referralService.getClaimPreview(req.params.token);
      if (!referral) {
        res.status(404).json({ code: 'NOT_FOUND' });
        return;
      }
      res.status(200).json({
        referral: {
          salonName: referral.salonName,
          city: referral.city,
          status: referral.status,
          rewardAmountRial: referral.rewardAmountRial,
          requiredBookings: referral.requiredBookings,
        },
      });
    }),
  );
  return router;
}

function isCustomer(req: Parameters<RequestHandler>[0]): boolean {
  return Boolean(req.principal && !req.principal.role);
}

export function referralRouter(services: Services, requireRole: RequireRole): Router {
  const router = Router();

  router.post(
    '/referrals',
    asyncRoute(async (req, res) => {
      if (!services.referralService) {
        unavailable(res);
        return;
      }
      if (!isCustomer(req)) {
        res.status(403).json({ code: 'FORBIDDEN' });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const referral = await services.referralService.create({
        referrerId: req.principal!.id,
        salonName: body.salonName as string,
        city: body.city as string,
        salonPhone: typeof body.salonPhone === 'string' ? body.salonPhone : undefined,
        salonInstagram: typeof body.salonInstagram === 'string' ? body.salonInstagram : undefined,
      });
      res.status(201).json({ referral });
    }),
  );

  router.get(
    '/customers/me/referrals',
    asyncRoute(async (req, res) => {
      if (!services.referralService) {
        unavailable(res);
        return;
      }
      if (!isCustomer(req)) {
        res.status(403).json({ code: 'FORBIDDEN' });
        return;
      }
      res.status(200).json({ referrals: await services.referralService.listForCustomer(req.principal!.id) });
    }),
  );

  router.get(
    '/salons/:id/referrals',
    requireRole('manage_appointments', (req) => ({ salonId: req.params.id })),
    asyncRoute(async (req, res) => {
      if (!services.referralService) {
        unavailable(res);
        return;
      }
      res.status(200).json({ referrals: await services.referralService.listForSalon(req.params.id) });
    }),
  );

  router.post(
    '/referrals/:id/redeem',
    requireRole('manage_appointments'),
    asyncRoute(async (req, res) => {
      if (!services.referralService) {
        unavailable(res);
        return;
      }
      const salonId = req.principal?.salonId;
      if (!salonId) {
        res.status(403).json({ code: 'FORBIDDEN' });
        return;
      }
      try {
        const referral = await services.referralService.redeem(req.params.id, salonId);
        res.status(200).json({ referral });
      } catch (error) {
        if (error instanceof ReferralStateError) {
          const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'WRONG_SALON' ? 403 : 409;
          res.status(status).json({ code: error.code });
          return;
        }
        throw error;
      }
    }),
  );

  return router;
}

export class ReferralController {
  public constructor(
    private readonly services: Services,
    private readonly requireRole: RequireRole,
  ) {}

  public publicRouter(): Router {
    return referralPublicRouter(this.services);
  }

  public router(): Router {
    return referralRouter(this.services, this.requireRole);
  }
}
