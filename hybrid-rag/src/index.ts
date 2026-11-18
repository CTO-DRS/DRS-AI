/**
 * 𝑫𝑹𝑺.𝑽𝑰𝑷. Hybrid RAG Engine
 * Vector + Full-text Search with Auto-Tagging
 * 
 * Features:
 * - Vector Embeddings Search (Semantic)
 * - Full-text Search (Keyword-based)
 * - Reciprocal Rank Fusion for combined results
 * - Auto-Tagging using lightweight classification
 * - Multi-modal document support
 * - Real-time indexing
 * 
 * @module HybridRAG
 * @version 2.0.0
 * @author 𝑫𝑹𝑺.𝑽𝑰𝑷. Architect
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createLogger } from './utils/logger';
import { metricsMiddleware, metricsEndpoint } from './utils/metrics';
import { errorHandler } from './utils/errorHandler';
import { RAGController } from './routes/rag';
import { HealthController } from './routes/health';
import { VectorSearchService } from './services/VectorSearchService';
import { FullTextSearchService } from './services/FullTextSearchService';
import { HybridSearchService } from './services/HybridSearchService';
import { AutoTaggingService } from './services/AutoTaggingService';
import { DocumentProcessor } from './services/DocumentProcessor';

const logger = createLogger('HybridRAG');
const app = express();
const PORT = process.env.PORT || 3022;

// Initialize services
const vectorSearch = new VectorSearchService();
const fullTextSearch = new FullTextSearchService();
const hybridSearch = new HybridSearchService(vectorSearch, fullTextSearch);
const autoTagging = new AutoTaggingService();
const documentProcessor = new DocumentProcessor();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Metrics middleware
app.use(metricsMiddleware);

// Initialize controllers
const ragController = new RAGController(
  vectorSearch,
  fullTextSearch,
  hybridSearch,
  autoTagging,
  documentProcessor
);
const healthController = new HealthController();

// Routes
app.use('/api/v1/rag', ragController.router);
app.use('/api/v1/health', healthController.router);
app.use('/metrics', metricsEndpoint);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: '𝑫𝑹𝑺.𝑽𝑰𝑷. Hybrid RAG Engine',
    version: '2.0.0',
    status: 'operational',
    features: [
      'vector-semantic-search',
      'full-text-search',
      'hybrid-search',
      'reciprocal-rank-fusion',
      'auto-tagging',
      'document-processing',
      'multi-modal-support'
    ],
    endpoints: {
      rag: '/api/v1/rag',
      health: '/api/v1/health',
      metrics: '/metrics'
    }
  });
});

// Error handling
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await vectorSearch.close();
  await fullTextSearch.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await vectorSearch.close();
  await fullTextSearch.close();
  process.exit(0);
});

// Start server
app.listen(PORT, async () => {
  logger.info(`🔍 𝑫𝑹𝑺.𝑽𝑰𝑷. Hybrid RAG Engine running on port ${PORT}`);
  
  try {
    // Initialize services
    await vectorSearch.initialize();
    logger.info('✅ Vector Search Service initialized');
    
    await fullTextSearch.initialize();
    logger.info('✅ Full-text Search Service initialized');
    
    await hybridSearch.initialize();
    logger.info('✅ Hybrid Search Service initialized');
    
    await autoTagging.initialize();
    logger.info('✅ Auto-Tagging Service initialized');
    
    await documentProcessor.initialize();
    logger.info('✅ Document Processor initialized');
    
    logger.info('🔍 Hybrid RAG Engine fully operational');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
});

export { vectorSearch, fullTextSearch, hybridSearch, autoTagging, documentProcessor };
