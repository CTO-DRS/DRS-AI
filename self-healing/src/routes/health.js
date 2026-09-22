const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const selfCoding = req.app.locals.selfCodingService;
  const telepathy = req.app.locals.codeTelepathyService;
  const autoPR = req.app.locals.autoPRService;
  const evolution = req.app.locals.evolutionTracker;

  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'self-healing-service',
    checks: {
      selfCoding: selfCoding?.isInitialized ? 'healthy' : 'unhealthy',
      codeTelepathy: telepathy?.isInitialized ? 'healthy' : 'unhealthy',
      autoPR: autoPR?.isInitialized ? 'healthy' : 'unhealthy',
      evolution: evolution?.isInitialized ? 'healthy' : 'unhealthy',
    },
  };

  const isHealthy = Object.values(checks.checks).every(c => c === 'healthy');
  checks.status = isHealthy ? 'healthy' : 'degraded';

  res.status(isHealthy ? 200 : 503).json(checks);
});

router.get('/ready', (req, res) => {
  const sc = req.app.locals.selfCodingService;
  res.status(sc?.isInitialized ? 200 : 503).json({
    status: sc?.isInitialized ? 'ready' : 'not ready',
    timestamp: new Date().toISOString(),
  });
});

router.get('/live', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

module.exports = router;
