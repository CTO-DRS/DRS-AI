import { useEffect, useState } from 'react';
import { Users, Play, Trash2, Loader2, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { teamsService, toolsService, unwrap } from '@/services/api';
import { toast } from 'sonner';

interface Team {
  id: string;
  name: string;
  pattern: string;
  members: Array<{ agentId: string; role?: string }>;
  maxRounds: number;
  enableTools: boolean;
  createdAt: string;
}

interface TeamMessage {
  from: string;
  content: string;
  round: number;
  toolCalls?: Array<{ name: string; ok: boolean }>;
}

const AVAILABLE_AGENTS = ['chat', 'code', 'reasoning', 'file', 'automation', 'builder'];

export default function Teams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // create form
  const [name, setName] = useState('');
  const [pattern, setPattern] = useState('round_robin');
  const [selected, setSelected] = useState<string[]>(['chat']);
  const [enableTools, setEnableTools] = useState(true);
  const [maxRounds, setMaxRounds] = useState(8);

  // run state
  const [runningTeam, setRunningTeam] = useState<string | null>(null);
  const [task, setTask] = useState('');
  const [transcript, setTranscript] = useState<TeamMessage[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const loadTeams = async () => {
    try {
      setIsLoading(true);
      const response = await teamsService.list();
      setTeams(unwrap(response)?.teams || []);
    } catch {
      toast.error('Failed to load teams');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadTeams(); }, []);

  const toggleAgent = (agentId: string) => {
    setSelected(prev =>
      prev.includes(agentId) ? prev.filter(a => a !== agentId) : [...prev, agentId]
    );
  };

  const createTeam = async () => {
    if (!name.trim() || selected.length === 0) {
      toast.error('Team needs a name and at least one agent');
      return;
    }
    try {
      setCreating(true);
      await teamsService.create({
        name: name.trim(),
        pattern: pattern as any,
        agents: selected,
        maxRounds,
        task: ''
      } as any);
      toast.success('Team created');
      setName('');
      await loadTeams();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to create team');
    } finally {
      setCreating(false);
    }
  };

  const runTeam = async (team: Team) => {
    if (!task.trim()) {
      toast.error('Enter a task first');
      return;
    }
    try {
      setRunningTeam(team.id);
      setTranscript([]);
      setExpandedTeam(team.id);
      const response = await teamsService.run(team.id, task.trim());
      const run = unwrap(response)?.run;
      setTranscript(run?.messages || []);
      if (run?.status === 'failed') {
        toast.error(`Run failed: ${run.error}`);
      } else {
        toast.success('Team run completed');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Run failed');
    } finally {
      setRunningTeam(null);
    }
  };

  const deleteTeam = async (team: Team) => {
    try {
      await teamsService.delete(team.id);
      await loadTeams();
    } catch {
      toast.error('Failed to delete team');
    }
  };

  const patternDescription: Record<string, string> = {
    round_robin: 'Agents take turns in a fixed order',
    selector: 'An LLM coordinator picks the best next speaker',
    handoff: 'Agents transfer control to each other (Swarm style)'
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Agent Teams</h1>
        <p className="text-muted-foreground mt-2">
          Multi-agent orchestration — round-robin, LLM selector and handoff patterns
        </p>
      </div>

      {/* Create team */}
      <Card>
        <CardHeader>
          <CardTitle>Create Team</CardTitle>
          <CardDescription>{patternDescription[pattern]}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" />
            <Select value={pattern} onValueChange={setPattern}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="round_robin">Round Robin</SelectItem>
                <SelectItem value="selector">Selector (LLM)</SelectItem>
                <SelectItem value="handoff">Handoff (Swarm)</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              value={maxRounds}
              min={2}
              max={40}
              onChange={(e) => setMaxRounds(Number(e.target.value))}
              placeholder="Max rounds"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_AGENTS.map((agent) => (
              <Badge
                key={agent}
                variant={selected.includes(agent) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleAgent(agent)}
              >
                {agent}
              </Badge>
            ))}
            <label className="flex items-center gap-2 text-sm text-muted-foreground ml-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enableTools}
                onChange={(e) => setEnableTools(e.target.checked)}
                className="accent-primary"
              />
              Enable tools (function calling)
            </label>
          </div>
          <Textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Task for the team (used when you press Run)"
            className="min-h-[80px]"
          />
          <Button onClick={createTeam} disabled={creating}>
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
            Create Team
          </Button>
        </CardContent>
      </Card>

      {/* Team list */}
      {isLoading ? (
        <p className="text-muted-foreground">Loading teams…</p>
      ) : (
        <div className="space-y-4">
          {teams.map((team) => (
            <Card key={team.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {team.name}
                      <Badge variant="secondary">{team.pattern}</Badge>
                      {team.enableTools && <Badge variant="outline">tools</Badge>}
                    </CardTitle>
                    <CardDescription>
                      {team.members.map(m => m.agentId).join(' → ')} · max {team.maxRounds} rounds
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => runTeam(team)}
                      disabled={runningTeam !== null}
                    >
                      {runningTeam === team.id ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-2" />
                      )}
                      Run
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => deleteTeam(team)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {expandedTeam === team.id && transcript.length > 0 && (
                <CardContent className="space-y-3 border-t border-border pt-4">
                  {transcript.map((msg, i) => (
                    <div key={i} className="p-3 rounded-lg bg-muted">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="default">{msg.from}</Badge>
                        <span className="text-xs text-muted-foreground">round {msg.round}</span>
                        {msg.toolCalls?.map((tc, j) => (
                          <Badge key={j} variant="outline" className="text-xs">
                            {tc.name} {tc.ok ? '✓' : '✗'}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          ))}
          {!isLoading && teams.length === 0 && (
            <p className="text-muted-foreground">No teams yet. Create one above.</p>
          )}
        </div>
      )}
    </div>
  );
}
