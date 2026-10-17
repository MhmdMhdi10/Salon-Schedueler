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
  /** Increments whenever the page returns to the foreground or network comes back. */
  resumeVersion: number;
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
export function useInboxWs(
  salonId: string | null | undefined,
  channel: 'salon' | 'customer' = 'salon',
): UseInboxWsResult {
  const [lastEvent, setLastEvent] = useState<InboxNotification | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeVersion, setResumeVersion] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number>(0);
  const retryTimerRef = useRef<number | null>(null);
  const lastResumeAtRef = useRef(0);
  const cleanRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current === null) return;
    window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (cleanRef.current || retryTimerRef.current !== null) return;
    retryRef.current += 1;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(retryRef.current, 5));
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      connectRef.current();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    if (cleanRef.current) return;
    const activeSocket = wsRef.current;
    if (
      activeSocket &&
      (activeSocket.readyState === WebSocket.CONNECTING ||
        activeSocket.readyState === WebSocket.OPEN)
    ) {
      return;
    }
    const token = getAccessToken();
    if (!token || (channel === 'salon' && !salonId)) {
      setError('no-auth');
      return;
    }
    const url = resolveWsUrl(token);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      setError('ws-init-failed');
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      clearRetryTimer();
      retryRef.current = 0;
      setConnected(true);
      setError(null);
    };
    ws.onmessage = (msg) => {
      if (wsRef.current !== ws) return;
      try {
        const data = JSON.parse(msg.data);
        const eventType = channel === 'customer' ? 'customer-notification' : 'notification';
        if (data.type === eventType && data.payload?.id) {
          setLastEvent({
            salonId: salonId ?? '',
            audience: channel === 'customer' ? 'customer' : 'all-staff',
            staffMemberId: null,
            ...data.payload,
          } as InboxNotification);
        }
      } catch {
        // seam noise — ignore
      }
    };
    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setConnected(false);
      scheduleReconnect();
    };
    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setError('ws-error');
    };
  }, [salonId, channel, clearRetryTimer, scheduleReconnect]);

  connectRef.current = connect;

  useEffect(() => {
    cleanRef.current = false;
    connect();

    const reconnectOnResume = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastResumeAtRef.current < 1000) return;
      lastResumeAtRef.current = now;
      setResumeVersion((version) => version + 1);
      clearRetryTimer();
      retryRef.current = 0;

      const previousSocket = wsRef.current;
      wsRef.current = null;
      if (previousSocket) {
        previousSocket.onopen = null;
        previousSocket.onmessage = null;
        previousSocket.onerror = null;
        previousSocket.onclose = null;
        try {
          previousSocket.close();
        } catch {
          // The browser may already have discarded a suspended socket.
        }
      }

      setConnected(false);
      connectRef.current();
    };

    document.addEventListener('visibilitychange', reconnectOnResume);
    window.addEventListener('pageshow', reconnectOnResume);
    window.addEventListener('focus', reconnectOnResume);
    window.addEventListener('online', reconnectOnResume);

    return () => {
      cleanRef.current = true;
      clearRetryTimer();
      document.removeEventListener('visibilitychange', reconnectOnResume);
      window.removeEventListener('pageshow', reconnectOnResume);
      window.removeEventListener('focus', reconnectOnResume);
      window.removeEventListener('online', reconnectOnResume);
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
      setConnected(false);
    };
  }, [connect, clearRetryTimer]);

  return { lastEvent, connected, error, resumeVersion };
}
