import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import redis from '../utils/redis';
import { agentRegistry } from '../agents';
import { runWithTools, ToolLoopMessage } from '../tools/agentLoop';
import { toolRegistry } from '../tools/registry';

/**
 * Multi-agent team orchestration.
 * Ported from OpenDrSai's group chat patterns (AutoGen-style):
 *   - round_robin : agents speak in a fixed order until a termination condition
 *   - selector    : an LLM picks the next speaker each round (AGSelectorGroupChat)
 *   - handoff     : agents transfer control via HANDOFF:<agent> markers (Swarm)
 * Every team run is persisted in Redis and each message is emitted via callback
 * so the route layer can stream it over SSE.
 */

const TEAM_PREFIX = 'drs:team:';
const TEAM_RUN_PREFIX = 'drs:teamrun:';

export type TeamPattern = 'round_robin' | 'selector' | 'handoff';

export interface TeamMember {
  agentId: string;
  role?: string;
  /** optional explicit model override */
  model?: string;
}

export interface Team {
  id: string;
  name: string;
  pattern: TeamPattern;
  members: TeamMember[];
  maxRounds: number;
  /** when true, agents can use the tool registry during their turns */
  enableTools: boolean;
  /** skill names to inject into member system prompts */
  skills?: string[];
  createdAt: string;
  userId: string;
}

export interface TeamMessage {
  from: string;
  role: string;
  content: string;
  round: number;
  timestamp: string;
  toolCalls?: Array<{ name: string; ok: boolean }>;
}

