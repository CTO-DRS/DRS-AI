export interface Workflow {
  id: string;
  name: string;
  description?: string;
  userId: string;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastRunAt?: Date;
  runCount: number;
}

export interface WorkflowTrigger {
  type: 'schedule' | 'webhook' | 'event' | 'manual';
  config: TriggerConfig;
}

export interface TriggerConfig {
  // For schedule trigger
  cron?: string;
  timezone?: string;
  // For webhook trigger
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  secret?: string;
  // For event trigger
  eventType?: string;
  eventFilter?: Record<string, any>;
}

export interface WorkflowCondition {
  id: string;
  type: 'if' | 'and' | 'or' | 'not';
  field?: string;
  operator?: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'exists' | 'matches';
  value?: any;
  conditions?: WorkflowCondition[];
}

export interface WorkflowAction {
  id: string;
  type: 'agent' | 'api_call' | 'notification' | 'delay' | 'condition' | 'webhook' | 'email';
  name: string;
  config: ActionConfig;
  onSuccess?: string;
  onFailure?: string;
}

export interface ActionConfig {
  // For agent action
  agentId?: string;
  input?: string;
  // For API call
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  // For notification
  message?: string;
  channels?: string[];
  // For delay
  delayMs?: number;
  // For webhook
  webhookUrl?: string;
  // For email
  to?: string;
  subject?: string;
  bodyTemplate?: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  userId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  triggerData?: any;
  context: Record<string, any>;
  startedAt: Date;
  completedAt?: Date;
  results: ActionResult[];
  error?: string;
}

export interface ActionResult {
  actionId: string;
  status: 'success' | 'failure' | 'skipped';
  output?: any;
  error?: string;
  startedAt: Date;
  completedAt: Date;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  workflow: Partial<Workflow>;
  icon?: string;
}
