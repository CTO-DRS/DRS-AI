/**
 * Resource Monitor
 * Monitors CPU, Memory, and system resources
 */

import { createLogger } from '../utils/logger';
import si from 'systeminformation';
import pidusage from 'pidusage';
import { ResourceStats, ResourceThresholds } from '../models/types';
import { EventEmitter } from 'events';

const logger = createLogger('ResourceMonitor');

export class ResourceMonitor extends EventEmitter {
  private isRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly DEFAULT_INTERVAL = 5000; // 5 seconds
  private thresholds: ResourceThresholds;

  constructor() {
    super();
    this.thresholds = {
      cpu: 80,    // 80% CPU
      memory: 85, // 85% memory
      temperature: 70 // 70°C
    };
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Resource Monitor...');
    logger.info(`Thresholds: CPU=${this.thresholds.cpu}%, Memory=${this.thresholds.memory}%`);
    
    // Start monitoring
    this.start();
    
    logger.info('✅ Resource Monitor initialized');
  }

  start(interval: number = this.DEFAULT_INTERVAL): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.monitoringInterval = setInterval(() => this.collectStats(), interval);
    logger.info(`Resource monitoring started (${interval}ms interval)`);
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    logger.info('Resource monitoring stopped');
  }

  private async collectStats(): Promise<void> {
    try {
      const stats = await this.getStats();
      
      // Emit stats
      this.emit('stats', stats);

      // Check thresholds
      this.checkThresholds(stats);
    } catch (error) {
      logger.error('Failed to collect stats:', error);
    }
  }

  async getStats(): Promise<ResourceStats> {
    const [cpu, mem, load, temp, disk] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.load(),
      si.cpuTemperature().catch(() => ({ main: 0 })),
      si.fsSize()
    ]);

    return {
      timestamp: Date.now(),
      cpu: {
        usage: cpu.currentLoad,
        cores: cpu.cpus.length,
        loadAverage: load
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        percent: (mem.used / mem.total) * 100,
        available: mem.available
      },
      temperature: temp.main || 0,
      disk: disk.map(d => ({
        filesystem: d.fs,
        size: d.size,
        used: d.used,
        available: d.available,
        percent: d.use
      }))
    };
  }

  private checkThresholds(stats: ResourceStats): void {
    // CPU threshold
    if (stats.cpu.usage > this.thresholds.cpu) {
      this.emit('threshold:cpu', {
        current: stats.cpu.usage,
        threshold: this.thresholds.cpu
      });
    }

    // Memory threshold
    if (stats.memory.percent > this.thresholds.memory) {
      this.emit('threshold:memory', {
        current: stats.memory.percent,
        threshold: this.thresholds.memory
      });
    }

    // Temperature threshold
    if (stats.temperature > this.thresholds.temperature) {
      this.emit('threshold:temperature', {
        current: stats.temperature,
        threshold: this.thresholds.temperature
      });
    }
  }

  async getProcessStats(pid: number = process.pid): Promise<{
    cpu: number;
    memory: number;
    ppid: number;
    pid: number;
    ctime: number;
    elapsed: number;
    timestamp: number;
  }> {
    try {
      return await pidusage(pid);
    } catch (error) {
      logger.error(`Failed to get process stats for ${pid}:`, error);
      throw error;
    }
  }

  async getTopProcesses(limit: number = 10): Promise<Array<{
    pid: number;
    name: string;
    cpu: number;
    mem: number;
  }>> {
    try {
      const processes = await si.processes();
      
      return processes.list
        .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
        .slice(0, limit)
        .map(p => ({
          pid: p.pid,
          name: p.name,
          cpu: p.cpu || 0,
          mem: p.memRss || 0
        }));
    } catch (error) {
      logger.error('Failed to get top processes:', error);
      return [];
    }
  }

  setThresholds(thresholds: Partial<ResourceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    logger.info('Thresholds updated:', this.thresholds);
  }

  getThresholds(): ResourceThresholds {
    return { ...this.thresholds };
  }

  isMonitoring(): boolean {
    return this.isRunning;
  }
}
