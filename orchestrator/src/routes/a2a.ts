import { Router, Request, Response } from 'express';
import a2aService from '../services/a2aService';
import teamService from '../services/teamService';
import logger from '../utils/logger';

const router = Router();

const getUserId = (req: Request): string => req.headers['x-user-id'] as string;
const isAdmin = (req: Request): boolean => ((req.headers['x-user-role'] as string) || 'user') === 'admin';

/* --------------------- Remote peer registry --------------------- */

// List registered A2A peers
router.get('/agents', async (_req, res) => {
  try {
    const agents = await a2aService.listAgents();
    res.json({ success: true, data: { agents } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'A2A_LIST_FAILED', message: error.message } });
  }
});

// Register a remote A2A peer
router.post('/agents', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    const { name, endpoint, description } = req.body;
    if (!name || !endpoint) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_AGENT', message: 'name and endpoint are required' }
      });
    }
    const agent = await a2aService.registerAgent({ name, endpoint, description, createdBy: userId });
    res.status(201).json({ success: true, data: { agent } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'A2A_REGISTER_FAILED', message: error.message } });
  }
});

// Probe a peer: fetch /.well-known/agent.json and cache the card
router.post('/agents/:id/probe', async (req, res) => {
  try {
    const probe = await a2aService.probe(req.params.id);
    res.json({ success: true, data: probe });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'A2A_PROBE_FAILED', message: error.message } });
  }
});

// Enable / disable a peer
router.post('/agents/:id/toggle', async (req, res) => {
  try {
    const agent = await a2aService.toggleAgent(req.params.id, Boolean(req.body?.enabled));
    if (!agent) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'A2A agent not found' } });
    }
    res.json({ success: true, data: { agent } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'A2A_TOGGLE_FAILED', message: error.message } });
  }
});

// Delete a peer
router.delete('/agents/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    const deleted = await a2aService.deleteAgent(req.params.id, userId, isAdmin(req));
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'A2A agent not found' } });
    }
    res.json({ success: true, data: { message: 'A2A agent removed' } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'A2A_DELETE_FAILED', message: error.message } });
  }
});

/* --------------------- Messaging --------------------- */

// Send a message to a remote peer (JSON-RPC message/send)
router.post('/message', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    const { agentId, text, contextId, taskId } = req.body;
    if (!agentId) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'agentId is required' } });
    }
    const result = await a2aService.sendMessage(agentId, text, { contextId, taskId });
    res.json({ success: true, data: { result } });
  } catch (error: any) {
    logger.error('A2A send failed:', error.message);
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'A2A_SEND_FAILED', message: error.message } });
  }
});

// List local teams (targets for inbound delegation from the console)
router.get('/teams', async (_req, res) => {
  try {
    const teams = await teamService.listTeams();
    res.json({ success: true, data: { teams } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'A2A_TEAMS_FAILED', message: error.message } });
  }
});

// Inbound: accept an A2A message and delegate into a local team run
router.post('/inbox', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    const { teamId, text, useMemory, useWebSearch } = req.body;
    if (!teamId) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'teamId is required' } });
    }
    const result = await a2aService.acceptInboundMessage({ teamId, text, userId, useMemory, useWebSearch });
    res.json({ success: true, data: { result } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'A2A_INBOX_FAILED', message: error.message } });
  }
});

export default router;
