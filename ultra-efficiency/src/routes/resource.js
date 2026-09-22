const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.post('/allocate', asyncHandler(async (req, res) => {
  const service = req.app.locals.resourceService;
  if (!service) throw new AppError('Resource service not initialized', 503);
  const result = await service.allocate(req.body);
  res.status(201).json({ status: 'success', data: result });
}));

router.post('/deallocate/:allocationId', asyncHandler(async (req, res) => {
  const service = req.app.locals.resourceService;
  if (!service) throw new AppError('Resource service not initialized', 503);
  const result = await service.deallocate(req.params.allocationId);
  res.json({ status: 'success', data: result });
}));

router.get('/status', asyncHandler(async (req, res) => {
  const service = req.app.locals.resourceService;
  if (!service) throw new AppError('Resource service not initialized', 503);
  res.json({ status: 'success', data: service.getResourceStatus() });
}));

module.exports = router;
