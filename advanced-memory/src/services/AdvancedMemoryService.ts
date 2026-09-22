import { Pool } from 'pg';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import natural from 'natural';
import compromise from 'compromise';
import _ from 'lodash';
import moment from 'moment';
import {
  MemoryEntry,
  MemoryType,
  MemoryMetadata,
  RAGQuery,
  RAGResult,
  RAGOptions,
  MemoryFilters,
  ContextCompressionOptions,
  KnowledgeGraph,
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
  MemorySummary,
  SearchResult,
  HierarchicalMemory,
  MultiModalMemory
} from '../types';
import { Logger } from '../utils/logger';

export class AdvancedMemoryService {
  private pgPool: Pool;
  private redis: Redis;
  private logger: Logger;
  private tokenizer: natural.WordTokenizer;
  private tfidf: natural.TfIdf;

  constructor() {
    this.pgPool = new Pool({
      host: process.env.POSTGRES_HOST || 'postgres',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'drs_ai',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password'
    });

    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379')
    });

    this.logger = new Logger('AdvancedMemoryService');
    this.tokenizer = new natural.WordTokenizer();
    this.tfidf = new natural.TfIdf();
  }

  async initialize(): Promise<void> {
    await this.setupDatabase();
    this.logger.info('Advanced Memory Service initialized');
  }

  private async setupDatabase(): Promise<void> {
    const client = await this.pgPool.connect();
    try {
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS vector;
        
        CREATE TABLE IF NOT EXISTS memories (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(255) NOT NULL,
          session_id VARCHAR(255),
          type VARCHAR(50) NOT NULL,
          content TEXT NOT NULL,
          embedding VECTOR(1536),
          metadata JSONB DEFAULT '{}',
          importance FLOAT DEFAULT 0.5,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP,
          access_count INTEGER DEFAULT 0,
          last_accessed_at TIMESTAMP,
          parent_id UUID REFERENCES memories(id),
          level INTEGER DEFAULT 0,
          summary TEXT
        );
        
        CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
        CREATE INDEX IF NOT EXISTS idx_memories_session_id ON memories(session_id);
        CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
        CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
        CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops);
        
        CREATE TABLE IF NOT EXISTS knowledge_graph_nodes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
          label VARCHAR(255) NOT NULL,
          type VARCHAR(100) NOT NULL,
          properties JSONB DEFAULT '{}',
          embedding VECTOR(1536),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          source_id UUID REFERENCES knowledge_graph_nodes(id) ON DELETE CASCADE,
          target_id UUID REFERENCES knowledge_graph_nodes(id) ON DELETE CASCADE,
          label VARCHAR(255) NOT NULL,
          weight FLOAT DEFAULT 1.0,
          properties JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS memory_summaries (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(255) NOT NULL,
          summary TEXT NOT NULL,
          key_points JSONB DEFAULT '[]',
          entities JSONB DEFAULT '[]',
          topics JSONB DEFAULT '[]',
          time_range_start TIMESTAMP,
          time_range_end TIMESTAMP,
          memory_count INTEGER,
          generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_kg_nodes_memory_id ON knowledge_graph_nodes(memory_id);
        CREATE INDEX IF NOT EXISTS idx_kg_edges_source ON knowledge_graph_edges(source_id);
        CREATE INDEX IF NOT EXISTS idx_kg_edges_target ON knowledge_graph_edges(target_id);
      `);
    } finally {
      client.release();
    }
  }

  async storeMemory(
    userId: string,
    content: string,
    type: MemoryType = MemoryType.SHORT_TERM,
    metadata: Partial<MemoryMetadata> = {},
    options: {
      sessionId?: string;
      importance?: number;
      ttl?: number;
      embedding?: number[];
      parentId?: string;
    } = {}
  ): Promise<MemoryEntry> {
    const id = uuidv4();
    const importance = options.importance || this.calculateImportance(content);
    const expiresAt = options.ttl
      ? moment().add(options.ttl, 'seconds').toDate()
      : this.getDefaultExpiration(type);

    const enrichedMetadata = await this.enrichMetadata(content, metadata);

    const memory: MemoryEntry = {
      id,
      userId,
      sessionId: options.sessionId,
      type,
      content,
      embedding: options.embedding,
      metadata: enrichedMetadata,
      importance,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt,
      accessCount: 0
    };

    const client = await this.pgPool.connect();
    try {
      await client.query(
        `INSERT INTO memories (id, user_id, session_id, type, content, embedding, metadata, importance, expires_at, parent_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          memory.id,
          memory.userId,
          memory.sessionId,
          memory.type,
          memory.content,
          memory.embedding ? `[${memory.embedding.join(',')}]` : null,
          JSON.stringify(memory.metadata),
          memory.importance,
          memory.expiresAt,
          options.parentId || null
        ]
      );

      // Cache in Redis for fast access
      await this.cacheMemory(memory);

      // Extract and store knowledge graph entities
      await this.extractKnowledgeGraph(memory);

      this.logger.info(`Memory stored: ${id} for user: ${userId}`);
      return memory;
    } finally {
      client.release();
    }
  }

  async retrieveWithRAG(query: RAGQuery): Promise<RAGResult> {
    const startTime = Date.now();
    const options: RAGOptions = {
      topK: 10,
      minSimilarity: 0.7,
      includeMetadata: true,
      rerank: true,
      contextWindow: 4000,
      compressionEnabled: true,
      hierarchicalSearch: true,
      ...query.options
    };

    let memories: MemoryEntry[] = [];
    let similarityScores: number[] = [];

    // Step 1: Get query embedding from Ollama
    const queryEmbedding = await this.getEmbedding(query.query);

    // Step 2: Vector similarity search
    const vectorResults = await this.vectorSearch(
      queryEmbedding,
      query.userId,
      query.filters,
      options.topK! * 2
    );

    memories = vectorResults.map(r => r.memory);
    similarityScores = vectorResults.map(r => r.score);

    // Step 3: Hierarchical search if enabled
    if (options.hierarchicalSearch) {
      const hierarchicalMemories = await this.hierarchicalSearch(memories);
      memories = this.mergeHierarchicalResults(memories, hierarchicalMemories);
    }

    // Step 4: Keyword search for hybrid retrieval
    const keywordResults = await this.keywordSearch(
      query.query,
      query.userId,
      query.filters,
      options.topK!
    );

    // Step 5: Fusion of vector and keyword results (Reciprocal Rank Fusion)
    memories = this.reciprocalRankFusion(vectorResults, keywordResults, options.topK!);

    // Step 6: Re-ranking if enabled
    if (options.rerank) {
      const reranked = await this.rerankResults(query.query, memories);
      memories = reranked.map(r => r.memory);
      similarityScores = reranked.map(r => r.score);
    }

    // Step 7: Context compression if enabled
    let context = '';
    if (options.compressionEnabled) {
      context = await this.compressContext(
        memories,
        query.query,
        { maxTokens: options.contextWindow!, strategy: 'semantic' }
      );
    } else {
      context = memories.map(m => m.content).join('\n\n');
    }

    // Step 8: Update access statistics
    await this.updateAccessStats(memories.map(m => m.id));

    const processingTime = Date.now() - startTime;

    this.logger.info(`RAG query processed in ${processingTime}ms, found ${memories.length} memories`);

    return {
      memories,
      context,
      query: query.query,
      processingTime,
      totalResults: memories.length,
      similarityScores,
      aggregatedContext: context
    };
  }

  async compressContext(
    memories: MemoryEntry[],
    query: string,
    options: ContextCompressionOptions
  ): Promise<string> {
    const { maxTokens, strategy, preserveRecent = true, recentWindow = 3 } = options;

    let processedMemories = [...memories];

    // Preserve recent memories if requested
    if (preserveRecent && memories.length > recentWindow) {
      const recent = memories.slice(-recentWindow);
      const older = memories.slice(0, -recentWindow);
      processedMemories = [...older, ...recent];
    }

    switch (strategy) {
      case 'truncate':
        return this.truncateContext(processedMemories, maxTokens);

      case 'summarize':
        return this.summarizeContext(processedMemories, query, maxTokens);

      case 'hierarchical':
        return this.hierarchicalContext(processedMemories, query, maxTokens);

      case 'semantic':
        return this.semanticCompression(processedMemories, query, maxTokens);

      default:
        return this.truncateContext(processedMemories, maxTokens);
    }
  }

  private truncateContext(memories: MemoryEntry[], maxTokens: number): string {
    let currentTokens = 0;
    const selected: string[] = [];

    for (const memory of memories) {
      const tokens = this.estimateTokens(memory.content);
      if (currentTokens + tokens > maxTokens) break;
      selected.push(memory.content);
      currentTokens += tokens;
    }

    return selected.join('\n\n');
  }

  private async summarizeContext(
    memories: MemoryEntry[],
    query: string,
    maxTokens: number
  ): Promise<string> {
    // Group related memories
    const groups = this.groupRelatedMemories(memories);
    
    const summaries: string[] = [];
    for (const group of groups) {
      const combined = group.map(m => m.content).join(' ');
      const summary = await this.generateSummary(combined, query);
      summaries.push(summary);
    }

    return summaries.join('\n\n');
  }

  private async hierarchicalContext(
    memories: MemoryEntry[],
    query: string,
    maxTokens: number
  ): Promise<string> {
    // Build hierarchical structure
    const hierarchy = await this.buildHierarchy(memories);
    
    // Select most relevant levels
    const selectedNodes: string[] = [];
    let currentTokens = 0;

    for (const level of hierarchy) {
      if (level.summary) {
        const tokens = this.estimateTokens(level.summary);
        if (currentTokens + tokens <= maxTokens) {
          selectedNodes.push(level.summary);
          currentTokens += tokens;
        }
      }
    }

    return selectedNodes.join('\n\n');
  }

  private async semanticCompression(
    memories: MemoryEntry[],
    query: string,
    maxTokens: number
  ): Promise<string> {
    // Get query embedding
    const queryEmbedding = await this.getEmbedding(query);

    // Score each memory by semantic relevance
    const scored = await Promise.all(
      memories.map(async (memory) => {
        if (!memory.embedding) {
          memory.embedding = await this.getEmbedding(memory.content);
        }
        const similarity = this.cosineSimilarity(queryEmbedding, memory.embedding);
        return { memory, score: similarity };
      })
    );

    // Sort by relevance and select top memories
    scored.sort((a, b) => b.score - a.score);

    let currentTokens = 0;
    const selected: string[] = [];

    for (const { memory } of scored) {
      const tokens = this.estimateTokens(memory.content);
      if (currentTokens + tokens > maxTokens) break;
      selected.push(memory.content);
      currentTokens += tokens;
    }

    return selected.join('\n\n');
  }

  async generateSummary(
    userId: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<MemorySummary> {
    const client = await this.pgPool.connect();
    try {
      let query = 'SELECT * FROM memories WHERE user_id = $1';
      const params: any[] = [userId];

      if (timeRange) {
        query += ' AND created_at BETWEEN $2 AND $3';
        params.push(timeRange.start, timeRange.end);
      }

      query += ' ORDER BY created_at DESC LIMIT 100';

      const result = await client.query(query, params);
      const memories = result.rows.map(row => this.rowToMemory(row));

      if (memories.length === 0) {
        return {
          userId,
          summary: 'No memories found for the specified time range.',
          keyPoints: [],
          entities: [],
          topics: [],
          timeRange: timeRange || { start: new Date(), end: new Date() },
          memoryCount: 0,
          generatedAt: new Date()
        };
      }

      // Extract key information
      const allContent = memories.map(m => m.content).join(' ');
      const doc = compromise(allContent);

      const keyPoints = this.extractKeyPoints(memories);
      const entities = doc.people().out('array')
        .concat(doc.places().out('array'))
        .concat(doc.organizations().out('array'));
      const topics = doc.topics().out('array');

      // Generate summary using Ollama
      const summary = await this.generateSummaryWithLLM(allContent);

      const memorySummary: MemorySummary = {
        userId,
        summary,
        keyPoints,
        entities: [...new Set(entities)],
        topics: [...new Set(topics)],
        timeRange: timeRange || {
          start: memories[memories.length - 1].createdAt,
          end: memories[0].createdAt
        },
        memoryCount: memories.length,
        generatedAt: new Date()
      };

      // Store summary
      await client.query(
        `INSERT INTO memory_summaries 
         (user_id, summary, key_points, entities, topics, time_range_start, time_range_end, memory_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          summary,
          JSON.stringify(keyPoints),
          JSON.stringify(memorySummary.entities),
          JSON.stringify(memorySummary.topics),
          memorySummary.timeRange.start,
          memorySummary.timeRange.end,
          memoryCount
        ]
      );

      return memorySummary;
    } finally {
      client.release();
    }
  }

  async getKnowledgeGraph(userId: string): Promise<KnowledgeGraph> {
    const client = await this.pgPool.connect();
    try {
      const nodesResult = await client.query(
        `SELECT n.* FROM knowledge_graph_nodes n
         JOIN memories m ON n.memory_id = m.id
         WHERE m.user_id = $1`,
        [userId]
      );

      const edgesResult = await client.query(
        `SELECT e.* FROM knowledge_graph_edges e
         JOIN knowledge_graph_nodes n ON e.source_id = n.id
         JOIN memories m ON n.memory_id = m.id
         WHERE m.user_id = $1`,
        [userId]
      );

      const nodes: KnowledgeGraphNode[] = nodesResult.rows.map(row => ({
        id: row.id,
        label: row.label,
        type: row.type,
        properties: row.properties,
        embedding: row.embedding
      }));

      const edges: KnowledgeGraphEdge[] = edgesResult.rows.map(row => ({
        id: row.id,
        source: row.source_id,
        target: row.target_id,
        label: row.label,
        weight: row.weight,
        properties: row.properties
      }));

      return { nodes, edges };
    } finally {
      client.release();
    }
  }

  async consolidateMemories(userId: string): Promise<void> {
    this.logger.info(`Starting memory consolidation for user: ${userId}`);

    // Get old short-term memories
    const client = await this.pgPool.connect();
    try {
      const oldMemories = await client.query(
        `SELECT * FROM memories 
         WHERE user_id = $1 
         AND type = $2 
         AND created_at < NOW() - INTERVAL '24 hours'
         ORDER BY importance DESC`,
        [userId, MemoryType.SHORT_TERM]
      );

      const memories = oldMemories.rows.map(row => this.rowToMemory(row));

      // Group similar memories
      const groups = this.clusterMemories(memories);

      for (const group of groups) {
        if (group.length > 1) {
          // Merge similar memories into long-term
          const merged = await this.mergeMemories(group);
          await this.storeMemory(userId, merged.content, MemoryType.LONG_TERM, merged.metadata);

          // Mark original memories as consolidated
          for (const memory of group) {
            await client.query(
              'UPDATE memories SET type = $1 WHERE id = $2',
              [MemoryType.EPISODIC, memory.id]
            );
          }
        }
      }

      this.logger.info(`Memory consolidation completed for user: ${userId}`);
    } finally {
      client.release();
    }
  }

  // Private helper methods

  private async getEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch('http://ollama:11434/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nomic-embed-text',
          prompt: text
        })
      });

      const data = await response.json();
      return data.embedding;
    } catch (error) {
      this.logger.error('Failed to get embedding:', error);
      return new Array(1536).fill(0);
    }
  }

  private async vectorSearch(
    embedding: number[],
    userId: string,
    filters?: MemoryFilters,
    limit: number = 10
  ): Promise<SearchResult[]> {
    const client = await this.pgPool.connect();
    try {
      let query = `
        SELECT *, embedding <=> $1 as distance
        FROM memories
        WHERE user_id = $2
      `;
      const params: any[] = [`[${embedding.join(',')}]`, userId];
      let paramIndex = 3;

      if (filters?.types?.length) {
        query += ` AND type = ANY($${paramIndex})`;
        params.push(filters.types);
        paramIndex++;
      }

      if (filters?.minImportance) {
        query += ` AND importance >= $${paramIndex}`;
        params.push(filters.minImportance);
        paramIndex++;
      }

      query += ` ORDER BY embedding <=> $1 LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await client.query(query, params);

      return result.rows.map((row, index) => ({
        memory: this.rowToMemory(row),
        score: 1 - row.distance,
        rank: index + 1
      }));
    } finally {
      client.release();
    }
  }

  private async keywordSearch(
    query: string,
    userId: string,
    filters?: MemoryFilters,
    limit: number = 10
  ): Promise<SearchResult[]> {
    const client = await this.pgPool.connect();
    try {
      const tokens = this.tokenizer.tokenize(query.toLowerCase());
      const tsQuery = tokens.join(' | ');

      let sql = `
        SELECT *, ts_rank(to_tsvector('english', content), to_tsquery($1)) as rank
        FROM memories
        WHERE user_id = $2
        AND to_tsvector('english', content) @@ to_tsquery($1)
      `;
      const params: any[] = [tsQuery, userId];
      let paramIndex = 3;

      if (filters?.types?.length) {
        sql += ` AND type = ANY($${paramIndex})`;
        params.push(filters.types);
        paramIndex++;
      }

      sql += ` ORDER BY rank DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await client.query(sql, params);

      return result.rows.map((row, index) => ({
        memory: this.rowToMemory(row),
        score: row.rank,
        rank: index + 1
      }));
    } finally {
      client.release();
    }
  }

  private reciprocalRankFusion(
    vectorResults: SearchResult[],
    keywordResults: SearchResult[],
    k: number = 60
  ): MemoryEntry[] {
    const scores = new Map<string, number>();

    // Vector results
    for (const result of vectorResults) {
      const rrfScore = 1 / (k + result.rank);
      scores.set(result.memory.id, (scores.get(result.memory.id) || 0) + rrfScore);
    }

    // Keyword results
    for (const result of keywordResults) {
      const rrfScore = 1 / (k + result.rank);
      scores.set(result.memory.id, (scores.get(result.memory.id) || 0) + rrfScore);
    }

    // Combine and sort
    const allMemories = [...vectorResults, ...keywordResults];
    const uniqueMemories = _.uniqBy(allMemories, r => r.memory.id);

    uniqueMemories.sort((a, b) => {
      const scoreA = scores.get(a.memory.id) || 0;
      const scoreB = scores.get(b.memory.id) || 0;
      return scoreB - scoreA;
    });

    return uniqueMemories.slice(0, 10).map(r => r.memory);
  }

  private async rerankResults(
    query: string,
    memories: MemoryEntry[]
  ): Promise<SearchResult[]> {
    const queryEmbedding = await this.getEmbedding(query);

    const scored = await Promise.all(
      memories.map(async (memory, index) => {
        if (!memory.embedding) {
          memory.embedding = await this.getEmbedding(memory.content);
        }
        const similarity = this.cosineSimilarity(queryEmbedding, memory.embedding);
        return { memory, score: similarity, rank: index + 1 };
      })
    );

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  private async hierarchicalSearch(memories: MemoryEntry[]): Promise<MemoryEntry[]> {
    const client = await this.pgPool.connect();
    try {
      const additional: MemoryEntry[] = [];

      for (const memory of memories) {
        // Get parent memory
        if (memory.metadata?.relatedMemories) {
          const relatedIds = memory.metadata.relatedMemories;
          const result = await client.query(
            'SELECT * FROM memories WHERE id = ANY($1)',
            [relatedIds]
          );
          additional.push(...result.rows.map(row => this.rowToMemory(row)));
        }

        // Get child memories
        const childrenResult = await client.query(
          'SELECT * FROM memories WHERE parent_id = $1',
          [memory.id]
        );
        additional.push(...childrenResult.rows.map(row => this.rowToMemory(row)));
      }

      return additional;
    } finally {
      client.release();
    }
  }

  private mergeHierarchicalResults(
    primary: MemoryEntry[],
    hierarchical: MemoryEntry[]
  ): MemoryEntry[] {
    const combined = [...primary, ...hierarchical];
    return _.uniqBy(combined, m => m.id);
  }

  private async extractKnowledgeGraph(memory: MemoryEntry): Promise<void> {
    const doc = compromise(memory.content);

    const people = doc.people().out('array');
    const places = doc.places().out('array');
    const organizations = doc.organizations().out('array');
    const nouns = doc.nouns().out('array');

    const client = await this.pgPool.connect();
    try {
      // Store entities as nodes
      for (const person of people) {
        await this.createNode(client, memory.id, person, 'person', { source: 'compromise' });
      }

      for (const place of places) {
        await this.createNode(client, memory.id, place, 'place', { source: 'compromise' });
      }

      for (const org of organizations) {
        await this.createNode(client, memory.id, org, 'organization', { source: 'compromise' });
      }

      // Create relationships between entities
      await this.createEntityRelationships(client, memory.id, [...people, ...places, ...organizations]);
    } finally {
      client.release();
    }
  }

  private async createNode(
    client: any,
    memoryId: string,
    label: string,
    type: string,
    properties: Record<string, any>
  ): Promise<void> {
    const embedding = await this.getEmbedding(label);

    await client.query(
      `INSERT INTO knowledge_graph_nodes (memory_id, label, type, properties, embedding)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [memoryId, label, type, JSON.stringify(properties), `[${embedding.join(',')}]`]
    );
  }

  private async createEntityRelationships(
    client: any,
    memoryId: string,
    entities: string[]
  ): Promise<void> {
    // Create co-occurrence edges
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const source = entities[i];
        const target = entities[j];

        await client.query(
          `INSERT INTO knowledge_graph_edges (source_id, target_id, label, weight)
           SELECT 
             (SELECT id FROM knowledge_graph_nodes WHERE label = $1 AND memory_id = $3),
             (SELECT id FROM knowledge_graph_nodes WHERE label = $2 AND memory_id = $3),
             'co-occurs_with',
             1.0
           ON CONFLICT DO NOTHING`,
          [source, target, memoryId]
        );
      }
    }
  }

  private async enrichMetadata(
    content: string,
    metadata: Partial<MemoryMetadata>
  ): Promise<MemoryMetadata> {
    const doc = compromise(content);

    return {
      source: metadata.source || 'unknown',
      tags: metadata.tags || [],
      category: metadata.category || 'general',
      entities: [
        ...(metadata.entities || []),
        ...doc.people().out('array'),
        ...doc.places().out('array')
      ],
      sentiment: this.analyzeSentiment(content),
      language: this.detectLanguage(content),
      confidence: metadata.confidence || 1.0,
      relatedMemories: metadata.relatedMemories || [],
      customFields: metadata.customFields || {}
    };
  }

  private calculateImportance(content: string): number {
    const factors = {
      length: Math.min(content.length / 1000, 1),
      entities: (content.match(/\b[A-Z][a-z]+\b/g) || []).length / 10,
      numbers: (content.match(/\d+/g) || []).length / 5,
      uniqueness: this.tfidf.documents.length > 0 ? this.calculateUniqueness(content) : 0.5
    };

    return Math.min(
      (factors.length * 0.2 + factors.entities * 0.3 + factors.numbers * 0.2 + factors.uniqueness * 0.3),
      1
    );
  }

  private calculateUniqueness(content: string): number {
    this.tfidf.addDocument(content);
    const terms = this.tokenizer.tokenize(content);
    let totalTfidf = 0;

    terms.forEach(term => {
      this.tfidf.tfidfs(term, (i, measure) => {
        totalTfidf += measure;
      });
    });

    return Math.min(totalTfidf / terms.length, 1);
  }

  private analyzeSentiment(content: string): number {
    const analyzer = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
    const tokens = this.tokenizer.tokenize(content);
    return analyzer.getSentiment(tokens);
  }

  private detectLanguage(content: string): string {
    // Simple language detection based on character patterns
    if (/[\u0600-\u06FF]/.test(content)) return 'ar';
    if (/[\u4E00-\u9FFF]/.test(content)) return 'zh';
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(content)) return 'ja';
    return 'en';
  }

  private getDefaultExpiration(type: MemoryType): Date {
    const durations: Record<MemoryType, number> = {
      [MemoryType.SHORT_TERM]: 24 * 60 * 60, // 24 hours
      [MemoryType.LONG_TERM]: 365 * 24 * 60 * 60, // 1 year
      [MemoryType.EPISODIC]: 30 * 24 * 60 * 60, // 30 days
      [MemoryType.SEMANTIC]: 365 * 24 * 60 * 60, // 1 year
      [MemoryType.PROCEDURAL]: 180 * 24 * 60 * 60, // 6 months
      [MemoryType.CONVERSATION]: 7 * 24 * 60 * 60, // 7 days
      [MemoryType.DOCUMENT]: 90 * 24 * 60 * 60, // 90 days
      [MemoryType.MULTIMODAL]: 30 * 24 * 60 * 60 // 30 days
    };

    return moment().add(durations[type] || 86400, 'seconds').toDate();
  }

  private async cacheMemory(memory: MemoryEntry): Promise<void> {
    const cacheKey = `memory:${memory.id}`;
    await this.redis.setex(cacheKey, 3600, JSON.stringify(memory));

    // Also cache in user's memory index
    await this.redis.zadd(
      `user_memories:${memory.userId}`,
      memory.createdAt.getTime(),
      memory.id
    );
  }

  private async updateAccessStats(memoryIds: string[]): Promise<void> {
    const client = await this.pgPool.connect();
    try {
      for (const id of memoryIds) {
        await client.query(
          `UPDATE memories 
           SET access_count = access_count + 1, last_accessed_at = NOW()
           WHERE id = $1`,
          [id]
        );
      }
    } finally {
      client.release();
    }
  }

  private extractKeyPoints(memories: MemoryEntry[]): string[] {
    const allContent = memories.map(m => m.content).join(' ');
    const sentences = allContent.match(/[^.!?]+[.!?]+/g) || [];

    // Score sentences by importance
    const scored = sentences.map(sentence => ({
      sentence: sentence.trim(),
      score: this.scoreSentence(sentence, memories)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 5).map(s => s.sentence);
  }

  private scoreSentence(sentence: string, memories: MemoryEntry[]): number {
    let score = 0;

    // Length factor
    score += Math.min(sentence.length / 100, 1);

    // Entity presence
    const doc = compromise(sentence);
    score += doc.people().length * 0.5;
    score += doc.places().length * 0.5;

    // Number presence
    score += (sentence.match(/\d+/g) || []).length * 0.3;

    // Recency factor
    const recentMemory = memories.find(m => m.content.includes(sentence));
    if (recentMemory) {
      const age = Date.now() - recentMemory.createdAt.getTime();
      score += Math.max(0, 1 - age / (7 * 24 * 60 * 60 * 1000));
    }

    return score;
  }

  private async generateSummaryWithLLM(content: string): Promise<string> {
    try {
      const response = await fetch('http://ollama:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2:3b',
          prompt: `Summarize the following content in 2-3 sentences:\n\n${content.substring(0, 4000)}`,
          stream: false
        })
      });

      const data = await response.json();
      return data.response;
    } catch (error) {
      this.logger.error('Failed to generate summary:', error);
      return content.substring(0, 200) + '...';
    }
  }

  private groupRelatedMemories(memories: MemoryEntry[]): MemoryEntry[][] {
    const groups: MemoryEntry[][] = [];
    const used = new Set<string>();

    for (const memory of memories) {
      if (used.has(memory.id)) continue;

      const group = [memory];
      used.add(memory.id);

      for (const other of memories) {
        if (used.has(other.id)) continue;

        const similarity = this.calculateTextSimilarity(memory.content, other.content);
        if (similarity > 0.6) {
          group.push(other);
          used.add(other.id);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    const tokens1 = new Set(this.tokenizer.tokenize(text1.toLowerCase()));
    const tokens2 = new Set(this.tokenizer.tokenize(text2.toLowerCase()));

    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  private clusterMemories(memories: MemoryEntry[]): MemoryEntry[][] {
    // Simple clustering based on content similarity
    return this.groupRelatedMemories(memories);
  }

  private async mergeMemories(memories: MemoryEntry[]): Promise<{
    content: string;
    metadata: MemoryMetadata;
  }> {
    const combined = memories.map(m => m.content).join(' ');
    const summary = await this.generateSummaryWithLLM(combined);

    const allTags = memories.flatMap(m => m.metadata.tags || []);
    const allEntities = memories.flatMap(m => m.metadata.entities || []);

    return {
      content: summary,
      metadata: {
        source: 'consolidated',
        tags: [...new Set(allTags)],
        entities: [...new Set(allEntities)],
        confidence: 0.9
      }
    };
  }

  private async buildHierarchy(memories: MemoryEntry[]): Promise<HierarchicalMemory[]> {
    const levels: Map<number, HierarchicalMemory> = new Map();

    for (const memory of memories) {
      const level = memory.metadata?.customFields?.level || 0;

      if (!levels.has(level)) {
        levels.set(level, {
          level,
          childrenIds: [],
          memories: []
        });
      }

      levels.get(level)!.memories.push(memory);

      if (memory.metadata?.relatedMemories) {
        levels.get(level)!.childrenIds.push(...memory.metadata.relatedMemories);
      }
    }

    return Array.from(levels.values()).sort((a, b) => a.level - b.level);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  private rowToMemory(row: any): MemoryEntry {
    return {
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      type: row.type as MemoryType,
      content: row.content,
      embedding: row.embedding,
      metadata: row.metadata,
      importance: row.importance,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      accessCount: row.access_count,
      lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : undefined
    };
  }

  async cleanupExpiredMemories(): Promise<number> {
    const client = await this.pgPool.connect();
    try {
      const result = await client.query(
        `DELETE FROM memories 
         WHERE expires_at < NOW() 
         AND type = $1
         RETURNING id`,
        [MemoryType.SHORT_TERM]
      );

      this.logger.info(`Cleaned up ${result.rowCount} expired memories`);
      return result.rowCount;
    } finally {
      client.release();
    }
  }
}
