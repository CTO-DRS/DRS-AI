const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

/**
 * @swagger
 * tags:
 *   name: Honeypot
 *   description: Honeypot AI threat detection API
 */

/**
 * @swagger
 * /api/v1/honeypot/analyze:
 *   post:
 *     summary: Analyze request for threats
 *     tags: [Honeypot]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ip
 *               - userAgent
 *               - path
 *             properties:
 *               ip:
 *                 type: string
 *               userAgent:
 *                 type: string
 *               path:
 *                 type: string
 *               query:
 *                 type: object
 *               body:
 *                 type: object
 *               method:
 *                 type: string
 *               headers:
 *                 type: object
 *     responses:
 *       200:
 *         description: Analysis complete
 */
router.post('/analyze', asyncHandler(async (req, res) => {
  const honeypotService = req.app.locals.honeypotService;
  
  if (!honeypotService) {
    throw new AppError('Honeypot service not initialized', 503);
  }
  
  const result = await honeypotService.analyzeRequest(req.body);
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/honeypot/check-blocked:
 *   get:
 *     summary: Check if IP is blocked
 *     tags: [Honeypot]
 *     parameters:
 *       - in: query
 *         name: ip
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Block status
 */
router.get('/check-blocked', asyncHandler(async (req, res) => {
  const honeypotService = req.app.locals.honeypotService;
  
  if (!honeypotService) {
    throw new AppError('Honeypot service not initialized', 503);
  }
  
  const { ip } = req.query;
  
  if (!ip) {
    throw new AppError('ip is required', 400);
  }
  
  const isBlocked = await honeypotService.isBlocked(ip);
  
  res.json({
    status: 'success',
    data: {
      ip,
      blocked: isBlocked,
    },
  });
}));

/**
 * @swagger
 * /api/v1/honeypot/threats:
 *   get:
 *     summary: Get recent threats
 *     tags: [Honeypot]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       200:
 *         description: Threats retrieved
 */
router.get('/threats', asyncHandler(async (req, res) => {
  const honeypotService = req.app.locals.honeypotService;
  
  if (!honeypotService) {
    throw new AppError('Honeypot service not initialized', 503);
  }
  
  const { limit = 100 } = req.query;
  
  const threats = await honeypotService.getRecentThreats(parseInt(limit));
  
  res.json({
    status: 'success',
    data: threats,
  });
}));

/**
 * @swagger
 * /api/v1/honeypot/stats:
 *   get:
 *     summary: Get honeypot statistics
 *     tags: [Honeypot]
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const honeypotService = req.app.locals.honeypotService;
  
  if (!honeypotService) {
    throw new AppError('Honeypot service not initialized', 503);
  }
  
  res.json({
    status: 'success',
    data: honeypotService.getStats(),
  });
}));

module.exports = router;
