/**
 * Interpreter Routes
 * API endpoints for code execution
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createLogger } from '../utils/logger';
import { CodeExecutor } from '../services/CodeExecutor';
import { SessionManager } from '../services/SessionManager';

const logger = createLogger('InterpreterRoutes');

// Validation schemas
const ExecuteSchema = z.object({
  code: z.string().min(1).max(100000),
  language: z.string().min(1),
  stdin: z.string().optional(),
  timeout: z.number().min(1000).max(300000).optional(),
  memoryLimit: z.number().min(64 * 1024 * 1024).max(2 * 1024 * 1024 * 1024).optional(),
  cpuLimit: z.number().min(0.1).max(4).optional(),
  allowNetwork: z.boolean().optional().default(false)
});

export class InterpreterController {
  public router: Router;

  constructor(
    private codeExecutor: CodeExecutor,
    private sessionManager: SessionManager
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Execute code
    this.router.post('/', async (req: Request, res: Response) => {
      try {
        const data = ExecuteSchema.parse(req.body);

        logger.info(`Executing ${data.language} code`);

        const result = await this.codeExecutor.execute({
          code: data.code,
          language: data.language,
          stdin: data.stdin,
          timeout: data.timeout,
          memoryLimit: data.memoryLimit,
          cpuLimit: data.cpuLimit,
          allowNetwork: data.allowNetwork
        });

        res.json({
          success: true,
          data: result
        });
      } catch (error) {
        logger.error('Execution failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Execution failed'
        });
      }
    });

    // Execute with streaming
    this.router.post('/stream', async (req: Request, res: Response) => {
      try {
        const data = ExecuteSchema.parse(req.body);

        // Set up SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const outputs: Array<{ type: 'stdout' | 'stderr'; data: string }> = [];

        const result = await this.codeExecutor.executeStream(
          {
            code: data.code,
            language: data.language,
            timeout: data.timeout,
            memoryLimit: data.memoryLimit,
            cpuLimit: data.cpuLimit,
            allowNetwork: data.allowNetwork
          },
          (output) => {
            outputs.push(output);
            res.write(`data: ${JSON.stringify(output)}\n\n`);
          }
        );

        // Send final result
        res.write(`data: ${JSON.stringify({ type: 'result', data: result })}\n\n`);
        res.end();
      } catch (error) {
        logger.error('Stream execution failed:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Execution failed' })}\n\n`);
        res.end();
      }
    });

    // Get supported languages
    this.router.get('/languages', async (req: Request, res: Response) => {
      try {
        const languages = this.codeExecutor.getSupportedLanguages();

        res.json({
          success: true,
          data: languages
        });
      } catch (error) {
        logger.error('Failed to get languages:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get session status
    this.router.get('/session/:id', async (req: Request, res: Response) => {
      try {
        const session = this.sessionManager.getSession(req.params.id);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        res.json({
          success: true,
          data: session
        });
      } catch (error) {
        logger.error('Failed to get session:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get active sessions
    this.router.get('/sessions', async (req: Request, res: Response) => {
      try {
        const sessions = this.sessionManager.getActiveSessions();

        res.json({
          success: true,
          data: sessions
        });
      } catch (error) {
        logger.error('Failed to get sessions:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }
}
