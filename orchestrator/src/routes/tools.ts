import { Router } from 'express';
import { toolRegistry } from '../tools/registry';
import { runWithTools } from '../tools/agentLoop';
import logger from '../utils/logger';

const router = Router();

// List all tools (builtin + custom)
router.get('/', async (_req, res) => {
  try {
    const tools = await toolRegistry.listTools();
    res.json({ success: true, data: { tools } });
  } catch (error: any) {
    logger.error('Failed to list tools:', error);
    res.status(500).json({ success: false, error: { code: 'TOOLS_FETCH_FAILED', message: error.message } });
  }
});

// Register a custom webhook-backed tool
router.post('/', async (req, res) => {
  try {
    const { name, description, parameters, webhookUrl } = req.body;
    if (!name || !description || !webhookUrl) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'name, description and webhookUrl are required' }
      });
    }
    const tool = await toolRegistry.registerCustomTool({ name, description, parameters: parameters || { type: 'object', properties: {} }, webhookUrl });
    res.status(201).json({ success: true, data: { tool } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: { code: 'REGISTER_FAILED', message: error.message } });
  }
});

// Direct tool execution
router.post('/execute', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { name, args = {} } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_NAME', message: 'Tool name is required' } });
    }
    const result = await toolRegistry.execute(name, args, userId);
    res.json({ success: result.ok, data: { result } });
  } catch (error: any) {
    logger.error('Tool execution failed:', error);
    res.status(500).json({ success: false, error: { code: 'EXECUTION_FAILED', message: error.message } });
  }
});

// Run a one-shot agentic request with the tool loop (OpenDrSai-style agent turn)
router.post('/run', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { model = 'llama3.2', messages, tools, systemPrompt, maxToolRounds, temperature } = req.body;
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'messages array is required' } });
    }
    const result = await runWithTools({
      model,
      messages,
      tools,
      systemPrompt,
      maxToolRounds,
      temperature,
      userId
    });
    res.json({ success: true, data: { result } });
  } catch (error: any) {
    logger.error('Tool loop run failed:', error);
    res.status(500).json({ success: false, error: { code: 'RUN_FAILED', message: error.message } });
  }
});

// Unregister custom tool
router.delete('/:name', async (req, res) => {
  try {
    const deleted = await toolRegistry.unregisterTool(req.params.name);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tool not found or is built-in' } });
    }
    res.json({ success: true, data: { message: 'Tool removed' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'DELETE_FAILED', message: error.message } });
  }
});

export default router;
