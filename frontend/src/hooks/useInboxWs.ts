import { useEffect, useRef, useState, useCallback } from 'react';
import { getAccessToken } from '../api/client';

/**
 * An inbox notification row as the backend delivers it (REST list +
 * WS push share the same shape; the WS frame wraps it under `payload`).
 */
export interface InboxNotification {
  id: string;
  salonId: string;
  audience: string;
  staffMemberId: string | null;
  type: string;
  title: string;
  body: string;
  payload: {
    appointmentId?: string;
    orderId?: string;
    staffMemberId?: string;
    customerId?: string;
    date?: string;
    [key: string]: unknown;
  } | null;
  readAt: string | null;
  createdAt: string;
}

export interface UseInboxWsResult {
  /** Latest live notification pushed by the WS, cleared each time it's read. */
  lastEvent: InboxNotification | null;
  /** True if the WS is connected and authenticated. */
  connected: boolean;
  /** The last error encountered (auth/upgrade). Null on a clean state. */
  error: string | null;
}

/**
 * Resolve the WS URL for the inbox channel. Replaces the protocol scheme of the
 * API base (http/https) with ws/wss, then walks up a path segment so the WS
 * mount path matches. Falls back to a sane dev default (`ws://localhost:3110`).
 */
function resolveWsUrl(token: string): string {
  const apiBase =
    (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL || '/api';
  if (apiBase.startsWith('http')) {
    const wsBase = apiBase
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:')
      .replace(/\/api\/?$/, '');
    return `${wsBase}/ws/inbox?token=${encodeURIComponent(token)}`;
  }
  // Same-origin proxy → use the current page host.
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${apiBase.replace(/\/api$/, '')}/ws/inbox?token=${encodeURIComponent(token)}`;
}

/**
 * Subscribe to the salon inbox realtime channel. Reconnects with backoff when
 * the socket drops; surfaces a `connected` flag + the most recent event.
 *
 * Note: The hook purposefully only tracks the latest event (to power the toast
 * / bell bump). Persistent state lives in the page that calls this together
 * with the REST list endpoint — see `OwnerNotificationsPage`.
 */
export function useInboxWs(salonId: string | null | undefined): UseInboxWsResult {
  const [lastEvent, setLastEvent] = useState<InboxNotification | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number>(0);
  const cleanRef = useRef(false);

  const connect = useCallback(() => {
    if (cleanRef.current) return;
    const token = getAccessToken();
    if (!token || !salonId) {
      setError('no-auth');
      return;
    }
    const url = resolveWsUrl(token);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      setError('ws-init-failed');
      retryRef.current += 1;
      const delay = Math.min(15000, 1000 * 2 ** retryRef.current);
      setTimeout(connect, delay);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      retryRef.current = 0;
      setConnected(true);
      setError(null);
    };
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === 'notification' && data.payload?.id) {
          setLastEvent(data.payload as InboxNotification);
        }
      } catch {
        // seam noise — ignore
      }
    };
    ws.onclose = () => {
      setConnected(false);
      if (cleanRef.current) return;
      // exponential backoff, capped at 30s
      retryRef.current += 1;
      const delay = Math.min(30000, 1000 * 2 ** Math.min(retryRef.current, 5));
      setTimeout(connect, delay);
    };
    ws.onerror = () => {
      setError('ws-error');
    };
  }, [salonId]);

  useEffect(() => {
    cleanRef.current = false;
    connect();
    return () => {
      cleanRef.current = true;
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.onopen = null;
        try {
          ws.close();
        } catch {
          // Socket already closed — nothing to release.
        }
      }
      wsRef.current = null;
    };
  }, [connect]);

  return { lastEvent, connected, error };
}
