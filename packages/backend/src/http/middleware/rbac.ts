import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type {
  Action,
  Authorizer,
  Principal,
  ResourceRef,
} from '../../auth/authorizer.js';

/**
 * Derives the resource reference for an authorization check from the request
 * (used for Stylist "own only" checks). Defaults to an empty reference.
 */
export type ResourceResolver = (req: Request) => ResourceRef;

/**
 * Build RBAC middleware bound to an Authorizer.
 *
 * `requireRole(action)` enforces the original authorization matrix: Owner always
 * configures, Admin manages appointments, Stylist views only own appointments and
 * notes. A denied request yields 403 `{ code: 'FORBIDDEN' }` and the handler is
 * never reached, so no state change occurs (Requirement 2.4).
 *
 * Must run after `requireAuth` so `req.principal` is populated.
 */
export function makeRbac(authorizer: Authorizer): {
  requireRole: (action: Action, resolveResource?: ResourceResolver) => RequestHandler;
} {
  const requireRole = (
    action: Action,
    resolveResource?: ResourceResolver,
  ): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction) => {
      const principal = req.principal;
      if (!principal) {
        // Defensive: requireRole should always sit behind requireAuth.
        res.status(401).json({ code: 'UNAUTHORIZED' });
        return;
      }
      if (!principal.role) {
        // A customer (no staff role) cannot perform staff-guarded actions.
        res.status(403).json({ code: 'FORBIDDEN' });
        return;
      }
      const resource: ResourceRef = resolveResource ? resolveResource(req) : {};
      const authzPrincipal: Principal = {
        id: principal.id,
        role: principal.role,
        staffMemberId: principal.staffMemberId,
      };
      if (!authorizer.can(authzPrincipal, action, resource)) {
        res.status(403).json({ code: 'FORBIDDEN' });
        return;
      }
      next();
    };
  };

  return { requireRole };
}
