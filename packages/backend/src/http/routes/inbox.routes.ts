import { Router, type RequestHandler } from 'express';
import type { Services } from '../app.js';
import type { WebSocket as WsSocket } from 'ws';
import type { HttpPrincipal } from '../middleware/auth.js';
import type { RequireRole } from './appointment.routes.js';
import * as jwt from 'jsonwebtoken';

/**
 * Auth the WS handshake. We accept the access token either via the protocol
 * subprotocol trick (`Sec-WebSocket-Protocol: bearer.<token>`) or via the
 * `?token=` query. Browsers can't easily set custom headers on a WS, so we
 * support both for ergonomics. The verify uses the same JWT access secret as
 * the HTTP middlewares: an invalid/expired token aborts the upgrade (401).
 */
export function verifyWsToken(
  token: string,
  secret: string,
): HttpPrincipal | null {
  try {
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;
    if (!payload.sub || typeof payload.sub !== 'string') return null;
    const role =
      typeof payload.role === 'string' &&
      ['Owner', 'Admin', 'Stylist'].includes(payload.role)
        ? (payload.role as 'Owner' | 'Admin' | 'Stylist')
        : undefined;
    const staffMemberId =
      typeof payload.staffMemberId === 'string' ? payload.staffMemberId : undefined;
    const salonId = typeof payload.salonId === 'string' ? payload.salonId : undefined;
    return { id: payload.sub, role, staffMemberId, salonId };
  } catch {
    return null;
  }
}

/**
 * WS Inbox_Handle. Returned to the process bootstrap (main.ts) which attaches
 * it to the HTTP server's 'upgrade' event — Express itself cannot WS-upgrade.
 * The hub keeps the open sockets; broadcast is driven by SalonInboxService.
 */
export function makeWsInboxHandle(services: Services, jwtAccessSecret: string) {
  return {
    path: '/ws/inbox',
    /** Handle an incoming upgrade request. `socket` is the freshly-opened ws. */
    handleUpgrade(
      socket: WsSocket,
      headers: { subprotocol?: string | null; url?: string | null },
      destroy: () => void,
    ): void {
      // Extract token: subprotocol "bearer.<token>" OR ?token=
      let token: string | null = null;
      const proto = headers.subprotocol;
      if (typeof proto === 'string') {
        const m = proto.match(/^bearer\.(.+)$/i);
        if (m) token = m[1];
      }
      if (!token && typeof headers.url === 'string') {
        const q = new URL(headers.url, 'http://localhost').searchParams.get('token');
        if (q) token = q;
      }
      if (!token) {
        destroy();
        return;
      }
      const principal = verifyWsToken(token, jwtAccessSecret);
      if (!principal || !principal.salonId) {
        destroy();
        return;
      }
      services.wsInboxHub.add({
        ws: socket,
        salonId: principal.salonId,
        role: principal.role ?? '',
        staffMemberId: principal.staffMemberId,
        alive: true,
      });
      // hello frame — confirms to the client the WS is open and subscribed.
      try {
        socket.send(JSON.stringify({ type: 'ready', payload: { salonId: principal.salonId } }));
      } catch {}
      socket.on('close', () => services.wsInboxHub.remove(socket));
    },
  };
}

/**
 * Inbox router: exposes a single GET endpoint the client uses to fetch unread
 * count + recent list eagerly before relying solely on the WS push.
 */
export function inboxRouter(
  services: Services,
  requireRole: RequireRole,
): Router {
  const router = Router();

  /**
   * GET /salons/:id/notifications?onlyUnread=&limit=
   * Returns the caller-visible notifications for the salon (owner/admin see
   * all; stylist sees all-staff + rows targeted to them).
   */
  router.get(
    '/salons/:id/notifications',
    requireRole('view_own_appointments', (req) => ({ salonId: req.params.id })),
    async (req, res) => {
      const principal = req.principal!;
      const onlyUnread = req.query.onlyUnread === 'true' || req.query.onlyUnread === '1';
      const limitRaw = Number(req.query.limit ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;
      const rows = await services.salonInboxService.listForSalon(req.params.id, {
        role: principal.role ?? 'Customer',
        staffMemberId: principal.staffMemberId,
        onlyUnread,
        limit,
      });
      res.status(200).json({ notifications: rows });
    },
  );

  /** GET /salons/:id/notifications/unread-count — drives the badge. */
  router.get(
    '/salons/:id/notifications/unread-count',
    requireRole('view_own_appointments', (req) => ({ salonId: req.params.id })),
    async (req, res) => {
      const principal = req.principal!;
      const count = await services.salonInboxService.countUnread(req.params.id, {
        role: principal.role ?? 'Customer',
        staffMemberId: principal.staffMemberId,
      });
      res.status(200).json({ count });
    },
  );

  /** PATCH /notifications/:id/read — mark one row read. */
  router.patch('/notifications/:id/read', async (req, res) => {
    const row = await services.salonInboxService.markRead(req.params.id);
    if (!row) {
      res.status(404).json({ code: 'NOT_FOUND' });
      return;
    }
    res.status(200).json({ notification: row });
  });

  /** POST /salons/:id/notifications/read-all — clear the unread badge. */
  router.post(
    '/salons/:id/notifications/read-all',
    requireRole('view_own_appointments', (req) => ({ salonId: req.params.id })),
    async (req, res) => {
      const principal = req.principal!;
      const count = await services.salonInboxService.markAllRead(req.params.id, {
        role: principal.role ?? 'Customer',
        staffMemberId: principal.staffMemberId,
      });
      res.status(200).json({ ok: true, count });
    },
  );

  return router;
}
