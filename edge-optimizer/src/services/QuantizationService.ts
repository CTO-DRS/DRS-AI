/**
 * Quantization Service
 * Auto-Quantization for Ollama models to fit Android memory
 */

import { createLogger } from '../utils/logger';
import { 
  QuantizationConfig, 
  ModelInfo, 
  QuantizationResult,
  QuantizationLevel 
} from '../models/types';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = createLogger('QuantizationService');

// Quantization levels and their memory requirements
const QUANTIZATION_LEVELS: Record<QuantizationLevel, { bits: number; description: string }> = {
  'Q2_K': { bits: 2.5, description: 'Smallest, significant quality loss' },
  'Q3_K_S': { bits: 3, description: 'Small, high quality loss' },
  'Q3_K_M': { bits: 3.5, description: 'Small, medium quality loss' },
  'Q3_K_L': { bits: 4, description: 'Small, low quality loss' },
  'Q4_0': { bits: 4.5, description: 'Legacy, balanced' },
  'Q4_K_S': { bits: 4.5, description: 'Recommended small' },
  'Q4_K_M': { bits: 5, description: 'Recommended medium' },
  'Q5_0': { bits: 5.5, description: 'High quality' },
  'Q5_K_S': { bits: 5.5, description: 'High quality small' },
  'Q5_K_M': { bits: 6, description: 'High quality medium' },
  'Q6_K': { bits: 6.5, description: 'Very high quality' },
  'Q8_0': { bits: 8.5, description: 'Maximum quality' }
};

export class QuantizationService {
  private ollamaHost: string;
  private modelsDir: string;

  constructor() {
    this.ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    this.modelsDir = process.env.OLLAMA_MODELS_DIR || '/root/.ollama/models';
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Quantization Service...');
    logger.info(`Ollama host: ${this.ollamaHost}`);
    logger.info(`Models directory: ${this.modelsDir}`);
    logger.info('✅ Quantization Service initialized');
  }

  /**
   * Get available models from Ollama
   */
  async getAvailableModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.ollamaHost}/api/tags`);
      const data = await response.json();

      return data.models.map((m: any) => ({
        name: m.name,
        size: m.size,
        modified: m.modified_at,
        digest: m.digest
      }));
    } catch (error) {
      logger.error('Failed to get models:', error);
      return [];
    }
  }

  /**
   * Get model details
   */
  async getModelInfo(modelName: string): Promise<ModelInfo | null> {
    try {
      const response = await fetch(`${this.ollamaHost}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName })
      });

      const data = await response.json();

      return {
        name: modelName,
        size: data.size || 0,
        modified: data.modified_at,
        digest: data.digest,
        details: data.details
      };
    } catch (error) {
      logger.error(`Failed to get model info for ${modelName}:`, error);
      return null;
    }
  }

  /**
   * Calculate optimal quantization level based on available memory
   */
  calculateOptimalQuantization(
    modelSize: number,
    availableMemory: number,
    targetMemoryUsage: number = 0.7
  ): QuantizationConfig {
    const targetSize = availableMemory * targetMemoryUsage;
    
    logger.info(`Model size: ${this.formatBytes(modelSize)}`);
    logger.info(`Available memory: ${this.formatBytes(availableMemory)}`);
    logger.info(`Target size: ${this.formatBytes(targetSize)}`);

    // Find the best quantization level
    let bestLevel: QuantizationLevel = 'Q2_K';
    let bestScore = -1;

    for (const [level, info] of Object.entries(QUANTIZATION_LEVELS)) {
      const estimatedSize = modelSize * (info.bits / 16); // Assuming FP16 baseline
      
      if (estimatedSize <= targetSize) {
        // Score based on quality (bits) while fitting in memory
        const score = info.bits;
        if (score > bestScore) {
          bestScore = score;
          bestLevel = level as QuantizationLevel;
        }
      }
    }

    const config: QuantizationConfig = {
      level: bestLevel,
      bits: QUANTIZATION_LEVELS[bestLevel].bits,
      estimatedSize: modelSize * (QUANTIZATION_LEVELS[bestLevel].bits / 16),
      description: QUANTIZATION_LEVELS[bestLevel].description
    };

    logger.info(`Optimal quantization: ${bestLevel} (${config.bits} bits)`);
    logger.info(`Estimated size: ${this.formatBytes(config.estimatedSize)}`);

    return config;
  }

  /**
   * Quantize a model
   */
  async quantizeModel(
    modelName: string,
    targetLevel: QuantizationLevel,
    options: {
      keepOriginal?: boolean;
      outputName?: string;
    } = {}
  ): Promise<QuantizationResult> {
    const startTime = Date.now();

    try {
      logger.info(`Quantizing ${modelName} to ${targetLevel}...`);

      // Pull the quantized version if available
      const quantizedName = options.outputName || `${modelName}:${targetLevel.toLowerCase()}`;
      
      // Use Ollama's pull API to get quantized version
      const response = await fetch(`${this.ollamaHost}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: quantizedName,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to pull quantized model: ${response.statusText}`);
      }

      const result = await response.json();

      return {
        success: true,
        originalModel: modelName,
        quantizedModel: quantizedName,
        level: targetLevel,
        processingTime: Date.now() - startTime,
        message: 'Model quantized successfully'
      };
    } catch (error) {
      logger.error('Quantization failed:', error);
      return {
        success: false,
        originalModel: modelName,
        level: targetLevel,
        processingTime: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Quantization failed'
      };
    }
  }

  /**
   * Auto-quantize based on available memory
   */
  async autoQuantize(
    modelName: string,
    availableMemory: number
  ): Promise<QuantizationResult> {
    const modelInfo = await this.getModelInfo(modelName);
    
    if (!modelInfo) {
      return {
        success: false,
        originalModel: modelName,
        message: 'Model not found'
      };
    }

    const config = this.calculateOptimalQuantization(
      modelInfo.size,
      availableMemory
    );

    return this.quantizeModel(modelName, config.level);
  }

  /**
   * Get quantization recommendations for all models
   */
  async getRecommendations(availableMemory: number): Promise<Array<{
    model: string;
    currentSize: number;
    recommendedLevel: QuantizationLevel;
    estimatedSize: number;
    savings: number;
  }>> {
    const models = await this.getAvailableModels();
    const recommendations = [];

    for (const model of models) {
      const config = this.calculateOptimalQuantization(
        model.size,
        availableMemory
      );

      recommendations.push({
        model: model.name,
        currentSize: model.size,
        recommendedLevel: config.level,
        estimatedSize: config.estimatedSize,
        savings: model.size - config.estimatedSize
      });
    }

    return recommendations.sort((a, b) => b.savings - a.savings);
  }

  /**
   * Delete a model to free up space
   */
  async deleteModel(modelName: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaHost}/api/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName })
      });

      return response.ok;
    } catch (error) {
      logger.error(`Failed to delete model ${modelName}:`, error);
      return false;
    }
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  getQuantizationLevels(): Record<QuantizationLevel, { bits: number; description: string }> {
    return { ...QUANTIZATION_LEVELS };
  }
}
