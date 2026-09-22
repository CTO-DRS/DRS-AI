/**
 * Session Manager
 * Manages code execution sessions
 */

import { createLogger } from '../utils/logger';
import { ExecutionSession } from '../models/types';

const logger = createLogger('SessionManager');

export class SessionManager {
  private sessions: Map<string, ExecutionSession>;
  private readonly MAX_SESSIONS = 50;
  private readonly SESSION_TIMEOUT = 300000; // 5 minutes

  constructor() {
    this.sessions = new Map();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Session Manager...');
    
    // Start cleanup interval
    setInterval(() => this.cleanupExpiredSessions(), 60000);
    
    logger.info('✅ Session Manager initialized');
  }

  addSession(session: ExecutionSession): void {
    // Check max sessions
    if (this.sessions.size >= this.MAX_SESSIONS) {
      // Remove oldest session
      const oldest = Array.from(this.sessions.values())
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      if (oldest) {
        this.sessions.delete(oldest.id);
      }
    }

    this.sessions.set(session.id, session);
    logger.info(`Session ${session.id} added`);
  }

  getSession(id: string): ExecutionSession | undefined {
    return this.sessions.get(id);
  }

  updateSession(id: string, updates: Partial<ExecutionSession>): void {
    const session = this.sessions.get(id);
    if (session) {
      Object.assign(session, updates);
    }
  }

  removeSession(id: string): void {
    this.sessions.delete(id);
    logger.info(`Session ${id} removed`);
  }

  getActiveSessions(): ExecutionSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'running');
  }

  getAllSessions(): ExecutionSession[] {
    return Array.from(this.sessions.values());
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      const age = now - session.createdAt.getTime();
      
      if (age > this.SESSION_TIMEOUT || session.status === 'completed') {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} expired sessions`);
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up all sessions...');
    this.sessions.clear();
    logger.info('✅ All sessions cleaned up');
  }
}
