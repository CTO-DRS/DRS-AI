const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.get('/', (req, res) => res.json({ regions: req.app.locals.regionManager.list() }));

router.post('/register', asyncHandler(async (req, res) => {
  res.status(201).json(await req.app.locals.regionManager.register(req.body || {}));
}));

router.post('/:code/heartbeat', asyncHandler(async (req, res) => {
  try { res.json(await req.app.locals.regionManager.heartbeat(req.params.code, req.body || {})); }
  catch (e) { throw new AppError(e.message, 404, 'REGION_NOT_FOUND'); }
}));

router.delete('/:code', asyncHandler(async (req, res) => {
  const r = await req.app.locals.regionManager.deregister(req.params.code);
  if (!r) throw new AppError('Region not found', 404, 'NOT_FOUND');
  res.json(r);
}));

router.get('/local', (req, res) => res.json(req.app.locals.regionManager.getLocal()));

router.post('/best', asyncHandler(async (req, res) => {
  const { lat, lon } = req.body || {};
  res.json({ region: req.app.locals.regionManager.findBestRegion({ lat, lon }) });
}));

module.exports = router;
