const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.post('/session', asyncHandler(async (req, res) => {
  const service = req.app.locals.gestureService;
  if (!service) throw new AppError('Gesture service not initialized', 503);
  const result = service.startSession(req.body);
  res.status(201).json({ status: 'success', data: result });
}));

router.post('/frame/:sessionId', asyncHandler(async (req, res) => {
  const service = req.app.locals.gestureService;
  if (!service) throw new AppError('Gesture service not initialized', 503);
  const result = await service.processFrame(req.params.sessionId, req.body.frame, req.body.metadata);
  res.json({ status: 'success', data: result });
}));

router.post('/train/:sessionId', asyncHandler(async (req, res) => {
  const service = req.app.locals.gestureService;
  if (!service) throw new AppError('Gesture service not initialized', 503);
  const result = await service.trainCustomGesture(req.params.sessionId, req.body);
  res.json({ status: 'success', data: result });
}));

router.delete('/session/:sessionId', asyncHandler(async (req, res) => {
  const service = req.app.locals.gestureService;
  if (!service) throw new AppError('Gesture service not initialized', 503);
  const result = service.endSession(req.params.sessionId);
  res.json({ status: 'success', data: result });
}));

module.exports = router;
