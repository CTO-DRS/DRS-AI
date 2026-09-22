/**
 * Health Check Routes
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../utils/logger';

const logger = createLogger('HealthRoutes');

export class HealthController {
  public router: Router;

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get('/', async (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: '𝑫𝑹𝑺.𝑽𝑰𝑷. LLM Guardrail',
        version: '2.0.0'
      });
    });

    this.router.get('/ready', (req: Request, res: Response) => {
      res.json({ ready: true });
    });

    this.router.get('/live', (req: Request, res: Response) => {
      res.json({ alive: true });
    });
  }
}
