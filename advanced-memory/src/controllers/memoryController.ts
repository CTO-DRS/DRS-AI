import { Request, Response } from 'express';
import { AdvancedMemoryService } from '../services/AdvancedMemoryService';
import { MemoryType, RAGQuery, ContextCompressionOptions } from '../types';

const memoryService = new AdvancedMemoryService();

export const storeMemory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { content, type, metadata, sessionId, importance, ttl } = req.body;
    const userId = req.user?.id;

    if (!content) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    const memory = await memoryService.storeMemory(
      userId,
      content,
      type as MemoryType || MemoryType.SHORT_TERM,
      metadata || {},
      { sessionId, importance, ttl }
    );

    res.status(201).json({
      success: true,
      memory
    });
  } catch (error) {
    console.error('Store memory error:', error);
    res.status(500).json({ error: 'Failed to store memory' });
  }
};

export const retrieveWithRAG = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, filters, options } = req.body;
    const userId = req.user?.id;
    const sessionId = req.body.sessionId || req.headers['x-session-id'];

    if (!query) {
      res.status(400).json({ error: 'Query is required' });
      return;
    }

    const ragQuery: RAGQuery = {
      query,
      userId,
      sessionId: sessionId as string,
      filters,
      options
    };

    const result = await memoryService.retrieveWithRAG(ragQuery);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('RAG retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve memories' });
  }
};

export const compressContext = async (req: Request, res: Response): Promise<void> => {
  try {
    const { memories, query, options } = req.body;

    if (!memories || !Array.isArray(memories)) {
      res.status(400).json({ error: 'Memories array is required' });
      return;
    }

    const compressionOptions: ContextCompressionOptions = {
      maxTokens: options?.maxTokens || 4000,
      strategy: options?.strategy || 'semantic',
      preserveRecent: options?.preserveRecent ?? true,
      recentWindow: options?.recentWindow || 3
    };

    const compressed = await memoryService.compressContext(
      memories,
      query || '',
      compressionOptions
    );

    res.json({
      success: true,
      compressed,
      originalTokens: memories.reduce((acc, m) => acc + m.content.length / 4, 0),
      compressedTokens: compressed.length / 4
    });
  } catch (error) {
    console.error('Context compression error:', error);
    res.status(500).json({ error: 'Failed to compress context' });
  }
};

export const generateSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { timeRange } = req.body;
    const userId = req.user?.id;

    const summary = await memoryService.generateSummary(
      userId,
      timeRange || {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end: new Date()
      }
    );

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('Generate summary error:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
};

export const getKnowledgeGraph = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    const graph = await memoryService.getKnowledgeGraph(userId);

    res.json({
      success: true,
      graph
    });
  } catch (error) {
    console.error('Get knowledge graph error:', error);
    res.status(500).json({ error: 'Failed to get knowledge graph' });
  }
};

export const consolidateMemories = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    await memoryService.consolidateMemories(userId);

    res.json({
      success: true,
      message: 'Memory consolidation started'
    });
  } catch (error) {
    console.error('Consolidate memories error:', error);
    res.status(500).json({ error: 'Failed to consolidate memories' });
  }
};

export const cleanupExpired = async (req: Request, res: Response): Promise<void> => {
  try {
    const deletedCount = await memoryService.cleanupExpiredMemories();

    res.json({
      success: true,
      deletedCount
    });
  } catch (error) {
    console.error('Cleanup expired memories error:', error);
    res.status(500).json({ error: 'Failed to cleanup expired memories' });
  }
};
