import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';

interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface GenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  context?: number[];
  stream?: boolean;
  raw?: boolean;
  format?: string;
  options?: Record<string, any>;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  format?: string;
  options?: Record<string, any>;
}

interface ModelCapabilities {
  chat: boolean;
  code: boolean;
  reasoning: boolean;
  vision: boolean;
  embedding: boolean;
}

interface ModelInfo {
  id: string;
  name: string;
  description: string;
  size: number;
  capabilities: ModelCapabilities;
  parameters: string;
  family: string;
  quantization: string;
  recommendedFor: string[];
}

export class OllamaService {
  private client: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 300000, // 5 minutes for long generations
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await this.client.get('/api/tags');
      const models: OllamaModel[] = response.data.models || [];
      
      return models.map(model => this.parseModelInfo(model));
    } catch (error) {
      logger.error('Failed to list models:', error);
      throw new Error('Failed to fetch models from Ollama');
    }
  }

  async getModelInfo(modelName: string): Promise<ModelInfo> {
    try {
      const response = await this.client.post('/api/show', { name: modelName });
      const info = response.data;
      
      return {
        id: modelName,
        name: modelName,
        description: info.license || 'No description available',
        size: 0,
        capabilities: this.detectCapabilities(modelName),
        parameters: info.parameters || 'unknown',
        family: info.details?.family || 'unknown',
        quantization: info.details?.quantization_level || 'unknown',
        recommendedFor: this.getRecommendedUses(modelName)
      };
    } catch (error) {
      logger.error(`Failed to get model info for ${modelName}:`, error);
      throw new Error(`Model ${modelName} not found`);
    }
  }

  async generate(request: GenerateRequest): Promise<any> {
    try {
      const response = await this.client.post('/api/generate', request, {
        responseType: request.stream ? 'stream' : 'json'
      });
      return response.data;
    } catch (error) {
      logger.error('Generation failed:', error);
      throw new Error('Failed to generate response');
    }
  }

  async chat(request: ChatRequest): Promise<any> {
    try {
      const response = await this.client.post('/api/chat', request, {
        responseType: request.stream ? 'stream' : 'json'
      });
      return response.data;
    } catch (error) {
      logger.error('Chat failed:', error);
      throw new Error('Failed to get chat response');
    }
  }

  async pullModel(modelName: string): Promise<void> {
    try {
      await this.client.post('/api/pull', { name: modelName, stream: false });
      logger.info(`Model ${modelName} pulled successfully`);
    } catch (error) {
      logger.error(`Failed to pull model ${modelName}:`, error);
      throw new Error(`Failed to pull model ${modelName}`);
    }
  }

  async deleteModel(modelName: string): Promise<void> {
    try {
      await this.client.delete('/api/delete', { data: { name: modelName } });
      logger.info(`Model ${modelName} deleted successfully`);
    } catch (error) {
      logger.error(`Failed to delete model ${modelName}:`, error);
      throw new Error(`Failed to delete model ${modelName}`);
    }
  }

  async generateEmbeddings(model: string, prompt: string): Promise<number[]> {
    try {
      const response = await this.client.post('/api/embeddings', {
        model,
        prompt
      });
      return response.data.embedding;
    } catch (error) {
      logger.error('Embedding generation failed:', error);
      throw new Error('Failed to generate embeddings');
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.get('/api/tags', { timeout: 5000 });
      return true;
    } catch (error) {
      return false;
    }
  }

  private parseModelInfo(model: OllamaModel): ModelInfo {
    return {
      id: model.model,
      name: model.name,
      description: `${model.details.family} model with ${model.details.parameter_size}`,
      size: model.size,
      capabilities: this.detectCapabilities(model.model),
      parameters: model.details.parameter_size,
      family: model.details.family,
      quantization: model.details.quantization_level,
      recommendedFor: this.getRecommendedUses(model.model)
    };
  }

  private detectCapabilities(modelName: string): ModelCapabilities {
    const name = modelName.toLowerCase();
    
    return {
      chat: true, // Most models support chat
      code: name.includes('code') || name.includes('coder') || name.includes('starcoder') || name.includes('deepseek-coder'),
      reasoning: name.includes('reasoning') || name.includes('deepseek') || name.includes('qwen'),
      vision: name.includes('vision') || name.includes('llava') || name.includes('bakllava'),
      embedding: name.includes('embed') || name.includes('nomic-embed') || name.includes('all-minilm')
    };
  }

  private getRecommendedUses(modelName: string): string[] {
    const name = modelName.toLowerCase();
    const uses: string[] = ['general-chat'];
    
    if (name.includes('code') || name.includes('coder')) {
      uses.push('code-generation', 'code-review', 'debugging');
    }
    if (name.includes('reasoning') || name.includes('deepseek')) {
      uses.push('complex-reasoning', 'problem-solving', 'analysis');
    }
    if (name.includes('vision') || name.includes('llava')) {
      uses.push('image-analysis', 'visual-understanding');
    }
    if (name.includes('embed')) {
      uses.push('embeddings', 'semantic-search', 'rag');
    }
    
    return uses;
  }

  selectModelForTask(task: string, availableModels: string[]): string {
    const taskLower = task.toLowerCase();
    
    // Task-specific model selection
    if (taskLower.includes('code') || taskLower.includes('program')) {
      const codeModel = availableModels.find(m => 
        m.toLowerCase().includes('code') || m.toLowerCase().includes('coder')
      );
      if (codeModel) return codeModel;
    }
    
    if (taskLower.includes('reason') || taskLower.includes('analyze')) {
      const reasoningModel = availableModels.find(m => 
        m.toLowerCase().includes('reasoning') || m.toLowerCase().includes('deepseek')
      );
      if (reasoningModel) return reasoningModel;
    }
    
    if (taskLower.includes('embed') || taskLower.includes('vector')) {
      const embedModel = availableModels.find(m => 
        m.toLowerCase().includes('embed')
      );
      if (embedModel) return embedModel;
    }
    
    // Default to first available model (usually the best general model)
    return availableModels[0];
  }
}

export default new OllamaService();
