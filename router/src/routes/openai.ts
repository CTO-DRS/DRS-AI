import { Router } from 'express';
import ollamaService from '../services/ollamaService';
import logger from '../utils/logger';

/**
 * OpenAI-compatible API layer (ported from OpenDrSai's OpenAI-compatible serving).
 *
 * Endpoints:
 *   GET  /v1/models
 *   POST /v1/chat/completions   (stream + non-stream, tool/function calling passthrough)
 *
 * Any OpenAI SDK can point its baseURL at this service:
 *   baseURL: http://<host>:3002/v1   (or via the gateway: /api/openai/v1)
 */

const router = Router();

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

function chunkId(): string {
  return `chatcmpl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function toOllamaMessages(messages: any[]): any[] {
  return messages.map((m: any) => {
    const out: any = { role: m.role, content: m.content ?? '' };
    if (Array.isArray(m.tool_calls)) {
      out.tool_calls = m.tool_calls.map((tc: any) => ({
        function: {
          name: tc.function?.name || tc.name,
          arguments:
            typeof tc.function?.arguments === 'string'
              ? safeParse(tc.function.arguments)
              : tc.function?.arguments ?? tc.arguments ?? {}
        }
      }));
    }
    if (m.role === 'tool') {
      out.role = 'tool';
    }
    return out;
  });
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function toOpenAIToolCalls(ollamaToolCalls: any[] | undefined): OpenAIToolCall[] | undefined {
  if (!ollamaToolCalls || !ollamaToolCalls.length) return undefined;
  return ollamaToolCalls.map((tc: any, i: number) => ({
    id: `call_${Date.now().toString(36)}_${i}`,
    type: 'function' as const,
    function: {
      name: tc.function?.name || tc.name,
      arguments:
        typeof tc.function?.arguments === 'string'
          ? tc.function.arguments
          : JSON.stringify(tc.function?.arguments ?? tc.arguments ?? {})
    }
  }));
}

// ============ GET /v1/models ============
router.get('/models', async (_req, res) => {
  try {
    const models = await ollamaService.listModels();
    res.json({
      object: 'list',
      data: models.map((m: any) => ({
        id: m.id,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'drs-ai',
        metadata: {
          family: m.family,
          parameters: m.parameters,
          quantization: m.quantization,
          capabilities: m.capabilities
        }
      }))
    });
  } catch (error: any) {
    logger.error('OpenAI-compat /models failed:', error);
    res.status(500).json({
      error: { message: error.message, type: 'internal_error', code: 'models_fetch_failed' }
    });
  }
});

// ============ POST /v1/chat/completions ============
router.post('/chat/completions', async (req, res) => {
  try {
    const {
      model,
      messages,
      stream = false,
      temperature = 0.7,
      top_p = 0.9,
      max_tokens,
      tools,
      tool_choice
    } = req.body || {};

    if (!model || !Array.isArray(messages)) {
      return res.status(400).json({
        error: {
          message: 'model and messages are required',
          type: 'invalid_request_error',
          code: 'invalid_request'
        }
      });
    }

    const ollamaRequest: any = {
      model,
      messages: toOllamaMessages(messages),
      stream,
      options: {
        temperature,
        top_p,
        num_predict: max_tokens ?? 2048
      }
    };

    // Function-calling passthrough (Ollama supports `tools` in /api/chat)
    if (Array.isArray(tools) && tools.length) {
      ollamaRequest.tools = tools.map((t: any) => ({
        type: 'function',
        function: {
          name: t.function?.name || t.name,
          description: t.function?.description || t.description || '',
          parameters: t.function?.parameters || t.parameters || { type: 'object', properties: {} }
        }
      }));
      if (tool_choice && tool_choice !== 'auto') {
        logger.debug(`tool_choice=${JSON.stringify(tool_choice)} noted (Ollama defaults to auto)`);
      }
    }

    const id = chunkId();
    const created = Math.floor(Date.now() / 1000);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      let finishReasonSent = false;
      const sendChunk = (obj: any) => {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
      };

      try {
        const response = await ollamaService.chat(ollamaRequest);
        response.on('data', (buf: Buffer) => {
          for (const line of buf.toString().split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let data: any;
            try {
              data = JSON.parse(trimmed);
            } catch {
              continue;
            }
            const piece = data.message?.content ?? '';
            const toolCalls = toOpenAIToolCalls(data.message?.tool_calls);

            const delta: any = {};
            if (piece) delta.content = piece;
            if (toolCalls) delta.tool_calls = toolCalls;

            if (data.done) {
              sendChunk({
                id,
                object: 'chat.completion.chunk',
                created,
                model,
                choices: [{ index: 0, delta: {}, finish_reason: toolCalls ? 'tool_calls' : 'stop' }]
              });
              sendChunk({ id, object: 'chat.completion.chunk', created, model, choices: [] });
              res.write('data: [DONE]\n\n');
              res.end();
              finishReasonSent = true;
            } else if (piece || toolCalls) {
              sendChunk({
                id,
                object: 'chat.completion.chunk',
                created,
                model,
                choices: [{ index: 0, delta, finish_reason: null }]
              });
            }
          }
        });
        response.on('error', (error: any) => {
          logger.error('OpenAI-compat stream error:', error);
          sendChunk({ error: { message: error.message, type: 'internal_error' } });
          res.end();
        });
        res.on('close', () => {
          if (!finishReasonSent) {
            try { res.end(); } catch { /* already closed */ }
          }
        });
      } catch (error: any) {
        logger.error('OpenAI-compat stream failed:', error);
        sendChunk({ error: { message: error.message, type: 'internal_error' } });
        res.end();
      }
      return;
    }

    // Non-streaming
    const response = await ollamaService.chat(ollamaRequest);
    const message: any = { role: 'assistant', content: response.message?.content ?? '' };
    const toolCalls = toOpenAIToolCalls(response.message?.tool_calls);
    if (toolCalls) message.tool_calls = toolCalls;

    res.json({
      id,
      object: 'chat.completion',
      created,
      model,
      choices: [
        {
          index: 0,
          message,
          finish_reason: toolCalls ? 'tool_calls' : 'stop'
        }
      ],
      usage: {
        prompt_tokens: response.prompt_eval_count ?? 0,
        completion_tokens: response.eval_count ?? 0,
        total_tokens: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0)
      }
    });
  } catch (error: any) {
    logger.error('OpenAI-compat chat failed:', error);
    res.status(500).json({
      error: { message: error.message, type: 'internal_error', code: 'chat_failed' }
    });
  }
});

export default router;
