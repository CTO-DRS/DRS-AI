import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../database';

const TIMESTAMP_FIELDS = {
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
};

/* ------------------------------------------------------------------ */
/* TaskRecord — durable mirror of the Redis task                      */
/* ------------------------------------------------------------------ */

interface TaskRecordAttributes {
  id: string;
  userId: string;
  type: string;
  input: string;
  agentId?: string;
  status: string;
  priority: string;
  context?: Record<string, any>;
  result?: Record<string, any>;
  error?: string;
  parentTaskId?: string;
  requireApproval: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type TaskRecordCreation = Optional<TaskRecordAttributes, 'id' | 'createdAt' | 'updatedAt' | 'requireApproval'>;

export class TaskRecord extends Model<TaskRecordAttributes, TaskRecordCreation> implements TaskRecordAttributes {
  public id!: string;
  public userId!: string;
  public type!: string;
  public input!: string;
  public agentId?: string;
  public status!: string;
  public priority!: string;
  public context?: Record<string, any>;
  public result?: Record<string, any>;
  public error?: string;
  public parentTaskId?: string;
  public requireApproval!: boolean;
  public createdAt!: Date;
  public updatedAt!: Date;
}

TaskRecord.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    type: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'auto' },
    input: { type: DataTypes.TEXT, allowNull: false },
    agentId: { type: DataTypes.STRING(50), allowNull: true, field: 'agent_id' },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'pending' },
    priority: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'normal' },
    context: { type: DataTypes.JSONB, allowNull: true },
    result: { type: DataTypes.JSONB, allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
    parentTaskId: { type: DataTypes.UUID, allowNull: true, field: 'parent_task_id' },
    requireApproval: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'require_approval' },
    ...TIMESTAMP_FIELDS
  },
  { sequelize, tableName: 'orchestrator_tasks' }
);

/* ------------------------------------------------------------------ */
/* Team — multi-agent team definition                                 */
/* ------------------------------------------------------------------ */

export type TeamStrategy = 'round_robin' | 'selector';

export interface TeamMessage {
  round: number;
  agentId: string;
  agentName: string;
  content: string;
  timestamp: string;
}

interface TeamAttributes {
  id: string;
  name: string;
  description?: string;
  agentIds: string[];
  strategy: TeamStrategy;
  maxRounds: number;
  selectorModel?: string;
  terminatePhrase: string;
  createdBy: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type TeamCreation = Optional<TeamAttributes, 'id' | 'createdAt' | 'updatedAt' | 'isActive' | 'maxRounds' | 'terminatePhrase' | 'strategy'>;

export class Team extends Model<TeamAttributes, TeamCreation> implements TeamAttributes {
  public id!: string;
  public name!: string;
  public description?: string;
  public agentIds!: string[];
  public strategy!: TeamStrategy;
  public maxRounds!: number;
  public selectorModel?: string;
  public terminatePhrase!: string;
  public createdBy!: string;
  public isActive!: boolean;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Team.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    agentIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'agent_ids' },
    strategy: { type: DataTypes.ENUM('round_robin', 'selector'), allowNull: false, defaultValue: 'round_robin' },
    maxRounds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 6, field: 'max_rounds' },
    selectorModel: { type: DataTypes.STRING(120), allowNull: true, field: 'selector_model' },
    terminatePhrase: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'TERMINATE', field: 'terminate_phrase' },
    createdBy: { type: DataTypes.UUID, allowNull: false, field: 'created_by' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
    ...TIMESTAMP_FIELDS
  },
  {
    sequelize,
    tableName: 'orchestrator_teams',
    validate: {
      atLeastTwoAgents() {
        if (!Array.isArray(this.agentIds) || this.agentIds.length < 2) {
          throw new Error('A team requires at least 2 agents');
        }
      }
    }
  }
);

/* ------------------------------------------------------------------ */
/* TeamRun — one execution of a team on an input                      */
/* ------------------------------------------------------------------ */

interface TeamRunAttributes {
  id: string;
  teamId: string;
  userId: string;
  input: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
  transcript: TeamMessage[];
  result?: string;
  rounds: number;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type TeamRunCreation = Optional<TeamRunAttributes, 'id' | 'createdAt' | 'updatedAt' | 'transcript' | 'rounds' | 'status'>;

export class TeamRun extends Model<TeamRunAttributes, TeamRunCreation> implements TeamRunAttributes {
  public id!: string;
  public teamId!: string;
  public userId!: string;
  public input!: string;
  public status!: 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
  public transcript!: TeamMessage[];
  public result?: string;
  public rounds!: number;
  public error?: string;
  public startedAt?: Date;
  public completedAt?: Date;
  public createdAt!: Date;
  public updatedAt!: Date;
}

TeamRun.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    teamId: { type: DataTypes.UUID, allowNull: false, field: 'team_id' },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    input: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    transcript: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    result: { type: DataTypes.TEXT, allowNull: true },
    rounds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    error: { type: DataTypes.TEXT, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
    ...TIMESTAMP_FIELDS
  },
  { sequelize, tableName: 'orchestrator_team_runs' }
);

/* ------------------------------------------------------------------ */
/* Plan — LLM-generated execution plan with steps                     */
/* ------------------------------------------------------------------ */

