/**
 * Full-text Search Service
 * Keyword-based search using PostgreSQL full-text search
 */

import { createLogger } from '../utils/logger';
import { Pool } from 'pg';
import { SearchResult, FullTextDocument } from '../models/types';

const logger = createLogger('FullTextSearchService');

export class FullTextSearchService {
  private db: Pool;
  private isInitialized: boolean = false;

  constructor() {
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

    logger.info('Initializing Full-text Search Service...');
    
    try {
      await this.initializeDatabase();
      this.isInitialized = true;
      logger.info('✅ Full-text Search Service initialized');
    } catch (error) {
      logger.error('Failed to initialize Full-text Search Service:', error);
      throw error;
    }
  }

  private async initializeDatabase(): Promise<void> {
    const client = await this.db.connect();
    
    try {
      // Create full-text search documents table
      await client.query(`
        CREATE TABLE IF NOT EXISTS fulltext_documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          content TEXT NOT NULL,
          content_tsv TSVECTOR,
          title VARCHAR(500),
          metadata JSONB DEFAULT '{}',
          tags TEXT[] DEFAULT '{}',
          source VARCHAR(255),
          source_type VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create GIN index for full-text search
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fulltext_documents_tsv 
        ON fulltext_documents USING GIN(content_tsv)
      `);

      // Create index for tags
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fulltext_documents_tags 
        ON fulltext_documents USING GIN(tags)
      `);

      // Create trigger for auto-updating TSVECTOR
      await client.query(`
        CREATE OR REPLACE FUNCTION update_fulltext_tsv()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.content_tsv := 
            setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'B') ||
            setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);

      await client.query(`
        DROP TRIGGER IF EXISTS trigger_update_fulltext_tsv ON fulltext_documents;
        CREATE TRIGGER trigger_update_fulltext_tsv
        BEFORE INSERT OR UPDATE ON fulltext_documents
        FOR EACH ROW
        EXECUTE FUNCTION update_fulltext_tsv()
      `);

      logger.info('✅ Full-text database schema initialized');
    } finally {
      client.release();
    }
  }

  async addDocument(doc: FullTextDocument): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }

    try {
      const result = await this.db.query(
        `INSERT INTO fulltext_documents 
         (content, title, metadata, tags, source, source_type)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          doc.content,
          doc.title,
          JSON.stringify(doc.metadata || {}),
          doc.tags || [],
          doc.source,
          doc.sourceType
        ]
      );

      logger.info(`✅ Full-text document added: ${result.rows[0].id}`);
      return result.rows[0].id;
    } catch (error) {
      logger.error('Failed to add document:', error);
      throw error;
    }
  }

  async addDocuments(docs: FullTextDocument[]): Promise<string[]> {
    const ids: string[] = [];
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      for (const doc of docs) {
        const result = await client.query(
          `INSERT INTO fulltext_documents 
           (content, title, metadata, tags, source, source_type)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            doc.content,
            doc.title,
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

    logger.info(`✅ Added ${ids.length} full-text documents`);
    return ids;
  }

  async search(
    query: string,
    options: {
      limit?: number;
      filter?: Record<string, any>;
      highlight?: boolean;
    } = {}
  ): Promise<SearchResult[]> {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }

    const { limit = 10, filter, highlight = true } = options;

    try {
      // Parse query for full-text search
      const parsedQuery = query
        .replace(/[^\w\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .map(term => term + ':*')
        .join(' & ');

      // Build filter clause
      let filterClause = '';
      const filterParams: any[] = [];
      
      if (filter) {
        const conditions: string[] = [];
        let paramIndex = 4;

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

      // Perform full-text search
      const highlightClause = highlight
        ? `ts_headline('english', content, plainto_tsquery('english', $1), 
            'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=10') as highlighted_content,`
        : '';

      const result = await this.db.query(
        `SELECT 
          id,
          content,
          ${highlightClause}
          title,
          metadata,
          tags,
          source,
          source_type,
          ts_rank_cd(content_tsv, plainto_tsquery('english', $1), 32) as rank
        FROM fulltext_documents
        WHERE content_tsv @@ plainto_tsquery('english', $1)
        ${filterClause}
        ORDER BY rank DESC
        LIMIT $2
        OFFSET $3`,
        [query, limit, 0, ...filterParams]
      );

      return result.rows.map(row => ({
        id: row.id,
        content: highlight && row.highlighted_content 
          ? row.highlighted_content 
          : row.content,
        title: row.title,
        metadata: row.metadata,
        tags: row.tags,
        source: row.source,
        sourceType: row.source_type,
        score: parseFloat(row.rank),
        searchType: 'fulltext'
      }));
    } catch (error) {
      logger.error('Full-text search failed:', error);
      throw error;
    }
  }

  async searchWithHighlight(
    query: string,
    options: {
      limit?: number;
      maxFragments?: number;
    } = {}
  ): Promise<Array<SearchResult & { fragments: string[] }>> {
    const { limit = 10, maxFragments = 3 } = options;

    try {
      const result = await this.db.query(
        `SELECT 
          id,
          content,
          title,
          metadata,
          tags,
          source,
          source_type,
          ts_rank_cd(content_tsv, plainto_tsquery('english', $1)) as rank,
          ts_headline('english', content, plainto_tsquery('english', $1),
            'MaxFragments=${maxFragments}, MaxWords=30, MinWords=10, 
             StartSel=<mark>, StopSel=</mark>') as fragments
        FROM fulltext_documents
        WHERE content_tsv @@ plainto_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT $2`,
        [query, limit]
      );

      return result.rows.map(row => ({
        id: row.id,
        content: row.content,
        title: row.title,
        metadata: row.metadata,
        tags: row.tags,
        source: row.source,
        sourceType: row.source_type,
        score: parseFloat(row.rank),
        searchType: 'fulltext',
        fragments: row.fragments.split('...').filter((f: string) => f.trim())
      }));
    } catch (error) {
      logger.error('Highlight search failed:', error);
      throw error;
    }
  }

  async updateDocument(
    id: string,
    updates: Partial<FullTextDocument>
  ): Promise<boolean> {
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.content !== undefined) {
        setClauses.push(`content = $${paramIndex++}`);
        values.push(updates.content);
      }

      if (updates.title !== undefined) {
        setClauses.push(`title = $${paramIndex++}`);
        values.push(updates.title);
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
        `UPDATE fulltext_documents 
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
        'DELETE FROM fulltext_documents WHERE id = $1 RETURNING id',
        [id]
      );

      return result.rowCount > 0;
    } catch (error) {
      logger.error('Failed to delete document:', error);
      throw error;
    }
  }

  async getStats(): Promise<{
    totalDocuments: number;
    avgDocumentLength: number;
  }> {
    try {
      const result = await this.db.query(`
        SELECT 
          COUNT(*) as total,
          AVG(LENGTH(content)) as avg_length
        FROM fulltext_documents
      `);

      return {
        totalDocuments: parseInt(result.rows[0].total),
        avgDocumentLength: parseFloat(result.rows[0].avg_length) || 0
      };
    } catch (error) {
      logger.error('Failed to get stats:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.db.end();
    logger.info('✅ Full-text Search Service closed');
  }
}
