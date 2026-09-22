/**
 * Resource Budgeting Service
 * 
 * Automatic resource allocation and scaling:
 * - Dynamic resource budgeting
 * - Auto-scaling based on demand
 * - GPU scheduling
 * - Memory pool management
 * - Cost optimization
 * 
 * @class ResourceBudgetingService
 * @version 1.0.0
 */

const { EventEmitter } = require('events');
const si = require('systeminformation');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');

class ResourceBudgetingService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.hibernationService = options.hibernationService;
    
    this.config = {
      autoScale: options.autoScale !== false,
      gpuAllocation: options.gpuAllocation || 'dynamic', // static, dynamic
      memoryPoolSize: options.memoryPoolSize || '80%', // Percentage of total RAM
      cpuLimit: options.cpuLimit || 80, // Max CPU usage
      scaleUpThreshold: options.scaleUpThreshold || 70,
      scaleDownThreshold: options.scaleDownThreshold || 30,
      minInstances: options.minInstances || 1,
      maxInstances: options.maxInstances || 10,
      ...options,
    };
    
    this.redis = null;
    this.isInitialized = false;
    
    // Resource pools
    this.memoryPool = {
      total: 0,
      used: 0,
      allocated: new Map(),
    };
    
    this.gpuPool = {
      total: 0,
      used: 0,
      allocated: new Map(),
    };
    
    this.cpuPool = {
      total: 100,
      used: 0,
      allocated: new Map(),
    };
    
    // Scaling state
    this.scalingState = {
      instances: 1,
      targetInstances: 1,
      lastScaleTime: Date.now(),
    };
    
    // Stats
    this.stats = {
      totalAllocations: 0,
      totalDeallocations: 0,
      scaleUps: 0,
      scaleDowns: 0,
      memorySaved: 0,
    };
    
    this.monitorTimer = null;
  }

  async initialize() {
    try {
      logger.info('📊 Initializing Resource Budgeting Service...');
      
      this.redis = await getRedisClient();
      
      // Detect system resources
      await this.detectResources();
      
      // Start monitoring
      this.startMonitoring();
      
      this.isInitialized = true;
      logger.info('✅ Resource Budgeting Service initialized');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Resource Budgeting:', error);
      throw error;
    }
  }

  async detectResources() {
    try {
      // Detect memory
      const mem = await si.mem();
      this.memoryPool.total = Math.floor(mem.total * 0.8); // 80% of total
      
      // Detect GPUs
      const gpus = await si.graphics();
      this.gpuPool.total = gpus.controllers.length;
      
      // Detect CPUs
      const cpu = await si.cpu();
      this.cpuPool.total = cpu.cores;
      
      logger.info('📊 System resources detected:');
      logger.info(`   Memory: ${(this.memoryPool.total / 1024 / 1024 / 1024).toFixed(1)} GB`);
      logger.info(`   GPUs: ${this.gpuPool.total}`);
      logger.info(`   CPUs: ${this.cpuPool.total} cores`);
      
    } catch (error) {
      logger.warn('⚠️ Could not detect system resources:', error.message);
    }
  }

  /**
   * Allocate resources for a service
   * @param {Object} request - Resource allocation request
   * @returns {Promise<Object>} Allocation result
   */
  async allocate(request) {
    const allocationId = uuidv4();
    
    logger.info(`📦 Allocating resources: ${request.serviceName} (${allocationId})`);
    
    const allocation = {
      id: allocationId,
      serviceId: request.serviceId || allocationId,
      serviceName: request.serviceName,
      memory: request.memory || 512 * 1024 * 1024, // 512MB default
      gpu: request.gpu || 0,
      cpu: request.cpu || 1,
      priority: request.priority || 'normal',
      duration: request.duration || 3600000, // 1 hour
      createdAt: Date.now(),
      expiresAt: Date.now() + (request.duration || 3600000),
    };
    
    // Check availability
    const available = this.checkAvailability(allocation);
    
    if (!available.sufficient) {
      logger.warn(`⚠️ Insufficient resources: ${available.reason}`);
      
      // Try to free resources
      if (this.config.autoScale) {
        await this.optimizeAllocations();
      }
      
      // Recheck
      const recheck = this.checkAvailability(allocation);
      if (!recheck.sufficient) {
        throw new Error(`Insufficient resources: ${recheck.reason}`);
      }
    }
    
    // Allocate
    this.memoryPool.used += allocation.memory;
    this.memoryPool.allocated.set(allocationId, allocation);
    
    if (allocation.gpu > 0) {
      this.gpuPool.used += allocation.gpu;
      this.gpuPool.allocated.set(allocationId, allocation);
    }
    
    if (allocation.cpu > 0) {
      this.cpuPool.used += allocation.cpu;
      this.cpuPool.allocated.set(allocationId, allocation);
    }
    
    // Store allocation
    await this.saveAllocation(allocation);
    
    this.stats.totalAllocations++;
    
    logger.info(`✅ Resources allocated: ${allocation.memory / 1024 / 1024}MB, GPU: ${allocation.gpu}, CPU: ${allocation.cpu}`);
    
    return {
      allocationId,
      memory: allocation.memory,
      gpu: allocation.gpu,
      cpu: allocation.cpu,
      expiresAt: allocation.expiresAt,
    };
  }

  /**
   * Deallocate resources
   * @param {string} allocationId - Allocation identifier
   * @returns {Promise<Object>} Deallocation result
   */
  async deallocate(allocationId) {
    const allocation = this.memoryPool.allocated.get(allocationId);
    
    if (!allocation) {
      return { allocationId, status: 'not_found' };
    }
    
    logger.info(`🗑️ Deallocating resources: ${allocationId}`);
    
    // Free memory
    this.memoryPool.used -= allocation.memory;
    this.memoryPool.allocated.delete(allocationId);
    
    // Free GPU
    if (allocation.gpu > 0) {
      this.gpuPool.used -= allocation.gpu;
      this.gpuPool.allocated.delete(allocationId);
    }
    
    // Free CPU
    if (allocation.cpu > 0) {
      this.cpuPool.used -= allocation.cpu;
      this.cpuPool.allocated.delete(allocationId);
    }
    
    // Remove from Redis
    await this.redis.del(`resource:allocation:${allocationId}`);
    
    this.stats.totalDeallocations++;
    this.stats.memorySaved += allocation.memory;
    
    logger.info(`✅ Resources deallocated: ${allocationId}`);
    
    return {
      allocationId,
      memoryFreed: allocation.memory,
      status: 'deallocated',
    };
  }

  checkAvailability(allocation) {
    if (this.memoryPool.total - this.memoryPool.used < allocation.memory) {
      return {
        sufficient: false,
        reason: `Insufficient memory (${this.memoryPool.total - this.memoryPool.used} available)`,
      };
    }
    
    if (this.gpuPool.total - this.gpuPool.used < allocation.gpu) {
      return {
        sufficient: false,
        reason: `Insufficient GPU (${this.gpuPool.total - this.gpuPool.used} available)`,
      };
    }
    
    if (this.cpuPool.total - this.cpuPool.used < allocation.cpu) {
      return {
        sufficient: false,
        reason: `Insufficient CPU (${this.cpuPool.total - this.cpuPool.used} available)`,
      };
    }
    
    return { sufficient: true };
  }

  async optimizeAllocations() {
    logger.info('🔧 Optimizing allocations...');
    
    // Find low-priority allocations to free
    const candidates = [];
    
    for (const [id, allocation] of this.memoryPool.allocated) {
      if (allocation.priority === 'low' && Date.now() > allocation.expiresAt) {
        candidates.push(id);
      }
    }
    
    // Deallocate expired low-priority allocations
    for (const id of candidates) {
      await this.deallocate(id);
    }
    
    // If still not enough, try to hibernate services
    if (this.hibernationService) {
      await this.hibernationService.hibernateAll();
    }
    
    logger.info(`✅ Optimized ${candidates.length} allocations`);
  }

  startMonitoring() {
    this.monitorTimer = setInterval(async () => {
      await this.monitorResources();
    }, 10000); // Every 10 seconds
    
    logger.info('🔍 Resource monitoring started');
  }

  async monitorResources() {
    try {
      // Get current system stats
      const mem = await si.mem();
      const currentMemoryUsage = ((mem.active / mem.total) * 100).toFixed(1);
      
      const load = await si.currentLoad();
      const currentCpuUsage = load.currentLoad.toFixed(1);
      
      // Store metrics
      await this.redis.setex('resource:memory:usage', 30, currentMemoryUsage);
      await this.redis.setex('resource:cpu:usage', 30, currentCpuUsage);
      await this.redis.setex('resource:gpu:usage', 30, this.gpuPool.used.toString());
      
      // Auto-scaling logic
      if (this.config.autoScale) {
        const memoryUsage = parseFloat(currentMemoryUsage);
        
        if (memoryUsage > this.config.scaleUpThreshold) {
          await this.scaleUp();
        } else if (memoryUsage < this.config.scaleDownThreshold) {
          await this.scaleDown();
        }
      }
      
      // Clean up expired allocations
      await this.cleanupExpired();
      
    } catch (error) {
      logger.error('❌ Resource monitoring failed:', error);
    }
  }

  async scaleUp() {
    if (this.scalingState.instances >= this.config.maxInstances) {
      return;
    }
    
    if (Date.now() - this.scalingState.lastScaleTime < 60000) {
      return; // Cool down period
    }
    
    logger.info(`📈 Scaling up: ${this.scalingState.instances} → ${this.scalingState.instances + 1}`);
    
    this.scalingState.targetInstances = Math.min(
      this.scalingState.instances + 1,
      this.config.maxInstances
    );
    
    this.scalingState.instances = this.scalingState.targetInstances;
    this.scalingState.lastScaleTime = Date.now();
    
    this.stats.scaleUps++;
    
    this.emit('scaling:up', this.scalingState);
  }

  async scaleDown() {
    if (this.scalingState.instances <= this.config.minInstances) {
      return;
    }
    
    if (Date.now() - this.scalingState.lastScaleTime < 60000) {
      return;
    }
    
    logger.info(`📉 Scaling down: ${this.scalingState.instances} → ${this.scalingState.instances - 1}`);
    
    this.scalingState.targetInstances = Math.max(
      this.scalingState.instances - 1,
      this.config.minInstances
    );
    
    this.scalingState.instances = this.scalingState.targetInstances;
    this.scalingState.lastScaleTime = Date.now();
    
    this.stats.scaleDowns++;
    
    this.emit('scaling:down', this.scalingState);
  }

  async cleanupExpired() {
    const now = Date.now();
    const expired = [];
    
    for (const [id, allocation] of this.memoryPool.allocated) {
      if (now > allocation.expiresAt) {
        expired.push(id);
      }
    }
    
    for (const id of expired) {
      await this.deallocate(id);
    }
    
    if (expired.length > 0) {
      logger.info(`🧹 Cleaned up ${expired.length} expired allocations`);
    }
  }

  async saveAllocation(allocation) {
    try {
      await this.redis.setex(
        `resource:allocation:${allocation.id}`,
        Math.ceil((allocation.expiresAt - Date.now()) / 1000),
        JSON.stringify(allocation)
      );
    } catch (error) {
      logger.warn('⚠️ Could not save allocation:', error.message);
    }
  }

  getResourceStatus() {
    return {
      memory: {
        total: this.memoryPool.total,
        used: this.memoryPool.used,
        free: this.memoryPool.total - this.memoryPool.used,
        usagePercent: ((this.memoryPool.used / this.memoryPool.total) * 100).toFixed(1),
        allocations: this.memoryPool.allocated.size,
      },
      gpu: {
        total: this.gpuPool.total,
        used: this.gpuPool.used,
        free: this.gpuPool.total - this.gpuPool.used,
        allocations: this.gpuPool.allocated.size,
      },
      cpu: {
        total: this.cpuPool.total,
        used: this.cpuPool.used,
        free: this.cpuPool.total - this.cpuPool.used,
        allocations: this.cpuPool.allocated.size,
      },
      scaling: this.scalingState,
    };
  }

  getStats() {
    return {
      ...this.stats,
      ...this.getResourceStatus(),
      autoScale: this.config.autoScale,
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Resource Budgeting Service...');
    
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
    }
    
    // Deallocate all
    for (const [id] of this.memoryPool.allocated) {
      await this.deallocate(id);
    }
    
    if (this.redis) {
      await this.redis.quit();
    }
    
    logger.info('✅ Resource Budgeting Service shutdown complete');
  }
}

module.exports = ResourceBudgetingService;
