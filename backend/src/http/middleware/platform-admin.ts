import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { PlatformAdminService } from '../../platform-admin/services/index.js';

/**
 * Guard for global operator routes. JWT role alone is not enough: checking the
 * row on every request lets an operator be disabled without waiting for token
 * expiry and keeps tenant staff tokens out of the platform surface.
 */
export function makePlatformAdminGuard(service: PlatformAdminService): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const principal = req.principal;
    if (
      !principal ||
      principal.role !== 'PlatformAdmin' ||
      !principal.platformAdminId ||
      principal.id !== principal.platformAdminId
    ) {
      res.status(403).json({ code: 'FORBIDDEN' });
      return;
    }
    service
      .isActiveAdmin(principal.platformAdminId)
      .then((active) => {
        if (!active) {
          res.status(403).json({ code: 'FORBIDDEN' });
          return;
        }
        next();
      })
      .catch(next);
  };
}
