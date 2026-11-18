export interface MemoryEntry {
  id: string;
  userId: string;
  sessionId?: string;
  type: MemoryType;
  content: string;
  embedding?: number[];
  metadata: MemoryMetadata;
  importance: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  accessCount: number;
  lastAccessedAt?: Date;
}

export enum MemoryType {
  SHORT_TERM = 'short_term',
  LONG_TERM = 'long_term',
  EPISODIC = 'episodic',
  SEMANTIC = 'semantic',
  PROCEDURAL = 'procedural',
  CONVERSATION = 'conversation',
  DOCUMENT = 'document',
  MULTIMODAL = 'multimodal'
}

export interface MemoryMetadata {
  source?: string;
  tags?: string[];
  category?: string;
  entities?: string[];
  sentiment?: number;
  language?: string;
  confidence?: number;
  relatedMemories?: string[];
  customFields?: Record<string, any>;
}

export interface RAGQuery {
  query: string;
  userId: string;
  sessionId?: string;
  filters?: MemoryFilters;
  options?: RAGOptions;
}

export interface MemoryFilters {
  types?: MemoryType[];
  tags?: string[];
  categories?: string[];
  dateRange?: { start: Date; end: Date };
  entities?: string[];
  minImportance?: number;
  sources?: string[];
}

export interface RAGOptions {
  topK?: number;
  minSimilarity?: number;
  includeMetadata?: boolean;
  includeEmbeddings?: boolean;
  rerank?: boolean;
  contextWindow?: number;
  compressionEnabled?: boolean;
  hierarchicalSearch?: boolean;
}

export interface RAGResult {
  memories: MemoryEntry[];
  context: string;
  query: string;
  processingTime: number;
  totalResults: number;
  similarityScores: number[];
  aggregatedContext?: string;
}

export interface ContextCompressionOptions {
  maxTokens: number;
  strategy: 'truncate' | 'summarize' | 'hierarchical' | 'semantic';
  preserveRecent?: boolean;
  recentWindow?: number;
}

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, any>;
  embedding?: number[];
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  weight: number;
  properties: Record<string, any>;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface MemorySummary {
  userId: string;
  summary: string;
  keyPoints: string[];
  entities: string[];
  topics: string[];
  timeRange: { start: Date; end: Date };
  memoryCount: number;
  generatedAt: Date;
}

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  batchSize: number;
  normalize: boolean;
}

export interface SearchResult {
  memory: MemoryEntry;
  score: number;
  rank: number;
}

export interface HierarchicalMemory {
  level: number;
  parentId?: string;
  childrenIds: string[];
  summary?: string;
  memories: MemoryEntry[];
}

export interface MultiModalMemory {
  id: string;
  textContent?: string;
  imageUrls?: string[];
  audioUrls?: string[];
  videoUrls?: string[];
  embeddings: {
    text?: number[];
    image?: number[];
    audio?: number[];
    video?: number[];
  };
  metadata: MemoryMetadata;
}
