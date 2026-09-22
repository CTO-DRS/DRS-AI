/**
 * Hybrid Search Service
 * Combines vector and full-text search using Reciprocal Rank Fusion
 */

import { createLogger } from '../utils/logger';
import { VectorSearchService } from './VectorSearchService';
import { FullTextSearchService } from './FullTextSearchService';
import { SearchResult, HybridSearchOptions, RRFConfig } from '../models/types';

const logger = createLogger('HybridSearchService');

export class HybridSearchService {
  private config: RRFConfig;

  constructor(
    private vectorSearch: VectorSearchService,
    private fullTextSearch: FullTextSearchService
  ) {
    this.config = {
      k: 60, // RRF constant
      vectorWeight: 0.6,
      fulltextWeight: 0.4,
      minScore: 0.1
    };
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Hybrid Search Service...');
    logger.info(`✅ RRF config: k=${this.config.k}, vectorWeight=${this.config.vectorWeight}, fulltextWeight=${this.config.fulltextWeight}`);
  }

  async search(
    query: string,
    options: HybridSearchOptions = {}
  ): Promise<SearchResult[]> {
    const startTime = Date.now();
    
    const {
      limit = 10,
      vectorLimit = 20,
      fulltextLimit = 20,
      filter,
      useRRF = true
    } = options;

    try {
      // Run both searches in parallel
      const [vectorResults, fulltextResults] = await Promise.all([
        this.vectorSearch.search(query, {
          limit: vectorLimit,
          filter
        }),
        this.fullTextSearch.search(query, {
          limit: fulltextLimit,
          filter
        })
      ]);

      logger.info(`Vector results: ${vectorResults.length}, Full-text results: ${fulltextResults.length}`);

      let combinedResults: SearchResult[];

      if (useRRF) {
        // Use Reciprocal Rank Fusion
        combinedResults = this.reciprocalRankFusion(
          vectorResults,
          fulltextResults,
          limit
        );
      } else {
        // Simple weighted combination
        combinedResults = this.weightedCombination(
          vectorResults,
          fulltextResults,
          limit
        );
      }

      logger.info(`Hybrid search completed in ${Date.now() - startTime}ms, returning ${combinedResults.length} results`);

      return combinedResults;
    } catch (error) {
      logger.error('Hybrid search failed:', error);
      throw error;
    }
  }

  /**
   * Reciprocal Rank Fusion (RRF)
   * Combines ranked lists using the formula: score = Σ 1 / (k + rank)
   */
  private reciprocalRankFusion(
    vectorResults: SearchResult[],
    fulltextResults: SearchResult[],
    limit: number
  ): SearchResult[] {
    const scores = new Map<string, { 
      score: number; 
      vectorRank: number; 
      fulltextRank: number;
      result: SearchResult;
    }>();

    // Add vector results
    vectorResults.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = this.config.vectorWeight * (1 / (this.config.k + rank));
      
      scores.set(result.id, {
        score: rrfScore,
        vectorRank: rank,
        fulltextRank: Infinity,
        result
      });
    });

    // Add full-text results
    fulltextResults.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = this.config.fulltextWeight * (1 / (this.config.k + rank));
      
      const existing = scores.get(result.id);
      if (existing) {
        existing.score += rrfScore;
        existing.fulltextRank = rank;
      } else {
        scores.set(result.id, {
          score: rrfScore,
          vectorRank: Infinity,
          fulltextRank: rank,
          result
        });
      }
    });

    // Convert to array and sort by score
    const fused = Array.from(scores.entries())
      .map(([id, data]) => ({
        ...data.result,
        score: data.score,
        metadata: {
          ...data.result.metadata,
          _hybrid: {
            vectorRank: data.vectorRank,
            fulltextRank: data.fulltextRank,
            rrfScore: data.score
          }
        }
      }))
      .filter(r => r.score >= this.config.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return fused;
  }

  /**
   * Weighted Combination
   * Simple weighted sum of normalized scores
   */
  private weightedCombination(
    vectorResults: SearchResult[],
    fulltextResults: SearchResult[],
    limit: number
  ): SearchResult[] {
    const scores = new Map<string, {
      vectorScore: number;
      fulltextScore: number;
      result: SearchResult;
    }>();

    // Normalize vector scores (cosine similarity is already 0-1)
    const maxVectorScore = Math.max(...vectorResults.map(r => r.score), 1);
    
    vectorResults.forEach(result => {
      scores.set(result.id, {
        vectorScore: result.score / maxVectorScore,
        fulltextScore: 0,
        result
      });
    });

    // Normalize full-text scores
    const maxFulltextScore = Math.max(...fulltextResults.map(r => r.score), 1);
    
    fulltextResults.forEach(result => {
      const existing = scores.get(result.id);
      const normalizedScore = result.score / maxFulltextScore;
      
      if (existing) {
        existing.fulltextScore = normalizedScore;
      } else {
        scores.set(result.id, {
          vectorScore: 0,
          fulltextScore: normalizedScore,
          result
        });
      }
    });

    // Calculate weighted scores
    const combined = Array.from(scores.entries())
      .map(([id, data]) => ({
        ...data.result,
        score: 
          this.config.vectorWeight * data.vectorScore +
          this.config.fulltextWeight * data.fulltextScore,
        metadata: {
          ...data.result.metadata,
          _hybrid: {
            vectorScore: data.vectorScore,
            fulltextScore: data.fulltextScore
          }
        }
      }))
      .filter(r => r.score >= this.config.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return combined;
  }

  /**
   * Search with explanation
   * Returns results with detailed scoring explanation
   */
  async searchWithExplanation(
    query: string,
    options: HybridSearchOptions = {}
  ): Promise<Array<SearchResult & { explanation: any }>> {
    const results = await this.search(query, options);

    return results.map(result => ({
      ...result,
      explanation: {
        finalScore: result.score,
        vectorContribution: result.metadata?._hybrid?.vectorScore || 
          (result.metadata?._hybrid?.vectorRank ? 
            this.config.vectorWeight * (1 / (this.config.k + result.metadata._hybrid.vectorRank)) : 0),
        fulltextContribution: result.metadata?._hybrid?.fulltextScore || 
          (result.metadata?._hybrid?.fulltextRank ? 
            this.config.fulltextWeight * (1 / (this.config.k + result.metadata._hybrid.fulltextRank)) : 0),
        vectorRank: result.metadata?._hybrid?.vectorRank,
        fulltextRank: result.metadata?._hybrid?.fulltextRank,
        rrfConstant: this.config.k
      }
    }));
  }

  /**
   * Semantic search only
   */
  async semanticSearch(
    query: string,
    options: { limit?: number; threshold?: number } = {}
  ): Promise<SearchResult[]> {
    return this.vectorSearch.search(query, options);
  }

  /**
   * Keyword search only
   */
  async keywordSearch(
    query: string,
    options: { limit?: number; highlight?: boolean } = {}
  ): Promise<SearchResult[]> {
    return this.fullTextSearch.search(query, options);
  }

  /**
   * Update RRF configuration
   */
  updateConfig(config: Partial<RRFConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('RRF config updated:', this.config);
  }

  getConfig(): RRFConfig {
    return { ...this.config };
  }
}