export interface TeamRun {
  id: string;
  teamId: string;
  task: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  messages: TeamMessage[];
  finalOutput?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

const TERMINATION_TEXT = 'TERMINATE';

function buildSystemPrompt(agentName: string, basePrompt: string, pattern: TeamPattern, members: TeamMember[]): string {
  const memberList = members.map(m => `- ${m.agentId}${m.role ? ` (${m.role})` : ''}`).join('\n');
  let prompt = `${basePrompt}\n\nYou are participating in a multi-agent team conversation. Your agent name is "${agentName}".`;
  prompt += `\n\nTeam members:\n${memberList}`;

  switch (pattern) {
    case 'round_robin':
      prompt += `\n\nSpeakers take turns in a fixed order. When your turn comes, contribute meaningfully. If the task is complete and no further contribution is needed from you, reply with exactly "${TERMINATION_TEXT}" on the first line followed optionally by a brief summary.`;
      break;
    case 'selector':
      prompt += `\n\nAfter each turn, a coordinator selects the next speaker. Address your message to the agent best suited to continue. If the task is complete, reply with exactly "${TERMINATION_TEXT}" on the first line followed optionally by a brief summary.`;
      break;
    case 'handoff':
      prompt += `\n\nYou can transfer control to another team member by starting your reply with "HANDOFF:<agentId>" followed by your message to them. Choose the member best suited for the next step. If the task is complete, reply with exactly "${TERMINATION_TEXT}" on the first line followed optionally by the final answer.`;
      break;
  }
  return prompt;
}

async function loadSkillsBodies(skillNames: string[]): Promise<string> {
  if (!skillNames?.length) return '';
  try {
    const skillsUrl = process.env.SKILLS_SERVICE_URL || 'http://localhost:3045';
    const bodies: string[] = [];
    for (const name of skillNames) {
      const res = await fetch(`${skillsUrl}/skills/${encodeURIComponent(name)}`);
      if (!res.ok) continue;
      const json: any = await res.json();
      const body = json?.data?.skill?.body;
      if (body) bodies.push(`--- Skill: ${name} ---\n${body.slice(0, 4000)}`);
    }
    return bodies.length ? `\n\nThe following skill instructions are available to you. Follow them when relevant to the task.\n\n${bodies.join('\n\n')}` : '';
  } catch (e: any) {
    logger.warn(`Failed to load skills: ${e.message}`);
    return '';
  }
}

async function callModel(model: string, messages: any[], temperature = 0.7): Promise<any> {
  const routerUrl = process.env.ROUTER_SERVICE_URL || 'http://localhost:3002';
  const res = await fetch(`${routerUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false, temperature })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Router chat failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json: any = await res.json();
  return json?.data?.message || { role: 'assistant', content: '' };
}

/** LLM-based speaker selection (ported from AGSelectorGroupChat) */
async function selectNextSpeaker(
  selectorModel: string,
  members: TeamMember[],
  transcript: TeamMessage[],
  task: string
): Promise<string> {
  const transcriptText = transcript
    .slice(-10)
    .map(m => `${m.from}: ${m.content.slice(0, 300)}`)
    .join('\n');
  const prompt = `You are the coordinator of a multi-agent team. Read the conversation and decide which team member should speak next.

Task: ${task}

Recent conversation:
${transcriptText}

Available members: ${members.map(m => m.agentId).join(', ')}

Respond with ONLY the agentId of the next speaker (one of: ${members.map(m => m.agentId).join(', ')}). Nothing else.`;

  try {
    const msg = await callModel(selectorModel, [{ role: 'user', content: prompt }], 0.1);
    const content = (msg.content || '').trim();
    const found = members.find(m => content.includes(m.agentId));
    return found ? found.agentId : members[0].agentId;
  } catch (e: any) {
    logger.warn('Selector failed, falling back to round robin:', e.message);
    return members[transcript.length % members.length].agentId;
  }
}

export class TeamOrchestrator {
  // ------------------------------------------------------------------
  // CRUD
  // ------------------------------------------------------------------
  async createTeam(data: {
    name: string;
    pattern: TeamPattern;
    members: TeamMember[];
    maxRounds?: number;
    enableTools?: boolean;
    skills?: string[];
    userId: string;
  }): Promise<Team> {
    if (!data.members?.length) throw new Error('Team needs at least one member');
    for (const m of data.members) {
      if (!agentRegistry.getAgent(m.agentId)) {
        throw new Error(`Unknown agent: ${m.agentId}. Available: ${agentRegistry.getAllAgents().map(a => a.getId()).join(', ')}`);
      }
    }
    const team: Team = {
      id: uuidv4(),
      name: data.name,
      pattern: data.pattern,
      members: data.members,
      maxRounds: Math.min(data.maxRounds ?? 12, 40),
      enableTools: data.enableTools ?? false,
      skills: data.skills,
      createdAt: new Date().toISOString(),
      userId: data.userId
    };
    await redis.set(`${TEAM_PREFIX}${team.id}`, JSON.stringify(team));
    return team;
  }

  async getTeam(id: string): Promise<Team | null> {
    const raw = await redis.get(`${TEAM_PREFIX}${id}`);
    return raw ? JSON.parse(raw) : null;
  }

  async listTeams(userId?: string): Promise<Team[]> {
    const keys = await redis.keys(`${TEAM_PREFIX}*`);
    const teams: Team[] = [];
    for (const key of keys) {
      const raw = await redis.get(key);
      if (raw) {
        const t: Team = JSON.parse(raw);
        if (!userId || t.userId === userId) teams.push(t);
      }
    }
    return teams.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteTeam(id: string): Promise<boolean> {
    const deleted = await redis.del(`${TEAM_PREFIX}${id}`);
    return deleted > 0;
  }

  // ------------------------------------------------------------------
  // Run
  // ------------------------------------------------------------------
  async runTeam(
    teamId: string,
    task: string,
    onMessage?: (msg: TeamMessage) => void,
    userId?: string
  ): Promise<TeamRun> {
    const team = await this.getTeam(teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);

    const run: TeamRun = {
      id: uuidv4(),
      teamId,
      task,
      status: 'running',
      messages: [],
      startedAt: new Date().toISOString()
    };
    await redis.set(`${TEAM_RUN_PREFIX}${run.id}`, JSON.stringify(run));

    try {
      const skillBodies = await loadSkillsBodies(team.skills || []);
      const transcript: TeamMessage[] = [];
      let speakerIdx = 0;

      const pushMessage = async (m: TeamMessage) => {
        transcript.push(m);
        run.messages.push(m);
        onMessage?.(m);
        await redis.set(`${TEAM_RUN_PREFIX}${run.id}`, JSON.stringify(run));
      };

      for (let round = 1; round <= team.maxRounds; round++) {
        let currentId: string;

        switch (team.pattern) {
          case 'round_robin':
            currentId = team.members[(round - 1) % team.members.length].agentId;
            break;
          case 'selector': {
            if (transcript.length === 0) {
              currentId = team.members[0].agentId;
            } else {
              const selectorModel =
                team.members[0].model ||
                agentRegistry.getAgent(team.members[0].agentId)?.getName() + '';
              const agent0 = agentRegistry.getAgent(team.members[0].agentId);
              currentId = await selectNextSpeaker(
                (agent0 as any)?.config?.defaultModel || 'llama3.2',
                team.members,
                transcript,
                task
              );
            }
            break;
          }
          case 'handoff': {
            if (transcript.length === 0) {
              currentId = team.members[0].agentId;
            } else {
              const last = transcript[transcript.length - 1];
              const handoffMatch = last.content.match(/^HANDOFF[:\s]*([a-zA-Z0-9_-]+)/);
              if (handoffMatch) {
                const target = team.members.find(m => m.agentId === handoffMatch[1]);
                currentId = target ? target.agentId : team.members[(speakerIdx + 1) % team.members.length].agentId;
              } else {
                // last agent did not hand off and did not terminate -> keep going round robin
                currentId = team.members[(speakerIdx + 1) % team.members.length].agentId;
              }
            }
            break;
          }
          default:
            currentId = team.members[(round - 1) % team.members.length].agentId;
        }

        speakerIdx = team.members.findIndex(m => m.agentId === currentId);
        const member = team.members[speakerIdx];
        const agent = agentRegistry.getAgent(currentId);
        if (!agent || !member) throw new Error(`Agent ${currentId} not found`);

        const agentCfg = (agent as any).config;
        const model = member.model || agentCfg?.defaultModel || 'llama3.2';

        const systemPrompt =
          buildSystemPrompt(currentId, agentCfg?.systemPrompt || 'You are a helpful AI agent.', team.pattern, team.members) +
          skillBodies;

        // Conversation for this agent: task + transcript + its own instruction
        const messages: ToolLoopMessage[] = [
          { role: 'user', content: `Team task: ${task}` },
          ...transcript.map(m => ({
            role: 'user' as const,
            content: `[message from ${m.from}]:\n${m.content}`
          })),
          {
            role: 'user',
            content:
              transcript.length === 0
                ? 'It is your turn to start. Provide your first contribution.'
                : 'It is your turn. Contribute to the conversation, or reply with TERMINATE if the task is complete.'
          }
        ];

        let content: string;
        let toolCalls: Array<{ name: string; ok: boolean }> | undefined;

        if (team.enableTools) {
          const result = await runWithTools({
            model,
            messages,
            systemPrompt,
            onEvent: () => { /* could stream tool events later */ },
            userId
          });
          content = result.content;
          toolCalls = result.toolCallsMade.map(t => ({ name: t.name, ok: t.ok }));
        } else {
          const msg = await callModel(model, [{ role: 'system', content: systemPrompt }, ...messages]);
          content = msg.content || '';
        }

        const isTermination = content.trim().toUpperCase().startsWith(TERMINATION_TEXT);
        const cleanContent = isTermination
          ? content.replace(new RegExp(`^\\s*${TERMINATION_TEXT}\\s*:?\\s*`, 'i'), '').trim()
          : content;

        await pushMessage({
          from: currentId,
          role: 'assistant',
          content: cleanContent || (isTermination ? '(task complete)' : content),
          round,
          timestamp: new Date().toISOString(),
          toolCalls
        });

        if (isTermination) {
          run.finalOutput = cleanContent;
          break;
        }
        run.finalOutput = cleanContent;
      }

      run.status = 'completed';
      run.completedAt = new Date().toISOString();
    } catch (e: any) {
      logger.error(`Team run failed:`, e);
      run.status = 'failed';
      run.error = e.message;
      run.completedAt = new Date().toISOString();
    }

    await redis.set(`${TEAM_RUN_PREFIX}${run.id}`, JSON.stringify(run));
    return run;
  }

  async getRun(runId: string): Promise<TeamRun | null> {
    const raw = await redis.get(`${TEAM_RUN_PREFIX}${runId}`);
    return raw ? JSON.parse(raw) : null;
  }
}

export const teamOrchestrator = new TeamOrchestrator();
