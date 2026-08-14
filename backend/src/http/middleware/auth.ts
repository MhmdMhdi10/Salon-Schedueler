import type { Request, Response, NextFunction, RequestHandler } from 'express';
import * as jwt from 'jsonwebtoken';
import type { StaffRole } from '@salon/shared';

export type PlatformRole = 'PlatformAdmin';
export type PrincipalRole = StaffRole | PlatformRole;

/**
 * The authenticated principal attached to a request by the auth middleware.
 *
 * For customer access tokens, `role` is undefined (customers are not staff and
 * are not subject to the RBAC matrix). Staff tokens carry a `role` claim and,
 * for stylists, a `staffMemberId` used for "own only" checks.
 */
export interface HttpPrincipal {
  id: string;
  role?: PrincipalRole;
  staffMemberId?: string;
  /**
   * The salon the staff member belongs to (staff tokens only). Lets the owner
   * panel scope every read/write to the caller's own salon instead of relying
   * on a hard-coded id. Absent on customer tokens.
   */
  salonId?: string;
  /** Global admin identity; absent for customers and salon staff. */
  platformAdminId?: string;
}

// Augment Express's Request so handlers can read `req.principal`.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: HttpPrincipal;
    }
  }
}

const VALID_ROLES: ReadonlySet<string> = new Set([
  'Owner',
  'Admin',
  'Stylist',
  'PlatformAdmin',
]);

/**
 * Extract a Bearer token from the Authorization header, or null if absent.
 */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') {
    return null;
  }
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token.trim();
}

/**
 * Decode a verified JWT payload into an HttpPrincipal.
 * Returns null when the payload lacks a subject.
 */
function payloadToPrincipal(payload: jwt.JwtPayload): HttpPrincipal | null {
  if (payload.type !== 'access' || !payload.sub || typeof payload.sub !== 'string') {
    return null;
  }
  const rawRole = (payload as Record<string, unknown>).role;
  const role =
    typeof rawRole === 'string' && VALID_ROLES.has(rawRole)
      ? (rawRole as PrincipalRole)
      : undefined;
  const rawStaffId = (payload as Record<string, unknown>).staffMemberId;
  const staffMemberId = typeof rawStaffId === 'string' ? rawStaffId : undefined;
  const rawSalonId = (payload as Record<string, unknown>).salonId;
  const salonId = typeof rawSalonId === 'string' ? rawSalonId : undefined;
  const rawPlatformAdminId = (payload as Record<string, unknown>).platformAdminId;
  const platformAdminId =
    typeof rawPlatformAdminId === 'string' ? rawPlatformAdminId : undefined;
  return { id: payload.sub, role, staffMemberId, salonId, platformAdminId };
}

/**
 * Build authentication middleware bound to the JWT access secret.
 *
 * - `requireAuth` enforces a valid access token on protected routes. A missing
 *   or invalid token yields 401 `{ code: 'UNAUTHORIZED' }` and the requested
 *   action is not performed (Requirement 2.3, 2.8).
 * - `optionalAuth` attaches the principal when a valid token is present but does
 *   not reject the request when it is absent — used for public routes that still
 *   want to know the caller when available (Requirement 2.7).
 */
export function makeAuth(jwtAccessSecret: string): {
  requireAuth: RequestHandler;
  optionalAuth: RequestHandler;
} {
  const verify = (token: string): HttpPrincipal | null => {
    try {
      const decoded = jwt.verify(token, jwtAccessSecret, { algorithms: ['HS256'] });
      if (typeof decoded === 'string') {
        return null;
      }
      return payloadToPrincipal(decoded);
    } catch {
      return null;
    }
  };

  const requireAuth: RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ code: 'UNAUTHORIZED' });
      return;
    }
    const principal = verify(token);
    if (!principal) {
      res.status(401).json({ code: 'UNAUTHORIZED' });
      return;
    }
    req.principal = principal;
    next();
  };

  const optionalAuth: RequestHandler = (
    req: Request,
    _res: Response,
    next: NextFunction,
  ) => {
    const token = extractBearerToken(req);
    if (token) {
      const principal = verify(token);
      if (principal) {
        req.principal = principal;
      }
    }
    next();
  };

  return { requireAuth, optionalAuth };
}
