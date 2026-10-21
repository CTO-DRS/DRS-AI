import { TaskRecord } from '../models';
import { Task } from '../types';
import logger from '../utils/logger';

/**
 * Persistence — mirrors Redis task state into Postgres so tasks
 * survive restarts (Redis entries have a 24h TTL by design).
 * All writes are fire-and-forget: persistence failures must not
 * break task execution.
 */
export class PersistenceService {
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.ORCHESTRATOR_PERSISTENCE !== 'false';
  }

  async upsertTask(task: Task): Promise<void> {
    if (!this.enabled) return;
    try {
      await TaskRecord.upsert({
        id: task.id,
        userId: task.userId,
        type: task.type,
        input: task.input,
        agentId: task.agentId,
        status: task.status,
        priority: task.priority,
        context: task.context,
        result: task.result as Record<string, any> | undefined,
        error: task.error,
        parentTaskId: task.parentTaskId,
        requireApproval: Boolean((task as any).requireApproval)
      } as any);
    } catch (error: any) {
      logger.error(`Failed to persist task ${task.id}:`, error.message);
    }
  }

  async deleteTask(taskId: string): Promise<void> {
    if (!this.enabled) return;
    try {
      await TaskRecord.destroy({ where: { id: taskId } });
    } catch (error: any) {
      logger.error(`Failed to delete persisted task ${taskId}:`, error.message);
    }
  }

  /**
   * Restore tasks from Postgres back into Redis after a restart.
   * Called once at boot. Only pending/queued/running tasks are re-queued.
   */
  async recoverQueuedTasks(): Promise<number> {
    if (!this.enabled) return 0;
    try {
      const records = await TaskRecord.findAll({
        where: { status: ['pending', 'queued', 'awaiting_approval'] }
      });
      let recovered = 0;
      for (const record of records) {
        const task: Task = {
          id: record.id,
          type: record.type,
          input: record.input,
          context: record.context || undefined,
          agentId: record.agentId || undefined,
          status: 'pending',
          priority: record.priority as Task['priority'],
          createdAt: record.createdAt,
          result: record.result as Task['result'],
          error: record.error || undefined,
          parentTaskId: record.parentTaskId || undefined,
          userId: record.userId
        };
        (task as any).requireApproval = record.requireApproval;
        // Re-queue only non-approval-gated tasks; approvals must be re-decided
        if (!record.requireApproval) {
          const { default: redis } = await import('../utils/redis');
          await redis.lpush('drs:tasks', task.id).catch(() => {});
        }
        await this.upsertTask({ ...task, status: record.status as Task['status'] });
        recovered++;
      }
      if (recovered > 0) logger.info(`Recovered ${recovered} task(s) from Postgres`);
      return recovered;
    } catch (error: any) {
      logger.error('Task recovery failed:', error.message);
      return 0;
    }
  }
}

export default new PersistenceService();
