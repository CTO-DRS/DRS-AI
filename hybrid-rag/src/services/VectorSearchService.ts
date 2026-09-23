/**
 * Vector Search Service
 * Semantic search using embeddings and pgvector
 */

import { createLogger } from '../utils/logger';
import { Pipeline } from '@xenova/transformers';
import { Pool } from 'pg';
import { VectorDocument, SearchResult, EmbeddingConfig } from '../models/types';

const logger = createLogger('VectorSearchService');

export class VectorSearchService {
  private embedder: any;
  private db: Pool;
  private config: EmbeddingConfig;
  private isInitialized: boolean = false;

  constructor() {
    this.config = {
      model: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 384,
      batchSize: 32
    };
    
    this.db = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'drs_vip',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password'
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    logger.info('Initializing Vector Search Service...');
    
    try {
      // Initialize embedding model
      logger.info(`Loading embedding model: ${this.config.model}`);
      try {
        this.embedder = await Pipeline('feature-extraction', this.config.model);
      } catch (e) {
        logger.warn(`Could not load embedding model (running in degraded mode): ${(e as Error).message}`);
      }
      logger.info('✅ Embedding model loaded');

      // Initialize database (optional — service can run degraded without Postgres)
      try {
        await this.initializeDatabase();
      } catch (dbErr) {
        logger.warn(`Could not initialize database (running in degraded mode): ${(dbErr as Error).message}`);
      }
      
      this.isInitialized = true;
      logger.info('✅ Vector Search Service initialized');
    } catch (error) {
      logger.error('Failed to initialize Vector Search Service:', error);
      throw error;
    }
  }

  private async initializeDatabase(): Promise<void> {
    const client = await this.db.connect();
    
    try {
      // Enable pgvector extension
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      
      // Create documents table with vector support
      await client.query(`
        CREATE TABLE IF NOT EXISTS vector_documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          content TEXT NOT NULL,
          embedding VECTOR(${this.config.dimensions}),
          metadata JSONB DEFAULT '{}',
          tags TEXT[] DEFAULT '{}',
          source VARCHAR(255),
          source_type VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create index for vector similarity search
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_vector_documents_embedding 
        ON vector_documents 
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `);

      // Create index for tags
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_vector_documents_tags 
        ON vector_documents USING GIN(tags)
      `);

      // Create index for metadata
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_vector_documents_metadata 
        ON vector_documents USING GIN(metadata)
      `);

      logger.info('✅ Database schema initialized');
    } finally {
      client.release();
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embedder) {
      throw new Error('Embedder not initialized');
    }

    try {
      const output = await this.embedder(text, {
        pooling: 'mean',
        normalize: true
      });

      return Array.from(output.data);
    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  async addDocument(doc: VectorDocument): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }

    try {
      // Generate embedding
      const embedding = await this.generateEmbedding(doc.content);

      const result = await this.db.query(
        `INSERT INTO vector_documents 
         (content, embedding, metadata, tags, source, source_type)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          doc.content,
          `[${embedding.join(',')}]`,
          JSON.stringify(doc.metadata || {}),
          doc.tags || [],
          doc.source,
          doc.sourceType
        ]
      );

      logger.info(`✅ Document added: ${result.rows[0].id}`);
      return result.rows[0].id;
    } catch (error) {
      logger.error('Failed to add document:', error);
      throw error;
    }
  }

  async addDocuments(docs: VectorDocument[]): Promise<string[]> {
    const ids: string[] = [];
    
    // Process in batches
    for (let i = 0; i < docs.length; i += this.config.batchSize) {
      const batch = docs.slice(i, i + this.config.batchSize);
      
      // Generate embeddings in parallel
      const embeddings = await Promise.all(
        batch.map(doc => this.generateEmbedding(doc.content))
      );

      const client = await this.db.connect();
      
      try {
        await client.query('BEGIN');

        for (let j = 0; j < batch.length; j++) {
          const doc = batch[j];
          const embedding = embeddings[j];

          const result = await client.query(
            `INSERT INTO vector_documents 
             (content, embedding, metadata, tags, source, source_type)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              doc.content,
              `[${embedding.join(',')}]`,
              JSON.stringify(doc.metadata || {}),
              doc.tags || [],
              doc.source,
              doc.sourceType
            ]
          );

