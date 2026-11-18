const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.get('/', (req, res) => {
  res.json({ allocations: req.app.locals.vramMonitor.list() });
});

router.post('/allocate', asyncHandler(async (req, res) => {
  const { model, gpu = 0, bytes } = req.body || {};
  if (!model || !Number.isFinite(bytes)) throw new AppError('model and bytes required', 400, 'MISSING_PARAM');
  try {
    const rec = await req.app.locals.vramMonitor.allocate(model, Number(gpu), Number(bytes));
    res.status(201).json(rec);
  } catch (err) {
    throw new AppError(err.message, 409, 'INSUFFICIENT_VRAM');
  }
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const rec = await req.app.locals.vramMonitor.deallocate(req.params.id);
  if (!rec) throw new AppError('Allocation not found', 404, 'NOT_FOUND');
  res.json(rec);
}));

router.post('/evict', asyncHandler(async (req, res) => {
  const target = Number(req.body?.bytes || 0);
  const evicted = await req.app.locals.vramMonitor.evictIfNecessary(target);
  res.json({ evictedCount: evicted.length, evicted });
}));

module.exports = router;
