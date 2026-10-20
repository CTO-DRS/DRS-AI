import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { toolRegistry } from './registry';

/**
 * Agentic tool loop — the heart of tool-using agents.
 * Ported from OpenDrSai's DrSaiAgent tool loop:
 *   model call -> tool_calls? -> execute tools -> feed results back -> repeat
 *   until a final text answer is produced or maxToolRounds is exhausted.
 */

const ROUTER_URL = process.env.ROUTER_SERVICE_URL || 'http://localhost:3002';

export interface ToolLoopMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
  name?: string;
  tool_call_id?: string;
}

export interface ToolLoopResult {
  content: string;
  toolCallsMade: Array<{ name: string; args: any; ok: boolean }>;
  rounds: number;
}

export async function runWithTools(opts: {
  model: string;
  messages: ToolLoopMessage[];
  tools?: string[];
  systemPrompt?: string;
  maxToolRounds?: number;
  temperature?: number;
  onEvent?: (event: { type: string; [k: string]: any }) => void;
  userId?: string;
}): Promise<ToolLoopResult> {
  const {
    model,
    messages,
    tools,
    systemPrompt,
    maxToolRounds = 8,
    temperature = 0.7,
    onEvent,
    userId
  } = opts;

  const openaiTools = await toolRegistry.toOpenAITools(tools);
  const conversation: any[] = [];
  if (systemPrompt) conversation.push({ role: 'system', content: systemPrompt });
  conversation.push(...messages);

  const toolCallsMade: Array<{ name: string; args: any; ok: boolean }> = [];
  let rounds = 0;

  const callModel = async (): Promise<any> => {
    const res = await fetch(`${ROUTER_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: conversation,
        stream: false,
        temperature,
        tools: openaiTools.length ? openaiTools : undefined
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Router chat failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const json: any = await res.json();
    return json?.data?.message || { role: 'assistant', content: '' };
  };

  while (rounds < maxToolRounds) {
    rounds++;
    onEvent?.({ type: 'round_start', round: rounds });

    const assistantMessage = await callModel();

    const rawToolCalls: any[] = assistantMessage.tool_calls || [];
    const content: string = assistantMessage.content || '';

    if (!rawToolCalls.length) {
      conversation.push({ role: 'assistant', content });
      return { content, toolCallsMade, rounds };
    }

    // Assistant asked for tools — execute each one
    conversation.push({
      role: 'assistant',
      content: content || '',
      tool_calls: rawToolCalls
    });

    for (const tc of rawToolCalls) {
      const name = tc.function?.name || tc.name;
      let args: any = tc.function?.arguments ?? tc.arguments ?? {};
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch { args = {}; }
      }

      onEvent?.({ type: 'tool_call', tool: name, args });
      logger.info(`Tool call: ${name} (${JSON.stringify(args).slice(0, 200)})`);

      const result = await toolRegistry.execute(name, args, userId);
      toolCallsMade.push({ name, args, ok: result.ok });
      onEvent?.({ type: 'tool_result', tool: name, ok: result.ok });

      conversation.push({
        role: 'tool',
        name,
        tool_call_id: tc.id || uuidv4(),
        content: JSON.stringify(result.ok ? result.result : { error: result.error }).slice(0, 12000)
      });
    }
  }

  // Max rounds reached — ask for a final answer without tools
  logger.warn(`Tool loop hit maxToolRounds=${maxToolRounds}, forcing final answer`);
  const res = await fetch(`${ROUTER_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [...conversation, { role: 'user', content: 'Based on the tool results above, provide your final answer now.' }],
      stream: false,
      temperature
    })
  });
  const json: any = await res.json();
  return {
    content: json?.data?.message?.content || '',
    toolCallsMade,
    rounds
  };
}
