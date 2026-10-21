import { Router, Request, Response } from 'express';
import mcpService from '../services/mcpService';
import approvalService from '../services/approvalService';
import logger from '../utils/logger';

const router = Router();

const getUserId = (req: Request): string => req.headers['x-user-id'] as string;
const isAdmin = (req: Request): boolean => ((req.headers['x-user-role'] as string) || 'user') === 'admin';

/* --------------------- Server registry --------------------- */

// Register MCP server
router.post('/servers', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    const { name, transport, command, args, env, url, headers } = req.body;
    if (!name || !transport) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_SERVER', message: 'name and transport (stdio|http) are required' }
      });
    }
    const server = await mcpService.registerServer({ name, transport, command, args, env, url, headers, createdBy: userId });
    res.status(201).json({ success: true, data: { server } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'MCP_REGISTER_FAILED', message: error.message } });
  }
});

// List servers
router.get('/servers', async (req, res) => {
  try {
    const servers = await mcpService.listServers();
    res.json({ success: true, data: { servers } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'MCP_LIST_FAILED', message: error.message } });
  }
});

// Get one server
router.get('/servers/:id', async (req, res) => {
  try {
    const server = await mcpService.getServer(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'MCP server not found' } });
    }
    res.json({ success: true, data: { server } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'MCP_FETCH_FAILED', message: error.message } });
  }
});

// Test connection + refresh tool cache
router.post('/servers/:id/test', async (req, res) => {
  try {
    const probe = await mcpService.probe(req.params.id);
    res.json({ success: true, data: probe });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'MCP_PROBE_FAILED', message: error.message } });
  }
});

// Enable / disable
router.post('/servers/:id/toggle', async (req, res) => {
  try {
    const server = await mcpService.toggleServer(req.params.id, Boolean(req.body?.enabled));
    if (!server) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'MCP server not found' } });
    }
    res.json({ success: true, data: { server } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'MCP_TOGGLE_FAILED', message: error.message } });
  }
});

// Delete server
router.delete('/servers/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    const deleted = await mcpService.deleteServer(req.params.id, userId, isAdmin(req));
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'MCP server not found' } });
    }
    res.json({ success: true, data: { message: 'MCP server removed' } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'MCP_DELETE_FAILED', message: error.message } });
  }
});

/* ------------------------- Tools ------------------------- */

// List tools of a server
router.get('/servers/:id/tools', async (req, res) => {
  try {
    const tools = await mcpService.listTools(req.params.id, req.query.refresh !== 'true');
    res.json({ success: true, data: { tools } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'MCP_TOOLS_FAILED', message: error.message } });
  }
});

// Call a tool (optionally gated behind a human approval)
router.post('/servers/:id/tools/:tool/call', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const { args = {}, requireApproval = false } = req.body;
    const server = await mcpService.getServer(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'MCP server not found' } });
    }

    // Human-in-the-loop gate (drSai approval_guard pattern)
    if (requireApproval) {
      await approvalService.requestApproval({
        userId,
        type: 'mcp_tool_call',
        payload: {
          title: `MCP tool call: ${server.name} / ${req.params.tool}`,
          detail: JSON.stringify(args).slice(0, 2000),
          meta: { serverId: server.id, tool: req.params.tool, args }
        }
      });
      return res.status(202).json({
        success: true,
        data: { status: 'awaiting_approval', message: 'Tool call parked pending approval' }
      });
    }

    const result = await mcpService.callTool(req.params.id, req.params.tool, args);
    res.json({ success: true, data: { result } });
  } catch (error: any) {
    logger.error('MCP tool call failed:', error);
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'MCP_CALL_FAILED', message: error.message } });
  }
});

export default router;
