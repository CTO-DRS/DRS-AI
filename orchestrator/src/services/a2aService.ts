import axios from 'axios';
import { randomUUID } from 'crypto';
import { A2aAgent } from '../models';
import teamService from './teamService';
import eventBus from './eventBus';
import logger from '../utils/logger';

/**
 * A2aService — Agent-to-Agent protocol client/server (drSai A2A parity).
 *
 * drSai's runtime (docs/manual/opendrsai-manual-01.md) advertises
 * compatibility with the A2A protocol alongside MCP. This service brings
 * the same capability to the orchestrator:
 *
 *  - Registry of remote A2A peers (agent cards at `/.well-known/agent.json`).
 *  - Outbound: JSON-RPC 2.0 `message/send` to a remote peer (A2A wire
 *    format: `params.message.parts[].kind === 'text'`), with task-state
 *    mapping (submitted/working/completed/failed) and timeouts.
 *  - Inbound: `buildLocalAgentCard()` exposes this orchestrator as an A2A
 *    server, and `acceptInboundMessage()` lets external A2A agents delegate
 *    work into a local team run (drSai "register as API" philosophy).
 *
 * Stateless like McpService — no long-lived connections, safe to scale.
 */

const REQUEST_TIMEOUT = parseInt(process.env.A2A_REQUEST_TIMEOUT || '30000');

export interface A2aTextPart {
  kind: 'text';
  text: string;
}

export interface A2aMessage {
  role: 'user' | 'agent';
  parts: A2aTextPart[];
  messageId: string;
  contextId?: string;
  taskId?: string;
}

export interface A2aTaskResult {
  kind: 'task' | 'message';
  id?: string;
  /** A2A task state: submitted | working | input-required | completed | failed | canceled */
  state?: string;
  text: string;
  raw: Record<string, any>;
}

/* ------------------------------------------------------------------ */
/* Response extraction                                                 */
/* ------------------------------------------------------------------ */

/** Pull every text fragment out of an A2A artifact/message part list. */
function extractText(parts: any): string {
  if (!Array.isArray(parts)) return '';
  const texts: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    if (typeof part.text === 'string') {
      texts.push(part.text);
    } else if (part.kind === 'data' && part.data != null) {
      try {
        texts.push(JSON.stringify(part.data, null, 2));
      } catch {
        /* ignore unserializable data parts */
      }
    } else if (typeof part.raw === 'string') {
      texts.push(part.raw);
    }
  }
  return texts.join('\n\n').trim();
}

/** Normalize a JSON-RPC `message/send` result into an A2aTaskResult. */
function normalizeResult(result: any): A2aTaskResult {
  if (!result || typeof result !== 'object') {
    return { kind: 'message', text: '', raw: {} };
  }

  // A task object (long-running form)
  if (result.kind === 'task' || result.status || (result.id && result.artifacts !== undefined)) {
    const state = result.status?.state || 'working';
    const statusText = extractText(result.status?.message?.parts);
    const artifactText = extractText(result.artifacts?.flatMap((a: any) => a?.parts || []));
    const historyText = extractText(result.history?.filter((m: any) => m?.role === 'agent')?.flatMap((m: any) => m?.parts || []));
    const text = artifactText || historyText || statusText || '';
    return { kind: 'task', id: result.id, state, text, raw: result };
  }

  // A plain message (short form)
  const text = extractText(result.parts);
  return { kind: 'message', text, raw: result };
}

export class A2aService {
  /* ---------------------------------------------------------- */
  /* Registry                                                    */
  /* ---------------------------------------------------------- */

  async registerAgent(data: {
    name: string;
    endpoint: string;
    description?: string;
    createdBy: string;
  }): Promise<A2aAgent> {
    let normalized = (data.endpoint || '').trim();
    if (normalized && !/^https?:\/\//i.test(normalized)) {
      normalized = `http://${normalized}`;
    }
    try {
      // Validate URL shape early for a friendlier 400.
      new URL(normalized);
    } catch {
      throw Object.assign(new Error('endpoint must be a valid URL'), { statusCode: 400 });
    }
    return A2aAgent.create({
      name: data.name.trim().slice(0, 100),
      endpoint: normalized.replace(/\/+$/, ''),
      description: data.description?.slice(0, 2000),
      createdBy: data.createdBy
    } as any);
  }

  async listAgents(): Promise<A2aAgent[]> {
    return A2aAgent.findAll({ order: [['createdAt', 'DESC']] });
  }

  async getAgent(id: string): Promise<A2aAgent | null> {
    return A2aAgent.findByPk(id);
  }

  async deleteAgent(id: string, userId: string, isAdmin: boolean): Promise<boolean> {
    const agent = await A2aAgent.findByPk(id);
    if (!agent) return false;
    if (agent.createdBy !== userId && !isAdmin) {
      throw Object.assign(new Error('Access denied'), { statusCode: 403 });
    }
    await agent.destroy();
    return true;
  }

  async toggleAgent(id: string, enabled: boolean): Promise<A2aAgent | null> {
    const agent = await A2aAgent.findByPk(id);
    if (!agent) return null;
    await agent.update({ isEnabled: enabled } as any);
    return agent;
  }

  /* ---------------------------------------------------------- */
  /* Discovery                                                   */
  /* ---------------------------------------------------------- */

