import { Router, Request, Response } from 'express';
import approvalService from '../services/approvalService';
import taskService from '../services/taskService';
import plannerService from '../services/plannerService';
import logger from '../utils/logger';

const router = Router();

const getUserId = (req: Request): string => req.headers['x-user-id'] as string;
const isAdmin = (req: Request): boolean => ((req.headers['x-user-role'] as string) || 'user') === 'admin';

/* List approvals (mine; ?status=pending) */
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    const approvals = await approvalService.list(userId, req.query.status as string | undefined);
    res.json({ success: true, data: { approvals } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'APPROVALS_FETCH_FAILED', message: error.message } });
  }
});

/* Approve → releases the parked task / plan */
router.post('/:id/approve', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const approval = await approvalService.decide(req.params.id, userId, 'approved', isAdmin(req));

    // Release whatever was gated by this approval
    if (approval.taskId) {
      const task = await taskService.getTask(approval.taskId);
      if (task && task.status === 'awaiting_approval') {
        if (approval.type === 'plan_execution') {
          const plan = await plannerService.getPlanByTask(approval.taskId, task.userId);
          if (plan) {
            await plannerService.executePlan(plan, approval.taskId).catch((err) =>
              logger.error(`Plan execution after approval failed: ${err.message}`)
            );
          }
        } else {
          await taskService.updateTask(approval.taskId, { status: 'queued' });
          taskService.executeTask(approval.taskId).catch((err) =>
            logger.error(`Task execution after approval failed: ${err.message}`)
          );
        }
      }
    }

    res.json({ success: true, data: { approval } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'APPROVAL_FAILED', message: error.message } });
  }
});

/* Reject */
router.post('/:id/reject', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const approval = await approvalService.decide(req.params.id, userId, 'rejected', isAdmin(req));

    if (approval.taskId) {
      const task = await taskService.getTask(approval.taskId);
      if (task && task.status === 'awaiting_approval') {
        await taskService.updateTask(approval.taskId, {
          status: 'cancelled',
          error: 'Rejected by user approval',
          completedAt: new Date()
        });
      }
    }

    res.json({ success: true, data: { approval } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'APPROVAL_FAILED', message: error.message } });
  }
});

/* Get one approval */
router.get('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    const approval = await approvalService.get(req.params.id, userId, isAdmin(req));
    if (!approval) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Approval not found' } });
    }
    res.json({ success: true, data: { approval } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'APPROVAL_FETCH_FAILED', message: error.message } });
  }
});

export default router;
