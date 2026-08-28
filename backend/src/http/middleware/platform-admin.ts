import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { PlatformAdminService } from '../../platform-admin/services/index.js';

/**
 * Guard for global operator routes. JWT role alone is not enough: checking the
 * platform-admin row on every request lets an operator be disabled without
 * waiting for token expiry and keeps tenant staff tokens out of the platform
 * surface. The JWT subject may be the matching customer subject used by the
 * shared customer panel, so `platformAdminId` is the global identity boundary.
 */
export function makePlatformAdminGuard(service: PlatformAdminService): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const principal = req.principal;
    if (!principal || principal.role !== 'PlatformAdmin' || !principal.platformAdminId) {
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
