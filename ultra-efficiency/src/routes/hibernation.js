const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.post('/register', asyncHandler(async (req, res) => {
  const service = req.app.locals.hibernationService;
  if (!service) throw new AppError('Hibernation service not initialized', 503);
  const result = await service.registerService(req.body);
  res.status(201).json({ status: 'success', data: result });
}));

router.post('/hibernate/:serviceId', asyncHandler(async (req, res) => {
  const service = req.app.locals.hibernationService;
  if (!service) throw new AppError('Hibernation service not initialized', 503);
  const result = await service.hibernate(req.params.serviceId, req.body);
  res.json({ status: 'success', data: result });
}));

router.post('/wake/:serviceId', asyncHandler(async (req, res) => {
  const service = req.app.locals.hibernationService;
  if (!service) throw new AppError('Hibernation service not initialized', 503);
  const result = await service.wake(req.params.serviceId);
  res.json({ status: 'success', data: result });
}));

router.post('/hibernate-all', asyncHandler(async (req, res) => {
  const service = req.app.locals.hibernationService;
  if (!service) throw new AppError('Hibernation service not initialized', 503);
  const results = await service.hibernateAll();
  res.json({ status: 'success', data: { hibernated: results.length, services: results } });
}));

router.post('/wake-all', asyncHandler(async (req, res) => {
  const service = req.app.locals.hibernationService;
  if (!service) throw new AppError('Hibernation service not initialized', 503);
  const results = await service.wakeAll();
  res.json({ status: 'success', data: { woken: results.length, services: results } });
}));

router.get('/status', asyncHandler(async (req, res) => {
  const service = req.app.locals.hibernationService;
  if (!service) throw new AppError('Hibernation service not initialized', 503);
  res.json({ status: 'success', data: service.getHibernationStatus() });
}));

module.exports = router;
