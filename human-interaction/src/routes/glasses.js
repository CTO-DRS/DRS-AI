const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.post('/connect', asyncHandler(async (req, res) => {
  const service = req.app.locals.glassesService;
  if (!service) throw new AppError('Glasses service not initialized', 503);
  const result = await service.connect(req.body);
  res.status(201).json({ status: 'success', data: result });
}));

router.post('/tap/:connectionId', asyncHandler(async (req, res) => {
  const service = req.app.locals.glassesService;
  if (!service) throw new AppError('Glasses service not initialized', 503);
  const result = await service.handleTapGesture(req.params.connectionId, req.body);
  res.json({ status: 'success', data: result });
}));

router.post('/overlay/:connectionId', asyncHandler(async (req, res) => {
  const service = req.app.locals.glassesService;
  if (!service) throw new AppError('Glasses service not initialized', 503);
  const result = await service.sendOverlay(req.params.connectionId, req.body);
  res.json({ status: 'success', data: result });
}));

router.post('/camera/:connectionId', asyncHandler(async (req, res) => {
  const service = req.app.locals.glassesService;
  if (!service) throw new AppError('Glasses service not initialized', 503);
  const result = await service.processCameraFrame(req.params.connectionId, req.body.frame, req.body.metadata);
  res.json({ status: 'success', data: result });
}));

router.get('/status/:connectionId', asyncHandler(async (req, res) => {
  const service = req.app.locals.glassesService;
  if (!service) throw new AppError('Glasses service not initialized', 503);
  const result = service.getStatus(req.params.connectionId);
  if (!result) throw new AppError('Glasses not found', 404);
  res.json({ status: 'success', data: result });
}));

router.delete('/disconnect/:connectionId', asyncHandler(async (req, res) => {
  const service = req.app.locals.glassesService;
  if (!service) throw new AppError('Glasses service not initialized', 503);
  const result = await service.disconnect(req.params.connectionId);
  res.json({ status: 'success', data: result });
}));

module.exports = router;
