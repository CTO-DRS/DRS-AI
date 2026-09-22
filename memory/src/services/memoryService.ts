import { query } from '../utils/db';
import embeddingService from './embeddingService';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface Memory {
  id: string;
  userId: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, any>;
  source?: string;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  userId: string;
  title?: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export class MemoryService {
  // Initialize tables
  async initializeTables(): Promise<void> {
    try {
      // Memories table with vector support
      await query(`
        CREATE TABLE IF NOT EXISTS memories (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          content TEXT NOT NULL,
          embedding VECTOR(768),
          metadata JSONB,
          source VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create vector index
      await query(`
        CREATE INDEX IF NOT EXISTS memories_embedding_idx 
        ON memories USING ivfflat (embedding vector_cosine_ops)
      `);

      // Conversations table
      await query(`
        CREATE TABLE IF NOT EXISTS conversations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          title VARCHAR(500),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Messages table
      await query(`
        CREATE TABLE IF NOT EXISTS messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
          role VARCHAR(20) NOT NULL,
          content TEXT NOT NULL,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      logger.info('Memory tables initialized');
    } catch (error) {
      logger.error('Failed to initialize memory tables:', error);
      throw error;
    }
  }

  // Store memory with embedding
  async storeMemory(userId: string, content: string, metadata?: Record<string, any>, source?: string): Promise<Memory> {
    try {
      const embedding = await embeddingService.generateEmbedding(content);
      
      const result = await query(
        `INSERT INTO memories (id, user_id, content, embedding, metadata, source) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [uuidv4(), userId, content, JSON.stringify(embedding), JSON.stringify(metadata || {}), source]
      );

      return this.mapRowToMemory(result.rows[0]);
    } catch (error) {
      logger.error('Failed to store memory:', error);
      throw error;
    }
  }

  // Search memories by similarity
  async searchMemories(userId: string, query: string, limit: number = 5): Promise<Memory[]> {
    try {
      const embedding = await embeddingService.generateEmbedding(query);
      
      const result = await query(
        `SELECT id, user_id, content, metadata, source, created_at,
                1 - (embedding <=> $2::vector) as similarity
         FROM memories 
         WHERE user_id = $1
         ORDER BY embedding <=> $2::vector
         LIMIT $3`,
        [userId, JSON.stringify(embedding), limit]
      );

      return result.rows.map(row => this.mapRowToMemory(row));
    } catch (error) {
      logger.error('Failed to search memories:', error);
      throw error;
    }
  }

  // Get memories by user
  async getUserMemories(userId: string, limit: number = 50, offset: number = 0): Promise<Memory[]> {
    try {
      const result = await query(
        `SELECT * FROM memories 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return result.rows.map(row => this.mapRowToMemory(row));
    } catch (error) {
      logger.error('Failed to get user memories:', error);
      throw error;
    }
  }

  // Delete memory
  async deleteMemory(id: string, userId: string): Promise<boolean> {
    try {
      const result = await query(
        'DELETE FROM memories WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, userId]
      );
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Failed to delete memory:', error);
      throw error;
    }
  }

  // Create conversation
  async createConversation(userId: string, title?: string): Promise<Conversation> {
    try {
      const result = await query(
        `INSERT INTO conversations (id, user_id, title) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [uuidv4(), userId, title]
      );

      return this.mapRowToConversation(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create conversation:', error);
      throw error;
    }
  }

  // Add message to conversation
  async addMessage(conversationId: string, role: 'user' | 'assistant' | 'system', content: string, metadata?: Record<string, any>): Promise<Message> {
    try {
      const result = await query(
        `INSERT INTO messages (id, conversation_id, role, content, metadata) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [uuidv4(), conversationId, role, content, JSON.stringify(metadata || {})]
      );

      // Update conversation timestamp
      await query(
        'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [conversationId]
      );

      return this.mapRowToMessage(result.rows[0]);
    } catch (error) {
      logger.error('Failed to add message:', error);
      throw error;
    }
  }

  // Get conversation with messages
  async getConversation(conversationId: string, userId: string): Promise<Conversation | null> {
    try {
      const convResult = await query(
        'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
        [conversationId, userId]
      );

      if (convResult.rows.length === 0) return null;

      const messagesResult = await query(
        'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [conversationId]
      );

      const conversation = this.mapRowToConversation(convResult.rows[0]);
      conversation.messages = messagesResult.rows.map(row => this.mapRowToMessage(row));

      return conversation;
    } catch (error) {
      logger.error('Failed to get conversation:', error);
      throw error;
    }
  }

  // Get user conversations
  async getUserConversations(userId: string, limit: number = 20): Promise<Conversation[]> {
    try {
      const result = await query(
        `SELECT * FROM conversations 
         WHERE user_id = $1 
         ORDER BY updated_at DESC 
         LIMIT $2`,
        [userId, limit]
      );

      return result.rows.map(row => this.mapRowToConversation(row));
    } catch (error) {
      logger.error('Failed to get user conversations:', error);
      throw error;
    }
  }

  // Delete conversation
  async deleteConversation(id: string, userId: string): Promise<boolean> {
    try {
      const result = await query(
        'DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, userId]
      );
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Failed to delete conversation:', error);
      throw error;
    }
  }

  // RAG: Retrieve relevant context
  async getRelevantContext(userId: string, query: string, limit: number = 3): Promise<string[]> {
    try {
      const memories = await this.searchMemories(userId, query, limit);
      return memories.map(m => m.content);
    } catch (error) {
      logger.error('Failed to get relevant context:', error);
      return [];
    }
  }

  private mapRowToMemory(row: any): Memory {
    return {
      id: row.id,
      userId: row.user_id,
      content: row.content,
      embedding: row.embedding,
      metadata: row.metadata,
      source: row.source,
      createdAt: row.created_at
    };
  }

  private mapRowToConversation(row: any): Conversation {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      messages: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapRowToMessage(row: any): Message {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      metadata: row.metadata,
      createdAt: row.created_at
    };
  }
}

export default new MemoryService();
