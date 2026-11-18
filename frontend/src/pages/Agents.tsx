import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  CheckCircle2,
  Server,
  Plus,
  Play,
  Trash2,
  RefreshCw,
  Loader2,
  StopCircle,
  XCircle,
  Wrench,
  BookOpen,
  Globe,
  Network,
  Send,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { agentsService, a2aService } from '@/services/api';
import { useT } from '@/i18n';
import { onLiveEvent, type LiveEvent } from '@/hooks/useLiveEvents';
import { toast } from 'sonner';

/* ---------- Minimal shapes (backend envelope { success, data }) ---------- */

interface AgentInfo { id: string; name?: string; role?: string }
interface Team {
  id: string;
  name: string;
  description?: string;
  agentIds: string[];
  strategy?: string;
  maxRounds?: number;
  status?: string;
}
interface TeamRun {
  id: string;
  teamId?: string;
  status?: string;
  input?: string;
  transcript?: Array<{ agent?: string; content?: string }>;
  meta?: { memoryChunks?: number; webResults?: number; jsonOutput?: boolean; structured?: unknown };
  createdAt?: string;
}
interface Approval {
  id: string;
  type?: string;
  status?: string;
  payload?: Record<string, unknown>;
  summary?: string;
  createdAt?: string;
  expiresAt?: string;
}
interface McpServer {
  id: string;
  name: string;
  transport?: string;
  enabled?: boolean;
  status?: string;
}
interface McpTool { name?: string; description?: string }

interface A2aAgentRow {
  id: string;
  name: string;
  endpoint: string;
  description?: string;
  lastProbeStatus?: string;
  isEnabled?: boolean;
  cardCache?: { name?: string; description?: string; version?: string; protocolVersion?: string } | null;
}
interface A2aResult {
  kind?: string;
  state?: string;
  text?: string;
}

const STATUS_KEYS: Record<string, string> = {
  pending: 'agents.statusPending',
  approved: 'agents.statusApproved',
  rejected: 'agents.statusRejected',
  expired: 'agents.statusExpired',
  draft: 'agents.statusDraft',
  running: 'agents.statusRunning',
  completed: 'agents.statusCompleted',
  failed: 'agents.statusFailed',
  stopped: 'agents.statusStopped',
};

function StatusBadge({ status }: { status?: string }) {
  const t = useT();
  const key = STATUS_KEYS[(status || '').toLowerCase()];
  const label = key ? t(key) : status || '—';
  const tone =
    status === 'completed' || status === 'approved'
      ? 'bg-green-500/15 text-green-600 dark:text-green-400'
      : status === 'running' || status === 'pending' || status === 'draft'
      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
      : status === 'failed' || status === 'rejected'
      ? 'bg-red-500/15 text-red-600 dark:text-red-400'
      : 'bg-muted text-muted-foreground';
  return <span className={`text-xs px-2 py-0.5 rounded-full ${tone}`}>{label}</span>;
}

