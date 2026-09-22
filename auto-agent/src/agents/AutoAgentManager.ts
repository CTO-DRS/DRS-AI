import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';
import chokidar from 'chokidar';
import fs from 'fs-extra';
import { AutoAgent, AgentExecution, FileWatcherConfig, LogMonitorConfig } from '../types';
import redis from '../utils/redis';
import logger from '../utils/logger';

const AGENT_PREFIX = 'auto-agent:';
const EXECUTION_PREFIX = 'agent-execution:';

export class AutoAgentManager {
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
  private fileWatchers: Map<string, chokidar.FSWatcher> = new Map();
  private gatewayUrl: string;

  constructor() {
    this.gatewayUrl = process.env.GATEWAY_URL || 'http://gateway:3000';
  }

  async createAgent(agentData: Partial<AutoAgent>): Promise<AutoAgent> {
    const agent: AutoAgent = {
      id: uuidv4(),
      name: agentData.name || 'Unnamed Agent',
      description: agentData.description || '',
      type: agentData.type || 'scheduled',
      enabled: agentData.enabled ?? true,
      config: agentData.config || { agentId: 'chat', input: '' },
      schedule: agentData.schedule,
      eventConfig: agentData.eventConfig,
      runCount: 0,
      successCount: 0,
      failureCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.saveAgent(agent);

    if (agent.enabled) {
      await this.startAgent(agent);
    }

    logger.info(`Auto agent created: ${agent.name} (${agent.id})`);
    return agent;
  }

  async startAgent(agent: AutoAgent): Promise<void> {
    if (agent.type === 'scheduled' && agent.schedule) {
      this.startScheduledAgent(agent);
    } else if (agent.type === 'event-driven' && agent.eventConfig) {
      this.startEventDrivenAgent(agent);
    } else if (agent.type === 'continuous') {
      this.startContinuousAgent(agent);
    }
  }

  private startScheduledAgent(agent: AutoAgent): void {
    if (!agent.schedule) return;

    const task = cron.schedule(
      agent.schedule.cron,
      async () => {
        await this.executeAgent(agent);
      },
      {
        scheduled: true,
        timezone: agent.schedule.timezone || 'UTC'
      }
    );

    this.scheduledTasks.set(agent.id, task);
    
    // Calculate next run
    const interval = cron.parseExpression(agent.schedule.cron);
    agent.nextRunAt = interval.next().toDate();
    this.saveAgent(agent);

    logger.info(`Scheduled agent started: ${agent.name}`);
  }

  private startEventDrivenAgent(agent: AutoAgent): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!agent.eventConfig) {
        reject(new Error('Event config not provided'));
        return;
      }

      const { eventType } = agent.eventConfig;

      if (eventType === 'file.watch') {
        const config = agent.eventConfig as FileWatcherConfig;
        const watcher = chokidar.watch(config.path, {
          ignored: /(^|[\/\\])\../,
          persistent: true,
          recursive: config.recursive
        });

        watcher.on('all', async (event, path) => {
          logger.info(`File event: ${event} - ${path}`);
          await this.executeAgent(agent, { event, path });
        });

        this.fileWatchers.set(agent.id, watcher);
        logger.info(`File watcher started: ${config.path}`);
      } else if (eventType === 'log.monitor') {
        // Log monitoring implementation
        this.startLogMonitor(agent);
      }

