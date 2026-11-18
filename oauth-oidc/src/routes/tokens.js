const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.get('/:userId', asyncHandler(async (req, res) => {
  res.json({ tokens: await req.app.locals.tokenStore.listByUser(req.params.userId) });
}));

router.get('/:userId/:providerId', asyncHandler(async (req, res) => {
  const t = await req.app.locals.tokenStore.get(req.params.userId, req.params.providerId);
  if (!t) throw new AppError('Tokens not found', 404, 'NOT_FOUND');
  res.json(t);
}));

router.delete('/:userId/:providerId', asyncHandler(async (req, res) => {
  const ok = await req.app.locals.tokenStore.revoke(req.params.userId, req.params.providerId);
  if (!ok) throw new AppError('Tokens not found', 404, 'NOT_FOUND');
  res.json({ revoked: true });
}));

router.delete('/:userId', asyncHandler(async (req, res) => {
  const count = await req.app.locals.tokenStore.revokeAllForUser(req.params.userId);
  res.json({ revoked: count });
}));

module.exports = router;
