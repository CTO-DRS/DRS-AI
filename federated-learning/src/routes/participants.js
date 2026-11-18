const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.get('/', (req, res) => {
  res.json({ participants: req.app.locals.participantManager.list() });
});

router.post('/register', asyncHandler(async (req, res) => {
  res.status(201).json(await req.app.locals.participantManager.register(req.body || {}));
}));

router.post('/:id/heartbeat', asyncHandler(async (req, res) => {
  try { res.json(await req.app.locals.participantManager.heartbeat(req.params.id)); }
  catch (e) { throw new AppError(e.message, 404, 'PARTICIPANT_NOT_FOUND'); }
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const p = await req.app.locals.participantManager.deregister(req.params.id);
  if (!p) throw new AppError('Participant not found', 404, 'NOT_FOUND');
  res.json(p);
}));

router.post('/:id/updates', asyncHandler(async (req, res) => {
  const { roundId, ...updatePayload } = req.body || {};
  if (!roundId) throw new AppError('roundId required', 400, 'MISSING_PARAM');
  try { res.status(201).json(await req.app.locals.participantManager.submitUpdate(req.params.id, roundId, updatePayload)); }
  catch (e) { throw new AppError(e.message, 404, 'PARTICIPANT_NOT_FOUND'); }
}));

module.exports = router;
