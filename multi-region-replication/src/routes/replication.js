const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');
const { ReplicationMode } = require('../replication-engine/ReplicationEngine');
const { ResolutionPolicy } = require('../conflict-resolver/ConflictResolver');

router.post('/', asyncHandler(async (req, res) => {
  const r = await req.app.locals.replicationEngine.replicate(req.body || {});
  res.status(201).json(r);
}));

router.post('/ingest', asyncHandler(async (req, res) => {
  res.json(await req.app.locals.replicationEngine.ingest(req.body || {}));
}));

router.get('/writes/local', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 500);
  res.json({ writes: await req.app.locals.replicationEngine.getLocalWrites(limit) });
}));

router.get('/writes/ingested', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 500);
  res.json({ writes: await req.app.locals.replicationEngine.getIngestedWrites(limit) });
}));

router.get('/mode/get', (req, res) => {
  res.json({ mode: req.app.locals.replicationEngine.getMode(), modes: Object.values(ReplicationMode) });
});

router.post('/mode/set', asyncHandler(async (req, res) => {
  res.json(await req.app.locals.replicationEngine.setMode(req.body?.mode));
}));

router.get('/conflicts', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 500);
  res.json({ conflicts: await req.app.locals.conflictResolver.listResolvedConflicts(limit) });
}));

router.get('/policy/get', (req, res) => {
  res.json({ policy: req.app.locals.conflictResolver.getPolicy(), policies: Object.values(ResolutionPolicy) });
});

router.post('/policy/set', asyncHandler(async (req, res) => {
  res.json(await req.app.locals.conflictResolver.setPolicy(req.body?.policy));
}));

module.exports = router;
