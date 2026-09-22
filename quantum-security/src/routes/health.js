const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'quantum-security-service',
  };

  const kyber = req.app.locals.kyberService;
  const dilithium = req.app.locals.dilithiumService;
  const honeypot = req.app.locals.honeypotService;
  const threatDetection = req.app.locals.threatDetection;

  checks.checks = {
    kyber: kyber?.isInitialized ? 'healthy' : 'unhealthy',
    dilithium: dilithium?.isInitialized ? 'healthy' : 'unhealthy',
    honeypot: honeypot?.isInitialized ? 'healthy' : 'unhealthy',
    threatDetection: threatDetection?.isInitialized ? 'healthy' : 'unhealthy',
  };

  const isHealthy = Object.values(checks.checks).every(c => c === 'healthy');
  checks.status = isHealthy ? 'healthy' : 'degraded';

  res.status(isHealthy ? 200 : 503).json(checks);
});

router.get('/ready', (req, res) => {
  const threatDetection = req.app.locals.threatDetection;
  const isReady = threatDetection?.isInitialized;

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not ready',
    timestamp: new Date().toISOString(),
  });
});

router.get('/live', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

module.exports = router;
