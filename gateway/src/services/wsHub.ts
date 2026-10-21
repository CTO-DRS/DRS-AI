import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

/**
 * WsHub — real-time event hub (drSai stream-v2 UX parity).
 *
 * Subscribes to the platform Redis pub/sub channel "drs:events"
 * (published by the Orchestrator: task updates, approvals, plan
 * progress, team-run transcripts, MCP calls) and fans events out to
 * authenticated browser WebSocket clients.
 *
 * Client protocol:
 *   → { "type": "auth", "token": "<JWT>" }        (authenticate)
 *   → { "type": "ping" }                          (heartbeat)
 *   ← { "type": "ready", "userId": "..." }        (after auth)
 *   ← { "type": "event", "event": { ... } }       (user-scoped event)
 *   ← { "type": "pong" }
 *
 * JWT may also be passed as ?token= on the connection URL.
 */

const JWT_SECRET = process.env.JWT_SECRET || 'drs-dev-secret';
const EVENTS_CHANNEL = 'drs:events';

interface AuthedSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

export class WsHub {
  private wss: WebSocketServer;
  private subscriber: Redis;
  private clientsByUser = new Map<string, Set<AuthedSocket>>();
  private heartbeat: NodeJS.Timeout;

  constructor(wss: WebSocketServer) {
    this.wss = wss;

    // Dedicated connection for pub/sub (ioredis requirement)
    this.subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      retryStrategy: (times) => Math.min(times * 50, 2000)
    });
    this.subscriber.on('error', (err) => logger.error('WsHub subscriber error:', err.message));

    this.subscriber.subscribe(EVENTS_CHANNEL).then(() => {
      logger.info(`WsHub subscribed to ${EVENTS_CHANNEL}`);
    }).catch((err) => {
      logger.error(`WsHub failed to subscribe: ${err.message}`);
    });

    this.subscriber.on('message', (_channel: string, raw: string) => {
      this.dispatch(raw);
    });

    // Heartbeat: detect dead connections every 30s
    this.heartbeat = setInterval(() => {
      this.wss.clients.forEach((client: AuthedSocket) => {
        if (client.isAlive === false) {
          client.terminate();
          return;
        }
        client.isAlive = true;
        try { client.ping(); } catch { /* closing */ }
      });
    }, 30_000);

    this.wss.on('connection', (ws, req) => this.onConnection(ws as AuthedSocket, req));
  }

  private onConnection(ws: AuthedSocket, req: IncomingMessage): void {
    logger.info(`WS client connected: ${req.url}`);
    ws.isAlive = true;

    ws.on('pong', () => { ws.isAlive = true; });

    // Optional ?token= query auth
    const url = new URL(req.url || '/', 'http://localhost');
    const token = url.searchParams.get('token');
    if (token) this.authenticate(ws, token);

    ws.on('message', (data) => {
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        this.send(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }

      switch (msg.type) {
        case 'auth':
          this.authenticate(ws, msg.token);
          break;
        case 'ping':
          this.send(ws, { type: 'pong', ts: new Date().toISOString() });
          break;
        default:
          this.send(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
      }
    });

    ws.on('close', () => {
      if (ws.userId) {
        this.clientsByUser.get(ws.userId)?.delete(ws);
        if (this.clientsByUser.get(ws.userId)?.size === 0) {
          this.clientsByUser.delete(ws.userId);
        }
      }
      logger.info(`WS client disconnected${ws.userId ? ` (user ${ws.userId})` : ''}`);
    });

    ws.on('error', (error) => logger.error('WS client error:', error.message));
  }

  private authenticate(ws: AuthedSocket, token: string): void {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      ws.userId = payload.userId;
      if (!this.clientsByUser.has(ws.userId!)) {
        this.clientsByUser.set(ws.userId!, new Set());
      }
      this.clientsByUser.get(ws.userId!)!.add(ws);
      this.send(ws, { type: 'ready', userId: ws.userId });
      logger.debug(`WS client authenticated as user ${ws.userId}`);
    } catch {
      this.send(ws, { type: 'error', code: 'AUTH_FAILED', message: 'Invalid token' });
    }
  }

  private dispatch(raw: string): void {
    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    // User-scoped events go only to that user's sockets
    const targetUserId: string | undefined = event.userId;
    const envelope = JSON.stringify({ type: 'event', event });

    if (targetUserId) {
      const sockets = this.clientsByUser.get(targetUserId);
      if (!sockets || sockets.size === 0) return;
      for (const socket of sockets) {
        this.sendRaw(socket, envelope);
      }
    }
  }

  private send(ws: WebSocket, payload: Record<string, any>): void {
    this.sendRaw(ws, JSON.stringify(payload));
  }

  private sendRaw(ws: WebSocket, raw: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(raw); } catch { /* closing */ }
    }
  }

  close(): void {
    clearInterval(this.heartbeat);
    this.subscriber.quit().catch(() => this.subscriber.disconnect());
  }
}

export default WsHub;
