import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import workflowEngine from '../engine/WorkflowEngine';
import redis from '../utils/redis';
import logger from '../utils/logger';
import { Workflow, WorkflowTemplate } from '../types';

const router = Router();
const WORKFLOW_PREFIX = 'workflow:';

// Validation middleware
const handleValidationErrors = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors.array() }
    });
  }
  next();
};

// Create workflow
router.post('/', [
  body('name').notEmpty().trim(),
  body('trigger').isObject(),
  body('actions').isArray({ min: 1 })
], handleValidationErrors, async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const workflow: Workflow = {
      id: uuidv4(),
      name: req.body.name,
      description: req.body.description,
      userId,
      trigger: req.body.trigger,
      conditions: req.body.conditions || [],
      actions: req.body.actions,
      enabled: req.body.enabled ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
      runCount: 0
    };

    await redis.setex(
      `${WORKFLOW_PREFIX}${workflow.id}`,
      86400 * 30,
      JSON.stringify(workflow)
    );

    // Schedule if enabled
    if (workflow.enabled) {
      workflowEngine.scheduleWorkflow(workflow);
    }

    logger.info(`Workflow created: ${workflow.name} (${workflow.id})`);
    res.status(201).json({ success: true, data: { workflow } });
  } catch (error: any) {
    logger.error('Failed to create workflow:', error);
    res.status(500).json({ success: false, error: { code: 'CREATE_FAILED', message: error.message } });
  }
});

// Get all workflows
router.get('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const keys = await redis.keys(`${WORKFLOW_PREFIX}*`);
    const workflows: Workflow[] = [];

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const workflow: Workflow = JSON.parse(data);
        if (workflow.userId === userId) {
          workflows.push(workflow);
        }
      }
    }

    res.json({ success: true, data: { workflows } });
  } catch (error: any) {
    logger.error('Failed to get workflows:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Get workflow by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const data = await redis.get(`${WORKFLOW_PREFIX}${req.params.id}`);

    if (!data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workflow not found' } });
    }

    const workflow: Workflow = JSON.parse(data);

    if (workflow.userId !== userId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    res.json({ success: true, data: { workflow } });
  } catch (error: any) {
    logger.error('Failed to get workflow:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Update workflow
router.patch('/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const data = await redis.get(`${WORKFLOW_PREFIX}${req.params.id}`);

    if (!data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workflow not found' } });
    }

    const workflow: Workflow = JSON.parse(data);

    if (workflow.userId !== userId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    // Unschedule old workflow
    workflowEngine.unscheduleWorkflow(workflow.id);

    // Update workflow
    const updatedWorkflow: Workflow = {
      ...workflow,
      ...req.body,
      id: workflow.id,
      userId: workflow.userId,
      updatedAt: new Date()
    };

    await redis.setex(
      `${WORKFLOW_PREFIX}${updatedWorkflow.id}`,
      86400 * 30,
      JSON.stringify(updatedWorkflow)
    );

    // Reschedule if enabled
    if (updatedWorkflow.enabled) {
      workflowEngine.scheduleWorkflow(updatedWorkflow);
    }

    logger.info(`Workflow updated: ${updatedWorkflow.name} (${updatedWorkflow.id})`);
    res.json({ success: true, data: { workflow: updatedWorkflow } });
  } catch (error: any) {
    logger.error('Failed to update workflow:', error);
    res.status(500).json({ success: false, error: { code: 'UPDATE_FAILED', message: error.message } });
  }
});

// Delete workflow
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const data = await redis.get(`${WORKFLOW_PREFIX}${req.params.id}`);

    if (!data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workflow not found' } });
    }

    const workflow: Workflow = JSON.parse(data);

    if (workflow.userId !== userId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    workflowEngine.unscheduleWorkflow(workflow.id);
    await redis.del(`${WORKFLOW_PREFIX}${req.params.id}`);

    logger.info(`Workflow deleted: ${workflow.name} (${workflow.id})`);
    res.json({ success: true, data: { message: 'Workflow deleted' } });
  } catch (error: any) {
    logger.error('Failed to delete workflow:', error);
    res.status(500).json({ success: false, error: { code: 'DELETE_FAILED', message: error.message } });
  }
});

// Trigger workflow manually
router.post('/:id/trigger', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const data = await redis.get(`${WORKFLOW_PREFIX}${req.params.id}`);

    if (!data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workflow not found' } });
    }

    const workflow: Workflow = JSON.parse(data);

    if (workflow.userId !== userId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const executionId = await workflowEngine.triggerWorkflow(workflow, req.body);

    res.json({ success: true, data: { executionId } });
  } catch (error: any) {
    logger.error('Failed to trigger workflow:', error);
    res.status(500).json({ success: false, error: { code: 'TRIGGER_FAILED', message: error.message } });
  }
});

// Get execution status
router.get('/executions/:id', async (req, res) => {
  try {
    const execution = await workflowEngine.getExecution(req.params.id);

    if (!execution) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Execution not found' } });
    }

    res.json({ success: true, data: { execution } });
  } catch (error: any) {
    logger.error('Failed to get execution:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Get templates
router.get('/templates/list', async (req, res) => {
  const templates: WorkflowTemplate[] = [
    {
      id: 'daily-report',
      name: 'Daily Report',
      description: 'Generate and send daily reports',
      category: 'productivity',
      icon: '📊',
      workflow: {
        trigger: { type: 'schedule', config: { cron: '0 9 * * *' } },
        actions: [
          { id: '1', type: 'agent', name: 'Generate Report', config: { agentId: 'reasoning', input: 'Generate daily report' } },
          { id: '2', type: 'notification', name: 'Send Report', config: { message: 'Daily report generated', channels: ['email'] } }
        ]
      }
    },
    {
      id: 'file-processor',
      name: 'File Processor',
      description: 'Process uploaded files automatically',
      category: 'automation',
      icon: '📁',
      workflow: {
        trigger: { type: 'event', config: { eventType: 'file.uploaded' } },
        actions: [
          { id: '1', type: 'agent', name: 'Analyze File', config: { agentId: 'file', input: 'Analyze the uploaded file' } },
          { id: '2', type: 'webhook', name: 'Notify', config: { webhookUrl: 'http://gateway:3000/api/v1/notifications' } }
        ]
      }
    },
    {
      id: 'security-monitor',
      name: 'Security Monitor',
      description: 'Monitor logs for security threats',
      category: 'security',
      icon: '🔒',
      workflow: {
        trigger: { type: 'schedule', config: { cron: '*/5 * * * *' } },
        actions: [
          { id: '1', type: 'agent', name: 'Analyze Logs', config: { agentId: 'cybersecurity', input: 'Analyze system logs for threats' } }
        ]
      }
    }
  ];

  res.json({ success: true, data: { templates } });
});

export default router;
