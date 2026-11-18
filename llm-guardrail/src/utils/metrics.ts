import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const guardrailMetrics = {
  promptsAnalyzed: new client.Counter({
    name: 'drs_guardrail_prompts_analyzed_total',
    help: 'Total number of prompts analyzed',
    labelNames: ['action'],
    registers: [register]
  }),

  promptsBlocked: new client.Counter({
    name: 'drs_guardrail_prompts_blocked_total',
    help: 'Total number of prompts blocked',
    labelNames: ['reason'],
    registers: [register]
  }),

  outputsFiltered: new client.Counter({
    name: 'drs_guardrail_outputs_filtered_total',
    help: 'Total number of outputs filtered',
    registers: [register]
  }),

  secretsDetected: new client.Counter({
    name: 'drs_guardrail_secrets_detected_total',
    help: 'Total number of secrets detected',
    labelNames: ['type'],
    registers: [register]
  }),

  analysisDuration: new client.Histogram({
    name: 'drs_guardrail_analysis_duration_seconds',
    help: 'Duration of prompt analysis',
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register]
  }),

  httpRequestDuration: new client.Histogram({
    name: 'drs_guardrail_http_request_duration_seconds',
    help: 'Duration of HTTP requests',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register]
  })
};

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    
    guardrailMetrics.httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status: res.statusCode.toString()
      },
      duration
    );
  });

  next();
};

export const metricsEndpoint = async (req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
};

export { register };
