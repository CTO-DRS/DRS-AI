import { Router } from 'express';
import multer from 'multer';
import pluginManager from '../engine/PluginManager';
import logger from '../utils/logger';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// List all plugins
router.get('/', async (req, res) => {
  try {
    const plugins = await pluginManager.getAllPlugins();
    res.json({ success: true, data: { plugins } });
  } catch (error: any) {
    logger.error('Failed to get plugins:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Get plugin by ID
router.get('/:id', async (req, res) => {
  try {
    const plugin = await pluginManager.getPlugin(req.params.id);
    if (!plugin) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Plugin not found' } });
    }
    res.json({ success: true, data: { plugin } });
  } catch (error: any) {
    logger.error('Failed to get plugin:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Install plugin
router.post('/install', upload.single('plugin'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No plugin file provided' } });
    }

    const plugin = await pluginManager.installPlugin(req.file.buffer);
    res.status(201).json({ success: true, data: { plugin } });
  } catch (error: any) {
    logger.error('Failed to install plugin:', error);
    res.status(500).json({ success: false, error: { code: 'INSTALL_FAILED', message: error.message } });
  }
});

// Uninstall plugin
router.delete('/:id', async (req, res) => {
  try {
    await pluginManager.uninstallPlugin(req.params.id);
    res.json({ success: true, data: { message: 'Plugin uninstalled' } });
  } catch (error: any) {
    logger.error('Failed to uninstall plugin:', error);
    res.status(500).json({ success: false, error: { code: 'UNINSTALL_FAILED', message: error.message } });
  }
});

// Enable plugin
router.post('/:id/enable', async (req, res) => {
  try {
    await pluginManager.enablePlugin(req.params.id);
    res.json({ success: true, data: { message: 'Plugin enabled' } });
  } catch (error: any) {
    logger.error('Failed to enable plugin:', error);
    res.status(500).json({ success: false, error: { code: 'ENABLE_FAILED', message: error.message } });
  }
});

// Disable plugin
router.post('/:id/disable', async (req, res) => {
  try {
    await pluginManager.disablePlugin(req.params.id);
    res.json({ success: true, data: { message: 'Plugin disabled' } });
  } catch (error: any) {
    logger.error('Failed to disable plugin:', error);
    res.status(500).json({ success: false, error: { code: 'DISABLE_FAILED', message: error.message } });
  }
});

// Execute plugin
router.post('/:id/execute', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const result = await pluginManager.executePlugin(req.params.id, req.body, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Failed to execute plugin:', error);
    res.status(500).json({ success: false, error: { code: 'EXECUTE_FAILED', message: error.message } });
  }
});

// Update plugin config
router.patch('/:id/config', async (req, res) => {
  try {
    const plugin = await pluginManager.updatePluginConfig(req.params.id, req.body);
    res.json({ success: true, data: { plugin } });
  } catch (error: any) {
    logger.error('Failed to update plugin config:', error);
    res.status(500).json({ success: false, error: { code: 'UPDATE_FAILED', message: error.message } });
  }
});

// Get marketplace plugins (mock)
router.get('/marketplace/list', async (req, res) => {
  const marketplacePlugins = [
    {
      id: 'weather-plugin',
      name: 'Weather Plugin',
      description: 'Get weather information for any location',
      version: '1.0.0',
      author: 'DRS Team',
      downloads: 1250,
      rating: 4.5,
      category: 'utilities',
      tags: ['weather', 'api']
    },
    {
      id: 'translator-plugin',
      name: 'Translator Plugin',
      description: 'Translate text between languages',
      version: '1.0.0',
      author: 'DRS Team',
      downloads: 890,
      rating: 4.2,
      category: 'language',
      tags: ['translation', 'language']
    },
    {
      id: 'calculator-plugin',
      name: 'Calculator Plugin',
      description: 'Advanced calculator with math functions',
      version: '1.0.0',
      author: 'DRS Team',
      downloads: 2100,
      rating: 4.8,
      category: 'utilities',
      tags: ['math', 'calculator']
    }
  ];

  res.json({ success: true, data: { plugins: marketplacePlugins } });
});

export default router;
