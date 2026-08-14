import { Router } from 'express';
import type { Services } from '../../http/app.js';
import type { RequireRole } from '../../common/http/require-role.js';
import { asyncRoute } from '../../common/http/route-helpers.js';

/**
 * Transactions list for the owner panel (Requirement 2.2, 2.4).
 *
 * Aggregates the two money-flow tables — appointment `Payment`s and
 * `SubscriptionPayment`s — into a single unified ledger the owner can audit.
 * Both are scoped to the salon and ordered newest-first. Card-order intake
 * (`card_orders`) is fulfilment-only and not a money transaction, so it is
 * intentionally excluded.
 *
 *   GET /salons/:id/transactions  (RBAC: manage_appointments) -> 200 { transactions }
 */
export function transactionRouter(services: Services, requireRole: RequireRole): Router {
  const router = Router();

  router.get(
    '/salons/:id/transactions',
    requireRole('manage_appointments'),
    asyncRoute(async (req, res) => {
      const transactions = await services.analyticsService.listTransactions(req.params.id);
      res.status(200).json({ transactions });
    }),
  );

  return router;
}

export class TransactionController {
  public constructor(
    private readonly services: Services,
    private readonly requireRole: RequireRole,
  ) {}

  public router(): Router {
    return transactionRouter(this.services, this.requireRole);
  }
}
