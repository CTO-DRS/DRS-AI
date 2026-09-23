const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../utils/errorHandler');

router.get('/', (req, res) => res.json({ status: 'healthy', timestamp: new Date().toISOString(), service: 'distributed-deployment-service' }));
router.get('/live', (req, res) => res.json({ status: 'alive' }));
router.get('/ready', (req, res) => {
  const reg = req.app.locals.nodeRegistry;
  res.status(reg?.isInitialized ? 200 : 503).json({ status: reg?.isInitialized ? 'ready' : 'not ready' });
});
module.exports = router;
