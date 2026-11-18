/**
 * Filter Routes
 * API endpoints for output filtering
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createLogger } from '../utils/logger';
import { OutputFilter } from '../filters/OutputFilter';

const logger = createLogger('FilterRoutes');

// Validation schemas
const FilterOutputSchema = z.object({
  output: z.string().min(1),
  options: z.object({
    redactPii: z.boolean().optional(),
    redactSecrets: z.boolean().optional(),
    redactInternalUrls: z.boolean().optional()
  }).optional()
});

const ScanSecretsSchema = z.object({
  text: z.string().min(1)
});

export class FilterController {
  public router: Router;

  constructor(private outputFilter: OutputFilter) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Filter output
    this.router.post('/output', async (req: Request, res: Response) => {
      try {
        const data = FilterOutputSchema.parse(req.body);
        
        logger.info('Filtering output');
        
        const result = await this.outputFilter.filter(data.output, data.options);
        
        res.json({
          success: true,
          data: {
            filtered: result.filtered,
            wasFiltered: result.wasFiltered,
            findings: result.findings,
            redactedCount: result.redactedSegments.length,
            metadata: result.metadata
          }
        });
      } catch (error) {
        logger.error('Failed to filter output:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Scan for secrets
    this.router.post('/scan-secrets', async (req: Request, res: Response) => {
      try {
        const data = ScanSecretsSchema.parse(req.body);
        
        logger.info('Scanning for secrets');
        
        const secrets = await this.outputFilter.scanForSecrets(data.text);
        
        res.json({
          success: true,
          data: {
            secretsFound: secrets.length,
            secrets: secrets.map(s => ({
              type: s.type,
              severity: s.severity,
              position: s.position
            }))
          }
        });
      } catch (error) {
        logger.error('Failed to scan secrets:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get sensitive patterns
    this.router.get('/patterns', async (req: Request, res: Response) => {
      try {
        const patterns = this.outputFilter.getPatterns();
        
        res.json({
          success: true,
          data: patterns.map(p => ({
            name: p.name,
            category: p.category,
            severity: p.severity,
            description: p.description
          }))
        });
      } catch (error) {
        logger.error('Failed to get patterns:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get filter config
    this.router.get('/config', async (req: Request, res: Response) => {
      try {
        const config = this.outputFilter.getConfig();
        
        res.json({
          success: true,
          data: config
        });
      } catch (error) {
        logger.error('Failed to get config:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Update filter config
    this.router.put('/config', async (req: Request, res: Response) => {
      try {
        const updates = z.object({
          redactPii: z.boolean().optional(),
          redactSecrets: z.boolean().optional(),
          redactInternalUrls: z.boolean().optional(),
          logDetections: z.boolean().optional(),
          maskCharacter: z.string().length(1).optional(),
          preserveLength: z.boolean().optional()
        }).parse(req.body);

        this.outputFilter.updateConfig(updates);
        
        res.json({
          success: true,
          data: { message: 'Config updated successfully' }
        });
      } catch (error) {
        logger.error('Failed to update config:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Add custom pattern
    this.router.post('/patterns', async (req: Request, res: Response) => {
      try {
        const { name, pattern, severity, category, description } = z.object({
          name: z.string(),
          pattern: z.string(),
          severity: z.enum(['low', 'medium', 'high', 'critical']),
          category: z.string(),
          description: z.string()
        }).parse(req.body);

        this.outputFilter.addPattern({
          name,
          pattern: new RegExp(pattern, 'g'),
          severity,
          category,
          description
        });

        res.json({
          success: true,
          data: { message: 'Pattern added successfully' }
        });
      } catch (error) {
        logger.error('Failed to add pattern:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Batch filter
    this.router.post('/batch', async (req: Request, res: Response) => {
      try {
        const { outputs } = z.object({
          outputs: z.array(z.string()).min(1).max(100)
        }).parse(req.body);
        
        logger.info(`Batch filtering ${outputs.length} outputs`);
        
        const results = await Promise.all(
          outputs.map(async (output, index) => {
            const result = await this.outputFilter.filter(output);
            return {
              index,
              wasFiltered: result.wasFiltered,
              findings: result.findings.length
            };
          })
        );

        res.json({
          success: true,
          data: {
            total: results.length,
            filtered: results.filter(r => r.wasFiltered).length,
            results
          }
        });
      } catch (error) {
        logger.error('Batch filter failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }
}
