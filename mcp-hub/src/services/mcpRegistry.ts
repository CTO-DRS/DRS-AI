import Redis from 'ioredis';
import logger from '../utils/logger';
import { McpConnection, McpServerConfig, McpTool } from './mcpClient';

/**
 * Registry of MCP servers persisted in Redis, with pooled McpConnection instances.
 */

const REDIS_KEY = 'drs:mcp:servers';

export class McpRegistry {
  private redis: Redis;
  private connections: Map<string, McpConnection> = new Map();

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });
    this.redis.on('error', (err) => logger.error('MCP registry Redis error:', err.message));
  }

  async listConfigs(): Promise<McpServerConfig[]> {
    try {
      await this.redis.connect().catch(() => { /* already connected */ });
      const raw = await this.redis.get(REDIS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e: any) {
      logger.warn(`Failed to list MCP configs: ${e.message}`);
      return [];
    }
  }

  async saveConfigs(configs: McpServerConfig[]): Promise<void> {
    await this.redis.connect().catch(() => { /* already connected */ });
    await this.redis.set(REDIS_KEY, JSON.stringify(configs));
  }

  async addServer(config: Omit<McpServerConfig, 'enabled'>): Promise<McpServerConfig> {
    const configs = await this.listConfigs();
    if (configs.some(c => c.name === config.name)) {
      throw new Error(`MCP server "${config.name}" already exists`);
    }
    if (config.transport === 'stdio' && !config.command) {
      throw new Error('stdio transport requires "command"');
    }
    if (config.transport === 'http' && !config.url) {
      throw new Error('http transport requires "url"');
    }
    const full: McpServerConfig = { ...config, enabled: true };
    configs.push(full);
    await this.saveConfigs(configs);
    return full;
  }

  async removeServer(name: string): Promise<boolean> {
    const configs = await this.listConfigs();
    const next = configs.filter(c => c.name !== name);
    if (next.length === configs.length) return false;
    await this.saveConfigs(next);
    const conn = this.connections.get(name);
    if (conn) {
      await conn.disconnect();
      this.connections.delete(name);
    }
    return true;
  }

  getConnection(name: string): McpConnection | undefined {
    return this.connections.get(name);
  }

  async getOrConnect(name: string): Promise<McpConnection> {
    let conn = this.connections.get(name);
    if (!conn) {
      const configs = await this.listConfigs();
      const config = configs.find(c => c.name === name);
      if (!config) throw new Error(`MCP server "${name}" not registered`);
      conn = new McpConnection(config);
      this.connections.set(name, conn);
    }
    if (conn.status !== 'connected') {
      await conn.connect();
    }
    return conn;
  }

  async connectAll(): Promise<void> {
    const configs = await this.listConfigs();
    for (const config of configs) {
      if (!config.enabled) continue;
      try {
        await this.getOrConnect(config.name);
      } catch (e: any) {
        logger.warn(`MCP server ${config.name} failed to connect: ${e.message}`);
      }
    }
  }

  /** Aggregate tools across all connected servers */
  async listAllTools(): Promise<McpTool[]> {
    const configs = await this.listConfigs();
    const all: McpTool[] = [];
    for (const config of configs) {
      if (!config.enabled) continue;
      try {
        const conn = await this.getOrConnect(config.name);
        all.push(...conn.tools);
      } catch (e: any) {
        logger.warn(`listAllTools: skipping ${config.name}: ${e.message}`);
      }
    }
    return all;
  }

  async callTool(server: string, tool: string, args: Record<string, any>): Promise<any> {
    const conn = await this.getOrConnect(server);
    return conn.callTool(tool, args);
  }

  async status(): Promise<Array<McpServerConfig & { status: string; toolCount: number; lastError?: string; serverInfo?: any }>> {
    const configs = await this.listConfigs();
    return configs.map(c => {
      const conn = this.connections.get(c.name);
      return {
        ...c,
        status: conn?.status || 'disconnected',
        toolCount: conn?.tools.length || 0,
        lastError: conn?.lastError,
        serverInfo: conn?.serverInfo
      };
    });
  }
}

export const mcpRegistry = new McpRegistry();
