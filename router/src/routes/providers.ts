import { Router, Request, Response } from 'express';
import providerService, { PROVIDER_PRESETS } from '../services/providerService';
import logger from '../utils/logger';

const router = Router();

/**
 * Multi-provider management (drSai provider_presets parity).
 * Providers act as a fallback chain behind Ollama for models that are
 * not available locally. API keys are stored server-side and never
 * returned in full (masked as sk-...last4).
 */

const maskKey = (key: string): string =>
  key.length > 8 ? `${key.slice(0, 5)}...${key.slice(-4)}` : '***';

const sanitize = (p: any) => ({
  ...p,
  apiKey: maskKey(p.apiKey || '')
});

// List configured providers + available presets
router.get('/', async (req, res) => {
  try {
    const providers = (await providerService.list()).map(sanitize);
    res.json({ success: true, data: { providers, presets: providerService.getPresets() } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'PROVIDERS_FETCH_FAILED', message: error.message } });
  }
});

// Save / upsert a provider
router.post('/', async (req, res) => {
  try {
    const { id, name, baseUrl, apiKey, wireApi, priority, enabled } = req.body;
    if (!id || !apiKey) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PROVIDER', message: 'id and apiKey are required' }
      });
    }
    if (!PROVIDER_PRESETS[id] && !baseUrl) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PROVIDER', message: 'baseUrl is required for custom providers' }
      });
    }
    const provider = await providerService.save({ id, name, baseUrl, apiKey, wireApi, priority, enabled });
    res.status(201).json({ success: true, data: { provider: sanitize(provider) } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'PROVIDER_SAVE_FAILED', message: error.message } });
  }
});

// Test a provider (list its models, refresh cache)
router.post('/:id/test', async (req, res) => {
  try {
    const result = await providerService.test(req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'PROVIDER_TEST_FAILED', message: error.message } });
  }
});

// Enable / disable
router.post('/:id/toggle', async (req, res) => {
  try {
    const provider = await providerService.toggle(req.params.id, Boolean(req.body?.enabled));
    if (!provider) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Provider not found' } });
    }
    res.json({ success: true, data: { provider: sanitize(provider) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'PROVIDER_TOGGLE_FAILED', message: error.message } });
  }
});

// Remove
router.delete('/:id', async (req, res) => {
  try {
    const removed = await providerService.remove(req.params.id);
    if (!removed) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Provider not found' } });
    }
    res.json({ success: true, data: { message: 'Provider removed' } });
  } catch (error: any) {
    logger.error('Provider removal failed:', error);
    res.status(500).json({ success: false, error: { code: 'PROVIDER_REMOVE_FAILED', message: error.message } });
  }
});

export default router;
