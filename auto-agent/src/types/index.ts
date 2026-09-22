export interface AutoAgent {
  id: string;
  name: string;
  description: string;
  type: 'scheduled' | 'event-driven' | 'continuous';
  enabled: boolean;
  config: AgentConfig;
  schedule?: AgentSchedule;
  eventConfig?: EventConfig;
  lastRunAt?: Date;
  nextRunAt?: Date;
  runCount: number;
  successCount: number;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentConfig {
  agentId: string;
  input: string;
  context?: Record<string, any>;
  outputHandler?: string;
  notifications?: {
    onSuccess?: boolean;
    onFailure?: boolean;
    channels?: string[];
  };
}

export interface AgentSchedule {
  cron: string;
  timezone: string;
}

export interface EventConfig {
  eventType: string;
  filter?: Record<string, any>;
  path?: string;
  recursive?: boolean;
}

export interface AgentExecution {
  id: string;
  agentId: string;
  autoAgentId: string;
  status: 'running' | 'completed' | 'failed';
  input: string;
  output?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface FileWatcherConfig {
  path: string;
  recursive: boolean;
  events: ('add' | 'change' | 'unlink')[];
  filter?: string;
}

export interface LogMonitorConfig {
  logPath: string;
  patterns: {
    pattern: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    action: string;
  }[];
}
