/**
 * Type Definitions for Polyglot Interpreter
 */

export interface ExecutionRequest {
  code: string;
  language: string;
  timeout?: number;
  memoryLimit?: number;
  cpuLimit?: number;
  allowNetwork?: boolean;
  stdin?: string;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  sessionId: string;
  executionTime: number;
}

export interface LanguageConfig {
  name: string;
  version: string;
  image: string;
  fileExtension: string;
  command: string[];
  timeout: number;
  memoryLimit: number;
  cpuLimit: number;
}

export interface ExecutionSession {
  id: string;
  language: string;
  createdAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'error';
  containerId?: string;
}

export interface ExecuteRequest {
  code: string;
  language: string;
  stdin?: string;
  timeout?: number;
}

export interface ExecuteResponse {
  success: boolean;
  data?: ExecutionResult;
  error?: string;
}
