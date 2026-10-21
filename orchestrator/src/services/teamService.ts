import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Team, TeamRun, TeamMessage } from '../models';
import { agentRegistry } from '../agents';
import { Agent } from '../types';
import logger from '../utils/logger';
import eventBus from './eventBus';

/**
 * TeamService — multi-agent team orchestration inspired by drSai's
 * group-chat engine (RoundRobinGroupChat / SelectorGroupChat).
 *
 * Strategies:
 *  - round_robin: agents take turns in registered order; each sees the
 *    full transcript. Stops on maxRounds or when an agent emits the
 *    terminate phrase (default "TERMINATE", AutoGen-style).
 *  - selector: an LLM picks the most suitable next speaker from the
 *    roster at each step (falls back to round-robin on parse failure).
 */

const ROUTER_URL = process.env.ROUTER_SERVICE_URL || 'http://localhost:3002';

export interface RunTeamOptions {
  teamId: string;
  userId: string;
  input: string;
  maxRoundsOverride?: number;
}

export class TeamService {
  /* ---------------------------------------------------------- */
  /* CRUD                                                       */
  /* ---------------------------------------------------------- */

  async createTeam(data: {
    name: string;
    description?: string;
    agentIds: string[];
    strategy?: 'round_robin' | 'selector';
    maxRounds?: number;
    selectorModel?: string;
    terminatePhrase?: string;
    createdBy: string;
  }): Promise<Team> {
    // Validate agents exist
    for (const agentId of data.agentIds) {
      if (!agentRegistry.getAgent(agentId)) {
        throw new Error(`Unknown agent: ${agentId}`);
      }
    }
    return Team.create({
      name: data.name,
      description: data.description,
      agentIds: data.agentIds,
      strategy: data.strategy || 'round_robin',
      maxRounds: Math.min(Math.max(data.maxRounds || 6, 2), 20),
      selectorModel: data.selectorModel,
      terminatePhrase: data.terminatePhrase || 'TERMINATE',
      createdBy: data.createdBy
    } as any);
  }

  async listTeams(userId?: string): Promise<Team[]> {
    const where = userId ? { createdBy: userId } : {};
    return Team.findAll({ where, order: [['createdAt', 'DESC']] });
  }

  async getTeam(teamId: string): Promise<Team | null> {
    return Team.findByPk(teamId);
  }

  async deleteTeam(teamId: string, userId: string, isAdmin: boolean): Promise<boolean> {
    const team = await Team.findByPk(teamId);
    if (!team) return false;
    if (team.createdBy !== userId && !isAdmin) {
      throw Object.assign(new Error('Access denied'), { statusCode: 403 });
    }
    await team.destroy();
    return true;
  }

  /* ---------------------------------------------------------- */
  /* Execution                                                  */
  /* ---------------------------------------------------------- */

  async runTeam(options: RunTeamOptions): Promise<TeamRun> {
    const team = await this.getTeam(options.teamId);
    if (!team) throw Object.assign(new Error('Team not found'), { statusCode: 404 });

    const roster = (team.agentIds || [])
      .map((id) => ({ id, agent: agentRegistry.getAgent(id), config: agentRegistry.getAgentConfig(id) }))
      .filter((entry) => entry.agent && entry.config) as Array<{ id: string; agent: { getName(): string }; config: Agent }>;

    if (roster.length < 2) {
      throw new Error('Team has fewer than 2 valid agents');
    }

    const run = await TeamRun.create({
      teamId: team.id,
      userId: options.userId,
      input: options.input,
      status: 'running',
      startedAt: new Date(),
      transcript: [],
      rounds: 0
    } as any);

    try {
      const maxRounds = options.maxRoundsOverride || team.maxRounds;
      const transcript: TeamMessage[] = [];
      let nextSpeaker = 0; // index into roster for round-robin
      let finalResult = '';

      for (let round = 1; round <= maxRounds; round++) {
        // Cooperative stop: check if the run was stopped via the API
        await run.reload();
        if (run.status === 'stopped') {
          logger.info(`TeamRun ${run.id}: stopped by user at round ${round}`);
          return run;
        }

        // Choose speaker
        if (team.strategy === 'selector' && roster.length > 1) {
          const picked = await this.selectSpeaker(team, roster, transcript, options.input);
          nextSpeaker = picked;
        }

        const entry = roster[nextSpeaker % roster.length];
        const agentName = entry.agent.getName();

        logger.info(`TeamRun ${run.id} round ${round}: ${agentName} (strategy=${team.strategy})`);

        const content = await this.speak(entry.config, options.input, transcript, agentName);

        const message: TeamMessage = {
          round,
          agentId: entry.id,
          agentName,
          content,
          timestamp: new Date().toISOString()
        };
        transcript.push(message);

        await run.update({ transcript, rounds: round } as any);
        await eventBus.publish('teamrun.progress', {
          runId: run.id,
          teamId: team.id,
          teamName: team.name,
          round,
          maxRounds,
          message
        }, options.userId);

        // Termination checks (drSai/AutoGen conventions)
        if (content.includes(team.terminatePhrase)) {
          finalResult = content.replace(team.terminatePhrase, '').trim() || transcript[transcript.length - 2]?.content || content;
          logger.info(`TeamRun ${run.id}: terminate phrase emitted by ${agentName}`);
          break;
        }
        finalResult = content;
        nextSpeaker = (nextSpeaker + 1) % roster.length;
      }

      await run.update({
        status: 'completed',
        result: finalResult,
        completedAt: new Date()
      } as any);

      await eventBus.publish('teamrun.completed', {
        runId: run.id,
        teamId: team.id,
        teamName: team.name,
        rounds: transcript.length,
        result: finalResult
      }, options.userId);

      return run;
    } catch (error: any) {
      await run.update({ status: 'failed', error: error.message, completedAt: new Date() } as any);
      await eventBus.publish('teamrun.failed', { runId: run.id, teamId: team.id, error: error.message }, options.userId);
      throw error;
    }
  }

