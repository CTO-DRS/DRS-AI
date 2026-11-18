import { Router } from 'express';
import memoryService from '../services/memoryService';
import logger from '../utils/logger';

const router = Router();

// Create conversation
router.post('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const { title } = req.body;
    const conversation = await memoryService.createConversation(userId, title);
    res.status(201).json({ success: true, data: { conversation } });
  } catch (error: any) {
    logger.error('Failed to create conversation:', error);
    res.status(500).json({ success: false, error: { code: 'CREATE_FAILED', message: error.message } });
  }
});

// Get user conversations
router.get('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const { limit = 20 } = req.query;
    const conversations = await memoryService.getUserConversations(userId, Number(limit));
    res.json({ success: true, data: { conversations } });
  } catch (error: any) {
    logger.error('Failed to get conversations:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Get conversation with messages
router.get('/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const conversation = await memoryService.getConversation(req.params.id, userId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    }

    res.json({ success: true, data: { conversation } });
  } catch (error: any) {
    logger.error('Failed to get conversation:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Add message to conversation
router.post('/:id/messages', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const { role, content, metadata } = req.body;
    if (!role || !content) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Role and content are required' } });
    }

    const conversation = await memoryService.getConversation(req.params.id, userId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    }

    const message = await memoryService.addMessage(req.params.id, role, content, metadata);
    res.status(201).json({ success: true, data: { message } });
  } catch (error: any) {
    logger.error('Failed to add message:', error);
    res.status(500).json({ success: false, error: { code: 'ADD_FAILED', message: error.message } });
  }
});

// Delete conversation
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const deleted = await memoryService.deleteConversation(req.params.id, userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    }

    res.json({ success: true, data: { message: 'Conversation deleted' } });
  } catch (error: any) {
    logger.error('Failed to delete conversation:', error);
    res.status(500).json({ success: false, error: { code: 'DELETE_FAILED', message: error.message } });
  }
});

export default router;
