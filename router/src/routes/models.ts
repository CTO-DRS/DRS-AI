import { Router } from 'express';
import ollamaService from '../services/ollamaService';
import logger from '../utils/logger';

const router = Router();

// List all models
router.get('/', async (req, res) => {
  try {
    const models = await ollamaService.listModels();
    res.json({
      success: true,
      data: { models }
    });
  } catch (error: any) {
    logger.error('Failed to list models:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MODELS_FETCH_FAILED',
        message: error.message
      }
    });
  }
});

// Get model details
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const model = await ollamaService.getModelInfo(name);
    res.json({
      success: true,
      data: { model }
    });
  } catch (error: any) {
    logger.error(`Failed to get model ${req.params.name}:`, error);
    res.status(404).json({
      success: false,
      error: {
        code: 'MODEL_NOT_FOUND',
        message: error.message
      }
    });
  }
});

// Pull a model
router.post('/pull', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_MODEL_NAME',
          message: 'Model name is required'
        }
      });
    }

    await ollamaService.pullModel(name);
    res.json({
      success: true,
      data: { message: `Model ${name} pulled successfully` }
    });
  } catch (error: any) {
    logger.error('Failed to pull model:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PULL_FAILED',
        message: error.message
      }
    });
  }
});

// Delete a model
router.delete('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    await ollamaService.deleteModel(name);
    res.json({
      success: true,
      data: { message: `Model ${name} deleted successfully` }
    });
  } catch (error: any) {
    logger.error(`Failed to delete model ${req.params.name}:`, error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_FAILED',
        message: error.message
      }
    });
  }
});

// Generate embeddings
router.post('/embeddings', async (req, res) => {
  try {
    const { model, prompt } = req.body;
    if (!model || !prompt) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'Model and prompt are required'
        }
      });
    }

    const embedding = await ollamaService.generateEmbeddings(model, prompt);
    res.json({
      success: true,
      data: { embedding }
    });
  } catch (error: any) {
    logger.error('Failed to generate embeddings:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'EMBEDDING_FAILED',
        message: error.message
      }
    });
  }
});

export default router;
