import { Router } from 'express';
import ollamaService from '../services/ollamaService';
import logger from '../utils/logger';

const router = Router();

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
