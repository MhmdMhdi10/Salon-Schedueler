import type { WebSocket } from 'ws';
import type { InboxAudience, InboxEvent, InboxHub } from './salon-inbox.service.js';

interface Conn {
  ws: WebSocket;
  salonId: string;
  role: string;
  staffMemberId?: string;
  alive: boolean;
}

/**
 * In-memory realization of {@link InboxHub} that holds open WS connections
 * by salonId room and broadcasts matching events to live admin/staff clients.
 *
 * Used directly by the HTTP process in dev. For a real farm, swap this for a
 * Redis pub/sub-backed hub (the WS route still only reads from here).
 */
export class WsInboxHub implements InboxHub {
  private conns = new Map<WebSocket, Conn>();

  add(conn: Conn) {
    this.conns.set(conn.ws, conn);
    conn.ws.on('pong', () => {
      conn.alive = true;
    });
  }

  remove(ws: WebSocket) {
    this.conns.delete(ws);
  }

  /** Match a conn against an event's audience scope. */
  private matches(conn: Conn, audience: InboxAudience, staffMemberId: string | null): boolean {
    if (audience === 'owner' || audience === 'admin') {
      return conn.role === 'Owner' || conn.role === 'Admin';
    }
    if (audience === 'all-staff') return true;
    // 'stylist' — target staff member only
    return conn.staffMemberId === staffMemberId && !!conn.staffMemberId;
  }

  broadcast(salonId: string, audience: InboxAudience, staffMemberId: string | null, event: InboxEvent) {
    const data = JSON.stringify({ type: 'notification', payload: event });
    for (const conn of this.conns.values()) {
      if (conn.salonId !== salonId) continue;
      if (conn.ws.readyState !== conn.ws.OPEN) continue;
      if (!this.matches(conn, audience, staffMemberId)) continue;
      try {
        conn.ws.send(data);
      } catch {
        // swallow single-send errors; the durable row covers it
      }
    }
  }

  /** Periodic heartbeat; dead sockets are removed. */
  sweep() {
    for (const [ws, conn] of this.conns) {
      if (!conn.alive) {
        try {
          ws.terminate();
        } catch {}
        this.conns.delete(ws);
        continue;
      }
      conn.alive = false;
      try {
        ws.ping();
      } catch {}
    }
  }
}
