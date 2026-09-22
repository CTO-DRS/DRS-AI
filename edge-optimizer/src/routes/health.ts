import { Router, Request, Response } from 'express';
import { ResourceMonitor } from '../services/ResourceMonitor';
import { BatteryMonitor } from '../services/BatteryMonitor';

export class HealthController {
  public router: Router;

  constructor(
    private resourceMonitor: ResourceMonitor,
    private batteryMonitor: BatteryMonitor
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get('/', async (req: Request, res: Response) => {
      const stats = await this.resourceMonitor.getStats();
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: '𝑫𝑹𝑺.𝑽𝑰𝑷. Edge Optimizer',
        version: '2.0.0',
        resources: {
          cpu: stats.cpu.usage,
          memory: stats.memory.percent
        }
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
