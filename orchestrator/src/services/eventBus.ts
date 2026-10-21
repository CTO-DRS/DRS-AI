import Redis from 'ioredis';
import logger from '../utils/logger';

/**
 * EventBus — publishes orchestrator events on a Redis pub/sub channel.
 * The Gateway WebSocket hub subscribes to the same channel and fans
 * events out to connected clients per user, giving the platform a
 * real-time event stream (drSai-style streaming UX).
 *
 * Channel: drs:events
 * Envelope: { type, userId?, payload, ts, source }
 */

export const EVENTS_CHANNEL = 'drs:events';

export type OrchestratorEventType =
  | 'task.created'
  | 'task.updated'
  | 'approval.requested'
  | 'approval.decided'
  | 'plan.created'
  | 'plan.progress'
  | 'plan.completed'
  | 'teamrun.progress'
  | 'teamrun.completed'
  | 'teamrun.failed'
  | 'mcp.tool_called'
  | 'a2a.message';

export interface OrchestratorEvent {
  type: OrchestratorEventType;
  userId?: string;
  payload: Record<string, any>;
  ts: string;
  source: 'orchestrator';
}

class EventBus {
  private publisher: Redis | null = null;

  private getPublisher(): Redis {
    if (!this.publisher) {
      this.publisher = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 2,
        lazyConnect: false
      });
      this.publisher.on('error', (err) => logger.error('EventBus publisher error:', err.message));
    }
    return this.publisher;
  }

  async publish(type: OrchestratorEventType, payload: Record<string, any>, userId?: string): Promise<void> {
    const event: OrchestratorEvent = {
      type,
      userId,
      payload,
      ts: new Date().toISOString(),
      source: 'orchestrator'
    };

    try {
      await this.getPublisher().publish(EVENTS_CHANNEL, JSON.stringify(event));
      logger.debug(`Event published: ${type} (user=${userId || 'system'})`);
    } catch (error: any) {
      // Publishing must never break the main flow
      logger.error(`Failed to publish event ${type}:`, error.message);
    }
  }

  async close(): Promise<void> {
    if (this.publisher) {
      await this.publisher.quit().catch(() => this.publisher?.disconnect());
      this.publisher = null;
    }
  }
}

export const eventBus = new EventBus();
export default eventBus;