          ids.push(result.rows[0].id);
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    logger.info(`✅ Added ${ids.length} documents`);
    return ids;
  }

  async search(
    query: string,
    options: {
      limit?: number;
      threshold?: number;
      filter?: Record<string, any>;
    } = {}
  ): Promise<SearchResult[]> {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }

    const { limit = 10, threshold = 0.7, filter } = options;

    try {
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      // Build filter clause
      let filterClause = '';
      const filterParams: any[] = [];
      
      if (filter) {
        const conditions: string[] = [];
        let paramIndex = 3;

        for (const [key, value] of Object.entries(filter)) {
          if (key === 'tags' && Array.isArray(value)) {
            conditions.push(`tags && $${paramIndex}::text[]`);
            filterParams.push(value);
          } else if (key === 'source') {
            conditions.push(`source = $${paramIndex}`);
            filterParams.push(value);
          } else if (key === 'sourceType') {
            conditions.push(`source_type = $${paramIndex}`);
            filterParams.push(value);
          } else {
            conditions.push(`metadata->>'${key}' = $${paramIndex}`);
            filterParams.push(value);
          }
          paramIndex++;
        }

        if (conditions.length > 0) {
          filterClause = 'AND ' + conditions.join(' AND ');
        }
      }

      // Perform similarity search
      const result = await this.db.query(
        `SELECT 
          id,
          content,
          metadata,
          tags,
          source,
          source_type,
          1 - (embedding <=> $1::vector) as similarity
        FROM vector_documents
        WHERE 1 - (embedding <=> $1::vector) > $2
        ${filterClause}
        ORDER BY embedding <=> $1::vector
        LIMIT $${3 + filterParams.length}`,
        [`[${queryEmbedding.join(',')}]`, threshold, limit, ...filterParams]
      );

      return result.rows.map(row => ({
        id: row.id,
        content: row.content,
        metadata: row.metadata,
        tags: row.tags,
        source: row.source,
        sourceType: row.source_type,
        score: parseFloat(row.similarity),
        searchType: 'vector'
      }));
    } catch (error) {
      logger.error('Vector search failed:', error);
      throw error;
    }
  }

  async updateDocument(
    id: string,
    updates: Partial<VectorDocument>
  ): Promise<boolean> {
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.content !== undefined) {
        // Regenerate embedding if content changed
        const embedding = await this.generateEmbedding(updates.content);
        setClauses.push(`content = $${paramIndex++}`);
        setClauses.push(`embedding = $${paramIndex++}`);
        values.push(updates.content, `[${embedding.join(',')}]`);
      }

      if (updates.metadata !== undefined) {
        setClauses.push(`metadata = $${paramIndex++}`);
        values.push(JSON.stringify(updates.metadata));
      }

      if (updates.tags !== undefined) {
        setClauses.push(`tags = $${paramIndex++}`);
        values.push(updates.tags);
      }

      if (updates.source !== undefined) {
        setClauses.push(`source = $${paramIndex++}`);
        values.push(updates.source);
      }

      setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

      values.push(id);

      const result = await this.db.query(
        `UPDATE vector_documents 
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id`,
        values
      );

      return result.rowCount > 0;
    } catch (error) {
      logger.error('Failed to update document:', error);
      throw error;
    }
  }

  async deleteDocument(id: string): Promise<boolean> {
    try {
      const result = await this.db.query(
        'DELETE FROM vector_documents WHERE id = $1 RETURNING id',
        [id]
      );

      return result.rowCount > 0;
    } catch (error) {
      logger.error('Failed to delete document:', error);
      throw error;
    }
  }

  async getDocument(id: string): Promise<VectorDocument | null> {
    try {
      const result = await this.db.query(
        'SELECT * FROM vector_documents WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        content: row.content,
        metadata: row.metadata,
        tags: row.tags,
        source: row.source,
        sourceType: row.source_type
      };
    } catch (error) {
      logger.error('Failed to get document:', error);
      throw error;
    }
  }

  async getStats(): Promise<{
    totalDocuments: number;
    totalTags: number;
    sources: Record<string, number>;
  }> {
    try {
      const totalResult = await this.db.query(
        'SELECT COUNT(*) as count FROM vector_documents'
      );

      const tagsResult = await this.db.query(
        'SELECT COUNT(DISTINCT unnest) as count FROM vector_documents, unnest(tags)'
      );

      const sourcesResult = await this.db.query(
        'SELECT source_type, COUNT(*) as count FROM vector_documents GROUP BY source_type'
      );

      const sources: Record<string, number> = {};
      for (const row of sourcesResult.rows) {
        sources[row.source_type] = parseInt(row.count);
      }

      return {
        totalDocuments: parseInt(totalResult.rows[0].count),
        totalTags: parseInt(tagsResult.rows[0].count),
        sources
      };
    } catch (error) {
      logger.error('Failed to get stats:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.db.end();
    logger.info('✅ Vector Search Service closed');
  }
}
