import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import logger from '../utils/logger';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://gateway:3000/api/v1';

export class DRSApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: GATEWAY_URL,
      timeout: 300000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  setAuthToken(token: string) {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  async authenticate(username: string, password: string): Promise<string | null> {
    try {
      const response = await this.client.post('/auth/login', {
        email: username,
        password
      });
      
      const token = response.data.data.tokens.accessToken;
      this.setAuthToken(token);
      return token;
    } catch (error: any) {
      logger.error('Authentication failed:', error.message);
      return null;
    }
  }

  async sendChatMessage(message: string, model: string = 'llama3.2', conversationId?: string) {
    try {
      const response = await this.client.post('/chat', {
        model,
        messages: [{ role: 'user', content: message }],
        stream: false
      });
      
      return response.data.data.message?.content || 'No response';
    } catch (error: any) {
      logger.error('Chat failed:', error.message);
      throw error;
    }
  }

  async runAgent(agentId: string, input: string) {
    try {
      const response = await this.client.post('/tasks', {
        input,
        agentId,
        type: 'auto',
        priority: 'normal'
      });
      
      return response.data.data.task;
    } catch (error: any) {
      logger.error('Agent run failed:', error.message);
      throw error;
    }
  }

  async getTaskStatus(taskId: string) {
    try {
      const response = await this.client.get(`/tasks/${taskId}`);
      return response.data.data.task;
    } catch (error: any) {
      logger.error('Get task status failed:', error.message);
      throw error;
    }
  }

  async uploadAndAnalyzeFile(fileBuffer: Buffer, fileName: string, mimeType: string) {
    try {
      const formData = new FormData();
      formData.append('file', fileBuffer, { filename: fileName, contentType: mimeType });

      const response = await this.client.post('/files/upload', formData, {
        headers: formData.getHeaders()
      });

      return response.data.data;
    } catch (error: any) {
      logger.error('File upload failed:', error.message);
      throw error;
    }
  }

  async getModels() {
    try {
      const response = await this.client.get('/models');
      return response.data.data.models;
    } catch (error: any) {
      logger.error('Get models failed:', error.message);
      return [];
    }
  }

  async getAgents() {
    try {
      const response = await this.client.get('/agents');
      return response.data.data.agents;
    } catch (error: any) {
      logger.error('Get agents failed:', error.message);
      return [];
    }
  }
}

export default new DRSApiService();
