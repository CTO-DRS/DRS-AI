/**
 * Type Definitions for Hybrid RAG Engine
 */

export interface VectorDocument {
  id?: string;
  content: string;
  metadata?: Record<string, any>;
  tags?: string[];
  source?: string;
  sourceType?: string;
}

export interface FullTextDocument {
  id?: string;
  content: string;
  title?: string;
  metadata?: Record<string, any>;
  tags?: string[];
  source?: string;
  sourceType?: string;
}

export interface SearchResult {
  id: string;
  content: string;
  title?: string;
  metadata?: Record<string, any>;
  tags?: string[];
  source?: string;
  sourceType?: string;
  score: number;
  searchType: 'vector' | 'fulltext' | 'hybrid';
}

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  batchSize: number;
}

export interface RRFConfig {
  k: number;
  vectorWeight: number;
  fulltextWeight: number;
  minScore: number;
}

export interface HybridSearchOptions {
  limit?: number;
  vectorLimit?: number;
  fulltextLimit?: number;
  filter?: Record<string, any>;
  useRRF?: boolean;
}

export interface DocumentChunk {
  index: number;
  content: string;
  charPosition: number;
  wordCount: number;
}

export interface ProcessedDocument {
  title?: string;
  content: string;
  chunks: DocumentChunk[];
  summary: string;
  metadata: Record<string, any>;
}

export interface ProcessingOptions {
  title?: string;
  source?: string;
  sourceType?: string;
  metadata?: Record<string, any>;
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface TagCategory {
  name: string;
  keywords: string[];
  patterns: RegExp[];
  weight: number;
}

export interface TaggingConfig {
  minConfidence: number;
  maxTags: number;
  includeEntities: boolean;
  includeKeywords: boolean;
}

export interface DocumentTags {
  tags: string[];
  detailed: Array<{
    tag: string;
    confidence: number;
    category: string;
  }>;
  categories: string[];
}

export interface SearchRequest {
  query: string;
  limit?: number;
  searchType?: 'hybrid' | 'vector' | 'fulltext';
  filter?: Record<string, any>;
}

export interface IndexRequest {
  content: string;
  title?: string;
  source?: string;
  sourceType?: string;
  metadata?: Record<string, any>;
  autoTag?: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  searchType: string;
  processingTime: number;
}
