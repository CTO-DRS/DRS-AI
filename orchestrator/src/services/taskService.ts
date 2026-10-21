import { v4 as uuidv4 } from 'uuid';
import { Task, TaskResult, TaskStatus, TaskPriority } from '../types';
import { agentRegistry } from '../agents';
import logger from '../utils/logger';
import redis from '../utils/redis';
import persistence from './persistence';
import eventBus from './eventBus';
import approvalService from './approvalService';

const TASK_QUEUE = 'drs:tasks';
const TASK_PREFIX = 'drs:task:';

export class TaskService {
  async createTask(
    userId: string,
    input: string,
    type: string = 'auto',
    priority: TaskPriority = 'normal',
    context?: Record<string, any>,
    parentTaskId?: string,
    requireApproval: boolean = false
  ): Promise<Task> {
    const task: Task = {
      id: uuidv4(),
      type,
      input,
      context,
      status: requireApproval ? 'awaiting_approval' : 'pending',
      priority,
      createdAt: new Date(),
      userId,
      parentTaskId,
      requireApproval
    };

    // Store task in Redis
    await redis.setex(
      `${TASK_PREFIX}${task.id}`,
      86400, // 24 hours (hot cache; Postgres keeps the durable copy)
      JSON.stringify(task)
    );

    // Mirror to Postgres (durable)
    await persistence.upsertTask(task);

    if (requireApproval) {
      // Human-in-the-loop gate: park the task and request sign-off.
      // It will be queued by POST /approvals/:id/approve.
      await approvalService.requestApproval({
        userId,
        type: 'task_execution',
        taskId: task.id,
        payload: {
          title: 'Task execution requires approval',
          detail: input.slice(0, 500),
          meta: { type, priority }
        }
      });
      await eventBus.publish('task.created', { taskId: task.id, status: task.status, requireApproval }, userId);
      logger.info(`Task ${task.id} created (awaiting approval) for user ${userId}`);
      return task;
    }

    // Subtasks (parentTaskId set) are executed by their parent plan/step
    // directly — queueing them would cause double execution.
    if (!parentTaskId) {
      await redis.lpush(TASK_QUEUE, task.id);
    }

    await eventBus.publish('task.created', { taskId: task.id, status: task.status }, userId);
    logger.info(`Task ${task.id} created for user ${userId}${parentTaskId ? ' (subtask)' : ''}`);

    return task;
  }

  async getTask(taskId: string): Promise<Task | null> {
    const data = await redis.get(`${TASK_PREFIX}${taskId}`);
    if (data) return JSON.parse(data);

    // Redis miss (TTL expired or restart): fall back to Postgres
    try {
      const { TaskRecord } = await import('../models');
      const record = await TaskRecord.findByPk(taskId);
      if (!record) return null;
      const task: Task = {
        id: record.id,
        type: record.type,
        input: record.input,
        context: record.context || undefined,
        agentId: record.agentId || undefined,
        status: record.status as TaskStatus,
        priority: record.priority as Task['priority'],
        createdAt: record.createdAt,
        startedAt: undefined,
        completedAt: undefined,
        result: record.result as Task['result'],
        error: record.error || undefined,
        parentTaskId: record.parentTaskId || undefined,
        userId: record.userId,
        requireApproval: record.requireApproval
      };
      // Rehydrate the hot cache
      await redis.setex(`${TASK_PREFIX}${taskId}`, 86400, JSON.stringify(task)).catch(() => {});
      return task;
    } catch (error: any) {
      logger.error(`Postgres fallback for task ${taskId} failed:`, error.message);
      return null;
    }
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;

    const updatedTask = { ...task, ...updates };
    
    await redis.setex(
      `${TASK_PREFIX}${taskId}`,
      86400,
      JSON.stringify(updatedTask)
    );

    await persistence.upsertTask(updatedTask);
    await eventBus.publish('task.updated', {
      taskId,
      status: updatedTask.status,
      error: updatedTask.error,
      hasResult: Boolean(updatedTask.result)
    }, updatedTask.userId);

    return updatedTask;
  }

  async executeTask(taskId: string): Promise<TaskResult> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Update status to running
    await this.updateTask(taskId, { 
      status: 'running', 
      startedAt: new Date() 
    });

    try {
      let agent;
      
      // Determine which agent to use
      if (task.agentId) {
        agent = agentRegistry.getAgent(task.agentId);
      } else if (task.type === 'auto') {
        const routing = agentRegistry.routeTask(task.input);
        agent = routing?.agent;
      } else {
        agent = agentRegistry.findAgentForTask(task.type);
      }

      if (!agent) {
        throw new Error('No suitable agent found for this task');
      }

      logger.info(`Executing task ${taskId} with agent ${agent.getName()}`);

      const result = await agent.execute(task);

      // Update task as completed
      await this.updateTask(taskId, {
        status: 'completed',
        completedAt: new Date(),
        result
      });

      // Execute subtasks if this task has a plan awaiting execution
      const { Plan } = await import('../models');
      const plan = await Plan.findOne({ where: { taskId, status: 'approved' } });
      if (plan) {
        const { default: plannerService } = await import('./plannerService');
        await plannerService.executePlan(plan, taskId).catch((err: Error) =>
          logger.error(`Plan execution for task ${taskId} failed:`, err)
        );
      }

      return result;
    } catch (error: any) {
      logger.error(`Task ${taskId} execution failed:`, error);
      
      await this.updateTask(taskId, {
        status: 'failed',
        completedAt: new Date(),
        error: error.message
      });

      throw error;
    }
  }

  async getUserTasks(userId: string, status?: TaskStatus): Promise<Task[]> {
    const keys = await redis.keys(`${TASK_PREFIX}*`);
    const tasks: Task[] = [];

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const task: Task = JSON.parse(data);
        if (task.userId === userId && (!status || task.status === status)) {
          tasks.push(task);
        }
      }
    }

    return tasks.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const task = await this.getTask(taskId);
    if (!task || task.status === 'completed' || task.status === 'failed') {
      return false;
    }

    await this.updateTask(taskId, { status: 'cancelled' });
    return true;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const result = await redis.del(`${TASK_PREFIX}${taskId}`);
    await persistence.deleteTask(taskId);
    return result > 0;
  }

  // Process tasks from queue
  async processQueue(): Promise<void> {
    const taskId = await redis.rpop(TASK_QUEUE);
    if (!taskId) return;

    try {
      await this.executeTask(taskId);
    } catch (error) {
      logger.error(`Failed to process task ${taskId}:`, error);
    }
  }
}

export default new TaskService();
