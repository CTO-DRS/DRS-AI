import { BaseAgent } from './BaseAgent';
import { Task, TaskResult } from '../types';
import logger from '../utils/logger';

export class FileAgent extends BaseAgent {
  async execute(task: Task): Promise<TaskResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`FileAgent executing task ${task.id}`);
      
      const systemPrompt = `${this.config.systemPrompt}

When analyzing documents:
1. Identify key topics and themes
2. Extract important information and data
3. Provide clear, concise summaries
4. Highlight actionable insights
5. Organize information logically
6. Note any uncertainties or missing information

If the content is technical, explain it in accessible terms while maintaining accuracy.`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task.input }
      ];

      // Add file content if available
      if (task.context?.fileContent) {
        messages.push({
          role: 'user',
          content: `File content:\n\`\`\`\n${task.context.fileContent.substring(0, 15000)}\n\`\`\``
        });
      }

      // Add file metadata if available
      if (task.context?.fileMetadata) {
        messages.push({
          role: 'user',
          content: `File metadata:\n${JSON.stringify(task.context.fileMetadata, null, 2)}`
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
      logger.error(`FileAgent failed for task ${task.id}:`, error);
      throw error;
    }
  }
}

export default FileAgent;
