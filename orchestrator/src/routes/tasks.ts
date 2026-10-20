import { Router } from 'express';
import taskService from '../services/taskService';
import logger from '../utils/logger';
import redis from '../utils/redis';

const router = Router();

// Create task
router.post('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    const { input, type = 'auto', priority = 'normal', context, agentId } = req.body;

    if (!input) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_INPUT',
          message: 'Input is required'
        }
      });
    }

    const task = await taskService.createTask(
      userId,
      input,
      type,
      priority,
      context
    );

    // Execute task asynchronously
    if (agentId) {
      task.agentId = agentId;
    }

    // Start execution without waiting
    taskService.executeTask(task.id).catch(error => {
      logger.error(`Async task execution failed for ${task.id}:`, error);
    });

    res.status(201).json({
      success: true,
      data: { task }
    });
  } catch (error: any) {
    logger.error('Failed to create task:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TASK_CREATION_FAILED',
        message: error.message
      }
    });
  }
});

// Get task by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { id } = req.params;

    const task = await taskService.getTask(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: `Task ${id} not found`
        }
      });
    }

    // Check ownership
    if (task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied'
        }
      });
    }

    res.json({
      success: true,
      data: { task }
    });
  } catch (error: any) {
    logger.error(`Failed to get task ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TASK_FETCH_FAILED',
        message: error.message
      }
    });
  }
});

// Get user's tasks
router.get('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    const { status } = req.query;
    const tasks = await taskService.getUserTasks(
      userId,
      status as any
    );

    res.json({
      success: true,
      data: { tasks }
    });
  } catch (error: any) {
    logger.error('Failed to list tasks:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TASKS_FETCH_FAILED',
        message: error.message
      }
    });
  }
});

// Request human approval for a task (HITL — ported from OpenDrSai approval flows)
router.post('/:id/request-approval', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const task = await taskService.getTask(id);
    if (!task) {
      return res.status(404).json({ success: false, error: { code: 'TASK_NOT_FOUND', message: `Task ${id} not found` } });
    }
    if (task.status !== 'pending' && task.status !== 'running') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: `Task status ${task.status} cannot request approval` } });
    }
    await taskService.updateTask(id, {
      status: 'awaiting_approval',
      context: { ...(task.context || {}), approvalReason: reason || 'Agent requested human approval' }
    } as any);
    logger.info(`Task ${id} is awaiting human approval: ${reason || 'no reason given'}`);
    res.json({ success: true, data: { message: 'Task is now awaiting approval' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'APPROVAL_REQUEST_FAILED', message: error.message } });
  }
});

// Approve a task awaiting human approval -> resumes execution
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const task = await taskService.getTask(id);
    if (!task) {
      return res.status(404).json({ success: false, error: { code: 'TASK_NOT_FOUND', message: `Task ${id} not found` } });
    }
    if (task.status !== 'awaiting_approval') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Task is not awaiting approval' } });
    }
    await taskService.updateTask(id, { status: 'pending' });
    // Re-enqueue and execute
    await redis.lpush('drs:tasks', id);
    taskService.executeTask(id).catch(err => logger.error(`Approved task ${id} execution failed:`, err));
    res.json({ success: true, data: { message: 'Task approved and resumed' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'APPROVE_FAILED', message: error.message } });
  }
});

// Reject a task awaiting human approval
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const task = await taskService.getTask(id);
    if (!task) {
      return res.status(404).json({ success: false, error: { code: 'TASK_NOT_FOUND', message: `Task ${id} not found` } });
    }
    if (task.status !== 'awaiting_approval') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Task is not awaiting approval' } });
    }
    await taskService.updateTask(id, {
      status: 'cancelled',
      error: `Rejected by human: ${reason || 'no reason given'}`,
      completedAt: new Date()
    });
    res.json({ success: true, data: { message: 'Task rejected and cancelled' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'REJECT_FAILED', message: error.message } });
  }
});

// Cancel task
router.post('/:id/cancel', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { id } = req.params;

    const task = await taskService.getTask(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: `Task ${id} not found`
        }
      });
    }

    if (task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied'
        }
      });
    }

    const cancelled = await taskService.cancelTask(id);

    if (!cancelled) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CANCEL_FAILED',
          message: 'Task cannot be cancelled'
        }
      });
    }

    res.json({
      success: true,
      data: { message: 'Task cancelled successfully' }
    });
  } catch (error: any) {
    logger.error(`Failed to cancel task ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CANCEL_FAILED',
        message: error.message
      }
    });
  }
});

// Delete task
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { id } = req.params;

    const task = await taskService.getTask(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: `Task ${id} not found`
        }
      });
    }

    if (task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied'
        }
      });
    }

    await taskService.deleteTask(id);

    res.json({
      success: true,
      data: { message: 'Task deleted successfully' }
    });
  } catch (error: any) {
    logger.error(`Failed to delete task ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_FAILED',
        message: error.message
      }
    });
  }
});

export default router;
