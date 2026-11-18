const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');
const { Strategy } = require('../task-router/TaskRouter');

router.get('/', (req, res) => {
  const { status, type } = req.query;
  res.json({ tasks: req.app.locals.taskRouter.list({ status, type }) });
});

router.get('/:taskId', asyncHandler(async (req, res) => {
  const t = await req.app.locals.taskRouter.get(req.params.taskId);
  if (!t) throw new AppError('Task not found', 404, 'NOT_FOUND');
  res.json(t);
}));

router.post('/submit', asyncHandler(async (req, res) => {
  try {
    const t = await req.app.locals.taskRouter.submit(req.body || {});
    res.status(201).json(t);
  } catch (err) { throw new AppError(err.message, 409, 'NO_MATCHING_NODE'); }
}));

router.post('/:taskId/complete', asyncHandler(async (req, res) => {
  const { result, error } = req.body || {};
  const t = await req.app.locals.taskRouter.complete(req.params.taskId, result, error);
  res.json(t);
}));

router.get('/strategy/get', (req, res) => {
  res.json({ strategy: req.app.locals.taskRouter.getStrategy(), strategies: Object.values(Strategy) });
});

router.post('/strategy/set', asyncHandler(async (req, res) => {
  res.json(await req.app.locals.taskRouter.setStrategy(req.body?.strategy));
}));

module.exports = router;
