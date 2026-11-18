const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.get('/', (req, res) => res.json({ nodes: req.app.locals.nodeRegistry.list() }));

router.post('/register', asyncHandler(async (req, res) => {
  const node = await req.app.locals.nodeRegistry.register(req.body || {});
  res.status(201).json(node);
}));

router.post('/:nodeId/heartbeat', asyncHandler(async (req, res) => {
  try {
    const node = await req.app.locals.nodeRegistry.heartbeat(req.params.nodeId, req.body || {});
    res.json(node);
  } catch (err) { throw new AppError(err.message, 404, 'NODE_NOT_FOUND'); }
}));

router.delete('/:nodeId', asyncHandler(async (req, res) => {
  const node = await req.app.locals.nodeRegistry.deregister(req.params.nodeId);
  if (!node) throw new AppError('Node not found', 404, 'NOT_FOUND');
  res.json(node);
}));

router.get('/search', asyncHandler(async (req, res) => {
  const { region, tags, role, minCpu, minMemoryMb, minGpus, minVramMb } = req.query;
  const minCapacity = (minCpu || minMemoryMb || minGpus || minVramMb) ? {
    cpu: minCpu ? Number(minCpu) : undefined,
    memoryMb: minMemoryMb ? Number(minMemoryMb) : undefined,
    gpus: minGpus ? Number(minGpus) : undefined,
    vramMb: minVramMb ? Number(minVramMb) : undefined,
  } : undefined;
  const nodes = req.app.locals.nodeRegistry.findMatching({
    region, role,
    tags: tags ? tags.split(',') : undefined,
    minCapacity,
  });
  res.json({ count: nodes.length, nodes });
}));

module.exports = router;
