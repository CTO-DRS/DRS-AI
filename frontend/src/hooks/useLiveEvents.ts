import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useT } from '@/i18n';

/**
 * useLiveEvents — connects the frontend to the gateway WebSocket event hub
 * (`/ws`, drSai stream-v2 UX parity).
 *
 * Protocol (gateway/src/services/wsHub.ts):
 *   ← { type: 'ready', userId }
 *   ← { type: 'event', event: { type, payload, userId, ts } }
 *   ← { type: 'pong' }
 *   → { type: 'ping' }  (client keepalive)
 *
 * Auth: JWT passed as ?token= query param (same token as the REST API).
 *
 * Behavior:
 *   - Auto-reconnect with capped exponential backoff.
 *   - High-signal events surface as localized toasts; every event is
 *     re-broadcast as a DOM CustomEvent ('drs:ws-event') so pages (e.g. the
 *     Agents console) can refresh live without a global store.
 */

const WS_EVENT_NAME = 'drs:ws-event';

export interface LiveEvent {
  type: string;
  payload?: Record<string, unknown>;
  userId?: string;
  ts?: string;
}

function readAccessToken(): string | null {
  try {
    const raw = localStorage.getItem('tokens');
    if (!raw) return null;
    const { accessToken } = JSON.parse(raw);
    return typeof accessToken === 'string' ? accessToken : null;
  } catch {
    return null;
  }
}

function wsBaseUrl(): string {
  // VITE_API_URL is like http(s)://host:port/api/v1 → ws(s)://host:port/ws
  const api = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
  const origin = api.replace(/\/api\/v1\/?$/, '');
  return origin.replace(/^http/, 'ws');
}

function eventTitle(event: LiveEvent): string {
  const payload = event.payload || {};
  if (typeof payload.summary === 'string' && payload.summary) return payload.summary;
  if (typeof payload.name === 'string' && payload.name) return payload.name;
  if (typeof payload.taskId === 'string') return `${event.type} · ${payload.taskId}`;
  if (typeof payload.teamId === 'string') return `${event.type} · ${payload.teamId}`;
  return event.type;
}

/** Subscribe to re-broadcast live events (used by pages that need refresh). */
export function onLiveEvent(handler: (event: LiveEvent) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<LiveEvent>).detail);
  window.addEventListener(WS_EVENT_NAME, listener);
  return () => window.removeEventListener(WS_EVENT_NAME, listener);
}

export function useLiveEvents(enabled: boolean): { connected: boolean } {
  const t = useT();
  const [connected, setConnected] = useState(false);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEvent = useCallback(
    (event: LiveEvent) => {
      // Fan out to interested pages (Agents console, dashboards, …).
      window.dispatchEvent(new CustomEvent<LiveEvent>(WS_EVENT_NAME, { detail: event }));

      const title = eventTitle(event);
      switch (event.type) {
        case 'approval.requested':
          toast.info(title, {
            description: t('events.approvalRequested'),
            action: { label: t('events.view'), onClick: () => { window.location.hash = '#/agents'; } },
          });
          break;
        case 'teamrun.completed':
          toast.success(title, { description: t('events.teamRunCompleted') });
          break;
        case 'teamrun.failed':
          toast.error(title, { description: t('events.teamRunFailed') });
          break;
        case 'plan.completed':
          toast.success(title, { description: t('events.planCompleted') });
          break;
        default:
          // task.created / task.updated / plan.created / plan.progress /
          // approval.decided — no toast (avoid noise), DOM event is enough.
          break;
      }
    },
    [t]
  );

  useEffect(() => {
    if (!enabled) return;

    let ws: WebSocket | null = null;
    let disposed = false;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const handleEventRef = handleEvent;

    const connect = () => {
      if (disposed) return;

      const token = readAccessToken();
      if (!token) return; // not authenticated yet

      const url = `${wsBaseUrl()}/ws?token=${encodeURIComponent(token)}`;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleRetry();
        return;
      }

      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
        // Client-side keepalive (server also pings every 30s).
        pingTimer = setInterval(() => {
          try { ws?.send(JSON.stringify({ type: 'ping' })); } catch { /* closing */ }
        }, 25_000);
      };

      ws.onmessage = (msg) => {
        let data: { type?: string; event?: LiveEvent };
        try {
          data = JSON.parse(msg.data);
        } catch {
          return;
        }
        if (data.type === 'event' && data.event) {
          handleEventRef(data.event);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        scheduleRetry();
      };

      ws.onerror = () => {
        try { ws?.close(); } catch { /* noop */ }
      };
    };

    const scheduleRetry = () => {
      if (disposed) return;
      const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
      retryRef.current += 1;
      timerRef.current = setTimeout(connect, delay);
    };

    connect();

    return () => {
      disposed = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pingTimer) clearInterval(pingTimer);
      try { ws?.close(); } catch { /* noop */ }
    };
  }, [enabled, handleEvent]);

  return { connected };
}
