const promClient = require('prom-client');

// Create a Registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const personaEvolutionsTotal = new promClient.Counter({
  name: 'persona_evolutions_total',
  help: 'Total number of persona evolutions',
  labelNames: ['user_id'],
});

const visualAnalysisDuration = new promClient.Histogram({
  name: 'visual_analysis_duration_seconds',
  help: 'Duration of visual analysis in seconds',
  labelNames: ['model', 'success'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
});

const activeUsers = new promClient.Gauge({
  name: 'active_users',
  help: 'Number of active users',
});

const embeddingCacheSize = new promClient.Gauge({
  name: 'embedding_cache_size',
  help: 'Size of embedding cache',
});

// Register custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(personaEvolutionsTotal);
register.registerMetric(visualAnalysisDuration);
register.registerMetric(activeUsers);
register.registerMetric(embeddingCacheSize);

// Middleware to track HTTP metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    
    httpRequestDuration.observe(
      { method: req.method, route, status_code: res.statusCode },
      duration
    );
    
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode,
    });
  });
  
  next();
};

// Metrics endpoint
const metricsEndpoint = async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
};

module.exports = {
  register,
  metricsMiddleware,
  metricsEndpoint,
  metrics: {
    httpRequestDuration,
    httpRequestsTotal,
    personaEvolutionsTotal,
    visualAnalysisDuration,
    activeUsers,
    embeddingCacheSize,
  },
};
