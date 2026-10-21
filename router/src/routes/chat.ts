import { Router } from 'express';
import ollamaService from '../services/ollamaService';
import providerService, { ChatMessage } from '../services/providerService';
import logger from '../utils/logger';

const router = Router();

/**
 * Provider fallback: when Ollama cannot serve a request (offline, or the
 * model is not pulled locally), route to the first remote provider that
 * can (drSai provider-fallback parity). Returns null if none available.
 */
const tryProviderFallback = async (
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: { temperature?: number; max_tokens?: number }
) => {
  try {
    const resolved = await providerService.resolveProviderForModel(model);
    if (!resolved) return null;
    const result = await providerService.chat(
      resolved.provider,
      resolved.model,
      messages as ChatMessage[],
      { temperature: options.temperature, maxTokens: options.max_tokens }
    );
    logger.info(`Served model ${model} via provider ${result.provider}`);
    return result;
  } catch (error: any) {
    logger.error(`Provider fallback for ${model} failed:`, error.message);
    return null;
  }
};

// Chat completion
router.post('/', async (req, res) => {
  try {
    const { model, messages, stream = false, options = {} } = req.body;
    
    if (!model || !messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Model and messages array are required'
        }
      });
    }

    const request = {
      model,
      messages,
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
      res.setHeader('X-Accel-Buffering', 'no');

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
        // Ollama failed before streaming started — try remote providers
        logger.warn(`Ollama stream unavailable (${error.message}), attempting provider fallback`);
        const fallback = await tryProviderFallback(model, messages, request.options);
        if (fallback) {
          res.write(`data: ${JSON.stringify({
            model,
            created_at: new Date().toISOString(),
            message: { role: 'assistant', content: fallback.content },
            done: true
          })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
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
      let response;
      try {
        response = await ollamaService.chat(request);
      } catch (error: any) {
        // Ollama unavailable / model missing — provider fallback
        logger.warn(`Ollama chat unavailable (${error.message}), attempting provider fallback`);
        const fallback = await tryProviderFallback(model, messages, request.options);
        if (fallback) {
          return res.json({
            success: true,
            data: {
              model,
              message: { role: 'assistant', content: fallback.content },
              done: true,
              provider: fallback.provider,
              usage: fallback.usage
            }
          });
        }
        throw error;
      }
      res.json({
        success: true,
        data: response
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
      res.setHeader('X-Accel-Buffering', 'no');

      try {
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
      } catch (error: any) {
        // Ollama failed before streaming started — provider fallback
        logger.warn(`Ollama generate unavailable (${error.message}), attempting provider fallback`);
        const fallback = await tryProviderFallback(model, [
          { role: 'system', content: system || 'You are a helpful assistant.' },
          { role: 'user', content: prompt }
        ], request.options);
        if (fallback) {
          res.write(`data: ${JSON.stringify({
            model,
            created_at: new Date().toISOString(),
            response: fallback.content,
            done: true
          })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        logger.error('Generate stream failed:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'GENERATION_FAILED',
            message: error.message
          }
        });
      }
    } else {
      let response;
      try {
        response = await ollamaService.generate(request);
      } catch (error: any) {
        logger.warn(`Ollama generate unavailable (${error.message}), attempting provider fallback`);
        const fallback = await tryProviderFallback(model, [
          { role: 'system', content: system || 'You are a helpful assistant.' },
          { role: 'user', content: prompt }
        ], request.options);
        if (fallback) {
          return res.json({
            success: true,
            data: {
              model,
              response: fallback.content,
              done: true,
              provider: fallback.provider,
              usage: fallback.usage
            }
          });
        }
        throw error;
      }
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
