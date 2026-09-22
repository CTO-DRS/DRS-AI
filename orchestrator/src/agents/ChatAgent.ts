import { BaseAgent } from './BaseAgent';
import { Task, TaskResult } from '../types';
import logger from '../utils/logger';

export class ChatAgent extends BaseAgent {
  async execute(task: Task): Promise<TaskResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`ChatAgent executing task ${task.id}`);
      
      const messages = [
        { role: 'system', content: this.config.systemPrompt },
        { role: 'user', content: task.input }
      ];

      // Add context if available
      if (task.context?.conversation) {
        messages.splice(1, 0, ...task.context.conversation);
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
      logger.error(`ChatAgent failed for task ${task.id}:`, error);
      throw error;
    }
  }
}

export default ChatAgent;
