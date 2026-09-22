/**
 * Health Check Routes
 * System health and status endpoints
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../utils/logger';
import { DockerManager } from '../services/DockerManager';
import si from 'systeminformation';

const logger = createLogger('HealthRoutes');

export class HealthController {
  public router: Router;

  constructor(private dockerManager: DockerManager) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Basic health check
    this.router.get('/', async (req: Request, res: Response) => {
      try {
        const dockerHealthy = await this.checkDockerHealth();
        const systemStats = await this.getSystemStats();

        const status = dockerHealthy ? 'healthy' : 'degraded';

        res.json({
          status,
          timestamp: new Date().toISOString(),
          service: '𝑫𝑹𝑺.𝑽𝑰𝑷. Security Sandbox',
          version: '2.0.0',
          checks: {
            docker: dockerHealthy ? 'ok' : 'error',
            system: systemStats
          }
        });
      } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Detailed health check
    this.router.get('/detailed', async (req: Request, res: Response) => {
      try {
        const [dockerHealth, systemStats, sandboxStats] = await Promise.all([
          this.checkDockerHealth(),
          this.getSystemStats(),
          this.getSandboxStats()
        ]);

        res.json({
          status: dockerHealth ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
          components: {
            docker: {
              status: dockerHealth ? 'healthy' : 'unhealthy',
              details: await this.getDockerDetails()
            },
            system: systemStats,
            sandboxes: sandboxStats
          }
        });
      } catch (error) {
        logger.error('Detailed health check failed:', error);
        res.status(503).json({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Readiness check
    this.router.get('/ready', async (req: Request, res: Response) => {
      try {
        const dockerHealthy = await this.checkDockerHealth();
        
        if (dockerHealthy) {
          res.json({ ready: true });
        } else {
          res.status(503).json({ ready: false, reason: 'Docker not available' });
        }
      } catch (error) {
        res.status(503).json({ ready: false, reason: 'Health check failed' });
      }
    });

    // Liveness check
    this.router.get('/live', (req: Request, res: Response) => {
      res.json({ alive: true });
    });

    // System metrics
    this.router.get('/metrics', async (req: Request, res: Response) => {
      try {
        const metrics = await this.getDetailedMetrics();
        res.json(metrics);
      } catch (error) {
        logger.error('Failed to get metrics:', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  private async checkDockerHealth(): Promise<boolean> {
    try {
      // This would check if Docker is accessible
      // For now, assume healthy if we have active sessions
      return true;
    } catch {
      return false;
    }
  }

  private async getSystemStats(): Promise<any> {
    try {
      const [cpu, mem, load] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.load()
      ]);

      return {
        cpu: {
          usage: cpu.currentLoad,
          cores: cpu.cpus.length
        },
        memory: {
          total: mem.total,
          used: mem.used,
          free: mem.free,
          percent: (mem.used / mem.total) * 100
        },
        load: {
          '1m': load[0],
          '5m': load[1],
          '15m': load[2]
        }
      };
    } catch (error) {
      logger.error('Failed to get system stats:', error);
      return null;
    }
  }

  private async getDockerDetails(): Promise<any> {
    try {
      const containers = await si.dockerContainers();
      const images = await si.dockerImages();

      return {
        containers: {
          total: containers.length,
          running: containers.filter((c: any) => c.state === 'running').length
        },
        images: images.length
      };
    } catch (error) {
      logger.error('Failed to get Docker details:', error);
      return null;
    }
  }

  private async getSandboxStats(): Promise<any> {
    const activeSessions = this.dockerManager.getActiveSessions();
    
    return {
      active: activeSessions.length,
      maxAllowed: 10,
      sessions: activeSessions.map(s => ({
        id: s.id,
        status: s.status,
        createdAt: s.createdAt,
        image: s.config.image
      }))
    };
  }

  private async getDetailedMetrics(): Promise<any> {
    const [systemStats, dockerDetails, sandboxStats] = await Promise.all([
      this.getSystemStats(),
      this.getDockerDetails(),
      this.getSandboxStats()
    ]);

    return {
      timestamp: new Date().toISOString(),
      system: systemStats,
      docker: dockerDetails,
      sandboxes: sandboxStats
    };
  }
}
