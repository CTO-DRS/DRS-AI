const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'web3-mesh-service',
  };

  const ipfs = req.app.locals.ipfsService;
  const libp2p = req.app.locals.libp2pService;
  const contracts = req.app.locals.contractService;
  const mesh = req.app.locals.agentMesh;

  checks.checks = {
    ipfs: ipfs?.isInitialized ? 'healthy' : 'unhealthy',
    libp2p: libp2p?.isInitialized ? 'healthy' : 'unhealthy',
    contracts: contracts?.isInitialized ? 'healthy' : 'unhealthy',
    agentMesh: mesh?.isInitialized ? 'healthy' : 'unhealthy',
  };

  const isHealthy = Object.values(checks.checks).every(c => c === 'healthy');
  checks.status = isHealthy ? 'healthy' : 'degraded';

  res.status(isHealthy ? 200 : 503).json(checks);
});

router.get('/ready', (req, res) => {
  const mesh = req.app.locals.agentMesh;
  const isReady = mesh?.isInitialized;

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not ready',
    timestamp: new Date().toISOString(),
  });
});

router.get('/live', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

module.exports = router;
