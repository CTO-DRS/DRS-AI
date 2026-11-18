/**
 * RAG Routes
 * API endpoints for hybrid search and document indexing
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createLogger } from '../utils/logger';
import { VectorSearchService } from '../services/VectorSearchService';
import { FullTextSearchService } from '../services/FullTextSearchService';
import { HybridSearchService } from '../services/HybridSearchService';
import { AutoTaggingService } from '../services/AutoTaggingService';
import { DocumentProcessor } from '../services/DocumentProcessor';

const logger = createLogger('RAGRoutes');

// Validation schemas
const SearchSchema = z.object({
  query: z.string().min(1).max(10000),
  limit: z.number().min(1).max(100).optional().default(10),
  searchType: z.enum(['hybrid', 'vector', 'fulltext']).optional().default('hybrid'),
  filter: z.record(z.any()).optional()
});

const IndexSchema = z.object({
  content: z.string().min(1).max(1000000),
  title: z.string().optional(),
  source: z.string().optional(),
  sourceType: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  autoTag: z.boolean().optional().default(true)
});

const BatchIndexSchema = z.object({
  documents: z.array(IndexSchema).min(1).max(100)
});

export class RAGController {
  public router: Router;

  constructor(
    private vectorSearch: VectorSearchService,
    private fullTextSearch: FullTextSearchService,
    private hybridSearch: HybridSearchService,
    private autoTagging: AutoTaggingService,
    private documentProcessor: DocumentProcessor
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Search endpoint
    this.router.post('/search', async (req: Request, res: Response) => {
      try {
        const data = SearchSchema.parse(req.body);
        const startTime = Date.now();

        logger.info(`Search query: "${data.query.substring(0, 50)}..." (${data.searchType})`);

        let results: any[];

        switch (data.searchType) {
          case 'vector':
            results = await this.hybridSearch.semanticSearch(data.query, {
              limit: data.limit
            });
            break;
          case 'fulltext':
            results = await this.hybridSearch.keywordSearch(data.query, {
              limit: data.limit,
              highlight: true
            });
            break;
          case 'hybrid':
          default:
            results = await this.hybridSearch.search(data.query, {
              limit: data.limit,
              filter: data.filter
            });
            break;
        }

        res.json({
          success: true,
          data: {
            results,
            total: results.length,
            query: data.query,
            searchType: data.searchType,
            processingTime: Date.now() - startTime
          }
        });
      } catch (error) {
        logger.error('Search failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Search with explanation
    this.router.post('/search/explain', async (req: Request, res: Response) => {
      try {
        const data = SearchSchema.parse(req.body);
        const startTime = Date.now();

        const results = await this.hybridSearch.searchWithExplanation(data.query, {
          limit: data.limit,
          filter: data.filter
        });

        res.json({
          success: true,
          data: {
            results,
            total: results.length,
            query: data.query,
            processingTime: Date.now() - startTime
          }
        });
      } catch (error) {
        logger.error('Explain search failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Index document
    this.router.post('/index', async (req: Request, res: Response) => {
      try {
        const data = IndexSchema.parse(req.body);

        logger.info(`Indexing document: ${data.title || 'Untitled'}`);

        // Process document
        const processed = await this.documentProcessor.processDocument(data.content, {
          title: data.title,
          source: data.source,
          sourceType: data.sourceType,
          metadata: data.metadata
        });

        // Auto-tag if enabled
        let tags: string[] = [];
        if (data.autoTag) {
          const tagResult = await this.autoTagging.tagDocument(processed.content, processed.title);
          tags = tagResult.tags;
        }

        // Add to vector search
        const vectorIds: string[] = [];
        for (const chunk of processed.chunks) {
          const id = await this.vectorSearch.addDocument({
            content: chunk.content,
            metadata: {
              ...processed.metadata,
              chunkIndex: chunk.index,
              documentTitle: processed.title
            },
            tags,
            source: data.source,
            sourceType: data.sourceType
          });
          vectorIds.push(id);
        }

        // Add to full-text search
        const fulltextId = await this.fullTextSearch.addDocument({
          content: processed.content,
          title: processed.title,
          metadata: processed.metadata,
          tags,
          source: data.source,
          sourceType: data.sourceType
        });

        res.json({
          success: true,
          data: {
            documentId: fulltextId,
            vectorIds,
            chunks: processed.chunks.length,
            tags,
            summary: processed.summary
          }
        });
      } catch (error) {
        logger.error('Indexing failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Batch index
    this.router.post('/index/batch', async (req: Request, res: Response) => {
      try {
        const data = BatchIndexSchema.parse(req.body);

        logger.info(`Batch indexing ${data.documents.length} documents`);

        const results = await Promise.all(
          data.documents.map(async (doc) => {
            try {
              // Process document
              const processed = await this.documentProcessor.processDocument(doc.content, {
                title: doc.title,
                source: doc.source,
                sourceType: doc.sourceType,
                metadata: doc.metadata
              });

              // Auto-tag
              let tags: string[] = [];
              if (doc.autoTag) {
                const tagResult = await this.autoTagging.tagDocument(processed.content, processed.title);
                tags = tagResult.tags;
              }

              // Add to vector search
              const vectorIds: string[] = [];
              for (const chunk of processed.chunks) {
                const id = await this.vectorSearch.addDocument({
                  content: chunk.content,
                  metadata: {
                    ...processed.metadata,
                    chunkIndex: chunk.index
                  },
                  tags,
                  source: doc.source,
                  sourceType: doc.sourceType
                });
                vectorIds.push(id);
              }

              // Add to full-text search
              const fulltextId = await this.fullTextSearch.addDocument({
                content: processed.content,
                title: processed.title,
                metadata: processed.metadata,
                tags,
                source: doc.source,
                sourceType: doc.sourceType
              });

              return {
                success: true,
                documentId: fulltextId,
                vectorIds,
                chunks: processed.chunks.length
              };
            } catch (err) {
              return {
                success: false,
                error: err instanceof Error ? err.message : 'Unknown error'
              };
            }
          })
        );

        res.json({
          success: true,
          data: {
            total: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
          }
        });
      } catch (error) {
        logger.error('Batch indexing failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Tag document
    this.router.post('/tag', async (req: Request, res: Response) => {
      try {
        const { content, title } = z.object({
          content: z.string(),
          title: z.string().optional()
        }).parse(req.body);

        const tags = await this.autoTagging.tagDocument(content, title);

        res.json({
          success: true,
          data: tags
        });
      } catch (error) {
        logger.error('Tagging failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get stats
    this.router.get('/stats', async (req: Request, res: Response) => {
      try {
        const [vectorStats, fulltextStats] = await Promise.all([
          this.vectorSearch.getStats(),
          this.fullTextSearch.getStats()
        ]);

        res.json({
          success: true,
          data: {
            vector: vectorStats,
            fulltext: fulltextStats,
            hybrid: {
              rrfConfig: this.hybridSearch.getConfig()
            }
          }
        });
      } catch (error) {
        logger.error('Stats failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get document
    this.router.get('/document/:id', async (req: Request, res: Response) => {
      try {
        const doc = await this.vectorSearch.getDocument(req.params.id);

        if (!doc) {
          return res.status(404).json({
            success: false,
            error: 'Document not found'
          });
        }

        res.json({
          success: true,
          data: doc
        });
      } catch (error) {
        logger.error('Get document failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Delete document
    this.router.delete('/document/:id', async (req: Request, res: Response) => {
      try {
        const vectorDeleted = await this.vectorSearch.deleteDocument(req.params.id);
        const fulltextDeleted = await this.fullTextSearch.deleteDocument(req.params.id);

        res.json({
          success: true,
          data: {
            deleted: vectorDeleted || fulltextDeleted
          }
        });
      } catch (error) {
        logger.error('Delete document failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Update RRF config
    this.router.put('/config/rrf', async (req: Request, res: Response) => {
      try {
        const config = z.object({
          k: z.number().optional(),
          vectorWeight: z.number().optional(),
          fulltextWeight: z.number().optional(),
          minScore: z.number().optional()
        }).parse(req.body);

        this.hybridSearch.updateConfig(config);

        res.json({
          success: true,
          data: {
            config: this.hybridSearch.getConfig()
          }
        });
      } catch (error) {
        logger.error('Config update failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }
}
