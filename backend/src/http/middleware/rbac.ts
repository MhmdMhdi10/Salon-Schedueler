import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { Action, Authorizer, Principal, ResourceRef } from '../../auth/authorizer.js';

/**
 * Derives the resource reference for an authorization check from the request
 * (used for Stylist "own only" checks). Defaults to an empty reference.
 */
export type ResourceResolver = (req: Request) => ResourceRef;

/**
 * Build RBAC middleware bound to an Authorizer.
 *
 * `requireRole(action)` enforces the tenant authorization matrix: Owner/Admin
 * have full salon-panel access, while Stylist views only own appointments and
 * notes. A verified PlatformAdmin is allowed through as a global operator. A
 * denied request yields 403 `{ code: 'FORBIDDEN' }` and the handler is never
 * reached, so no state change occurs (Requirement 2.4).
 *
 * Must run after `requireAuth` so `req.principal` is populated.
 */
export function makeRbac(authorizer: Authorizer): {
  requireRole: (action: Action, resolveResource?: ResourceResolver) => RequestHandler;
} {
  const requireRole = (action: Action, resolveResource?: ResourceResolver): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction) => {
      const principal = req.principal;
      if (!principal) {
        // Defensive: requireRole should always sit behind requireAuth.
        res.status(401).json({ code: 'UNAUTHORIZED' });
        return;
      }
      if (!principal.role) {
        // Customers cannot enter tenant-scoped staff RBAC.
        res.status(403).json({ code: 'FORBIDDEN' });
        return;
      }
      const explicitResource = resolveResource ? resolveResource(req) : {};
      const routePath = typeof req.route?.path === 'string' ? req.route.path : '';
      const routeSalonId =
        routePath.includes('/salons/:id') && typeof req.params.id === 'string'
          ? req.params.id
          : routePath.includes('/salons/:salonId') && typeof req.params.salonId === 'string'
            ? req.params.salonId
            : undefined;
      const bodySalonId = typeof req.body?.salonId === 'string' ? req.body.salonId : undefined;
      const resource: ResourceRef = {
        ...explicitResource,
        salonId: explicitResource.salonId ?? routeSalonId ?? bodySalonId,
      };
      const authzPrincipal: Principal = {
        id: principal.id,
        role: principal.role,
        staffMemberId: principal.staffMemberId,
        salonId: principal.salonId,
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