      resolve();
    });
  }

  private startContinuousAgent(agent: AutoAgent): void {
    // Continuous agents run in a loop with a delay
    const runLoop = async () => {
      while (agent.enabled) {
        try {
          await this.executeAgent(agent);
          // Wait 5 minutes between runs
          await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
        } catch (error) {
          logger.error(`Continuous agent error: ${agent.id}`, error);
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
      }
    };

    runLoop();
    logger.info(`Continuous agent started: ${agent.name}`);
  }

  private startLogMonitor(agent: AutoAgent): void {
    const config = agent.eventConfig as LogMonitorConfig;
    
    // Simple log tail implementation
    const tailLog = async () => {
      try {
        const stats = await fs.stat(config.logPath);
        let position = stats.size;

        setInterval(async () => {
          try {
            const newStats = await fs.stat(config.logPath);
            if (newStats.size > position) {
              const stream = fs.createReadStream(config.logPath, {
                start: position,
                encoding: 'utf-8'
              });

              let data = '';
              stream.on('data', chunk => data += chunk);
              stream.on('end', async () => {
                position = newStats.size;
                
                // Check patterns
                for (const pattern of config.patterns) {
                  if (new RegExp(pattern.pattern).test(data)) {
                    await this.executeAgent(agent, { 
                      logData: data, 
                      matchedPattern: pattern 
                    });
                  }
                }
              });
            }
          } catch (error) {
            logger.error('Log monitor error:', error);
          }
        }, 5000);
      } catch (error) {
        logger.error('Failed to start log monitor:', error);
      }
    };

    tailLog();
  }

  async stopAgent(agentId: string): Promise<void> {
    // Stop scheduled task
    const task = this.scheduledTasks.get(agentId);
    if (task) {
      task.stop();
      this.scheduledTasks.delete(agentId);
    }

    // Stop file watcher
    const watcher = this.fileWatchers.get(agentId);
    if (watcher) {
      await watcher.close();
      this.fileWatchers.delete(agentId);
    }

    const agent = await this.getAgent(agentId);
    if (agent) {
      agent.enabled = false;
      agent.nextRunAt = undefined;
      await this.saveAgent(agent);
    }

    logger.info(`Agent stopped: ${agentId}`);
  }

  async executeAgent(agent: AutoAgent, context?: any): Promise<AgentExecution> {
    const execution: AgentExecution = {
      id: uuidv4(),
      agentId: agent.config.agentId,
      autoAgentId: agent.id,
      status: 'running',
      input: this.interpolateTemplate(agent.config.input, context || {}),
      startedAt: new Date()
    };

    await this.saveExecution(execution);

    try {
      // Call gateway to execute agent
      const axios = (await import('axios')).default;
      const response = await axios.post(`${this.gatewayUrl}/api/v1/tasks`, {
        agentId: agent.config.agentId,
        input: execution.input,
        type: 'auto',
        context: { ...agent.config.context, ...context }
      });

      const taskId = response.data.data.task.id;

      // Poll for completion
      const result = await this.pollTaskCompletion(taskId);

      if (result.status === 'completed') {
        execution.status = 'completed';
        execution.output = result.result?.output;
        agent.successCount++;
      } else {
        execution.status = 'failed';
        execution.error = result.error || 'Task failed';
        agent.failureCount++;
      }

      agent.runCount++;
      agent.lastRunAt = new Date();

      // Handle output
      if (agent.config.outputHandler) {
        await this.handleOutput(agent, execution);
      }

      // Send notifications
      if (agent.config.notifications) {
        await this.sendNotifications(agent, execution);
      }

    } catch (error: any) {
      execution.status = 'failed';
      execution.error = error.message;
      agent.failureCount++;
    }

    execution.completedAt = new Date();
    await this.saveExecution(execution);
    await this.saveAgent(agent);

    return execution;
  }

  private async pollTaskCompletion(taskId: string, maxAttempts: number = 60): Promise<any> {
    const axios = (await import('axios')).default;
    
    for (let i = 0; i < maxAttempts; i++) {
      const response = await axios.get(`${this.gatewayUrl}/api/v1/tasks/${taskId}`);
      const task = response.data.data.task;
      
      if (task.status === 'completed' || task.status === 'failed') {
        return task;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error('Task timeout');
  }

  private async handleOutput(agent: AutoAgent, execution: AgentExecution): Promise<void> {
    const handler = agent.config.outputHandler;
    
    if (handler === 'save-to-file') {
      const outputPath = `/app/data/outputs/${agent.id}-${Date.now()}.txt`;
      await fs.ensureDir('/app/data/outputs');
      await fs.writeFile(outputPath, execution.output || '');
      logger.info(`Output saved to: ${outputPath}`);
    } else if (handler === 'webhook') {
      // Send to webhook
    }
  }

  private async sendNotifications(agent: AutoAgent, execution: AgentExecution): Promise<void> {
    const notifications = agent.config.notifications;
    if (!notifications) return;

    const shouldNotify = 
      (execution.status === 'completed' && notifications.onSuccess) ||
      (execution.status === 'failed' && notifications.onFailure);

    if (shouldNotify) {
      logger.info(`Notification for agent ${agent.name}: ${execution.status}`);
      // Implementation depends on notification service
    }
  }

  private interpolateTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return context[key] !== undefined ? String(context[key]) : match;
    });
  }

  async getAgent(agentId: string): Promise<AutoAgent | null> {
    const data = await redis.get(`${AGENT_PREFIX}${agentId}`);
    return data ? JSON.parse(data) : null;
  }

  async getAllAgents(): Promise<AutoAgent[]> {
    const keys = await redis.keys(`${AGENT_PREFIX}*`);
    const agents: AutoAgent[] = [];

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        agents.push(JSON.parse(data));
      }
    }

    return agents;
  }

  async getExecutions(agentId: string, limit: number = 20): Promise<AgentExecution[]> {
    const keys = await redis.keys(`${EXECUTION_PREFIX}*`);
    const executions: AgentExecution[] = [];

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const execution: AgentExecution = JSON.parse(data);
        if (execution.autoAgentId === agentId) {
          executions.push(execution);
        }
      }
    }

    return executions
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  private async saveAgent(agent: AutoAgent): Promise<void> {
    await redis.setex(
      `${AGENT_PREFIX}${agent.id}`,
      86400 * 30,
      JSON.stringify(agent)
    );
  }

  private async saveExecution(execution: AgentExecution): Promise<void> {
    await redis.setex(
      `${EXECUTION_PREFIX}${execution.id}`,
      86400,
      JSON.stringify(execution)
    );
  }

  async deleteAgent(agentId: string): Promise<void> {
    await this.stopAgent(agentId);
    await redis.del(`${AGENT_PREFIX}${agentId}`);
    logger.info(`Agent deleted: ${agentId}`);
  }
}

export default new AutoAgentManager();
