import { Agent, Task, TaskResult } from '../types';
import logger from '../utils/logger';

export abstract class BaseAgent {
  protected config: Agent;
  protected routerUrl: string;

  constructor(config: Agent) {
    this.config = config;
    this.routerUrl = process.env.ROUTER_SERVICE_URL || 'http://localhost:3002';
  }

  getId(): string {
    return this.config.id;
  }

  getName(): string {
    return this.config.name;
  }

  getCapabilities(): string[] {
    return this.config.capabilities;
  }

  canHandle(taskType: string): boolean {
    return this.config.capabilities.includes(taskType);
  }

  abstract execute(task: Task): Promise<TaskResult>;

  protected async callModel(prompt: string, context?: string): Promise<string> {
    try {
      const axios = (await import('axios')).default;
      
      const response = await axios.post(`${this.routerUrl}/chat/generate`, {
        model: this.config.defaultModel,
        prompt,
        system: context || this.config.systemPrompt,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens
        }
      });

      return response.data.data.response || '';
    } catch (error: any) {
      logger.error(`Agent ${this.config.id} model call failed:`, error);
      throw new Error(`Model execution failed: ${error.message}`);
    }
  }

  protected async chatModel(messages: Array<{role: string, content: string}>): Promise<string> {
    try {
      const axios = (await import('axios')).default;
      
      const response = await axios.post(`${this.routerUrl}/chat`, {
        model: this.config.defaultModel,
        messages,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens
        }
      });

      return response.data.data.message?.content || '';
    } catch (error: any) {
      logger.error(`Agent ${this.config.id} chat failed:`, error);
      throw new Error(`Chat execution failed: ${error.message}`);
    }
  }

  protected formatSystemPrompt(context: Record<string, any>): string {
    let prompt = this.config.systemPrompt;
    
    for (const [key, value] of Object.entries(context)) {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    
    return prompt;
  }
}

export default BaseAgent;
