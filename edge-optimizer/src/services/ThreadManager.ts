/**
 * Thread Manager
 * Dynamic thread adjustment based on system resources
 */

import { createLogger } from '../utils/logger';
import { ResourceMonitor } from './ResourceMonitor';
import { BatteryMonitor } from './BatteryMonitor';
import { ThreadConfig } from '../models/types';
import { EventEmitter } from 'events';

const logger = createLogger('ThreadManager');

export class ThreadManager extends EventEmitter {
  private currentConfig: ThreadConfig;
  private isAdaptive: boolean = true;

  constructor(
    private resourceMonitor: ResourceMonitor,
    private batteryMonitor: BatteryMonitor
  ) {
    super();
    
    const cpuCount = require('os').cpus().length;
    this.currentConfig = {
      minThreads: 1,
      maxThreads: cpuCount,
      currentThreads: Math.max(1, Math.floor(cpuCount / 2)),
      queueSize: 100
    };
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Thread Manager...');
    logger.info(`CPU cores: ${this.currentConfig.maxThreads}`);
    logger.info(`Initial threads: ${this.currentConfig.currentThreads}`);

    // Listen to resource events
    this.resourceMonitor.on('threshold:cpu', (data) => {
      logger.warn(`CPU threshold exceeded: ${data.current}%`);
      this.reduceThreads();
    });

    this.resourceMonitor.on('threshold:memory', (data) => {
      logger.warn(`Memory threshold exceeded: ${data.current}%`);
      this.reduceThreads();
    });

    // Listen to battery events
    this.batteryMonitor.on('battery:low', () => {
      logger.warn('Low battery detected');
      this.setAdaptiveMode(true);
      this.reduceThreads();
    });

    this.batteryMonitor.on('profile:change', (profile) => {
      this.adjustForPowerProfile(profile);
    });

    // Start adaptive monitoring
    if (this.isAdaptive) {
      this.startAdaptiveMonitoring();
    }

    logger.info('✅ Thread Manager initialized');
  }

  private startAdaptiveMonitoring(): void {
    setInterval(() => {
      this.adaptiveAdjust();
    }, 10000); // Check every 10 seconds
  }

  private async adaptiveAdjust(): Promise<void> {
    if (!this.isAdaptive) return;

    try {
      const stats = await this.resourceMonitor.getStats();
      const batteryInfo = await this.batteryMonitor.getBatteryInfo();

      // Calculate optimal thread count
      let targetThreads = this.currentConfig.currentThreads;

      // Reduce threads if CPU usage is high
      if (stats.cpu.usage > 70) {
        targetThreads = Math.max(this.currentConfig.minThreads, targetThreads - 1);
      }

      // Reduce threads if memory usage is high
      if (stats.memory.percent > 80) {
        targetThreads = Math.max(this.currentConfig.minThreads, targetThreads - 1);
      }

      // Reduce threads if battery is low and not charging
      if (batteryInfo.level < 30 && !batteryInfo.isCharging) {
        targetThreads = Math.max(this.currentConfig.minThreads, Math.floor(targetThreads / 2));
      }

      // Increase threads if resources are available
      if (stats.cpu.usage < 30 && stats.memory.percent < 50 && targetThreads < this.currentConfig.maxThreads) {
        targetThreads = Math.min(this.currentConfig.maxThreads, targetThreads + 1);
      }

      // Apply change if different
      if (targetThreads !== this.currentConfig.currentThreads) {
        this.setThreadCount(targetThreads);
      }
    } catch (error) {
      logger.error('Adaptive adjustment failed:', error);
    }
  }

  setThreadCount(count: number): void {
    const oldCount = this.currentConfig.currentThreads;
    const newCount = Math.max(
      this.currentConfig.minThreads,
      Math.min(this.currentConfig.maxThreads, count)
    );

    if (oldCount !== newCount) {
      this.currentConfig.currentThreads = newCount;
      logger.info(`Thread count adjusted: ${oldCount} -> ${newCount}`);
      this.emit('threads:change', { old: oldCount, new: newCount });
    }
  }

