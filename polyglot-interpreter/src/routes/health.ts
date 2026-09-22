import { Router, Request, Response } from 'express';
import { CodeExecutor } from '../services/CodeExecutor';

export class HealthController {
  public router: Router;

  constructor(private codeExecutor: CodeExecutor) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get('/', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: '𝑫𝑹𝑺.𝑽𝑰𝑷. Polyglot Interpreter',
        version: '2.0.0',
        languages: this.codeExecutor.getSupportedLanguages().map(l => l.name)
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
