import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import minioService from '../services/minioService';
import fileProcessor from '../services/fileProcessor';
import logger from '../utils/logger';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

// Upload file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded' } });
    }

    const fileId = uuidv4();
    const objectName = `${userId}/${fileId}-${req.file.originalname}`;
    
    await minioService.uploadFile(objectName, req.file.buffer, {
      'Content-Type': req.file.mimetype,
      'X-User-Id': userId,
      'X-Original-Name': req.file.originalname
    });

    // Process file if it's a document
    let processed = null;
    if (['application/pdf', 'text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(req.file.mimetype)) {
      try {
        processed = await fileProcessor.processFile(req.file.buffer, req.file.mimetype);
      } catch (e) {
        logger.warn('File processing failed:', e);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        fileId,
        objectName,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        processed: processed ? {
          text: processed.text.substring(0, 5000),
          metadata: processed.metadata
        } : null
      }
    });
  } catch (error: any) {
    logger.error('Upload failed:', error);
    res.status(500).json({ success: false, error: { code: 'UPLOAD_FAILED', message: error.message } });
  }
});

// Process file
router.post('/process', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file provided' } });
    }

    const result = await fileProcessor.processFile(req.file.buffer, req.file.mimetype);
    const chunks = fileProcessor.chunkText(result.text);

    res.json({
      success: true,
      data: {
        text: result.text,
        chunks,
        metadata: result.metadata
      }
    });
  } catch (error: any) {
    logger.error('Processing failed:', error);
    res.status(500).json({ success: false, error: { code: 'PROCESSING_FAILED', message: error.message } });
  }
});

export default router;
