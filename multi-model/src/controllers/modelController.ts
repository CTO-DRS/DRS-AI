import { Request, Response } from 'express';
import { MultiModelService } from '../services/MultiModelService';
import { EnsembleStrategy, TaskType, AutoSelectConfig } from '../types';

const modelService = new MultiModelService();

export const listModels = async (req: Request, res: Response): Promise<void> => {
  try {
    const models = modelService.getModels();
    res.json({
      success: true,
      models
    });
  } catch (error) {
    console.error('List models error:', error);
    res.status(500).json({ error: 'Failed to list models' });
  }
};

export const getModel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const model = modelService.getModel(id);

    if (!model) {
      res.status(404).json({ error: 'Model not found' });
      return;
    }

    res.json({
      success: true,
      model
    });
  } catch (error) {
    console.error('Get model error:', error);
    res.status(500).json({ error: 'Failed to get model' });
  }
};

export const generate = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      prompt,
      systemPrompt,
      model,
      models,
      parameters,
      taskType,
      capabilities,
      timeout,
      streaming
    } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    const response = await modelService.generate({
      prompt,
      systemPrompt,
      preferredModels: model ? [model] : models,
      parameters,
      taskType: taskType as TaskType,
      capabilities,
      timeout,
      streaming
    });

    res.json({
      success: true,
      response
    });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
};

export const generateEnsemble = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      prompt,
      models,
      strategy,
      votingConfig,
      aggregationConfig
    } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    if (!models || !Array.isArray(models) || models.length < 2) {
      res.status(400).json({ error: 'At least 2 models are required for ensemble' });
      return;
    }

    const result = await modelService.generateEnsemble({
      prompt,
      models,
      strategy: strategy as EnsembleStrategy || EnsembleStrategy.VOTING,
      votingConfig,
      aggregationConfig
    });

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Ensemble generation error:', error);
    res.status(500).json({ error: 'Failed to generate ensemble response' });
  }
};

export const autoSelect = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      taskType,
      complexity,
      latencyRequirement,
      qualityRequirement,
      budgetConstraint,
      requiredCapabilities,
      preferredProviders
    } = req.body;

    const config: AutoSelectConfig = {
      taskType: taskType as TaskType || TaskType.GENERAL,
      complexity: complexity || 'medium',
      latencyRequirement: latencyRequirement || 'medium',
      qualityRequirement: qualityRequirement || 'medium',
      budgetConstraint,
      requiredCapabilities,
      preferredProviders
    };

    const selection = modelService.autoSelectModel(config);

    res.json({
      success: true,
      selection
    });
  } catch (error) {
    console.error('Auto-select error:', error);
    res.status(500).json({ error: 'Failed to auto-select model' });
  }
};

export const routeRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      prompt,
      systemPrompt,
      context,
      taskType,
      capabilities
    } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    const decision = await modelService.routeRequest({
      prompt,
      systemPrompt,
      context,
      taskType: taskType as TaskType,
      capabilities
    });

    res.json({
      success: true,
      decision
    });
  } catch (error) {
    console.error('Route request error:', error);
    res.status(500).json({ error: 'Failed to route request' });
  }
};

export const getPerformance = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const performance = modelService.getPerformanceHistory(id);

    if (!performance) {
      res.status(404).json({ error: 'Model performance data not found' });
      return;
    }

    res.json({
      success: true,
      performance
    });
  } catch (error) {
    console.error('Get performance error:', error);
    res.status(500).json({ error: 'Failed to get performance data' });
  }
};

export const addModel = async (req: Request, res: Response): Promise<void> => {
  try {
    const modelConfig = req.body;

    if (!modelConfig.id || !modelConfig.name || !modelConfig.modelId) {
      res.status(400).json({ error: 'Model ID, name, and modelId are required' });
      return;
    }

    modelService.addModel(modelConfig);

    res.status(201).json({
      success: true,
      message: 'Model added successfully'
    });
  } catch (error) {
    console.error('Add model error:', error);
    res.status(500).json({ error: 'Failed to add model' });
  }
};

export const updateModel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    modelService.updateModel(id, updates);

    res.json({
      success: true,
      message: 'Model updated successfully'
    });
  } catch (error) {
    console.error('Update model error:', error);
    res.status(500).json({ error: 'Failed to update model' });
  }
};

export const removeModel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    modelService.removeModel(id);

    res.json({
      success: true,
      message: 'Model removed successfully'
    });
  } catch (error) {
    console.error('Remove model error:', error);
    res.status(500).json({ error: 'Failed to remove model' });
  }
};
