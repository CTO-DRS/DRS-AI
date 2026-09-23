const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.get('/status', asyncHandler(async (req, res) => {
  res.json(await req.app.locals.clusterManager.status());
}));

router.post('/failover/:nodeId', asyncHandler(async (req, res) => {
  res.json(await req.app.locals.clusterManager.failover(req.params.nodeId));
}));

router.post('/drain/:nodeId', asyncHandler(async (req, res) => {
  try {
    res.json(await req.app.locals.clusterManager.drain(req.params.nodeId));
  } catch (err) { throw new AppError(err.message, 404, 'NODE_NOT_FOUND'); }
}));

module.exports = router;
