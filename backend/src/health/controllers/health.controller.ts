import { Router } from 'express';

/**
 * Liveness endpoint (Requirement 2.1). Public — no authentication.
 *
 * GET /healthz -> 200 { status: 'ok' }
 */
export function healthRouter(): Router {
  const router = Router();
  router.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  return router;
}

export class HealthController {
  public router(): Router {
    return healthRouter();
  }
}