  increaseThreads(): void {
    if (this.currentConfig.currentThreads < this.currentConfig.maxThreads) {
      this.setThreadCount(this.currentConfig.currentThreads + 1);
    }
  }

  reduceThreads(): void {
    if (this.currentConfig.currentThreads > this.currentConfig.minThreads) {
      this.setThreadCount(this.currentConfig.currentThreads - 1);
    }
  }

  setAdaptiveMode(enabled: boolean): void {
    this.isAdaptive = enabled;
    logger.info(`Adaptive mode: ${enabled ? 'enabled' : 'disabled'}`);
  }

  private adjustForPowerProfile(profile: string): void {
    const cpuCount = this.currentConfig.maxThreads;

    switch (profile) {
      case 'powersave':
        this.setThreadCount(Math.max(1, Math.floor(cpuCount / 4)));
        break;
      case 'balanced':
        this.setThreadCount(Math.max(1, Math.floor(cpuCount / 2)));
        break;
      case 'performance':
        this.setThreadCount(cpuCount);
        break;
    }
  }

  getConfig(): ThreadConfig {
    return { ...this.currentConfig };
  }

  updateConfig(config: Partial<ThreadConfig>): void {
    this.currentConfig = { ...this.currentConfig, ...config };
    
    // Ensure current threads are within bounds
    this.currentConfig.currentThreads = Math.max(
      this.currentConfig.minThreads,
      Math.min(this.currentConfig.maxThreads, this.currentConfig.currentThreads)
    );

    logger.info('Thread config updated:', this.currentConfig);
  }

  /**
   * Get recommended settings for LLM inference
   */
  getLLMSettings(): {
    numThreads: number;
    batchSize: number;
    contextSize: number;
    gpuLayers: number;
  } {
    const powerProfile = this.batteryMonitor.getPowerProfile();
    const batteryInfo = { level: 100, isCharging: true }; // Fallback

    let numThreads = this.currentConfig.currentThreads;
    let batchSize = 512;
    let contextSize = 4096;
    let gpuLayers = 0;

    // Adjust based on power profile
    switch (powerProfile) {
      case 'powersave':
        numThreads = Math.max(1, Math.floor(numThreads / 2));
        batchSize = 128;
        contextSize = 2048;
        break;
      case 'balanced':
        batchSize = 512;
        contextSize = 4096;
        break;
      case 'performance':
        batchSize = 1024;
        contextSize = 8192;
        break;
    }

    // Further reduce if battery is low
    if (batteryInfo.level < 20 && !batteryInfo.isCharging) {
      numThreads = Math.max(1, Math.floor(numThreads / 2));
      batchSize = Math.floor(batchSize / 2);
      contextSize = Math.floor(contextSize / 2);
    }

    return {
      numThreads,
      batchSize,
      contextSize,
      gpuLayers
    };
  }

  /**
   * Get resource budget for a task
   */
  getResourceBudget(taskType: 'inference' | 'training' | 'indexing'): {
    maxCpuPercent: number;
    maxMemoryPercent: number;
    maxDuration: number;
  } {
    const powerProfile = this.batteryMonitor.getPowerProfile();

    const budgets = {
      powersave: {
        inference: { maxCpuPercent: 50, maxMemoryPercent: 60, maxDuration: 300000 },
        training: { maxCpuPercent: 30, maxMemoryPercent: 50, maxDuration: 600000 },
        indexing: { maxCpuPercent: 40, maxMemoryPercent: 55, maxDuration: 300000 }
      },
      balanced: {
        inference: { maxCpuPercent: 70, maxMemoryPercent: 75, maxDuration: 600000 },
        training: { maxCpuPercent: 60, maxMemoryPercent: 70, maxDuration: 1800000 },
        indexing: { maxCpuPercent: 65, maxMemoryPercent: 70, maxDuration: 900000 }
      },
      performance: {
        inference: { maxCpuPercent: 90, maxMemoryPercent: 85, maxDuration: 1200000 },
        training: { maxCpuPercent: 80, maxMemoryPercent: 80, maxDuration: 3600000 },
        indexing: { maxCpuPercent: 85, maxMemoryPercent: 80, maxDuration: 1800000 }
      }
    };

    return budgets[powerProfile][taskType];
  }
}
