/**
 * Type Definitions for Edge Optimizer
 */

export type QuantizationLevel = 
  | 'Q2_K' | 'Q3_K_S' | 'Q3_K_M' | 'Q3_K_L'
  | 'Q4_0' | 'Q4_K_S' | 'Q4_K_M'
  | 'Q5_0' | 'Q5_K_S' | 'Q5_K_M'
  | 'Q6_K' | 'Q8_0';

export interface QuantizationConfig {
  level: QuantizationLevel;
  bits: number;
  estimatedSize: number;
  description: string;
}

export interface ModelInfo {
  name: string;
  size: number;
  modified: string;
  digest: string;
  details?: any;
}

export interface QuantizationResult {
  success: boolean;
  originalModel: string;
  quantizedModel?: string;
  level: QuantizationLevel;
  processingTime: number;
  message: string;
}

export interface ResourceStats {
  timestamp: number;
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percent: number;
    available: number;
  };
  temperature: number;
  disk: Array<{
    filesystem: string;
    size: number;
    used: number;
    available: number;
    percent: number;
  }>;
}

export interface ResourceThresholds {
  cpu: number;
  memory: number;
  temperature: number;
}

export interface BatteryInfo {
  level: number;
  isCharging: boolean;
  temperature?: number;
  voltage?: number;
  health?: string;
  technology?: string;
  timestamp: number;
}

export type PowerProfile = 'powersave' | 'balanced' | 'performance';

export interface ThreadConfig {
  minThreads: number;
  maxThreads: number;
  currentThreads: number;
  queueSize: number;
}

export interface OptimizationRequest {
  modelName?: string;
  action: 'quantize' | 'optimize' | 'get-recommendations';
  options?: {
    targetLevel?: QuantizationLevel;
    availableMemory?: number;
  };
}

export interface OptimizationResult {
  success: boolean;
  action: string;
  data?: any;
  message: string;
}
