import { BaseAgent } from './BaseAgent';
import { Task, TaskResult } from '../types';
import logger from '../utils/logger';

export class ReasoningAgent extends BaseAgent {
  async execute(task: Task): Promise<TaskResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`ReasoningAgent executing task ${task.id}`);
      
      const systemPrompt = `${this.config.systemPrompt}

When analyzing problems:
1. Break down complex problems into smaller parts
2. Consider multiple perspectives and approaches
3. Evaluate pros and cons of each option
4. Provide structured, logical reasoning
5. Support conclusions with evidence
6. Acknowledge uncertainties when they exist

Use this structure:
- Problem Understanding
- Key Considerations
- Analysis
- Recommendation/Conclusion`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task.input }
      ];

      // Add research context if available
      if (task.context?.research) {
        messages.push({
          role: 'user',
          content: `Research context:\n${JSON.stringify(task.context.research, null, 2)}`
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
      logger.error(`ReasoningAgent failed for task ${task.id}:`, error);
      throw error;
    }
  }
}

export default ReasoningAgent;
