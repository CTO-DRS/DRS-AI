const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.get('/', (req, res) => res.json({ status: 'healthy', timestamp: new Date().toISOString(), service: 'oauth-oidc-service' }));
router.get('/live', (req, res) => res.json({ status: 'alive' }));
router.get('/ready', (req, res) => {
  const pr = req.app.locals.providerRegistry;
  res.status(pr?.isInitialized ? 200 : 503).json({ status: pr?.isInitialized ? 'ready' : 'not ready' });
});
module.exports = router;
