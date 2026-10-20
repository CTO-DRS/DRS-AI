import { spawn, ChildProcess } from 'child_process';
import logger from '../utils/logger';

/**
 * Native MCP (Model Context Protocol) client — JSON-RPC 2.0.
 * Ported from OpenDrSai's MCP toolchain (autogen_ext.tools.mcp equivalents):
 *   - stdio transport  : spawns an MCP server process and speaks JSON-RPC over stdin/stdout
 *   - http transport   : Streamable HTTP (POST JSON-RPC to a single endpoint)
 * Implements: initialize, tools/list, tools/call, notifications/initialized, ping.
 *
 * No external MCP SDK dependency — protocol implemented directly per the MCP spec.
 */

export type McpTransport = 'stdio' | 'http';

export interface McpServerConfig {
  name: string;
  transport: McpTransport;
  /** stdio */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** http (streamable) */
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
  server: string;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

const PROTOCOL_VERSION = '2024-11-05';
const REQUEST_TIMEOUT_MS = parseInt(process.env.MCP_REQUEST_TIMEOUT_MS || '120000', 10);

export class McpConnection {
  public config: McpServerConfig;
  public status: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  public lastError?: string;
  public tools: McpTool[] = [];
  public serverInfo?: Record<string, any>;

  private proc?: ChildProcess;
  private pending: Map<string, PendingRequest> = new Map();
  private buffer = '';
  private nextId = 1;

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  // ------------------------------------------------------------------
  // JSON-RPC plumbing
  // ------------------------------------------------------------------
  private sendRequest(method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const message = { jsonrpc: '2.0', id, method, params: params ?? {} };

      const timer = setTimeout(() => {
        this.pending.delete(String(id));
        reject(new Error(`MCP request ${method} timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(String(id), { resolve, reject, timer });

      const payload = JSON.stringify(message);
      if (this.config.transport === 'stdio') {
        if (!this.proc?.stdin) return reject(new Error('stdio server not running'));
        logger.debug(`[mcp:${this.config.name}] -> ${payload.slice(0, 200)}`);
        this.proc.stdin.write(payload + '\n');
      } else {
        this.httpPost(message)
          .then(resolve)
          .catch((e) => {
            clearTimeout(timer);
            this.pending.delete(String(id));
            reject(e);
          });
      }
    });
  }

  private async httpPost(message: any, isNotification = false): Promise<any> {
    if (!this.config.url) throw new Error('http transport requires url');
    const res = await fetch(this.config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(this.config.headers || {})
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (isNotification) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`MCP HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      // SSE response — read until we get the response with matching id
      const text = await res.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.slice(5).trim());
            if (data.id !== undefined) return data;
          } catch { /* skip */ }
        }
      }
      throw new Error('No JSON-RPC response found in SSE stream');
    }

    const json: any = await res.json().catch(() => null);
    if (!json) throw new Error('Invalid JSON response from MCP server');
    if (json.error) throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
    return json;
  }

  private handleStdoutData(chunk: Buffer): void {
    this.buffer += chunk.toString();
    // MCP stdio framing: newline-delimited JSON (also tolerate LSP-style headers)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('Content-')) continue;
      try {
        const msg = JSON.parse(trimmed);
        this.handleMessage(msg);
      } catch {
        logger.debug(`[mcp:${this.config.name}] non-JSON stdout line: ${trimmed.slice(0, 100)}`);
      }
    }
  }

  private handleMessage(msg: any): void {
    if (msg.id !== undefined && this.pending.has(String(msg.id))) {
      const p = this.pending.get(String(msg.id))!;
      clearTimeout(p.timer);
      this.pending.delete(String(msg.id));
      if (msg.error) {
        p.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
      } else {
        p.resolve(msg);
      }
      return;
    }
    if (msg.method === 'notifications/message' || msg.method?.startsWith('notifications/')) {
      logger.debug(`[mcp:${this.config.name}] notification: ${msg.method}`);
    }
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------
  async connect(): Promise<void> {
    if (this.status === 'connected') return;
    this.status = 'connecting';
    try {
      if (this.config.transport === 'stdio') {
        if (!this.config.command) throw new Error('stdio transport requires command');
        this.proc = spawn(this.config.command, this.config.args || [], {
          env: { ...process.env, ...(this.config.env || {}) },
          cwd: this.config.cwd || undefined,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        this.proc.stdout!.on('data', (c) => this.handleStdoutData(c));
        this.proc.stderr!.on('data', (c) => {
          logger.debug(`[mcp:${this.config.name}] stderr: ${c.toString().slice(0, 200)}`);
        });
        this.proc.on('exit', (code) => {
          logger.warn(`[mcp:${this.config.name}] process exited with code ${code}`);
          this.status = 'disconnected';
          this.rejectAllPending('MCP server process exited');
        });
        this.proc.on('error', (err) => {
          this.lastError = err.message;
          this.status = 'error';
          this.rejectAllPending(err.message);
        });
      }

      // MCP handshake
      const initResponse = await this.sendRequest('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        clientInfo: { name: 'drs-ai-mcp-hub', version: '1.0.0' }
      });
      this.serverInfo = initResponse?.result?.serverInfo;

      // initialized notification (no response expected)
      const notif = { jsonrpc: '2.0', method: 'notifications/initialized' };
      if (this.config.transport === 'stdio') {
        this.proc?.stdin?.write(JSON.stringify(notif) + '\n');
      } else {
        await this.httpPost(notif, true).catch(() => null);
      }

      this.status = 'connected';
      this.lastError = undefined;
      await this.refreshTools();
      logger.info(`[mcp:${this.config.name}] connected (${this.tools.length} tools)`);
    } catch (e: any) {
      this.status = 'error';
      this.lastError = e.message;
      logger.error(`[mcp:${this.config.name}] connect failed: ${e.message}`);
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    this.rejectAllPending('connection closed');
    if (this.proc) {
      try { this.proc.kill(); } catch { /* already dead */ }
      this.proc = undefined;
    }
    this.status = 'disconnected';
  }

  private rejectAllPending(reason: string): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }

  // ------------------------------------------------------------------
  // MCP operations
  // ------------------------------------------------------------------
  async refreshTools(): Promise<McpTool[]> {
    const response = await this.sendRequest('tools/list', {});
    const tools = response?.result?.tools || [];
    this.tools = tools.map((t: any) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      server: this.config.name
    }));
    return this.tools;
  }

  async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    if (this.status !== 'connected') {
      await this.connect();
    }
    const response = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args || {}
    });
    const result = response?.result;
    // Normalize MCP content blocks to a plain value
    if (result?.content) {
      const textBlocks = result.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text);
      if (textBlocks.length === 1) return { text: textBlocks[0], isError: result.isError || false };
      if (textBlocks.length > 1) return { text: textBlocks.join('\n'), isError: result.isError || false };
      return { content: result.content, isError: result.isError || false };
    }
    return result;
  }

  async ping(): Promise<boolean> {
    try {
      await this.sendRequest('ping', {});
      return true;
    } catch {
      return false;
    }
  }
}