  /** Fetch and cache the remote peer's agent card. */
  async probe(agentId: string): Promise<{ ok: boolean; card?: Record<string, any>; error?: string; agent: A2aAgent }> {
    const agent = await this.getAgent(agentId);
    if (!agent) throw Object.assign(new Error('A2A agent not found'), { statusCode: 404 });

    try {
      const cardUrl = `${agent.endpoint}/.well-known/agent.json`;
      const resp = await axios.get(cardUrl, { timeout: REQUEST_TIMEOUT });
      const card = resp.data;

      await agent.update({
        cardCache: card,
        lastProbeAt: new Date(),
        lastProbeStatus: 'reachable',
        // Adopt the remote self-declared name if we only had a placeholder.
        name: agent.name || card?.name
      } as any);

      return { ok: true, card, agent };
    } catch (error: any) {
      const status = error.response ? `http_${error.response.status}` : 'unreachable';
      await agent.update({ lastProbeAt: new Date(), lastProbeStatus: status } as any);
      return { ok: false, error: error.message, agent };
    }
  }

  /* ---------------------------------------------------------- */
  /* Outbound messaging                                          */
  /* ---------------------------------------------------------- */

  /** Send a text message to a registered peer via JSON-RPC 2.0 message/send. */
  async sendMessage(
    agentId: string,
    text: string,
    options?: { contextId?: string; taskId?: string }
  ): Promise<A2aTaskResult> {
    const agent = await this.getAgent(agentId);
    if (!agent) throw Object.assign(new Error('A2A agent not found'), { statusCode: 404 });
    if (!agent.isEnabled) {
      throw Object.assign(new Error('A2A agent is disabled'), { statusCode: 409 });
    }
    const trimmed = (text || '').trim();
    if (!trimmed) throw Object.assign(new Error('message text is required'), { statusCode: 400 });

    const message: A2aMessage = {
      role: 'user',
      parts: [{ kind: 'text', text: trimmed }],
      messageId: randomUUID(),
      contextId: options?.contextId,
      taskId: options?.taskId
    };

    const payload = {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'message/send',
      params: {
        message,
        configuration: { acceptedOutputModes: ['text/plain', 'application/json'] }
      }
    };

    try {
      const resp = await axios.post(agent.endpoint, payload, {
        timeout: REQUEST_TIMEOUT,
        headers: { 'Content-Type': 'application/json' }
      });

      if (resp.data?.error) {
        throw Object.assign(
          new Error(`Remote A2A error ${resp.data.error.code}: ${resp.data.error.message}`),
          { statusCode: 502 }
        );
      }
      const result = normalizeResult(resp.data?.result);
      logger.info(`A2A message sent to ${agent.name} (${agent.endpoint}) → ${result.kind}:${result.state || 'n/a'}`);
      eventBus.publish('a2a.message', {
        agentId: agent.id,
        agentName: agent.name,
        direction: 'outbound',
        state: result.state,
        textLength: result.text.length
      });
      return result;
    } catch (error: any) {
      if (error.statusCode) throw error;
      throw Object.assign(
        new Error(`A2A request to ${agent.name} failed: ${error.message}`),
        { statusCode: 502 }
      );
    }
  }

  /* ---------------------------------------------------------- */
  /* Local delegation (inbound)                                  */
  /* ---------------------------------------------------------- */

  /** Our own A2A agent card so external agents can discover us. */
  buildLocalAgentCard(baseUrl: string): Record<string, any> {
    return {
      name: 'DRS-AI Orchestrator',
      description:
        'DRS AI multi-agent orchestrator: agent teams, task planner, HITL approvals, MCP tools, knowledge memory. ' +
        'Send A2A message/send requests to delegate work into a team run via the /a2a/inbox endpoint.',
      url: `${baseUrl}/a2a`,
      version: '2.0.0',
      protocolVersion: '0.2.5',
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: true
      },
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['text/plain', 'application/json'],
      skills: [
        { id: 'team_run', name: 'Team run', description: 'Delegate a task to a multi-agent team' },
        { id: 'knowledge_search', name: 'Knowledge search', description: 'BM25 retrieval over ingested knowledge' },
        { id: 'web_search', name: 'Web search', description: 'Keyless DuckDuckGo search tool' }
      ]
    };
  }

  /**
   * Accept an inbound A2A message: delegate into a local team run
   * (drSai "agent registered as API" pattern). Returns a normal A2A
   * task-shaped result so generic A2A clients keep working.
   */
  async acceptInboundMessage(params: {
    teamId: string;
    text: string;
    userId: string;
    useMemory?: boolean;
    useWebSearch?: boolean;
  }): Promise<A2aTaskResult> {
    const trimmed = (params.text || '').trim();
    if (!trimmed) throw Object.assign(new Error('message text is required'), { statusCode: 400 });

    const run = await teamService.runTeam({
      teamId: params.teamId,
      userId: params.userId,
      input: trimmed,
      useMemory: params.useMemory !== false,
      useWebSearch: params.useWebSearch
    });

    eventBus.publish('a2a.message', {
      direction: 'inbound',
      teamId: params.teamId,
      runId: run.id,
      textLength: trimmed.length
    });

    return {
      kind: 'task',
      id: run.id,
      state: run.status === 'completed' ? 'completed' : 'working',
      text: run.result || '',
      raw: { runId: run.id, status: run.status }
    };
  }
}

export default new A2aService();
