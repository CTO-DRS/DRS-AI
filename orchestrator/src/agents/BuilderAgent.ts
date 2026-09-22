import { BaseAgent } from './BaseAgent';
import { Task, TaskResult } from '../types';
import logger from '../utils/logger';

export class BuilderAgent extends BaseAgent {
  async execute(task: Task): Promise<TaskResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`BuilderAgent executing task ${task.id}`);
      
      const systemPrompt = `${this.config.systemPrompt}

When generating applications:
1. Create a complete, production-ready project structure
2. Include all necessary configuration files
3. Write clean, documented code following best practices
4. Include README with setup instructions
5. Add error handling and validation
6. Consider security, performance, and scalability
7. Use modern frameworks and tools

Generate the complete project files with clear file paths and content.`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task.input }
      ];

      // Add project requirements if available
      if (task.context?.requirements) {
        messages.push({
          role: 'user',
          content: `Project requirements:\n${JSON.stringify(task.context.requirements, null, 2)}`
        });
      }

      // Add tech stack preferences if available
      if (task.context?.techStack) {
        messages.push({
          role: 'user',
          content: `Preferred tech stack:\n${JSON.stringify(task.context.techStack, null, 2)}`
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
      logger.error(`BuilderAgent failed for task ${task.id}:`, error);
      throw error;
    }
  }
}

export default BuilderAgent;
