import React, { useState, useCallback, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  Panel,
  NodeTypes
} from 'reactflow';
import 'reactflow/dist/style.css';
import { GlassCard } from '../glass/GlassCard';
import { GlassButton } from '../glass/GlassButton';
import { 
  Play, 
  Save, 
  Trash2, 
  Plus, 
  Settings,
  Copy,
  Download,
  Upload
} from 'lucide-react';
import { WorkflowNode } from './WorkflowNode';
import { NodePalette } from './NodePalette';
import { cn } from '@/lib/utils';

const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNode
};

interface WorkflowBuilderProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onSave?: (workflow: { nodes: Node[]; edges: Edge[] }) => void;
  onExecute?: (workflow: { nodes: Node[]; edges: Edge[] }) => void;
  readOnly?: boolean;
}

export const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({
  initialNodes = [],
  initialEdges = [],
  onSave,
  onExecute,
  readOnly = false
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({
        ...connection,
        animated: true,
        style: { stroke: '#06b6d4', strokeWidth: 2 }
      }, eds));
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const addNode = useCallback((type: string, label: string) => {
    const newNode: Node = {
      id: `node_${Date.now()}`,
      type: 'workflowNode',
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 300 + 100
      },
      data: {
        label,
        type,
        config: {}
      }
    };
    setNodes((nds) => [...nds, newNode]);
    setShowPalette(false);
  }, [setNodes]);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
  }, [setNodes, setEdges]);

  const duplicateNode = useCallback((node: Node) => {
    const newNode: Node = {
      ...node,
      id: `node_${Date.now()}`,
      position: {
        x: node.position.x + 50,
        y: node.position.y + 50
      }
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const handleSave = () => {
    onSave?.({ nodes, edges });
  };

  const handleExecute = () => {
    onExecute?.({ nodes, edges });
  };

  const exportWorkflow = () => {
    const workflow = { nodes, edges };
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importWorkflow = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const workflow = JSON.parse(e.target?.result as string);
          if (workflow.nodes) setNodes(workflow.nodes);
          if (workflow.edges) setEdges(workflow.edges);
        } catch (error) {
          console.error('Failed to import workflow:', error);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <GlassCard className="w-full h-[600px] relative overflow-hidden" variant="elevated">
      <div ref={reactFlowWrapper} className="w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-right"
          className="bg-transparent"
        >
          <Background
            color="rgba(255, 255, 255, 0.1)"
            gap={20}
            size={1}
          />
          <Controls className="bg-white/10 backdrop-blur-md border border-white/20" />
          <MiniMap
            className="bg-white/10 backdrop-blur-md border border-white/20 rounded-lg"
            nodeColor={(node) => {
              switch (node.data?.type) {
                case 'trigger': return '#06b6d4';
                case 'action': return '#8b5cf6';
                case 'condition': return '#f59e0b';
                case 'ai': return '#10b981';
                default: return '#6b7280';
              }
            }}
            maskColor="rgba(0, 0, 0, 0.5)"
          />

          {/* Toolbar */}
          <Panel position="top-left" className="m-4">
            <div className="flex flex-col gap-2">
              {!readOnly && (
                <GlassButton
                  variant="primary"
                  size="sm"
                  onClick={() => setShowPalette(!showPalette)}
                  icon={<Plus className="w-4 h-4" />}
                >
                  Add Node
                </GlassButton>
              )}
              <GlassButton
                variant="secondary"
                size="sm"
                onClick={handleSave}
                icon={<Save className="w-4 h-4" />}
              >
                Save
              </GlassButton>
              <GlassButton
                variant="glow"
                size="sm"
                onClick={handleExecute}
                icon={<Play className="w-4 h-4" />}
              >
                Execute
              </GlassButton>
            </div>
          </Panel>

          {/* Import/Export */}
          <Panel position="top-right" className="m-4">
            <div className="flex flex-col gap-2">
              <GlassButton
                variant="secondary"
                size="sm"
                onClick={exportWorkflow}
                icon={<Download className="w-4 h-4" />}
              >
                Export
              </GlassButton>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".json"
                  onChange={importWorkflow}
                  className="hidden"
                />
                <GlassButton
                  variant="secondary"
                  size="sm"
                  icon={<Upload className="w-4 h-4" />}
                >
                  Import
                </GlassButton>
              </label>
            </div>
          </Panel>

          {/* Node Properties Panel */}
          {selectedNode && (
            <Panel position="bottom-right" className="m-4">
              <GlassCard className="p-4 w-64" variant="elevated">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-medium">Node Properties</h3>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="text-white/50 hover:text-white"
                  >
                    ×
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-white/60">Label</label>
                    <input
                      type="text"
                      value={selectedNode.data?.label || ''}
                      onChange={(e) => {
                        setNodes((nds) =>
                          nds.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, data: { ...n.data, label: e.target.value } }
                              : n
                          )
                        );
                      }}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60">Type</label>
                    <p className="text-white text-sm capitalize">{selectedNode.data?.type}</p>
                  </div>
                  {!readOnly && (
                    <div className="flex gap-2 pt-2">
                      <GlassButton
                        variant="secondary"
                        size="sm"
                        onClick={() => duplicateNode(selectedNode)}
                        icon={<Copy className="w-3 h-3" />}
                      >
                        Duplicate
                      </GlassButton>
                      <GlassButton
                        variant="danger"
                        size="sm"
                        onClick={() => deleteNode(selectedNode.id)}
                        icon={<Trash2 className="w-3 h-3" />}
                      >
                        Delete
                      </GlassButton>
                    </div>
                  )}
                </div>
              </GlassCard>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {/* Node Palette Modal */}
      {showPalette && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <NodePalette onSelect={addNode} onClose={() => setShowPalette(false)} />
        </div>
      )}
    </GlassCard>
  );
};
