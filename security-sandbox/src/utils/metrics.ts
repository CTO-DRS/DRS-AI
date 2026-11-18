/**
 * Prometheus Metrics
 * Metrics collection and exposition
 */

import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

// Create a Registry
const register = new client.Registry();

// Add default metrics
client.collectDefaultMetrics({ register });

// Custom metrics
export const sandboxMetrics = {
  // Sandbox creation counter
  sandboxCreated: new client.Counter({
    name: 'drs_sandbox_created_total',
    help: 'Total number of sandboxes created',
    labelNames: ['image'],
    registers: [register]
  }),

  // Sandbox destruction counter
  sandboxDestroyed: new client.Counter({
    name: 'drs_sandbox_destroyed_total',
    help: 'Total number of sandboxes destroyed',
    labelNames: ['reason'],
    registers: [register]
  }),

  // Active sandboxes gauge
  activeSandboxes: new client.Gauge({
    name: 'drs_sandbox_active',
    help: 'Number of currently active sandboxes',
    registers: [register]
  }),

  // Execution duration histogram
  executionDuration: new client.Histogram({
    name: 'drs_sandbox_execution_duration_seconds',
    help: 'Duration of sandbox executions',
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [register]
  }),

  // Syscall monitoring
  syscallTotal: new client.Counter({
    name: 'drs_syscall_total',
    help: 'Total number of syscalls monitored',
    labelNames: ['syscall', 'threat_level'],
    registers: [register]
  }),

  // Network monitoring
  networkConnections: new client.Counter({
    name: 'drs_network_connections_total',
    help: 'Total number of network connections',
    labelNames: ['dst_ip', 'threat_level'],
    registers: [register]
  }),

  // Threat detection
  threatsDetected: new client.Counter({
    name: 'drs_threats_detected_total',
    help: 'Total number of threats detected',
    labelNames: ['type', 'severity'],
    registers: [register]
  }),

  // Risk scores
  riskScore: new client.Gauge({
    name: 'drs_risk_score',
    help: 'Current risk score for sessions',
    labelNames: ['session_id'],
    registers: [register]
  }),

  // HTTP request duration
  httpRequestDuration: new client.Histogram({
    name: 'drs_http_request_duration_seconds',
    help: 'Duration of HTTP requests',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register]
  })
};

// Middleware to track HTTP request duration
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    
    sandboxMetrics.httpRequestDuration.observe(
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

// Metrics endpoint
export const metricsEndpoint = async (req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
};

export { register };
