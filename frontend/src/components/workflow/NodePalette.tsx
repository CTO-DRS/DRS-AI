import React from 'react';
import { GlassCard } from '../glass/GlassCard';
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
  Webhook,
  X
} from 'lucide-react';

interface NodePaletteProps {
  onSelect: (type: string, label: string) => void;
  onClose: () => void;
}

const nodeCategories = [
  {
    name: 'Triggers',
    nodes: [
      { type: 'trigger', label: 'Event Trigger', icon: Zap, color: 'text-cyan-400' },
      { type: 'schedule', label: 'Schedule', icon: Clock, color: 'text-yellow-400' },
      { type: 'webhook', label: 'Webhook', icon: Webhook, color: 'text-indigo-400' },
      { type: 'start', label: 'Start', icon: Play, color: 'text-green-400' }
    ]
  },
  {
    name: 'AI & Logic',
    nodes: [
      { type: 'ai', label: 'AI Generate', icon: Brain, color: 'text-emerald-400' },
      { type: 'chat', label: 'Chat', icon: MessageSquare, color: 'text-blue-400' },
      { type: 'condition', label: 'Condition', icon: Filter, color: 'text-amber-400' },
      { type: 'code', label: 'Code', icon: Code, color: 'text-gray-400' }
    ]
  },
  {
    name: 'Actions',
    nodes: [
      { type: 'action', label: 'Custom Action', icon: Settings, color: 'text-violet-400' },
      { type: 'document', label: 'Document', icon: FileText, color: 'text-orange-400' },
      { type: 'database', label: 'Database', icon: Database, color: 'text-pink-400' },
      { type: 'api', label: 'API Call', icon: Globe, color: 'text-sky-400' },
      { type: 'email', label: 'Send Email', icon: Mail, color: 'text-red-400' }
    ]
  }
];

export const NodePalette: React.FC<NodePaletteProps> = ({ onSelect, onClose }) => {
  return (
    <GlassCard className="p-6 w-[500px] max-h-[80vh] overflow-auto" variant="elevated">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Add Node</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-6">
        {nodeCategories.map((category) => (
          <div key={category.name}>
            <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-3">
              {category.name}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {category.nodes.map((node) => {
                const Icon = node.icon;
                return (
                  <button
                    key={node.type}
                    onClick={() => onSelect(node.type, node.label)}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 transition-all duration-200 group"
                  >
                    <div className={node.color}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-sm text-white/90 group-hover:text-white">
                      {node.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};
