import { Request, Response } from 'express';
import { AutoBuilderService } from '../services/AutoBuilderService';
import { AppType, BuildConfig, DesignPreferences, TechStack } from '../types';

const builderService = new AutoBuilderService();

export const createBuildRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      description,
      name,
      type,
      techStack,
      features,
      design,
      config
    } = req.body;

    const userId = req.user?.id;

    if (!description) {
      res.status(400).json({ error: 'Description is required' });
      return;
    }

    const request = await builderService.createBuildRequest(userId, description, {
      name,
      type: type as AppType,
      techStack: techStack as Partial<TechStack>,
      features,
      design: design as Partial<DesignPreferences>,
      config: config as Partial<BuildConfig>
    });

    res.status(201).json({
      success: true,
      request
    });
  } catch (error) {
    console.error('Create build request error:', error);
    res.status(500).json({ error: 'Failed to create build request' });
  }
};

export const getBuildStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const status = await builderService.getBuildStatus(id);

    if (!status) {
      res.status(404).json({ error: 'Build request not found' });
      return;
    }

    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Get build status error:', error);
    res.status(500).json({ error: 'Failed to get build status' });
  }
};

export const getBuildResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await builderService.getBuildResult(id);

    if (!result) {
      res.status(404).json({ error: 'Build result not found' });
      return;
    }

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Get build result error:', error);
    res.status(500).json({ error: 'Failed to get build result' });
  }
};

export const downloadBuild = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const filePath = await builderService.downloadBuild(id);

    if (!filePath) {
      res.status(404).json({ error: 'Build not found' });
      return;
    }

    res.download(filePath, `app-${id}.zip`);
  } catch (error) {
    console.error('Download build error:', error);
    res.status(500).json({ error: 'Failed to download build' });
  }
};

export const parseRequirements = async (req: Request, res: Response): Promise<void> => {
  try {
    const { description } = req.body;

    if (!description) {
      res.status(400).json({ error: 'Description is required' });
      return;
    }

    const requirements = await builderService.parseRequirements(description);

    res.json({
      success: true,
      requirements
    });
  } catch (error) {
    console.error('Parse requirements error:', error);
    res.status(500).json({ error: 'Failed to parse requirements' });
  }
};
