import { Router } from 'express';
import autoAgentManager from '../agents/AutoAgentManager';
import logger from '../utils/logger';

const router = Router();

// Create auto agent
router.post('/', async (req, res) => {
  try {
    const agent = await autoAgentManager.createAgent(req.body);
    res.status(201).json({ success: true, data: { agent } });
  } catch (error: any) {
    logger.error('Failed to create auto agent:', error);
    res.status(500).json({ success: false, error: { code: 'CREATE_FAILED', message: error.message } });
  }
});

// Get all auto agents
router.get('/', async (req, res) => {
  try {
    const agents = await autoAgentManager.getAllAgents();
    res.json({ success: true, data: { agents } });
  } catch (error: any) {
    logger.error('Failed to get auto agents:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Get agent by ID
router.get('/:id', async (req, res) => {
  try {
    const agent = await autoAgentManager.getAgent(req.params.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
    }
    res.json({ success: true, data: { agent } });
  } catch (error: any) {
    logger.error('Failed to get agent:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Start agent
router.post('/:id/start', async (req, res) => {
  try {
    const agent = await autoAgentManager.getAgent(req.params.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
    }

    agent.enabled = true;
    await autoAgentManager.startAgent(agent);
    res.json({ success: true, data: { message: 'Agent started' } });
  } catch (error: any) {
    logger.error('Failed to start agent:', error);
    res.status(500).json({ success: false, error: { code: 'START_FAILED', message: error.message } });
  }
});

// Stop agent
router.post('/:id/stop', async (req, res) => {
  try {
    await autoAgentManager.stopAgent(req.params.id);
    res.json({ success: true, data: { message: 'Agent stopped' } });
  } catch (error: any) {
    logger.error('Failed to stop agent:', error);
    res.status(500).json({ success: false, error: { code: 'STOP_FAILED', message: error.message } });
  }
});

// Execute agent manually
router.post('/:id/execute', async (req, res) => {
  try {
    const agent = await autoAgentManager.getAgent(req.params.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
    }

    const execution = await autoAgentManager.executeAgent(agent, req.body);
    res.json({ success: true, data: { execution } });
  } catch (error: any) {
    logger.error('Failed to execute agent:', error);
    res.status(500).json({ success: false, error: { code: 'EXECUTE_FAILED', message: error.message } });
  }
});

// Get agent executions
router.get('/:id/executions', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const executions = await autoAgentManager.getExecutions(req.params.id, Number(limit));
    res.json({ success: true, data: { executions } });
  } catch (error: any) {
    logger.error('Failed to get executions:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Delete agent
router.delete('/:id', async (req, res) => {
  try {
    await autoAgentManager.deleteAgent(req.params.id);
    res.json({ success: true, data: { message: 'Agent deleted' } });
  } catch (error: any) {
    logger.error('Failed to delete agent:', error);
    res.status(500).json({ success: false, error: { code: 'DELETE_FAILED', message: error.message } });
  }
});

// Get agent templates
router.get('/templates/list', async (req, res) => {
  const templates = [
    {
      id: 'file-watcher',
      name: 'File Watcher',
      description: 'Monitor a directory for file changes',
      type: 'event-driven',
      config: {
        agentId: 'file',
        input: 'Analyze the changed file: {{path}}'
      },
      eventConfig: {
        eventType: 'file.watch',
        path: '/app/data/watch',
        recursive: true
      }
    },
    {
      id: 'log-monitor',
      name: 'Log Monitor',
      description: 'Monitor logs for specific patterns',
      type: 'event-driven',
      config: {
        agentId: 'cybersecurity',
        input: 'Analyze this log entry for security threats'
      },
      eventConfig: {
        eventType: 'log.monitor',
        logPath: '/app/logs/system.log',
        patterns: [
          { pattern: 'ERROR|FATAL', severity: 'error', action: 'alert' }
        ]
      }
    },
    {
      id: 'daily-report',
      name: 'Daily Report Generator',
      description: 'Generate daily reports automatically',
      type: 'scheduled',
      config: {
        agentId: 'reasoning',
        input: 'Generate a daily summary report'
      },
      schedule: {
        cron: '0 9 * * *',
        timezone: 'UTC'
      }
    },
    {
      id: 'system-monitor',
      name: 'System Monitor',
      description: 'Monitor system health continuously',
      type: 'continuous',
      config: {
        agentId: 'automation',
        input: 'Check system health and resources'
      }
    }
  ];

  res.json({ success: true, data: { templates } });
});

export default router;
