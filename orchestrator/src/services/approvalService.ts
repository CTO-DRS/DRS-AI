import { Approval, ApprovalPayload } from '../models';
import logger from '../utils/logger';
import eventBus from './eventBus';

/**
 * ApprovalService — human-in-the-loop gating (drSai approval_guard).
 *
 * Dangerous or sensitive operations (task execution requiring sign-off,
 * MCP tool calls, plan execution) create a pending Approval, publish an
 * `approval.requested` event (the Gateway WS hub relays it to the user's
 * browser in real time) and park the originating task in
 * `awaiting_approval` until a decision arrives.
 */

export class ApprovalService {
  async requestApproval(data: {
    userId: string;
    type: Approval['type'];
    payload: ApprovalPayload;
    taskId?: string;
    teamRunId?: string;
    requestedBy?: string;
    expiresInHours?: number;
  }): Promise<Approval> {
    const expiresAt = data.expiresInHours
      ? new Date(Date.now() + data.expiresInHours * 3600 * 1000)
      : new Date(Date.now() + 24 * 3600 * 1000); // default: expire after 24h

    const approval = await Approval.create({
      userId: data.userId,
      taskId: data.taskId,
      teamRunId: data.teamRunId,
      type: data.type,
      payload: data.payload,
      requestedBy: data.requestedBy || 'system',
      expiresAt
    } as any);

    await eventBus.publish('approval.requested', {
      approvalId: approval.id,
      type: approval.type,
      payload: approval.payload,
      taskId: approval.taskId,
      expiresAt: approval.expiresAt
    }, data.userId);

    logger.info(`Approval ${approval.id} requested (type=${approval.type}, user=${data.userId})`);
    return approval;
  }

  async decide(
    approvalId: string,
    userId: string,
    decision: 'approved' | 'rejected',
    isAdmin: boolean
  ): Promise<Approval> {
    const approval = await Approval.findByPk(approvalId);
    if (!approval) {
      throw Object.assign(new Error('Approval not found'), { statusCode: 404 });
    }
    if (approval.userId !== userId && !isAdmin) {
      throw Object.assign(new Error('Access denied'), { statusCode: 403 });
    }
    if (approval.status !== 'pending') {
      throw Object.assign(new Error(`Approval already ${approval.status}`), { statusCode: 409 });
    }
    if (approval.expiresAt && approval.expiresAt < new Date()) {
      await approval.update({ status: 'expired' } as any);
      throw Object.assign(new Error('Approval request expired'), { statusCode: 410 });
    }

    await approval.update({
      status: decision,
      decidedBy: userId,
      decidedAt: new Date()
    } as any);

    await eventBus.publish('approval.decided', {
      approvalId: approval.id,
      taskId: approval.taskId,
      decision,
      type: approval.type
    }, approval.userId);

    logger.info(`Approval ${approval.id} ${decision} by ${userId}`);
    return approval;
  }

  async list(userId: string, status?: string): Promise<Approval[]> {
    const where: Record<string, any> = { userId };
    if (status) where.status = status;
    return Approval.findAll({ where, order: [['createdAt', 'DESC']], limit: 100 });
  }

  async get(approvalId: string, userId: string, isAdmin: boolean): Promise<Approval | null> {
    const approval = await Approval.findByPk(approvalId);
    if (approval && approval.userId !== userId && !isAdmin) {
      throw Object.assign(new Error('Access denied'), { statusCode: 403 });
    }
    return approval;
  }

  /**
   * Expire stale pending approvals (called periodically).
   */
  async expireStale(): Promise<number> {
    const stale = await Approval.findAll({ where: { status: 'pending' } });
    let count = 0;
    for (const approval of stale) {
      if (approval.expiresAt && approval.expiresAt < new Date()) {
        await approval.update({ status: 'expired' } as any);
        count++;
      }
    }
    if (count) logger.info(`Expired ${count} stale approval(s)`);
    return count;
  }
}

export default new ApprovalService();
