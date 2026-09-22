import { Router } from 'express';
import memoryService from '../services/memoryService';
import logger from '../utils/logger';

const router = Router();

// Store memory
router.post('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const { content, metadata, source } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_CONTENT', message: 'Content is required' } });
    }

    const memory = await memoryService.storeMemory(userId, content, metadata, source);
    res.status(201).json({ success: true, data: { memory } });
  } catch (error: any) {
    logger.error('Failed to store memory:', error);
    res.status(500).json({ success: false, error: { code: 'STORE_FAILED', message: error.message } });
  }
});

// Search memories
router.post('/search', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const { query, limit = 5 } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_QUERY', message: 'Query is required' } });
    }

    const memories = await memoryService.searchMemories(userId, query, limit);
    res.json({ success: true, data: { memories } });
  } catch (error: any) {
    logger.error('Failed to search memories:', error);
    res.status(500).json({ success: false, error: { code: 'SEARCH_FAILED', message: error.message } });
  }
});

// Get user memories
router.get('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const { limit = 50, offset = 0 } = req.query;
    const memories = await memoryService.getUserMemories(userId, Number(limit), Number(offset));
    res.json({ success: true, data: { memories } });
  } catch (error: any) {
    logger.error('Failed to get memories:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Delete memory
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const deleted = await memoryService.deleteMemory(req.params.id, userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Memory not found' } });
    }

    res.json({ success: true, data: { message: 'Memory deleted' } });
  } catch (error: any) {
    logger.error('Failed to delete memory:', error);
    res.status(500).json({ success: false, error: { code: 'DELETE_FAILED', message: error.message } });
  }
});

export default router;
