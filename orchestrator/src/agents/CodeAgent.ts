import { BaseAgent } from './BaseAgent';
import { Task, TaskResult } from '../types';
import logger from '../utils/logger';

export class CodeAgent extends BaseAgent {
  async execute(task: Task): Promise<TaskResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`CodeAgent executing task ${task.id}`);
      
      const systemPrompt = `${this.config.systemPrompt}

When writing code:
1. Use clear variable and function names
2. Add comments for complex logic
3. Include error handling
4. Follow language-specific best practices
5. Provide usage examples when helpful

If debugging, analyze the error carefully and provide a fix with explanation.`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task.input }
      ];

      // Add code context if available
      if (task.context?.code) {
        messages.push({
          role: 'user',
          content: `Here is the relevant code:\n\`\`\`\n${task.context.code}\n\`\`\``
        });
      }

      // Add error context if available
      if (task.context?.error) {
        messages.push({
          role: 'user',
          content: `Error encountered:\n${task.context.error}`
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
      logger.error(`CodeAgent failed for task ${task.id}:`, error);
      throw error;
    }
  }
}

export default CodeAgent;
