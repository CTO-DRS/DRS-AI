const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.post('/snapshot', asyncHandler(async (req, res) => {
  const service = req.app.locals.evolutionTracker;
  if (!service) throw new AppError('Evolution tracker not initialized', 503);
  const result = await service.takeSnapshot(req.body);
  res.status(201).json({ status: 'success', data: result });
}));

router.get('/timeline', asyncHandler(async (req, res) => {
  const service = req.app.locals.evolutionTracker;
  if (!service) throw new AppError('Evolution tracker not initialized', 503);
  const result = await service.getTimeline(req.query.repoId);
  res.json({ status: 'success', data: result });
}));

router.get('/predict', asyncHandler(async (req, res) => {
  const service = req.app.locals.evolutionTracker;
  if (!service) throw new AppError('Evolution tracker not initialized', 503);
  const result = await service.predictEvolution(req.query.repoId);
  res.json({ status: 'success', data: result });
}));

router.get('/stats', asyncHandler(async (req, res) => {
  const service = req.app.locals.evolutionTracker;
  if (!service) throw new AppError('Evolution tracker not initialized', 503);
  res.json({ status: 'success', data: service.getStats() });
}));

module.exports = router;
