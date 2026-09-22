import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import modelRoutes from './routes/models';
import chatRoutes from './routes/chat';
import ollamaService from './services/ollamaService';
import logger from './utils/logger';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3002;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', async (req, res) => {
  const ollamaHealthy = await ollamaService.checkHealth();
  res.json({
    status: ollamaHealthy ? 'healthy' : 'degraded',
    service: 'router',
    ollama: ollamaHealthy ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/models', modelRoutes);
app.use('/chat', chatRoutes);

// WebSocket for streaming
wss.on('connection', (ws, req) => {
  logger.info('WebSocket connection established for chat streaming');
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'chat') {
        const { model, messages, options = {} } = data;
        
        try {
          const response = await ollamaService.chat({
            model,
            messages,
            stream: true,
            options
          });

          response.on('data', (chunk: Buffer) => {
            const lines = chunk.toString().split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);
                ws.send(JSON.stringify({
                  type: 'chunk',
                  data: parsed
                }));
                
                if (parsed.done) {
                  ws.send(JSON.stringify({ type: 'done' }));
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          });

          response.on('error', (error: any) => {
            ws.send(JSON.stringify({
              type: 'error',
              error: error.message
            }));
          });
        } catch (error: any) {
          ws.send(JSON.stringify({
            type: 'error',
            error: error.message
          }));
        }
      }
    } catch (error: any) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket connection closed');
  });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`
    }
  });
});

// Start server
server.listen(PORT, () => {
  logger.info(`=================================`);
  logger.info(`DRS AI Model Router Service`);
  logger.info(`Version: 1.0.0`);
  logger.info(`Port: ${PORT}`);
  logger.info(`Ollama: ${process.env.OLLAMA_URL || 'http://localhost:11434'}`);
  logger.info(`=================================`);
});

export default app;
