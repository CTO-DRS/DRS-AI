export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  entry: string;
  language: 'javascript' | 'typescript' | 'python';
  permissions: PluginPermission[];
  hooks?: PluginHook[];
  config?: PluginConfigSchema;
  dependencies?: Record<string, string>;
}

export type PluginPermission =
  | 'filesystem:read'
  | 'filesystem:write'
  | 'network'
  | 'memory'
  | 'agents'
  | 'models'
  | 'notifications'
  | 'database:read'
  | 'database:write';

export interface PluginHook {
  event: string;
  handler: string;
}

export interface PluginConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    default?: any;
    required?: boolean;
    description?: string;
  };
}

export interface Plugin {
  id: string;
  manifest: PluginManifest;
  enabled: boolean;
  installedAt: Date;
  updatedAt: Date;
  config: Record<string, any>;
  instance?: PluginInstance;
}

export interface PluginInstance {
  execute: (input: any, context: PluginContext) => Promise<any>;
  destroy?: () => Promise<void>;
}

export interface PluginContext {
  pluginId: string;
  userId?: string;
  permissions: PluginPermission[];
  services: {
    memory: any;
    agents: any;
    models: any;
    notifications: any;
  };
  logger: {
    info: (message: string, meta?: any) => void;
    error: (message: string, meta?: any) => void;
    warn: (message: string, meta?: any) => void;
    debug: (message: string, meta?: any) => void;
  };
}

export interface PluginExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  executionTime: number;
}

export interface PluginMarketplaceItem {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  downloads: number;
  rating: number;
  category: string;
  tags: string[];
  icon?: string;
}
