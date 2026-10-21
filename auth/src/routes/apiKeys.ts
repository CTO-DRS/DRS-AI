import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import authService from '../services/authService';
import apiKeyService from '../services/apiKeyService';
import logger from '../utils/logger';

const router = Router();

const handleValidationErrors = (req: Request, res: Response, next: Function) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors.array() }
    });
  }
  next();
};

/** Inline JWT middleware (auth service verifies its own tokens). */
const requireAuth = (req: Request, res: Response, next: Function) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Access token required' }
    });
  }
  try {
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(header.substring(7), process.env.JWT_SECRET || 'drs-dev-secret') as any;
    (req as any).user = { id: payload.userId, role: payload.role };
    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' }
    });
  }
};

const isAdmin = (req: Request) => (req as any).user?.role === 'admin';

/* ------------------- User-facing endpoints ------------------- */

// Create API key (plaintext returned exactly once)
router.post(
  '/',
  requireAuth,
  [body('name').optional().isLength({ max: 100 }), body('expiresInDays').optional().isInt({ min: 1, max: 3650 })],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { name, scopes, expiresInDays } = req.body;
      const { apiKey, key } = await apiKeyService.createKey({ userId, name, scopes, expiresInDays });
      res.status(201).json({
        success: true,
        data: {
          apiKey: apiKey.toJSON(),
          key, // ⚠️ shown only once
          warning: 'Store this key securely — it will not be shown again'
        }
      });
    } catch (error: any) {
      logger.error('API key creation failed:', error);
      res.status(500).json({ success: false, error: { code: 'APIKEY_CREATE_FAILED', message: error.message } });
    }
  }
);

// List my keys
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const keys = await apiKeyService.listKeys((req as any).user.id);
    res.json({ success: true, data: { keys: keys.map((k) => k.toJSON()) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'APIKEY_LIST_FAILED', message: error.message } });
  }
});

// Revoke
router.post('/:id/revoke', requireAuth, async (req: Request, res: Response) => {
  try {
    const revoked = await apiKeyService.revokeKey(req.params.id, (req as any).user.id, isAdmin(req));
    if (!revoked) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API key not found' } });
    }
    res.json({ success: true, data: { message: 'API key revoked' } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'APIKEY_REVOKE_FAILED', message: error.message } });
  }
});

// Delete
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const deleted = await apiKeyService.deleteKey(req.params.id, (req as any).user.id, isAdmin(req));
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API key not found' } });
    }
    res.json({ success: true, data: { message: 'API key deleted' } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'APIKEY_DELETE_FAILED', message: error.message } });
  }
});

/* --------------- Internal validation (Gateway only) --------------- */

/**
 * POST /apikeys/validate  { key: "drsk_..." }
 * Used by the Gateway middleware. When INTERNAL_API_KEY is configured the
 * caller must present it via X-Internal-Key; otherwise restricted to dev.
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const internalSecret = process.env.INTERNAL_API_KEY;
    if (internalSecret && req.headers['x-internal-key'] !== internalSecret) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Internal endpoint' } });
    }
    const { key } = req.body;
    const result = await apiKeyService.validateKey(key);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('API key validation failed:', error);
    res.status(500).json({ success: false, error: { code: 'APIKEY_VALIDATE_FAILED', message: error.message } });
  }
});

export default router;
