import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { McpServer } from '../models';
import logger from '../utils/logger';
import eventBus from './eventBus';

/**
 * McpService — Model Context Protocol client (drSai MCP support).
 *
 * Supports both transports:
 *  - stdio: spawns the MCP server process and speaks JSON-RPC 2.0
 *    over newline-delimited stdin/stdout (LSP-style framing).
 *  - http:  POSTs JSON-RPC 2.0 to the server URL.
 *
 * Lifecycle per operation: initialize → tools/list | tools/call → shutdown.
 * Long-lived connections are intentionally avoided so the service stays
 * stateless and horizontally scalable; tool listings are cached in DB.
 */

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, any>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

const REQUEST_TIMEOUT = parseInt(process.env.MCP_REQUEST_TIMEOUT || '30000');

export class McpService {
  /* ---------------------------------------------------------- */
  /* Server registry                                            */
  /* ---------------------------------------------------------- */

  async registerServer(data: {
    name: string;
    transport: 'stdio' | 'http';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    createdBy: string;
  }): Promise<McpServer> {
    if (data.transport === 'stdio' && !data.command) {
      throw Object.assign(new Error('stdio transport requires a command'), { statusCode: 400 });
    }
    if (data.transport === 'http' && !data.url) {
      throw Object.assign(new Error('http transport requires a url'), { statusCode: 400 });
    }
    return McpServer.create(data as any);
  }

  async listServers(): Promise<McpServer[]> {
    return McpServer.findAll({ order: [['createdAt', 'DESC']] });
  }

  async getServer(serverId: string): Promise<McpServer | null> {
    return McpServer.findByPk(serverId);
  }

  async deleteServer(serverId: string, userId: string, isAdmin: boolean): Promise<boolean> {
    const server = await McpServer.findByPk(serverId);
    if (!server) return false;
    if (server.createdBy !== userId && !isAdmin) {
      throw Object.assign(new Error('Access denied'), { statusCode: 403 });
    }
    await server.destroy();
    return true;
  }

  async toggleServer(serverId: string, enabled: boolean): Promise<McpServer | null> {
    const server = await McpServer.findByPk(serverId);
    if (!server) return null;
    await server.update({ isEnabled: enabled } as any);
    return server;
  }

  /* ---------------------------------------------------------- */
  /* Protocol operations                                        */
  /* ---------------------------------------------------------- */

  async listTools(serverId: string, useCache = true): Promise<Array<Record<string, any>>> {
    const server = await this.getServerOrThrow(serverId);
    if (!server.isEnabled) {
      throw Object.assign(new Error('MCP server is disabled'), { statusCode: 409 });
    }
    if (useCache && server.toolCache && Array.isArray(server.toolCache) && server.toolCache.length > 0) {
      return server.toolCache;
    }

    const tools = await this.withSession(server, async (send) => {
      const result = await send('tools/list', {});
      return result?.tools || [];
    });

    await server.update({ toolCache: tools } as any);
    return tools;
  }

  async callTool(serverId: string, toolName: string, args: Record<string, any>): Promise<any> {
    const server = await this.getServerOrThrow(serverId);
    if (!server.isEnabled) {
      throw Object.assign(new Error('MCP server is disabled'), { statusCode: 409 });
    }

    const result = await this.withSession(server, async (send) => {
      return send('tools/call', { name: toolName, arguments: args || {} });
    });

    await eventBus.publish('mcp.tool_called', {
      serverId, serverName: server.name, tool: toolName, ok: !result?.isError
    }, server.createdBy);

    return result;
  }

  /**
   * Health probe used by the "test connection" endpoint.
   */
  async probe(serverId: string): Promise<{ ok: boolean; toolCount: number; error?: string }> {
    try {
      const tools = await this.listTools(serverId, false);
      return { ok: true, toolCount: tools.length };
    } catch (error: any) {
      return { ok: false, toolCount: 0, error: error.message };
    }
  }

  /* ---------------------------------------------------------- */
  /* Transport plumbing                                         */
  /* ---------------------------------------------------------- */

  private async getServerOrThrow(serverId: string): Promise<McpServer> {
    const server = await McpServer.findByPk(serverId);
    if (!server) throw Object.assign(new Error('MCP server not found'), { statusCode: 404 });
    return server;
  }

  /**
   * Runs an operation inside a fresh MCP session.
   */
  private async withSession<T>(
    server: McpServer,
    operation: (send: (method: string, params: Record<string, any>) => Promise<any>) => Promise<T>
  ): Promise<T> {
    if (server.transport === 'stdio') {
      return this.withStdioSession(server, operation);
    }
    return this.withHttpSession(server, operation);
  }

  private async withStdioSession<T>(
    server: McpServer,
    operation: (send: (method: string, params: Record<string, any>) => Promise<any>) => Promise<T>
  ): Promise<T> {
    const child: ChildProcessWithoutNullStreams = spawn(server.command!, server.args || [], {
      env: { ...process.env, ...(server.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let buffer = '';
    const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
    let nextId = 1;

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id)!;
            pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message || 'MCP error'));
            else resolve(msg.result);
          }
        } catch {
          // Non-JSON line (server logs) — ignore
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      logger.debug(`MCP[${server.name}] stderr: ${chunk.toString().trim().slice(0, 300)}`);
    });

    const send = (method: string, params: Record<string, any>): Promise<any> => {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`MCP request ${method} timed out after ${REQUEST_TIMEOUT}ms`));
        }, REQUEST_TIMEOUT);

        pending.set(id, {
          resolve: (v) => { clearTimeout(timer); resolve(v); },
          reject: (e) => { clearTimeout(timer); reject(e); }
        });

        child.stdin.write(JSON.stringify(request) + '\n');
      });
    };

    try {
      // MCP handshake
      await send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'drs-ai-orchestrator', version: '1.0.0' }
      });
      await send('notifications/initialized', {}).catch(() => {});

      const result = await operation(send);
      return result;
    } finally {
      try { child.kill('SIGTERM'); } catch { /* already dead */ }
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* noop */ } }, 2000);
    }
  }

  private async withHttpSession<T>(
    server: McpServer,
    operation: (send: (method: string, params: Record<string, any>) => Promise<any>) => Promise<T>
  ): Promise<T> {
    let nextId = 1;

    const send = async (method: string, params: Record<string, any>): Promise<any> => {
      const request: JsonRpcRequest = { jsonrpc: '2.0', id: nextId++, method, params };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      try {
        const response = await fetch(server.url!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(server.headers || {}) },
          body: JSON.stringify(request),
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(`MCP HTTP ${response.status} for ${method}`);
        }
        const body = await response.json() as JsonRpcResponse;
        if (body.error) throw new Error(body.error.message || 'MCP error');
        return body.result;
      } finally {
        clearTimeout(timer);
      }
    };

    await send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'drs-ai-orchestrator', version: '1.0.0' }
    });

    return operation(send);
  }
}

export default new McpService();
