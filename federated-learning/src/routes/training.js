const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');
const { AggregationStrategy } = require('../model-aggregator/ModelAggregator');
const { v4: uuidv4 } = require('uuid');

/**
 * Create a new federated round — sets up secure aggregation context
 * and waits for participant updates.
 */
router.post('/rounds', asyncHandler(async (req, res) => {
  const pm = req.app.locals.participantManager;
  const sa = req.app.locals.secureAggregation;
  const ma = req.app.locals.modelAggregator;

  const participantIds = req.body?.participantIds || pm.list().map((p) => p.id);
  if (participantIds.length === 0) throw new AppError('No participants registered', 400, 'NO_PARTICIPANTS');

  const roundId = uuidv4();
  const secureCtx = await sa.setupRound(roundId, participantIds);

  const round = {
    id: roundId,
    status: 'open',
    strategy: req.body?.strategy || ma.getStrategy(),
    participantIds,
    secure: secureCtx,
    startedAt: new Date().toISOString(),
    completedAt: null,
    aggregation: null,
  };
  res.status(201).json(round);
}));

/**
 * Get updates submitted for a round.
 */
router.get('/rounds/:roundId/updates', asyncHandler(async (req, res) => {
  const updates = await req.app.locals.participantManager.getRoundUpdates(req.params.roundId);
  res.json({ count: updates.length, updates });
}));

/**
 * Trigger aggregation for a round.
 */
router.post('/rounds/:roundId/aggregate', asyncHandler(async (req, res) => {
  const pm = req.app.locals.participantManager;
  const ma = req.app.locals.modelAggregator;
  const sa = req.app.locals.secureAggregation;

  const updates = await pm.getRoundUpdates(req.params.roundId);
  if (updates.length === 0) throw new AppError('No updates submitted for this round', 400, 'NO_UPDATES');

  const strategy = req.body?.strategy || ma.getStrategy();
  const useSecure = req.body?.secure !== false;

  let aggregated;
  if (useSecure) {
    // Apply pairwise masks to each participant's update, then sum
    const masked = [];
    for (const u of updates) {
      const m = await sa.maskUpdate(req.params.roundId, u.participantId, u.update || []);
      masked.push(m);
    }
    const maskedSum = await sa.aggregateMasked(masked);
    aggregated = {
      id: uuidv4(),
      strategy: 'secure_aggregation',
      participantCount: updates.length,
      totalSamples: updates.reduce((a, u) => a + (u.sampleCount || 0), 0),
      weights: maskedSum,
      aggregatedAt: new Date().toISOString(),
      metrics: {
        avgLoss: Number((updates.reduce((a, u) => a + (u.metrics?.loss || 0), 0) / updates.length).toFixed(6)),
        avgAccuracy: Number((updates.reduce((a, u) => a + (u.metrics?.accuracy || 0), 0) / updates.length).toFixed(6)),
      },
      secure: true,
    };
  } else {
    aggregated = await ma.aggregate(updates, { strategy });
  }
  res.status(200).json(aggregated);
}));

router.get('/aggregations', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 500);
  res.json({ aggregations: await req.app.locals.modelAggregator.listAggregations(limit) });
}));

router.get('/strategies', (req, res) => {
  res.json({ strategies: Object.values(AggregationStrategy) });
});

router.post('/strategies', asyncHandler(async (req, res) => {
  const strategy = req.body?.strategy;
  if (!strategy) throw new AppError('strategy required', 400, 'MISSING_PARAM');
  res.json(await req.app.locals.modelAggregator.setStrategy(strategy));
}));

module.exports = router;
