import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { 
  Zap, 
  Play, 
  Settings, 
  Brain, 
  MessageSquare, 
  FileText, 
  Database,
  Globe,
  Clock,
  Filter,
  Code,
  Mail,
  Webhook
} from 'lucide-react';
import { cn } from '@/lib/utils';

const nodeIcons: Record<string, React.ElementType> = {
  trigger: Zap,
  start: Play,
  action: Settings,
  ai: Brain,
  chat: MessageSquare,
  document: FileText,
  database: Database,
  api: Globe,
  schedule: Clock,
  condition: Filter,
  code: Code,
  email: Mail,
  webhook: Webhook
};

const nodeColors: Record<string, string> = {
  trigger: 'from-cyan-500 to-blue-500',
  start: 'from-green-500 to-emerald-500',
  action: 'from-violet-500 to-purple-500',
  ai: 'from-emerald-500 to-teal-500',
  chat: 'from-blue-500 to-indigo-500',
  document: 'from-orange-500 to-amber-500',
  database: 'from-pink-500 to-rose-500',
  api: 'from-sky-500 to-cyan-500',
  schedule: 'from-yellow-500 to-orange-500',
  condition: 'from-amber-500 to-yellow-500',
  code: 'from-gray-500 to-slate-500',
  email: 'from-red-500 to-pink-500',
  webhook: 'from-indigo-500 to-violet-500'
};

interface WorkflowNodeData {
  label: string;
  type: string;
  config?: Record<string, any>;
  status?: 'idle' | 'running' | 'success' | 'error';
}

export const WorkflowNode = memo(({ data, selected }: NodeProps<WorkflowNodeData>) => {
  const Icon = nodeIcons[data.type] || Settings;
  const colorClass = nodeColors[data.type] || 'from-gray-500 to-slate-500';

  const statusColors = {
    idle: 'border-white/20',
    running: 'border-cyan-400 animate-pulse',
    success: 'border-green-400',
    error: 'border-red-400'
  };

  return (
    <div
      className={cn(
        'relative group',
        selected && 'scale-105'
      )}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-white"
      />

      {/* Node Card */}
      <div
        className={cn(
          'w-40 rounded-xl overflow-hidden backdrop-blur-xl',
          'bg-gradient-to-br border-2 transition-all duration-300',
          colorClass,
          'from-opacity-20 to-opacity-20',
          statusColors[data.status || 'idle'],
          selected && 'shadow-xl shadow-cyan-500/30 scale-105',
          'hover:shadow-lg hover:shadow-cyan-500/20'
        )}
      >
        {/* Header */}
        <div className="px-3 py-2 bg-black/20 flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-medium text-white capitalize truncate">
            {data.type}
          </span>
        </div>

        {/* Body */}
        <div className="px-3 py-2 bg-black/40">
          <p className="text-sm text-white/90 font-medium truncate">
            {data.label}
          </p>
          {data.config && Object.keys(data.config).length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {Object.entries(data.config).slice(0, 2).map(([key, value]) => (
                <span
                  key={key}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/70 truncate max-w-full"
                >
                  {key}: {String(value).substring(0, 15)}
                </span>
              ))}
              {Object.keys(data.config).length > 2 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/70">
                  +{Object.keys(data.config).length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-white"
      />

      {/* Status Indicator */}
      {data.status && data.status !== 'idle' && (
        <div
          className={cn(
            'absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white',
            data.status === 'running' && 'bg-cyan-400 animate-pulse',
            data.status === 'success' && 'bg-green-400',
            data.status === 'error' && 'bg-red-400'
          )}
        />
      )}
    </div>
  );
});

WorkflowNode.displayName = 'WorkflowNode';
