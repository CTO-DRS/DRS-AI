/**
 * Optimizer Routes
 * API endpoints for edge optimization
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createLogger } from '../utils/logger';
import { QuantizationService } from '../services/QuantizationService';
import { ResourceMonitor } from '../services/ResourceMonitor';
import { BatteryMonitor } from '../services/BatteryMonitor';
import { ThreadManager } from '../services/ThreadManager';

const logger = createLogger('OptimizerRoutes');

// Validation schemas
const QuantizeSchema = z.object({
  modelName: z.string(),
  targetLevel: z.enum([
    'Q2_K', 'Q3_K_S', 'Q3_K_M', 'Q3_K_L',
    'Q4_0', 'Q4_K_S', 'Q4_K_M',
    'Q5_0', 'Q5_K_S', 'Q5_K_M',
    'Q6_K', 'Q8_0'
  ]).optional(),
  availableMemory: z.number().optional()
});

const ThreadConfigSchema = z.object({
  minThreads: z.number().min(1).optional(),
  maxThreads: z.number().min(1).optional(),
  currentThreads: z.number().min(1).optional(),
  queueSize: z.number().min(1).optional()
});

export class OptimizerController {
  public router: Router;

  constructor(
    private quantizationService: QuantizationService,
    private resourceMonitor: ResourceMonitor,
    private batteryMonitor: BatteryMonitor,
    private threadManager: ThreadManager
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Get available models
    this.router.get('/models', async (req: Request, res: Response) => {
      try {
        const models = await this.quantizationService.getAvailableModels();
        res.json({
          success: true,
          data: models
        });
      } catch (error) {
        logger.error('Failed to get models:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get model info
    this.router.get('/models/:name', async (req: Request, res: Response) => {
      try {
        const info = await this.quantizationService.getModelInfo(req.params.name);
        if (!info) {
          return res.status(404).json({
            success: false,
            error: 'Model not found'
          });
        }
        res.json({
          success: true,
          data: info
        });
      } catch (error) {
        logger.error('Failed to get model info:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Auto-quantize model
    this.router.post('/quantize', async (req: Request, res: Response) => {
      try {
        const data = QuantizeSchema.parse(req.body);
        
        let result;
        if (data.targetLevel) {
          result = await this.quantizationService.quantizeModel(
            data.modelName,
            data.targetLevel
          );
        } else {
          const availableMemory = data.availableMemory || 
            (await this.resourceMonitor.getStats()).memory.available;
          result = await this.quantizationService.autoQuantize(
            data.modelName,
            availableMemory
          );
        }

        res.status(result.success ? 200 : 400).json(result);
      } catch (error) {
        logger.error('Quantization failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get quantization recommendations
    this.router.get('/recommendations', async (req: Request, res: Response) => {
      try {
        const stats = await this.resourceMonitor.getStats();
        const recommendations = await this.quantizationService.getRecommendations(
          stats.memory.available
        );
        
        res.json({
          success: true,
          data: {
            availableMemory: stats.memory.available,
            recommendations
          }
        });
      } catch (error) {
        logger.error('Failed to get recommendations:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get system resources
    this.router.get('/resources', async (req: Request, res: Response) => {
      try {
        const stats = await this.resourceMonitor.getStats();
        res.json({
          success: true,
          data: stats
        });
      } catch (error) {
        logger.error('Failed to get resources:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get battery info
    this.router.get('/battery', async (req: Request, res: Response) => {
      try {
        const info = await this.batteryMonitor.getBatteryInfo();
        res.json({
          success: true,
          data: {
            ...info,
            powerProfile: this.batteryMonitor.getPowerProfile()
          }
        });
      } catch (error) {
        logger.error('Failed to get battery info:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Set power profile
    this.router.post('/power-profile', async (req: Request, res: Response) => {
      try {
        const { profile } = z.object({
          profile: z.enum(['powersave', 'balanced', 'performance'])
        }).parse(req.body);

        this.batteryMonitor.setPowerProfile(profile);
        
        res.json({
          success: true,
          data: {
            profile,
            recommendedThreads: this.batteryMonitor.getRecommendedThreads(),
            recommendedBatchSize: this.batteryMonitor.getRecommendedBatchSize()
          }
        });
      } catch (error) {
        logger.error('Failed to set power profile:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get thread config
    this.router.get('/threads', async (req: Request, res: Response) => {
      try {
        const config = this.threadManager.getConfig();
        res.json({
          success: true,
          data: config
        });
      } catch (error) {
        logger.error('Failed to get thread config:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Update thread config
    this.router.put('/threads', async (req: Request, res: Response) => {
      try {
        const config = ThreadConfigSchema.parse(req.body);
        this.threadManager.updateConfig(config);
        
        res.json({
          success: true,
          data: this.threadManager.getConfig()
        });
      } catch (error) {
        logger.error('Failed to update thread config:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get LLM settings
    this.router.get('/llm-settings', async (req: Request, res: Response) => {
      try {
        const settings = this.threadManager.getLLMSettings();
        res.json({
          success: true,
          data: settings
        });
      } catch (error) {
        logger.error('Failed to get LLM settings:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get resource budget
    this.router.get('/budget/:taskType', async (req: Request, res: Response) => {
      try {
        const { taskType } = req.params;
        const budget = this.threadManager.getResourceBudget(taskType as any);
        
        res.json({
          success: true,
          data: budget
        });
      } catch (error) {
        logger.error('Failed to get resource budget:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get optimization status
    this.router.get('/status', async (req: Request, res: Response) => {
      try {
        const [resources, battery, threadConfig] = await Promise.all([
          this.resourceMonitor.getStats(),
          this.batteryMonitor.getBatteryInfo(),
          Promise.resolve(this.threadManager.getConfig())
        ]);

        res.json({
          success: true,
          data: {
            resources,
            battery: {
              ...battery,
              powerProfile: this.batteryMonitor.getPowerProfile()
            },
            threads: threadConfig,
            llmSettings: this.threadManager.getLLMSettings()
          }
        });
      } catch (error) {
        logger.error('Failed to get status:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }
}
