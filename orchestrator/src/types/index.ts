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
  /** Human-in-the-loop gate: when true the task parks in awaiting_approval */
  requireApproval?: boolean;
}

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface TaskResult {
  output: string;
  data?: any;
  metadata?: {
    model?: string;
    tokensUsed?: number;
    executionTime?: number;
    agentId?: string;
    planId?: string;
    steps?: number;
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

/** Persisted plan (drSai TaskPlanner style) */
export interface TaskPlan {
  id: string;
  taskId: string;
  summary: string;
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed';
  steps: Array<{
    id: string;
    description: string;
    agentType: string;
    status: TaskStatus;
    result?: string;
    mcp?: { serverId: string; tool: string; args: Record<string, any> };
  }>;
}

/** Human-in-the-loop approval (drSai approval_guard style) */
export interface ApprovalRequest {
  id: string;
  userId: string;
  taskId?: string;
  type: 'task_execution' | 'dangerous_action' | 'mcp_tool_call' | 'plan_execution';
  payload: { title: string; detail?: string; action?: string; meta?: Record<string, any> };
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  decidedBy?: string;
  decidedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
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

/** Multi-agent team (drSai group-chat style) */
export interface Team {
  id: string;
  name: string;
  description?: string;
  agentIds: string[];
  strategy: 'round_robin' | 'selector';
  maxRounds: number;
  selectorModel?: string;
  terminatePhrase: string;
  createdBy: string;
  isActive: boolean;
}

export interface TeamRunResult {
  id: string;
  teamId: string;
  status: string;
  rounds: number;
  transcript: Array<{ round: number; agentId: string; agentName: string; content: string; timestamp: string }>;
  result?: string;
  error?: string;
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
