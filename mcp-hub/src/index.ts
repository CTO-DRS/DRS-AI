import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { mcpRegistry } from './services/mcpRegistry';
import logger from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3044;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'mcp-hub', timestamp: new Date().toISOString() });
});

// ============ Server registry management ============

// List MCP servers with live status
app.get('/servers', async (_req, res) => {
  try {
    const servers = await mcpRegistry.status();
    res.json({ success: true, data: { servers } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Register a new MCP server
app.post('/servers', async (req, res) => {
  try {
    const { name, transport, command, args, env, cwd, url, headers } = req.body;
    if (!name || !transport) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'name and transport (stdio|http) are required' }
      });
    }
    const server = await mcpRegistry.addServer({ name, transport, command, args, env, cwd, url, headers });
    res.status(201).json({ success: true, data: { server } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: { code: 'ADD_FAILED', message: error.message } });
  }
});

// Remove an MCP server
app.delete('/servers/:name', async (req, res) => {
  try {
    const deleted = await mcpRegistry.removeServer(req.params.name);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Server not found' } });
    }
    res.json({ success: true, data: { message: 'Server removed' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'DELETE_FAILED', message: error.message } });
  }
});

// Connect/reconnect a server now
app.post('/servers/:name/connect', async (req, res) => {
  try {
    const conn = await mcpRegistry.getOrConnect(req.params.name);
    res.json({ success: true, data: { status: conn.status, tools: conn.tools.length, serverInfo: conn.serverInfo } });
  } catch (error: any) {
    res.status(502).json({ success: false, error: { code: 'CONNECT_FAILED', message: error.message } });
  }
});

// Single server status
app.get('/servers/:name/status', async (req, res) => {
  try {
    const servers = await mcpRegistry.status();
    const s = servers.find(x => x.name === req.params.name);
    if (!s) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Server not found' } });
    res.json({ success: true, data: { server: s } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// ============ Tools aggregation & invocation ============

// List tools from all connected MCP servers
app.get('/tools', async (_req, res) => {
  try {
    const tools = await mcpRegistry.listAllTools();
    res.json({ success: true, data: { tools } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Call a tool on a specific server
app.post('/tools/call', async (req, res) => {
  try {
    const { server, tool, args = {} } = req.body;
    if (!server || !tool) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'server and tool are required' }
      });
    }
    const result = await mcpRegistry.callTool(server, tool, args);
    res.json({ success: true, data: { result } });
  } catch (error: any) {
    logger.error(`MCP tool call failed: ${error.message}`);
    res.status(502).json({ success: false, error: { code: 'CALL_FAILED', message: error.message } });
  }
});

// ============ DRS AI as an MCP server (HTTP transport) ============
/**
 * Exposes the platform tool registry (orchestrator) as an MCP server.
 * Point any MCP client at: POST http://<host>:3044/mcp
 * Implements: initialize, tools/list, tools/call, ping (JSON-RPC 2.0).
 */
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3003';

async function fetchPlatformTools(): Promise<any[]> {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/tools`);
    const json: any = await res.json();
    const tools = json?.data?.tools || [];
    return tools.map((t: any) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters || { type: 'object', properties: {} }
    }));
  } catch (e: any) {
    logger.warn(`fetchPlatformTools failed: ${e.message}`);
    return [];
  }
}

app.post('/mcp', async (req, res) => {
  const { id, method, params } = req.body || {};
  try {
    switch (method) {
      case 'initialize':
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'drs-ai', version: '1.0.0' }
          }
        });
        break;
      case 'notifications/initialized':
        res.status(204).end();
        break;
      case 'ping':
        res.json({ jsonrpc: '2.0', id, result: {} });
        break;
      case 'tools/list': {
        const tools = await fetchPlatformTools();
        res.json({ jsonrpc: '2.0', id, result: { tools } });
        break;
      }
      case 'tools/call': {
        const name = params?.name;
        const args = params?.arguments || {};
        if (!name) {
          return res.json({
            jsonrpc: '2.0', id,
            error: { code: -32602, message: 'params.name is required' }
          });
        }
        const execRes = await fetch(`${ORCHESTRATOR_URL}/tools/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, args })
        });
        const execJson: any = await execRes.json();
        const result = execJson?.data?.result;
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result?.result ?? { error: result?.error }, null, 2) }],
            isError: !result?.ok
          }
        });
        break;
      }
      default:
        res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        });
    }
  } catch (error: any) {
    res.json({ jsonrpc: '2.0', id, error: { code: -32603, message: error.message } });
  }
});

// Error handling
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
});

app.listen(PORT, () => {
  logger.info('=================================');
  logger.info('DRS AI MCP Hub');
  logger.info(`Port: ${PORT}`);
  logger.info('=================================');
  // Connect to configured MCP servers in the background
  mcpRegistry.connectAll().catch((e) => logger.warn(`connectAll: ${e.message}`));
});

export default app;