export interface PlanStep {
  id: string;
  description: string;
  agentType: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  mcp?: { serverId: string; tool: string; args: Record<string, any> };
}

interface PlanAttributes {
  id: string;
  taskId: string;
  userId: string;
  summary: string;
  steps: PlanStep[];
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

type PlanCreation = Optional<PlanAttributes, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'steps'>;

export class Plan extends Model<PlanAttributes, PlanCreation> implements PlanAttributes {
  public id!: string;
  public taskId!: string;
  public userId!: string;
  public summary!: string;
  public steps!: PlanStep[];
  public status!: 'draft' | 'approved' | 'executing' | 'completed' | 'failed';
  public createdAt!: Date;
  public updatedAt!: Date;
}

Plan.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    taskId: { type: DataTypes.UUID, allowNull: false, field: 'task_id' },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    summary: { type: DataTypes.TEXT, allowNull: false },
    steps: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    ...TIMESTAMP_FIELDS
  },
  { sequelize, tableName: 'orchestrator_plans' }
);

/* ------------------------------------------------------------------ */
/* Approval — human-in-the-loop approval request                      */
/* ------------------------------------------------------------------ */

export interface ApprovalPayload {
  title: string;
  detail?: string;
  action?: string;
  meta?: Record<string, any>;
}

interface ApprovalAttributes {
  id: string;
  userId: string;
  taskId?: string;
  teamRunId?: string;
  type: 'task_execution' | 'dangerous_action' | 'mcp_tool_call' | 'plan_execution';
  payload: ApprovalPayload;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requestedBy?: string;
  decidedBy?: string;
  decidedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type ApprovalCreation = Optional<ApprovalAttributes, 'id' | 'createdAt' | 'updatedAt' | 'status'>;

export class Approval extends Model<ApprovalAttributes, ApprovalCreation> implements ApprovalAttributes {
  public id!: string;
  public userId!: string;
  public taskId?: string;
  public teamRunId?: string;
  public type!: 'task_execution' | 'dangerous_action' | 'mcp_tool_call' | 'plan_execution';
  public payload!: ApprovalPayload;
  public status!: 'pending' | 'approved' | 'rejected' | 'expired';
  public requestedBy?: string;
  public decidedBy?: string;
  public decidedAt?: Date;
  public expiresAt?: Date;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Approval.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    taskId: { type: DataTypes.UUID, allowNull: true, field: 'task_id' },
    teamRunId: { type: DataTypes.UUID, allowNull: true, field: 'team_run_id' },
    type: {
      type: DataTypes.ENUM('task_execution', 'dangerous_action', 'mcp_tool_call', 'plan_execution'),
      allowNull: false,
      defaultValue: 'task_execution'
    },
    payload: { type: DataTypes.JSONB, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    requestedBy: { type: DataTypes.STRING(100), allowNull: true, field: 'requested_by' },
    decidedBy: { type: DataTypes.STRING(100), allowNull: true, field: 'decided_by' },
    decidedAt: { type: DataTypes.DATE, allowNull: true, field: 'decided_at' },
    expiresAt: { type: DataTypes.DATE, allowNull: true, field: 'expires_at' },
    ...TIMESTAMP_FIELDS
  },
  { sequelize, tableName: 'orchestrator_approvals' }
);

/* ------------------------------------------------------------------ */
/* McpServer — registered MCP (Model Context Protocol) server         */
/* ------------------------------------------------------------------ */

interface McpServerAttributes {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  toolCache?: Array<Record<string, any>>;
  isEnabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

type McpServerCreation = Optional<McpServerAttributes, 'id' | 'createdAt' | 'updatedAt' | 'isEnabled' | 'toolCache'>;

export class McpServer extends Model<McpServerAttributes, McpServerCreation> implements McpServerAttributes {
  public id!: string;
  public name!: string;
  public transport!: 'stdio' | 'http';
  public command?: string;
  public args?: string[];
  public env?: Record<string, string>;
  public url?: string;
  public headers?: Record<string, string>;
  public toolCache?: Array<Record<string, any>>;
  public isEnabled!: boolean;
  public createdBy!: string;
  public createdAt!: Date;
  public updatedAt!: Date;
}

McpServer.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    transport: { type: DataTypes.ENUM('stdio', 'http'), allowNull: false },
    command: { type: DataTypes.STRING(500), allowNull: true },
    args: { type: DataTypes.JSONB, allowNull: true },
    env: { type: DataTypes.JSONB, allowNull: true },
    url: { type: DataTypes.STRING(1000), allowNull: true },
    headers: { type: DataTypes.JSONB, allowNull: true },
    toolCache: { type: DataTypes.JSONB, allowNull: true, field: 'tool_cache' },
    isEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_enabled' },
    createdBy: { type: DataTypes.UUID, allowNull: false, field: 'created_by' },
    ...TIMESTAMP_FIELDS
  },
  {
    sequelize,
    tableName: 'orchestrator_mcp_servers',
    validate: {
      validTransport() {
        if (this.transport === 'stdio' && !this.command) {
          throw new Error('stdio transport requires a command');
        }
        if (this.transport === 'http' && !this.url) {
          throw new Error('http transport requires a url');
        }
      }
    }
  }
);

export default { TaskRecord, Team, TeamRun, Plan, Approval, McpServer };
