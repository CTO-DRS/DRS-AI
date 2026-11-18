import { Router, Request, Response } from 'express';
import multer from 'multer';
import memoryService from '../services/memoryService';
import logger from '../utils/logger';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB per file
});

const getUserId = (req: Request): string => req.headers['x-user-id'] as string;

const unauthorized = (res: Response) =>
  res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });

/* ------------------------- Documents ------------------------- */

// Ingest a document (chunk + index for retrieval)
router.post('/documents', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);

    const { title, content, source, mimeType } = req.body;
    const doc = await memoryService.ingestDocument({ userId, title, content, source, mimeType });
    res.status(201).json({
      success: true,
      data: { doc: { ...doc.toJSON(), content: undefined, chunks: undefined } }
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false, error: { code: 'MEMORY_INGEST_FAILED', message: error.message }
    });
  }
});

// Ingest an uploaded file (text, markdown, csv, json, html, code, pdf)
router.post('/documents/upload', upload.single('file'), async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file provided' } });
    }
    const doc = await memoryService.ingestFile({
      userId,
      originalName: req.file.originalname,
      buffer: req.file.buffer
    });
    res.status(201).json({
      success: true,
      data: { doc: { ...doc.toJSON(), content: undefined, chunks: undefined } }
    });
  } catch (error: any) {
    logger.error('Knowledge upload failed:', error.message);
    res.status(error.statusCode || 500).json({
      success: false, error: { code: 'MEMORY_UPLOAD_FAILED', message: error.message }
    });
  }
});

// List my documents (metadata only)
router.get('/documents', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);
    const docs = await memoryService.listDocuments(userId);
    res.json({ success: true, data: { docs } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'MEMORY_LIST_FAILED', message: error.message } });
  }
});

// Get one document with content
router.get('/documents/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);
    const doc = await memoryService.getDocument(req.params.id, userId);
    if (!doc) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }
    res.json({ success: true, data: { doc } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'MEMORY_FETCH_FAILED', message: error.message } });
  }
});

// Enable / disable a document (disabled docs are excluded from retrieval)
router.post('/documents/:id/toggle', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);
    const doc = await memoryService.toggleDocument(req.params.id, userId, Boolean(req.body?.enabled));
    if (!doc) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }
    res.json({ success: true, data: { doc: { ...doc.toJSON(), content: undefined, chunks: undefined } } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'MEMORY_TOGGLE_FAILED', message: error.message } });
  }
});

// Delete a document
router.delete('/documents/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);
    const deleted = await memoryService.deleteDocument(req.params.id, userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }
    res.json({ success: true, data: { message: 'Document deleted' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'MEMORY_DELETE_FAILED', message: error.message } });
  }
});

/* -------------------------- Retrieval ------------------------- */

// Search across my knowledge base (drSai RAGFlow retrieval parity)
router.post('/search', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);
    const { query, topK } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: { code: 'MISSING_QUERY', message: 'query is required' } });
    }
    const results = await memoryService.search(userId, query, Number(topK) || 5);
    res.json({ success: true, data: { results } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'MEMORY_SEARCH_FAILED', message: error.message } });
  }
});

export default router;