  /**
   * One agent turn: system prompt from agent config + transcript context.
   */
  private async speak(
    config: Agent,
    input: string,
    transcript: TeamMessage[],
    speakerName: string
  ): Promise<string> {
    const isFirstTurn = transcript.length === 0;

    const history = transcript.map((m) => ({
      role: 'assistant' as const,
      content: `[${m.agentName}]: ${m.content}`
    }));

    const turnPrompt = isFirstTurn
      ? input
      : `${input}\n\n(You already heard the other team members above. As ${speakerName}, provide your next contribution. If the task is fully solved or you have nothing meaningful to add, reply with a one-sentence summary followed by the word TERMINATE.)`;

    const messages = [
      {
        role: 'system' as const,
        content:
          `${config.systemPrompt}\n\n` +
          `You are "${speakerName}" working inside a multi-agent team discussion. ` +
          `Other members' messages appear prefixed with [AgentName]. Be concise and build on their work; do not repeat them.`
      },
      ...history,
      { role: 'user' as const, content: turnPrompt }
    ];

    const response = await axios.post(
      `${ROUTER_URL}/chat`,
      {
        model: config.defaultModel,
        messages,
        stream: false,
        options: { temperature: config.temperature, num_predict: config.maxTokens }
      },
      { timeout: 300000 }
    );

    return response.data?.data?.message?.content || '';
  }

  /**
   * Selector strategy: LLM picks next speaker from the roster.
   */
  private async selectSpeaker(
    team: Team,
    roster: Array<{ id: string; agent: { getName(): string }; config: Agent }>,
    transcript: TeamMessage[],
    input: string
  ): Promise<number> {
    const names = roster.map((r) => r.agent.getName());
    const transcriptText = transcript
      .slice(-8)
      .map((m) => `[${m.agentName}]: ${m.content.slice(0, 500)}`)
      .join('\n');

    try {
      const response = await axios.post(
        `${ROUTER_URL}/chat/generate`,
        {
          model: team.selectorModel || roster[0].config.defaultModel,
          prompt:
            `Task: ${input}\n\n` +
            `Recent discussion:\n${transcriptText || '(no messages yet)'}\n\n` +
            `Team members: ${names.join(', ')}\n` +
            `Which member should speak next to make the most progress? Reply with EXACTLY one name from the list and nothing else.`,
          stream: false,
          options: { temperature: 0.1, num_predict: 30 }
        },
        { timeout: 120000 }
      );

      const answer: string = (response.data?.data?.response || '').trim();
      const idx = names.findIndex((n) => answer.toLowerCase().includes(n.toLowerCase()));
      if (idx >= 0) return idx;

      // drSai-style fallback: rotate to the next speaker after the last one
      logger.warn(`Selector returned unparseable answer "${answer}" — falling back to round-robin`);
      return transcript.length % roster.length;
    } catch (error: any) {
      logger.error('Selector model call failed, falling back to round-robin:', error.message);
      return transcript.length % roster.length;
    }
  }

  async listRuns(teamId: string | undefined, userId: string): Promise<TeamRun[]> {
    const where = teamId ? { teamId, userId } : { userId };
    return TeamRun.findAll({ where, order: [['createdAt', 'DESC']], limit: 100 });
  }

  async getRun(runId: string, userId: string): Promise<TeamRun | null> {
    const run = await TeamRun.findByPk(runId);
    if (run && run.userId !== userId) {
      throw Object.assign(new Error('Access denied'), { statusCode: 403 });
    }
    return run;
  }

  async stopRun(runId: string, userId: string): Promise<boolean> {
    const run = await this.getRun(runId, userId);
    if (!run || run.status !== 'running') return false;
    // Cooperative stop: mark status; the executing loop checks DB between rounds.
    await run.update({ status: 'stopped', completedAt: new Date() } as any);
    return true;
  }
}

export default new TeamService();