export default function Agents() {
  const t = useT();

  /* ---------------- Teams ---------------- */
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [runs, setRuns] = useState<TeamRun[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [runTeam, setRunTeam] = useState<Team | null>(null);
  const [runInput, setRunInput] = useState('');
  const [running, setRunning] = useState(false);
  const [runUseMemory, setRunUseMemory] = useState(true);
  const [runUseWebSearch, setRunUseWebSearch] = useState(false);
  const [runJsonOutput, setRunJsonOutput] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newStrategy, setNewStrategy] = useState('round_robin');
  const [newMaxRounds, setNewMaxRounds] = useState(8);
  const [newAgentIds, setNewAgentIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  /* ------------- Approvals --------------- */
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(true);
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null);

  /* -------------- MCP servers ------------ */
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loadingMcp, setLoadingMcp] = useState(true);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpName, setMcpName] = useState('');
  const [mcpTransport, setMcpTransport] = useState('stdio');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpCreating, setMcpCreating] = useState(false);
  const [mcpTesting, setMcpTesting] = useState<string | null>(null);
  const [mcpTools, setMcpTools] = useState<Record<string, McpTool[]>>({});

  /* ----------------- A2A peers ---------------- */
  const [a2aAgents, setA2aAgents] = useState<A2aAgentRow[]>([]);
  const [loadingA2a, setLoadingA2a] = useState(true);
  const [a2aOpen, setA2aOpen] = useState(false);
  const [a2aName, setA2aName] = useState('');
  const [a2aEndpoint, setA2aEndpoint] = useState('');
  const [a2aDesc, setA2aDesc] = useState('');
  const [a2aCreating, setA2aCreating] = useState(false);
  const [a2aBusy, setA2aBusy] = useState<string | null>(null);
  const [a2aMsgTarget, setA2aMsgTarget] = useState<A2aAgentRow | null>(null);
  const [a2aMsgText, setA2aMsgText] = useState('');
  const [a2aSending, setA2aSending] = useState(false);
  const [a2aLastResult, setA2aLastResult] = useState<A2aResult | null>(null);

  const loadTeams = useCallback(async () => {
    setLoadingTeams(true);
    try {
      const [teamRes, agentRes] = await Promise.all([
        agentsService.listTeams(),
        agentsService.listAgents().catch(() => ({ data: { agents: [] } })),
      ]);
      setTeams(teamRes.data?.data?.teams ?? teamRes.data?.teams ?? []);
      setAgents(agentRes.data?.data?.agents ?? agentRes.data?.agents ?? []);
    } catch {
      toast.error(t('agents.loadFailed'));
    } finally {
      setLoadingTeams(false);
    }
  }, [t]);

  const loadRuns = useCallback(async () => {
    try {
      const res = await agentsService.listTeamRuns('all').catch(() =>
        // Fallback shape: some versions expose /teams/runs/all directly
        ({ data: { runs: [] } })
      );
      setRuns(res.data?.data?.runs ?? res.data?.runs ?? []);
    } catch {
      /* non-critical */
    }
  }, []);

  const loadApprovals = useCallback(async () => {
    setLoadingApprovals(true);
    try {
      const res = await agentsService.listApprovals();
      setApprovals(res.data?.data?.approvals ?? res.data?.approvals ?? []);
    } catch {
      toast.error(t('agents.loadFailed'));
    } finally {
      setLoadingApprovals(false);
    }
  }, [t]);

  const loadMcp = useCallback(async () => {
    setLoadingMcp(true);
    try {
      const res = await agentsService.listMcpServers();
      setServers(res.data?.data?.servers ?? res.data?.servers ?? []);
    } catch {
      toast.error(t('agents.loadFailed'));
    } finally {
      setLoadingMcp(false);
    }
  }, [t]);

  const loadA2a = useCallback(async () => {
    setLoadingA2a(true);
    try {
      const res = await a2aService.listAgents();
      setA2aAgents(res.data?.data?.agents ?? res.data?.agents ?? []);
    } catch {
      toast.error(t('agents.loadFailed'));
    } finally {
      setLoadingA2a(false);
    }
  }, [t]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time data fetch; each loader owns its loading flag */
    loadTeams();
    loadRuns();
    loadApprovals();
    loadMcp();
    loadA2a();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadTeams, loadRuns, loadApprovals, loadMcp, loadA2a]);

  // Live refresh: the WS hub re-broadcasts orchestrator events as DOM events
  // (see useLiveEvents) — keep the approval inbox and run list fresh.
  useEffect(() => {
    const off = onLiveEvent((event: LiveEvent) => {
      if (event.type === 'approval.requested' || event.type === 'approval.decided') {
        loadApprovals();
      }
      if (event.type === 'teamrun.completed' || event.type === 'teamrun.failed') {
        loadRuns();
      }
    });
    return off;
  }, [loadApprovals, loadRuns]);

  /* ---------------- Team actions ---------------- */

  const handleCreateTeam = async () => {
    if (!newName.trim() || newAgentIds.length < 2) return;
    setCreating(true);
    try {
      await agentsService.createTeam({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        agentIds: newAgentIds,
        strategy: newStrategy,
        maxRounds: newMaxRounds,
      });
      setCreateOpen(false);
      setNewName('');
      setNewDesc('');
      setNewAgentIds([]);
      await loadTeams();
      toast.success(t('common.save'));
    } catch {
      toast.error(t('agents.actionFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleRunTeam = async () => {
    if (!runTeam || !runInput.trim()) return;
    setRunning(true);
    try {
      const res = await agentsService.runTeam(runTeam.id, runInput.trim(), {
        useMemory: runUseMemory,
        useWebSearch: runUseWebSearch,
        jsonOutput: runJsonOutput,
      });
      const run = res.data?.data?.run ?? res.data?.run;
      toast.success(t('agents.statusRunning'));
      setRunTeam(null);
      setRunInput('');
      await loadRuns();
      if (run?.id) {
        // Fetch the fresh transcript once available
        setTimeout(() => {
          agentsService
            .getRun(run.id)
            .catch(() => undefined);
        }, 1500);
      }
    } catch {
      toast.error(t('agents.actionFailed'));
    } finally {
      setRunning(false);
    }
  };

  const handleDeleteTeam = async (id: string) => {
    try {
      await agentsService.deleteTeam(id);
      await loadTeams();
    } catch {
      toast.error(t('agents.actionFailed'));
    }
  };

  const handleStopRun = async (runId: string) => {
    try {
      await agentsService.stopRun(runId);
      await loadRuns();
    } catch {
      toast.error(t('agents.actionFailed'));
    }
  };

  /* ------------- Approval actions ------------- */

  const handleApproval = async (id: string, approve: boolean) => {
    setApprovalBusy(id);
    try {
      if (approve) await agentsService.approve(id);
      else await agentsService.reject(id);
      await loadApprovals();
    } catch {
      toast.error(t('agents.actionFailed'));
    } finally {
      setApprovalBusy(null);
    }
  };

  /* --------------- MCP actions ---------------- */

  const handleAddServer = async () => {
    if (!mcpName.trim()) return;
    if (mcpTransport === 'stdio' && !mcpCommand.trim()) return;
    if (mcpTransport === 'http' && !mcpUrl.trim()) return;
    setMcpCreating(true);
    try {
      await agentsService.addMcpServer({
        name: mcpName.trim(),
        transport: mcpTransport,
        command: mcpTransport === 'stdio' ? mcpCommand.trim() : undefined,
        url: mcpTransport === 'http' ? mcpUrl.trim() : undefined,
      });
      setMcpOpen(false);
      setMcpName('');
      setMcpCommand('');
      setMcpUrl('');
      await loadMcp();
    } catch {
      toast.error(t('agents.actionFailed'));
    } finally {
      setMcpCreating(false);
    }
  };

  const handleTestServer = async (id: string) => {
    setMcpTesting(id);
    try {
      const res = await agentsService.testMcpServer(id);
      const ok = res.data?.data?.connected ?? res.data?.connected;
      toast[ok ? 'success' : 'error'](ok ? t('agents.connected') : t('agents.disconnected'));
      const toolsRes = await agentsService.listMcpTools(id).catch(() => null);
      if (toolsRes) {
        const tools = toolsRes.data?.data?.tools ?? toolsRes.data?.tools ?? [];
        setMcpTools((prev) => ({ ...prev, [id]: tools }));
      }
      await loadMcp();
    } catch {
      toast.error(t('agents.disconnected'));
    } finally {
      setMcpTesting(null);
    }
  };

  const handleDeleteServer = async (id: string) => {
    try {
      await agentsService.deleteMcpServer(id);
      await loadMcp();
    } catch {
      toast.error(t('agents.actionFailed'));
    }
  };

  /* --------------- A2A actions --------------- */

  const handleRegisterA2a = async () => {
    if (!a2aName.trim() || !a2aEndpoint.trim()) return;
    setA2aCreating(true);
    try {
      await a2aService.registerAgent({
        name: a2aName.trim(),
        endpoint: a2aEndpoint.trim(),
        description: a2aDesc.trim() || undefined,
      });
      setA2aOpen(false);
      setA2aName('');
      setA2aEndpoint('');
      setA2aDesc('');
      await loadA2a();
      toast.success(t('common.save'));
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      toast.error(msg || t('agents.actionFailed'));
    } finally {
      setA2aCreating(false);
    }
  };

  const handleProbeA2a = async (id: string) => {
    setA2aBusy(id);
    try {
      const res = await a2aService.probeAgent(id);
      const ok = res.data?.data?.ok;
      toast[ok ? 'success' : 'error'](ok ? t('a2a.reachable') : t('a2a.unreachable'));
      await loadA2a();
    } catch {
      toast.error(t('a2a.unreachable'));
    } finally {
      setA2aBusy(null);
    }
  };

  const handleDeleteA2a = async (id: string) => {
    try {
      await a2aService.deleteAgent(id);
      await loadA2a();
    } catch {
      toast.error(t('agents.actionFailed'));
    }
  };

  const handleSendA2a = async () => {
    if (!a2aMsgTarget || !a2aMsgText.trim()) return;
    setA2aSending(true);
    try {
      const res = await a2aService.sendMessage(a2aMsgTarget.id, a2aMsgText.trim());
      const result: A2aResult = res.data?.data?.result ?? {};
      setA2aLastResult(result);
      setA2aMsgText('');
      toast.success(t('a2a.sent'));
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      toast.error(msg || t('agents.actionFailed'));
    } finally {
      setA2aSending(false);
    }
  };

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('agents.title')}</h1>
        <p className="text-muted-foreground mt-2">{t('agents.subtitle')}</p>
      </div>

      <Tabs defaultValue="teams" className="space-y-6">
        <TabsList>
          <TabsTrigger value="teams" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            {t('agents.tabTeams')}
          </TabsTrigger>
          <TabsTrigger value="approvals" className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {t('agents.tabApprovals')}
            {approvals.filter((a) => a.status === 'pending').length > 0 && (
              <Badge variant="secondary" className="ms-1">
                {approvals.filter((a) => a.status === 'pending').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="mcp" className="flex items-center gap-2">
            <Server className="w-4 h-4" />
            {t('agents.tabMcp')}
          </TabsTrigger>
          <TabsTrigger value="a2a" className="flex items-center gap-2">
            <Network className="w-4 h-4" />
            {t('a2a.tab')}
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------ TEAMS ------------------------------ */}
        <TabsContent value="teams" className="space-y-4">
          <div className="flex items-center justify-between">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 me-2" />
              {t('agents.createTeam')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { loadTeams(); loadRuns(); }}>
              <RefreshCw className="w-4 h-4 me-2" />
              {t('common.refresh')}
            </Button>
          </div>

          {loadingTeams ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : teams.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {t('agents.empty')}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {teams.map((team) => (
                <Card key={team.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{team.name}</CardTitle>
                        {team.description && (
                          <CardDescription className="mt-1">{team.description}</CardDescription>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title={t('agents.deleteTeam')}
                        onClick={() => handleDeleteTeam(team.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(team.agentIds || []).map((id) => (
                        <Badge key={id} variant="secondary" className="font-normal">
                          {agentName(id)}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {team.strategy === 'selector'
                          ? t('agents.strategySelector')
                          : t('agents.strategyRoundRobin')}
                      </span>
                      {team.maxRounds != null && <span>• {t('agents.maxRounds')}: {team.maxRounds}</span>}
                    </div>
                    <Button size="sm" className="w-full" onClick={() => setRunTeam(team)}>
                      <Play className="w-4 h-4 me-2" />
                      {t('agents.run')}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Recent runs */}
          {runs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('agents.runs')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {runs.slice(0, 8).map((run) => (
                  <div key={run.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{run.input}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {typeof run.meta?.memoryChunks === 'number' && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <BookOpen className="w-3 h-3" />{run.meta.memoryChunks}
                          </Badge>
                        )}
                        {typeof run.meta?.webResults === 'number' && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Globe className="w-3 h-3" />{run.meta.webResults}
                          </Badge>
                        )}
                        {run.meta?.structured != null && (
                          <Badge variant="outline" className="text-xs">JSON</Badge>
                        )}
                        <StatusBadge status={run.status} />
                        {run.status === 'running' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={t('agents.stopRun')}
                            onClick={() => handleStopRun(run.id)}
                          >
                            <StopCircle className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {run.transcript && run.transcript.length > 0 && (
                      <ScrollArea className="max-h-40">
                        <div className="space-y-1.5 text-xs">
                          {run.transcript.map((turn, i) => (
                            <p key={i}>
                              <span className="font-semibold">{turn.agent || 'agent'}:</span>{' '}
                              <span className="text-muted-foreground">{turn.content}</span>
                            </p>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------------------------- APPROVALS ---------------------------- */}
        <TabsContent value="approvals" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={loadApprovals}>
              <RefreshCw className="w-4 h-4 me-2" />
              {t('common.refresh')}
            </Button>
          </div>
          {loadingApprovals ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : approvals.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {t('agents.approvalsEmpty')}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {approvals.map((ap) => (
                <Card key={ap.id}>
                  <CardContent className="py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-normal uppercase text-[10px]">
                          {ap.type || 'task'}
                        </Badge>
                        <StatusBadge status={ap.status} />
                      </div>
                      <p className="text-sm mt-2 line-clamp-2">
                        {ap.summary || JSON.stringify(ap.payload).slice(0, 200)}
                      </p>
                    </div>
                    {ap.status === 'pending' && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          disabled={approvalBusy === ap.id}
                          onClick={() => handleApproval(ap.id, true)}
                        >
                          <CheckCircle2 className="w-4 h-4 me-1" />
                          {t('agents.approve')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={approvalBusy === ap.id}
                          onClick={() => handleApproval(ap.id, false)}
                        >
                          <XCircle className="w-4 h-4 me-1" />
                          {t('agents.reject')}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------------------- MCP SERVERS -------------------------- */}
        <TabsContent value="mcp" className="space-y-4">
          <div className="flex items-center justify-between">
            <Button onClick={() => setMcpOpen(true)}>
              <Plus className="w-4 h-4 me-2" />
              {t('agents.mcpAdd')}
            </Button>
            <Button variant="outline" size="sm" onClick={loadMcp}>
              <RefreshCw className="w-4 h-4 me-2" />
              {t('common.refresh')}
            </Button>
          </div>

          {loadingMcp ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : servers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {t('agents.mcpEmpty')}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {servers.map((srv) => (
                <Card key={srv.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{srv.name}</CardTitle>
                        <CardDescription className="mt-1 uppercase text-[10px]">
                          {srv.transport || 'stdio'}
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title={t('common.delete')}
                        onClick={() => handleDeleteServer(srv.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <StatusBadge
                      status={srv.enabled === false ? 'disconnected' : srv.status || 'connected'}
                    />
                    {(mcpTools[srv.id]?.length ?? 0) > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium flex items-center gap-1">
                          <Wrench className="w-3 h-3" /> {t('agents.mcpTools')}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {mcpTools[srv.id].map((tool) => (
                            <Badge key={tool.name} variant="secondary" className="font-normal text-[10px]">
                              {tool.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={mcpTesting === srv.id}
                      onClick={() => handleTestServer(srv.id)}
                    >
                      {mcpTesting === srv.id ? (
                        <Loader2 className="w-4 h-4 me-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 me-2" />
                      )}
                      {t('agents.mcpTest')}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ------------------------------ A2A ------------------------------ */}
        <TabsContent value="a2a" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Network className="w-4 h-4" /> {t('a2a.cardTitle')}
              </CardTitle>
              <CardDescription>{t('a2a.cardDesc')}</CardDescription>
            </CardHeader>
          </Card>

          <div className="flex items-center justify-between">
            <Button onClick={() => setA2aOpen(true)}>
              <Plus className="w-4 h-4 me-2" />
              {t('a2a.add')}
            </Button>
            <Button variant="outline" size="sm" onClick={loadA2a}>
              <RefreshCw className="w-4 h-4 me-2" />
              {t('common.refresh')}
            </Button>
          </div>

          {loadingA2a ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : a2aAgents.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {t('a2a.empty')}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {a2aAgents.map((agent) => (
                <Card key={agent.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{agent.name}</CardTitle>
                        <CardDescription className="mt-1 truncate text-[11px]" dir="ltr">
                          {agent.endpoint}
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title={t('common.delete')}
                        onClick={() => handleDeleteA2a(agent.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={agent.lastProbeStatus === 'reachable' ? 'connected' : agent.lastProbeStatus ? 'disconnected' : undefined} />
                      {agent.cardCache?.version && (
                        <Badge variant="outline" className="text-[10px]">v{agent.cardCache.version}</Badge>
                      )}
                    </div>
                    {agent.cardCache?.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{agent.cardCache.description}</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        disabled={a2aBusy === agent.id}
                        onClick={() => handleProbeA2a(agent.id)}
                      >
                        {a2aBusy === agent.id ? (
                          <Loader2 className="w-4 h-4 me-2 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4 me-2" />
                        )}
                        {t('a2a.probe')}
                      </Button>
                      <Button size="sm" className="flex-1" onClick={() => { setA2aMsgTarget(agent); setA2aLastResult(null); }}>
                        <Send className="w-4 h-4 me-2" />
                        {t('a2a.send')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {a2aLastResult && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Globe className="w-4 h-4" /> {t('a2a.lastResult')}
                  {a2aLastResult.state && <StatusBadge status={a2aLastResult.state === 'completed' ? 'completed' : 'running'} />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap text-xs bg-muted/40 rounded-lg p-3 max-h-64 overflow-auto">
                  {a2aLastResult.text || t('a2a.noText')}
                </pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* --------------------- A2A send-message dialog --------------------- */}
      <Dialog open={Boolean(a2aMsgTarget)} onOpenChange={(open) => !open && setA2aMsgTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t('a2a.sendTo')} {a2aMsgTarget?.name}
            </DialogTitle>
            <DialogDescription>{t('a2a.sendHint')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={a2aMsgText}
              onChange={(e) => setA2aMsgText(e.target.value)}
              placeholder={t('a2a.messagePlaceholder')}
              rows={6}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setA2aMsgTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSendA2a} disabled={a2aSending || !a2aMsgText.trim()}>
              {a2aSending ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Send className="w-4 h-4 me-2" />}
              {t('a2a.send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --------------------- A2A register dialog ------------------------ */}
      <Dialog open={a2aOpen} onOpenChange={setA2aOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('a2a.add')}</DialogTitle>
            <DialogDescription>{t('a2a.addHint')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('a2a.name')}</Label>
              <Input value={a2aName} onChange={(e) => setA2aName(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label>{t('a2a.endpoint')}</Label>
              <Input
                value={a2aEndpoint}
                onChange={(e) => setA2aEndpoint(e.target.value)}
                placeholder="https://agent.example.com"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">{t('a2a.endpointHint')}</p>
            </div>
            <div className="space-y-2">
              <Label>{t('agents.teamDescription')}</Label>
              <Input value={a2aDesc} onChange={(e) => setA2aDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setA2aOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleRegisterA2a} disabled={a2aCreating || !a2aName.trim() || !a2aEndpoint.trim()}>
              {a2aCreating && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------- Create team dialog ------------------------ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('agents.createTeam')}</DialogTitle>
            <DialogDescription>{t('agents.selectAgents')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('agents.teamName')}</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('agents.teamNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('agents.teamDescription')}</Label>
              <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('agents.strategy')}</Label>
                <Select value={newStrategy} onValueChange={setNewStrategy}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="round_robin">{t('agents.strategyRoundRobin')}</SelectItem>
                    <SelectItem value="selector">{t('agents.strategySelector')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('agents.maxRounds')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={newMaxRounds}
                  onChange={(e) => setNewMaxRounds(Number(e.target.value) || 8)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('agents.selectAgents')}</Label>
              {agents.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-2 border rounded-md p-3">
                  {agents.map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={newAgentIds.includes(a.id)}
                        onCheckedChange={(checked) =>
                          setNewAgentIds((prev) =>
                            checked ? [...prev, a.id] : prev.filter((x) => x !== a.id)
                          )
                        }
                      />
                      {a.name || a.id}
                      {a.role && <span className="text-muted-foreground text-xs">({a.role})</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreateTeam}
              disabled={creating || !newName.trim() || newAgentIds.length < 2}
              title={newAgentIds.length < 2 ? t('agents.needTwoAgents') : undefined}
            >
              {creating && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --------------------------- Run team dialog ------------------------- */}
      <Dialog open={!!runTeam} onOpenChange={(open) => !open && setRunTeam(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('agents.runTitle')}: {runTeam?.name}</DialogTitle>
            <DialogDescription>{t('agents.runInputPlaceholder')}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={runInput}
            onChange={(e) => setRunInput(e.target.value)}
            placeholder={t('agents.runInputPlaceholder')}
            rows={4}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-accent/50">
              <Checkbox checked={runUseMemory} onCheckedChange={(v) => setRunUseMemory(Boolean(v))} />
              <span className="truncate">{t('agents.runUseMemory')}</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-accent/50">
              <Checkbox checked={runUseWebSearch} onCheckedChange={(v) => setRunUseWebSearch(Boolean(v))} />
              <span className="truncate">{t('agents.runUseWebSearch')}</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-accent/50">
              <Checkbox checked={runJsonOutput} onCheckedChange={(v) => setRunJsonOutput(Boolean(v))} />
              <span className="truncate">{t('agents.runJsonOutput')}</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunTeam(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleRunTeam} disabled={running || !runInput.trim()}>
              {running && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
              <Play className="w-4 h-4 me-2" />
              {t('agents.startRun')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --------------------------- Add MCP dialog -------------------------- */}
      <Dialog open={mcpOpen} onOpenChange={setMcpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('agents.mcpAdd')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('agents.mcpName')}</Label>
              <Input value={mcpName} onChange={(e) => setMcpName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('agents.mcpTransport')}</Label>
              <Select value={mcpTransport} onValueChange={setMcpTransport}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">stdio</SelectItem>
                  <SelectItem value="http">http</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mcpTransport === 'stdio' ? (
              <div className="space-y-2">
                <Label>{t('agents.mcpCommand')}</Label>
                <Input
                  value={mcpCommand}
                  onChange={(e) => setMcpCommand(e.target.value)}
                  placeholder="npx -y @modelcontextprotocol/server-filesystem /data"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>{t('agents.mcpUrl')}</Label>
                <Input
                  value={mcpUrl}
                  onChange={(e) => setMcpUrl(e.target.value)}
                  placeholder="http://localhost:9000/mcp"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMcpOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleAddServer}
              disabled={
                mcpCreating ||
                !mcpName.trim() ||
                (mcpTransport === 'stdio' ? !mcpCommand.trim() : !mcpUrl.trim())
              }
            >
              {mcpCreating && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
