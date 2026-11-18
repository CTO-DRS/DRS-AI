import { Router, Request, Response } from 'express';
import { GitService } from '../services/GitService';

export class HealthController {
  public router: Router;

  constructor(private gitService: GitService) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get('/', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: '𝑫𝑹𝑺.𝑽𝑰𝑷. Git Automator',
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
