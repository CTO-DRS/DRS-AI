import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';
import { Queue, Worker } from 'bullmq';
import {
  Workflow,
  WorkflowExecution,
  WorkflowCondition,
  WorkflowAction,
  ActionResult
} from '../types';
import logger from '../utils/logger';
import redis from '../utils/redis';

const EXECUTION_QUEUE = 'workflow-executions';

export class WorkflowEngine {
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
  private executionQueue: Queue;
  private worker: Worker;

  constructor() {
    this.executionQueue = new Queue(EXECUTION_QUEUE, { connection: redis });
    this.initializeWorker();
  }

  private initializeWorker() {
    this.worker = new Worker(EXECUTION_QUEUE, async (job) => {
      const { executionId, workflow, triggerData } = job.data;
      await this.executeWorkflow(executionId, workflow, triggerData);
    }, { connection: redis });

    this.worker.on('completed', (job) => {
      logger.info(`Workflow execution completed: ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`Workflow execution failed: ${job?.id}`, err);
    });
  }

  // Schedule a workflow
  scheduleWorkflow(workflow: Workflow): void {
    if (workflow.trigger.type === 'schedule' && workflow.trigger.config.cron) {
      const task = cron.schedule(
        workflow.trigger.config.cron,
        async () => {
          await this.triggerWorkflow(workflow, { trigger: 'schedule' });
        },
        {
          scheduled: workflow.enabled,
          timezone: workflow.trigger.config.timezone || 'UTC'
        }
      );

      this.scheduledTasks.set(workflow.id, task);
      logger.info(`Scheduled workflow: ${workflow.name} (${workflow.id})`);
    }
  }

  // Unschedule a workflow
  unscheduleWorkflow(workflowId: string): void {
    const task = this.scheduledTasks.get(workflowId);
    if (task) {
      task.stop();
      this.scheduledTasks.delete(workflowId);
      logger.info(`Unscheduled workflow: ${workflowId}`);
    }
  }

  // Trigger a workflow
  async triggerWorkflow(workflow: Workflow, triggerData: any): Promise<string> {
    const executionId = uuidv4();
    
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId: workflow.id,
      userId: workflow.userId,
      status: 'pending',
      triggerData,
      context: { ...triggerData, workflow: workflow.name },
      startedAt: new Date(),
      results: []
    };

    // Store execution
    await redis.setex(
      `execution:${executionId}`,
      86400,
      JSON.stringify(execution)
    );

    // Queue execution
    await this.executionQueue.add('execute', {
      executionId,
      workflow,
      triggerData
    });

    logger.info(`Workflow triggered: ${workflow.name} (${executionId})`);
    return executionId;
  }

  // Execute workflow
  private async executeWorkflow(
    executionId: string,
    workflow: Workflow,
    triggerData: any
  ): Promise<void> {
    const executionData = await redis.get(`execution:${executionId}`);
    if (!executionData) {
      throw new Error('Execution not found');
    }

    const execution: WorkflowExecution = JSON.parse(executionData);
    execution.status = 'running';
    await this.saveExecution(execution);

    try {
      // Check conditions
      const conditionsMet = await this.evaluateConditions(
        workflow.conditions,
        execution.context
      );

      if (!conditionsMet) {
        execution.status = 'completed';
        execution.completedAt = new Date();
        await this.saveExecution(execution);
        logger.info(`Workflow conditions not met: ${executionId}`);
        return;
      }

      // Execute actions
      for (const action of workflow.actions) {
        const result = await this.executeAction(action, execution.context);
        execution.results.push(result);

        if (result.status === 'failure' && action.onFailure) {
          // Handle failure
          logger.warn(`Action failed: ${action.id}`);
        }

        await this.saveExecution(execution);
      }

      execution.status = 'completed';
      execution.completedAt = new Date();
      await this.saveExecution(execution);

      logger.info(`Workflow execution completed: ${executionId}`);
    } catch (error: any) {
      execution.status = 'failed';
      execution.error = error.message;
      execution.completedAt = new Date();
      await this.saveExecution(execution);

      logger.error(`Workflow execution failed: ${executionId}`, error);
    }
  }

  // Evaluate conditions
  private async evaluateConditions(
    conditions: WorkflowCondition[],
    context: Record<string, any>
  ): Promise<boolean> {
    if (!conditions || conditions.length === 0) return true;

    for (const condition of conditions) {
      const result = await this.evaluateCondition(condition, context);
      if (!result) return false;
    }

    return true;
  }

  private async evaluateCondition(
    condition: WorkflowCondition,
    context: Record<string, any>
  ): Promise<boolean> {
    switch (condition.type) {
      case 'if':
        return this.evaluateIfCondition(condition, context);
      case 'and':
        return condition.conditions?.every(c => this.evaluateCondition(c, context)) ?? true;
      case 'or':
        return condition.conditions?.some(c => this.evaluateCondition(c, context)) ?? false;
      case 'not':
        return !this.evaluateCondition(condition.conditions?.[0]!, context);
      default:
        return true;
    }
  }

  private evaluateIfCondition(
    condition: WorkflowCondition,
    context: Record<string, any>
  ): boolean {
    const { field, operator, value } = condition;
    if (!field || !operator) return true;

    const fieldValue = this.getNestedValue(context, field);

    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'not_equals':
        return fieldValue !== value;
      case 'contains':
        return String(fieldValue).includes(String(value));
      case 'greater_than':
        return Number(fieldValue) > Number(value);
      case 'less_than':
        return Number(fieldValue) < Number(value);
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;
      case 'matches':
        return new RegExp(String(value)).test(String(fieldValue));
      default:
        return true;
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // Execute action
  private async executeAction(
    action: WorkflowAction,
    context: Record<string, any>
  ): Promise<ActionResult> {
    const startedAt = new Date();
    
    try {
      let output: any;

      switch (action.type) {
        case 'agent':
          output = await this.executeAgentAction(action, context);
          break;
        case 'api_call':
          output = await this.executeApiCallAction(action, context);
          break;
        case 'delay':
          await this.executeDelayAction(action);
          output = { delayed: true };
          break;
        case 'webhook':
          output = await this.executeWebhookAction(action, context);
          break;
        case 'notification':
          output = await this.executeNotificationAction(action, context);
          break;
        default:
          output = { message: 'Action type not implemented' };
      }

      return {
        actionId: action.id,
        status: 'success',
        output,
        startedAt,
        completedAt: new Date()
      };
    } catch (error: any) {
      return {
        actionId: action.id,
        status: 'failure',
        error: error.message,
        startedAt,
        completedAt: new Date()
      };
    }
  }

  private async executeAgentAction(action: WorkflowAction, context: Record<string, any>): Promise<any> {
    const axios = (await import('axios')).default;
    const gatewayUrl = process.env.GATEWAY_URL || 'http://gateway:3000';
    
    const response = await axios.post(`${gatewayUrl}/api/v1/tasks`, {
      agentId: action.config.agentId,
      input: this.interpolateTemplate(action.config.input || '', context),
      type: 'auto'
    });

    return response.data;
  }

  private async executeApiCallAction(action: WorkflowAction, context: Record<string, any>): Promise<any> {
    const axios = (await import('axios')).default;
    
    const response = await axios({
      url: action.config.url,
      method: action.config.method || 'GET',
      headers: action.config.headers,
      data: action.config.body
    });

    return response.data;
  }

  private async executeDelayAction(action: WorkflowAction): Promise<void> {
    const delayMs = action.config.delayMs || 1000;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  private async executeWebhookAction(action: WorkflowAction, context: Record<string, any>): Promise<any> {
    const axios = (await import('axios')).default;
    
    const response = await axios.post(
      action.config.webhookUrl || '',
      context
    );

    return response.data;
  }

  private async executeNotificationAction(action: WorkflowAction, context: Record<string, any>): Promise<any> {
    // Implementation depends on notification service
    logger.info(`Notification: ${this.interpolateTemplate(action.config.message || '', context)}`);
    return { sent: true };
  }

  private interpolateTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return context[key] !== undefined ? String(context[key]) : match;
    });
  }

  private async saveExecution(execution: WorkflowExecution): Promise<void> {
    await redis.setex(
      `execution:${execution.id}`,
      86400,
      JSON.stringify(execution)
    );
  }

  async getExecution(executionId: string): Promise<WorkflowExecution | null> {
    const data = await redis.get(`execution:${executionId}`);
    return data ? JSON.parse(data) : null;
  }
}

export default new WorkflowEngine();
