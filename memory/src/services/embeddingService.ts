import axios from 'axios';
import logger from '../utils/logger';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';

export class EmbeddingService {
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
        model: EMBEDDING_MODEL,
        prompt: text
      });
      return response.data.embedding;
    } catch (error: any) {
      logger.error('Failed to generate embedding:', error);
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (const text of texts) {
      const embedding = await this.generateEmbedding(text);
      embeddings.push(embedding);
    }
    return embeddings;
  }
}

export default new EmbeddingService();
