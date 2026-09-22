export interface Agent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  defaultModel: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
  priority: number;
}

export interface Task {
  id: string;
  type: string;
  input: string;
  context?: Record<string, any>;
  agentId?: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: TaskResult;
  error?: string;
  parentTaskId?: string;
  subTasks?: string[];
  userId: string;
}

export type TaskStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface TaskResult {
  output: string;
  data?: any;
  metadata?: {
    model?: string;
    tokensUsed?: number;
    executionTime?: number;
    agentId?: string;
  };
}

export interface TaskRoutingRule {
  pattern: string;
  agent: string;
  confidence: number;
}

export interface ExecutionPlan {
  taskId: string;
  steps: ExecutionStep[];
  parallel: boolean;
  dependencies: Map<string, string[]>;
}

export interface ExecutionStep {
  id: string;
  agentId: string;
  input: string;
  dependencies: string[];
  status: TaskStatus;
  result?: TaskResult;
}

export interface AgentMessage {
  from: string;
  to: string;
  content: string;
  type: 'request' | 'response' | 'broadcast';
  timestamp: Date;
  metadata?: any;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  enabled: boolean;
}

export interface WorkflowStep {
  id: string;
  agentId: string;
  input: string;
  outputVar: string;
  condition?: string;
}

export interface WorkflowTrigger {
  type: 'schedule' | 'event' | 'webhook';
  config: Record<string, any>;
}
