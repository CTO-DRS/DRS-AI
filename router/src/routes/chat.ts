import { Router } from 'express';
import ollamaService from '../services/ollamaService';
import logger from '../utils/logger';

const router = Router();

const MEMORY_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3004';
const RAG_URL = process.env.RAG_SERVICE_URL || 'http://localhost:3022';

/**
 * Conversation persistence helpers (ported from OpenDrSai: every chat turn is stored).
 * All failures are non-fatal — chat must keep working when memory service is down.
 */
async function ensureConversation(userId: string, conversationId: string | undefined, firstUserMessage: string): Promise<string | null> {
  try {
    if (conversationId) return conversationId;
    if (!userId) return null;
    const title = firstUserMessage.slice(0, 60) || 'New Chat';
    const res = await fetch(`${MEMORY_URL}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ title })
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.data?.conversation?.id || null;
  } catch (e: any) {
    logger.warn('ensureConversation failed:', e.message);
    return null;
  }
}

async function saveMessage(userId: string, conversationId: string | null, role: string, content: string, metadata?: any): Promise<void> {
  if (!userId || !conversationId || !content) return;
  try {
    await fetch(`${MEMORY_URL}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ role, content, metadata })
    });
  } catch (e: any) {
    logger.warn('saveMessage failed:', e.message);
  }
}

/**
 * RAG context injection (ported from OpenDrSai: retrieval before generation).
 * Queries the hybrid-rag service and prepends retrieved documents as context.
 */
async function retrieveRagContext(query: string, limit = 5): Promise<string | null> {
  try {
    const res = await fetch(`${RAG_URL}/api/v1/rag/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit, searchType: 'hybrid' }),
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const results = json?.data?.results || json?.results || [];
    if (!Array.isArray(results) || results.length === 0) return null;
    const ctx = results
      .slice(0, limit)
      .map((r: any, i: number) => `[${i + 1}] ${r.title || r.documentId || 'doc'}:\n${String(r.content || r.text || '').slice(0, 1200)}`)
      .join('\n\n');
    return ctx;
  } catch (e: any) {
    logger.warn('retrieveRagContext failed:', e.message);
    return null;
  }
}

// Chat completion
router.post('/', async (req, res) => {
  try {
    const { model, messages, stream = false, options = {}, tools, conversationId, useRag = false } = req.body;
    
    if (!model || !messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Model and messages array are required'
        }
      });
    }

    const userId = (req.headers['x-user-id'] as string) || '';
    const lastUser = [...messages].reverse().find((m: any) => m.role === 'user');

    // Resolve / create the conversation early so we can return its id
    const resolvedConversationId = await ensureConversation(userId, conversationId, lastUser?.content || '');

    // Build final message list, injecting RAG context when requested
    let finalMessages = [...messages];
    if (useRag && lastUser?.content) {
      const ragContext = await retrieveRagContext(lastUser.content);
      if (ragContext) {
        finalMessages = [
          {
            role: 'system',
            content: `Use the following retrieved documents to answer the user's question. Cite them as [1], [2] etc. when relevant. If the documents do not contain the answer, say so and answer from your own knowledge.\n\n--- Retrieved documents ---\n${ragContext}\n--- End of retrieved documents ---`
          },
          ...finalMessages
        ];
      }
    }

    const request: any = {
      model,
      messages: finalMessages,
      stream,
      options: {
        temperature: options.temperature ?? 0.7,
        top_p: options.top_p ?? 0.9,
        top_k: options.top_k ?? 40,
        num_predict: options.max_tokens ?? 2048,
        ...options
      }
    };

    // Function-calling passthrough (Ollama native tools support)
    if (Array.isArray(tools) && tools.length) {
      request.tools = tools;
    }

    // Persist the user turn (non-stream write-back happens after response below)
    if (lastUser?.content) {
      await saveMessage(userId, resolvedConversationId, 'user', lastUser.content);
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const response = await ollamaService.chat(request);
        
        response.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              res.write(`data: ${JSON.stringify(data)}\n\n`);
              
              if (data.done) {
                res.write('data: [DONE]\n\n');
                res.end();
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        });

        response.on('error', (error: any) => {
          logger.error('Stream error:', error);
          res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
          res.end();
        });
      } catch (error: any) {
        logger.error('Chat stream failed:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'CHAT_FAILED',
            message: error.message
          }
        });
      }
    } else {
      const response = await ollamaService.chat(request);
      const assistantContent = response.message?.content || '';
      await saveMessage(userId, resolvedConversationId, 'assistant', assistantContent, { model });
      res.json({
        success: true,
        data: { ...response, conversationId: resolvedConversationId }
      });
    }
  } catch (error: any) {
    logger.error('Chat request failed:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CHAT_FAILED',
        message: error.message
      }
    });
  }
});

// Generate completion
router.post('/generate', async (req, res) => {
  try {
    const { model, prompt, system, stream = false, options = {} } = req.body;
    
    if (!model || !prompt) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Model and prompt are required'
        }
      });
    }

    const request = {
      model,
      prompt,
      system,
      stream,
      options: {
        temperature: options.temperature ?? 0.7,
        top_p: options.top_p ?? 0.9,
        top_k: options.top_k ?? 40,
        num_predict: options.max_tokens ?? 2048,
        ...options
      }
    };

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const response = await ollamaService.generate(request);
      
      response.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
            
            if (data.done) {
              res.write('data: [DONE]\n\n');
              res.end();
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      });

      response.on('error', (error: any) => {
        logger.error('Stream error:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      });
    } else {
      const response = await ollamaService.generate(request);
      res.json({
        success: true,
        data: response
      });
    }
  } catch (error: any) {
    logger.error('Generation failed:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GENERATION_FAILED',
        message: error.message
      }
    });
  }
});

export default router;
