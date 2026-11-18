import { BaseAgent } from './BaseAgent';
import { Task, TaskResult } from '../types';
import logger from '../utils/logger';

export class AutomationAgent extends BaseAgent {
  async execute(task: Task): Promise<TaskResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`AutomationAgent executing task ${task.id}`);
      
      const systemPrompt = `${this.config.systemPrompt}

When creating automation:
1. Understand the task requirements clearly
2. Choose appropriate tools and languages (bash, python, etc.)
3. Write robust, error-handling code
4. Include clear comments and documentation
5. Provide setup and usage instructions
6. Consider security implications

Generate complete, runnable scripts that can be executed directly.`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task.input }
      ];

      // Add environment context if available
      if (task.context?.environment) {
        messages.push({
          role: 'user',
          content: `Environment details:\n${JSON.stringify(task.context.environment, null, 2)}`
        });
      }

      const response = await this.chatModel(messages);
      
      const executionTime = Date.now() - startTime;
      
      return {
        output: response,
        metadata: {
          model: this.config.defaultModel,
          executionTime,
          agentId: this.config.id
        }
      };
    } catch (error: any) {
      logger.error(`AutomationAgent failed for task ${task.id}:`, error);
      throw error;
    }
  }
}

export default AutomationAgent;
