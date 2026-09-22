const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.post('/session', asyncHandler(async (req, res) => {
  const service = req.app.locals.arService;
  if (!service) throw new AppError('AR service not initialized', 503);
  const result = await service.startSession(req.body);
  res.status(201).json({ status: 'success', data: result });
}));

router.post('/frame/:sessionId', asyncHandler(async (req, res) => {
  const service = req.app.locals.arService;
  if (!service) throw new AppError('AR service not initialized', 503);
  const result = await service.processFrame(req.params.sessionId, req.body.frame, req.body.metadata);
  res.json({ status: 'success', data: result });
}));

router.post('/anchor', asyncHandler(async (req, res) => {
  const service = req.app.locals.arService;
  if (!service) throw new AppError('AR service not initialized', 503);
  const result = await service.createSpatialAnchor(req.body);
  res.status(201).json({ status: 'success', data: result });
}));

router.get('/anchors/nearby', asyncHandler(async (req, res) => {
  const service = req.app.locals.arService;
  if (!service) throw new AppError('AR service not initialized', 503);
  const position = JSON.parse(req.query.position || '{}');
  const radius = parseFloat(req.query.radius) || 5;
  const result = await service.getNearbyAnchors(position, radius);
  res.json({ status: 'success', data: result });
}));

router.delete('/session/:sessionId', asyncHandler(async (req, res) => {
  const service = req.app.locals.arService;
  if (!service) throw new AppError('AR service not initialized', 503);
  const result = await service.endSession(req.params.sessionId);
  res.json({ status: 'success', data: result });
}));

module.exports = router;
