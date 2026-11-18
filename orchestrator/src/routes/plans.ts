import { Router, Request, Response } from 'express';
import plannerService from '../services/plannerService';
import approvalService from '../services/approvalService';
import logger from '../utils/logger';

const router = Router();

const getUserId = (req: Request): string => req.headers['x-user-id'] as string;

/* Get a plan */
router.get('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    const plan = await plannerService.getPlan(req.params.id, userId);
    if (!plan) {
      return res.status(404).json({ success: false, error: { code: 'PLAN_NOT_FOUND', message: 'Plan not found' } });
    }
    res.json({ success: true, data: { plan } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'PLAN_FETCH_FAILED', message: error.message } });
  }
});

/* Approve a draft plan → executes it (optionally behind a HITL approval) */
router.post('/:id/approve', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const plan = await plannerService.getPlan(req.params.id, userId);
    if (!plan) {
      return res.status(404).json({ success: false, error: { code: 'PLAN_NOT_FOUND', message: 'Plan not found' } });
    }
    if (plan.status !== 'draft' && plan.status !== 'approved') {
      return res.status(409).json({
        success: false,
        error: { code: 'INVALID_STATE', message: `Plan is ${plan.status} and cannot be approved` }
      });
    }

    await plan.update({ status: 'approved' } as any);

    // Optional human-in-the-loop gate before execution
    if (req.body?.requireApproval) {
      await approvalService.requestApproval({
        userId,
        type: 'plan_execution',
        taskId: plan.taskId,
        payload: {
          title: 'Plan execution requires approval',
          detail: plan.summary,
          meta: { planId: plan.id, steps: plan.steps.length }
        }
      });
      return res.status(202).json({
        success: true,
        data: { plan, status: 'awaiting_approval', message: 'Plan approved and parked pending human sign-off' }
      });
    }

    // Execute asynchronously
    plannerService.executePlan(plan, plan.taskId).catch((err: Error) =>
      logger.error(`Async plan execution failed for ${plan.id}:`, err)
    );

    res.json({ success: true, data: { plan, status: 'executing' } });
  } catch (error: any) {
    logger.error('Plan approval failed:', error);
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'PLAN_APPROVAL_FAILED', message: error.message } });
  }
});

export default router;
