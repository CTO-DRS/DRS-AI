import { v4 as uuidv4 } from 'uuid';
import { Task, TaskResult, TaskStatus, TaskPriority } from '../types';
import { agentRegistry } from '../agents';
import logger from '../utils/logger';
import redis from '../utils/redis';

const TASK_QUEUE = 'drs:tasks';
const TASK_PREFIX = 'drs:task:';

export class TaskService {
  async createTask(
    userId: string,
    input: string,
    type: string = 'auto',
    priority: TaskPriority = 'normal',
    context?: Record<string, any>,
    parentTaskId?: string
  ): Promise<Task> {
    const task: Task = {
      id: uuidv4(),
      type,
      input,
      context,
      status: 'pending',
      priority,
      createdAt: new Date(),
      userId,
      parentTaskId
    };

    // Store task in Redis
    await redis.setex(
      `${TASK_PREFIX}${task.id}`,
      86400, // 24 hours
      JSON.stringify(task)
    );

    // Add to queue
    await redis.lpush(TASK_QUEUE, task.id);

    logger.info(`Task ${task.id} created for user ${userId}`);

    return task;
  }

  async getTask(taskId: string): Promise<Task | null> {
    const data = await redis.get(`${TASK_PREFIX}${taskId}`);
    if (!data) return null;
    return JSON.parse(data);
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
