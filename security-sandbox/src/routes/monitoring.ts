/**
 * Monitoring Routes
 * Real-time monitoring and threat detection endpoints
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../utils/logger';
import { SyscallMonitor } from '../services/SyscallMonitor';
import { NetworkMonitor } from '../services/NetworkMonitor';
import { BehavioralEngine } from '../services/BehavioralEngine';

const logger = createLogger('MonitoringRoutes');

export class MonitoringController {
  public router: Router;

  constructor(
    private syscallMonitor: SyscallMonitor,
    private networkMonitor: NetworkMonitor,
    private behavioralEngine: BehavioralEngine
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Get syscall logs
    this.router.get('/syscalls/:sessionId', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const { limit, threatLevel, syscall } = req.query;

        const logs = this.syscallMonitor.getSyscallLogs(sessionId, {
          limit: limit ? parseInt(limit as string) : undefined,
          threatLevel: threatLevel as any,
          syscall: syscall as string
        });

        res.json({
          success: true,
          data: logs
        });
      } catch (error) {
        logger.error('Failed to get syscall logs:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get network logs
    this.router.get('/network/:sessionId', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const { limit, threatLevel } = req.query;

        const logs = this.networkMonitor.getConnectionLogs(sessionId, {
          limit: limit ? parseInt(limit as string) : undefined,
          threatLevel: threatLevel as any
        });

        res.json({
          success: true,
          data: logs
        });
      } catch (error) {
        logger.error('Failed to get network logs:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get network summary
    this.router.get('/network/:sessionId/summary', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const summary = this.networkMonitor.getNetworkSummary(sessionId);

        res.json({
          success: true,
          data: summary
        });
      } catch (error) {
        logger.error('Failed to get network summary:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get risk assessment
    this.router.get('/risk/:sessionId', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const assessment = this.behavioralEngine.getRiskAssessment(sessionId);

        res.json({
          success: true,
          data: assessment
        });
      } catch (error) {
        logger.error('Failed to get risk assessment:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get behavior profile
    this.router.get('/behavior/:sessionId', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const profile = this.behavioralEngine.getProfile(sessionId);

        if (!profile) {
          return res.status(404).json({
            success: false,
            error: 'Profile not found'
          });
        }

        res.json({
          success: true,
          data: {
            sessionId: profile.sessionId,
            createdAt: profile.createdAt,
            metadata: profile.metadata,
            riskScore: profile.riskScore,
            threatIndicators: profile.threatIndicators,
            anomalies: profile.anomalies,
            syscallCount: profile.syscallPatterns.size,
            networkConnections: profile.networkPatterns.size
          }
        });
      } catch (error) {
        logger.error('Failed to get behavior profile:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get all active profiles
    this.router.get('/behavior', async (req: Request, res: Response) => {
      try {
        const profiles = this.behavioralEngine.getAllProfiles();

        res.json({
          success: true,
          data: profiles.map(p => ({
            sessionId: p.sessionId,
            riskScore: p.riskScore,
            threatCount: p.threatIndicators.length,
            anomalyCount: p.anomalies.length
          }))
        });
      } catch (error) {
        logger.error('Failed to get behavior profiles:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Analyze payload
    this.router.post('/analyze-payload', async (req: Request, res: Response) => {
      try {
        const { sessionId, payload } = req.body;

        if (!payload) {
          return res.status(400).json({
            success: false,
            error: 'Payload is required'
          });
        }

        const result = await this.networkMonitor.analyzePayload(
          sessionId,
          Buffer.from(payload, 'base64')
        );

        res.json({
          success: true,
          data: result
        });
      } catch (error) {
        logger.error('Failed to analyze payload:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get syscall threat summary
    this.router.get('/syscalls/:sessionId/summary', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const summary = this.syscallMonitor.getThreatSummary(sessionId);

        res.json({
          success: true,
          data: summary
        });
      } catch (error) {
        logger.error('Failed to get syscall summary:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // WebSocket upgrade endpoint for real-time monitoring
    this.router.ws('/live/:sessionId', (ws: any, req: Request) => {
      const { sessionId } = req.params;
      logger.info(`WebSocket connection established for session ${sessionId}`);

      // Send initial data
      const profile = this.behavioralEngine.getProfile(sessionId);
      if (profile) {
        ws.send(JSON.stringify({
          type: 'profile',
          data: {
            riskScore: profile.riskScore,
            threatCount: profile.threatIndicators.length
          }
        }));
      }

      // Set up event listeners
      const onThreat = (data: any) => {
        if (data.sessionId === sessionId) {
          ws.send(JSON.stringify({ type: 'threat', data }));
        }
      };

      const onAnomaly = (data: any) => {
        if (data.sessionId === sessionId) {
          ws.send(JSON.stringify({ type: 'anomaly', data }));
        }
      };

      this.behavioralEngine.on('threat:detected', onThreat);
      this.behavioralEngine.on('anomaly:detected', onAnomaly);

      ws.on('close', () => {
        logger.info(`WebSocket connection closed for session ${sessionId}`);
        this.behavioralEngine.off('threat:detected', onThreat);
        this.behavioralEngine.off('anomaly:detected', onAnomaly);
      });

      ws.on('error', (error: any) => {
        logger.error(`WebSocket error for session ${sessionId}:`, error);
      });
    });
  }
}
