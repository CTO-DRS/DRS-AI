import { query } from '../utils/db';
import redis from '../utils/redis';
import axios from 'axios';
import logger from '../utils/logger';

export class MetricsService {
  async getSystemStats(): Promise<any> {
    try {
      // Get user counts
      const userResult = await query('SELECT COUNT(*) as total, COUNT(CASE WHEN last_login_at > NOW() - INTERVAL \'24 hours\' THEN 1 END) as active_today FROM users');
      
      // Get conversation counts
      const convResult = await query('SELECT COUNT(*) as total FROM conversations');
      
      // Get message counts
      const msgResult = await query('SELECT COUNT(*) as total FROM messages');
      
      // Get memory counts
      const memoryResult = await query('SELECT COUNT(*) as total FROM memories');

      return {
        users: {
          total: parseInt(userResult.rows[0].total),
          activeToday: parseInt(userResult.rows[0].active_today)
        },
        conversations: parseInt(convResult.rows[0].total),
        messages: parseInt(msgResult.rows[0].total),
        memories: parseInt(memoryResult.rows[0].total)
      };
    } catch (error) {
      logger.error('Failed to get system stats:', error);
      throw error;
    }
  }

  async getServiceHealth(): Promise<any> {
    const services = {
      gateway: process.env.GATEWAY_URL || 'http://gateway:3000',
      auth: process.env.AUTH_URL || 'http://auth:3001',
      router: process.env.ROUTER_URL || 'http://router:3002',
      orchestrator: process.env.ORCHESTRATOR_URL || 'http://orchestrator:3003',
      memory: process.env.MEMORY_URL || 'http://memory:3004',
      files: process.env.FILES_URL || 'http://files:3005',
      voice: process.env.VOICE_URL || 'http://voice:3006'
    };

    const health: Record<string, { status: string; latency?: number }> = {};

    for (const [name, url] of Object.entries(services)) {
      try {
        const start = Date.now();
        await axios.get(`${url}/health`, { timeout: 5000 });
        health[name] = { status: 'healthy', latency: Date.now() - start };
      } catch (error) {
        health[name] = { status: 'unhealthy' };
      }
    }

    return health;
  }

  async getRecentActivity(limit: number = 20): Promise<any[]> {
    try {
      const result = await query(
        `SELECT action, resource, user_id, created_at 
         FROM audit_logs 
         ORDER BY created_at DESC 
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    } catch (error) {
      logger.error('Failed to get recent activity:', error);
      return [];
    }
  }

  async getModelUsage(): Promise<any> {
    // Placeholder - would track model usage from Redis or database
    return {
      totalRequests: 0,
      models: []
    };
  }
}

export default new MetricsService();
